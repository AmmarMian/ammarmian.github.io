import { clock, frameLoop, init, surface } from 'vgpu';
import { LibraryScene, type Loaders, type Manifest, type View } from './library';
import pbr from './shaders/pbr.wgsl';
import godrays from './shaders/godrays.wgsl';
import composite from './shaders/composite.wgsl';
import down from './shaders/bloom-down.wgsl';
import up from './shaders/bloom-up.wgsl';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const FLOORS = [
  { id: 'library', name: 'Library' },
  { id: 'lab', name: 'Laboratory' },
  { id: 'obs', name: 'Observatory' },
];
const floor = new URLSearchParams(location.search).get('floor') ?? 'library';

// [ and ] (or the arrow keys) climb between floors; the page reloads onto the next one.
addEventListener('keydown', (e) => {
  const i = FLOORS.findIndex((f) => f.id === floor);
  const next = e.key === ']' || e.key === 'ArrowRight' ? i + 1 : e.key === '[' || e.key === 'ArrowLeft' ? i - 1 : null;
  if (next === null || next < 0 || next >= FLOORS.length) return;
  const q = new URLSearchParams(location.search);
  q.set('floor', FLOORS[next].id);
  location.search = q.toString();
});
document.getElementById('note')!.textContent = `${FLOORS.find((f) => f.id === floor)?.name ?? floor} · vgpu · drag to look, scroll to move, [ ] to change floor`;

function fail(why: string) {
  document.getElementById('note')!.remove();
  canvas.remove();
  const el = document.getElementById('fail')!;
  document.getElementById('why')!.textContent = why;
  el.style.display = 'grid';
}

async function main() {
  if (!('gpu' in navigator)) return fail('This page needs WebGPU, which this browser does not have.');
  const gpu = await init();
  gpu.device.gpu.lost.then((i) => fail(`The graphics device was lost (${i.reason}).`));

  const [manifest, bin] = await Promise.all([
    fetch(`${floor}.json`).then((r) => r.json() as Promise<Manifest>),
    fetch(`${floor}.bin`).then((r) => r.arrayBuffer()),
  ]);

  // Decode on the main thread to RGBA bytes; vgpu textures are built from those, mips and all, so the page and the
  // headless renderer share one path from pixels to texels.
  const load: Loaders = {
    bytes: (url) => fetch(url).then((r) => r.arrayBuffer()),
    image: async (url) => {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      cx.drawImage(bmp, 0, 0);
      const px = cx.getImageData(0, 0, bmp.width, bmp.height);
      bmp.close();
      return { width: px.width, height: px.height, data: px.data };
    },
  };

  // Full resolution up to what an ordinary GPU can carry with 4x MSAA; ?scale=0.5 trades sharpness for speed.
  const q = new URLSearchParams(location.search);
  const out = surface(gpu, canvas, { dpr: [1, 2] });
  const autoScale = () => Math.min(1, 2400 / out.size[0]);
  const scaleOf = () => Number(q.get('scale')) || autoScale();
  const lib = await LibraryScene.create(gpu, manifest, bin, { pbr, godrays, composite, down, up }, load, out, { scale: scaleOf() });
  out.onResize(() => lib.resize(out, scaleOf()));

  // A camera that stands where the old tower's visitor would, and turns on a drag.
  const home = manifest.camera;
  let yaw = Math.atan2(home.target[0] - home.pos[0], home.target[2] - home.pos[2]);
  let pitch = Math.atan2(home.target[1] - home.pos[1], Math.hypot(home.target[0] - home.pos[0], home.target[2] - home.pos[2]));
  const pos: [number, number, number] = [...home.pos];
  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.005;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - (e.clientY - drag.y) * 0.005));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = -e.deltaY * 0.004;
    pos[0] += Math.sin(yaw) * s; pos[2] += Math.cos(yaw) * s;
    const r = Math.hypot(pos[0], pos[2]);
    if (r > 4.8) { pos[0] *= 4.8 / r; pos[2] *= 4.8 / r; }
  }, { passive: false });

  const time = clock(gpu);
  frameLoop(gpu, (frame) => {
    const cp = Math.cos(pitch);
    const view: View = { pos, target: [pos[0] + Math.sin(yaw) * cp, pos[1] + Math.sin(pitch), pos[2] + Math.cos(yaw) * cp] };
    lib.render(frame, out, view, time.time);
  });
}

main().catch((e) => fail(String(e?.message ?? e)));
