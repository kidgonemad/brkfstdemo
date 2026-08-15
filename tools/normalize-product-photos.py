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

   So the knockout is done by segmentation (rembg / u2net), which decides from
   shape rather than colour. Everything downstream still works off the alpha
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

Usage:
    normalize-product-photos.py [--shared-scale] front.png back.png [...]

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

_session = None


def _rembg_session():
    global _session
    if _session is None:
        from rembg import new_session

        _session = new_session("u2net")
    return _session


def trim_letterbox(rgba):
    """Crop solid dark bars off the edges of a frame."""
    luma = rgba[..., :3].mean(axis=2)
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


def drop_background(rgba):
    """Return rgba with the studio sweep segmented away."""
    from rembg import remove

    rgba = trim_letterbox(rgba)
    out = np.array(
        remove(Image.fromarray(rgba, "RGBA"), session=_rembg_session()).convert("RGBA")
    )

    # Segmentation can leave a stray speck where a shadow read as product.
    # Keep the garment and anything a meaningful fraction of its size (a
    # hanging drawstring, a detached cuff), bin the rest.
    labels, count = ndimage.label(out[..., 3] > ALPHA_FLOOR)
    if count > 1:
        sizes = ndimage.sum_labels(np.ones_like(labels), labels, range(1, count + 1))
        keep = 1 + np.flatnonzero(sizes >= sizes.max() * SPECK_RATIO)
        out[~np.isin(labels, keep), 3] = 0
    return out


def garment_box(rgba):
    """Bounding box (x0, y0, x1, y1) of the visible garment, end-exclusive."""
    ys, xs = np.where(rgba[..., 3] > ALPHA_FLOOR)
    if not len(ys):
        raise ValueError("image is fully transparent after background removal")
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(rgba, scale):
    """Scale the garment by `scale` and centre it on the shared canvas."""
    x0, y0, x1, y1 = garment_box(rgba)
    cropped = Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")

    width = max(1, round(cropped.width * scale))
    height = max(1, round(cropped.height * scale))
    cropped = cropped.resize((width, height), Image.LANCZOS)

    canvas = Image.new("RGBA", CANVAS, (255, 255, 255, 0))
    # No mask on the paste: the canvas is already empty, and passing `cropped`
    # as its own mask would multiply alpha by itself, hardening every
    # anti-aliased edge and shifting the measured bounding box.
    canvas.paste(cropped, ((CANVAS[0] - width) // 2, (CANVAS[1] - height) // 2))
    return canvas


def main(paths, shared_scale=False):
    cleaned = []
    for path in paths:
        rgba = drop_background(np.array(Image.open(path).convert("RGBA")))
        box = garment_box(rgba)
        cleaned.append((path, rgba, box))
        print(f"{path}: garment {box[2] - box[0]}x{box[3] - box[1]} after knockout")

    target = CANVAS[1] * GARMENT_HEIGHT_RATIO
    # Default: each view gets its own scale so they all stand the same height.
    # --shared-scale instead pins the tallest view to the target and scales the
    # rest by the same factor, keeping their true relative sizes.
    tallest = max(box[3] - box[1] for _, _, box in cleaned)

    for path, rgba, box in cleaned:
        scale = target / (tallest if shared_scale else box[3] - box[1])
        out = place(rgba, scale)
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
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        sys.exit(__doc__)
    main(paths, shared_scale=shared)
