/* Ambient particles, moved on the CPU and handed to the shader as a list.
 * The shader only has to compare its pixel against ~200 screen positions,
 * instead of hashing every particle's path for every pixel. */
import type { Room } from './room.ts';
import { WALL_T, rng } from './room.ts';
import { type Basis, type V3, CAM_BACK, dot } from './camera.ts';

const SUN_L: V3 = [-0.736, 0.6133, 0.2862]; // must match scene.wgsl

function inWindow(room: Room, z: number, y: number) {
  let v = 0;
  for (const [z0, z1, y0, y1] of room.windows) {
    const rad = (z1 - z0) / 2, cz = (z0 + z1) / 2, archY = y1 - rad;
    if (z > z0 && z < z1 && y > y0 && y < y1 && (y <= archY || Math.hypot(z - cz, y - archY) < rad)) {
      const e = Math.min(z - z0, z1 - z, y - y0, y1 - y);
      v = Math.max(v, Math.min(1, e / 3));
    }
  }
  return v;
}

/* Same light-shaft test as the shader: trace back along the sun to the window wall. */
export function shaft(room: Room, p: V3) {
  if (p[0] < WALL_T) return 0;
  const s = (WALL_T * 0.5 - p[0]) / SUN_L[0];
  return inWindow(room, p[2] + SUN_L[2] * s, p[1] + SUN_L[1] * s) * Math.exp(-s * 0.012);
}

const N_DUST = 170, N_LEAF = 16, N_FLY = 30;
export const MAX_PARTICLES = N_DUST + N_LEAF + N_FLY;

export const TILE = 16;
export const tileBufferWords = (res: [number, number]) =>
  Math.ceil(res[0] / TILE) * Math.ceil(res[1] / TILE) + 1 + MAX_PARTICLES * 4;

export class Particles {
  readonly data: Float32Array<ArrayBuffer> = new Float32Array(MAX_PARTICLES * 8);
  private seeds: Float32Array;
  private room: Room;
  constructor(room: Room, seed = 3) {
    this.room = room;
    const r = rng(seed);
    this.seeds = new Float32Array(MAX_PARTICLES * 4).map(() => r());
  }

  tiles: Uint32Array<ArrayBuffer> = new Uint32Array(1);

