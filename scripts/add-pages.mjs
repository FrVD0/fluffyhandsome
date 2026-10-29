#!/usr/bin/env node
// Adds new pages to a reader series and rebuilds the reader pages.
//
//   npm run add-pages                  (every series that has a series.json)
//   npm run add-pages -- fluffyhand    (just one series)
//   npm run add-pages -- --force       (rebuild every image, e.g. after changing quality)
//
// Drop the original artwork (PNG or JPEG) into series/<name>/. The page number
// is the last number in the filename, so "Fluffy_Hand_Some_Show_012.png" is
// page 12. Files named "front-cover" and "back-cover" become the first and
// last pages. For each original this makes:
//   web/012.jpg   about 1200px wide, what readers see first
//   full/012.jpg  full resolution, loaded only when a reader zooms in
// and rewrites series/<name>/pages.json, which is the list the reader shows.
//
// Then, for every series, it writes the reader page /read/<slug>/index.html
// from scripts/reader-template.html and the series' series.json, and writes
// /read/lines.json, the list of lines the /read/ menu shows.
//
// Originals are never changed. Images are converted with macOS's built-in
// `sips`, so nothing needs installing.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERIES_DIR = path.join(ROOT, 'series');
const READ_DIR = path.join(ROOT, 'read');
const TEMPLATE = path.join(ROOT, 'scripts', 'reader-template.html');
const WEB_WIDTH = 1200;
const WEB_QUALITY = 66;
const FULL_QUALITY = 85;

// Covers are pages without a number: they sit before page 1 and after the last page.
const COVERS = [
  { id: 'cover', label: 'Cover', match: /front[-_ ]?cover/i },
  { id: 'back', label: 'Back cover', match: /back[-_ ]?cover/i },
];

const sips = args => execFileSync('sips', args, { encoding: 'utf8' });

function pixelSize(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  return {
    w: Number(out.match(/pixelWidth: (\d+)/)[1]),
    h: Number(out.match(/pixelHeight: (\d+)/)[1]),
  };
}

const isNewer = (src, out) => !existsSync(out) || statSync(src).mtimeMs > statSync(out).mtimeMs;
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const pad = n => String(n).padStart(3, '0');
// A page's name in file names, links (#12, #cover) and readers' saved places.
const keyOf = p => p.id ?? p.n;

function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function processSeries(name) {
  const dir = path.join(SERIES_DIR, name);
  const webDir = path.join(dir, 'web');
  const fullDir = path.join(dir, 'full');
  mkdirSync(webDir, { recursive: true });
  mkdirSync(fullDir, { recursive: true });

  const listFile = path.join(dir, 'pages.json');
  const previous = existsSync(listFile) ? readJson(listFile).pages : [];
  const byKey = new Map(previous.map(p => [keyOf(p), p]));

  // Originals: image files sitting directly in the series folder.
  const originals = new Map();
  for (const file of readdirSync(dir)) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const cover = COVERS.find(c => c.match.test(file));
    const match = file.match(/(\d+)(?!.*\d)/);
    if (!cover && !match) { console.warn(`  skipped ${file}: no page number in the name`); continue; }
    const key = cover ? cover.id : pad(Number(match[1]));
    if (originals.has(key)) {
      throw new Error(`Two files are both page ${key}: ${originals.get(key)} and ${file}. Rename one and run again.`);
    }
    originals.set(key, file);
  }

  let made = 0;
  for (const [key, file] of originals) {
    const src = path.join(dir, file);
    const web = path.join(webDir, key + '.jpg');
    const full = path.join(fullDir, key + '.jpg');
    if (!force && !isNewer(src, web) && !isNewer(src, full)) continue;

    const { w } = pixelSize(src);
    const resize = w > WEB_WIDTH ? ['--resampleWidth', String(WEB_WIDTH)] : [];
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(WEB_QUALITY), ...resize, src, '--out', web]);
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(FULL_QUALITY), src, '--out', full]);
    made++;
    console.log(`  ${key}: ${file}`);
  }

  // The list covers every page that has a web image, so originals can be
  // cleared off the disk later without pages disappearing from the site.
  const webFiles = readdirSync(webDir);
  const numbers = webFiles
    .map(f => f.match(/^(\d+)\.jpg$/))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b);
  const has = id => webFiles.includes(id + '.jpg');

  const entry = (key, extra) => {
    const { w, h } = pixelSize(path.join(webDir, key + '.jpg'));
    const old = byKey.get(extra.id ?? extra.n);
    return { ...extra, web: `web/${key}.jpg`, full: `full/${key}.jpg`, w, h, added: old?.added ?? today() };
  };
  const pages = [
    ...(has('cover') ? [entry('cover', { id: 'cover', label: 'Cover' })] : []),
    ...numbers.map(n => entry(pad(n), { n })),
    ...(has('back') ? [entry('back', { id: 'back', label: 'Back cover' })] : []),
  ];

  writeFileSync(listFile, JSON.stringify({ pages }, null, 2) + '\n');
  const fresh = pages.length - previous.length;
  console.log(`${name}: ${pages.length} pages` +
    (fresh > 0 ? `, ${fresh} new` : '') +
    (made ? ` (${made} image${made === 1 ? '' : 's'} converted)` : ', nothing to convert'));

  const gaps = [];
  for (let i = 1; i < numbers.length; i++) {
    for (let n = numbers[i - 1] + 1; n < numbers[i]; n++) gaps.push(n);
  }
  if (numbers[0] > 1) for (let n = 1; n < numbers[0]; n++) gaps.unshift(n);
  if (gaps.length) console.warn(`  note: no page ${gaps.join(', ')} yet`);
}

