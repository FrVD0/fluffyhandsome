// Builds the shelf from /books/books.json.
//   #shelf          full editorial rows (Books page)
//   #shelf-teaser   three covers in a row (homepage)
// Sample pages open in a zoom lightbox (pinch, wheel, double-tap, drag).

(() => {
  'use strict';

  const shelf = document.getElementById('shelf');
  const teaser = document.getElementById('shelf-teaser');
  if (!shelf && !teaser) return;

  const PATREON = 'https://www.patreon.com/fluffyhandsome';

  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids) if (k) n.append(k);
    return n;
  }
  const ph = text => el('span', { class: 'ph', text });
  const arrow = sym => el('span', { class: 'arr', 'aria-hidden': 'true', text: sym });
  const bullet = b => el('span', { class: `bullet ${b.color}`, 'aria-hidden': 'true', text: b.bullet });

  function cover(b) {
    const box = el('div', { class: `cover ${b.shape || 'square'}` });
    if (b.cover) {
      box.append(el('img', { src: b.cover, alt: `Cover of ${b.title}`, loading: 'lazy', decoding: 'async' }));
      return box;
    }
    const p = el('div', { class: `cover-ph ${b.id}`, 'aria-hidden': 'true' });
    if (b.id === 'innersanities') {
      p.append(el('b', { text: 'YOUR UNCLE ATTABOY' }), el('div', { class: 'sq' }), el('h3', { text: b.title }));
    } else {
      p.append(el('small', { text: 'Placeholder cover' }), el('h3', { text: b.title }));
    }
    box.append(p);
    return box;
  }

  function row(b) {
    const soon = b.status === 'coming-soon';
    const text = el('div', { class: 'book-text' });

    const line = el('div', { class: 'line' }, bullet(b));
    if (soon) line.append(el('span', { class: 'tag stripe', text: 'Coming soon' }));
    else if (b.kicker) line.append(el('span', { class: 'label', text: b.kicker }));
    text.append(line, el('h2', { text: b.title }));

    if (b.subtitle) text.append(el('p', { class: 'sub', text: b.subtitle }));
    text.append(el('p', { class: 'blurb' }, b.blurb || ph('Blurb placeholder. Two or three sentences about the book.')));
    if (b.quote) {
      text.append(el('blockquote', {}, `“${b.quote}”`, b.quoteBy ? el('cite', { text: b.quoteBy }) : null));
    }

    if (b.samples && b.samples.length) {
      const strip = el('div', { class: 'samples', role: 'group', 'aria-label': `Sample pages from ${b.title}` });
      b.samples.forEach((s, i) => {
        const btn = el('button', { type: 'button', 'aria-label': `Enlarge sample page ${i + 1}` },
          el('img', { src: s.thumb, alt: `${b.title}, sample page ${i + 1}`, loading: 'lazy', decoding: 'async' }));
        btn.addEventListener('click', () => lightbox.open(s, btn));
        strip.append(btn);
      });
      text.append(strip);
    }

    const specs = [b.specs, b.samples && b.samples.length ? 'Tap a sample to zoom' : ''].filter(Boolean).join(' · ');
    if (specs) text.append(el('p', { class: 'specs', text: specs }));

    const btns = el('div', { class: 'btns' });
    if (soon) {
      btns.append(el('a', { class: 'btn outline', href: PATREON, target: '_blank', rel: 'noopener noreferrer' },
        'Get notified on Patreon ', arrow('→')));
    } else if (b.lulu) {
      btns.append(el('a', { class: 'btn blue', href: b.lulu, target: '_blank', rel: 'noopener noreferrer' },
        'Buy on Lulu ', arrow('↗')));
    } else {
      btns.append(el('span', { class: 'btn outline', 'aria-disabled': 'true' }, ph('Lulu link placeholder')));
    }
    text.append(btns);

    return el('article', { class: 'book', id: b.id, 'aria-labelledby': `${b.id}-h` }, cover(b), text);
  }

  function teaserItem(b) {
    return el('a', { href: `/books/#${b.id}` }, cover(b),
      el('span', { class: 't-name' }, bullet(b), b.title));
  }

  fetch('/books/books.json', { cache: 'no-cache' })
    .then(r => r.json())
    .then(({ books }) => {
      if (shelf) {
        shelf.replaceChildren(...books.map(row));
        shelf.querySelectorAll('.book h2').forEach((h, i) => { h.id = `${books[i].id}-h`; });
        // Arrived from a link like /books/#innersanities: scroll there now the rows exist.
        const target = location.hash && document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView();
      }
      if (teaser) teaser.replaceChildren(...books.map(teaserItem));
    })
    .catch(() => {
      if (shelf) shelf.replaceChildren(el('p', { text: 'The shelf could not be loaded. Refresh the page to try again.' }));
    });

  // --- zoom lightbox (same engine as the reader) ---------------------------
  const lightbox = (() => {
    const box = el('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Enlarged sample page' });
    const img = el('img', { alt: '', draggable: 'false' });
    const close = el('button', { type: 'button', class: 'lb-close', 'aria-label': 'Close', text: '×' });
    const hint = el('p', { class: 'lb-hint', text: 'Pinch, scroll or double-tap to zoom' });
    box.append(img, close, hint);
    document.body.append(box);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let scale = 1, tx = 0, ty = 0, back = null;
    const apply = () => {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.classList.toggle('zoomed', scale > 1);
    };
    function clamp() {
      const maxX = Math.max(0, (img.clientWidth * scale - box.clientWidth) / 2 + 40);
      const maxY = Math.max(0, (img.clientHeight * scale - box.clientHeight) / 2 + 40);
      tx = Math.min(maxX, Math.max(-maxX, tx));
      ty = Math.min(maxY, Math.max(-maxY, ty));
      if (scale <= 1.02) { scale = 1; tx = 0; ty = 0; }
    }
    function zoomAt(px, py, next, smooth) {
      next = Math.min(8, Math.max(1, next));
      const cx = box.clientWidth / 2, cy = box.clientHeight / 2, f = next / scale;
      tx = (px - cx) - f * ((px - cx) - tx);
      ty = (py - cy) - f * ((py - cy) - ty);
      scale = next; clamp();
      if (smooth && !reduced.matches) { img.classList.add('smooth'); setTimeout(() => img.classList.remove('smooth'), 200); }
      apply();
    }
    function open(sample, from) {
      back = from;
      scale = 1; tx = 0; ty = 0; apply();
      img.src = sample.thumb;                     // instant: already on screen
      img.alt = from.querySelector('img').alt;
      const hi = new Image();
      hi.onload = () => { if (box.classList.contains('open')) img.src = hi.src; };
      hi.src = sample.full;
      box.classList.add('open');
      document.body.classList.add('lb-open');
      close.focus();
    }
    function hide() {
      box.classList.remove('open');
      document.body.classList.remove('lb-open');
      img.removeAttribute('src');
      if (back) back.focus();
    }
    close.addEventListener('click', hide);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) hide(); });
    box.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, scale * Math.exp(-e.deltaY * 0.0018), false); }, { passive: false });
    document.addEventListener('gesturestart', e => { if (box.classList.contains('open')) e.preventDefault(); });

    const pts = new Map();
    let pinch = null, pan = null, tap = null, last = { t: 0, x: 0, y: 0 };
    box.addEventListener('pointerdown', e => {
      if (e.target === close) return;
      box.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        pan = null; tap = null;
      } else if (pts.size === 1) {
        pan = { x: e.clientX, y: e.clientY, tx, ty };
        tap = { x: e.clientX, y: e.clientY, t: Date.now(), target: e.target };
      }
    });
    box.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        zoomAt(pinch.cx, pinch.cy, pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, false);
      } else if (pts.size === 1 && pan && scale > 1) {
        tx = pan.tx + (e.clientX - pan.x); ty = pan.ty + (e.clientY - pan.y); clamp(); apply();
      }
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
    });
    function end(e) {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size) return;
      pan = null;
      if (tap && e.type === 'pointerup' && Date.now() - tap.t < 350) {
        const now = Date.now();
        if (now - last.t < 320 && Math.hypot(tap.x - last.x, tap.y - last.y) < 40) {
          zoomAt(tap.x, tap.y, scale > 1 ? 1 : 2.5, true);
          last = { t: 0, x: 0, y: 0 };
        } else {
          if (tap.target === box && scale === 1) hide();   // tap outside the page: close
          last = { t: now, x: tap.x, y: tap.y };
        }
      }
      tap = null;
    }
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    return { open };
  })();
})();
