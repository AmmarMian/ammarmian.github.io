/* Building blocks shared by the room themes: floors, walls, doors, stairs,
 * plants and props. Every builder works in the room's local coordinates. */
import {
  type Emitter, type Grid, type Light, type Rng, type V3, type Window,
  FLOOR, M, WALL_H, WALL_T, fbm, hash2, rng, vnoise,
} from './core.ts';

export type Side = 'x0' | 'x1' | 'z0' | 'z1';
export interface Door { side: Side; at: number; width: number }

export interface RoomCtx {
  g: Grid;
  r: Rng;
  seed: number;
  W: number;
  D: number;
  lights: Light[];
  windows: Window[];
  emitters: Emitter[];
  doors: Door[];
  /* the x = 0 wall faces the outside and may take windows */
  exteriorWest: boolean;
  /* open to the sky: sun reaches the floor from above */
  sky: boolean;
  amb: V3;
  stairsUp: boolean;
  stairsDown: boolean;
}

/* ---------------------------------------------------------------- floors */

export type FloorStyle = 'flag' | 'plank' | 'marble' | 'grass' | 'cave';

export function slab(c: RoomCtx, style: FloorStyle, pool?: (x: number, z: number) => boolean) {
  const { g, W, D, seed } = c;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    for (let y = 0; y < FLOOR; y++) {
      const band = (y + Math.floor(vnoise(x * 0.2, z * 0.2, 3) * 3)) % 5;
      g.set(x, y, z, band < 2 ? M.DIRT : M.ROCK);
    }
    if (pool && pool(x, z)) {
      const bed = 3 + Math.floor(vnoise(x * 0.15, z * 0.15, 5) * 2);
      for (let y = bed; y < FLOOR; y++) g.set(x, y, z, M.AIR);
      g.set(x, bed - 1, z, hash2(x, z, 9) < 0.15 ? M.ROCK : M.SAND);
      g.set(x, 0, z, M.POOLBED); // tag read by the shader: water lives above this column
      continue;
    }
    if (style === 'flag') {
      const row = Math.floor(z / 10), ox = (row & 1) * 5;
      const grout = (x + ox) % 10 === 0 || z % 10 === 0;
      const sunk = hash2(Math.floor((x + ox) / 10) * 31 + row * 17, 1, seed) < 0.12;
      if (grout) { g.set(x, FLOOR - 1, z, M.AIR); g.set(x, FLOOR - 2, z, M.GROUT); }
      else { g.set(x, FLOOR - 2, z, M.STONE); g.set(x, FLOOR - 1, z, sunk ? M.AIR : M.STONE); }
    } else if (style === 'plank') {
      const run = Math.floor(z / 5);
      const seam = z % 5 === 0 || (x + run * 13) % 23 === 0;
      g.set(x, FLOOR - 1, z, seam ? M.PLANK_DARK : M.PLANK);
    } else if (style === 'marble') {
      const chk = (Math.floor(x / 8) + Math.floor(z / 8)) & 1;
      const seam = x % 8 === 0 || z % 8 === 0;
      g.set(x, FLOOR - 1, z, seam ? M.GROUT : chk ? M.MARBLE : M.MARBLE_DARK);
    } else if (style === 'grass') {
      g.set(x, FLOOR - 1, z, M.DIRT);
      const n = fbm(x * 0.06, z * 0.06, seed + 5);
      g.set(x, FLOOR - 1, z, n > 0.62 ? M.MOSS : M.GRASS);
    } else if (style === 'cave') {
      const n = fbm(x * 0.05, z * 0.05, seed + 9);
      const hgt = Math.floor(n * 6) - 2;
      for (let y = FLOOR - 2; y < FLOOR + hgt; y++) g.set(x, y, z, hash2(x, z, y) < 0.15 ? M.ROCK : M.CAVE);
      if (hgt < 0) for (let y = FLOOR + hgt; y < FLOOR; y++) g.set(x, y, z, M.AIR);
    }
  }
}

/* A pond-shaped mask from two noisy blobs; `cx..` are fractions of the room. */
export function pondMask(c: RoomCtx, blobs: [number, number, number, number][], margin = 9) {
  const { W, D, seed } = c;
  return (x: number, z: number) => {
    if (x < WALL_T + margin || z < WALL_T + margin || x > W - WALL_T - margin || z > D - WALL_T - margin) return false;
    const n = fbm(x * 0.045, z * 0.045, seed) - 0.5;
    let d = 9;
    for (const [fx, fz, rx, rz] of blobs) d = Math.min(d, Math.hypot((x - fx * W) / (rx * W), (z - fz * D) / (rz * D)));
    return d + n * 0.55 < 1;
  };
}

/* ----------------------------------------------------------------- walls */

export type WallStyle = 'brick' | 'cave' | 'plaster';

