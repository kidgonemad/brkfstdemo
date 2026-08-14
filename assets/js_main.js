/* ==========================================================================
   BRKFST — standalone front page
   Modules: rAF shim · loader · hero scramble + sprite logo · LinkButton
   underline controller · IntersectionObserver reveals · event hover-video ·
   plus-sign toggle. No dependencies.
   ========================================================================== */

/* ---------- keep requestAnimationFrame alive in hidden/background tabs
   (the hero loop otherwise freezes when the tab is not visible) ---------- */
(() => {
  const nraf = window.requestAnimationFrame.bind(window);
  const ncaf = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = cb =>
    document.hidden ? setTimeout(() => cb(performance.now()), 33) : nraf(cb);
  window.cancelAnimationFrame = id => {
    try { ncaf(id); } catch (e) {}
    try { clearTimeout(id); } catch (e) {}
  };
})();

/* ---------- loadup: animated sprite-logo draw-in, then swipe up ---------- */
(() => {
  const loader = document.getElementById('loader');
  const logo   = document.getElementById('loadLogo');
  const FRAMES = 24, FW = 89, DRAW = 1500, HOLD = 320;   // ms
  const start = performance.now();
  function tick(now) {
    const e = now - start;
    let idx = e >= DRAW ? FRAMES - 1 : Math.floor(e / DRAW * FRAMES);
    if (idx > FRAMES - 1) idx = FRAMES - 1;
    if (logo) logo.style.backgroundPositionX = (-(idx * FW)) + 'px';
    if (e < DRAW + HOLD) { requestAnimationFrame(tick); return; }
    if (loader) {
      loader.classList.add('is-swipe');                    // swipe the overlay up
      loader.addEventListener('transitionend', () => { loader.style.display = 'none'; }, { once: true });
    }
    document.body.classList.remove('is-loading');
    window.dispatchEvent(new CustomEvent('brk:loaded'));    // hero scramble starts as page reveals
  }
  if (document.readyState !== 'loading') requestAnimationFrame(tick);
  else document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(tick));
})();

/* ---------- hero: matrix scramble + sprite logo draw-in ---------- */
(() => {
  const LINES = [
    '© BRKFST CLOTHING',
    'COLLECT BRKFST.',
    'CONSUME BRKFST.',
    'BECOME PART OF BRKFST.'
  ];
  const GLY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./#&*+';
  const g = () => GLY[Math.floor(Math.random() * GLY.length)];
  const RP = 26, STAG = 190, TAIL = 5, HOLD = 2600, GAP = 700;   // ms

  function startScramble() {
    const root = document.getElementById('heroIntro');
    if (!root) return;
    const bs = [...root.querySelectorAll('.bh-statement b')]
      .map((el, i) => ({ el, text: LINES[i] || '' }));
    const cap = root.querySelector('.bh-cap');
    const logo = root.querySelector('.bh-logo');

    const ld = t => Math.max(1, t.length) * RP;
    const maxType = Math.max.apply(null, bs.map((l, i) => i * STAG + ld(l.text)));
    const cycle = maxType + HOLD + maxType + GAP;
    const build = (text, reveal) => {
      let s = '';
      for (let i = 0; i < text.length; i++) {
        if (i < reveal) s += text[i];
        else if (i < reveal + TAIL && text[i] !== ' ') s += g();
        else if (text[i] === ' ') s += ' ';
        else break;
      }
      return s;
    };

    let start = performance.now();
    function frame(now) {
      let e = now - start;
      if (e > cycle) { start = now; e = 0; }
      bs.forEach((l, i) => {
        const len = l.text.length;
        const ds = i * STAG, de = ds + ld(l.text);
        const us = maxType + HOLD + i * STAG, ue = us + ld(l.text);
        let out;
        if (e < ds) out = '';
        else if (e < de) out = build(l.text, Math.floor((e - ds) / ld(l.text) * len));
        else if (e < us) out = l.text;
        else if (e < ue) out = build(l.text, Math.ceil((1 - (e - us) / ld(l.text)) * len));
        else out = '';
        if (l.el.textContent !== out) l.el.textContent = out;
      });
      if (cap) cap.style.opacity = (e >= maxType - 150 && e < maxType + HOLD + 120) ? '1' : '0';
      if (logo) {   // draw the logo in (24 sprite frames) as the caption appears
        const s0 = maxType - 150, DRAW = 1700;
        let idx = 0;
        if (e >= s0) {
          const dt = e - s0;
          idx = dt >= DRAW ? 23 : Math.floor(dt / DRAW * 24);
          if (idx > 23) idx = 23;
        }
        logo.style.backgroundPositionX = (-(idx * 89)) + 'px';
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.body.classList.contains('is-loading')) {
    window.addEventListener('brk:loaded', startScramble, { once: true });
  } else {
    startScramble();
  }
})();

/* ---------- LinkButton underline: wipe in on first hover,
   retract-then-rewipe on re-hover (original keyframe behavior) ---------- */
(() => {
  document.querySelectorAll('.LinkButton').forEach(btn => {
    const p = btn.querySelector('p');
    if (!p) return;
    btn.addEventListener('mouseenter', () => {
      if (!p.dataset.hovered) {
        p.dataset.hovered = '1';
        p.classList.add('play-underline');
      } else {
        p.classList.remove('play-underline', 'replay-underline');
        void p.offsetWidth;                       // restart the animation
        p.classList.add('replay-underline');
      }
    });
  });
})();

/* ---------- scroll reveals: one IO, staggered within groups ---------- */
(() => {
  // assign stagger index within each [data-reveal-group]
  document.querySelectorAll('[data-reveal-group]').forEach(group => {
    [...group.querySelectorAll('[data-reveal]')].forEach((el, i) => {
      el.style.setProperty('--i', i % 5);         // cap stagger to keep it snappy
    });
  });
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in-view');
      io.unobserve(en.target);
    });
  }, {
    // fire slightly BEFORE the element is on screen, so the motion is already
    // underway by the time you look at it - .15 alone meant you saw it arrive
    threshold: .05,
    rootMargin: '0px 0px -8% 0px'
  });
  document.querySelectorAll('[data-reveal],[data-reveal-lines]').forEach(el => io.observe(el));
})();

