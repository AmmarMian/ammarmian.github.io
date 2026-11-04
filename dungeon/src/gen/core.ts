/* Shared basics for room generation: the voxel grid, noise, and materials.
 *
 * A room is a byte per voxel: 0 is air, anything else indexes the material
 * palette in scene.wgsl (keep MAT_* there in step with M here). */

export const H = 80; // room height in voxels (corridors use less)
export const FLOOR = 10; // top of the floor slab
export const WALL_T = 6; // wall thickness
export const WALL_H = 74;
export const WATER_Y = 8.6; // must match scene.wgsl

export const M = {
  AIR: 0, STONE: 1, GROUT: 2, BRICK: 3, MORTAR: 4, MOSS: 5, GRASS: 6, DIRT: 7,
  PLANK: 8, PLANK_DARK: 9, POOLBED: 10, LILY: 11, LEAF: 12, VINE: 13,
  FLOWER_W: 14, FLOWER_P: 15, GOLD: 16, CHEST: 17, LANTERN: 18, CRYSTAL: 19,
  STEP: 20, ROCK: 21, SAND: 22, BARK: 23, REED: 24, SHROOM: 25, DARK: 26,
  IRON: 27, GRASS_LIGHT: 28, LEAF_DARK: 29, CATTAIL: 30,
  BOOK_R: 31, BOOK_B: 32, BOOK_G: 33, BOOK_Y: 34, CANDLE: 35, FLAME: 36,
  POTION_P: 37, POTION_G: 38, POTION_R: 39, BREW: 40, CARPET: 41, CARPET_TRIM: 42,
  FIRE: 43, EMBER: 44, AMETHYST: 45, MARBLE: 46, BLOSSOM: 47, PAPER: 48, COAL: 49,
  CAVE: 50, COIN: 51, MARBLE_DARK: 52, GLASS: 53,
} as const;

/* Plants sway in the shader by up to SWAY voxels (their bricks are dilated). */
export const SWAY = 2;
export const PLANTS = new Set<number>([M.GRASS, M.LEAF, M.VINE, M.FLOWER_W, M.FLOWER_P, M.REED, M.GRASS_LIGHT, M.LEAF_DARK, M.CATTAIL]);

export type V3 = [number, number, number];
/* A window in the room's x = 0 wall: z0, z1, y0, y1 (local). */
export type Window = [number, number, number, number];
export interface Light { pos: V3; radius: number; color: V3; flicker?: number }
export type EmitterKind = 'dust' | 'firefly' | 'leaf' | 'petal' | 'ember' | 'bubble' | 'sparkle' | 'gold';
export interface Emitter { kind: EmitterKind; pos: V3; size: V3; count: number; color?: V3 }

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
export type Rng = ReturnType<typeof rng>;

export function hash2(x: number, z: number, s = 0) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, z: number, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, z: number, s = 0) {
  return vnoise(x, z, s) * 0.55 + vnoise(x * 2.1, z * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 13) * 0.15;
}

export class Grid {
  readonly v: Uint8Array<ArrayBuffer>;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  constructor(w: number, d: number, h = H) {
    this.w = w; this.d = d; this.h = h;
    this.v = new Uint8Array(w * h * d);
  }
  idx(x: number, y: number, z: number) { return x + this.w * (z + this.d * y); }
  inb(x: number, y: number, z: number) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  get(x: number, y: number, z: number) { return this.inb(x, y, z) ? this.v[this.idx(x, y, z)] : 0; }
  set(x: number, y: number, z: number, m: number) { if (this.inb(x, y, z)) this.v[this.idx(x, y, z)] = m; }
  /* Only fills air. */
  put(x: number, y: number, z: number, m: number) { if (this.inb(x, y, z) && !this.v[this.idx(x, y, z)]) this.v[this.idx(x, y, z)] = m; }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number | ((x: number, y: number, z: number) => number)) {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++)
      for (let z = Math.max(0, z0); z < Math.min(this.d, z1); z++)
        for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++)
          this.set(x, y, z, typeof m === 'number' ? m : m(x, y, z));
  }
  /* Highest solid voxel in a column at or below `from`, or -1. */
  top(x: number, z: number, from = this.h - 1) {
    for (let y = from; y >= 0; y--) if (this.get(x, y, z)) return y;
    return -1;
  }
}
