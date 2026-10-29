// Reader: one page at a time, in order (oldest or newest first, never shuffled).
//
// Pages come from /series/<series>/pages.json, which `npm run add-pages`
// writes. The zoom engine is the one from the old homepage lightbox, moved
// into the reader: pinch, wheel, double-tap, drag to pan while zoomed.
// Swipes and taps only turn pages when the page is not zoomed in.

(() => {
  'use strict';

  const root = document.querySelector('.reader');
  const series = root.dataset.series;
  const kind = root.dataset.kind || 'ongoing';   // ongoing | archive | sample (see series.json)
  const base = `/series/${series}/`;

  const stage = root.querySelector('.r-stage');
  const img = root.querySelector('.r-img');
  const loading = root.querySelector('.r-loading');
  const endCard = root.querySelector('.r-end');
  const endTitle = endCard.querySelector('h2');
  const againBtn = endCard.querySelector('.again');
  const prevBtn = root.querySelector('.r-arrow.prev');
  const nextBtn = root.querySelector('.r-arrow.next');
  const orderBtn = root.querySelector('#order');
  const groundBtns = [...root.querySelectorAll('[data-ground]')].filter(b => b.tagName === 'BUTTON');
  const where = root.querySelector('.r-count .where');
  const hint = root.querySelector('.r-count .hint');
  const bar = root.querySelector('.r-progress i');
  const status = root.querySelector('.r-status');
  const notice = root.querySelector('.r-new');
  const title = root.querySelector('.r-title span:last-child').textContent.trim();
  const caughtUp = endTitle.textContent;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(hover: none)');

  // --- per-viewer memory (optional: the reader works without it) ----------
  const PREFS_KEY = 'reader:prefs';
  const SERIES_KEY = `reader:${series}`;
  const load = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
  const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
  const prefs = Object.assign({ ground: 'paper', order: 'asc' }, load(PREFS_KEY));
  const memory = load(SERIES_KEY);   // { last: pageKey | 'end', known: pageCount }

  let pages = [];
  let numbered = 0;                 // pages with a number (covers don't count)
  // Only ongoing series can be read newest first; the rest always start at the start.
  let order = orderBtn && prefs.order === 'desc' ? 'desc' : 'asc';
  let pos = 0;                      // index into seq(); seq().length means the end card
  const seq = () => (order === 'asc' ? pages : [...pages].reverse());
  const atEnd = () => pos >= pages.length;
  // A page is known by its number, or by its id for covers ("cover", "back").
  const keyOf = p => p.id ?? p.n;
  const nameOf = p => p.label ?? `page ${p.n}`;
  const HASH = /^#(\d+|cover|back|end)$/;
  const parseKey = k => (/^\d+$/.test(k) ? Number(k) : k);

  // --- ground (paper / gallery) -------------------------------------------
  function setGround(g) {
    root.dataset.ground = g;
    groundBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ground === g)));
    prefs.ground = g; save(PREFS_KEY, prefs);
  }
  groundBtns.forEach(b => b.addEventListener('click', () => setGround(b.dataset.ground)));
  setGround(prefs.ground === 'gallery' ? 'gallery' : 'paper');

  // --- reading order ------------------------------------------------------
  function renderOrder() {
    if (!orderBtn) return;
    const label = order === 'asc' ? 'Oldest first' : 'Newest first';
    const other = order === 'asc' ? 'newest first' : 'oldest first';
    orderBtn.firstChild.textContent = label + ' ';
    orderBtn.setAttribute('aria-label', `Reading order: ${label.toLowerCase()}. Switch to ${other}.`);
    endTitle.textContent = order === 'asc' ? caughtUp : 'You’ve reached page 1.';
    againBtn.textContent = order === 'asc' ? 'Back to page 1' : 'Back to the newest page';
  }
  orderBtn?.addEventListener('click', () => {
    const current = atEnd() ? null : keyOf(seq()[pos]);
    order = order === 'asc' ? 'desc' : 'asc';
    prefs.order = order; save(PREFS_KEY, prefs);
    renderOrder();
    go(current == null ? pages.length : indexOf(current), { quiet: true });
  });
  const indexOf = k => Math.max(0, seq().findIndex(p => keyOf(p) === k));

  // --- zoom engine --------------------------------------------------------
  const MAX_SCALE = 8;
  let scale = 1, tx = 0, ty = 0, fullFor = null;

  function apply() {
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    img.classList.toggle('zoomed', scale > 1);
    renderHint();
  }
  function clampPan() {
    const sw = img.clientWidth * scale, sh = img.clientHeight * scale;
    const maxX = Math.max(0, (sw - stage.clientWidth) / 2 + 40);
    const maxY = Math.max(0, (sh - stage.clientHeight) / 2 + 40);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
    if (scale <= 1.02) { scale = 1; tx = 0; ty = 0; }
  }
  // Zoom keeping the stage point (px, py) over the same spot of the page.
  function zoomAt(px, py, next, smooth) {
    if (atEnd() || img.hidden) return;
    next = Math.min(MAX_SCALE, Math.max(1, next));
    const r = stage.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    px -= r.left; py -= r.top;
    const f = next / scale;
    tx = (px - cx) - f * ((px - cx) - tx);
    ty = (py - cy) - f * ((py - cy) - ty);
    scale = next;
    clampPan();
    if (smooth && !reducedMotion.matches) {
      img.classList.add('smooth');
      setTimeout(() => img.classList.remove('smooth'), 200);
    }
    apply();
    if (scale > 1) loadFull();
  }
  function resetZoom() { scale = 1; tx = 0; ty = 0; apply(); }
  const zoomCenter = factor => {
    const r = stage.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, scale * factor, true);
  };

  // The full-resolution copy loads only once someone zooms in.
  function loadFull() {
    const page = seq()[pos];
    if (!page || fullFor === keyOf(page)) return;
    fullFor = keyOf(page);
    const hi = new Image();
    hi.onload = () => { if (!atEnd() && seq()[pos] === page) img.src = hi.src; };
    hi.src = base + page.full;
  }

  function renderHint() {
    if (atEnd()) { hint.textContent = ''; return; }
    if (scale > 1) hint.textContent = coarse.matches ? 'Double-tap to zoom out' : 'Double-click to zoom out';
    else hint.textContent = coarse.matches ? 'Double-tap to zoom' : 'Double-click or scroll to zoom';
  }

  // --- turning pages ------------------------------------------------------
  function go(next, { quiet = false } = {}) {
    const s = seq();
    pos = Math.max(0, Math.min(s.length, next));
    resetZoom();
    fullFor = null;

    if (atEnd()) {
      img.hidden = true;
      endCard.hidden = false;
      where.innerHTML = `<b>End</b> &middot; ${numbered} pages`;
      memory.last = 'end';
      history.replaceState(null, '', '#end');
      wake(true);
    } else {
      const page = s[pos];
      endCard.hidden = true;
      img.hidden = false;
      img.width = page.w;
      img.height = page.h;
      img.alt = `${title}, ${nameOf(page)}`;
      img.src = base + page.web;
      where.innerHTML = page.label ? `<b>${page.label}</b>` : `<b>${page.n}</b> / ${numbered}`;
      memory.last = keyOf(page);
      history.replaceState(null, '', '#' + keyOf(page));
      // warm up the neighbours so the next turn is instant
      [s[pos + 1], s[pos - 1]].forEach(p => { if (p) new Image().src = base + p.web; });
    }
    save(SERIES_KEY, memory);
    prevBtn.disabled = pos === 0;
    nextBtn.disabled = atEnd();
    bar.style.width = (Math.min(pos + 1, s.length) / s.length * 100) + '%';
    renderHint();
    if (!quiet) status.textContent = atEnd() ? endTitle.textContent
      : s[pos].label ?? `Page ${s[pos].n} of ${numbered}`;
  }
  const next = () => { if (!atEnd()) go(pos + 1); };
  const prev = () => { if (pos > 0) go(pos - 1); };

  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  againBtn.addEventListener('click', () => { go(0); stage.focus(); });

  // --- keyboard -----------------------------------------------------------
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select')) return;
    const onButton = e.target.closest('button, a');
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': next(); break;
      case 'ArrowLeft': case 'PageUp': prev(); break;
      case ' ': if (onButton) return; next(); break;
      case 'Home': go(0); break;
      case 'End': go(pages.length - 1); break;
      case '+': case '=': zoomCenter(1.5); break;
      case '-': case '_': zoomCenter(1 / 1.5); break;
      case '0': case 'Escape': resetZoom(); break;
      default: return;
    }
    e.preventDefault();
    wake();
  });

  // --- wheel: zoom; a sideways trackpad swipe turns the page --------------
  let sideways = 0, sidewaysLock = 0;
  stage.addEventListener('wheel', e => {
    if (atEnd()) return;
    e.preventDefault();
    if (scale === 1 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (Date.now() < sidewaysLock) return;
      sideways += e.deltaX;
      if (Math.abs(sideways) > 80) {
        sideways > 0 ? next() : prev();
        sideways = 0; sidewaysLock = Date.now() + 700;
      }
      return;
    }
    sideways = 0;
    zoomAt(e.clientX, e.clientY, scale * Math.exp(-e.deltaY * 0.0018), false);
  }, { passive: false });

  // --- pointer gestures ---------------------------------------------------
  const pointers = new Map();
  let pinch = null, drag = null, tap = null, lastTap = { t: 0, x: 0, y: 0 }, tapTimer = 0;
  const interactive = t => t.closest('button, a, .r-end, .r-new');

  stage.addEventListener('pointerdown', e => {
    if (interactive(e.target) || atEnd()) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null; tap = null;
    } else if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, tx, ty };
      tap = { x: e.clientX, y: e.clientY, t: Date.now(), type: e.pointerType };
      if (scale > 1) stage.classList.add('dragging');
    }
  });

  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      zoomAt(pinch.cx, pinch.cy, pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), false);
    } else if (pointers.size === 1 && drag && scale > 1) {
      tx = drag.tx + (e.clientX - drag.x);
      ty = drag.ty + (e.clientY - drag.y);
      clampPan(); apply();
    }
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
  });

  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    stage.classList.remove('dragging');

    // Swipe: only when not zoomed in, and clearly sideways.
    if (drag && scale === 1 && e.type === 'pointerup') {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        dx < 0 ? next() : prev();
        drag = null; tap = null;
        return;
      }
    }
    drag = null;

    if (tap && e.type === 'pointerup' && Date.now() - tap.t < 350) {
      const now = Date.now();
      const double = now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40;
      clearTimeout(tapTimer);
      if (double) {
        zoomAt(tap.x, tap.y, scale > 1 ? 1 : 2.5, true);
        lastTap = { t: 0, x: 0, y: 0 };
      } else {
        lastTap = { t: now, x: tap.x, y: tap.y };
        const t = tap;
        // Wait a moment so a double-tap can still become a zoom.
        tapTimer = setTimeout(() => singleTap(t), 260);
      }
    }
    tap = null;
  }
  stage.addEventListener('pointerup', pointerEnd);
  stage.addEventListener('pointercancel', pointerEnd);

  function singleTap(t) {
    if (scale > 1) return;                 // zoomed in: taps never turn the page
    const r = stage.getBoundingClientRect();
    const x = (t.x - r.left) / r.width;
    if (t.type === 'mouse') {
      x < 0.5 ? prev() : next();
    } else if (x < 0.3) {
      prev();
    } else if (x > 0.7) {
      next();
    } else {
      root.classList.contains('idle') ? wake() : sleep();
    }
  }

  // Keep iOS Safari from zooming the whole page; the reader does its own zoom.
  document.addEventListener('gesturestart', e => e.preventDefault());
  addEventListener('resize', () => { clampPan(); apply(); });

  // --- controls fade while reading ----------------------------------------
  let idleTimer = 0;
  function sleep() { if (!atEnd()) root.classList.add('idle'); }
  function wake(stay) {
    root.classList.remove('idle');
    clearTimeout(idleTimer);
    if (!stay) idleTimer = setTimeout(sleep, 2600);
  }
  ['pointermove', 'pointerdown', 'focusin'].forEach(ev => root.addEventListener(ev, e => {
    if (ev === 'pointerdown' && e.pointerType !== 'mouse' && !interactive(e.target)) return; // taps are handled above
    wake();
  }, { passive: true }));

  // --- "new pages" notice -------------------------------------------------
  function showNotice(count, firstNew) {
    notice.querySelector('.msg').textContent =
      `${count} new page${count === 1 ? '' : 's'} since your last visit`;
    notice.hidden = false;
    notice.querySelector('.jump').onclick = () => {
      notice.hidden = true;
      go(indexOf(firstNew));
      stage.focus();
    };
    notice.querySelector('.dismiss').onclick = () => { notice.hidden = true; };
  }

  // --- start --------------------------------------------------------------
  function startPos() {
    const m = location.hash.match(HASH);
    if (m) return m[1] === 'end' ? pages.length : indexOf(parseKey(m[1]));
    if (memory.last === 'end') return pages.length;
    if (memory.last != null && pages.some(p => keyOf(p) === memory.last)) return indexOf(memory.last);
    return 0;  // first visit: the first page (or the newest page, if they chose newest first)
  }

  addEventListener('hashchange', () => {
    const m = location.hash.match(HASH);
    if (m) go(m[1] === 'end' ? pages.length : indexOf(parseKey(m[1])));
  });

  renderOrder();
  // Always ask for the latest list, so regular readers never miss this week's page.
  fetch(base + 'pages.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      // pages.json is already in reading order: front cover, numbered pages, back cover.
      pages = data.pages.slice();
      numbered = pages.filter(p => p.n != null).length;
      if (!pages.length) throw new Error('no pages');
      loading.remove();

      const known = memory.known;
      const fresh = kind === 'ongoing' && typeof known === 'number' ? pages.length - known : 0;
      memory.known = pages.length;
      go(startPos(), { quiet: true });
      if (fresh > 0) {
        const firstNew = keyOf(pages[Math.min(known, pages.length - 1)]);
        showNotice(fresh, firstNew);
      }
      wake();
    })
    .catch(() => {
      loading.textContent = 'The pages could not be loaded. Check your connection and refresh the page.';
    });
})();