export function makeWindows(D: number): Window[] {
  const out: Window[] = [];
  const n = Math.max(1, Math.round(D / 64));
  for (let i = 0; i < n; i++) {
    const cz = Math.round(WALL_T + 14 + ((D - WALL_T - 40) * (i + 0.5)) / n);
    out.push([cz - 8, cz + 8, 36, 62]);
  }
  return out;
}

export function walls(c: RoomCtx, style: WallStyle = 'brick', withWindows = true) {
  const { g, W, D, seed } = c;
  const brick = (u: number, y: number) => (y % 6 === 0) || ((u + (Math.floor(y / 6) & 1) * 6) % 12 === 0);
  const wallMat = (u: number, y: number) => {
    if (style === 'plaster') return y < 18 ? (y % 6 === 0 || u % 9 === 0 ? M.PLANK_DARK : M.PLANK) : (hash2(u, y, 7) < 0.08 ? M.MORTAR : M.STEP);
    return brick(u, y) ? M.MORTAR : M.BRICK;
  };
  for (let y = 0; y < WALL_H; y++) {
    for (let z = 0; z < D; z++) for (let t = 0; t < WALL_T; t++) {
      const m = wallMat(z, y);
      const recess = style === 'brick' && t === WALL_T - 1 && m === M.MORTAR && z >= WALL_T && z < D - WALL_T;
      if (!recess) { g.set(t, y, z, m); g.set(W - 1 - t, y, z, m); }
    }
    for (let x = 0; x < W; x++) for (let t = 0; t < WALL_T; t++) {
      const m = wallMat(x, y);
      const recess = style === 'brick' && t === WALL_T - 1 && m === M.MORTAR && x >= WALL_T && x < W - WALL_T;
      if (!recess) { g.set(x, y, t, m); g.set(x, y, D - 1 - t, m); }
    }
  }
  const pillarMat = style === 'plaster' ? M.PLANK_DARK : M.STEP;
  const pillar = (x0: number, z0: number) =>
    g.box(x0, 0, z0, x0 + 6, WALL_H + 2, z0 + 6, (x, y) => (y % 8 === 0 ? M.MORTAR : pillarMat));
  pillar(WALL_T - 1, WALL_T - 1); pillar(W - WALL_T - 5, WALL_T - 1);
  pillar(WALL_T - 1, D - WALL_T - 5); pillar(W - WALL_T - 5, D - WALL_T - 5);
  g.box(0, WALL_H, 0, WALL_T + 1, WALL_H + 2, D, M.STEP);
  g.box(W - WALL_T - 1, WALL_H, 0, W, WALL_H + 2, D, M.STEP);
  g.box(0, WALL_H, 0, W, WALL_H + 2, WALL_T + 1, M.STEP);
  g.box(0, WALL_H, D - WALL_T - 1, W, WALL_H + 2, D, M.STEP);

  if (style === 'cave') {
    // rough rock grown over the brick, thick and uneven
    for (const [len, at] of [[D, (u: number, y: number, k: number) => [WALL_T + k, y, u]], [W, (u: number, y: number, k: number) => [u, y, WALL_T + k]],
      [D, (u: number, y: number, k: number) => [W - 1 - WALL_T - k, y, u]], [W, (u: number, y: number, k: number) => [u, y, D - 1 - WALL_T - k]]] as const) {
      for (let y = 0; y < WALL_H + 2; y++) for (let u = 0; u < len; u++) {
        const th = Math.floor(fbm(u * 0.06, y * 0.07, seed + len) * 9) - 1;
        for (let k = -1; k < th; k++) { const [x, yy, z] = at(u, y, k); g.set(x, yy, z, hash2(u, y, k) < 0.2 ? M.ROCK : M.CAVE); }
      }
    }
  }

  if (withWindows && c.exteriorWest) {
    c.windows = makeWindows(D);
    for (const [z0, z1, y0, y1] of c.windows) {
      const cz = (z0 + z1) / 2, rad = (z1 - z0) / 2, archY = y1 - rad;
      for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
        if (y > archY && Math.hypot(z + 0.5 - cz, y - archY) > rad) continue;
        for (let x = 0; x < WALL_T + 8; x++) if (x < WALL_T || g.get(x, y, z) === M.CAVE || g.get(x, y, z) === M.ROCK) g.set(x, y, z, M.AIR);
      }
      g.box(0, y0 - 2, z0 - 1, WALL_T + 2, y0, z1 + 1, M.STEP);
      for (let z = z0; z < z1; z++) if (hash2(z, y0, 11) < 0.55) {
        const len = 2 + Math.floor(hash2(z, y0, 12) * 10);
        for (let k = 0; k < len; k++) g.put(WALL_T + 1 + (k > len - 2 ? 1 : 0), y0 - 2 - k, z, k % 3 === 2 ? M.LEAF : M.VINE);
      }
    }
  }
}

/* Each wall walked along u; `at(u, y, k)` is the cell k voxels into the room
   from that wall's inner face (k = 0 is the face itself). */
