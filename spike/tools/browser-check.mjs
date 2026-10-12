// Loads the built spike page (dist-spike) in the cached Chrome, with WebGPU on, and screenshots it.
//   npm run spike:build && node spike/tools/browser-check.mjs [out.png]
// A throwaway static server serves the build; this is not a dev server and nothing watches files.
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';

const root = 'dist-spike';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.bin': 'application/octet-stream' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = existsSync(p) && !p.endsWith('/') ? p : join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const port = server.address().port;

const base = join(homedir(), '.cache/puppeteer/chrome');
const ver = readdirSync(base).sort().pop();
const app = join(base, ver, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await puppeteer.launch({
  executablePath: app, headless: 'new',
  args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=metal', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/${process.env.QUERY ?? ''}`, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, Number(process.env.WAIT ?? 9000)));
const info = await page.evaluate(() => ({ gpu: 'gpu' in navigator, fail: document.getElementById('fail')?.style.display, why: document.getElementById('why')?.textContent }));
await page.screenshot({ path: process.argv[2] ?? 'spike/out/browser.png' });
console.log(JSON.stringify(info), `${Date.now() - t0} ms`);
for (const l of logs.slice(0, 20)) console.log(l);
await browser.close(); server.close();
