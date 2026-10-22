#!/usr/bin/env node
// Adds new pages to a reader series.
//
//   npm run add-pages                  (every series that has a series.json)
//   npm run add-pages -- fluffyhand    (just one series)
//   npm run add-pages -- --force       (rebuild every image, e.g. after changing quality)
//
// Drop the original artwork (PNG or JPEG) into series/<name>/. The page number
// is the last number in the filename, so "Fluffy_Hand_Some_Show_012.png" is
// page 12. For each original this makes:
//   web/012.jpg   about 1200px wide, what readers see first
//   full/012.jpg  full resolution, loaded only when a reader zooms in
// and rewrites series/<name>/pages.json, which is the list the reader shows.
//
// Originals are never changed. Images are converted with macOS's built-in
// `sips`, so nothing needs installing.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERIES_DIR = path.join(ROOT, 'series');
const WEB_WIDTH = 1200;
const WEB_QUALITY = 66;
const FULL_QUALITY = 85;

const sips = args => execFileSync('sips', args, { encoding: 'utf8' });

function pixelSize(file) {
  const out = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', file]);
  return {
    w: Number(out.match(/pixelWidth: (\d+)/)[1]),
    h: Number(out.match(/pixelHeight: (\d+)/)[1]),
  };
}

const isNewer = (src, out) => !existsSync(out) || statSync(src).mtimeMs > statSync(out).mtimeMs;

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
  const previous = existsSync(listFile) ? JSON.parse(readFileSync(listFile, 'utf8')).pages : [];
  const byNumber = new Map(previous.map(p => [p.n, p]));
  const pad = n => String(n).padStart(3, '0');

  // Originals: image files sitting directly in the series folder.
  const originals = new Map();
  for (const file of readdirSync(dir)) {
    if (!/\.(png|jpe?g)$/i.test(file)) continue;
    const match = file.match(/(\d+)(?!.*\d)/);
    if (!match) { console.warn(`  skipped ${file}: no page number in the name`); continue; }
    const n = Number(match[1]);
    if (originals.has(n)) {
      throw new Error(`Two files are both page ${n}: ${originals.get(n)} and ${file}. Rename one and run again.`);
    }
    originals.set(n, file);
  }

  let made = 0;
  for (const [n, file] of originals) {
    const src = path.join(dir, file);
    const web = path.join(webDir, pad(n) + '.jpg');
    const full = path.join(fullDir, pad(n) + '.jpg');
    if (!force && !isNewer(src, web) && !isNewer(src, full)) continue;

    const { w } = pixelSize(src);
    const resize = w > WEB_WIDTH ? ['--resampleWidth', String(WEB_WIDTH)] : [];
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(WEB_QUALITY), ...resize, src, '--out', web]);
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(FULL_QUALITY), src, '--out', full]);
    made++;
    console.log(`  page ${n}: ${file}`);
  }

  // The list covers every page that has a web image, so originals can be
  // cleared off the disk later without pages disappearing from the site.
  const numbers = readdirSync(webDir)
    .map(f => f.match(/^(\d+)\.jpg$/))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .sort((a, b) => a - b);

  const pages = numbers.map(n => {
    const { w, h } = pixelSize(path.join(webDir, pad(n) + '.jpg'));
    return {
      n,
      web: `web/${pad(n)}.jpg`,
      full: `full/${pad(n)}.jpg`,
      w, h,
      added: byNumber.get(n)?.added ?? today(),
    };
  });

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
console.log('\nDone. Commit and push to publish.');
