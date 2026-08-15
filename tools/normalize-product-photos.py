#!/usr/bin/env python3
"""Prepare brkfst merch shots for the shop grid.

Two jobs, in order:

1. Knock the studio sweep out of the front/back POV shots.

   This started as colour thresholding -- measure the sweep from the frame
   border, clear everything close to it that touches the edge. That works on
   dark garments and fails badly on pale ones. The base layer is white mesh
   photographed on a white sweep at 251: the fabric sits at 250-255, inside
   the background's own tolerance band, so the fill leaks through the
   anti-aliased edge and eats the shoulders. Widening or tightening the
   tolerance trades a chewed garment for a grey halo; there is no setting that
   fixes both, because the two are genuinely the same colour.

   So the knockout is done by segmentation (rembg / BiRefNet), which decides
   from shape rather than colour. Everything downstream still works off the alpha
   channel, so the rest of this file is unchanged.

   Frames that arrive with a black letterbox bar along one edge get trimmed
   first -- segmentation will happily keep a bar, and it drags the garment's
   bounding box out to the full frame.

2. Line the views up. Each view is rescaled so the garment stands the same
   height, then dropped onto a shared canvas at the same centre. Front and
   back end up the same size in the same place, which is what the two-up hover
   on the product card needs -- the shots come off the shoot framed slightly
   differently, and without this the garment visibly jumps size when the card
   swaps.

   Pass --shared-scale to apply one scale factor across the whole set instead,
   preserving the views' true relative sizes. Use that when the files are
   different products rather than views of one garment.

Only ever run this on the front/back POV shots. Detail shots (crests, collars,
fabric close-ups) keep their white background and must not go through here.

Pass --keep-background to leave the subject on its white sweep. Framing is
still normalised, so those products line up with the rest of the grid, but
nothing is cut out. The accessories (ashtray, socks, lighters) use this.

Usage:
    normalize-product-photos.py [--shared-scale] [--keep-background] front.png back.png [...]

Files are rewritten in place. Widths are deliberately *not* forced to match:
an open-front jacket is wider than its back and squashing it to match would
distort the product.
"""

import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# Canvas the rest of the merch catalogue already uses.
CANVAS = (1264, 1175)
# Garment height as a fraction of canvas height. The product card adds its own
# 7% padding on top, so this leaves the shot breathing room without floating.
GARMENT_HEIGHT_RATIO = 0.72
# A row or column this dark on average is a letterbox bar, not product.
LETTERBOX_MAX_MEAN = 60
# Alpha at or below this is treated as empty when measuring the garment.
ALPHA_FLOOR = 8
# Leftover blobs smaller than this share of the garment are studio scuff marks,
# not product, so they get dropped too.
SPECK_RATIO = 0.005
# Width of the boundary band left with its original soft alpha when the
# interior is forced opaque.
EDGE_FEATHER = 3

# birefnet-general over u2net: on the same three test frames u2net left the
# lighter's chain in 4 disconnected pieces and gave the rose jersey a 13.9%
# soft-edge halo, against 1 piece and 1.5% here. isnet-general-use was worse
# than both, breaking the jersey into 44 fragments.
MODEL = "birefnet-general"

_session = None


def _rembg_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session(MODEL)
    return _session


def trim_letterbox(rgba):
    """Crop solid dark bars off the edges of a frame."""
    luma = rgba[..., :3].mean(axis=2)
    # transparent pixels have no meaningful colour; treat them as bright so a
    # cleared row is never mistaken for a dark bar
    luma = np.where(rgba[..., 3] > ALPHA_FLOOR, luma, 255)
    top, bottom, left, right = 0, rgba.shape[0], 0, rgba.shape[1]
    while top < bottom and luma[top].mean() < LETTERBOX_MAX_MEAN:
        top += 1
    while bottom - 1 > top and luma[bottom - 1].mean() < LETTERBOX_MAX_MEAN:
        bottom -= 1
    while left < right and luma[:, left].mean() < LETTERBOX_MAX_MEAN:
        left += 1
    while right - 1 > left and luma[:, right - 1].mean() < LETTERBOX_MAX_MEAN:
        right -= 1
    return rgba[top:bottom, left:right]


def already_knocked_out(rgba):
    """True if this image's background has been cleared already.

    Running segmentation a second time re-cuts an image that is already clean
    and trims real product away -- splitting the paired lighter shot and then
    passing the halves back through cost the olive one 10% of its height. A
    studio frame is opaque to its corners; a knocked-out one is not.
    """
    alpha = rgba[..., 3]
    edge = np.concatenate([alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]])
    return bool((edge <= ALPHA_FLOOR).mean() > 0.5)


