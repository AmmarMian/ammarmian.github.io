/* One dungeon room as a voxel grid.
 *
 * The renderer ray-marches this grid directly (see scene.wgsl), so a room is
 * nothing more than a byte per voxel: 0 is air, anything else indexes the
 * material palette shared with the shader. Rooms are generated, not modelled,
 * so later floors can be rolled from a seed with the stairs placed anywhere.
 */

export const H = 80; // y (up); width (x) and depth (z) vary per room

export const FLOOR = 10; // top of the floor slab
export const WALL_T = 6; // thickness of the two back walls
export const WALL_H = 74;
export const WATER_Y = 8.6; // must match scene.wgsl

export const M = {
  AIR: 0, STONE: 1, GROUT: 2, BRICK: 3, MORTAR: 4, MOSS: 5, GRASS: 6, DIRT: 7,
  PLANK: 8, PLANK_DARK: 9, POOLBED: 10, LILY: 11, LEAF: 12, VINE: 13,
  FLOWER_W: 14, FLOWER_P: 15, GOLD: 16, CHEST: 17, LANTERN: 18, CRYSTAL: 19,
  STEP: 20, ROCK: 21, SAND: 22, BARK: 23, REED: 24, SHROOM: 25, DARK: 26,
  IRON: 27, GRASS_LIGHT: 28, LEAF_DARK: 29, CATTAIL: 30,
} as const;

/* Window in the left wall (x = 0) through which the sun comes in. The shader
   gets the same rectangles to draw the light shafts analytically. */
export type Window = [z0: number, z1: number, y0: number, y1: number];
export interface Light { pos: [number, number, number]; radius: number; color: [number, number, number] }

export interface Room {
  grid: Grid;
  bricks: Uint32Array<ArrayBuffer>;
  w: number;
  d: number;
  windows: Window[];
  lights: Light[];
}

/* Mulberry32: small, fast, seedable. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, z: number, s = 0) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, z: number, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number, s = 0) {
  return vnoise(x, z, s) * 0.55 + vnoise(x * 2.1, z * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 13) * 0.15;
}

export class Grid {
  readonly v: Uint8Array<ArrayBuffer>;
  readonly w: number;
  readonly d: number;
  constructor(w: number, d: number) { this.w = w; this.d = d; this.v = new Uint8Array(w * H * d); }
  idx(x: number, y: number, z: number) { return x + this.w * (z + this.d * y); }
  inb(x: number, y: number, z: number) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < H && z < this.d; }
  get(x: number, y: number, z: number) { return this.inb(x, y, z) ? this.v[this.idx(x, y, z)] : 0; }
  set(x: number, y: number, z: number, m: number) { if (this.inb(x, y, z)) this.v[this.idx(x, y, z)] = m; }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number | ((x: number, y: number, z: number) => number)) {
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++)
      this.set(x, y, z, typeof m === 'number' ? m : m(x, y, z));
  }
  /* Highest solid voxel in a column, or -1. */
  top(x: number, z: number) {
    for (let y = H - 1; y >= 0; y--) if (this.get(x, y, z)) return y;
    return -1;
  }
}

