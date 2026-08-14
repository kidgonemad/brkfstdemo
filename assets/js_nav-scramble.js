/* ------------------------------------------------------------------ *
 * BRKFST — nav scramble on hover
 *
 * Same treatment the footer links use (Slater's initScrambleOnHover),
 * rebuilt standalone so it works on every page without depending on
 * GSAP being present. Hovering anywhere in the nav scrambles ALL the
 * items together rather than just the one under the cursor.
 *
 * No red: the footer version tints ~15% of characters #ff2b29. This
 * keeps everything in the nav's own colour.
 * ------------------------------------------------------------------ */
(function () {
  if (window.__brkNavScramble) return;
  window.__brkNavScramble = true;

  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@';
  var DURATION = 620;      // ms, matches the footer's .65s
  var TICK = 55;           // ms between character shuffles
  var SETTLE = 0.72;       // fraction of the run after which text resolves

  function reduced() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  }

  function scramble(el, text) {
    if (el.__t) { clearInterval(el.__t); el.__t = null; }
    // pick which character slots get shuffled - not all of them, so the
    // word stays semi-legible while it resolves
    var slots = [];
    for (var i = 0; i < text.length; i++) {
      if (text[i] !== ' ' && Math.random() < 0.6) slots.push(i);
    }
    var start = Date.now();
    el.__t = setInterval(function () {
      var p = (Date.now() - start) / DURATION;
      if (p >= SETTLE) {                       // resolve
        clearInterval(el.__t); el.__t = null;
        el.textContent = text;
        return;
      }
      var out = text.split('');
      slots.forEach(function (s) {
        // slots settle progressively so it unscrambles left-to-right-ish
        if (Math.random() > p * 1.4) {
          out[s] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      });
      el.textContent = out.join('');
    }, TICK);
  }

  function wire() {
    var nav = document.querySelector('.Header-nav');
    if (!nav || nav.dataset.brkScramble) return;
    // don't claim the nav until we know its items exist - marking it early
    // meant an empty first pass locked out every retry
    if (!nav.querySelector('.NavItem')) return;
    nav.dataset.brkScramble = '1';

    // the label-swap holds two copies of the word for the slide effect;
    // scramble both so the swap doesn't reveal un-scrambled text
    // only the item under the cursor scrambles - not its neighbours
    Array.prototype.forEach.call(nav.querySelectorAll('.NavItem'), function (item) {
      var spans = [].slice.call(item.querySelectorAll('.label-swap > span'));
      if (!spans.length) spans = [item];
      var words = spans.map(function (sp) { return { el: sp, text: sp.textContent }; });
      var busy = false;
      item.addEventListener('mouseenter', function () {
        if (busy || reduced()) return;
        busy = true;
        words.forEach(function (w) { scramble(w.el, w.text); });
        setTimeout(function () { busy = false; }, DURATION + 80);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', wire);
  wire();
  setTimeout(wire, 1200);        // nav is injected late on some pages
})();
