/* A floor of the tower: rooms in a loose grid, joined by corridors, with the
 * stairs up and down placed in random rooms. Everything is seeded by the
 * floor number, so a floor is the same every visit. */
import { type Emitter, type Light, type V3, type Window, FLOOR, Grid, M, PLANTS, SWAY, WALL_T, hash2, rng } from './core.ts';
import { type BiomeStyle, type Door, type RoomCtx, type Side, carveDoors, slab, stairsDown, stairsUp } from './build.ts';
import { BIOMES, type Biome, biomeHeader } from './biomes.ts';
import { type Theme, themeById } from './themes.ts';

export interface RoomRec {
  name: string;
  theme: string;
  kind: 'room' | 'corridor';
  x: number; // world origin of the grid (y is always 0)
  z: number;
  w: number;
  h: number;
  d: number;
  grid: Grid;
  bricks: Uint32Array<ArrayBuffer>;
  windows: Window[];
  lights: Light[];
  emitters: Emitter[];
  sky: boolean;
  amb: V3;
  stairsUp: boolean;
  stairsDown: boolean;
  liquid: number;
}

export interface Floor {
  index: number;
  name: string;
  biome: Biome;
  rooms: RoomRec[];
  bounds: [number, number, number, number]; // x0, z0, x1, z1
}

export const FLOOR_COUNT = 6;
export const FLOOR_NAMES = BIOMES.map((b) => b.name);

export const BRICK = 8;
export function buildBricks(g: Grid): Uint32Array<ArrayBuffer> {
  const bw = Math.ceil(g.w / BRICK), bh = Math.ceil(g.h / BRICK), bd = Math.ceil(g.d / BRICK);
  const out = new Uint32Array(bw * bh * bd);
  const mark = (x: number, y: number, z: number, bit: number) => {
    if (x < 0 || z < 0 || x >= g.w || z >= g.d) return;
    out[(x >> 3) + bw * ((z >> 3) + bd * (y >> 3))] |= bit;
  };
  for (let y = 0; y < g.h; y++) for (let z = 0; z < g.d; z++) for (let x = 0; x < g.w; x++) {
    const m = g.v[x + g.w * (z + g.d * y)];
    if (!m) continue;
    mark(x, y, z, 1);
    if (PLANTS.has(m)) for (let dz = -SWAY; dz <= SWAY; dz += SWAY) for (let dx = -SWAY; dx <= SWAY; dx += SWAY) mark(x + dx, y, z + dz, 2);
  }
  return out;
}

const SLOT = 272;

interface Slot { col: number; row: number; x: number; z: number; w: number; d: number; theme: Theme; doors: Door[] }