export function buildRoom(seed = 7, W = 256, D = 208): Room {
  const g = new Grid(W, D);
  const r = rng(seed);
  /* The layout was drawn on a 160 x 160 room; X/Z stretch it to this one. */
  const X = (v: number) => Math.round((v * W) / 160);
  const Z = (v: number) => Math.round((v * D) / 160);
  const area = (W * D) / (160 * 160);
  const lights: Light[] = [];
  const windows: Window[] = [];
  const nWin = Math.max(1, Math.round(D / 60));
  for (let i = 0; i < nWin; i++) {
    const c = Math.round(WALL_T + 14 + ((D - WALL_T - 40) * (i + 0.5)) / nWin);
    windows.push([c - 8, c + 8, 36, 62]);
  }

  /* ---- pool mask: a kidney-shaped pond across the front of the room ---- */
  const pool = (x: number, z: number) => {
    if (x < WALL_T + 3 || z < WALL_T + 3 || x > W - WALL_T - 9 || z > D - WALL_T - 9) return false;
    const n = fbm(x * 0.045, z * 0.045, seed) - 0.5;
    const cx = X(104), cz = Z(102);
    const dx = (x - cx) / X(50), dz = (z - cz) / Z(40);
    const d1 = Math.hypot(dx, dz);
    const dx2 = (x - X(60)) / X(30), dz2 = (z - Z(128)) / Z(26);
    const d2 = Math.hypot(dx2, dz2);
    return Math.min(d1, d2) + n * 0.55 < 1;
  };

  /* ---- floor slab with flagstones ---- */
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const inPool = pool(x, z);
    // strata on the visible slab edge
    for (let y = 0; y < FLOOR; y++) {
      const band = (y + Math.floor(vnoise(x * 0.2, z * 0.2, 3) * 3)) % 5;
      g.set(x, y, z, band < 2 ? M.DIRT : M.ROCK);
    }
    if (inPool) {
      const bed = 3 + Math.floor(vnoise(x * 0.15, z * 0.15, 5) * 2);
      for (let y = bed; y < FLOOR; y++) g.set(x, y, z, M.AIR);
      g.set(x, bed - 1, z, hash2(x, z, 9) < 0.15 ? M.ROCK : M.SAND);
      g.set(x, 0, z, M.POOLBED); // tag read by the shader: water lives above this column
      continue;
    }
    // flagstones 10x10, staggered every other row
    const row = Math.floor(z / 10);
    const ox = (row & 1) * 5;
    const gx = (x + ox) % 10, gz = z % 10;
    const grout = gx === 0 || gz === 0;
    const tileId = Math.floor((x + ox) / 10) * 31 + row * 17;
    const sunk = hash2(tileId, 1, seed) < 0.12;
    if (grout) {
      g.set(x, FLOOR - 1, z, M.AIR);
      g.set(x, FLOOR - 2, z, M.GROUT);
    } else {
      g.set(x, FLOOR - 2, z, M.STONE);
      g.set(x, FLOOR - 1, z, sunk ? M.AIR : M.STONE);
    }
  }

  /* ---- moss & grass creeping over the stones, thickest near water and walls ---- */
  const distPool = new Float32Array(W * D).fill(99);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (pool(x, z)) distPool[x + W * z] = 0;
  for (let pass = 0; pass < 2; pass++) // crude chamfer distance
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const zz = pass ? D - 1 - z : z, xx = pass ? W - 1 - x : x;
      let d = distPool[xx + W * zz];
      const s = pass ? 1 : -1;
      if (xx + s >= 0 && xx + s < W) d = Math.min(d, distPool[xx + s + W * zz] + 1);
      if (zz + s >= 0 && zz + s < D) d = Math.min(d, distPool[xx + W * (zz + s)] + 1);
      distPool[xx + W * zz] = d;
    }

  for (let z = WALL_T; z < D - WALL_T; z++) for (let x = WALL_T; x < W - WALL_T; x++) {
    if (g.get(x, 0, z) === M.POOLBED) continue;
    const dp = distPool[x + W * z];
    const dw = Math.min(x - WALL_T, z - WALL_T, W - WALL_T - 1 - x, D - WALL_T - 1 - z);
    const n = fbm(x * 0.08, z * 0.08, seed + 21);
    const moss = n + Math.max(0, 1 - dp / 14) * 0.55 + Math.max(0, 1 - dw / 10) * 0.25;
    if (moss > 0.72) {
      const ty = g.top(x, z);
      g.set(x, ty + 1, z, moss > 0.95 ? M.GRASS : M.MOSS);
      if (moss > 0.9 && hash2(x, z, 4) < 0.22) {
        // grass blades
        const h = 1 + Math.floor(hash2(x, z, 5) * (moss > 1.0 ? 5 : 3));
        for (let k = 0; k < h; k++) g.set(x, ty + 2 + k, z, k === h - 1 && h > 2 ? M.GRASS_LIGHT : M.GRASS);
      } else if (moss > 0.85 && hash2(x, z, 6) < 0.012) {
        g.set(x, ty + 2, z, hash2(x, z, 7) < 0.5 ? M.FLOWER_W : M.FLOWER_P);
        g.set(x, ty + 1, z, M.GRASS);
      }
    }
  }

  /* ---- grass sprouting from the grout lines ---- */
  for (let z = WALL_T; z < D; z++) for (let x = WALL_T; x < W; x++) {
    if (g.get(x, FLOOR - 2, z) !== M.GROUT || g.get(x, FLOOR - 1, z)) continue;
    const n = fbm(x * 0.06, z * 0.06, seed + 51);
    if (n > 0.5 && hash2(x, z, 52) < 0.5) {
      g.set(x, FLOOR - 1, z, M.MOSS);
      if (hash2(x, z, 53) < 0.25) {
        const h = 1 + Math.floor(hash2(x, z, 54) * 3);
        for (let k = 0; k < h; k++) g.set(x, FLOOR + k, z, k === h - 1 ? M.GRASS_LIGHT : M.GRASS);
      }
    }
  }

  /* ---- back walls: brick courses with recessed mortar ---- */
  const brick = (u: number, y: number) => {
    const course = Math.floor(y / 6);
    const off = (course & 1) * 6;
    return (y % 6 === 0) || ((u + off) % 12 === 0);
  };
  // Four walls. The two facing the camera are cut down by the renderer, so
  // the room can be turned to any side.
  for (let y = 0; y < WALL_H; y++) {
    for (let z = 0; z < D; z++) for (let t = 0; t < WALL_T; t++) {
      const m = brick(z, y) ? M.MORTAR : M.BRICK;
      const face = t === WALL_T - 1;
      if (!(face && m === M.MORTAR && z >= WALL_T && z < D - WALL_T)) { g.set(t, y, z, m); g.set(W - 1 - t, y, z, m); }
    }
    for (let x = 0; x < W; x++) for (let t = 0; t < WALL_T; t++) {
      const m = brick(x, y) ? M.MORTAR : M.BRICK;
      const face = t === WALL_T - 1;
      if (!(face && m === M.MORTAR && x >= WALL_T && x < W - WALL_T)) { g.set(x, y, t, m); g.set(x, y, D - 1 - t, m); }
    }
  }
  // corner pillars
  const pillar = (x0: number, z0: number) =>
    g.box(x0, 0, z0, x0 + 6, WALL_H + 2, z0 + 6, (x, y, z) => (y % 8 === 0 ? M.MORTAR : M.STEP));
  pillar(WALL_T - 1, WALL_T - 1); pillar(W - WALL_T - 5, WALL_T - 1);
  pillar(WALL_T - 1, D - WALL_T - 5); pillar(W - WALL_T - 5, D - WALL_T - 5);
  // cap stones on wall tops
  g.box(0, WALL_H, 0, WALL_T + 1, WALL_H + 2, D, M.STEP);
  g.box(W - WALL_T - 1, WALL_H, 0, W, WALL_H + 2, D, M.STEP);
  g.box(0, WALL_H, 0, W, WALL_H + 2, WALL_T + 1, M.STEP);
  g.box(0, WALL_H, D - WALL_T - 1, W, WALL_H + 2, D, M.STEP);

  /* ---- arched windows in the left wall ---- */
  for (const [z0, z1, y0, y1] of windows) {
    const cz = (z0 + z1) / 2, rad = (z1 - z0) / 2;
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      const archY = y1 - rad;
      if (y > archY && Math.hypot(z + 0.5 - cz, y - archY) > rad) continue;
      for (let x = 0; x < WALL_T; x++) g.set(x, y, z, M.AIR);
    }
    // sill
    g.box(0, y0 - 2, z0 - 1, WALL_T + 2, y0, z1 + 1, M.STEP);
    // ivy spilling in over the sill
    for (let z = z0; z < z1; z++) {
      if (hash2(z, y0, 11) < 0.55) {
        const len = 2 + Math.floor(hash2(z, y0, 12) * 10);
        for (let k = 0; k < len; k++) g.set(WALL_T + 1 + (k > len - 2 ? 1 : 0), y0 - 2 - k, z, k % 3 === 2 ? M.LEAF : M.VINE);
      }
    }
  }

  /* ---- stairs up, climbing the right wall (z = 0) towards an archway.
     They rise away from the camera so every riser faces the viewer. ---- */
  const sz0 = WALL_T, sw = 16, steps = 12;
  const stepTop = (i: number) => FLOOR + 3 + i * 3;
  for (let i = 0; i < steps; i++) {
    const x1 = W - WALL_T - i * 4, x0 = x1 - 4;
    const ytop = stepTop(i);
    g.box(x0, FLOOR - 1, sz0, x1, ytop, sz0 + sw, (x, y, z) => {
      if (y === ytop - 1) return M.STEP;
      if (z === sz0 + sw - 1) return (y % 6 === 0 || (x + (Math.floor(y / 6) & 1) * 4) % 8 === 0) ? M.MORTAR : M.BRICK;
      return M.ROCK;
    });
  }
  // landing under the door
  const landTop = stepTop(steps - 1);
  const doorX0 = W - WALL_T - steps * 4 - 18;
  g.box(doorX0 - 2, FLOOR - 1, sz0, W - WALL_T - steps * 4, landTop, sz0 + sw, (x, y, z) =>
    y === landTop - 1 ? M.STEP : (z === sz0 + sw - 1 || x === doorX0 - 2) && (y % 6 === 0 || (x + z) % 8 === 0) ? M.MORTAR : M.BRICK);
  // dark doorway in the wall at the top of the stairs
  const doorY0 = landTop;
  for (let y = doorY0; y < doorY0 + 22; y++) for (let x = doorX0; x < doorX0 + 14; x++) {
    const cx = doorX0 + 7, archY = doorY0 + 15;
    if (y > archY && Math.hypot(x + 0.5 - cx, y - archY) > 7) continue;
    for (let z = 0; z < WALL_T; z++) g.set(x, y, z, M.AIR);
  }
  // door frame
  for (let y = doorY0; y < doorY0 + 25; y++) for (let x = doorX0 - 2; x < doorX0 + 16; x++) {
    const cx = doorX0 + 7, archY = doorY0 + 15;
    const inside = y <= archY ? (x >= doorX0 && x < doorX0 + 14) : Math.hypot(x + 0.5 - cx, y - archY) <= 7;
    const outer = y <= archY ? (x >= doorX0 - 2 && x < doorX0 + 16) : Math.hypot(x + 0.5 - cx, y - archY) <= 9;
    if (outer && !inside) g.set(x, y, WALL_T, M.STEP);
  }

  /* ---- stairs down: a hatch in the floor, back-left ---- */
  const hx = 18, hz = Z(64), hw = 14, hl = 22;
  for (let i = 0; i < hl; i++) {
    const depth = Math.min(FLOOR - 1, 1 + Math.floor(i * 0.6));
    for (let w = 0; w < hw; w++) {
      for (let y = FLOOR - depth; y < FLOOR + 2; y++) g.set(hx + w, y, hz + i, M.AIR);
      g.set(hx + w, FLOOR - depth - 1, hz + i, i % 2 ? M.STEP : M.ROCK);
      for (let y = 1; y < FLOOR - depth - 1; y++) g.set(hx + w, y, hz + i, M.DARK);
    }
  }
  // rim
  for (let i = -1; i <= hl; i++) for (const w of [-1, hw]) g.set(hx + w, FLOOR - 1, hz + i, M.STEP), g.set(hx + w, FLOOR, hz + i, M.AIR);
  for (let w = -1; w <= hw; w++) g.set(hx + w, FLOOR - 1, hz - 1, M.STEP);

  /* ---- wooden boardwalk across the pond ---- */
  const bz0 = Z(74), bw = 12, bY = FLOOR + 1;
  for (let x = X(54); x < X(148); x++) {
    const plank = Math.floor(x / 3);
    const missing = hash2(plank, 0, seed + 3) < 0.06;
    for (let z = bz0; z < bz0 + bw; z++) {
      if (missing && z > bz0 + 2 && z < bz0 + bw - 3) continue;
      const m = x % 3 === 0 ? M.PLANK_DARK : M.PLANK;
      g.set(x, bY, z, m);
      if (hash2(x, z, 31) < 0.02) g.set(x, bY, z, M.MOSS);
    }
    // stringers under the planks
    g.set(x, bY - 1, bz0 + 1, M.PLANK_DARK);
    g.set(x, bY - 1, bz0 + bw - 2, M.PLANK_DARK);
  }
  for (let x = X(58); x < X(148); x += 16) for (const z of [bz0, bz0 + bw - 2]) {
    g.box(x, 2, z, x + 2, bY + 4, z + 2, (xx, y) => (y > bY ? M.BARK : M.PLANK_DARK));
  }

  /* ---- lily pads ---- */
  const wy = Math.floor(WATER_Y);
  for (let k = 0; k < 40 * area; k++) {
    const cx = X(30) + r() * X(125), cz = Z(50) + r() * Z(108);
    if (!pool(Math.floor(cx), Math.floor(cz))) continue;
    if (cz > bz0 - 5 && cz < bz0 + bw + 5) continue;
    const rad = 2.2 + r() * 3.2;
    const notch = r() * Math.PI * 2;
    for (let z = Math.floor(cz - rad); z <= cz + rad; z++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      if (Math.hypot(dx, dz) > rad) continue;
      const a = Math.atan2(dz, dx);
      let da = Math.abs(a - notch); da = Math.min(da, Math.PI * 2 - da);
      if (da < 0.35) continue;
      if (!pool(x, z) || g.get(x, wy, z)) continue;
      g.set(x, wy, z, Math.hypot(dx, dz) > rad - 1 ? M.LEAF_DARK : M.LILY);
    }
    if (r() < 0.25) { g.set(Math.floor(cx), wy + 1, Math.floor(cz), M.FLOWER_P); g.set(Math.floor(cx) + 1, wy + 1, Math.floor(cz), M.FLOWER_W); }
  }

  /* ---- reeds & cattails along the banks ---- */
  for (let z = WALL_T + 1; z < D; z++) for (let x = WALL_T + 1; x < W; x++) {
    const d = distPool[x + W * z];
    if (d > 0 && d < 3 && hash2(x, z, 41) < 0.12) {
      const ty = g.top(x, z);
      if (ty < 0 || ty > FLOOR + 1) continue;
      const h = 4 + Math.floor(hash2(x, z, 42) * 10);
      for (let k = 1; k <= h; k++) g.set(x, ty + k, z, M.REED);
      if (hash2(x, z, 43) < 0.35) { g.set(x, ty + h + 1, z, M.CATTAIL); g.set(x, ty + h + 2, z, M.CATTAIL); }
    }
  }

  /* ---- ferns ---- */
  const fern = (cx: number, cz: number, size: number) => {
    const by = g.top(cx, cz) + 1;
    const fronds = 7;
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + r() * 0.5;
      const len = size * (0.7 + r() * 0.4);
      for (let s = 0; s < len; s++) {
        const t = s / len;
        const x = Math.round(cx + Math.cos(a) * s);
        const z = Math.round(cz + Math.sin(a) * s);
        const y = Math.round(by + Math.sin(t * Math.PI) * size * 0.55 + t * 1.5);
        g.set(x, y, z, s % 2 ? M.LEAF : M.GRASS);
        if (s > 1 && s < len - 1) {
          const px = Math.round(-Math.sin(a)), pz = Math.round(Math.cos(a));
          g.set(x + px, y, z + pz, M.LEAF_DARK);
          g.set(x - px, y, z - pz, M.LEAF);
        }
      }
    }
    g.set(cx, by, cz, M.LEAF_DARK);
  };
  for (const [x, z, s] of [[14, 20, 9], [20, 140, 10], [46, 14, 8], [150, 150, 9], [88, 20, 7], [140, 44, 8], [110, 150, 8], [70, 60, 7], [30, 90, 8]])
    fern(Math.max(16, X(x)), Math.max(16, Z(z)), s);

  /* ---- mossy boulders ---- */
  const boulder = (cx: number, cz: number, rad: number) => {
    const by = FLOOR - 2;
    for (let y = -rad; y <= rad; y++) for (let z = -rad; z <= rad; z++) for (let x = -rad; x <= rad; x++) {
      const d = Math.hypot(x, y * 1.3, z) + (vnoise((cx + x) * 0.5, (cz + z + y) * 0.5, 77) - 0.5) * 1.6;
      if (d > rad) continue;
      g.set(cx + x, by + y + Math.floor(rad * 0.5), cz + z, y > rad * 0.25 && hash2(x + cx, z + cz, y) < 0.8 ? M.MOSS : M.ROCK);
    }
  };
  boulder(X(150), Z(96), 6); boulder(X(142), Z(106), 4); boulder(X(40), Z(104), 5); boulder(X(26), Z(154), 4); boulder(X(124), Z(60), 5);

  /* ---- treasure chest by the stairs ---- */
  const chest = (x0: number, z0: number) => {
    const y0 = FLOOR - 1;
    g.box(x0, y0, z0, x0 + 12, y0 + 6, z0 + 8, (x, y, z) => {
      if (x === x0 + 2 || x === x0 + 9 || y === y0 + 5 && (z === z0 || z === z0 + 7)) return M.GOLD;
      return M.CHEST;
    });
    g.box(x0 + 1, y0 + 6, z0 + 1, x0 + 11, y0 + 8, z0 + 7, (x) => (x === x0 + 2 || x === x0 + 9 ? M.GOLD : M.CHEST));
    g.box(x0 + 5, y0 + 3, z0 + 8, x0 + 7, y0 + 6, z0 + 9, M.GOLD); // lock
  };
  chest(X(54), 22);

  /* ---- crates & barrel against the left wall ---- */
  const crate = (x0: number, y0: number, z0: number, s: number) =>
    g.box(x0, y0, z0, x0 + s, y0 + s, z0 + s, (x, y, z) => {
      const e = (a: number, lo: number) => a === lo || a === lo + s - 1;
      const edges = (e(x, x0) ? 1 : 0) + (e(y, y0) ? 1 : 0) + (e(z, z0) ? 1 : 0);
      return edges >= 2 ? M.PLANK_DARK : (y - y0) % 3 === 0 ? M.PLANK_DARK : M.PLANK;
    });
  crate(WALL_T, FLOOR - 1, Z(118), 10);
  crate(WALL_T, FLOOR + 9, Z(118) + 2, 8);
  crate(WALL_T + 10, FLOOR - 1, Z(118) + 6, 8);
  // barrel
  const barrel = (cx: number, cz: number) => {
    for (let y = FLOOR - 1; y < FLOOR + 12; y++) {
      const t = (y - FLOOR) / 12;
      const rad = 4 + Math.sin(t * Math.PI) * 1.2;
      for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) if (Math.hypot(x, z) <= rad)
        g.set(cx + x, y, cz + z, y === FLOOR + 1 || y === FLOOR + 9 ? M.IRON : (Math.atan2(z, x) * 4 | 0) % 2 ? M.PLANK : M.PLANK_DARK);
    }
  };
  barrel(WALL_T + 7, Z(118) - 11);

  /* ---- lantern on a post by the boardwalk ---- */
  const lantern = (x: number, z: number, base: number) => {
    g.box(x, base, z, x + 2, base + 18, z + 2, M.BARK);
    g.box(x - 1, base + 18, z - 1, x + 3, base + 19, z + 3, M.IRON);
    g.box(x - 1, base + 19, z - 1, x + 3, base + 23, z + 3, (xx, y, zz) => ((xx === x - 1 || xx === x + 2) && (zz === z - 1 || zz === z + 2) ? M.IRON : M.LANTERN));
    g.box(x - 1, base + 23, z - 1, x + 3, base + 24, z + 3, M.IRON);
    g.set(x, base + 24, z, M.IRON); g.set(x + 1, base + 24, z + 1, M.IRON);
  };
  const lant = (x: number, z: number) => {
    lantern(x, z, FLOOR - 1);
    lights.push({ pos: [x + 1, FLOOR + 20.5, z + 1], radius: 36, color: [1.0, 0.7, 0.35] });
  };
  lant(X(54) - 2, bz0 - 3);
  lant(X(148) + 2, bz0 + bw + 1);

  /* ---- glowing crystals & mushrooms in the back-left corner ---- */
  const crystal = (cx: number, cz: number, h: number, lean: number) => {
    for (let y = 0; y < h; y++) {
      const rad = Math.max(0.6, 2.2 * (1 - y / h));
      const ox = Math.round(lean * y);
      for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) if (Math.abs(x) + Math.abs(z) <= rad)
        g.set(cx + x + ox, FLOOR - 1 + y, cz + z, M.CRYSTAL);
    }
  };
  crystal(12, 40, 14, 0.15); crystal(16, 46, 9, 0.35); crystal(10, 48, 6, -0.2);
  lights.push({ pos: [13, 16, 44], radius: 30, color: [0.3, 0.95, 0.85] });
  const shrooms: [number, number][] = [[24, 28], [28, 32], [22, 36], [X(132), Z(140)], [X(136), Z(146)], [X(62), Z(150)], [X(100), Z(40)], [X(104), Z(44)]];
  for (const [i, [x, z]] of shrooms.entries()) {
    if (i === 0 || i === 3 || i === 5 || i === 6) lights.push({ pos: [x + 2, FLOOR + 3, z + 4], radius: 14, color: [0.35, 0.9, 0.8] });
    const ty = g.top(x, z);
    g.set(x, ty + 1, z, M.BARK); g.set(x, ty + 2, z, M.BARK);
    g.box(x - 1, ty + 3, z - 1, x + 2, ty + 4, z + 2, M.SHROOM);
    g.set(x, ty + 4, z, M.SHROOM);
  }

  /* ---- vines hanging from the wall tops, moss creeping up their feet ----
     Each wall is walked along u; `at(u, y, k)` maps to the cell k voxels
     into the room from that wall's inner face. */
  const walls: { len: number; at: (u: number, y: number, k: number) => [number, number, number]; s: number }[] = [
    { len: D, at: (u, y, k) => [WALL_T - 1 + k, y, u], s: 61 },
    { len: W, at: (u, y, k) => [u, y, WALL_T - 1 + k], s: 64 },
    { len: D, at: (u, y, k) => [W - WALL_T - k, y, u], s: 67 },
    { len: W, at: (u, y, k) => [u, y, D - WALL_T - k], s: 70 },
  ];
  for (const wl of walls) {
    for (let u = WALL_T; u < wl.len - WALL_T; u++) {
      if (hash2(u, 0, wl.s) > 0.3) continue;
      const len = 6 + Math.floor(hash2(u, 1, wl.s + 1) * hash2(u, 2, wl.s + 2) * 40);
      for (let k = 0; k < len; k++) {
        const y = WALL_H - k;
        const [x, yy, z] = wl.at(u, y, 1);
        if (g.get(x, yy, z)) break;
        g.set(x, yy, z, k % 4 === 3 ? M.LEAF : M.VINE);
        if (k % 5 === 2) { const [x2, , z2] = wl.at(u + 1, y, 1); if (!g.get(x2, yy, z2)) g.set(x2, yy, z2, M.LEAF_DARK); }
      }
    }
    for (let y = 0; y < WALL_H + 2; y++) for (let u = 0; u < wl.len; u++) {
      const n = fbm(u * 0.07, y * 0.09, wl.s + 30) + Math.max(0, 1 - (y - FLOOR) / 16) * 0.4;
      const [x, , z] = wl.at(u, y, 0);
      const [xi, , zi] = wl.at(u, y, 1);
      if (n > 0.8 && g.get(x, y, z) && !g.get(xi, y, zi)) g.set(x, y, z, M.MOSS);
    }
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const ty = g.top(x, z);
    if (ty >= WALL_H && fbm(x * 0.1, z * 0.1, 93) > 0.5) {
      g.set(x, ty + 1, z, M.MOSS);
      if (hash2(x, z, 94) < 0.2) g.set(x, ty + 2, z, M.GRASS);
    }
  }

  /* ---- old roots pushing through the walls and down to the floor ---- */
  const root = (onX: boolean, u0: number, len: number, seedR: number) => {
    const rr = rng(seedR);
    let u = u0, y = WALL_H + 1, th = 3.2;
    let du = (rr() - 0.5) * 0.6;
    for (let k = 0; k < len && y > FLOOR - 1; k++) {
      y -= 1;
      du += (rr() - 0.5) * 0.25; du = Math.max(-0.7, Math.min(0.7, du));
      u += du;
      th = Math.max(1.2, th - 0.035);
      const t = Math.ceil(th);
      for (let a = -t; a <= t; a++) for (let d = 0; d < Math.max(1, t - Math.abs(a)); d++) {
        if (Math.abs(a) > th) continue;
        const uu = Math.round(u + a);
        const depth = WALL_T + d - 1;
        if (onX) { if (!g.get(depth, y, uu) || depth >= WALL_T) g.set(depth, y, uu, M.BARK); }
        else { if (!g.get(uu, y, depth) || depth >= WALL_T) g.set(uu, y, depth, M.BARK); }
      }
      if (rr() < 0.05) { // a leafy sprig
        const uu = Math.round(u + (rr() < 0.5 ? -t - 1 : t + 1));
        if (onX) g.set(WALL_T, y, uu, M.LEAF); else g.set(uu, y, WALL_T, M.LEAF);
      }
    }
    // splay out over the floor
    for (let k = 0; k < 10; k++) {
      const uu = Math.round(u + (k - 5) * 0.6);
      const reach = 3 + Math.floor(rr() * 6);
      for (let d = 0; d < reach; d++) {
        if (onX) g.set(WALL_T + d, FLOOR, uu + Math.round(d * (k - 5) * 0.15), M.BARK);
        else g.set(uu + Math.round(d * (k - 5) * 0.15), FLOOR, WALL_T + d, M.BARK);
      }
    }
  };
  root(true, Z(20), 80, 101);
  root(true, Z(120), 80, 102);
  root(false, X(28), 80, 103);
  if (W > 200) root(false, X(70), 80, 104);

  return { grid: g, bricks: buildBricks(g), w: W, d: D, windows, lights };
}

