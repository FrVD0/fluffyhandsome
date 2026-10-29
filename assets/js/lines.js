// /read/ menu: Fancy City Transit. Every title is a line, every page a stop.
//
// Built from /read/lines.json (written by `npm run add-pages`) plus each
// reader's saved place in this browser (the reader keeps it under
// reader:<series>). Wide screens get the full service map; every line also
// gets a panel with a door-strip map, which narrow screens show instead.
// Lines run straight, then bend at 45 degrees into Fancy City Central.

(() => {
  'use strict';

  const root = document.getElementById('transit');
  const KIND = { ongoing: 'Weekly service', archive: 'Full archive', sample: 'Preview service' };
  const COLOR = { red: 'var(--red)', blue: 'var(--blue)', slime: 'var(--slime)' };
  const PATREON = 'https://www.patreon.com/fluffyhandsome';
  const EVERY = 20;        // long lines show every 20th page as a stop
  const LONG = 24;         // ...once they have more numbered pages than this

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const saved = series => { try { return JSON.parse(localStorage.getItem(`reader:${series}`)) || {}; } catch { return {}; } };
  const isNum = s => typeof s.key === 'number';
  const nameOf = (line, s) => s.label ?? `${cap(line.unit)} ${s.key}`;
  const arrow = sym => `<span class="arr" aria-hidden="true">${sym}</span>`;

  // The stops a line draws (each keeps its index i into the full list).
  function shown(line) {
    const all = line.stops.map((s, i) => ({ ...s, i }));
    const numbered = all.filter(isNum);
    if (numbered.length <= LONG) return all;
    const lastN = numbered[numbered.length - 1].key;
    return all.filter(s => !isNum(s) || s.key === 1 || s.key % EVERY === 0 || s.key === lastN);
  }
  const shortLabel = s => (s.key === 'back' ? 'Back' : s.label ?? String(s.key));

  // Where this browser left off on a line, if anywhere.
  function placeOf(line) {
    const last = saved(line.series).last;
    if (last == null) return null;
    const stops = line.stops;
    const newest = [...stops].reverse().find(isNum);
    const atEnd = last === 'end' || (line.kind === 'ongoing' && newest && last === newest.key);
    if (atEnd) {
      return {
        i: stops.length - 1, key: last, end: true,
        text: line.kind === 'ongoing' ? `Caught up · ${line.unit} ${newest.key}` : 'Finished · end of the line',
      };
    }
    const i = stops.findIndex(s => s.key === last);
    if (i < 0) return null;
    const s = stops[i];
    return { i, key: last, stop: s, text: isNum(s) ? `${cap(line.unit)} ${s.key} of ${line.count}` : s.label };
  }

  // Position of full-list index i along drawn stops that each have a coordinate `at`.
  function along(drawn, i, at) {
    let a = drawn[0], b = drawn[drawn.length - 1];
    for (const s of drawn) { if (s.i <= i) a = s; if (s.i >= i) { b = s; break; } }
    return a === b || b.i === a.i ? a[at] : a[at] + (b[at] - a[at]) * (i - a.i) / (b.i - a.i);
  }

  // --- the service map --------------------------------------------------------
  const X0 = 260, CX = 820, Y0 = 220, GAP = 180, ENTRY = 130;

  function serviceMap(lines) {
    const n = lines.length;
    const midY = Y0 + (n - 1) * GAP / 2;
    const entryOf = k => midY + (k - (n - 1) / 2) * ENTRY;
    const height = Y0 + (n - 1) * GAP + 120;
    const sampled = [];
    let html = '';

    lines.forEach((line, k) => {
      const y = Y0 + k * GAP;
      const dy = entryOf(k) - y;
      const bend = CX - Math.abs(dy);
      const sample = line.kind === 'sample';
      const href = `/read/${line.slug}/`;
      const stops = shown(line);
      if (stops.length < line.stops.length) sampled.push(line);
      // leave room before the bend (or before Central, for a line that runs straight in)
      const room = (dy ? bend - 24 : CX - 48) - X0;
      const step = Math.min(sample ? 48 : 70, room / Math.max(1, stops.length - 1));
      stops.forEach((s, j) => { s.x = X0 + j * step; });
      const lastX = stops[stops.length - 1].x;
      const solidTo = sample ? lastX : bend;
      const tilt = dy > 0 ? 45 : -45;

      html += `<div style="--c: ${COLOR[line.color] ?? 'var(--ink)'}">`;
      html += `<div class="tm-name" style="top: ${y - 26}px">
          <span class="bullet ${esc(line.color)}" aria-hidden="true">${esc(line.bullet)}</span>
          <div><a href="${href}">${esc(line.title)}</a><small>${esc(KIND[line.kind] ?? '')}</small></div>
        </div>`;
      html += `<i class="tm-line start" style="left: ${X0 - 14}px; top: ${y - 7}px; width: ${solidTo - X0 + 14}px"></i>`;
      if (sample) {
        html += `<i class="tm-line dash" style="left: ${lastX}px; top: ${y - 7}px; width: ${bend - lastX}px"></i>`;
        html += `<p class="tm-note" style="left: ${lastX + 26}px; top: ${y + 18}px"><b>Extension under construction</b><span>Full issue opening soon</span></p>`;
      } else if (dy) {
        html += `<i class="tm-joint" style="left: ${bend}px; top: ${y}px"></i>`;
      }
      if (dy) {
        html += `<i class="tm-line diag${sample ? ' dash' : ''}" style="left: ${bend}px; top: ${y - 7}px; width: ${Math.abs(dy) * Math.SQRT2}px; transform: rotate(${tilt}deg)"></i>`;
      }

      stops.forEach((s, j) => {
        const end = j === 0 || j === stops.length - 1;
        html += `<a class="tm-stop${end ? ' end' : ''}" href="${href}#${s.key}" style="left: ${s.x}px; top: ${y}px"
            aria-label="${esc(`${line.title}, ${nameOf(line, s).toLowerCase()}`)}"
            data-web="${esc(s.web)}" data-name="${esc(nameOf(line, s))}"></a>`;
        html += `<span class="tm-lab" style="left: ${s.x}px; top: ${y + 16}px" aria-hidden="true">${esc(shortLabel(s))}</span>`;
      });

      const here = placeOf(line);
      if (here) {
        const x = along(stops, here.i, 'x');
        html += `<p class="tm-flag" style="left: ${x}px; top: ${y - 92}px"><small>You are here</small>${esc(here.text)}</p>`;
        html += `<i class="tm-stem" style="left: ${x}px; top: ${y - 42}px"></i><i class="tm-here" style="left: ${x}px; top: ${y}px"></i>`;
      }
      html += '</div>';
    });

    const top = entryOf(0), bottom = entryOf(n - 1);
    html += `<i class="tm-central" style="left: ${CX - 20}px; top: ${top - 24}px; height: ${bottom - top + 48}px"></i>`;
    html += `<div class="tm-central-lab" style="left: ${CX + 44}px; top: ${midY - 76}px">
        <small>All lines transfer</small><b>Fancy City Central</b>
        <a href="/books/">The Shelf (books) &rarr;</a>
        <a href="${PATREON}" target="_blank" rel="noopener noreferrer">Insider Service (Patreon) &#8599;</a>
      </div>`;
    html += `<div class="tm-legend" style="top: ${height - 44}px">
        <span><i class="lg-stop"></i>Stop = one page</span>
        <span><i class="lg-here"></i>You are here</span>
        ${lines.some(l => l.kind === 'sample') ? '<span><i class="lg-dash"></i>Under construction</span>' : ''}
        <span><i class="lg-transfer"></i>Transfer</span>
        ${sampled.map(l => `<span>${esc(l.title)} shows every ${EVERY}th ${esc(l.unit)}</span>`).join('')}
      </div>`;
    html += '<div class="tm-tip" hidden><img alt=""><span></span></div>';

    return `<section class="tmap-frame" aria-labelledby="tmap-h">
        <div class="tmap-head"><h2 id="tmap-h">Service map</h2>
          <span>${lines.map(l => esc(l.bullet)).join(', ').replace(/, ([^,]*)$/, ' and $1')} lines &middot; all lines meet at Fancy City Central</span></div>
        <div class="tmap-bg"><div class="tmap" style="height: ${height}px">${html}</div></div>
      </section>`;
  }

  // --- door-strip map ---------------------------------------------------------
  function strip(line, here) {
    const sample = line.kind === 'sample';
    const href = `/read/${line.slug}/`;
    const stops = shown(line);
    const a = 4, b = sample ? 78 : 88;
    stops.forEach((s, j) => { s.p = a + j * (b - a) / Math.max(1, stops.length - 1); });
    const lastP = stops[stops.length - 1].p;
    let html = `<i class="ts-line start" style="left: 2%; width: ${(sample ? lastP : 95) - 2}%"></i>`;
    if (sample) html += `<i class="ts-line dash" style="left: ${lastP}%; width: ${95 - lastP}%"></i><span class="ts-note">Under construction</span>`;
    stops.forEach((s, j) => {
      const first = j === 0, last = j === stops.length - 1;
      const word = !isNum(s);
      html += `<a class="ts-stop${first || last ? ' end' : ''}" href="${href}#${s.key}" style="left: ${s.p}%"
          aria-label="${esc(`${line.title}, ${nameOf(line, s).toLowerCase()}`)}"></a>`;
      html += `<span class="ts-lab${word && first ? ' first' : ''}${word && last ? ' last' : ''}" style="left: ${s.p}%" aria-hidden="true">${esc(shortLabel(s))}</span>`;
    });
    html += '<i class="ts-cap" aria-hidden="true"></i>';
    if (here) {
      const p = along(stops, here.i, 'p');
      html += `<p class="ts-flag ${p < 50 ? 'left' : 'right'}" style="left: ${p}%"><small>You are here</small>${esc(here.text)}</p>`;
      html += `<i class="ts-stem" style="left: ${p}%"></i><i class="ts-here" style="left: ${p}%"></i>`;
    }
    return `<div class="tstrip" style="--c: ${COLOR[line.color] ?? 'var(--ink)'}">${html}</div>`;
  }

  // --- line panels --------------------------------------------------------------
  function panel(line) {
    const href = `/read/${line.slug}/`;
    const here = placeOf(line);
    const first = line.stops[0];
    const newest = [...line.stops].reverse().find(isNum);
    const btn = line.color === 'slime' ? 'slime' : line.color;
    const links = [];
    let thumb = '';
    if (here && here.i > 0) {
      if (here.end) {
        links.push(line.kind === 'ongoing'
          ? `<a class="btn ${btn}" href="${href}#end">You&rsquo;re caught up ${arrow('&rarr;')}</a>`
          : `<a class="btn ${btn}" href="${href}#${first.key}">Ride again ${arrow('&rarr;')}</a>`);
      } else {
        thumb = `<img class="tl-thumb" src="${esc(here.stop.web)}" alt="" loading="lazy" decoding="async">`;
        links.push(`<a class="btn ${btn}" href="${href}#${here.key}">Continue at ${esc(nameOf(line, here.stop).toLowerCase())} ${arrow('&rarr;')}</a>`);
      }
      if (!(here.end && line.kind !== 'ongoing')) links.push(`<a class="tl-link" href="${href}#${first.key}">From the start</a>`);
    } else {
      links.push(`<a class="btn ${btn}" href="${href}#${first.key}">Start reading ${arrow('&rarr;')}</a>`);
    }
    if (line.kind === 'ongoing' && newest && !(here && here.end)) {
      links.push(`<a class="tl-link" href="${href}#${newest.key}">Newest: ${esc(line.unit)} ${newest.key}</a>`);
    }
    return `<article class="tl-panel" aria-labelledby="tl-${esc(line.slug)}">
        <div class="tl-band">
          <span class="bullet ${esc(line.color)}" aria-hidden="true">${esc(line.bullet)}</span>
          <h2 id="tl-${esc(line.slug)}"><a href="${href}">${esc(line.title)}</a></h2>
        </div>
        <div class="tl-body">
          <p class="label">${esc(KIND[line.kind] ?? '')} &middot; ${line.count} ${esc(line.unit)}s</p>
          ${strip(line, here)}
          ${line.credits ? `<p class="tl-credits">${esc(line.credits)}</p>` : ''}
          ${line.advisory ? `<p class="tag advisory">Service advisory: ${esc(line.advisory)}</p>` : ''}
          ${thumb}
          <div class="btns">${links.join('')}</div>
        </div>
      </article>`;
  }

  const central = `<section class="central-band" aria-labelledby="central-h">
      <small><i aria-hidden="true"></i>All lines end at</small>
      <h2 id="central-h">Fancy City Central</h2>
      <a href="/books/">Transfer to The Shelf (books) <span aria-hidden="true">&rarr;</span></a>
      <a href="${PATREON}" target="_blank" rel="noopener noreferrer">Transfer to Insider Service (Patreon) <span aria-hidden="true">&#8599;</span></a>
    </section>`;

  // Previews: pointing at (or tabbing to) a stop on the service map shows its page.
  function wireTips() {
    const map = root.querySelector('.tmap');
    if (!map) return;
    const tip = map.querySelector('.tm-tip');
    const img = tip.querySelector('img');
    const label = tip.querySelector('span');
    const show = stop => {
      img.src = stop.dataset.web;
      label.textContent = `${stop.dataset.name} · board here →`;
      tip.style.left = `${parseFloat(stop.style.left) - 74}px`;
      tip.style.top = `${parseFloat(stop.style.top) - 200}px`;
      tip.hidden = false;
    };
    const hide = () => { tip.hidden = true; };
    map.addEventListener('pointerover', e => { const s = e.target.closest('.tm-stop'); s ? show(s) : hide(); });
    map.addEventListener('pointerleave', hide);
    map.addEventListener('focusin', e => { const s = e.target.closest('.tm-stop'); if (s) show(s); });
    map.addEventListener('focusout', hide);
  }

  fetch('/read/lines.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(({ lines }) => {
      root.innerHTML = serviceMap(lines) + `<div class="tl-panels">${lines.map(panel).join('')}</div>` + central;
      wireTips();
    })
    .catch(() => {});   // the plain list of lines already in the page still works
})();