export function buildFloor(index: number): Floor {
  const seed = 1000 + index * 7919;
  const r = rng(seed);
  const cols = index % 2 === 0 ? 3 : 2 + Math.floor(r() * 2);
  const rows = 2 + (index >= 2 && r() < 0.5 ? 1 : 0);
  const target = Math.min(cols * rows, 4 + Math.floor(r() * 2) + (rows > 2 ? 1 : 0));

  /* grow a connected set of slots */
  const key = (c: number, rr: number) => c + rr * 10;
  const taken = new Map<number, [number, number]>();
  const edges: [number, number][] = [];
  const start: [number, number] = [Math.floor(r() * cols), Math.floor(r() * rows)];
  taken.set(key(...start), start);
  while (taken.size < target) {
    const list = [...taken.values()];
    const [c, rr] = list[Math.floor(r() * list.length)];
    const [dc, dr] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r() * 4)];
    const n: [number, number] = [c + dc, rr + dr];
    if (n[0] < 0 || n[1] < 0 || n[0] >= cols || n[1] >= rows || taken.has(key(...n))) continue;
    taken.set(key(...n), n);
    edges.push([key(c, rr), key(...n)]);
  }
  // a few loops, so the floor is not just a tree
  for (const [k, [c, rr]] of taken) for (const [dc, dr] of [[1, 0], [0, 1]]) {
    const k2 = key(c + dc, rr + dr);
    if (taken.has(k2) && !edges.some(([a, b]) => (a === k && b === k2) || (a === k2 && b === k)) && r() < 0.35) edges.push([k, k2]);
  }

  /* themes: from this floor's biome, distinct where possible, favourites first */
  const biome = BIOMES[index % BIOMES.length];
  const pool = [...biome.themes];
  const slots = new Map<number, Slot>();
  for (const [k, [c, rr]] of [...taken].sort((a, b) => a[0] - b[0])) {
    const pick = pool.length ? pool.splice(Math.min(pool.length - 1, Math.floor(r() * r() * pool.length)), 1)[0] : biome.themes[Math.floor(r() * biome.themes.length)];
    const w = 2 * Math.round((150 + r() * 64) / 2), d = 2 * Math.round((150 + r() * 64) / 2);
    const jx = Math.round((r() - 0.5) * (SLOT - w - 24)), jz = Math.round((r() - 0.5) * (SLOT - d - 24));
    slots.set(k, { col: c, row: rr, x: c * SLOT + (SLOT - w) / 2 + jx, z: rr * SLOT + (SLOT - d) / 2 + jz, w, d, theme: themeById(pick), doors: [] });
  }

  /* doors and the corridors between them */
  const corridors: RoomRec[] = [];
  for (const [ka, kb] of edges) {
    let a = slots.get(ka)!, b = slots.get(kb)!;
    const alongX = a.row === b.row;
    if (alongX ? a.col > b.col : a.row > b.row) [a, b] = [b, a];
    if (alongX) {
      const lo = Math.max(a.z, b.z) + WALL_T + 22, hi = Math.min(a.z + a.d, b.z + b.d) - WALL_T - 22;
      const zc = Math.round(lo + (hi - lo) * (0.3 + r() * 0.4));
      a.doors.push({ side: 'x1', at: zc - a.z, width: 18 });
      b.doors.push({ side: 'x0', at: zc - b.z, width: 18 });
      corridors.push(corridor(a.x + a.w, zc - 17, b.x - (a.x + a.w), 34, true, seed + corridors.length, biome));
    } else {
      const lo = Math.max(a.x, b.x) + WALL_T + 22, hi = Math.min(a.x + a.w, b.x + b.w) - WALL_T - 22;
      const xc = Math.round(lo + (hi - lo) * (0.3 + r() * 0.4));
      a.doors.push({ side: 'z1', at: xc - a.x, width: 18 });
      b.doors.push({ side: 'z0', at: xc - b.x, width: 18 });
      corridors.push(corridor(xc - 17, a.z + a.d, 34, b.z - (a.z + a.d), false, seed + corridors.length, biome));
    }
  }

  /* stairs: up from a room on the back row (the stairs climb its back wall),
     down in some other room */
  const list = [...slots.values()];
  const backRow = list.filter((s) => !slots.has(key(s.col, s.row - 1)) && !s.doors.some((d) => d.side === 'z0'));
  const up = index < FLOOR_COUNT - 1 ? backRow[Math.floor(r() * backRow.length)] ?? null : null;
  const downChoices = list.filter((s) => s !== up);
  const down = index > 0 ? downChoices[Math.floor(r() * downChoices.length)] : null;

  const rooms: RoomRec[] = [];
  for (const s of list) {
    const c: RoomCtx = {
      g: new Grid(s.w, s.d), r: rng(seed + s.col * 31 + s.row * 17), seed: seed + s.col * 131 + s.row * 71,
      W: s.w, D: s.d, lights: [], windows: [], emitters: [], doors: s.doors,
      exteriorWest: !slots.has(key(s.col - 1, s.row)), sky: false, amb: [1, 1, 1],
      stairsUp: s === up, stairsDown: s === down, bio: biome.style,
    };
    s.theme.build(c);
    if (biome.weather) {
      const w = biome.weather;
      const high = w.kind === 'snow' || w.kind === 'ash' || w.kind === 'star';
      c.emitters.push({
        kind: w.kind, pos: [s.w / 2, high ? 64 : 22, s.d / 2], size: [s.w / 2 - 10, high ? 12 : 12, s.d / 2 - 10],
        count: Math.round(w.perRoom * (s.w * s.d) / 32000), color: w.kind === 'sparkle' ? [1.0, 0.85, 0.5] : undefined,
      });
    }
    carveDoors(c);
    if (s === up) stairsUp(c);
    if (s === down) {
      const spot = findDownSpot(c);
      stairsDown(c, spot[0], spot[1]);
    }
    rooms.push({
      name: s.theme.name, theme: s.theme.id, kind: 'room', x: s.x, z: s.z, w: s.w, h: c.g.h, d: s.d, grid: c.g,
      bricks: buildBricks(c.g), windows: c.windows, lights: c.lights, emitters: c.emitters, sky: c.sky, amb: c.amb,
      stairsUp: s === up, stairsDown: s === down, liquid: biome.style.liquid,
    });
  }
  rooms.push(...corridors);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const rm of rooms) { x0 = Math.min(x0, rm.x); z0 = Math.min(z0, rm.z); x1 = Math.max(x1, rm.x + rm.w); z1 = Math.max(z1, rm.z + rm.d); }
  return { index, name: biome.name, biome, rooms, bounds: [x0, z0, x1, z1] };
}

