/* Headless still: node --experimental-strip-types dev/render.ts out.png [t] [lowW] [lowH] [scale] [yaw] [zoom] [floor] [focus]
   BENCH=n times the scene pass. Needs `npx vgpu install-software-renderer` once. */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { resolveShader } from '@vgpu/wgsl/runtime';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { effect, init, storage, target } from 'vgpu/node';
import { makeFloor } from '../src/gen/make.ts';
import { Particles } from '../src/particles.ts';
import { frameParams } from '../src/frame.ts';
import { fitZoom, floorCenter, roomCenter } from '../src/camera.ts';

const [out = 'frame.png', t = '3', lw = '540', lh = '360', sc = '3', yaw = '45', zm = 'fit', fl = '0', fo = '-1'] = process.argv.slice(2);
const load = async (f: string) => {
  const entry = fileURLToPath(new URL(f, import.meta.url));
  return prepareShader(await resolveShader({ entry }), entry);
};
const t0 = Date.now();
const floor = makeFloor(+fl);
console.log('floor', floor.index, floor.name, floor.rooms.map((r) => r.name).join(', '), (Date.now() - t0) + 'ms');
const gpu = await init();
gpu.onError((e) => console.error(e.code, e.message, String((e.cause as any)?.message ?? '')));
const [w, h, s] = [+lw, +lh, +sc];
const res: [number, number] = [w, h];
const buf = (data: ArrayBufferView<ArrayBuffer>) => { const b = storage(gpu, data.byteLength, 'read'); b.write(data); return b; };
const vox = buf(floor.vox), roomData = buf(floor.table);
const parts = new Particles(floor);
const partBuf = storage(gpu, parts.capacity * 32, 'read');
const tileBuf = storage(gpu, Particles.tileWords(res, parts.capacity) * 4, 'read');
const focus = +fo;
const rm = focus >= 0 ? floor.rooms[focus] : null;
const view = {
  yaw: (+yaw * Math.PI) / 180,
  zoom: zm === 'fit' ? (rm ? fitZoom(rm.w, rm.d, res) : fitZoom(floor.bounds[2] - floor.bounds[0], floor.bounds[3] - floor.bounds[1], res, 0.95)) : +zm,
  target: rm ? roomCenter(rm) : floorCenter(floor),
};
const params = frameParams(floor, view, res, +t, parts, focus, focus >= 0 ? 1 : 0);
partBuf.write(parts.data); tileBuf.write(parts.tiles);
const low = target(gpu, { size: res, format: 'rgba16float' });
const fin = target(gpu, { size: [w * s, h * s], format: 'rgba8unorm' });
const scene = effect(gpu, await load('../src/scene.wgsl'), { set: { vox, roomData, particles: partBuf, ptiles: tileBuf, params } });
const post = effect(gpu, await load('../src/post.wgsl'), { set: { src: low, post: { scale: s, fade: 1, offset: [0, 0], lowres: res, tintLo: [...floor.biome.tintLo, 0], tintHi: [...floor.biome.tintHi, 0] } } });
scene.draw(low);
await low.color.read({ mipLevel: 0, region: 'all' });
const N = Number(process.env.BENCH ?? 0);
if (N) {
  const b0 = performance.now();
  for (let i = 0; i < N; i++) scene.draw(low);
  await low.color.read({ mipLevel: 0, region: 'all' });
  console.log('scene pass avg', ((performance.now() - b0) / N).toFixed(1) + 'ms');
}
post.draw(fin);
const px = await fin.color.read({ mipLevel: 0, region: 'all' });
const png = new PNG({ width: w * s, height: h * s });
png.data.set(px);
writeFileSync(out, PNG.sync.write(png));
console.log('wrote', out, (Date.now() - t0) + 'ms');
gpu.dispose();