export function wallFaces(c: RoomCtx) {
  const { W, D } = c;
  return [
    { side: 'x0' as Side, len: D, at: (u: number, y: number, k: number): V3 => [WALL_T - 1 + k, y, u] },
    { side: 'z0' as Side, len: W, at: (u: number, y: number, k: number): V3 => [u, y, WALL_T - 1 + k] },
    { side: 'x1' as Side, len: D, at: (u: number, y: number, k: number): V3 => [W - WALL_T - k, y, u] },
    { side: 'z1' as Side, len: W, at: (u: number, y: number, k: number): V3 => [u, y, D - WALL_T - k] },
  ];
}

export function vines(c: RoomCtx, density = 0.3, maxLen = 40) {
  const { g } = c;
  for (const [wi, wl] of wallFaces(c).entries()) {
    const s = 61 + wi * 3 + c.seed;
    for (let u = WALL_T; u < wl.len - WALL_T; u++) {
      if (hash2(u, 0, s) > density) continue;
      const len = 6 + Math.floor(hash2(u, 1, s + 1) * hash2(u, 2, s + 2) * maxLen);
      for (let k = 0; k < len; k++) {
        const [x, y, z] = wl.at(u, WALL_H - k, 1);
        if (g.get(x, y, z)) break;
        g.set(x, y, z, k % 4 === 3 ? M.LEAF : M.VINE);
        if (k % 5 === 2) { const [x2, , z2] = wl.at(u + 1, y, 1); g.put(x2, y, z2, M.LEAF_DARK); }
      }
    }
  }
}

export function wallMoss(c: RoomCtx, amount = 0.8) {
  const { g } = c;
  for (const [wi, wl] of wallFaces(c).entries()) {
    for (let y = 0; y < WALL_H + 2; y++) for (let u = 0; u < wl.len; u++) {
      const n = fbm(u * 0.07, y * 0.09, c.seed + 30 + wi) + Math.max(0, 1 - (y - FLOOR) / 16) * 0.4;
      const [x, , z] = wl.at(u, y, 0);
      const [xi, , zi] = wl.at(u, y, 1);
      if (n > amount && (g.get(x, y, z) === M.BRICK || g.get(x, y, z) === M.STEP) && !g.get(xi, y, zi)) g.set(x, y, z, M.MOSS);
    }
  }
  for (let z = 0; z < c.D; z++) for (let x = 0; x < c.W; x++) {
    const ty = g.top(x, z);
    if (ty >= WALL_H && fbm(x * 0.1, z * 0.1, 93) > 0.5) {
      g.set(x, ty + 1, z, M.MOSS);
      if (hash2(x, z, 94) < 0.2) g.set(x, ty + 2, z, M.GRASS);
    }
  }
}

/* Old roots coming down a wall and splaying over the floor. */
export function root(c: RoomCtx, side: Side, u0: number, seedR: number) {
  const { g } = c;
  const wl = wallFaces(c).find((w) => w.side === side)!;
  const rr = rng(seedR);
  let u = u0, y = WALL_H + 1, th = 3.2, du = (rr() - 0.5) * 0.6;
  while (y > FLOOR - 1) {
    y -= 1;
    du += (rr() - 0.5) * 0.25; du = Math.max(-0.7, Math.min(0.7, du));
    u += du;
    th = Math.max(1.6, th - 0.03);
    const t = Math.ceil(th);
    for (let a = -t; a <= t; a++) for (let d = 0; d < Math.max(1, t - Math.abs(a)); d++) {
      if (Math.abs(a) > th) continue;
      const [x, yy, z] = wl.at(Math.round(u + a), y, d);
      g.set(x, yy, z, M.BARK);
    }
    if (rr() < 0.05) { const [x, yy, z] = wl.at(Math.round(u + (rr() < 0.5 ? -t - 1 : t + 1)), y, 1); g.put(x, yy, z, M.LEAF); }
  }
  for (let k = 0; k < 10; k++) {
    const reach = 3 + Math.floor(rr() * 6);
    for (let d = 0; d < reach; d++) {
      const [x, , z] = wl.at(Math.round(u + (k - 5) * 0.6 + d * (k - 5) * 0.15), FLOOR, d + 1);
      g.set(x, FLOOR, z, M.BARK);
    }
  }
}

/* ------------------------------------------------------------ vegetation */

