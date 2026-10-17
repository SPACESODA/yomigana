import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (['/demo', '/demo/', '/demo/index.html', '/demo.html'].includes(pathname)) {
      res.writeHead(302, { Location: `/demo-online/${url.search}` });
      res.end();
      return;
    }
    if (/^\/(demo-(offline|online|basic)|yomu)$/.test(pathname)) {
      res.writeHead(302, { Location: `${pathname}/${url.search}` });
      res.end();
      return;
    }
    const relative = pathname === '/' ? 'index.html' : /^\/(demo-(offline|online|basic)|yomu)\/$/.test(pathname)
      ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const publicFile = ['index.html', 'index-gemini.html', 'site/styles.css', 'site/playground.js', 'site-gemini/styles.css', 'README.md', 'docs.md'].includes(relative) || (relative.startsWith('yomu/') ? /^yomu\/(index\.html|styles\.css|yomigana-setup\.js|yomu\.js|speech\.js|manifest\.webmanifest|sw\.js|icon.*?\.(png|svg))$/.test(relative)
      : relative.startsWith('demo-') ? /^demo-(offline|online|basic)\/(index\.html|yomigana-(setup|loader|overrides)\.js|demo-controls\.js|styles\.css)$/.test(relative)
      : ['src', 'vendor', 'dist'].includes(relative.split('/')[0]));
    if (!publicFile) throw new Error('Not public');
    const path = await realpath(resolve(root, relative));
    if (!path.startsWith(root) || !(await stat(path)).isFile()) throw new Error('Not found');
    let bytes = await readFile(path);
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /\.(json|js|css|wasm)$/.test(path);
    if (gzip) bytes = gzipSync(bytes);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Vary': 'Accept-Encoding', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      'Cache-Control': /-[a-f0-9]{12}\.json$/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`yomigana demo: http://127.0.0.1:${port}`));
