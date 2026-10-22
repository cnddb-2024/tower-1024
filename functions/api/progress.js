// 同域数据接口：部署后页面访问 /api/progress，刷新即可拿到论坛最新楼层
// 由 Cloudflare Pages Functions 自动识别 functions/api/progress.js 生成
// 原理：服务器代抓论坛数据（服务器之间没有跨域限制），再以同域身份返回给页面
const TOPIC = '325833';
const BASE = 'https://forum.trae.cn';
const CACHE_S = 90;

function clean(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildSnapshot() {
  const res = await fetch(BASE + '/t/' + TOPIC + '.json?print=true', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error('论坛返回 ' + res.status);
  const d = await res.json();
  const posts = (d.post_stream && d.post_stream.posts) || [];
  const floors = posts.map(function (p) {
    let likes = 0;
    (p.actions_summary || []).forEach(function (a) {
      if (a.id === 2) likes = a.count || 0;
    });
    return {
      n: p.post_number,
      u: p.username || '',
      nm: (p.name || '').trim(),
      av: BASE + (p.avatar_template || '').replace('{size}', '96'),
      t: p.created_at || '',
      lc: likes,
      x: clean(p.cooked).slice(0, 90),
    };
  });
  floors.sort(function (a, b) { return a.n - b.n; });
  const bj = new Date(Date.now() + 8 * 3600000);
  const pad = function (x) { return (x < 10 ? '0' : '') + x; };
  return {
    topic: TOPIC,
    scraped_at: bj.getUTCFullYear() + '-' + pad(bj.getUTCMonth() + 1) + '-' + pad(bj.getUTCDate()) + ' ' + pad(bj.getUTCHours()) + ':' + pad(bj.getUTCMinutes()),
    posts_count: d.posts_count,
    like_count: d.like_count,
    views: d.views,
    floors: floors,
  };
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const key = new Request(url.origin + '/api/progress', { method: 'GET' });
  const cache = caches.default;
  const hit = await cache.match(key);
  let body;
  if (hit) {
    body = await hit.text();
  } else {
    try {
      const snap = await buildSnapshot();
      body = JSON.stringify(snap);
      context.waitUntil(cache.put(key, new Response(body, { headers: { 'Cache-Control': 'public, max-age=' + CACHE_S } })));
    } catch (e) {
      return new Response(JSON.stringify({ error: String((e && e.message) || e) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
  }
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
