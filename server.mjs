import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handle from './edge-functions/api/progress.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error('需要 Node 18 以上版本，当前是 ' + process.versions.node + '，请先升级 Node');
  process.exit(1);
}

const argvPort = Number(process.argv[2]);
const basePort = argvPort > 0 && argvPort < 65536 ? argvPort : 8788;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403');
    return;
  }
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

async function serveApi(res) {
  try {
    const r = await handle();
    const body = await r.text();
    const headers = {};
    r.headers.forEach(function (v, k) { headers[k] = v; });
    res.writeHead(r.status, headers);
    res.end(body);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
}

const server = http.createServer(function (req, res) {
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {}
  if (pathname.indexOf('/api/') === 0) {
    serveApi(res);
    return;
  }
  serveStatic(res, pathname);
});

function listen(p) {
  server.once('error', function (e) {
    if (e.code === 'EADDRINUSE' && p < basePort + 5) {
      listen(p + 1);
      return;
    }
    console.error('启动失败：' + e.message);
    process.exit(1);
  });
  server.listen(p, function () {
    console.log('1024 大厦本地服务已启动');
    console.log('浏览器打开 http://localhost:' + p + ' 查看实时楼层');
    console.log('停止服务：在本窗口按 Ctrl + C');
  });
}

listen(basePort);