export function grassCover(c: RoomCtx, amount: number, nearWater?: Float32Array) {
  const { g, W, D, seed } = c;
  for (let z = WALL_T; z < D - WALL_T; z++) for (let x = WALL_T; x < W - WALL_T; x++) {
    if (g.get(x, 0, z) === M.POOLBED) continue;
    const ty = g.top(x, z, FLOOR + 1);
    if (ty < FLOOR - 3 || ty > FLOOR) continue;
    const dp = nearWater ? nearWater[x + W * z] : 99;
    const dw = Math.min(x - WALL_T, z - WALL_T, W - WALL_T - 1 - x, D - WALL_T - 1 - z);
    const n = fbm(x * 0.08, z * 0.08, seed + 21);
    const moss = n + Math.max(0, 1 - dp / 14) * 0.55 + Math.max(0, 1 - dw / 10) * 0.25 + amount;
    if (moss > 0.72) {
      g.put(x, ty + 1, z, moss > 0.95 ? M.GRASS : M.MOSS);
      if (moss > 0.9 && hash2(x, z, 4) < 0.22) {
        const h = 1 + Math.floor(hash2(x, z, 5) * (moss > 1.0 ? 5 : 3));
        for (let k = 0; k < h; k++) g.put(x, ty + 2 + k, z, k === h - 1 && h > 2 ? M.GRASS_LIGHT : M.GRASS);
      } else if (moss > 0.85 && hash2(x, z, 6) < 0.015) {
        g.put(x, ty + 2, z, hash2(x, z, 7) < 0.5 ? M.FLOWER_W : M.FLOWER_P);
      }
    }
  }
}

/* Distance (in voxels, chamfer) from each column to the nearest water. */
export function waterDistance(c: RoomCtx) {
  const { g, W, D } = c;
  const dist = new Float32Array(W * D).fill(99);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (g.get(x, 0, z) === M.POOLBED) dist[x + W * z] = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const zz = pass ? D - 1 - z : z, xx = pass ? W - 1 - x : x, s = pass ? 1 : -1;
      let d = dist[xx + W * zz];
      if (xx + s >= 0 && xx + s < W) d = Math.min(d, dist[xx + s + W * zz] + 1);
      if (zz + s >= 0 && zz + s < D) d = Math.min(d, dist[xx + W * (zz + s)] + 1);
      dist[xx + W * zz] = d;
    }
  return dist;
}

export function reeds(c: RoomCtx, dist: Float32Array, p = 0.12) {
  const { g, W, D } = c;
  for (let z = WALL_T + 1; z < D - WALL_T; z++) for (let x = WALL_T + 1; x < W - WALL_T; x++) {
    const d = dist[x + W * z];
    if (d > 0 && d < 3 && hash2(x, z, 41) < p) {
      const ty = g.top(x, z, FLOOR + 2);
      if (ty < 0 || ty > FLOOR + 1) continue;
      const h = 4 + Math.floor(hash2(x, z, 42) * 10);
      for (let k = 1; k <= h; k++) g.put(x, ty + k, z, M.REED);
      if (hash2(x, z, 43) < 0.35) { g.put(x, ty + h + 1, z, M.CATTAIL); g.put(x, ty + h + 2, z, M.CATTAIL); }
    }
  }
}

export function lilies(c: RoomCtx, n: number) {
  const { g, r, W, D } = c;
  const wy = 8;
  for (let k = 0; k < n; k++) {
    const cx = r() * W, cz = r() * D;
    if (g.get(Math.floor(cx), 0, Math.floor(cz)) !== M.POOLBED) continue;
    const rad = 2.2 + r() * 3.2, notch = r() * Math.PI * 2;
    for (let z = Math.floor(cz - rad); z <= cz + rad; z++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      if (Math.hypot(dx, dz) > rad) continue;
      let da = Math.abs(Math.atan2(dz, dx) - notch); da = Math.min(da, Math.PI * 2 - da);
      if (da < 0.35 || g.get(x, 0, z) !== M.POOLBED || g.get(x, wy, z)) continue;
      g.set(x, wy, z, Math.hypot(dx, dz) > rad - 1 ? M.LEAF_DARK : M.LILY);
    }
    if (r() < 0.25) { g.put(Math.floor(cx), wy + 1, Math.floor(cz), M.FLOWER_P); g.put(Math.floor(cx) + 1, wy + 1, Math.floor(cz), M.FLOWER_W); }
  }
}

export function fern(c: RoomCtx, cx: number, cz: number, size: number) {
  const { g, r } = c;
  const by = g.top(cx, cz, FLOOR + 2) + 1;
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2 + r() * 0.5;
    const len = size * (0.7 + r() * 0.4);
    for (let s = 0; s < len; s++) {
      const t = s / len;
      const x = Math.round(cx + Math.cos(a) * s), z = Math.round(cz + Math.sin(a) * s);
      const y = Math.round(by + Math.sin(t * Math.PI) * size * 0.55 + t * 1.5);
      g.put(x, y, z, s % 2 ? M.LEAF : M.GRASS);
      if (s > 1 && s < len - 1) {
        const px = Math.round(-Math.sin(a)), pz = Math.round(Math.cos(a));
        g.put(x + px, y, z + pz, M.LEAF_DARK);
        g.put(x - px, y, z - pz, M.LEAF);
      }
    }
  }
  g.put(cx, by, cz, M.LEAF_DARK);
}