  /* Screen tiles of 16 art pixels, each listing the particles that can touch
     it: offsets for every tile, then the particle indices. */
  private bin(n: number, res: [number, number]) {
    const tw = Math.ceil(res[0] / TILE), th = Math.ceil(res[1] / TILE), nt = tw * th;
    const need = nt + 1 + MAX_PARTICLES * 4;
    if (this.tiles.length !== need) this.tiles = new Uint32Array(need);
    const counts = new Uint32Array(nt);
    const span = (i: number) => {
      const x = this.data[i * 8], y = this.data[i * 8 + 1], r = 4;
      return [Math.max(0, Math.floor((x - r) / TILE)), Math.min(tw - 1, Math.floor((x + r) / TILE)),
              Math.max(0, Math.floor((y - r) / TILE)), Math.min(th - 1, Math.floor((y + r) / TILE))];
    };
    for (let i = 0; i < n; i++) {
      const [x0, x1, y0, y1] = span(i);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) counts[tx + tw * ty]++;
    }
    const t = this.tiles;
    let acc = 0;
    for (let k = 0; k < nt; k++) { t[k] = acc; acc += counts[k]; }
    t[nt] = acc;
    const fill = counts.fill(0);
    for (let i = 0; i < n; i++) {
      const [x0, x1, y0, y1] = span(i);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const k = tx + tw * ty;
        t[nt + 1 + t[k] + fill[k]++] = i;
      }
    }
  }

  /* Fills `data` and `tiles`, returns how many particles there are. */
  update(time: number, b: Basis, center: V3, res: [number, number], zoom: number): number {
    const { room, seeds: sd, data } = this;
    let n = 0;
    const push = (q: V3, kind: number, c: V3, extra = 0) => {
      const rel: V3 = [q[0] - center[0], q[1] - center[1], q[2] - center[2]];
      const sx = res[0] / 2 + dot(rel, b.R) * zoom;
      const sy = res[1] / 2 - dot(rel, b.U) * zoom;
      if (sx < -4 || sy < -4 || sx > res[0] + 4 || sy > res[1] + 4) return;
      const o = n * 8;
      data[o] = sx; data[o + 1] = sy; data[o + 2] = dot(rel, b.D) + CAM_BACK; data[o + 3] = kind;
      data[o + 4] = c[0]; data[o + 5] = c[1]; data[o + 6] = c[2]; data[o + 7] = extra;
      n++;
    };
    const W = room.w, D = room.d;
    let i = 0;

    // dust and pollen: sinking slowly, glinting in the beams
    for (let k = 0; k < N_DUST; k++, i++) {
      const s0 = sd[i * 4], s1 = sd[i * 4 + 1], s2 = sd[i * 4 + 2];
      const spanX = W - 12, spanZ = D - 12;
      let y = 10 + (((s1 * 48 - time * (0.6 + s0 * 0.8)) % 48) + 48) % 48;
      let x = s0 * spanX + Math.sin(time * 0.4 + k) * 3 + time * 0.8;
      x = 6 + ((x % spanX) + spanX) % spanX;
      const z = 6 + s2 * spanZ + Math.cos(time * 0.3 + k * 1.7) * 3;
      const q: V3 = [x, y, z];
      const lit = shaft(room, q);
      const m = Math.min(1, lit * 2), a = 0.5 + lit * 1.5;
      push(q, 0, [(0.22 + 0.78 * m) * a, (0.32 + 0.66 * m) * a, (0.26 + 0.46 * m) * a]);
    }
    // leaves spiralling down from the vines
    for (let k = 0; k < N_LEAF; k++, i++) {
      const period = 9 + 6 * sd[i * 4];
      const tt = time + period * sd[i * 4 + 1];
      const cyc = Math.floor(tt / period), a = tt / period - cyc;
      const r = rng(k * 7919 + cyc * 104729);
      const start: V3 = [10 + (W - 20) * r(), 70, 10 + (D - 20) * r()];
      const q: V3 = [start[0] + Math.sin(a * 9 + k) * 5 + a * 10, start[1] - a * 62, start[2] + Math.cos(a * 7 + k) * 5];
      if (q[1] < 9) continue;
      const lit = shaft(room, q);
      const base: V3 = r() > 0.6 ? [0.78, 0.74, 0.3] : [0.4, 0.66, 0.28];
      const l = 0.75 + 0.6 * lit;
      push(q, 2, [base[0] * l, base[1] * l, base[2] * l], Math.sin(a * 40 + k) > 0 ? 1 : -1);
    }
    // fireflies
    for (let k = 0; k < N_FLY; k++, i++) {
      const s0 = sd[i * 4], s1 = sd[i * 4 + 1], s2 = sd[i * 4 + 2], s3 = sd[i * 4 + 3];
      const t = time * (0.25 + 0.2 * s3);
      const q: V3 = [
        14 + (W - 28) * s0 + Math.sin(t + k) * 7,
        14 + 30 * s1 + Math.sin(t * 1.7 + k * 2) * 3,
        14 + (D - 28) * s2 + Math.cos(t * 0.8 + k * 3) * 7,
      ];
      const pulse = 0.5 + 0.5 * Math.sin(time * (1 + s3) + k * 4);
      const glow = Math.min(1, Math.max(0, (pulse - 0.2) / 0.7));
      const g = glow * glow * (3 - 2 * glow);
      push(q, 1, [0.85 * g, 1.0 * g, 0.55 * g]);
    }
    this.bin(n, res);
    return n;
  }
}
