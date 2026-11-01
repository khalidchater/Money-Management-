import http from 'node:http';
import { readFile } from 'node:fs/promises';

const files = {
  'index.html': ['public/index.html', 'text/html; charset=utf-8'],
  'app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  'i18n.js': ['public/i18n.js', 'text/javascript; charset=utf-8'],
  'style.css': ['public/style.css', 'text/css; charset=utf-8'],
  'floussi.html': ['dist/floussi.html', 'text/html; charset=utf-8'],
};
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  // Relative assets also work when the app is mounted below a URL prefix.
  const name = new URL(req.url, 'http://localhost').pathname.split('/').pop() || 'index.html';
  const file = Object.hasOwn(files, name) && files[name];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try {
    const data = await readFile(new URL('./' + file[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500);
    res.end('Unable to load app');
  }
});
server.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Floussi running on port ' + (process.env.PORT || 3000)));
