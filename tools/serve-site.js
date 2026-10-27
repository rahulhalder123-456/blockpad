/* tiny local static server for previewing site/: node tools/serve-site.js [port]  (mimics Vercel cleanUrls: /join -> join.html) */
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'site'), port = +process.argv[2] || 4789;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html'; else if (!path.extname(p)) p += '.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port, '127.0.0.1', () => console.log('serving site on http://127.0.0.1:' + port));
