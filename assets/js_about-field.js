/* ------------------------------------------------------------------ *
 * BRKFST — About: scroll-scrubbed field
 * Lenis (infinite:true) feeds ScrollTrigger; a single trigger maps scroll
 * progress onto one paused GSAP master timeline. Scroll is the playhead —
 * forward advances, back reverses. Panels are opacity/transform only, so
 * it stays cheap. Built for BRKFST from its own assets.
 * ------------------------------------------------------------------ */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage  = document.querySelector('.field-stage');
  if (!stage) return;

  /* ---- intro: draw the B mark in on load (24-frame sprite) ---- */
  var intro = document.querySelector('.field-intro');
  var mark  = document.querySelector('.field-mark');
  function playIntro(done) {
    if (!intro || !mark || reduce) { if (intro) intro.remove(); return done(); }
    var FRAMES = 24, W = 89, i = 0;
    var id = setInterval(function () {
      mark.style.backgroundPosition = (-W * i) + 'px 0';
      if (++i >= FRAMES) {
        clearInterval(id);
        setTimeout(function () {
          intro.classList.add('is-done');
          setTimeout(function () { intro.remove(); done(); }, 500);
        }, 260);
      }
    }, 34);
  }

  if (reduce || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    // no scrub — show everything as a plain stacked page
    [].forEach.call(document.querySelectorAll('.field-panel'), function (p) { p.style.opacity = 1; });
    if (intro) intro.remove();
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /* ---- smooth, endless scroll ---- */
  var lenis = new Lenis({ smooth: true, infinite: true, wheelMultiplier: 1.1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
  gsap.ticker.lagSmoothing(0);

  var P = function (n) { return document.querySelector('[data-panel="' + n + '"]'); };
  var grid = document.querySelector('.field-grid');
  var dots = document.querySelector('.field-dots');

  /* ---- the master sequence (paused; scroll scrubs it) ---- */
  var master = gsap.timeline({ paused: true });

  // ground textures breathe across the whole run — black & white only
  master
    .fromTo(grid, { opacity: 0 }, { opacity: 1, duration: 1 }, 0)
    .to(grid,  { opacity: .35, duration: 4 }, 1)
    .fromTo(dots, { opacity: 0 }, { opacity: .8, duration: 1.4 }, 2.2)
    .to(dots,  { opacity: 0, duration: 1.4 }, 5);

  // 1 · headline
  panel(P('head'), 0, 1.6);
  // 2 · brand paragraph
  panel(P('body'), 1.5, 1.7);
  // 3 · experience — the video pops up with its caption
  panel(P('exp'),  3.1, 1.9, true);
  // 4 · founders
  panel(P('founders'), 5.0, 1.7);
  // 5 · closing mark
  panel(P('close'), 6.6, 1.4);

  /* a panel fades/rises in, holds, then releases */
  function panel(el, at, len, pop) {
    if (!el) return;
    var t = gsap.timeline();
    t.fromTo(el, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .45, ease: 'power2.out' }, 0)
     .to(el, { opacity: 1, duration: len - .9 }, .45)
     .to(el, { opacity: 0, y: -22, duration: .45, ease: 'power2.in' }, len - .45);
    if (pop) {
      var media = el.querySelector('.f-exp-media');
      if (media) t.fromTo(media, { scale: .82 }, { scale: 1, duration: .6, ease: 'back.out(1.6)' }, 0);
    }
    master.add(t, at);
  }

  /* ---- scroll drives the playhead ---- */
  var trigger = ScrollTrigger.create({
    start: 0,
    onUpdate: function (self) { master.progress(self.progress); }
  });

  // exposed so the scrub can be verified without faking wheel events
  window.__field = { master: master, trigger: trigger, lenis: lenis };

  playIntro(function () { ScrollTrigger.refresh(); });
})();
