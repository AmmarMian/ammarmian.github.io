// Wall-clock frame cost of the library scene on the real GPU, headless.
//   node spike/tools/bench.mjs [--size 1920x1080] [--pixel 3] [--frames 300]
import { readFileSync } from 'node:fs';
import { init, frame, target } from 'vgpu/node';
import sharp from 'sharp';
import { LibraryScene } from '../src/library.ts';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const floor = opt('floor', 'library');
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const pixel = Number(opt('pixel', '1'));
const N = Number(opt('frames', '300'));
const manifest = JSON.parse(readFileSync(`spike/public/${floor}.json`, 'utf8'));
const bin = readFileSync(`spike/public/${floor}.bin`);
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const sh = (n) => readFileSync(`spike/src/shaders/${n}.wgsl`, 'utf8');
const src = { pbr: sh('pbr'), godrays: sh('godrays'), composite: sh('composite'), down: sh('bloom-down'), up: sh('bloom-up') };
const loadImage = async (url) => {
  const { data, info } = await sharp(`spike/public/${url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};
const bytes = async (url) => { const b = readFileSync(`spike/public/${url}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const load = { image: loadImage, bytes };
const gpu = await init();
const output = target(gpu, { size: [W, H], format: 'rgba8unorm' });
const lib = await LibraryScene.create(gpu, manifest, ab, src, load, output, { scale: 1 / pixel });
const view = { pos: manifest.camera.pos, target: manifest.camera.target };
const q = gpu.device.gpu.queue;
for (let i = 0; i < 20; i++) frame(gpu, (f) => lib.render(f, output, view, i / 60));
await q.onSubmittedWorkDone();
const times = [];
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  frame(gpu, (f) => lib.render(f, output, view, i / 60));
  await q.onSubmittedWorkDone();
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(N - 1, Math.floor(N * p))].toFixed(2);
console.log(`${W}x${H}, scene ${Math.ceil(W / pixel)}x${Math.ceil(H / pixel)}: median ${pct(0.5)} ms, p95 ${pct(0.95)} ms, max ${times[N - 1].toFixed(2)} ms (submit -> GPU idle, ${N} frames)`);
gpu.dispose();
