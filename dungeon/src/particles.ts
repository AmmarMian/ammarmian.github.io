/* Ambient particles, moved on the CPU and handed to the shader as a list
 * binned into screen tiles. Each room's theme lists its emitters: dust in
 * every room, fireflies, falling leaves and petals, forge embers, cauldron
 * bubbles, and the twinkle of magic or gold. */
import { type EmitterKind, type V3, WALL_T, rng } from './gen/core.ts';
import type { FloorData, RoomMeta } from './gen/types.ts';
import { type Basis, CAM_BACK, dot } from './camera.ts';

const SUN_L: V3 = [-0.736, 0.6133, 0.2862]; // must match scene.wgsl

function inWindow(rm: RoomMeta, z: number, y: number) {
  let v = 0;
  for (const [z0, z1, y0, y1] of rm.windows) {
    const rad = (z1 - z0) / 2, cz = (z0 + z1) / 2, archY = y1 - rad;
    if (z > z0 && z < z1 && y > y0 && y < y1 && (y <= archY || Math.hypot(z - cz, y - archY) < rad))
      v = Math.max(v, Math.min(1, Math.min(z - z0, z1 - z, y - y0, y1 - y) / 3));
  }
  return v;
}

/* Same light-shaft test as the shader, in room-local coordinates. */
function shaft(rm: RoomMeta, x: number, y: number, z: number) {
  if (!rm.windows.length || x < WALL_T) return 0;
  const s = (WALL_T * 0.5 - x) / SUN_L[0];
  return inWindow(rm, z + SUN_L[2] * s, y + SUN_L[1] * s) * Math.exp(-s * 0.012);
}

interface Spec { kind: EmitterKind; room: number; pos: V3; size: V3; s: number[]; color?: V3 }

export const TILE = 16;

export class Particles {
  readonly specs: Spec[] = [];
  data: Float32Array<ArrayBuffer>;
  tiles: Uint32Array<ArrayBuffer> = new Uint32Array(1);
  private floor: FloorData;

  constructor(floor: FloorData) {
    this.floor = floor;
    const r = rng(floor.index * 31 + 5);
    floor.rooms.forEach((rm, i) => {
      for (const e of rm.emitters) for (let k = 0; k < e.count; k++)
        this.specs.push({ kind: e.kind, room: i, pos: [rm.x + e.pos[0], e.pos[1], rm.z + e.pos[2]], size: e.size, s: [r(), r(), r(), r()], color: e.color });
    });
    this.data = new Float32Array(Math.max(1, this.specs.length) * 8);
  }

  get capacity() { return Math.max(1, this.specs.length); }
  static tileWords(res: [number, number], capacity: number) {
    return Math.ceil(res[0] / TILE) * Math.ceil(res[1] / TILE) + 1 + capacity * 4;
  }