export function boulder(c: RoomCtx, cx: number, cz: number, rad: number, mossy = true, mat: number = M.ROCK) {
  const { g } = c;
  for (let y = -rad; y <= rad; y++) for (let z = -rad; z <= rad; z++) for (let x = -rad; x <= rad; x++) {
    const d = Math.hypot(x, y * 1.3, z) + (vnoise((cx + x) * 0.5, (cz + z + y) * 0.5, 77) - 0.5) * 1.6;
    if (d > rad) continue;
    g.set(cx + x, FLOOR - 2 + y + Math.floor(rad * 0.5), cz + z, mossy && y > rad * 0.25 && hash2(x + cx, z + cz, y) < 0.8 ? M.MOSS : mat);
  }
}

/* A blossom tree: twisting trunk, a few limbs, and a lumpy canopy. */
export function tree(c: RoomCtx, cx: number, cz: number, height: number, canopy: number, flowers = 0.35) {
  const { g, r } = c;
  const by = FLOOR - 1;
  let x = cx, z = cz;
  for (let y = 0; y < height; y++) {
    const rad = Math.max(2.2, 5.5 - y * 0.12);
    x += Math.sin(y * 0.15) * 0.25; z += Math.cos(y * 0.11) * 0.2;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++)
      if (Math.hypot(dx, dz) <= rad) g.set(Math.round(x + dx), by + y, Math.round(z + dz), M.BARK);
  }
  // flared roots
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r();
    for (let s = 4; s < 14; s++) g.set(Math.round(cx + Math.cos(a) * s), FLOOR - 1 + (s < 8 ? 1 : 0), Math.round(cz + Math.sin(a) * s), M.BARK);
  }
  const top: V3 = [x, by + height, z];
  const blobs: V3[] = [top];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + r() * 0.6;
    const len = canopy * (0.6 + r() * 0.3);
    const start = height * (0.55 + r() * 0.25);
    for (let s = 0; s < len; s++) {
      const px = Math.round(cx + Math.cos(a) * s), pz = Math.round(cz + Math.sin(a) * s), py = Math.round(by + start + s * 0.6);
      g.box(px - 1, py - 1, pz - 1, px + 1, py + 1, pz + 1, M.BARK);
    }
    blobs.push([cx + Math.cos(a) * len, by + start + len * 0.6 + 3, cz + Math.sin(a) * len]);
  }
  for (const [bx, byy, bz] of blobs) {
    const R = canopy * 0.55 + r() * 4;
    for (let y = -R; y <= R; y++) for (let zz = -R; zz <= R; zz++) for (let xx = -R; xx <= R; xx++) {
      const d = Math.hypot(xx, y * 1.4, zz) + (vnoise((bx + xx) * 0.3, (bz + zz + y) * 0.3, 55) - 0.5) * 4;
      if (d > R) continue;
      const X = Math.round(bx + xx), Y = Math.round(byy + y), Z = Math.round(bz + zz);
      if (Y >= g.h - 2) continue;
      const shade = y < -R * 0.3 ? M.LEAF_DARK : M.LEAF;
      g.put(X, Y, Z, hash2(X, Z, Y) < flowers ? M.BLOSSOM : hash2(X, Y, Z) < 0.1 ? M.GRASS_LIGHT : shade);
    }
  }
}

/* ----------------------------------------------------------------- props */

export function chest(c: RoomCtx, x0: number, z0: number) {
  const { g } = c;
  const y0 = FLOOR - 1;
  g.box(x0, y0, z0, x0 + 12, y0 + 6, z0 + 8, (x, y, z) =>
    x === x0 + 2 || x === x0 + 9 || (y === y0 + 5 && (z === z0 || z === z0 + 7)) ? M.GOLD : M.CHEST);
  g.box(x0 + 1, y0 + 6, z0 + 1, x0 + 11, y0 + 8, z0 + 7, (x) => (x === x0 + 2 || x === x0 + 9 ? M.GOLD : M.CHEST));
  g.box(x0 + 5, y0 + 3, z0 + 8, x0 + 7, y0 + 6, z0 + 9, M.GOLD);
}

export function crate(c: RoomCtx, x0: number, y0: number, z0: number, s: number) {
  c.g.box(x0, y0, z0, x0 + s, y0 + s, z0 + s, (x, y, z) => {
    const e = (a: number, lo: number) => a === lo || a === lo + s - 1;
    const edges = (e(x, x0) ? 1 : 0) + (e(y, y0) ? 1 : 0) + (e(z, z0) ? 1 : 0);
    return edges >= 2 ? M.PLANK_DARK : (y - y0) % 3 === 0 ? M.PLANK_DARK : M.PLANK;
  });
}

export function barrel(c: RoomCtx, cx: number, cz: number, top: number = M.PLANK_DARK) {
  for (let y = FLOOR - 1; y < FLOOR + 12; y++) {
    const rad = 4 + Math.sin(((y - FLOOR) / 12) * Math.PI) * 1.2;
    for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) if (Math.hypot(x, z) <= rad)
      c.g.set(cx + x, y, cz + z, y === FLOOR + 11 ? top : y === FLOOR + 1 || y === FLOOR + 9 ? M.IRON : (Math.atan2(z, x) * 4 | 0) % 2 ? M.PLANK : M.PLANK_DARK);
  }
}

