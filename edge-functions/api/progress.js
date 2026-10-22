// 同域数据接口：部署后页面访问 /api/progress，刷新即可拿到论坛最新楼层
// 原理：服务器代抓论坛数据（服务器之间没有跨域限制），再以同域身份返回给页面
// 缓存：实例内存缓存 90 秒，不依赖任何平台专有 API
// 部署：functions/api/progress.js 给 Cloudflare Pages，edge-functions/api/progress.js 给腾讯云 EdgeOne Pages，两份内容一致
const TOPIC = '325833';
const BASE = 'https://forum.trae.cn';
const CACHE_MS = 90 * 1000;

let memo = { at: 0, body: '' };

function json(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

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

async function handle() {
  const now = Date.now();
  if (memo.body && now - memo.at < CACHE_MS) return json(memo.body);
  try {
    const snap = await buildSnapshot();
    memo = { at: now, body: JSON.stringify(snap) };
    return json(memo.body);
  } catch (e) {
    if (memo.body) return json(memo.body);
    return json(JSON.stringify({ error: String((e && e.message) || e) }), 502);
  }
}

export { handle as onRequest };
export default handle;
