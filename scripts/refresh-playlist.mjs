#!/usr/bin/env node
// Refreshes the baked YouTube video list in index.html from the playlist.
// Run from the repo root after adding videos to the playlist:
//   node scripts/refresh-playlist.mjs
// It rewrites the array between /* YT_VIDEOS_START */ and /* YT_VIDEOS_END */.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PLAYLIST_ID = 'PLs0L9o62y0BsjLP65gNBLXvpsEjmuKfM8';
const INDEX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.html');

const res = await fetch(`https://www.youtube.com/playlist?list=${PLAYLIST_ID}&hl=en`, {
  headers: {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'accept-language': 'en-US,en;q=0.9',
  },
});
if (!res.ok) { console.error(`Fetch failed: HTTP ${res.status}`); process.exit(1); }
const html = await res.text();

// Pull ytInitialData JSON out of the page.
const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
let videos = [];
if (m) {
  try {
    const data = JSON.parse(m[1]);
    const walk = obj => {
      if (!obj || typeof obj !== 'object') return;
      // Current format (2026): lockupViewModel
      if (obj.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const lv = obj.lockupViewModel;
        const title = lv.metadata?.lockupMetadataViewModel?.title?.content ?? '';
        videos.push({ id: lv.contentId, title: title.trim() });
      }
      // Legacy format: playlistVideoRenderer
      if (obj.playlistVideoRenderer) {
        const r = obj.playlistVideoRenderer;
        videos.push({ id: r.videoId, title: (r.title?.runs?.[0]?.text ?? '').trim() });
      }
      for (const v of Object.values(obj)) walk(v);
    };
    walk(data);
  } catch { /* fall through to regex */ }
}
if (!videos.length) {
  // Fallback: raw regex scan for playlist video entries.
  const seen = new Set();
  for (const mm of html.matchAll(/"playlistVideoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
    if (seen.has(mm[1])) continue;
    seen.add(mm[1]);
    videos.push({ id: mm[1], title: JSON.parse(`"${mm[2]}"`) });
  }
}
if (!videos.length) {
  console.error('No videos found — YouTube may have changed its page format.');
  process.exit(1);
}

const block = '[\n' + videos.map(v =>
  '      ' + JSON.stringify({ id: v.id, title: v.title })
).join(',\n') + '\n    ]';

const idx = readFileSync(INDEX, 'utf8');
const updated = idx.replace(
  /\/\* YT_VIDEOS_START \*\/[\s\S]*?\/\* YT_VIDEOS_END \*\//,
  `/* YT_VIDEOS_START */${block}/* YT_VIDEOS_END */`
);
if (updated === idx) {
  console.log(`index.html already up to date (${videos.length} videos).`);
} else {
  writeFileSync(INDEX, updated);
  console.log(`Updated index.html with ${videos.length} videos:`);
  for (const v of videos) console.log(`  ${v.id}  ${v.title}`);
}