  /* Fills `data` and `tiles`, returns how many particles are on screen. */
  update(time: number, b: Basis, center: V3, res: [number, number], zoom: number, focus: number, focusAmt: number): number {
    const { data, floor } = this;
    let n = 0;
    let dim = 1;
    const push = (q: V3, kind: number, c: V3, extra = 0) => {
      if (c[0] + c[1] + c[2] < 0.02) return;
      const rel: V3 = [q[0] - center[0], q[1] - center[1], q[2] - center[2]];
      const sx = res[0] / 2 + dot(rel, b.R) * zoom;
      const sy = res[1] / 2 - dot(rel, b.U) * zoom;
      if (sx < -4 || sy < -4 || sx > res[0] + 4 || sy > res[1] + 4) return;
      const o = n * 8;
      data[o] = sx; data[o + 1] = sy; data[o + 2] = dot(rel, b.D) + CAM_BACK; data[o + 3] = kind;
      data[o + 4] = c[0] * dim; data[o + 5] = c[1] * dim; data[o + 6] = c[2] * dim; data[o + 7] = extra;
      n++;
    };
    const wrap = (v: number, span: number) => ((v % span) + span) % span;

    for (const [k, p] of this.specs.entries()) {
      const rm = floor.rooms[p.room];
      dim = focus >= 0 && p.room !== focus ? 1 - 0.65 * focusAmt : 1;
      const [s0, s1, s2, s3] = p.s;
      const [bx, by, bz] = p.pos, [ex, ey, ez] = p.size;
      switch (p.kind) {
        case 'dust': {
          const y = by - ey + wrap(s1 * 2 * ey - time * (0.6 + s0 * 0.8), 2 * ey);
          const x = bx - ex + wrap(s0 * 2 * ex + Math.sin(time * 0.4 + k) * 3 + time * 0.8, 2 * ex);
          const z = bz + (s2 * 2 - 1) * ez + Math.cos(time * 0.3 + k * 1.7) * 3;
          const lit = shaft(rm, x - rm.x, y, z - rm.z);
          const m = Math.min(1, lit * 2), a = 0.5 + lit * 1.5;
          push([x, y, z], 0, [(0.22 + 0.78 * m) * a, (0.32 + 0.66 * m) * a, (0.26 + 0.46 * m) * a]);
          break;
        }
        case 'firefly': {
          const t = time * (0.25 + 0.2 * s3);
          const q: V3 = [bx + (s0 * 2 - 1) * ex + Math.sin(t + k) * 7, by + (s1 * 2 - 1) * ey + Math.sin(t * 1.7 + k * 2) * 3, bz + (s2 * 2 - 1) * ez + Math.cos(t * 0.8 + k * 3) * 7];
          const pulse = 0.5 + 0.5 * Math.sin(time * (1 + s3) + k * 4);
          const g0 = Math.min(1, Math.max(0, (pulse - 0.2) / 0.7)), g = g0 * g0 * (3 - 2 * g0);
          const c = p.color ?? [0.85, 1.0, 0.55];
          push(q, 1, [c[0] * g, c[1] * g, c[2] * g]);
          break;
        }
        case 'leaf': case 'petal': {
          const period = 9 + 6 * s0;
          const tt = time + period * s1;
          const cyc = Math.floor(tt / period), a = tt / period - cyc;
          const rr = rng(k * 7919 + cyc * 104729);
          const q: V3 = [bx + (rr() * 2 - 1) * ex + Math.sin(a * 9 + k) * 5 + a * 10, by - a * (by - 9), bz + (rr() * 2 - 1) * ez + Math.cos(a * 7 + k) * 5];
          if (q[1] < 10) break;
          const lit = shaft(rm, q[0] - rm.x, q[1], q[2] - rm.z) + (rm.sky ? 0.4 : 0);
          const base: V3 = p.kind === 'petal' ? (rr() > 0.5 ? [1.0, 0.72, 0.82] : [0.98, 0.86, 0.9]) : rr() > 0.6 ? [0.78, 0.74, 0.3] : [0.4, 0.66, 0.28];
          const l = 0.75 + 0.6 * lit;
          push(q, 2, [base[0] * l, base[1] * l, base[2] * l], Math.sin(a * 40 + k) > 0 ? 1 : -1);
          break;
        }
        case 'ember': {
          const life = 2.2 + s3 * 1.6;
          const a = wrap(time + s0 * life, life) / life;
          const q: V3 = [bx + (s1 * 2 - 1) * ex + Math.sin(time * 3 + k) * 2 * a, by + a * 34, bz + (s2 * 2 - 1) * ez + Math.cos(time * 2.3 + k) * 2 * a];
          const f = (1 - a) * (0.6 + 0.4 * Math.sin(time * 20 + k * 3));
          push(q, s3 > 0.75 ? 1 : 0, [1.0 * f, (0.55 - 0.35 * a) * f, 0.12 * f]);
          break;
        }
        case 'bubble': {
          const life = 1.4 + s3;
          const a = wrap(time + s0 * life, life) / life;
          const q: V3 = [bx + (s1 * 2 - 1) * ex, by + a * 12, bz + (s2 * 2 - 1) * ez];
          const c = p.color ?? [0.6, 1, 0.5], f = Math.sin(a * Math.PI) * 0.9;
          push(q, 0, [c[0] * f, c[1] * f, c[2] * f]);
          break;
        }
        case 'sparkle': case 'gold': {
          const q: V3 = [bx + (s0 * 2 - 1) * ex + Math.sin(time * 0.3 + k) * 2, by + (s1 * 2 - 1) * ey + Math.sin(time * 0.5 + k * 2) * 1.5, bz + (s2 * 2 - 1) * ez];
          const tw = Math.pow(Math.max(0, Math.sin(time * (1.5 + s3 * 2.5) + s3 * 40)), 6);
          const c = p.color ?? (p.kind === 'gold' ? [1.0, 0.85, 0.42] : [0.8, 0.9, 1.0]);
          push(q, tw > 0.55 ? 3 : 0, [c[0] * tw * 1.2, c[1] * tw * 1.2, c[2] * tw * 1.2]);
          break;
        }
      }
    }
    this.bin(n, res);
    return n;
  }

  /* Screen tiles of 16 art pixels, each listing the particles that can touch
     it: offsets for every tile, then the particle indices. */
  private bin(n: number, res: [number, number]) {
    const tw = Math.ceil(res[0] / TILE), th = Math.ceil(res[1] / TILE), nt = tw * th;
    const need = Particles.tileWords(res, this.capacity);
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
}
