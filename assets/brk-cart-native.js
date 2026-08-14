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
     /cart while shopping. Always on screen, site-styled; shows the live item
     count and subtotal once the cart has something in it. Suppressed on
     /cart and /checkout, where it would be redundant. ---------- */
  var CART_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="square" aria-hidden="true">' +
    '<path d="M3 4h2.2l2.2 10.4h9.6L19 7H6"/>' +
    '<circle cx="9" cy="19" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>';

  var fab = null, fabLabel = null, lastCount = null;

  function buildFab() {
    if (fab || /^\/(cart|checkout)/.test(location.pathname)) return;

    var css = document.createElement("style");
    css.textContent =
      ".brk-cart-fab{position:fixed;right:1rem;z-index:9990;" +
      "bottom:calc(1rem + env(safe-area-inset-bottom,0px));" +
      "display:inline-flex;align-items:center;gap:.5rem;" +
      "background:var(--brk-accent,#ffe500);color:#111;text-decoration:none;" +
      "padding:.8rem 1.1rem;font:inherit;font-weight:500;font-size:.9rem;" +
      "line-height:1;letter-spacing:.02em;white-space:nowrap;" +
      "box-shadow:0 2px 16px rgba(0,0,0,.24)}" +
      ".brk-cart-fab:hover{opacity:.88}" +
      ".brk-cart-fab svg{width:1.15rem;height:1.15rem;flex:none;display:block}" +
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
  }

  function paintFab(n, subtotal) {
    if (!fab) return;
    fabLabel.textContent = n > 0 ? "CART (" + n + ")  " + money(subtotal) : "CART";
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