// --- reader pages ------------------------------------------------------------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const external = href => /^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';

function readerPage(name, info, lines) {
  const end = info.end ?? {};
  const to = lines.find(l => l.series === info.transfer);
  const fill = {
    series: name,
    slug: info.slug,
    title: info.title,
    description: info.description,
    kind: info.kind,
    color: info.color,
    bullet: info.bullet,
    endTitle: end.title,
    endText: end.text,
    endButton: end.button,
    endButtonHref: end.buttonHref,
  };
  const raw = {
    credits: info.credits ? `        <p class="r-credits">${esc(info.credits)}</p>\n` : '',
    orderButton: info.kind === 'ongoing'
      ? '        <button type="button" id="order" class="r-order" aria-label="Reading order: oldest first. Switch to newest first.">Oldest first <span aria-hidden="true">&#8644;</span></button>\n'
      : '',
    endButtonTarget: external(end.buttonHref),
    endBook: end.bookHref
      ? `        <small>${esc(end.bookText)} <a class="book-link" href="${esc(end.bookHref)}"><i>${esc(end.bookTitle)}</i> &rarr;</a></small>\n`
      : '',
    transfer: to
      ? `        <a class="r-transfer" href="/read/${esc(to.slug)}/"><span class="bullet ${esc(to.color)}" aria-hidden="true">${esc(to.bullet)}</span>Transfer to <i>${esc(to.title)}</i> <span aria-hidden="true">&rarr;</span></a>\n`
      : '',
  };
  return readFileSync(TEMPLATE, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k in raw) return raw[k];
    if (k in fill) return esc(fill[k]);
    throw new Error(`reader-template.html: unknown {{${k}}}`);
  });
}

function buildReaders(names) {
  const lines = names
    .filter(name => existsSync(path.join(SERIES_DIR, name, 'pages.json')))
    .map(name => {
      const info = readJson(path.join(SERIES_DIR, name, 'series.json'));
      const pages = readJson(path.join(SERIES_DIR, name, 'pages.json')).pages;
      return {
        series: name,
        slug: info.slug,
        order: info.order ?? 99,
        title: info.title,
        bullet: info.bullet,
        color: info.color,
        kind: info.kind,
        credits: info.credits || '',
        description: info.description || '',
        count: pages.filter(p => p.n != null).length,
        newest: pages.reduce((d, p) => (p.added > d ? p.added : d), ''),
        stops: pages.map(p => ({ key: keyOf(p), ...(p.label && { label: p.label }), web: `/series/${name}/${p.web}` })),
        info,
      };
    })
    .sort((a, b) => a.order - b.order);

  for (const line of lines) {
    const out = path.join(READ_DIR, line.slug);
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'index.html'), readerPage(line.series, line.info, lines));
    console.log(`reader: /read/${line.slug}/`);
  }
  const list = lines.map(({ info, ...line }) => line);
  writeFileSync(path.join(READ_DIR, 'lines.json'), JSON.stringify({ lines: list }, null, 2) + '\n');
}

const force = process.argv.includes('--force');
const wanted = process.argv.slice(2).filter(a => a !== '--force');
const all = readdirSync(SERIES_DIR).filter(d => existsSync(path.join(SERIES_DIR, d, 'series.json')));
const targets = wanted.length ? wanted : all;
if (!targets.length) {
  console.error('No series found. Each reader series needs a series.json in its folder.');
  process.exit(1);
}
for (const name of targets) {
  if (!all.includes(name)) {
    console.error(`No series called "${name}". Known: ${all.join(', ')}`);
    process.exit(1);
  }
  processSeries(name);
}
buildReaders(all);
console.log('\nDone. Commit and push to publish.');
