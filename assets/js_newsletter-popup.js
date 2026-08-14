/* ------------------------------------------------------------------ *
 * BRKFST — newsletter popup wiring
 *
 * The .popup_component modal (overlay + .popup.is-newsletter) ships
 * permanently visible in this static export: the Webflow interaction
 * that was meant to hide it and open it on demand didn't come across.
 * The result was a sign-up panel sitting on the page at all times,
 * which read as though the "Available size" filter had summoned it.
 *
 * This hides it by default and opens it from "Join the family".
 * Closes on: the close button, the overlay, and Escape.
 * ------------------------------------------------------------------ */
(function () {
  if (window.__brkNewsletter) return;
  window.__brkNewsletter = true;

  var OPEN = 'brk-popup-open';

  function init() {
    var comp = document.querySelector('.popup_component');
    if (!comp || comp.dataset.brkWired) return;
    comp.dataset.brkWired = '1';

    // hide by default - inline so it applies even before the stylesheet lands
    var css = document.createElement('style');
    css.id = 'brk-newsletter-css';
    css.textContent =
      '.popup_component{display:none !important;}' +
      '.popup_component.' + OPEN + '{display:flex !important;}';
    document.head.appendChild(css);

    function open(e) { if (e) e.preventDefault(); comp.classList.add(OPEN); }
    function close() { comp.classList.remove(OPEN); }

    // "Join the family" is a footer_link with href="#", so match on its text
    Array.prototype.forEach.call(document.querySelectorAll('a'), function (a) {
      if (/join the family/i.test(a.textContent)) a.addEventListener('click', open);
    });
    // anything explicitly marked as a newsletter trigger also works
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-newsletter-open]'), function (el) {
        el.addEventListener('click', open);
      });

    var closer = comp.querySelector('.close_wrapper');
    if (closer) closer.addEventListener('click', close);
    var overlay = comp.querySelector('.popup_overlay');
    if (overlay) overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  init();
  setTimeout(init, 1200);        // footer is injected late on some pages
})();
