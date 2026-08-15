# Shopify product imports

`track-suit-top.csv` — Track Suit Top — White Pattern (the one called
"Parachute Jacket" in admin). Import via **Products → Import**, and tick
*Overwrite products with the same handle* if you are re-running it.

## The handle has to stay `brkfst-track-suit-top`

This is the one field that cannot be changed freely, because two separate
things in the theme resolve the product by URL handle:

- The shop grid links to `/products/brkfst-track-suit-top`, and
  `templates/product.liquid` routes that handle to the product page.
- `assets/brk-cart-native.js` reads the handle out of the URL path and fetches
  `/products/<handle>.js` to look up a variant ID before it can add to cart.

Rename the product in admin as much as you like — the title, price, copy and
photos on the storefront all come from the theme, not from Shopify. But change
the *handle* and the page 404s and add-to-cart silently fails.

## Sizes have to stay S / M / L / XL

The cart matches a variant by comparing the uppercased option value against the
text of the size button that was clicked. The product page renders buttons
S, M, L, XL, so the variants must use exactly those four values.

## Images are deliberately blank

The CSV sets no `Image Src`. Shopify's importer can only fetch images from a
publicly reachable URL, and these photos currently live in the theme zip, which
has no public URL until the theme is uploaded.

This costs nothing on the storefront — the grid and product page both render
`brkfst-merch_track-suit-top-front.png` / `-back.png` straight from theme
assets. It only means a blank thumbnail in the admin list. To fill it in,
either attach the two PNGs by hand on the product, or paste their CDN URLs
into `Image Src` after the theme is live and re-import.

## Adding the other products

Copy the four rows and change handle, title, body, price and SKU. Keep the
same shape: the first row of a product carries the product-level fields, and
the rest carry only the handle and their own variant fields. Whatever handle
you pick has to match the `href` in `snippets/b-products.liquid` and have a
matching `when` case in `templates/product.liquid`.
