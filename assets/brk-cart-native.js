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

  /* cart chip removed — the site's own "(N ITEMS)" indicator is the only UI */

  async function update() {
    try {
      var n = await count();
      /* feed the site's own "(N ITEMS)" cart indicator; no extra chip UI */
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