export function lantern(c: RoomCtx, x: number, z: number) {
  const { g } = c;
  const base = FLOOR - 1;
  g.box(x, base, z, x + 2, base + 18, z + 2, M.BARK);
  g.box(x - 1, base + 18, z - 1, x + 3, base + 19, z + 3, M.IRON);
  g.box(x - 1, base + 19, z - 1, x + 3, base + 23, z + 3, (xx, y, zz) => ((xx === x - 1 || xx === x + 2) && (zz === z - 1 || zz === z + 2) ? M.IRON : M.LANTERN));
  g.box(x - 1, base + 23, z - 1, x + 3, base + 24, z + 3, M.IRON);
  c.lights.push({ pos: [x + 1, FLOOR + 20.5, z + 1], radius: 36, color: [1.0, 0.7, 0.35], flicker: 0.1 });
}

export function crystal(c: RoomCtx, cx: number, cz: number, h: number, lean: number, mat: number = M.CRYSTAL, base = FLOOR - 1) {
  for (let y = 0; y < h; y++) {
    const rad = Math.max(0.6, 2.4 * (1 - y / h));
    const ox = Math.round(lean * y);
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) if (Math.abs(x) + Math.abs(z) <= rad)
      c.g.set(cx + x + ox, base + y, cz + z, mat);
  }
}

export function shroom(c: RoomCtx, x: number, z: number, light = true) {
  const { g } = c;
  const ty = g.top(x, z, FLOOR + 3);
  g.set(x, ty + 1, z, M.BARK); g.set(x, ty + 2, z, M.BARK);
  g.box(x - 1, ty + 3, z - 1, x + 2, ty + 4, z + 2, M.SHROOM);
  g.set(x, ty + 4, z, M.SHROOM);
  if (light) c.lights.push({ pos: [x + 0.5, ty + 4, z + 0.5], radius: 14, color: [0.35, 0.9, 0.8] });
}

export function candle(c: RoomCtx, x: number, y: number, z: number, h = 3, light = true) {
  const { g } = c;
  for (let k = 0; k < h; k++) g.set(x, y + k, z, M.CANDLE);
  g.set(x, y + h, z, M.FLAME);
  if (light) c.lights.push({ pos: [x + 0.5, y + h + 1, z + 0.5], radius: 18, color: [1.0, 0.72, 0.38], flicker: 0.25 });
}

export function table(c: RoomCtx, x0: number, z0: number, w: number, d: number, h = 8) {
  const { g } = c;
  const y0 = FLOOR - 1;
  g.box(x0, y0 + h, z0, x0 + w, y0 + h + 1, z0 + d, M.PLANK);
  g.box(x0, y0 + h - 1, z0, x0 + w, y0 + h, z0 + d, (x, y, z) => (x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + d - 1 ? M.PLANK_DARK : M.AIR));
  for (const [x, z] of [[x0 + 1, z0 + 1], [x0 + w - 2, z0 + 1], [x0 + 1, z0 + d - 2], [x0 + w - 2, z0 + d - 2]]) g.box(x, y0, z, x + 1, y0 + h, z + 1, M.PLANK_DARK);
  return y0 + h + 1; // top surface
}

const BOOKS = [M.BOOK_R, M.BOOK_B, M.BOOK_G, M.BOOK_Y, M.BOOK_R, M.BOOK_B, M.PAPER];

/* A bookcase against a wall face (along u from u0, `len` long), books on
   shelves every 7 voxels, some gaps, some leaning. */
export function bookcase(c: RoomCtx, side: Side, u0: number, len: number, height = 40, depth = 5) {
  const { g } = c;
  const wl = wallFaces(c).find((w) => w.side === side)!;
  for (let u = u0; u < u0 + len; u++) for (let y = FLOOR - 1; y < FLOOR + height; y++) for (let k = 1; k <= depth; k++) {
    const [x, yy, z] = wl.at(u, y, k);
    const edge = u === u0 || u === u0 + len - 1 || y === FLOOR + height - 1;
    const shelf = (y - FLOOR) % 7 === 0;
    if (edge || shelf || k === 1) { g.set(x, yy, z, M.PLANK_DARK); continue; }
    if (k === depth) continue;
    const slot = (y - FLOOR) % 7; // 1..6 above a shelf
    const id = u * 7 + Math.floor((y - FLOOR) / 7) * 131;
    const bh = 3 + Math.floor(hash2(id, 1, c.seed) * 3);
    const gap = hash2(Math.floor(u / 3), Math.floor((y - FLOOR) / 7), c.seed + 4) < 0.12;
    if (!gap && slot <= bh) g.set(x, yy, z, BOOKS[Math.floor(hash2(id, 2, c.seed) * BOOKS.length)]);
  }
}

