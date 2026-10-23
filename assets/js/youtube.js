// YouTube facade: shows a thumbnail and play button; nothing loads from
// YouTube until the viewer clicks play.
//
// Video list baked from the "IN(ner)SANITIES (silent)" playlist.
// To refresh after adding videos, run:  node scripts/refresh-playlist.mjs

(() => {
  'use strict';

  const host = document.getElementById('yt-facade');
  if (!host) return;

  const YT_LIST = 'PLs0L9o62y0BsjLP65gNBLXvpsEjmuKfM8';
  const YT_VIDEOS = /* YT_VIDEOS_START */[
      {"id":"IwD6AWM-gYM","title":"Colors world the page with life that enlivens the world the colors worlded… simple, really."},
      {"id":"Z6Y37G3-BZ0","title":"Something like a tree, something like you, something like me…"},
      {"id":"dPjvxiVHp6o","title":"Glowing up the Blank Page with wraiths of smoke and falling ash"},
      {"id":"LdW11li7t_4","title":"A friendly pointer on the Blank Page"},
      {"id":"OLIIMk0Txz0","title":"Whirling from the vast potentialities of the blank page, on fearsome wings…"},
      {"id":"YaNgNjlTgiE","title":"Another night exploring the limitless space of the blank page…"},
      {"id":"bGl6F_uJgMQ","title":"Something frilly this way comes…"}
    ]/* YT_VIDEOS_END */;

  const v = YT_VIDEOS[Math.floor(Math.random() * YT_VIDEOS.length)];

  const thumb = document.createElement('img');
  thumb.className = 'yt-thumb';
  thumb.alt = '';
  thumb.loading = 'lazy';
  thumb.src = 'https://i.ytimg.com/vi/' + v.id + '/maxresdefault.jpg';
  thumb.onerror = () => { thumb.onerror = null; thumb.src = 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg'; };

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'yt-play';
  btn.setAttribute('aria-label', 'Play video: ' + v.title);
  btn.innerHTML = '<span class="yt-icon" aria-hidden="true"></span>';
  btn.addEventListener('click', () => {
    // www.youtube.com (not youtube-nocookie): signed-in viewers' cookies
    // apply, which greatly reduces YouTube's "sign in to confirm you're
    // not a bot" wall (common on VPNs / carrier networks). Nothing loads
    // from YouTube until this click, so the privacy cost stays minimal.
    const iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube.com/embed/' + v.id +
      '?list=' + YT_LIST + '&autoplay=1&playsinline=1&rel=0';
    iframe.title = v.title;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    // Escape hatch: if YouTube's bot wall appears anyway (its sign-in
    // flow refuses to run inside an iframe), one tap opens the video
    // in the YouTube app/site where the viewer is already signed in.
    const esc = document.createElement('a');
    esc.className = 'yt-escape';
    esc.href = 'https://www.youtube.com/watch?v=' + v.id + '&list=' + YT_LIST;
    esc.target = '_blank';
    esc.rel = 'noopener noreferrer';
    esc.textContent = 'Watch on YouTube ↗';
    host.replaceChildren(iframe, esc);
  });

  const caption = document.getElementById('yt-caption');
  if (caption) caption.textContent = v.title;

  host.replaceChildren(thumb, btn);
})();
