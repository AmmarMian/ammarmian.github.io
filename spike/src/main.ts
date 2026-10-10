import { clock, frameLoop, init, surface } from 'vgpu';
import { LibraryScene, type Manifest, type View } from './library';
import libraryShader from './shaders/library.wgsl';
import postShader from './shaders/post.wgsl';

const canvas = document.getElementById('c') as HTMLCanvasElement;

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
    fetch('library.json').then((r) => r.json() as Promise<Manifest>),
    fetch('library.bin').then((r) => r.arrayBuffer()),
  ]);

  // Pixels are as wide as the screen is big: about 3 CSS pixels on a laptop, finer on a phone.
  const pixelFor = () => Math.max(2, Math.round(Math.min(innerWidth, innerHeight) / 240));
  const out = surface(gpu, canvas, { dpr: [1, 2] });
  const lib = new LibraryScene(gpu, manifest, bin, { library: libraryShader, post: postShader }, out.size, pixelFor() * (out.size[0] / innerWidth));
  out.onResize(() => lib.resize(out.size, pixelFor() * (out.size[0] / innerWidth)));

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