export function freeShelf(c: RoomCtx, x0: number, z0: number, len: number, alongX: boolean, height = 30) {
  const { g } = c;
  for (let i = 0; i < len; i++) for (let y = FLOOR - 1; y < FLOOR + height; y++) for (let k = 0; k < 6; k++) {
    const x = alongX ? x0 + i : x0 + k, z = alongX ? z0 + k : z0 + i;
    const edge = i === 0 || i === len - 1 || y === FLOOR + height - 1;
    const shelf = (y - FLOOR) % 7 === 0;
    if (edge || shelf || k === 3) { g.set(x, y, z, M.PLANK_DARK); continue; }
    const id = i * 7 + Math.floor((y - FLOOR) / 7) * 131 + k * 977;
    const bh = 3 + Math.floor(hash2(id, 1, c.seed) * 3);
    if ((y - FLOOR) % 7 <= bh && hash2(Math.floor(i / 3) + k, Math.floor((y - FLOOR) / 7), c.seed + 5) > 0.1)
      g.set(x, y, z, BOOKS[Math.floor(hash2(id, 2, c.seed) * BOOKS.length)]);
  }
}

export function carpet(c: RoomCtx, x0: number, z0: number, x1: number, z1: number) {
  c.g.box(x0, FLOOR, z0, x1, FLOOR + 1, z1, (x, y, z) =>
    x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1 ? M.CARPET_TRIM : (x === x0 + 2 || x === x1 - 3 || z === z0 + 2 || z === z1 - 3) && hash2(x, z, 3) < 0.7 ? M.CARPET_TRIM : M.CARPET);
}

export function column(c: RoomCtx, cx: number, cz: number, height: number, mat: number = M.MARBLE) {
  const { g } = c;
  for (let y = FLOOR - 1; y < FLOOR + height; y++) {
    const capital = y < FLOOR + 2 || y > FLOOR + height - 4;
    const rad = capital ? 4.6 : 3.2;
    for (let z = -5; z <= 5; z++) for (let x = -5; x <= 5; x++) {
      if (capital ? Math.max(Math.abs(x), Math.abs(z)) > 4 : Math.hypot(x, z) > rad) continue;
      const flute = !capital && Math.round((Math.atan2(z, x) / Math.PI) * 6) % 2 === 0 && Math.hypot(x, z) > 2.6;
      g.set(cx + x, y, cz + z, flute ? M.MARBLE_DARK : mat);
    }
  }
}

export function brazier(c: RoomCtx, cx: number, cz: number, h = 10) {
  const { g } = c;
  g.box(cx, FLOOR - 1, cz, cx + 2, FLOOR + h, cz + 2, M.IRON);
  for (let z = -4; z <= 5; z++) for (let x = -4; x <= 5; x++) {
    const d = Math.hypot(x - 0.5, z - 0.5);
    if (d > 4.6) continue;
    g.set(cx + x, FLOOR + h, cz + z, d > 3.6 ? M.IRON : M.COAL);
    if (d > 3.6) g.set(cx + x, FLOOR + h + 1, cz + z, M.IRON);
    else if (hash2(cx + x, cz + z, 5) < 0.75) {
      g.set(cx + x, FLOOR + h + 1, cz + z, M.FIRE);
      if (d < 2.5 && hash2(cx + x, cz + z, 6) < 0.6) g.set(cx + x, FLOOR + h + 2, cz + z, d < 1.4 ? M.FIRE : M.EMBER);
    }
  }
  c.lights.push({ pos: [cx + 1, FLOOR + h + 4, cz + 1], radius: 40, color: [1.0, 0.55, 0.22], flicker: 0.3 });
  c.emitters.push({ kind: 'ember', pos: [cx + 1, FLOOR + h + 2, cz + 1], size: [3, 2, 3], count: 6 });
}

export function goldPile(c: RoomCtx, cx: number, cz: number, rad: number) {
  const { g } = c;
  for (let z = -rad; z <= rad; z++) for (let x = -rad; x <= rad; x++) {
    const d = Math.hypot(x, z) / rad;
    if (d > 1) continue;
    const h = Math.round((1 - d * d) * rad * 0.55 + vnoise((cx + x) * 0.4, (cz + z) * 0.4, 8));
    for (let y = 0; y <= h; y++) g.set(cx + x, FLOOR + y, cz + z, hash2(cx + x, cz + z, y) < 0.3 ? M.COIN : M.GOLD);
  }
}

/* ---------------------------------------------------------- doors & stairs */

const doorCenter = (c: RoomCtx, d: Door) => d.at;