/* A clear patch of floor for the way down, away from water and doors. */
function findDownSpot(c: RoomCtx): [number, number] {
  const { g, W, D, r } = c;
  let best: [number, number] = [WALL_T + 16, Math.round(D / 2)], bestScore = -1;
  for (let k = 0; k < 60; k++) {
    const x = Math.round(WALL_T + 14 + r() * (W - 2 * WALL_T - 46)), z = Math.round(WALL_T + 30 + r() * (D - 2 * WALL_T - 66));
    let ok = true;
    for (let dz = -4; dz < 26 && ok; dz += 3) for (let dx = -4; dx < 18 && ok; dx += 3) if (g.get(x + dx, 0, z + dz) === M.POOLBED) ok = false;
    if (!ok) continue;
    let score = 1000;
    for (const d of c.doors) {
      const [dx, dz] = d.side === 'x0' ? [WALL_T, d.at] : d.side === 'x1' ? [W - WALL_T, d.at] : d.side === 'z0' ? [d.at, WALL_T] : [d.at, D - WALL_T];
      score = Math.min(score, Math.hypot(x + 7 - dx, z + 11 - dz));
    }
    // fewer things knocked over is better
    let clutter = 0;
    for (let dz = 0; dz < 22; dz += 2) for (let dx = 0; dx < 14; dx += 2) if (g.get(x + dx, FLOOR + 2, z + dz)) clutter++;
    score -= clutter * 3;
    if (c.stairsUp && z < WALL_T + 40 && x > W - 90) score -= 500;
    if (score > bestScore) { bestScore = score; best = [x, z]; }
  }
  return best;
}

/* A short passage between two rooms: a walled hallway or a plank bridge
   over the dark. Its walls stay low, so it is never cut away. */
