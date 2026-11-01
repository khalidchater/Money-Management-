import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('./', import.meta.url);
const [html, css, translations, app] = await Promise.all([
  readFile(new URL('public/index.html', root), 'utf8'),
  readFile(new URL('public/style.css', root), 'utf8'),
  readFile(new URL('public/i18n.js', root), 'utf8'),
  readFile(new URL('public/app.js', root), 'utf8'),
]);
const styleTag = /<link\b[^>]*href=["']\.\/style\.css["'][^>]*>/;
const scriptTags = /<script\b[^>]*src=["']\.\/(?:i18n|app)\.js["'][^>]*><\/script>/g;
if (!styleTag.test(html) || [...html.matchAll(scriptTags)].length !== 2) {
  throw new Error('Expected local stylesheet and both application scripts.');
}
const js = (translations + '\n' + app).replace(/<\/script/gi, '<\\/script');
const standalone = html
  .replace(styleTag, () => `<style>${css}</style>`)
  .replace(scriptTags, '')
  .replace('</body>', () => `<script>${js}</script></body>`);
if (/<script\b[^>]*\bsrc=|<link\b[^>]*\brel=["']stylesheet/i.test(standalone)) {
  throw new Error('The standalone file must not depend on external scripts or styles.');
}
await mkdir(new URL('dist/', root), { recursive: true });
await Promise.all(['index.html', 'floussi.html'].map(name => writeFile(new URL('dist/' + name, root), standalone)));
console.log('Bilingual, standalone application created: dist/floussi.html');
