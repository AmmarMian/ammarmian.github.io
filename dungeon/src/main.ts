import { clock, effect, frameLoop, init, storage, surface, target, type Target } from 'vgpu';
import sceneShader from './scene.wgsl';
import postShader from './post.wgsl';
import FloorWorker from './gen/worker.ts?worker&inline';
import type { FloorData } from './gen/types.ts';
import { FLOOR_COUNT } from './gen/floor.ts';
import { type View, type V3, fitZoom, floorCenter, nearestIso, pickRoom, pixelRay, roomCenter } from './camera.ts';
import { Particles } from './particles.ts';
import { frameParams } from './frame.ts';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
const msg = $('msg');

/* ?t=12.5 freezes time (for screenshots), ?px=4 forces the art-pixel size,
   ?floor=2 starts on another floor, ?yaw=135 turns the starting view. */
const q = new URLSearchParams(location.search);
const frozen = q.has('t') ? Number(q.get('t')) : null;
const forcedPx = q.has('px') ? Number(q.get('px')) : null;

const ZOOM_MIN = 0.35, ZOOM_MAX = 4;
const MAX_LOW_PIXELS = 380_000; // cap on the low-res pixel count, for speed on big screens

/* ---------------------------------------------------------------- floors */

const worker = new FloorWorker();
const floors = new Map<number, Promise<FloorData>>();
const waiting = new Map<number, (f: FloorData) => void>();
worker.onmessage = (e: MessageEvent<FloorData>) => { waiting.get(e.data.index)?.(e.data); waiting.delete(e.data.index); };
function getFloor(i: number) {
  if (!floors.has(i)) floors.set(i, new Promise<FloorData>((res) => { waiting.set(i, res); worker.postMessage({ index: i }); }));
  return floors.get(i)!;
}