/* Carve each door through its wall with a stone frame, and clear a path in. */
export function carveDoors(c: RoomCtx) {
  const { g } = c;
  for (const d of c.doors) {
    const wl = wallFaces(c).find((w) => w.side === d.side)!;
    const cu = doorCenter(c, d), hw = d.width / 2, top = FLOOR + 26;
    const archY = top - hw;
    const inDoor = (u: number, y: number, pad = 0) =>
      y >= FLOOR && (y <= archY ? Math.abs(u + 0.5 - cu) <= hw + pad : Math.hypot(u + 0.5 - cu, y - archY) <= hw + pad);
    for (let u = Math.floor(cu - hw - 3); u <= cu + hw + 3; u++) for (let y = FLOOR - 1; y < top + 4; y++) {
      // through the whole wall, plus whatever was built up against it
      for (let k = -(WALL_T - 1); k <= 14; k++) {
        const [x, yy, z] = wl.at(u, y, k);
        if (inDoor(u, y)) {
          if (y === FLOOR - 1) { if (k <= 0) g.set(x, yy, z, M.STEP); }
          else if (k <= 0 || k < 14) g.set(x, yy, z, M.AIR);
        } else if (inDoor(u, y, 2) && (k === 1 || k === 0)) g.set(x, yy, z, M.STEP);
      }
    }
  }
}

/* Stairs climbing the back (z = 0) wall to a dark archway: the way up. */
export function stairsUp(c: RoomCtx) {
  const { g, W } = c;
  const sz0 = WALL_T, sw = 16, steps = 12;
  const stepTop = (i: number) => FLOOR + 3 + i * 3;
  // clear what the theme put there first
  g.box(W - WALL_T - steps * 4 - 22, FLOOR, sz0, W - WALL_T, WALL_H, sz0 + sw + 4, M.AIR);
  for (let i = 0; i < steps; i++) {
    const x1 = W - WALL_T - i * 4, x0 = x1 - 4, ytop = stepTop(i);
    g.box(x0, FLOOR - 1, sz0, x1, ytop, sz0 + sw, (x, y, z) => {
      if (y === ytop - 1) return M.STEP;
      if (z === sz0 + sw - 1) return (y % 6 === 0 || (x + (Math.floor(y / 6) & 1) * 4) % 8 === 0) ? M.MORTAR : M.BRICK;
      return M.ROCK;
    });
  }
  const landTop = stepTop(steps - 1);
  const doorX0 = W - WALL_T - steps * 4 - 18;
  g.box(doorX0 - 2, FLOOR - 1, sz0, W - WALL_T - steps * 4, landTop, sz0 + sw, (x, y, z) =>
    y === landTop - 1 ? M.STEP : (z === sz0 + sw - 1 || x === doorX0 - 2) && (y % 6 === 0 || (x + z) % 8 === 0) ? M.MORTAR : M.BRICK);
  const doorY0 = landTop;
  for (let y = doorY0; y < doorY0 + 25; y++) for (let x = doorX0 - 2; x < doorX0 + 16; x++) {
    const cx = doorX0 + 7, archY = doorY0 + 15;
    const inside = y <= archY ? (x >= doorX0 && x < doorX0 + 14) : Math.hypot(x + 0.5 - cx, y - archY) <= 7;
    const outer = y <= archY ? (x >= doorX0 - 2 && x < doorX0 + 16) : Math.hypot(x + 0.5 - cx, y - archY) <= 9;
    if (inside) for (let z = 0; z < WALL_T; z++) g.set(x, y, z, M.AIR);
    else if (outer) g.set(x, y, WALL_T, M.STEP);
  }
  // a pair of candles to mark the way
  candle(c, doorX0 - 4, landTop, WALL_T + 2, 4);
  candle(c, doorX0 + 17, landTop, WALL_T + 2, 4);
  c.emitters.push({ kind: 'sparkle', pos: [doorX0 + 7, landTop + 10, WALL_T + 3], size: [10, 10, 4], count: 6, color: [1, 0.9, 0.6] });
}

/* Steps down through the floor, marked by a ring of stones: the way down. */
export function stairsDown(c: RoomCtx, hx: number, hz: number) {
  const { g } = c;
  const hw = 14, hl = 22;
  g.box(hx - 3, FLOOR, hz - 3, hx + hw + 3, FLOOR + 30, hz + hl + 3, M.AIR);
  for (let i = 0; i < hl; i++) {
    const depth = Math.min(FLOOR - 1, 1 + Math.floor(i * 0.6));
    for (let w = 0; w < hw; w++) {
      for (let y = FLOOR - depth; y < FLOOR + 2; y++) g.set(hx + w, y, hz + i, M.AIR);
      g.set(hx + w, FLOOR - depth - 1, hz + i, i % 2 ? M.STEP : M.ROCK);
      for (let y = 1; y < FLOOR - depth - 1; y++) g.set(hx + w, y, hz + i, M.DARK);
    }
  }
  for (let i = -1; i <= hl; i++) for (const w of [-1, hw]) { g.set(hx + w, FLOOR - 1, hz + i, M.STEP); g.set(hx + w, FLOOR, hz + i, i % 4 === 0 ? M.STEP : M.AIR); }
  for (let w = -1; w <= hw; w++) g.set(hx + w, FLOOR - 1, hz - 1, M.STEP);
  candle(c, hx - 2, FLOOR, hz - 2, 3);
  candle(c, hx + hw + 1, FLOOR, hz - 2, 3);
}
