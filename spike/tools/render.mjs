// Renders the library floor headless on the real GPU and writes a PNG.
//   node spike/tools/render.mjs <out.png> [--size 1280x720] [--pixel 3] [--time 4]
//        [--cam x,y,z --look x,y,z] [--fov 62]
// No browser and no dev server: vgpu's Node adapter drives Dawn directly, and the scene module is
// the same file the page imports.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { init, frame, target } from 'vgpu/node';
import { LibraryScene } from '../src/library.ts';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = args[0] ?? 'spike/out/shot.png';
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const pixel = Number(opt('pixel', '3'));
const time = Number(opt('time', '4'));
const v3 = (s) => s.split(',').map(Number);

const manifest = JSON.parse(readFileSync('spike/public/library.json', 'utf8'));
const bin = readFileSync('spike/public/library.bin');
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
const src = {
  library: readFileSync('spike/src/shaders/library.wgsl', 'utf8'),
  post: readFileSync('spike/src/shaders/post.wgsl', 'utf8'),
};

const gpu = await init();
const output = target(gpu, { size: [W, H], format: 'rgba8unorm' });
const lib = new LibraryScene(gpu, manifest, ab, src, [W, H], pixel);
const view = {
  pos: opt('cam') ? v3(opt('cam')) : manifest.camera.pos,
  target: opt('look') ? v3(opt('look')) : manifest.camera.target,
  fov: Number(opt('fov', '62')),
};
frame(gpu, (f) => lib.render(f, output, view, time));
const px = await output.color.read({ mipLevel: 0, region: 'all' });
const png = new PNG({ width: W, height: H });
png.data.set(px);
writeFileSync(out, PNG.sync.write(png));
let sum = 0, lit = 0;
for (let i = 0; i < px.length; i += 4) { const l = px[i] + px[i + 1] + px[i + 2]; sum += l; if (l > 30) lit++; }
console.log(`wrote ${out}  mean luma ${(sum / (px.length / 4) / 3).toFixed(1)}  non-black ${(100 * lit / (px.length / 4)).toFixed(1)}%`);
gpu.dispose();
