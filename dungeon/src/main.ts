import { clock, effect, frameLoop, init, storage, surface, target, type Target } from 'vgpu';
import sceneShader from './scene.wgsl';
import postShader from './post.wgsl';
import { buildRoom, packMeta, packVoxels } from './room.ts';
import { type View, nearestIso } from './camera.ts';
import { MAX_PARTICLES, Particles, tileBufferWords } from './particles.ts';
import { frameParams } from './frame.ts';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const msg = document.getElementById('msg')!;

/* ?t=12.5 freezes time (for screenshots), ?px=4 forces the art-pixel size,
   ?yaw=135 and ?zoom=1.5 set the starting view. */
const q = new URLSearchParams(location.search);
const frozen = q.has('t') ? Number(q.get('t')) : null;
const forcedPx = q.has('px') ? Number(q.get('px')) : null;

const ROOM_PX: [number, number] = [470, 330]; // footprint of the room on screen at zoom 1, in art pixels
const ZOOM_MIN = 0.6, ZOOM_MAX = 4;

async function main() {
  if (!('gpu' in navigator)) {
    msg.textContent = 'This needs WebGPU (recent Chrome, Edge or Safari).';
    return;
  }
  const gpu = await init();
  gpu.onError((e) => console.error(e.code, e.message, e.where ?? '', String((e.cause as any)?.message ?? e.cause ?? '')));
  const surf = surface(gpu, canvas, { dpr: [1, 2] });

  const room = buildRoom(7);
  const buf = (data: ArrayBufferView<ArrayBuffer>) => {
    const b = storage(gpu, data.byteLength, 'read');
    b.write(data);
    return b;
  };
  const vox = buf(packVoxels(room));
  const roomData = buf(packMeta(room));
  const parts = new Particles(room);
  const partBuf = storage(gpu, MAX_PARTICLES * 32, 'read');

  /* The view eases towards `goal`; input only ever moves the goal. */
  const view: View = { yaw: (Number(q.get('yaw') ?? 45) * Math.PI) / 180, zoom: Number(q.get('zoom') ?? 1), pan: [0, 0] };
  const goal: View = { yaw: view.yaw, zoom: view.zoom, pan: [0, 0] };

  let res: [number, number] = [320, 240];
  let pxScale = 3;
  let tileBuf = storage(gpu, tileBufferWords(res) * 4, 'read');
  const scene = effect(gpu, sceneShader, {
    set: { vox, roomData, particles: partBuf, ptiles: tileBuf, params: frameParams(room, view, res, 0, parts) },
  });
  const post = effect(gpu, postShader);

  let low: Target | null = null;
  surf.onResize(({ width, height }) => {
    pxScale = forcedPx ?? Math.max(1, Math.floor(Math.min(width / (ROOM_PX[0] * 1.15), height / (ROOM_PX[1] * 1.1))));
    const lw = Math.ceil(width / pxScale), lh = Math.ceil(height / pxScale);
    res = [lw, lh];
    low = target(gpu, { size: [lw, lh], format: 'rgba16float' });
    tileBuf = storage(gpu, tileBufferWords(res) * 4, 'read');
    scene.set({ ptiles: tileBuf });
    post.set({
      src: low,
      post: { scale: pxScale, time: 0, offset: [Math.floor((width - lw * pxScale) / 2), Math.floor((height - lh * pxScale) / 2)], lowres: [lw, lh] },
    });
  });

  /* ---- input: drag to turn, wheel/pinch to zoom, right-drag or two fingers to pan ---- */
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'turn' | 'pan' | null = null;
  let pinch0 = 0, zoom0 = 1;
  // screen pixels -> world units at the current zoom
  const toWorld = (dpx: number) => (dpx * devicePixelRatio) / pxScale / (1.42 * view.zoom);
  const clampPan = () => {
    const lim = Math.max(room.w, room.d) * 0.6;
    goal.pan[0] = Math.max(-lim, Math.min(lim, goal.pan[0]));
    goal.pan[1] = Math.max(-lim, Math.min(lim, goal.pan[1]));
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = goal.zoom; mode = 'pan';
    } else mode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'turn';
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      goal.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch0)));
      goal.pan[0] -= toWorld(dx) / 2; goal.pan[1] += toWorld(dy) / 2;
    } else if (mode === 'turn') {
      goal.yaw += dx * 0.008;
    } else if (mode === 'pan') {
      goal.pan[0] -= toWorld(dx); goal.pan[1] += toWorld(dy);
    }
    clampPan();
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    // settle on the nearest of the four 2:1 views, where the pixels are cleanest
    if (pointers.size === 0 && mode === 'turn') goal.yaw = nearestIso(goal.yaw);
    if (pointers.size === 0) mode = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    goal.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, goal.zoom * Math.exp(-e.deltaY * 0.0015)));
  }, { passive: false });
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'q') goal.yaw = nearestIso(goal.yaw) - Math.PI / 2;
    else if (k === 'e') goal.yaw = nearestIso(goal.yaw) + Math.PI / 2;
    else if (k === '+' || k === '=') goal.zoom = Math.min(ZOOM_MAX, goal.zoom * 1.25);
    else if (k === '-' || k === '_') goal.zoom = Math.max(ZOOM_MIN, goal.zoom / 1.25);
    else if (k === 'r' || k === '0') { goal.yaw = nearestIso(goal.yaw); goal.zoom = 1; goal.pan = [0, 0]; }
    else if (k === 'arrowleft' || k === 'a') goal.pan[0] -= 12 / goal.zoom;
    else if (k === 'arrowright' || k === 'd') goal.pan[0] += 12 / goal.zoom;
    else if (k === 'arrowup' || k === 'w') goal.pan[1] += 12 / goal.zoom;
    else if (k === 'arrowdown' || k === 's') goal.pan[1] -= 12 / goal.zoom;
    else return;
    clampPan();
  });

  const time = clock(gpu);
  let frames = 0;
  frameLoop(gpu, (f) => {
    if (!low) return;
    const dt = Math.min(0.1, time.deltaTime);
    const k = 1 - Math.exp(-dt * 10);
    view.yaw += (goal.yaw - view.yaw) * k;
    view.zoom *= Math.pow(goal.zoom / view.zoom, k);
    view.pan[0] += (goal.pan[0] - view.pan[0]) * k;
    view.pan[1] += (goal.pan[1] - view.pan[1]) * k;
    const params = frameParams(room, view, res, frozen ?? time.time, parts);
    partBuf.write(parts.data);
    tileBuf.write(parts.tiles);
    scene.set({ params });
    f.pass(low, scene);
    f.pass(surf, post);
    if (++frames === 2) document.body.dataset.ready = '1';
  });
}

main().catch((e) => {
  console.error(e);
  msg.textContent = String(e?.message ?? e);
});
