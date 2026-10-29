// /read/ menu: one row per line (series), from /read/lines.json.
// Each row offers the start, the reader's saved place, and (for ongoing
// lines) the newest page. Saved places come from the reader's own memory.

(() => {
  'use strict';

  const list = document.getElementById('lines');
  const KIND = { ongoing: 'Weekly service', archive: 'Full archive', sample: 'Preview service' };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const saved = series => { try { return JSON.parse(localStorage.getItem(`reader:${series}`)) || {}; } catch { return {}; } };
  const nameOf = (line, key) => {
    const stop = line.stops.find(s => s.key === key);
    return stop?.label ?? `page ${key}`;
  };

  function row(line) {
    const href = `/read/${line.slug}/`;
    const last = saved(line.series).last;
    const first = line.stops[0];
    const newest = [...line.stops].reverse().find(s => typeof s.key === 'number');
    const links = [];
    if (last != null && last !== first.key && (last === 'end' || line.stops.some(s => s.key === last))) {
      links.push(last === 'end'
        ? `<a class="btn red" href="${href}#end">You’re caught up <span class="arr" aria-hidden="true">&rarr;</span></a>`
        : `<a class="btn red" href="${href}#${last}">Continue at ${esc(nameOf(line, last))} <span class="arr" aria-hidden="true">&rarr;</span></a>`);
      links.push(`<a class="btn outline" href="${href}#${first.key}">From the start <span class="arr" aria-hidden="true">&rarr;</span></a>`);
    } else {
      links.push(`<a class="btn red" href="${href}#${first.key}">Start reading <span class="arr" aria-hidden="true">&rarr;</span></a>`);
    }
    if (line.kind === 'ongoing' && newest) {
      links.push(`<a class="line-newest" href="${href}#${newest.key}">Newest: page ${newest.key}</a>`);
    }
    return `
      <li class="line-row">
        <span class="bullet ${esc(line.color)} lg" aria-hidden="true">${esc(line.bullet)}</span>
        <div class="line-text">
          <p class="label">${esc(KIND[line.kind] ?? '')} &middot; ${line.count} pages</p>
          <h2><a href="${href}">${esc(line.title)}</a></h2>
          ${line.credits ? `<p class="mute">${esc(line.credits)}</p>` : ''}
          ${line.advisory ? `<p class="tag advisory">Service advisory: ${esc(line.advisory)}</p>` : ''}
          <div class="btns">${links.join('')}</div>
        </div>
      </li>`;
  }

  fetch('/read/lines.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(({ lines }) => { list.innerHTML = lines.map(row).join(''); })
    .catch(() => {});   // the plain link already in the page still works
})();