function corridor(x: number, z: number, w: number, d: number, alongX: boolean, seed: number, biome: Biome): RoomRec {
  const g = new Grid(Math.max(1, w), Math.max(1, d), 40);
  const r = rng(seed);
  const bridge = r() < 0.45;
  const c: RoomCtx = {
    g, r, seed, W: g.w, D: g.d, lights: [], windows: [], emitters: [], doors: [], exteriorWest: false, sky: false,
    amb: [1, 1, 1], stairsUp: false, stairsDown: false, bio: biome.style,
  };
  const len = alongX ? g.w : g.d, wid = alongX ? g.d : g.w;
  const at = (u: number, v: number, y: number, m: number) => (alongX ? g.set(u, y, v, m) : g.set(v, y, u, m));
  if (!bridge) {
    slab(c, biome.corridor.floor);
    const wm = biome.corridor.wall;
    for (let u = 0; u < len; u++) for (let y = 0; y < FLOOR + 10; y++) for (const v of [0, 1, 2, wid - 3, wid - 2, wid - 1]) {
      const edge = v === 2 || v === wid - 3;
      at(u, v, y, y >= FLOOR + 9 ? (wm === M.BRICK ? M.STEP : M.MARBLE_DARK === wm ? M.GOLD : wm) : edge && (y % 6 === 0 || (u + (y >> 2)) % 8 === 0) ? (wm === M.ICE ? M.SNOW : wm === M.BASALT ? M.COAL : M.MORTAR) : wm);
    }
    if (biome.style.mossy) for (let u = 0; u < len; u++) for (let v = 3; v < wid - 3; v++) if (hash2(u, v, seed) < 0.18) at(u, v, FLOOR, M.MOSS);
    // a sconce halfway along
    const mid = Math.floor(len / 2);
    at(mid, 2, FLOOR + 10, M.IRON); at(mid, 2, FLOOR + 11, M.FLAME);
    const p: V3 = alongX ? [mid, FLOOR + 13, 4] : [4, FLOOR + 13, mid];
    c.lights.push({ pos: p, radius: 26, color: [1.0, 0.7, 0.36], flicker: 0.25 });
  } else {
    // rope bridge: planks over a dark drop
    for (let u = 0; u < len; u++) {
      const sag = Math.round(Math.sin((u / Math.max(1, len - 1)) * Math.PI) * 2);
      for (let v = 9; v < wid - 9; v++) if (!(hash2(u, 1, seed) < 0.08 && v > 11 && v < wid - 12)) at(u, v, FLOOR - 1 - sag, (u % 3 === 0) ? M.PLANK_DARK : M.PLANK);
      at(u, 8, FLOOR + 4 - sag, M.BARK); at(u, wid - 9, FLOOR + 4 - sag, M.BARK);
      if (u % 8 === 0) for (let y = FLOOR - 1 - sag; y < FLOOR + 5 - sag; y++) { at(u, 8, y, M.BARK); at(u, wid - 9, y, M.BARK); }
      for (let v = 0; v < wid; v++) at(u, v, 0, M.DARK);
    }
  }
  const room: RoomRec = {
    name: bridge ? 'Rope Bridge' : 'Passage', theme: 'corridor', kind: 'corridor', x, z, w: g.w, h: g.h, d: g.d, grid: g,
    bricks: buildBricks(g), windows: [], lights: c.lights, emitters: [], sky: false, amb: [1, 1, 1], stairsUp: false, stairsDown: false,
    liquid: biome.style.liquid,
  };
  return room;
}

export type { Side };

/* ------------------------------------------------------------- GPU packing */

export const ROOM_HEADER = 10; // vec4s before the room table: count, then the biome's colours
export const ROOM_STRIDE = 4; // vec4s per room

/* All grids end to end (voxel bytes padded to u32, then bricks), and the
   room table the shader reads: header, rooms, windows, lights. */
export function packFloor(f: Floor) {
  let words = 0;
  const offs: [number, number][] = [];
  for (const rm of f.rooms) {
    const vw = Math.ceil(rm.grid.v.length / 4);
    offs.push([words, words + vw]);
    words += vw + rm.bricks.length;
  }
  const vox = new Uint32Array(words);
  const bytes = new Uint8Array(vox.buffer);
  f.rooms.forEach((rm, i) => { bytes.set(rm.grid.v, offs[i][0] * 4); vox.set(rm.bricks, offs[i][1]); });

  const nWin = f.rooms.reduce((a, rm) => a + rm.windows.length, 0);
  const nLight = f.rooms.reduce((a, rm) => a + rm.lights.length, 0);
  const table = new Float32Array((ROOM_HEADER + f.rooms.length * ROOM_STRIDE + nWin + nLight * 2) * 4);
  table[0] = f.rooms.length;
  biomeHeader(f.biome).forEach((c, i) => table.set(c, (1 + i) * 4));
  let wi = ROOM_HEADER + f.rooms.length * ROOM_STRIDE, li = wi + nWin;
  f.rooms.forEach((rm, i) => {
    const o = (ROOM_HEADER + i * ROOM_STRIDE) * 4;
    const flags = (rm.kind === 'corridor' ? 1 : 0) | (rm.sky ? 2 : 0) | (rm.windows.length || rm.sky ? 4 : 0) | (rm.liquid << 3);
    table.set([rm.x, rm.z, rm.w, rm.d, rm.h, offs[i][0], offs[i][1], flags, wi, rm.windows.length, li, rm.lights.length, ...rm.amb, 0], o);
    for (const w of rm.windows) table.set(w, 4 * wi++);
    for (const l of rm.lights) { table.set([...l.pos, l.radius, ...l.color, l.flicker ?? 0], 4 * li); li += 2; }
  });
  return { vox, table };
}