/* ---------- events: video always playing (muted autoplay, no hover) ----------
   Muted is required for programmatic autoplay without a user gesture. We keep
   it visible (is-playing) and re-kick play on load / when the tab returns. ---------- */
(() => {
  const box = document.getElementById('eventMedia');
  if (!box) return;
  const v = box.querySelector('video');
  v.muted = true; v.loop = true; v.setAttribute('playsinline', '');
  box.classList.add('is-playing');            // CSS shows the video (opacity 1)

  const tryPlay = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  tryPlay();
  document.addEventListener('DOMContentLoaded', tryPlay);
  window.addEventListener('load', tryPlay);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryPlay(); });
})();

/* ---------- Policy plus-sign toggle ---------- */
(() => {
  const btn = document.getElementById('policyBtn');
  if (!btn) return;
  btn.addEventListener('click', () => btn.classList.toggle('isOpen'));
})();

/* ---------- globe clock: LOCAL TIME / TIME ZONE ----------
   The OG got these from Slater, which isn't ported. Same data-* hooks. ---------- */
(() => {
  const t = document.querySelector('[data-local-time]');
  const z = document.querySelector('[data-time-zone]');
  if (!t && !z) return;
  const zone = () => {
    const off = -new Date().getTimezoneOffset() / 60;
    let name = '';
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(new Date()).find(x => x.type === 'timeZoneName');
      name = p ? p.value : '';
    } catch (e) {}
    return `${name} (UTC${off >= 0 ? '+' : ''}${off})`;
  };
  const tick = () => {
    const d = new Date();
    if (t) t.textContent = d.toLocaleTimeString('en-GB', { hour12: false });
    if (z) z.textContent = zone();
  };
  tick();
  setInterval(tick, 1000);
})();

/* ---------- directory: drops from the header bar, ~half page ---------- */
(() => {
  const btn = document.getElementById('dirBtn');
  const panel = document.getElementById('directory');
  if (!btn || !panel) return;
  const close = () => { btn.classList.remove('isOpen'); panel.classList.remove('isOpen'); btn.setAttribute('aria-expanded', 'false'); };
  const open = () => { btn.classList.add('isOpen'); panel.classList.add('isOpen'); btn.setAttribute('aria-expanded', 'true'); };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.contains('isOpen') ? close() : open();
  });
  panel.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('click', e => {
    if (panel.classList.contains('isOpen') && !panel.contains(e.target) && e.target !== btn) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
