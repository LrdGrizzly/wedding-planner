// Builds a single self-contained HTML page of the app with sync switched off,
// for publishing as a private test page. Output: dist-artifact/matrimonio.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-artifact';
execSync(`npx vite build --mode artifact --outDir ${out} --emptyOutDir`, { stdio: 'inherit' });

let html = readFileSync(join(out, 'index.html'), 'utf8');
const read = (p) => readFileSync(join(out, p.replace(/^\.\//, '')), 'utf8');

// Inline the stylesheet and the script
html = html.replace(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+\.css)"[^>]*>/, (_, href) => `<style>${read(href)}</style>`);
html = html.replace(/<script type="module"[^>]*src="(\.\/assets\/[^"]+\.js)"[^>]*><\/script>/, (_, src) => '');
const jsFile = /src="(\.\/assets\/[^"]+\.js)"/.exec(readFileSync(join(out, 'index.html'), 'utf8'))[1];
const js = read(jsFile).replace(/<\/script/gi, '<\/script');

// Icons as data URIs; drop what a hosted page can't use
const svg = readFileSync('public/icon.svg', 'utf8');
const svgUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
html = html
  .replace(/<link rel="(icon|apple-touch-icon|manifest)"[^>]*>\s*/g, '')
  .replace(/<meta name="(theme-color|apple-mobile-web-app-[^"]+)"[^>]*>\s*/g, '')
  .replace(/<meta charset[^>]*>\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '');

const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1].trim();
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1].trim();
let page = `${head}\n${body}\n<script type="module">${js}</script>\n`;
page = page.split('./icon.svg').join(svgUri);
js.includes('./icon.svg') || true;

writeFileSync(join(out, 'matrimonio.html'), page);
console.log(`\nWrote ${out}/matrimonio.html (${(page.length / 1024).toFixed(0)} KB)`);
