/* ============================================================
   BIRTHDAY WISH · script.js
   Vanilla JS, organised as small modules:
     1. Helpers
     2. Sound (tiny WebAudio chimes — no assets needed)
     3. Party (confetti wrappers via canvas-confetti CDN)
     4. Background (balloons + fireworks on a fixed canvas)
     5. Deck (slide navigation: dots, arrows, keys, swipe)
     6. NoButton (the elusive "No" button trick)
     7. Gallery (memory-lane carousel)
     8. Letter (typing animation)
     9. Cake (interactive candles + finale)
    10. Init
   ============================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------
     1 · HELPERS
     ---------------------------------------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     2 · SOUND — tiny synthesised chimes (WebAudio, no files)
     ---------------------------------------------------------- */
  const Sound = (() => {
    let ctx = null;
    let enabled = true;

    function ensureCtx() {
      if (!enabled) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    /** Play a single soft tone. */
    function tone(freq, { dur = 0.18, type = 'sine', gain = 0.06, delay = 0 } = {}) {
      const ac = ensureCtx();
      if (!ac) return;
      const t0 = ac.currentTime + delay;
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(gain, t0 + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(amp).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    return {
      get enabled() { return enabled; },
      set enabled(v) { enabled = v; },
      click() { tone(520, { dur: 0.09, type: 'triangle', gain: 0.04 }); },
      pop() { tone(300, { dur: 0.12, type: 'square', gain: 0.03 }); tone(600, { dur: 0.1, type: 'triangle', gain: 0.03, delay: 0.03 }); },
      chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, { dur: 0.35, gain: 0.05, delay: i * 0.09 })); },
      fanfare() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { dur: 0.5, type: 'triangle', gain: 0.055, delay: i * 0.11 })); },
      blow() { tone(180, { dur: 0.25, type: 'sawtooth', gain: 0.02 }); },
    };
  })();

  /* ----------------------------------------------------------
     3 · PARTY — confetti helpers (canvas-confetti via CDN)
     ---------------------------------------------------------- */
  const Party = (() => {
    const hasConfetti = typeof window.confetti === 'function';

    const PALETTE = ['#ffd166', '#ff5d8f', '#a06cd5', '#c77dff', '#7bdff2', '#ffe8a3'];

    function validate() {
      if (!hasConfetti) {
        console.warn('canvas-confetti failed to load — visual confetti disabled.');
        return false;
      }
      return true;
    }

    /** Confetti burst centred on a DOM element. */
    function burstAt(el, power = 1) {
      if (!validate() || !el) return;
      const r = el.getBoundingClientRect();
      window.confetti({
        particleCount: Math.round(70 * power),
        spread: 70,
        startVelocity: 42,
        scalar: 0.9,
        origin: {
          x: (r.left + r.width / 2) / window.innerWidth,
          y: (r.top + r.height / 2) / window.innerHeight,
        },
        colors: PALETTE,
      });
    }

    /** Two cannons firing inward from the screen edges. */
    function sideCannons() {
      if (!validate()) return;
      const opts = { particleCount: 45, angle: 60, spread: 55, scalar: 0.9, colors: PALETTE };
      window.confetti({ ...opts, origin: { x: 0, y: 0.65 } });
      window.confetti({ ...opts, angle: 120, origin: { x: 1, y: 0.65 } });
    }

    /** Big multi-burst celebration. */
    function grandFinale(duration = 2600) {
      if (!validate()) return;
      const end = Date.now() + duration;
      (function frame() {
        window.confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: PALETTE });
        window.confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: PALETTE });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      // A few stars in the middle too
      window.confetti({ particleCount: 90, spread: 100, startVelocity: 35, ticks: 160, gravity: 0.8, scalar: 1.1, origin: { x: 0.5, y: 0.5 }, colors: PALETTE });
    }

    return { burstAt, sideCannons, grandFinale };
  })();

  /* ----------------------------------------------------------
     4 · BACKGROUND — floating balloons + fireworks canvas
     ---------------------------------------------------------- */
  const Background = (() => {
    const canvas = $('#bg-canvas');
    if (!canvas) return { start() {} };
    const ctx = canvas.getContext('2d');

    const BALLOON_COLORS = [
      'rgba(255, 93, 143, 0.55)',
      'rgba(160, 108, 213, 0.55)',
      'rgba(255, 209, 102, 0.5)',
      'rgba(199, 125, 255, 0.5)',
      'rgba(123, 223, 242, 0.45)',
    ];
    const FIREWORK_COLORS = ['#ffd166', '#ff5d8f', '#a06cd5', '#c77dff', '#7bdff2', '#ffe8a3'];

    let W = 0, H = 0, DPR = 1;
    let balloons = [];
    let particles = []; // firework sparks
    let rafId = null;
    let lastFirework = 0;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function makeBalloon(atBottom) {
      const r = rand(14, 30);
      return {
        x: rand(0, W),
        y: atBottom ? H + r + rand(0, H * 0.6) : rand(-H * 0.3, H),
        r,
        speed: rand(0.25, 0.85),
        swayAmp: rand(12, 40),
        swayFreq: rand(0.0015, 0.004),
        phase: rand(0, Math.PI * 2),
        color: pick(BALLOON_COLORS),
        stringLen: rand(26, 60),
      };
    }

    function initBalloons() {
      const count = clamp(Math.round((W * H) / 46000), 6, 18);
      balloons = Array.from({ length: count }, () => makeBalloon(false));
    }

    function spawnFirework() {
      const x = rand(W * 0.12, W * 0.88);
      const y = rand(H * 0.08, H * 0.5);
      const count = randInt(26, 44);
      const color = pick(FIREWORK_COLORS);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + rand(-0.08, 0.08);
        const speed = rand(1.2, 3.4);
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: rand(0.008, 0.018),
          size: rand(1.2, 2.8),
          color,
        });
      }
    }

    function drawBalloon(b) {
      const swayX = Math.sin(b.phase) * b.swayAmp;
      const cx = b.x + swayX;
      const cy = b.y;

      // string
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy + b.r * 1.18);
      ctx.quadraticCurveTo(cx + 8, cy + b.r + b.stringLen * 0.5, cx, cy + b.r + b.stringLen);
      ctx.stroke();

      // knot
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy + b.r * 1.05);
      ctx.lineTo(cx - 4, cy + b.r * 1.25);
      ctx.lineTo(cx + 4, cy + b.r * 1.25);
      ctx.closePath();
      ctx.fill();

      // balloon body
      ctx.beginPath();
      ctx.ellipse(cx, cy, b.r, b.r * 1.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();

      // glossy highlight
      ctx.beginPath();
      ctx.ellipse(cx - b.r * 0.34, cy - b.r * 0.42, b.r * 0.2, b.r * 0.3, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
    }

    function frame(ts) {
      ctx.clearRect(0, 0, W, H);

      // balloons
      for (const b of balloons) {
        b.y -= b.speed;
        b.phase += b.swayFreq * 16;
        if (b.y < -b.r - b.stringLen - 30) Object.assign(b, makeBalloon(true));
        drawBalloon(b);
      }

      // fireworks
      if (!reduceMotion && ts - lastFirework > rand(2200, 4200)) {
        spawnFirework();
        lastFirework = ts;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.035;     // gravity
        p.vx *= 0.985;     // drag
        p.vy *= 0.985;
        p.life -= p.decay;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(p.life, 0);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafId = requestAnimationFrame(frame);
    }

    function start() {
      resize();
      initBalloons();
      window.addEventListener('resize', () => { resize(); initBalloons(); });
      if (reduceMotion) {
        // Static, calm scene: draw balloons once, no animation loop.
        ctx.clearRect(0, 0, W, H);
        balloons.forEach(drawBalloon);
        return;
      }
      rafId = requestAnimationFrame(frame);
    }

    return { start };
  })();

  /* ----------------------------------------------------------
     5 · DECK — slide navigation
     ---------------------------------------------------------- */
  const Deck = (() => {
    const slides = $$('.slide');
    const dotsWrap = $('#dots');
    const prevBtn = $('#prev-slide');
    const nextBtn = $('#next-slide');
    let current = 0;
    let animating = false;

    // Per-slide callbacks (fired on enter / leave)
    const hooks = {
      enter: {},
      leave: {},
    };

    function buildDots() {
      slides.forEach((slide, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Go to section ${i + 1}`);
        dot.addEventListener('click', () => goTo(i));
        dotsWrap.appendChild(dot);
      });
    }

    function render() {
      $$('#dots button').forEach((d, i) => d.classList.toggle('is-active', i === current));
      prevBtn.disabled = current === 0;
      nextBtn.disabled = current === slides.length - 1;
    }

    function goTo(index) {
      index = clamp(index, 0, slides.length - 1);
      if (index === current || animating) return;
      animating = true;

      const outgoing = slides[current];
      const incoming = slides[index];

      if (hooks.leave[current]) hooks.leave[current]();

      outgoing.classList.remove('is-active');
      outgoing.classList.add('is-leaving');
      // Clean up the leaving state once its transition ends
      setTimeout(() => outgoing.classList.remove('is-leaving'), 750);

      current = index;
      incoming.classList.add('is-active');
      incoming.scrollTop = 0; // start each slide at the top
      render();

      if (hooks.enter[current]) hooks.enter[current]();

      setTimeout(() => { animating = false; }, 400);
    }

    const next = () => goTo(current + 1);
    const prev = () => goTo(current - 1);

    function bind() {
      prevBtn.addEventListener('click', prev);
      nextBtn.addEventListener('click', next);

      // Buttons anywhere with data-goto="N" jump to slide N (1-based)
      $$('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
          Sound.click();
          goTo(parseInt(btn.dataset.goto, 10) - 1);
        });
      });

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea')) return;
        // The crossword owns the arrow/letter keys while it's on screen
        if (Crossword.isOpen()) return;
        if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) {
          // let the gallery consume left/right when it's on screen
          if (Gallery.isOpen() && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return;
          e.preventDefault();
          next();
        } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
          if (Gallery.isOpen() && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return;
          e.preventDefault();
          prev();
        }
      });

      // Touch swipe (vertical + horizontal) between slides
      let touchX = 0, touchY = 0, touchTime = 0;
      document.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        touchX = t.clientX; touchY = t.clientY; touchTime = Date.now();
      }, { passive: true });

      document.addEventListener('touchend', (e) => {
        // Don't hijack swipes that start on the photo carousel or puzzle
        if (e.target.closest('.gallery') || e.target.closest('.crossword')) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchX;
        const dy = t.clientY - touchY;
        const dt = Date.now() - touchTime;
        if (dt > 700) return;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          dx < 0 ? next() : prev();
        } else if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.4) {
          dy < 0 ? next() : prev();
        }
      }, { passive: true });
    }

    function init() {
      buildDots();
      render();
      bind();
    }

    return { init, goTo, next, prev, hooks, get current() { return current; } };
  })();

  /* ----------------------------------------------------------
     6 · NoButton — the elusive "No" button trick
     ---------------------------------------------------------- */
  const NoButton = (() => {
    const noBtn = $('#no-btn');
    const yesBtn = $('#yes-btn');
    const hint = $('#hint');
    if (!noBtn) return { reset() {} };

    const TAUNTS = [
      'Nice try 😜',
      'Too slow!',
      'It lives another day…',
      'Are you even trying?',
      'The No button is undefeated.',
      'Sorry, that button is fictional.',
      'Hmm… the Yes button looks lonely.',
    ];

    let attempts = 0;
    let celebrating = false;

    /** Move the No button somewhere else on the screen. */
    function scatter() {
      if (celebrating) return;

      const rect = noBtn.getBoundingClientRect();
      const pad = 16;
      const margin = 90; // keep it away from the Yes button
      const yesRect = yesBtn.getBoundingClientRect();

      const maxX = window.innerWidth - rect.width - pad;
      const maxY = window.innerHeight - rect.height - pad - 70; // avoid bottom arrows/dots

      let nx = pad, ny = pad, tries = 0;
      do {
        nx = rand(pad, Math.max(pad + 1, maxX));
        ny = rand(pad + 60, Math.max(pad + 61, maxY));
        tries++;
      } while (
        tries < 25 &&
        (Math.hypot(nx - yesRect.left, ny - yesRect.top) < margin ||
          Math.hypot(nx - rect.left, ny - rect.top) < 110) // don't teleport in place
      );

      noBtn.style.position = 'fixed';
      noBtn.style.left = `${nx}px`;
      noBtn.style.top = `${ny}px`;
      noBtn.style.zIndex = '999';
      noBtn.style.transition = 'transform 0.16s cubic-bezier(0.22, 1, 0.36, 0.4), left 0.16s ease, top 0.16s ease';
      noBtn.style.transform = 'scale(1.16) rotate(-4deg)';
      requestAnimationFrame(() => { noBtn.style.transform = ''; });

      attempts++;
      hint.textContent = pick(TAUNTS);
      Sound.pop();

      // The button shrinks with every failed attempt 😈
      noBtn.style.fontSize = `${Math.max(0.72, 1 - attempts * 0.05)}rem`;
    }

    function celebrate() {
      if (celebrating) return;
      celebrating = true;
      hint.textContent = 'KNEW IT! 🎉 Let’s gooo!';
      hint.style.color = '#7bdff2';
      Sound.chime();
      Party.burstAt(yesBtn, 1.4);
      setTimeout(() => Party.sideCannons(), 250);
      setTimeout(() => Deck.goTo(2), 1150);
    }

    function bind() {
      // Desktop: hovering anywhere near it scares it away
      noBtn.addEventListener('mouseenter', scatter);
      noBtn.addEventListener('click', (e) => { e.preventDefault(); scatter(); });
      noBtn.addEventListener('touchstart', (e) => { e.preventDefault(); scatter(); }, { passive: false });
      // Moving the mouse over it (fast moves can slip past mouseenter)
      noBtn.addEventListener('mousemove', scatter);

      // Also scare it when the pointer simply gets close — attach to window
      // while the question slide is active (cheap distance check).
      window.addEventListener('mousemove', (e) => {
        if (celebrating || Deck.current !== 1) return;
        const r = noBtn.getBoundingClientRect();
        if (!r.width) return;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (Math.hypot(e.clientX - cx, e.clientY - cy) < Math.max(r.width, r.height) * 1.1 + 40) {
          scatter();
        }
      });

      yesBtn.addEventListener('click', celebrate);
    }

    /** Reset state each time the question slide is (re)visited. */
    function reset() {
      attempts = 0;
      celebrating = false;
      hint.textContent = '';
      hint.style.color = '';
      noBtn.style.position = '';
      noBtn.style.left = '';
      noBtn.style.top = '';
      noBtn.style.zIndex = '';
      noBtn.style.fontSize = '';
    }

    return { reset, bind };
  })();

  /* ----------------------------------------------------------
     7 · Gallery — memory-lane carousel
     ---------------------------------------------------------- */
  const Gallery = (() => {
    const track = $('#gallery-track');
    const prevArrow = $('#gallery-prev');
    const nextArrow = $('#gallery-next');
    const dotsWrap = $('#gallery-dots');
    if (!track) return { isOpen: () => false };

    const cards = $$('.memory', track);
    let active = 0;

    function scrollTo(index, smooth = true) {
      active = clamp(index, 0, cards.length - 1);
      // Align the active card to the centre of the track
      const card = cards[active];
      if (card) {
        const target = card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2;
        track.scrollTo({ left: Math.max(target, 0), behavior: smooth ? 'smooth' : 'auto' });
      }
      renderDots();
    }

    function renderDots() {
      $$('#gallery-dots button').forEach((d, i) => d.classList.toggle('is-active', i === active));
    }

    function buildDots() {
      cards.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Show photo ${i + 1}`);
        dot.addEventListener('click', () => { Sound.click(); scrollTo(i); });
        dotsWrap.appendChild(dot);
      });
      renderDots();
    }

    function bind() {
      prevArrow.addEventListener('click', () => { Sound.click(); scrollTo(active - 1); });
      nextArrow.addEventListener('click', () => { Sound.click(); scrollTo(active + 1); });

      // Keep dots in sync with manual scrolling / swiping on the track
      let scrollTimer = null;
      track.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const center = track.scrollLeft + track.clientWidth / 2;
          let best = 0, bestDist = Infinity;
          cards.forEach((card, i) => {
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            const dist = Math.abs(cardCenter - center);
            if (dist < bestDist) { bestDist = dist; best = i; }
          });
          active = best;
          renderDots();
        }, 90);
      }, { passive: true });

      // Keyboard: left/right arrows browse photos while this slide is active
      document.addEventListener('keydown', (e) => {
        if (Deck.current !== 2) return;
        if (e.key === 'ArrowRight') { e.stopPropagation(); scrollTo(active + 1); }
        if (e.key === 'ArrowLeft') { e.stopPropagation(); scrollTo(active - 1); }
      });
    }

    function init() {
      buildDots();
      bind();
    }

    return { init, isOpen: () => Deck.current === 2 };
  })();

  /* ----------------------------------------------------------
     8 · Letter — typing animation
     ---------------------------------------------------------- */
  const Letter = (() => {
    const textEl = $('#typed-text');
    const cursorEl = $('#typed-cursor');
    const skipEl = $('#letter-skip');
    const letterEl = $('.letter');
    const doneBtn = $('#to-cake-btn');
    if (!textEl) return { start() {}, finish() {} };

    const MESSAGE =
`You know, some people make the world brighter just by being in it and you? You're one of those rare souls.

Thank you for every laugh, every late-night talk, and every ordinary moment that somehow turned into a memory I'll keep forever.

Today, the whole universe is celebrating you. So here's to another year of you being unapologetically, wonderfully YOU.

Happy Birthday! Meekiiiiii🎂✨`;

    let typing = false;
    let timer = null;
    let idx = 0;

    function finish() {
      clearTimeout(timer);
      typing = false;
      textEl.textContent = MESSAGE;
      cursorEl.classList.add('is-done');
      skipEl.classList.add('is-hidden');
      doneBtn.hidden = false;
    }

    function typeNext() {
      if (!typing) return;
      if (idx >= MESSAGE.length) {
        typing = false;
        cursorEl.classList.add('is-done');
        skipEl.classList.add('is-hidden');
        doneBtn.hidden = false;
        Party.burstAt(letterEl, 0.5);
        return;
      }
      const ch = MESSAGE[idx];
      textEl.textContent += ch;
      idx++;

      // Pause a little longer after sentence endings
      let delay = rand(14, 34);
      if ('.!?'.includes(ch)) delay = 380;
      else if (ch === ',' || ch === '—') delay = 200;
      else if (ch === '\n') delay = 260;
      timer = setTimeout(typeNext, delay);
    }

    function start() {
      clearTimeout(timer);
      textEl.textContent = '';
      cursorEl.classList.remove('is-done');
      skipEl.classList.remove('is-hidden');
      doneBtn.hidden = true;
      idx = 0;

      if (reduceMotion) { finish(); return; }
      typing = true;
      timer = setTimeout(typeNext, 600);
    }

    function bind() {
      letterEl.addEventListener('click', () => {
        if (typing) finish();
      });
    }

    return { start, bind, finish };
  })();

  /* ----------------------------------------------------------
     9 · Crossword — "Meekie's 21st Birthday" themed puzzle
     ---------------------------------------------------------- */
  const Crossword = (() => {
    const gridEl = $('#cw-grid');
    if (!gridEl) return { isOpen: () => false, reset() {}, onEnter() {}, onLeave() {} };

    /* The birthday star's name — shown in the win message.
       (Also appears as the MEEKIE entry in the grid below.) */
    const NAME = 'MEEKIE';

    /* ------------------------------------------------------------------
       PUZZLE DATA
       '.' = blank square · letters = the solution.
       Layout generated with an interlocking solver, so every crossing
       letter matches. To customise, edit the words + clues (entries)
       together with the grid rows.
       ------------------------------------------------------------------ */
    const ROWS = [
      'BIRTHDAY.W',
      '.....A...I',
      '...CANDLES',
      '.....C...H',
      '.CONFETTI.',
      '.A.....W..',
      '.K..G..E..',
      'MEEKIE.N..',
      '....F..T..',
      '.PARTY.Y..',
      '....S.....',
    ];

    const ENTRIES = [
      { word: 'BIRTHDAY', row: 0, col: 0, dir: 'across', clue: 'The day this whole site is celebrating 🎂' },
      { word: 'DANCE',    row: 0, col: 5, dir: 'down',   clue: 'What your feet do when the birthday playlist kicks in' },
      { word: 'WISH',     row: 0, col: 9, dir: 'down',   clue: 'Close your eyes, then make one ✨' },
      { word: 'CANDLES',  row: 2, col: 3, dir: 'across', clue: 'Blow these out before you make that wish' },
      { word: 'CONFETTI', row: 4, col: 1, dir: 'across', clue: 'The colourful chaos that falls when you hit “Yes”' },
      { word: 'CAKE',     row: 4, col: 1, dir: 'down',   clue: 'Frosted, layered, and strictly for today' },
      { word: 'TWENTY',   row: 4, col: 7, dir: 'down',   clue: 'Your Current age' },
      { word: 'GIFTS',    row: 6, col: 4, dir: 'down',   clue: 'Wrapped surprises waiting to be opened 🎁' },
      { word: 'MEEKIE',   row: 7, col: 0, dir: 'across', clue: 'The birthday star that’s you! 💖' },
      { word: 'PARTY',    row: 9, col: 1, dir: 'across', clue: 'What is happening right here, right now 🎉' },
    ];

    const ROW_COUNT = ROWS.length;
    const COL_COUNT = ROWS[0].length;

    /* ---------- build the model ---------- */
    const solution = new Map(); // "r,c" -> letter
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch !== '.') solution.set(`${r},${c}`, ch);
      });
    });
    const solutionIndex = new Map([...solution.keys()].map((k, i) => [k, i]));

    ENTRIES.forEach((entry) => {
      entry.cells = [];
      for (let i = 0; i < entry.word.length; i++) {
        entry.cells.push(
          entry.dir === 'across' ? `${entry.row},${entry.col + i}` : `${entry.row + i},${entry.col}`
        );
      }
    });

    // Standard crossword numbering (row-major scan of starting squares)
    const startsByCell = new Map();
    ENTRIES.forEach((e) => {
      if (!startsByCell.has(e.cells[0])) startsByCell.set(e.cells[0], []);
      startsByCell.get(e.cells[0]).push(e);
    });
    let counter = 0;
    for (let r = 0; r < ROW_COUNT; r++) {
      for (let c = 0; c < COL_COUNT; c++) {
        const key = `${r},${c}`;
        if (!startsByCell.has(key)) continue;
        counter++;
        startsByCell.get(key).forEach((e) => { e.num = counter; });
      }
    }

    /* ---------- state & elements ---------- */
    const entered = new Map(); // "r,c" -> letter
    const cellEls = new Map();
    const clueEls = new Map(); // entry -> button
    let selected = null;
    let dir = 'across';
    let solved = false;

    const statusEl = $('#cw-status');
    const inputEl = $('#cw-input');
    const winEl = $('#cw-win');
    const nextBtn = $('#cw-next');
    const skipBtn = $('#cw-skip');
    const toolbar = $('.cw-toolbar');
    const isOpen = () => Deck.current === 4;

    const entryAt = (key, direction) =>
      ENTRIES.find((e) => e.dir === direction && e.cells.includes(key));

    /* ---------- build the DOM ---------- */
    function buildGrid() {
      gridEl.style.gridTemplateColumns = `repeat(${COL_COUNT}, var(--cell))`;
      gridEl.innerHTML = '';
      for (let r = 0; r < ROW_COUNT; r++) {
        for (let c = 0; c < COL_COUNT; c++) {
          const key = `${r},${c}`;
          if (!solution.has(key)) {
            const blank = document.createElement('div');
            blank.className = 'cw-cell cw-cell--blank';
            blank.setAttribute('aria-hidden', 'true');
            gridEl.appendChild(blank);
            continue;
          }
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cw-cell';
          btn.dataset.key = key;
          btn.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);

          if (startsByCell.has(key)) {
            const num = document.createElement('span');
            num.className = 'cw-cell__num';
            num.textContent = startsByCell.get(key)[0].num;
            btn.appendChild(num);
          }
          const letterEl = document.createElement('span');
          letterEl.className = 'cw-cell__letter';
          btn.appendChild(letterEl);

          btn.addEventListener('click', () => onCellClick(key));
          gridEl.appendChild(btn);
          cellEls.set(key, btn);
        }
      }
    }

    function buildClues() {
      const acrossList = $('#cw-across');
      const downList = $('#cw-down');
      acrossList.innerHTML = '';
      downList.innerHTML = '';

      const addClue = (entry, parent) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cw-clue';
        const numSpan = document.createElement('span');
        numSpan.className = 'cw-clue__num';
        numSpan.textContent = entry.num;
        const textSpan = document.createElement('span');
        textSpan.textContent = entry.clue;
        btn.append(numSpan, textSpan);
        btn.addEventListener('click', () => onClueClick(entry));
        li.appendChild(btn);
        parent.appendChild(li);
        clueEls.set(entry, btn);
      };

      ENTRIES.filter((e) => e.dir === 'across').sort((a, b) => a.num - b.num)
        .forEach((e) => addClue(e, acrossList));
      ENTRIES.filter((e) => e.dir === 'down').sort((a, b) => a.num - b.num)
        .forEach((e) => addClue(e, downList));
    }

    /* ---------- rendering ---------- */
    function renderLetters() {
      cellEls.forEach((el, key) => {
        el.querySelector('.cw-cell__letter').textContent = entered.get(key) || '';
        el.classList.toggle('is-filled', entered.has(key));
      });
    }

    function paintSelection() {
      cellEls.forEach((el) => el.classList.remove('is-word', 'is-active'));
      clueEls.forEach((el) => el.classList.remove('is-active'));
      if (!selected || solved) return;

      const entry = entryAt(selected, dir);
      if (!entry) return;
      entry.cells.forEach((key) => cellEls.get(key)?.classList.add('is-word'));
      cellEls.get(selected)?.classList.add('is-active');

      const clueEl = clueEls.get(entry);
      if (clueEl) {
        clueEl.classList.add('is-active');
        clueEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    function updateProgress() {
      let done = 0;
      ENTRIES.forEach((entry) => {
        const complete = entry.cells.every((k) => entered.has(k));
        clueEls.get(entry)?.classList.toggle('is-done', complete);
        if (complete) done++;
      });
      statusEl.textContent = `${done} / ${ENTRIES.length} words`;
    }

    function focusInput() {
      if (!inputEl) return;
      try { inputEl.focus({ preventScroll: true }); } catch { inputEl.focus(); }
    }

    /* ---------- interaction ---------- */
    function selectCell(key, preferDir) {
      if (solved || !solution.has(key)) return;
      const across = entryAt(key, 'across');
      const down = entryAt(key, 'down');
      if (!across && !down) return;

      if (preferDir === 'across' && across) dir = 'across';
      else if (preferDir === 'down' && down) dir = 'down';
      else if (!entryAt(key, dir)) dir = across ? 'across' : 'down';

      selected = key;
      paintSelection();
      focusInput();
    }

    function onCellClick(key) {
      if (solved) return;
      // Clicking the selected square toggles Across ↔ Down
      if (selected === key) {
        const other = dir === 'across' ? 'down' : 'across';
        if (entryAt(key, other)) {
          dir = other;
          paintSelection();
          return;
        }
      }
      selectCell(key, dir);
    }

    function onClueClick(entry) {
      if (solved) return;
      dir = entry.dir;
      selected = entry.cells.find((k) => !entered.has(k)) || entry.cells[0];
      paintSelection();
      focusInput();
    }

    function typeLetter(letter) {
      if (solved) return;
      if (!selected) {
        dir = ENTRIES[0].dir;
        selected = ENTRIES[0].cells[0];
      }
      const entry = entryAt(selected, dir);
      if (!entry) return;

      entered.set(selected, letter);
      renderLetters();
      updateProgress();

      const i = entry.cells.indexOf(selected);
      if (i < entry.cells.length - 1) selected = entry.cells[i + 1];
      paintSelection();
      maybeComplete();
    }

    function deleteLetter() {
      if (solved || !selected) return;
      const entry = entryAt(selected, dir);
      if (!entry) return;

      if (entered.has(selected)) {
        entered.delete(selected);
      } else {
        const i = entry.cells.indexOf(selected);
        if (i > 0) {
          selected = entry.cells[i - 1];
          entered.delete(selected);
        }
      }
      renderLetters();
      updateProgress();
      paintSelection();
    }

    function moveSelection(dr, dc) {
      if (solved) return;
      if (!selected) {
        selectCell(ENTRIES[0].cells[0], ENTRIES[0].dir);
        return;
      }
      dir = dr !== 0 ? 'down' : 'across';
      let [r, c] = selected.split(',').map(Number);
      r += dr;
      c += dc;
      while (r >= 0 && r < ROW_COUNT && c >= 0 && c < COL_COUNT && !solution.has(`${r},${c}`)) {
        r += dr;
        c += dc;
      }
      const key = `${r},${c}`;
      if (solution.has(key)) selectCell(key, dir);
      else paintSelection();
    }

    function nextEntry(step) {
      if (solved) return;
      const ordered = [...ENTRIES].sort((a, b) => a.num - b.num || (a.dir === 'across' ? -1 : 1));
      const currentEntry = selected ? entryAt(selected, dir) : null;
      let index = currentEntry ? ordered.indexOf(currentEntry) : -1;
      index = (index + step + ordered.length) % ordered.length;
      onClueClick(ordered[index]);
    }

    /* ---------- checks & win state ---------- */
    function maybeComplete() {
      if (entered.size < solution.size) return;
      const allCorrect = [...solution].every(([key, letter]) => entered.get(key) === letter);
      if (allCorrect) win();
      else statusEl.textContent = 'All filled — press Check ✓ to spot any mistakes';
    }

    function check() {
      if (solved) return;
      let wrong = 0;
      let blank = 0;
      solution.forEach((letter, key) => {
        const val = entered.get(key);
        if (!val) {
          blank++;
        } else if (val !== letter) {
          wrong++;
          const el = cellEls.get(key);
          el.classList.add('is-wrong');
          setTimeout(() => el.classList.remove('is-wrong'), 900);
        }
      });

      if (!wrong && !blank) { win(); return; }
      if (wrong) statusEl.textContent = `${wrong} letter${wrong === 1 ? '' : 's'} need a rethink 🤔`;
      else statusEl.textContent = `${blank} square${blank === 1 ? '' : 's'} still empty`;
      Sound.click();
    }

    function win() {
      if (solved) return;
      solved = true;
      statusEl.textContent = 'Solved! 🎉';
      winEl.hidden = false;
      if (toolbar) toolbar.hidden = true;
      if (skipBtn) skipBtn.hidden = true;
      if (nextBtn) nextBtn.hidden = false;

      cellEls.forEach((el, key) => {
        el.classList.add('is-solved');
        el.style.setProperty('--i', solutionIndex.get(key));
      });
      paintSelection();
      Sound.fanfare();
      Party.burstAt(gridEl, 2);
      setTimeout(() => Party.sideCannons(), 350);
      setTimeout(() => Party.burstAt(winEl, 1), 700);
    }

    function reveal() {
      if (solved) return;
      solution.forEach((letter, key) => entered.set(key, letter));
      renderLetters();
      updateProgress();
      win();
    }

    function clearAll() {
      if (solved) return;
      entered.clear();
      renderLetters();
      updateProgress();
      statusEl.textContent = `0 / ${ENTRIES.length} words`;
      cellEls.forEach((el) => el.classList.remove('is-wrong'));
      Sound.pop();
    }

    /** Full reset — used by the replay button on the cake slide. */
    function reset() {
      entered.clear();
      solved = false;
      selected = null;
      dir = 'across';
      renderLetters();
      updateProgress();
      cellEls.forEach((el) => {
        el.classList.remove('is-solved', 'is-wrong', 'is-word', 'is-active');
        el.style.removeProperty('--i');
      });
      winEl.hidden = true;
      if (toolbar) toolbar.hidden = false;
      if (skipBtn) skipBtn.hidden = false;
      if (nextBtn) nextBtn.hidden = true;
      statusEl.textContent = `0 / ${ENTRIES.length} words`;
    }

    /* ---------- key & input handling ---------- */
    function bind() {
      $('#cw-check')?.addEventListener('click', check);
      $('#cw-reveal')?.addEventListener('click', reveal);
      $('#cw-clear')?.addEventListener('click', clearAll);

      // Physical keyboards (keydown bubbles from the hidden input too)
      document.addEventListener('keydown', (e) => {
        if (!isOpen()) return;
        // Never hijack browser/OS shortcuts (Ctrl+R, Cmd+C, Ctrl+V, …)
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;

        // Let Enter activate focused puzzle controls (Check, Clear, Reveal)
        if (k === 'Enter' && e.target.closest('#cw-check, #cw-clear, #cw-reveal')) return;

        if (k === 'Tab') { e.preventDefault(); nextEntry(e.shiftKey ? -1 : 1); return; }
        if (k === 'Backspace') { e.preventDefault(); deleteLetter(); return; }
        if (k === 'Delete') {
          e.preventDefault();
          if (selected) { entered.delete(selected); renderLetters(); updateProgress(); paintSelection(); }
          return;
        }
        if (k === 'ArrowLeft') { e.preventDefault(); moveSelection(0, -1); return; }
        if (k === 'ArrowRight') { e.preventDefault(); moveSelection(0, 1); return; }
        if (k === 'ArrowUp') { e.preventDefault(); moveSelection(-1, 0); return; }
        if (k === 'ArrowDown') { e.preventDefault(); moveSelection(1, 0); return; }
        if (k === 'Enter') {
          e.preventDefault();
          if (selected) {
            const other = dir === 'across' ? 'down' : 'across';
            if (entryAt(selected, other)) { dir = other; paintSelection(); }
          }
          return;
        }
        if (/^[a-zA-Z]$/.test(k)) {
          e.preventDefault();
          typeLetter(k.toUpperCase());
        }
      });

      // Mobile / IME keyboards: some don't emit usable keydown keys
      inputEl?.addEventListener('input', () => {
        if (!isOpen() || solved) { inputEl.value = ''; return; }
        const chars = inputEl.value.toUpperCase().replace(/[^A-Z]/g, '');
        inputEl.value = '';
        [...chars].forEach(typeLetter);
      });

      inputEl?.addEventListener('paste', (e) => {
        if (!isOpen() || solved) return;
        const text = (e.clipboardData?.getData('text') || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (!text) return;
        e.preventDefault();
        [...text].forEach(typeLetter);
      });

      // Keep focus stable when clicking a square
      gridEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.cw-cell:not(.cw-cell--blank)')) e.preventDefault();
      });

      // Set the name in the win message
      const winName = $('#cw-win-name');
      if (winName) winName.textContent = NAME;
    }

    function init() {
      buildGrid();
      buildClues();
      renderLetters();
      updateProgress();
      bind();
    }

    function onLeave() {
      inputEl?.blur();
    }

    return { init, isOpen, reset, onEnter() {}, onLeave };
  })();

  /* ----------------------------------------------------------
     10 · Cake — interactive candles + grand finale
     ---------------------------------------------------------- */
  const Cake = (() => {
    const cakeEl = $('#cake');
    const candlesGroup = $('#candles');
    const subtitle = $('#cake-subtitle');
    const finale = $('#finale');
    const replayBtn = $('#replay-btn');
    if (!cakeEl || !candlesGroup) return { reset() {} };

    const CANDLE_COUNT = 5;
    const CANDLE_COLORS = ['#ff5d8f', '#ffd166', '#a06cd5', '#7bdff2', '#ff8fab'];
    let lit = 0;

    function buildCandles() {
      candlesGroup.innerHTML = '';
      lit = 0;
      const startCx = 200 - ((CANDLE_COUNT - 1) * 34) / 2;
      for (let i = 0; i < CANDLE_COUNT; i++) {
        const cx = startCx + i * 34;
        const color = CANDLE_COLORS[i % CANDLE_COLORS.length];
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'candle');
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', `Blow out candle ${i + 1}`);
        g.innerHTML = `
          <rect class="candle__body" x="${cx - 7}" y="76" width="14" height="46" rx="5" fill="${color}"></rect>
          <rect x="${cx - 7}" y="86" width="14" height="6" fill="rgba(255,255,255,0.55)"></rect>
          <rect x="${cx - 7}" y="104" width="14" height="6" fill="rgba(255,255,255,0.55)"></rect>
          <line x1="${cx}" y1="76" x2="${cx}" y2="66" stroke="#4a3b63" stroke-width="2"></line>
          <g class="candle__flame" style="animation-delay:${(i * 0.13).toFixed(2)}s">
            <path d="M ${cx} 34 C ${cx + 9} 50, ${cx + 7} 66, ${cx} 66 C ${cx - 7} 66, ${cx - 9} 50, ${cx} 34 Z" fill="#ffb703"></path>
            <path d="M ${cx} 46 C ${cx + 4.5} 54, ${cx + 3.5} 63, ${cx} 63 C ${cx - 3.5} 63, ${cx - 4.5} 54, ${cx} 46 Z" fill="#fff3b0"></path>
          </g>
          <circle class="candle__smoke" cx="${cx}" cy="60" r="4" fill="rgba(255,255,255,0.5)"></circle>
        `;
        g.addEventListener('click', () => blowOut(g));
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); blowOut(g); }
        });
        candlesGroup.appendChild(g);
      }
    }

    function blowOut(candle) {
      if (candle.classList.contains('is-out')) return;
      candle.classList.add('is-out');
      candle.setAttribute('aria-label', 'Candle blown out');
      lit++;
      Sound.blow();

      if (lit === CANDLE_COUNT) onAllOut();
      else subtitle.textContent = `${CANDLE_COUNT - lit} candle${CANDLE_COUNT - lit === 1 ? '' : 's'} to go… 🕯️`;
    }

    function onAllOut() {
      subtitle.textContent = 'Wish granted! 🎉';
      Sound.fanfare();
      Party.grandFinale(2400);
      setTimeout(() => { finale.hidden = false; }, 900);
    }

    function reset() {
      buildCandles();
      subtitle.textContent = 'Tap each flame 🕯️';
      finale.hidden = true;
    }

    function bind() {
      replayBtn.addEventListener('click', () => {
        Sound.click();
        reset();
        Crossword.reset();
        Deck.goTo(0);
      });
    }

    function init() {
      buildCandles();
      bind();
    }

    return { init, reset };
  })();

  /* ----------------------------------------------------------
     11 · INIT — wire everything up
     ---------------------------------------------------------- */
  function init() {
    Background.start();
    Deck.init();
    Gallery.init();
    Letter.bind();
    Crossword.init();
    Cake.init();
    NoButton.bind();

    // Slide lifecycle hooks
    Deck.hooks.enter[0] = () => Party.sideCannons();
    Deck.hooks.enter[1] = () => NoButton.reset();
    Deck.hooks.enter[3] = () => Letter.start();
    Deck.hooks.enter[4] = () => Crossword.onEnter();
    Deck.hooks.leave[4] = () => Crossword.onLeave();
    Deck.hooks.enter[5] = () => Cake.reset();
    Deck.hooks.leave[1] = () => NoButton.reset();

    // Welcome celebration
    setTimeout(() => Party.sideCannons(), 700);

    // Sound toggle
    const soundBtn = $('#sound-toggle');
    soundBtn.addEventListener('click', () => {
      Sound.enabled = !Sound.enabled;
      soundBtn.classList.toggle('is-muted', !Sound.enabled);
      soundBtn.setAttribute('aria-label', Sound.enabled ? 'Mute sound' : 'Unmute sound');
      if (Sound.enabled) Sound.click();
    });

    // First user gesture unlocks WebAudio on strict browsers
    document.addEventListener('pointerdown', function unlock() {
      Sound.click();
      document.removeEventListener('pointerdown', unlock);
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