def drop_background(rgba):
    """Return rgba with the studio sweep segmented away."""
    from rembg import remove

    if already_knocked_out(rgba):
        # Never trim an already-transparent frame. Cleared pixels carry black
        # RGB, so trim_letterbox reads every transparent row as a letterbox bar
        # and eats into the product -- it took the base clean off the lighter,
        # cropping 1536x1536 down to 723x926.
        out = rgba.copy()
    else:
        rgba = trim_letterbox(rgba)
        out = np.array(
            remove(
                Image.fromarray(rgba, "RGBA"), session=_rembg_session()
            ).convert("RGBA")
        )

    # Segmentation can leave a stray speck where a shadow read as product.
    # Keep the garment and anything a meaningful fraction of its size (a
    # hanging drawstring, a detached cuff), bin the rest.
    labels, count = ndimage.label(out[..., 3] > ALPHA_FLOOR)
    if count > 1:
        sizes = ndimage.sum_labels(np.ones_like(labels), labels, range(1, count + 1))
        keep = 1 + np.flatnonzero(sizes >= sizes.max() * SPECK_RATIO)
        out[~np.isin(labels, keep), 3] = 0

    # Low-contrast subjects come back half-transparent in places: the cream
    # socks on a white sweep had 7.5% of their area under alpha 200, so the
    # card background showed straight through the product. Force the interior
    # opaque while leaving a band at the boundary untouched, so the edge keeps
    # its anti-aliasing instead of turning into a hard cut-out.
    interior = ndimage.binary_erosion(
        out[..., 3] > ALPHA_FLOOR, iterations=EDGE_FEATHER, border_value=0
    )
    out[interior, 3] = 255
    return out


def garment_box(rgba):
    """Bounding box (x0, y0, x1, y1) of the visible garment, end-exclusive."""
    ys, xs = np.where(rgba[..., 3] > ALPHA_FLOOR)
    if not len(ys):
        raise ValueError("image is fully transparent after background removal")
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(rgba, scale, background_alpha=0):
    """Scale the garment by `scale` and centre it on the shared canvas.

    The requested scale comes from a height target, but a wide flat subject --
    the ashtray shot from the side, 958x353 -- would then overflow the canvas
    width and get its ends clipped off. Fitting to the width too keeps the
    whole product on the canvas; such a view simply ends up shorter than the
    height target, which is what it should look like next to a face-on view.
    """
    x0, y0, x1, y1 = garment_box(rgba)
    cropped = Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")

    scale = min(scale, CANVAS[0] / cropped.width)
    width = max(1, round(cropped.width * scale))
    height = max(1, round(cropped.height * scale))
    cropped = cropped.resize((width, height), Image.LANCZOS)

    canvas = Image.new("RGBA", CANVAS, (255, 255, 255, background_alpha))
    # No mask on the paste: the canvas is already empty, and passing `cropped`
    # as its own mask would multiply alpha by itself, hardening every
    # anti-aliased edge and shifting the measured bounding box.
    canvas.paste(cropped, ((CANVAS[0] - width) // 2, (CANVAS[1] - height) // 2))
    return canvas


def keep_background(rgba):
    """Frame the subject consistently but leave it on its white sweep.

    Segmentation still runs, but only to locate the subject so the framing
    matches the cut-out products. The returned pixels are the original frame
    over white -- nothing is knocked out.
    """
    located = drop_background(rgba)
    x0, y0, x1, y1 = garment_box(located)

    flat = Image.new("RGBA", (rgba.shape[1], rgba.shape[0]), (255, 255, 255, 255))
    flat.alpha_composite(Image.fromarray(rgba, "RGBA"))
    out = np.array(flat)
    # Mark everything outside the subject's box as "empty" for measurement
    # only; place() crops to that box, so the saved pixels stay untouched.
    mask = np.zeros(out.shape[:2], bool)
    mask[y0:y1, x0:x1] = True
    out[~mask, 3] = 0
    return out


def main(paths, shared_scale=False, cut_out=True):
    cleaned = []
    for path in paths:
        rgba = np.array(Image.open(path).convert("RGBA"))
        rgba = drop_background(rgba) if cut_out else keep_background(rgba)
        box = garment_box(rgba)
        cleaned.append((path, rgba, box))
        verb = "after knockout" if cut_out else "located (kept on white)"
        print(f"{path}: subject {box[2] - box[0]}x{box[3] - box[1]} {verb}")

    target = CANVAS[1] * GARMENT_HEIGHT_RATIO
    # Default: each view gets its own scale so they all stand the same height.
    # --shared-scale instead pins the tallest view to the target and scales the
    # rest by the same factor, keeping their true relative sizes.
    tallest = max(box[3] - box[1] for _, _, box in cleaned)

    for path, rgba, box in cleaned:
        scale = target / (tallest if shared_scale else box[3] - box[1])
        out = place(rgba, scale, background_alpha=0 if cut_out else 255)
        out.save(path, optimize=True)
        ys, xs = np.where(np.array(out)[..., 3] > ALPHA_FLOOR)
        print(
            f"{path}: written {out.width}x{out.height}, "
            f"garment {xs.max() - xs.min() + 1}x{ys.max() - ys.min() + 1} "
            f"at centre ({(xs.min() + xs.max()) // 2}, {(ys.min() + ys.max()) // 2})"
        )


if __name__ == "__main__":
    argv = sys.argv[1:]
    shared = "--shared-scale" in argv
    cut = "--keep-background" not in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        sys.exit(__doc__)
    main(paths, shared_scale=shared, cut_out=cut)
