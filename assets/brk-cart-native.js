/* ==========================================================================
   BRKFST — native Shopify cart bridge (theme build only)
   The site's own "ADD TO CART" handler keeps its exact animation
   ("ADDED ✓" flash, size-outline nudge). This script ALSO performs the
   real add against Shopify's AJAX Cart API, and shows a small cart chip
   (site-styled, bottom-right) once the cart has items. Zero visual change
   until something is in the cart. Same public API as js/shopify.js:
   window.BRKCart { add, fetchCart, setQty, update, count, money }.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.BRK_SHOPIFY_THEME) return;   /* only run on the Shopify build */

  function money(n) { return "$" + (Math.round(n * 100) / 100).toFixed(2); }

  async function getJSON(url, opts) {
    var r = await fetch(url, opts);
    if (!r.ok) throw new Error(url + " -> " + r.status);
    return r.json();
  }

  var productCache = {};
  async function productJSON(handle) {
    if (!productCache[handle])
      productCache[handle] = getJSON("/products/" + handle + ".js");
    return productCache[handle];
  }

  async function variantId(handle, size) {
    var p = await productJSON(handle);
    if (!size) return p.variants[0].id;
    var m = p.variants.find(function (v) {
      return (v.options || []).some(function (o) {
        return String(o).toUpperCase() === String(size).toUpperCase();
      }) || String(v.title).toUpperCase() === String(size).toUpperCase();
    });
    return (m || p.variants[0]).id;
  }

  async function add(item) {           /* {handle, size, qty} */
    var id = await variantId(item.handle, item.size);
    await getJSON("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, quantity: item.qty || 1 })
    });
    update();
  }

  async function fetchCart() {
    var c = await getJSON("/cart.js");
    return {
      mode: "shopify-native",
      checkoutUrl: "/checkout",
      subtotal: c.items_subtotal_price / 100,
      items: c.items.map(function (i) {
        return { id: i.key, qty: i.quantity, title: i.product_title,
                 size: i.variant_title, price: i.price / 100,
                 image: i.image, handle: i.handle };
      })
    };
  }

  async function setQty(id, qty) {
    await getJSON("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, quantity: Math.max(0, qty) })
    });
    update();
  }

  async function count() {
    var c = await getJSON("/cart.js");
    return c.item_count;
  }

  /* ---------- floating cart button (bottom-right) ----------
     The site has no cart link in its nav, so this is the only way to reach
     /cart while shopping. Deliberately understated to sit with the rest of
     the site: just the cart glyph, no disc, no accent colour, and no count
     or subtotal on screen. It floats over sections that are white on some
     pages and black on others, so it uses mix-blend-mode:difference -- the
     same trick the theme's own overlay markers use -- to stay legible on
     both without needing a plate behind it. The label is kept in the DOM but
     visually hidden, so screen readers still get the live count.
     Suppressed on /cart and /checkout, where it would be redundant. ---- */
  var CART_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="square" aria-hidden="true">' +
    '<path d="M3 4h2.2l2.2 10.4h9.6L19 7H6"/>' +
    '<circle cx="9" cy="19" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>';

  var fab = null, fabLabel = null, lastCount = null, lastSubtotal = 0;

  function buildFab() {
    if (fab || /^\/(cart|checkout|intro)/.test(location.pathname)) return;
    /* The splash is its own page (and doubles as the 404 template), so it has
       no nav and nothing to add to a cart. It renders as a full-bleed black
       field, which the floating button was sitting on top of. Detected by its
       markup rather than only by path, since the 404 serves it from any URL. */
    if (document.querySelector(".field-intro")) return;

    /* The home page ships with body.is-loading and shows a full-screen black
       splash until js_main.js clears it. Building the button now would park it
       on top of that splash, which is what you saw on first load. Wait for the
       class to go, then build. */
    if (document.body.classList.contains("is-loading")) {
      if (!("MutationObserver" in window)) return;
      var waiter = new MutationObserver(function () {
        if (!document.body.classList.contains("is-loading")) {
          waiter.disconnect();
          buildFab();
          paintFab(lastCount || 0, lastSubtotal || 0);
        }
      });
      waiter.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      return;
    }

    var css = document.createElement("style");
    css.textContent =
      ".brk-cart-fab{position:fixed;right:1rem;z-index:9990;" +
      "bottom:calc(1rem + env(safe-area-inset-bottom,0px));" +
      "display:inline-flex;align-items:center;justify-content:center;" +
      "padding:.5rem;background:none;color:#fff;text-decoration:none;" +
      "mix-blend-mode:difference}" +
      ".brk-cart-fab:hover{opacity:.85}" +
      ".brk-cart-fab .t{position:absolute;width:1px;height:1px;overflow:hidden;" +
      "clip:rect(0 0 0 0);white-space:nowrap}" +
      ".brk-cart-fab svg{width:1.2rem;height:1.2rem;flex:none;display:block}" +
      ".brk-cart-fab.is-away{opacity:0;pointer-events:none}" +
      "@media(prefers-reduced-motion:no-preference){" +
      ".brk-cart-fab{transition:transform .18s ease}" +
      ".brk-cart-fab.is-bumped{transform:scale(1.07)}}";
    document.head.appendChild(css);

    fab = document.createElement("a");
    fab.href = "/cart";
    fab.className = "brk-cart-fab";
    fab.setAttribute("aria-live", "polite");
    fab.innerHTML = CART_ICON + '<span class="t">CART</span>';
    fabLabel = fab.querySelector(".t");
    document.body.appendChild(fab);

    /* On a product page the button lands right on top of ADD TO CART, so a tap
       aimed at the yellow button hits the cart link instead. Step out of the
       way whenever ADD TO CART is on screen -- it is the better control at
       that moment anyway -- and come back once it scrolls off. */
    var addBtn = document.querySelector(".brk-add");
    if (addBtn && "IntersectionObserver" in window) {
      fab.classList.add("is-away");
      new IntersectionObserver(function (entries) {
        fab.classList.toggle("is-away", entries[0].isIntersecting);
      }, { rootMargin: "0px 0px -8px 0px" }).observe(addBtn);
    }
  }

  function paintFab(n, subtotal) {
    /* Remember the latest figures even when there is no button yet: on the
       home page the build is deferred until the splash clears, and it needs
       real values to paint with when it finally runs. */
    lastSubtotal = subtotal;
    if (!fab) { lastCount = n; return; }
    fabLabel.textContent = n > 0 ? "Cart, " + n + " items, " + money(subtotal) : "Cart";
    fab.setAttribute("aria-label",
      n > 0 ? "Cart, " + n + " item" + (n === 1 ? "" : "s") + ", view cart" : "View cart");
    if (lastCount !== null && n > lastCount) {         /* nudge on add */
      fab.classList.add("is-bumped");
      setTimeout(function () { fab.classList.remove("is-bumped"); }, 190);
    }
    lastCount = n;
  }

  async function update() {
    try {
      var c = await getJSON("/cart.js");
      var n = c.item_count;
      buildFab();
      paintFab(n, c.items_subtotal_price / 100);
      /* also feed the site's own "(N ITEMS)" indicator where one exists */
      document.querySelectorAll("[data-brk-cart-count]").forEach(function (e) { e.textContent = n; });
      document.querySelectorAll("*").forEach(function (el) {
        if (el.children.length === 0 && /\(\s*\d+\s*ITEMS?\s*\)/i.test(el.textContent)) {
          el.textContent = el.textContent.replace(/\(\s*\d+(\s*ITEMS?\s*)\)/i, "(" + n + "$1)");
        }
      });
    } catch (e) {}
  }

  /* ---------- hook the existing ADD TO CART buttons ----------
     The page's own inline handler runs the visual feedback; this one does
     the real add. It respects the same guard (no size selected -> no add,
     the inline handler already shows the outline nudge). ---------- */
  var pm = location.pathname.match(/^\/products\/([^\/?#]+)/);
  var HANDLE = pm ? decodeURIComponent(pm[1]) : null;

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest(".brk-add") : null;
    if (!t || !HANDLE) return;
    var box = t.closest("section") || document;
    var sizes = box.querySelectorAll(".brk-size");
    var sel = box.querySelector(".brk-size.is-selected");
    if (sizes.length && !sel) return;            /* inline handler nudges */
    var qEl = box.querySelector(".brk-qty-n");
    var qty = qEl ? (parseInt(qEl.textContent) || 1) : 1;
    add({ handle: HANDLE, size: sel ? sel.textContent.trim() : null, qty: qty })
      .catch(function (err) {
        console.warn("[brk-cart] add failed:", err);
      });
  });

  window.BRKCart = { add: add, fetchCart: fetchCart, setQty: setQty,
                     update: update, count: count, money: money };
  if (document.readyState !== "loading") update();
  else document.addEventListener("DOMContentLoaded", update);
})();
