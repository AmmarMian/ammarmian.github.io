/* Headless still: node --experimental-strip-types dev/render.ts out.png [t] [lowW] [lowH] [scale] */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { resolveShader } from '@vgpu/wgsl/runtime';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { effect, init, storage, target } from 'vgpu/node';
import { buildRoom, packMeta, roomParams } from '../src/room.ts';

const [out = 'frame.png', t = '3', lw = '540', lh = '360', sc = '3'] = process.argv.slice(2);
const load = async (f: string) => {
  const entry = fileURLToPath(new URL(f, import.meta.url));
  return prepareShader(await resolveShader({ entry }), entry);
};
const t0 = Date.now();
const gpu = await init();
gpu.onError((e) => console.error(e.code, e.message, String((e.cause as any)?.message ?? '')));
const room = buildRoom(7);
const vox = storage(gpu, room.grid.v.byteLength, 'read');
vox.write(room.grid.v);
const md = packMeta(room);
const meta = storage(gpu, md.byteLength, 'read');
meta.write(md);
const [w, h, s] = [+lw, +lh, +sc];
const low = target(gpu, { size: [w, h], format: 'rgba16float' });
const fin = target(gpu, { size: [w * s, h * s], format: 'rgba8unorm' });
const scene = effect(gpu, await load('../src/scene.wgsl'), {
  set: { vox, roomData: meta, params: { ...roomParams(room), time: +t, res: [w, h], zoom: 1.42 } },
});
const post = effect(gpu, await load('../src/post.wgsl'), {
  set: { src: low, post: { scale: s, time: +t, offset: [0, 0], lowres: [w, h] } },
});
scene.draw(low);
post.draw(fin);
const px = await fin.color.read({ mipLevel: 0, region: 'all' });
const png = new PNG({ width: w * s, height: h * s });
png.data.set(px);
writeFileSync(out, PNG.sync.write(png));
console.log('wrote', out, (Date.now() - t0) + 'ms');
gpu.dispose();
