/* ------------------------------------------------------------------ *
 * BRKFST — auto-hide header nav
 * Keeps the logo pinned top-left at all times; the nav links and the
 * Search / Directory utils auto-hide. They come back on scroll-up,
 * when the pointer reaches the top edge (or hovers the header), and
 * on any activity. They hide on scroll-down and after a short idle.
 * Self-contained: injects its own CSS, so it works on every page
 * regardless of where the .Header styles are defined.
 * ------------------------------------------------------------------ */
(function () {
  var header = document.querySelector('.Header');
  if (!header) return;

  /* ---- inject CSS once ---- */
  if (!document.getElementById('brk-nav-autohide-css')) {
    var st = document.createElement('style');
    st.id = 'brk-nav-autohide-css';
    st.textContent =
      '.Header{transition:background-color .35s ease,border-color .35s ease;}' +
      '.Header-nav,.Header-utils{' +
        'transition:opacity .35s ease,transform .35s ease,visibility .35s;' +
      '}' +
      /* hide the whole black bar: transparent background + fade the nav
         and utils out. The logo keeps its slot (visibility, not display),
         so it stays pinned top-left, floating over the content. */
      '.Header.nav-auto-hidden{' +
        'background-color:transparent !important;border-color:transparent !important;' +
        'pointer-events:none;' +
      '}' +
      '.Header.nav-auto-hidden .Header-logo{pointer-events:auto;}' +
      /* the closed Directory panel keeps a 1px top border pinned at the
         header's bottom edge; its #010101 background paints under that
         border (background-clip defaults to border-box), so it shows as a
         hairline over the video once the bar is transparent. Collapse the
         border to 0 so the closed panel has no height and paints nothing.
         (It is always closed while hidden — opening it forces the bar back.) */
      'html.brk-nav-hidden .Directory{border-top-width:0 !important;background-color:transparent !important;}' +
      /* when the bar hides, the "brkfst" wordmark slides left and fades
         out behind the geometric mark (the mark is reordered to paint on
         top in JS), leaving just the mark top-left. */
      '.Header-logo svg text{' +
        'transition:opacity .4s ease,transform .45s cubic-bezier(.22,.61,.36,1);' +
        'transform-box:fill-box;transform-origin:left center;' +
      '}' +
      'html.brk-nav-hidden .Header-logo svg text{opacity:0;transform:translateX(-45%);}' +
      '.Header.nav-auto-hidden .Header-nav,' +
      '.Header.nav-auto-hidden .Header-utils{' +
        'opacity:0;visibility:hidden;transform:translateY(-8px);pointer-events:none;' +
      '}' +
      /* when the bar is hidden, the home hero grows to fill every edge:
         up under the transparent header and out past the side margins.
         Pulling the box up 4.5rem while adding 4.5rem of height keeps its
         flow box identical, so page content never jumps as the bar toggles
         during scroll. Expanding the box (not just the <video>) carries the
         gradient/text overlay along too — no seam at the old top edge. */
      '.HomeHero{transition:margin .4s ease,height .4s ease,border-radius .4s ease;}' +
      'html.brk-nav-hidden .HomeHero{' +
        'margin:-4.5rem 0 0 0 !important;' +
        'height:calc(96vh + 4.5rem) !important;' +
        'border-radius:0 !important;' +
      '}' +
      '@media (max-width:720px){' +
        'html.brk-nav-hidden .HomeHero{height:calc(92vh + 4.5rem) !important;}' +
      '}' +
      '@media (prefers-reduced-motion:reduce){' +
        '.Header,.Header-nav,.Header-utils,.HomeHero,.Header-logo svg text{transition:none;}' +
      '}';
    document.head.appendChild(st);
  }

  var HIDE_AT     = 40;    // px scrolled before scroll-down hiding kicks in
  var REVEAL_ZONE = 90;    // px from the top edge that reveals the nav on hover
  var IDLE_MS     = 3000;  // idle time (no scroll / no mouse) before auto-hide

  var lastY        = window.scrollY || window.pageYOffset || 0;
  var idleTimer    = null;
  var pointerInTop = false;

  // reorder the logo so the geometric mark paints on top of the wordmark,
  // letting the "brkfst" text tuck behind it as it slides away
  var logo = header.querySelector('.Header-logo svg');
  if (logo) {
    var mark = logo.querySelector('path');
    if (mark) logo.appendChild(mark);
  }

  var directory = header.querySelector('.Directory');
  function dirOpen() { return !!(directory && directory.classList.contains('isOpen')); }

  var root = document.documentElement;

  function show() {
    header.classList.remove('nav-auto-hidden');
    root.classList.remove('brk-nav-hidden');   // let the hero video collapse back
  }

  function hide(opts) {
    opts = opts || {};
    if (dirOpen()) return;                 // never hide while the Directory is open
    if (pointerInTop) return;              // keep visible while hovering the top
    if (!opts.ignoreTop && (window.scrollY || 0) <= HIDE_AT) return;
    header.classList.add('nav-auto-hidden');
    root.classList.add('brk-nav-hidden');      // let the hero video bleed to edges
  }

  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { hide({ ignoreTop: true }); }, IDLE_MS);
  }

  function onScroll() {
    var y = window.scrollY || window.pageYOffset || 0;
    if (y <= HIDE_AT)      show();         // at the top → always shown
    else if (y < lastY)    show();         // scrolling up → reveal
    else if (y > lastY)    hide();         // scrolling down → hide
    lastY = y;
    armIdle();
  }

  function onMouseMove(e) {
    pointerInTop = e.clientY <= REVEAL_ZONE;
    if (pointerInTop) show();
    armIdle();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  header.addEventListener('mouseenter', show);

  // opening the Directory should always reveal the nav
  var dirBtn = header.querySelector('#dirBtn');
  if (dirBtn) dirBtn.addEventListener('click', show);

  armIdle();  // start the idle countdown on load
})();
