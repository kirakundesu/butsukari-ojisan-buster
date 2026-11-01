// 公開用に、CSS と JS を 1 枚の HTML へまとめて dist/artifact.html に書き出す。
// 公開先が doctype や head を付けるので、ここでは外しておく。
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(`public/${path}`, root), 'utf8');

let html = await read('index.html');
const css = await read('css/style.css');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}</style>`);

for (const [tag, src] of [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => [m[0], m[1]])) {
  const js = await read(src);
  html = html.replace(tag, () => `<script>\n${js}</script>`);
}

html = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta [^>]*>\s*/gi, '')
  .replace(/<link rel="(icon|canonical)"[^>]*>\s*/gi, '');

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/artifact.html', root), html);
console.log(`dist/artifact.html ${(html.length / 1024).toFixed(0)} KB`);