export const BRICK = 8;
/* Plants sway in the shader by up to SWAY voxels, so their bricks are dilated. */
export const SWAY = 2;
const PLANTS = new Set<number>([M.GRASS, M.LEAF, M.VINE, M.FLOWER_W, M.FLOWER_P, M.REED, M.GRASS_LIGHT, M.LEAF_DARK, M.CATTAIL]);

/* Coarse occupancy, one u32 per 8x8x8 brick: bit 0 = something solid,
   bit 1 = plants that may sway into it. Lets rays skip empty air. */
export function buildBricks(g: Grid): Uint32Array<ArrayBuffer> {
  const bw = Math.ceil(g.w / BRICK), bh = Math.ceil(H / BRICK), bd = Math.ceil(g.d / BRICK);
  const out = new Uint32Array(bw * bh * bd);
  const mark = (x: number, y: number, z: number, bit: number) => {
    if (x < 0 || z < 0 || x >= g.w || z >= g.d) return;
    out[(x >> 3) + bw * ((z >> 3) + bd * (y >> 3))] |= bit;
  };
  for (let y = 0; y < H; y++) for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
    const m = g.v[x + g.w * (z + g.d * y)];
    if (!m) continue;
    mark(x, y, z, 1);
    if (PLANTS.has(m)) for (let dz = -SWAY; dz <= SWAY; dz += SWAY) for (let dx = -SWAY; dx <= SWAY; dx += SWAY) mark(x + dx, y, z + dz, 2);
  }
  return out;
}

/* The voxel bytes padded to whole u32s, then the bricks: the `vox` buffer. */
export function packVoxels(room: Room): Uint32Array<ArrayBuffer> {
  const words = Math.ceil(room.grid.v.length / 4);
  const out = new Uint32Array(words + room.bricks.length);
  new Uint8Array(out.buffer, 0, room.grid.v.length).set(room.grid.v);
  out.set(room.bricks, words);
  return out;
}

/* Windows then lights, as the vec4f array scene.wgsl reads (`meta`). */
export function packMeta(room: Room): Float32Array<ArrayBuffer> {
  const out: number[] = [];
  for (const w of room.windows) out.push(...w);
  for (const l of room.lights) out.push(...l.pos, l.radius, ...l.color, 0);
  if (!out.length) out.push(0, 0, 0, 0);
  return new Float32Array(out);
}

/* The room-dependent part of the scene uniforms. */
export function roomParams(room: Room) {
  return {
    dims: [room.w, H, room.d] as [number, number, number],
    nWin: room.windows.length,
    nLights: room.lights.length,
  };
}

export const roomCenter = (room: Room): [number, number, number] => [room.w / 2, 26, room.d / 2];
