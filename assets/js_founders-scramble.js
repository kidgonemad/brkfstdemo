/* ------------------------------------------------------------------ *
 * BRKFST — founders redaction
 *
 * The two founder cards no longer name anyone: each reads ✕ UNKNOWN,
 * with the word shuffling like the nav does before it settles.
 *
 * Same characters, duration and tick as js_nav-scramble.js, so this
 * reads as the site's one scramble rather than a second one. The
 * difference is what triggers it: the nav scrambles on hover, these
 * settle once when they scroll into view and then re-scramble on a
 * slow cycle, so a card left on screen keeps looking unresolved.
 * ------------------------------------------------------------------ */
(function () {
  if (window.__brkFoundersScramble) return;
  window.__brkFoundersScramble = true;

  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@';
  var DURATION = 620;      // ms, matches the nav
  var TICK = 55;           // ms between character shuffles
  var SETTLE = 0.72;       // fraction of the run after which text resolves
  var CYCLE = 4200;        // ms a resolved word holds before going again

  function reduced() {
    return window.matchMedia &&
           window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  }

  function scramble(el, text, done) {
    if (el.__t) { clearInterval(el.__t); el.__t = null; }
    var slots = [];
    for (var i = 0; i < text.length; i++) {
      if (text[i] !== ' ' && Math.random() < 0.6) slots.push(i);
    }
    var start = Date.now();
    el.__t = setInterval(function () {
      var p = (Date.now() - start) / DURATION;
      if (p >= SETTLE) {
        clearInterval(el.__t); el.__t = null;
        el.textContent = text;
        if (done) done();
        return;
      }
      var out = text.split('');
      slots.forEach(function (s) {
        if (Math.random() > p * 1.4) {
          out[s] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      });
      el.textContent = out.join('');
    }, TICK);
  }

  function loop(el, text) {
    scramble(el, text, function () {
      el.__c = setTimeout(function () { loop(el, text); }, CYCLE);
    });
  }

  function wire() {
    var words = document.querySelectorAll('[data-brk-unknown]');
    if (!words.length) return false;

    Array.prototype.forEach.call(words, function (el) {
      if (el.dataset.brkWired) return;
      el.dataset.brkWired = '1';
      var text = el.getAttribute('data-brk-unknown') || el.textContent.trim();

      // reduced motion gets the word, not the machinery
      if (reduced()) { el.textContent = text; return; }

      // a card dragged off screen shouldn't keep ticking
      if (!('IntersectionObserver' in window)) { loop(el, text); return; }
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            if (!el.__t && !el.__c) loop(el, text);
          } else {
            if (el.__t) { clearInterval(el.__t); el.__t = null; }
            if (el.__c) { clearTimeout(el.__c); el.__c = null; }
            el.textContent = text;
          }
        });
      }, { threshold: 0.25 }).observe(el);
    });
    return true;
  }

  function boot() {
    if (wire()) return;
    // the cards are part of the page, not injected, but the founders
    // section sits behind the loader on a cold visit — retry briefly
    var tries = 0;
    var iv = setInterval(function () {
      if (wire() || ++tries > 20) clearInterval(iv);
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