async function main() {
  if (!('gpu' in navigator)) {
    msg.textContent = 'This needs WebGPU (recent Chrome, Edge or Safari).';
    return;
  }
  const start = Math.max(0, Math.min(FLOOR_COUNT - 1, Number(q.get('floor') ?? 1) - 1));
  msg.textContent = 'Raising the tower…';
  const [gpu, first] = await Promise.all([init(), getFloor(start)]);
  msg.textContent = '';
  gpu.onError((e) => console.error(e.code, e.message, e.where ?? '', String((e.cause as any)?.message ?? e.cause ?? '')));
  const surf = surface(gpu, canvas, { dpr: [1, 2] });

  let floor = first;
  const buf = (data: ArrayBufferView<ArrayBuffer>) => { const b = storage(gpu, data.byteLength, 'read'); b.write(data); return b; };
  let parts = new Particles(floor);
  let res: [number, number] = [320, 240];
  let pxScale = 3;
  let partBuf = storage(gpu, parts.capacity * 32, 'read');
  let tileBuf = storage(gpu, Particles.tileWords(res, parts.capacity) * 4, 'read');

  /* camera: `view` eases towards `goal`; input and modes only move the goal */
  const view: View = { yaw: (Number(q.get('yaw') ?? 45) * Math.PI) / 180, zoom: 1, target: floorCenter(floor) };
  const goal: View = { yaw: view.yaw, zoom: 1, target: [...view.target] as V3 };
  let focus = -1, focusAmt = 0, lastFocus = -1;
  let manual: V3 = [0, 0, 0];   // the user's own panning, on top of the mode's target
  let idleFor = 99;             // seconds since the last input; the overview drifts when idle
  let drift = 0;                // phase of the overview drift
  let fade = 0, fadeGoal = 1;   // post-pass fade, for floor changes

  const overviewZoom = () => {
    const [x0, z0, x1, z1] = floor.bounds;
    return Math.max(0.45, Math.min(1, fitZoom(x1 - x0, z1 - z0, res, 1.0) * 1.3));
  };
  const scene = effect(gpu, sceneShader, {
    set: {
      vox: buf(floor.vox), roomData: buf(floor.table), particles: partBuf, ptiles: tileBuf,
      params: frameParams(floor, view, res, 0, parts, -1, 0),
    },
  });
  const post = effect(gpu, postShader);

  let low: Target | null = null;
  let offset: [number, number] = [0, 0];
  surf.onResize(({ width, height }) => {
    const fit = Math.floor(Math.min(width / 520, height / 340));
    pxScale = forcedPx ?? Math.max(1, fit, Math.ceil(Math.sqrt((width * height) / MAX_LOW_PIXELS)));
    const lw = Math.ceil(width / pxScale), lh = Math.ceil(height / pxScale);
    res = [lw, lh];
    low = target(gpu, { size: [lw, lh], format: 'rgba16float' });
    tileBuf = storage(gpu, Particles.tileWords(res, parts.capacity) * 4, 'read');
    scene.set({ ptiles: tileBuf });
    offset = [Math.floor((width - lw * pxScale) / 2), Math.floor((height - lh * pxScale) / 2)];
    post.set({ src: low, post: { scale: pxScale, fade, offset, lowres: [lw, lh] } });
    if (focus < 0) view.zoom = goal.zoom = overviewZoom();
  });

  /* ---- floors: fade out, swap, fade in ---- */
  let climbing = false;
  const showFloor = () => {
    $('floorNum').textContent = `Floor ${floor.index + 1} of ${FLOOR_COUNT}`;
    $('floorName').textContent = floor.name;
    ($('up') as HTMLButtonElement).disabled = floor.index >= FLOOR_COUNT - 1;
    ($('down') as HTMLButtonElement).disabled = floor.index <= 0;
  };
  const showRoom = () => {
    const el = $('room');
    if (focus < 0) { el.hidden = true; return; }
    const rm = floor.rooms[focus];
    el.hidden = false;
    $('roomName').textContent = rm.name;
    $('roomWays').textContent = [rm.stairsUp ? 'Stairs up ▲' : '', rm.stairsDown ? 'Stairs down ▼' : ''].filter(Boolean).join(' · ');
  };
  async function goTo(index: number) {
    if (climbing || index < 0 || index >= FLOOR_COUNT || index === floor.index) return;
    climbing = true;
    const next = getFloor(index);
    fadeGoal = 0;
    await new Promise((r) => setTimeout(r, 380));
    floor = await next;
    parts = new Particles(floor);
    partBuf = storage(gpu, parts.capacity * 32, 'read');
    tileBuf = storage(gpu, Particles.tileWords(res, parts.capacity) * 4, 'read');
    scene.set({ vox: buf(floor.vox), roomData: buf(floor.table), particles: partBuf, ptiles: tileBuf });
    focus = -1; lastFocus = -1; focusAmt = 0; manual = [0, 0, 0]; drift = 0; idleFor = 99;
    goal.target = floorCenter(floor);
    view.target = [...goal.target] as V3;
    view.target[1] += 30; // arrive from a little above, then settle
    view.zoom = goal.zoom = overviewZoom();
    showFloor(); showRoom();
    fadeGoal = 1;
    climbing = false;
    for (const n of [index - 1, index + 1]) if (n >= 0 && n < FLOOR_COUNT) void getFloor(n);
  }
  $('up').addEventListener('click', () => goTo(floor.index + 1));
  $('down').addEventListener('click', () => goTo(floor.index - 1));

  /* ---- focus ---- */
  function setFocus(i: number) {
    focus = i;
    manual = [0, 0, 0];
    if (i >= 0) {
      lastFocus = i;
      const rm = floor.rooms[i];
      goal.target = roomCenter(rm);
      goal.zoom = Math.max(ZOOM_MIN, Math.min(2.6, fitZoom(rm.w, rm.d, res, 0.92)));
    } else {
      goal.zoom = overviewZoom();
      idleFor = 99;
    }
    showRoom();
  }
  const roomIds = () => floor.rooms.flatMap((rm, i) => (rm.kind === 'room' ? [i] : []));
  const cycle = (dir: number) => {
    const ids = roomIds();
    const k = ids.indexOf(focus);
    setFocus(ids[(k + dir + ids.length) % ids.length] ?? -1);
  };

  /* ---- input ---- */
  const pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  let mode: 'turn' | 'pan' | null = null;
  let pinch0 = 0, zoom0 = 1;
  const toWorld = (dpx: number) => (dpx * devicePixelRatio) / pxScale / (1.42 * view.zoom);
  // move along the ground: dx in screen-right units, dy in screen-up units
  // (a step up the screen covers twice the ground, the floor being foreshortened)
  const panBy = (dx: number, dy: number) => {
    const c = Math.cos(view.yaw), s = Math.sin(view.yaw);
    manual[0] += s * dx - c * dy * 2;
    manual[2] += -c * dx - s * dy * 2;
    manual = manual.map((v) => Math.max(-320, Math.min(320, v))) as V3;
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    idleFor = 0;
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
    idleFor = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      goal.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch0)));
      panBy(-toWorld(dx) / 2, toWorld(dy) / 2);
    } else if (mode === 'turn' && Math.hypot(p.x - p.x0, p.y - p.y0) >= 6) {
      goal.yaw += dx * 0.008;
    } else if (mode === 'pan') {
      panBy(-toWorld(dx), toWorld(dy));
    }
  });
  const release = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (p && mode === 'turn' && Math.hypot(p.x - p.x0, p.y - p.y0) < 6) {
      // a click, not a drag: focus the room under the pointer, or step back out
      const rect = canvas.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) * devicePixelRatio - offset[0]) / pxScale;
      const ly = ((e.clientY - rect.top) * devicePixelRatio - offset[1]) / pxScale;
      const { ro, rd } = pixelRay(view, res, lx, ly);
      const hit = pickRoom(floor, ro, rd);
      setFocus(hit === focus ? -1 : hit);
    } else if (pointers.size === 0 && mode === 'turn') goal.yaw = nearestIso(goal.yaw);
    if (pointers.size === 0) mode = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    idleFor = 0;
    goal.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, goal.zoom * Math.exp(-e.deltaY * 0.0015)));
  }, { passive: false });
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    idleFor = 0;
    if (k === 'q') goal.yaw = nearestIso(goal.yaw) - Math.PI / 2;
    else if (k === 'e') goal.yaw = nearestIso(goal.yaw) + Math.PI / 2;
    else if (k === '+' || k === '=') goal.zoom = Math.min(ZOOM_MAX, goal.zoom * 1.25);
    else if (k === '-' || k === '_') goal.zoom = Math.max(ZOOM_MIN, goal.zoom / 1.25);
    else if (k === 'escape' || k === 'r' || k === '0') { goal.yaw = nearestIso(goal.yaw); setFocus(-1); }
    else if (k === 'tab' || k === 'n') { e.preventDefault(); cycle(e.shiftKey ? -1 : 1); }
    else if (k === 'p') cycle(-1);
    else if (k === 'pageup' || k === ']') goTo(floor.index + 1);
    else if (k === 'pagedown' || k === '[') goTo(floor.index - 1);
    else if (k === 'arrowleft' || k === 'a') panBy(-14 / view.zoom, 0);
    else if (k === 'arrowright' || k === 'd') panBy(14 / view.zoom, 0);
    else if (k === 'arrowup' || k === 'w') panBy(0, 14 / view.zoom);
    else if (k === 'arrowdown' || k === 's') panBy(0, -14 / view.zoom);
  });

  showFloor();
  view.zoom = goal.zoom = overviewZoom();
  for (const n of [start - 1, start + 1]) if (n >= 0 && n < FLOOR_COUNT) void getFloor(n);

  const time = clock(gpu);
  let frames = 0;
  frameLoop(gpu, (f) => {
    if (!low) return;
    const dt = Math.min(0.1, time.deltaTime);
    idleFor += dt;
    // overview: left alone, the camera drifts slowly over the whole floor
    if (focus < 0) {
      if (idleFor > 4) drift += dt * 0.06 * Math.min(1, (idleFor - 4) / 3);
      const c = floorCenter(floor);
      const [x0, z0, x1, z1] = floor.bounds;
      goal.target = [c[0] + Math.sin(drift * 1.3) * (x1 - x0) * 0.26, c[1], c[2] + Math.sin(drift * 0.9 + 1.2) * (z1 - z0) * 0.26];
    }
    const k = 1 - Math.exp(-dt * 4);
    const kFast = 1 - Math.exp(-dt * 10);
    view.yaw += (goal.yaw - view.yaw) * kFast;
    view.zoom *= Math.pow(goal.zoom / view.zoom, k);
    for (let i = 0; i < 3; i++) view.target[i] += (goal.target[i] + manual[i] - view.target[i]) * k;
    focusAmt += ((focus >= 0 ? 1 : 0) - focusAmt) * (1 - Math.exp(-dt * 5));
    fade += (fadeGoal - fade) * (1 - Math.exp(-dt * 9));
    // the last focused room stays marked while the dimming eases off
    const shown = focus >= 0 ? focus : focusAmt > 0.02 ? lastFocus : -1;
    const params = frameParams(floor, view, res, frozen ?? time.time, parts, shown, focusAmt);
    partBuf.write(parts.data);
    tileBuf.write(parts.tiles);
    scene.set({ params });
    post.set({ post: { fade } });
    f.pass(low, scene);
    f.pass(surf, post);
    if (++frames === 2) document.body.dataset.ready = '1';
  });
}

main().catch((e) => {
  console.error(e);
  msg.textContent = String(e?.message ?? e);
});
