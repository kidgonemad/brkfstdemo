/* ------------------------------------------------------------------ *
 * BRKFST — scroll reveals for the inner pages
 *
 * The home page has its own [data-reveal] system in main.js/style.css;
 * every other page had none, so content just appeared. This is a
 * self-contained drop-in: it injects its own CSS, picks likely blocks,
 * staggers them within their row, and reveals on scroll.
 *
 * Safety: nothing is hidden until this script confirms it is running
 * (it stamps <html class="brk-rev">), so with JS off or on error the
 * page renders normally rather than staying invisible.
 * ------------------------------------------------------------------ */
(function () {
  if (window.__brkReveal) return;            // never double-init
  window.__brkReveal = true;

  // The home page already reveals via main.js - don't fight it.
  if (document.querySelector('[data-reveal]')) return;

  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (reduce) return;                        // leave everything visible

  document.documentElement.classList.add('brk-rev');

  var css = document.createElement('style');
  css.id = 'brk-reveal-css';
  css.textContent =
    '.brk-rev [data-brk-rev]{opacity:0;transform:translateY(52px) scale(.987);' +
      'transition:opacity .75s cubic-bezier(.16,1,.3,1),' +
      'transform .95s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:calc(var(--ri,0)*70ms);will-change:transform,opacity;}' +
    '.brk-rev [data-brk-rev].is-in{opacity:1;transform:none;}' +
    '@media (prefers-reduced-motion:reduce){' +
      '.brk-rev [data-brk-rev]{opacity:1!important;transform:none!important;transition:none!important;}}';
  document.head.appendChild(css);

  // Blocks worth animating. Deliberately conservative - whole rows and
  // cards, not every paragraph, so the page doesn't shimmer on scroll.
  var SELECTORS = [
    '.product-card',
    '.brk-col-tile',
    '.shop-listing_header',
    '.brk-page-title',
    '.brk-collections_title',
    '.footer_links',
    '.section_default > .container > .padding-global > .default_wrapper > *',
    '.cl_shop-listing_item'
  ].join(',');

  function tag() {
    var els = document.querySelectorAll(SELECTORS);
    var byRow = {};
    Array.prototype.forEach.call(els, function (el) {
      if (el.hasAttribute('data-brk-rev')) return;
      if (!el.getBoundingClientRect().height) return;      // skip collapsed
      el.setAttribute('data-brk-rev', '');
      // stagger by visual row so items on one line come in together-ish
      var row = Math.round((el.getBoundingClientRect().top + window.scrollY) / 80);
      byRow[row] = (byRow[row] || 0);
      el.style.setProperty('--ri', byRow[row] % 5);
      byRow[row]++;
      io.observe(el);
    });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { threshold: .05, rootMargin: '0px 0px -8% 0px' });

  // Anything already on screen at load should not animate in late.
  function settleInitial() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-brk-rev]'), function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('is-in');
    });
  }

  document.addEventListener('DOMContentLoaded', function () { tag(); settleInitial(); });
  tag();
  setTimeout(function () { tag(); settleInitial(); }, 800);   // late-rendered grids
  setTimeout(tag, 2500);

  // grids re-render on filter changes
  new MutationObserver(function () { tag(); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // Failsafe: if anything above went wrong, reveal everything after 6s
  // rather than leaving the page blank.
  setTimeout(function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-brk-rev]:not(.is-in)'),
      function (el) { el.classList.add('is-in'); });
  }, 6000);
})();
