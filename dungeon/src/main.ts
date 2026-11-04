import { clock, effect, frameLoop, init, storage, surface, target, type Target } from 'vgpu';
import sceneShader from './scene.wgsl';
import postShader from './post.wgsl';
import { buildRoom, packMeta, roomParams } from './room';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const msg = document.getElementById('msg')!;

/* ?t=12.5 freezes time (for screenshots), ?px=4 forces the art-pixel size. */
const q = new URLSearchParams(location.search);
const frozen = q.has('t') ? Number(q.get('t')) : null;
const forcedPx = q.has('px') ? Number(q.get('px')) : null;

const ZOOM = 1.42; // art pixels per voxel unit: one voxel step ~ one pixel
const ROOM_PX: [number, number] = [470, 330]; // footprint of the room on screen, in art pixels

async function main() {
  if (!('gpu' in navigator)) {
    msg.textContent = 'This needs WebGPU (recent Chrome, Edge or Safari).';
    return;
  }
  const gpu = await init();
  gpu.onError((e) => {
    console.error(e.code, e.message, e.where ?? '', String((e.cause as any)?.message ?? e.cause ?? ''), JSON.stringify(e.detail ?? {}).slice(0, 2000));
  });
  const surf = surface(gpu, canvas, { dpr: [1, 2] });

  const room = buildRoom(7);
  const vox = storage(gpu, room.grid.v.byteLength, 'read');
  vox.write(room.grid.v);
  const metaData = packMeta(room);
  const meta = storage(gpu, metaData.byteLength, 'read');
  meta.write(metaData);

  const scene = effect(gpu, sceneShader, {
    set: {
      vox,
      roomData: meta,
      params: { ...roomParams(room), time: 0, res: [320, 240], zoom: ZOOM },
    },
  });
  const post = effect(gpu, postShader);

  let low: Target | null = null;
  surf.onResize(({ width, height }) => {
    const px = forcedPx ?? Math.max(1, Math.floor(Math.min(width / (ROOM_PX[0] * 1.15), height / (ROOM_PX[1] * 1.1))));
    const lw = Math.ceil(width / px), lh = Math.ceil(height / px);
    low = target(gpu, { size: [lw, lh], format: 'rgba16float' });
    scene.set({ params: { res: [lw, lh] } });
    post.set({
      src: low,
      post: { scale: px, time: 0, offset: [Math.floor((width - lw * px) / 2), Math.floor((height - lh * px) / 2)], lowres: [lw, lh] },
    });
  });

  const time = clock(gpu);
  let frames = 0;
  frameLoop(gpu, (f) => {
    if (!low) return;
    scene.set({ params: { time: frozen ?? time.time } });
    f.pass(low, scene);
    f.pass(surf, post);
    if (++frames === 2) document.body.dataset.ready = '1';
  });
}

main().catch((e) => {
  console.error(e);
  msg.textContent = String(e?.message ?? e);
});
