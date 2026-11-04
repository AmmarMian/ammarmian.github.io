/* Room themes. Each one furnishes a room (floor, walls, props, lights,
 * particle emitters); the floor layout then cuts doors and adds stairs. */
import { FLOOR, M, WALL_H, WALL_T, hash2, type V3 } from './core.ts';
import {
  type RoomCtx, barrel, boulder, bookcase, brazier, candle, carpet, chest, column, crate, crystal,
  fern, freeShelf, goldPile, grassCover, lantern, lilies, pondMask, reeds, root, shroom, slab, table, tree,
  vines, wallFaces, wallMoss, walls, waterDistance,
} from './build.ts';

import { THEMES2 } from './themes2.ts';

export interface Theme { id: string; name: string; build: (c: RoomCtx) => void }

const dust = (c: RoomCtx, n: number) =>
  c.emitters.push({ kind: 'dust', pos: [c.W / 2, 34, c.D / 2], size: [c.W / 2 - 8, 24, c.D / 2 - 8], count: n });

/* ------------------------------------------------------------ flooded hall */
const flooded: Theme = {
  id: 'flooded', name: 'Flooded Hall',
  build(c) {
    const { W, D, r, g } = c;
    const pool = pondMask(c, [[0.62, 0.62, 0.3, 0.24], [0.36, 0.78, 0.18, 0.15]]);
    slab(c, 'flag', pool);
    walls(c, c.bio.wall);
    const dist = waterDistance(c);
    grassCover(c, 0, dist);
    // boardwalk across the pond
    const bz0 = Math.round(D * 0.44), bw = 12, bY = FLOOR + 1;
    const bx0 = Math.round(W * 0.3), bx1 = Math.round(W * 0.9);
    for (let x = bx0; x < bx1; x++) {
      const missing = hash2(Math.floor(x / 3), 0, c.seed + 3) < 0.06;
      for (let z = bz0; z < bz0 + bw; z++) {
        if (missing && z > bz0 + 2 && z < bz0 + bw - 3) continue;
        g.set(x, bY, z, hash2(x, z, 31) < 0.02 ? M.MOSS : x % 3 === 0 ? M.PLANK_DARK : M.PLANK);
      }
      g.set(x, bY - 1, bz0 + 1, M.PLANK_DARK); g.set(x, bY - 1, bz0 + bw - 2, M.PLANK_DARK);
    }
    for (let x = bx0 + 4; x < bx1; x += 16) for (const z of [bz0, bz0 + bw - 2]) g.box(x, 2, z, x + 2, bY + 4, z + 2, (xx, y) => (y > bY ? M.BARK : M.PLANK_DARK));
    lilies(c, 40 * (W * D) / 25600);
    reeds(c, dist);
    for (const [fx, fz, s] of [[0.1, 0.12, 9], [0.12, 0.85, 10], [0.3, 0.1, 8], [0.92, 0.9, 9], [0.55, 0.12, 7], [0.85, 0.28, 8], [0.7, 0.93, 8]])
      fern(c, Math.round(fx * W), Math.round(fz * D), s);
    boulder(c, Math.round(W * 0.92), Math.round(D * 0.6), 6); boulder(c, Math.round(W * 0.25), Math.round(D * 0.65), 5);
    chest(c, Math.round(W * 0.34), WALL_T + 14);
    crate(c, WALL_T, FLOOR - 1, Math.round(D * 0.72), 10); crate(c, WALL_T, FLOOR + 9, Math.round(D * 0.72) + 2, 8);
    barrel(c, WALL_T + 7, Math.round(D * 0.72) - 9);
    lantern(c, bx0 - 4, bz0 - 3); lantern(c, bx1 + 2, bz0 + bw + 1);
    crystal(c, 14, Math.round(D * 0.28), 14, 0.15); crystal(c, 18, Math.round(D * 0.28) + 6, 9, 0.35);
    c.lights.push({ pos: [15, 16, Math.round(D * 0.28) + 3], radius: 30, color: [0.3, 0.95, 0.85] });
    shroom(c, 26, 28); shroom(c, 30, 32, false); shroom(c, Math.round(W * 0.82), Math.round(D * 0.88));
    vines(c); wallMoss(c);
    root(c, 'x0', Math.round(D * 0.15), c.seed + 101); root(c, 'z0', Math.round(W * 0.2), c.seed + 103);
    dust(c, 60);
    c.emitters.push({ kind: 'firefly', pos: [W / 2, 26, D / 2], size: [W / 2 - 14, 12, D / 2 - 14], count: 20 });
    c.emitters.push({ kind: 'leaf', pos: [W / 2, 70, D / 2], size: [W / 2 - 10, 0, D / 2 - 10], count: 8 });
    void r;
  },
};

/* --------------------------------------------------------- moonlit library */
const library: Theme = {
  id: 'library', name: 'Moonlit Library',
  build(c) {
    const { W, D, r, g } = c;
    slab(c, 'plank');
    walls(c, 'plaster');
    c.amb = [1.05, 0.92, 0.85];
    // bookcases along every wall, broken by the windows
    for (const wl of wallFaces(c)) {
      const spans: [number, number][] = [];
      let u = WALL_T + 6;
      const blocked = (u: number) => wl.side === 'x0' && c.windows.some(([z0, z1]) => u > z0 - 4 && u < z1 + 4);
      while (u < wl.len - WALL_T - 6) {
        if (blocked(u)) { u++; continue; }
        let e = u;
        while (e < wl.len - WALL_T - 6 && !blocked(e) && e - u < 40) e++;
        if (e - u > 8) spans.push([u, e - u]);
        u = e + 3;
      }
      for (const [u0, len] of spans) bookcase(c, wl.side, u0, len, 44);
    }
    // free-standing stacks in two rows
    const rows = Math.max(1, Math.floor((W - 90) / 50));
    for (let k = 0; k < rows; k++) {
      const x = Math.round(30 + k * 50);
      freeShelf(c, x, Math.round(D * 0.18), Math.round(D * 0.22), false);
      freeShelf(c, x, Math.round(D * 0.62), Math.round(D * 0.22), false);
    }
    // reading nook: carpet, table, candles, an open book
    const tx = Math.round(W * 0.62), tz = Math.round(D * 0.5);
    carpet(c, tx - 24, tz - 18, tx + 24, tz + 18);
    const top = table(c, tx - 10, tz - 6, 20, 12);
    candle(c, tx - 7, top, tz - 3, 4); candle(c, tx + 7, top, tz + 3, 3);
    g.box(tx - 3, top, tz - 2, tx + 3, top + 1, tz + 2, M.PAPER);
    g.box(tx, top, tz - 2, tx + 1, top + 1, tz + 2, M.BOOK_R);
    g.box(tx + 4, top, tz - 4, tx + 7, top + 3, tz - 1, (x, y) => [M.BOOK_B, M.BOOK_G, M.BOOK_Y][y - top]);
    // chairs
    for (const dz of [-12, 9]) g.box(tx - 3, FLOOR - 1, tz + dz, tx + 3, FLOOR + 4, tz + dz + 4, (x, y, z) => (y === FLOOR + 3 || (dz < 0 ? z === tz + dz : z === tz + dz + 3) ? M.CHEST : M.AIR));
    // a globe on a stand
    const gx = Math.round(W * 0.85), gz = Math.round(D * 0.78);
    g.box(gx, FLOOR - 1, gz, gx + 1, FLOOR + 8, gz + 1, M.GOLD);
    for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) {
      if (Math.hypot(x, y, z) > 4.2) continue;
      g.set(gx + x, FLOOR + 12 + y, gz + z, hash2(Math.floor((x + 4) / 3) + Math.floor((y + 4) / 2) * 5, z, 9) < 0.4 ? M.BOOK_G : M.BOOK_B);
    }
    // floating candles, the library's own small magic
    for (let k = 0; k < 14; k++) {
      const x = Math.round(20 + r() * (W - 40)), z = Math.round(20 + r() * (D - 40)), y = Math.round(44 + r() * 14);
      candle(c, x, y, z, 2 + Math.floor(r() * 3), k % 2 === 0);
    }
    // scrolls and dropped books on the floor
    for (let k = 0; k < 18; k++) {
      const x = Math.round(WALL_T + 10 + r() * (W - 2 * WALL_T - 20)), z = Math.round(WALL_T + 10 + r() * (D - 2 * WALL_T - 20));
      if (g.get(x, FLOOR, z)) continue;
      if (r() < 0.5) g.box(x, FLOOR, z, x + 4, FLOOR + 1, z + 1, M.PAPER);
      else g.box(x, FLOOR, z, x + 3, FLOOR + 1 + Math.floor(r() * 3), z + 2, [M.BOOK_R, M.BOOK_B, M.BOOK_Y][k % 3]);
    }
    vines(c, 0.08, 20);
    dust(c, 70);
    c.emitters.push({ kind: 'sparkle', pos: [W / 2, 52, D / 2], size: [W / 2 - 20, 8, D / 2 - 20], count: 26, color: [1.0, 0.85, 0.5] });
  },
};

/* --------------------------------------------------- alchemist's workshop */
const lab: Theme = {
  id: 'lab', name: "Alchemist's Workshop",
  build(c) {
    const { W, D, r, g } = c;
    slab(c, c.bio.floor === 'basalt' ? 'basalt' : 'flag');
    walls(c, c.bio.wall);
    c.amb = [0.9, 1.05, 0.95];
    // the cauldron
    const cx = Math.round(W * 0.5), cz = Math.round(D * 0.5);
    for (let y = 0; y < 14; y++) {
      const rad = 9 + Math.sin((y / 14) * Math.PI) * 2.5;
      for (let z = -12; z <= 12; z++) for (let x = -12; x <= 12; x++) {
        const d = Math.hypot(x, z);
        if (d > rad) continue;
        const yy = FLOOR + 2 + y;
        if (y === 12 && d < rad - 1.2) g.set(cx + x, yy, cz + z, M.BREW);
        else if (y < 12 && d < rad - 1.2) g.set(cx + x, yy, cz + z, y < 2 ? M.IRON : M.AIR);
        else if (y < 13 || d > rad - 1.2) g.set(cx + x, yy, cz + z, M.IRON);
      }
    }
    for (const [dx, dz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) g.box(cx + dx - 1, FLOOR - 1, cz + dz - 1, cx + dx + 1, FLOOR + 3, cz + dz + 1, M.IRON);
    for (let z = -8; z <= 8; z++) for (let x = -8; x <= 8; x++) {
      const d = Math.hypot(x, z);
      if (d > 7.5) continue;
      g.set(cx + x, FLOOR - 1, cz + z, M.COAL);
      if (hash2(x, z, 3) < 0.6) g.set(cx + x, FLOOR, cz + z, d < 5 ? M.FIRE : M.EMBER);
      if (d < 4 && hash2(x, z, 4) < 0.5) g.set(cx + x, FLOOR + 1, cz + z, M.FIRE);
    }
    c.lights.push({ pos: [cx, FLOOR + 20, cz], radius: 54, color: [0.45, 1.0, 0.45], flicker: 0.12 });
    c.lights.push({ pos: [cx, FLOOR + 2, cz], radius: 22, color: [1.0, 0.55, 0.2], flicker: 0.3 });
    c.emitters.push({ kind: 'bubble', pos: [cx, FLOOR + 16, cz], size: [6, 1, 6], count: 18, color: [0.5, 1.0, 0.45] });
    // wall shelves of potions
    for (const wl of wallFaces(c)) {
      if (wl.side === 'x1' || wl.side === 'z1') continue;
      for (let u = WALL_T + 8; u < wl.len - WALL_T - 8; u++) {
        if (wl.side === 'x0' && c.windows.some(([z0, z1]) => u > z0 - 3 && u < z1 + 3)) continue;
        for (const sy of [FLOOR + 16, FLOOR + 27]) {
          for (let k = 1; k <= 4; k++) { const [x, y, z] = wl.at(u, sy, k); g.set(x, y, z, M.PLANK_DARK); }
          if (u % 4 === 0 && hash2(u, sy, c.seed) < 0.75) {
            const pot = [M.POTION_P, M.POTION_G, M.POTION_R][Math.floor(hash2(u, sy, 2) * 3)];
            const h = 2 + Math.floor(hash2(u, sy, 3) * 3);
            for (let y = 1; y <= h; y++) for (const du of [0, 1]) for (const k of [2, 3]) { const [x, yy, z] = wl.at(u + du, sy + y, k); g.set(x, yy, z, y === h ? M.GLASS : pot); }
            const [x, yy, z] = wl.at(u, sy + h + 1, 2); g.set(x, yy, z, M.PLANK_DARK);
          }
        }
      }
    }
    // workbenches with flasks
    for (const [fx, fz, w, d] of [[0.18, 0.75, 26, 10], [0.72, 0.2, 24, 10], [0.78, 0.78, 12, 22]] as const) {
      const x0 = Math.round(fx * W), z0 = Math.round(fz * D);
      const top = table(c, x0, z0, w, d, 9);
      for (let k = 0; k < 6; k++) {
        const x = x0 + 2 + Math.floor(r() * (w - 4)), z = z0 + 2 + Math.floor(r() * (d - 4));
        const pot = [M.POTION_P, M.POTION_G, M.POTION_R][k % 3];
        g.box(x, top, z, x + 2, top + 2, z + 2, pot); g.set(x, top + 2, z, M.GLASS); g.set(x, top + 3, z, M.GLASS);
      }
      candle(c, x0 + 1, top, z0 + 1, 3);
      g.box(x0 + w - 6, top, z0 + 2, x0 + w - 2, top + 1, z0 + 6, M.PAPER);
    }
    // pipes along the back wall
    for (let x = WALL_T + 2; x < W - WALL_T - 2; x++) { g.set(x, FLOOR + 40, WALL_T, M.IRON); g.set(x, FLOOR + 40, WALL_T + 1, M.IRON); }
    for (let y = FLOOR; y < FLOOR + 40; y++) for (const x of [Math.round(W * 0.3), Math.round(W * 0.7)]) { g.set(x, y, WALL_T, M.IRON); g.set(x + 1, y, WALL_T, M.IRON); }
    crate(c, W - WALL_T - 12, FLOOR - 1, D - WALL_T - 30, 10); barrel(c, W - WALL_T - 20, D - WALL_T - 12, M.BREW);
    barrel(c, WALL_T + 8, WALL_T + 30);
    vines(c, 0.12, 24); wallMoss(c, 0.95);
    dust(c, 50);
  },
};

/* --------------------------------------------------------- amethyst grotto */
const grotto: Theme = {
  id: 'grotto', name: 'Amethyst Grotto',
  build(c) {
    const { W, D, r, g } = c;
    const pool = pondMask(c, [[0.4, 0.62, 0.17, 0.14]], 14);
    slab(c, 'cave', pool);
    walls(c, 'cave', false);
    c.amb = [0.95, 0.88, 1.25];
    // stalagmites
    for (let k = 0; k < 22; k++) {
      const x = Math.round(WALL_T + 12 + r() * (W - 2 * WALL_T - 24)), z = Math.round(WALL_T + 12 + r() * (D - 2 * WALL_T - 24));
      if (g.get(x, 0, z) === M.POOLBED) continue;
      const h = 6 + Math.floor(r() * 18), rad = 2 + r() * 3;
      for (let y = 0; y < h; y++) {
        const rr = rad * (1 - y / h);
        for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) if (Math.hypot(dx, dz) <= rr) g.set(x + dx, FLOOR - 1 + y, z + dz, y % 5 === 0 ? M.ROCK : M.CAVE);
      }
    }
    // stalactites from the wall tops
    for (const wl of wallFaces(c)) for (let u = WALL_T; u < wl.len - WALL_T; u += 1) {
      if (hash2(u, 5, c.seed + wl.len) > 0.25) continue;
      const len = 3 + Math.floor(hash2(u, 6, c.seed) * 14);
      for (let k = 0; k < len; k++) for (let d = 0; d < Math.max(1, 3 - k / 4); d++) { const [x, y, z] = wl.at(u, WALL_H - k, 6 + d); g.put(x, y, z, M.CAVE); }
    }
    // amethyst clusters: the room's light
    const cluster = (cx: number, cz: number, n: number, mat: number, col: V3) => {
      for (let k = 0; k < n; k++) crystal(c, cx + Math.round((r() - 0.5) * 10), cz + Math.round((r() - 0.5) * 10), 8 + Math.floor(r() * 16), (r() - 0.5) * 0.7, mat);
      c.lights.push({ pos: [cx, FLOOR + 12, cz], radius: 46, color: col, flicker: 0.05 });
    };
    cluster(Math.round(W * 0.2), Math.round(D * 0.25), 6, M.AMETHYST, [0.85, 0.45, 1.0]);
    cluster(Math.round(W * 0.8), Math.round(D * 0.3), 5, M.AMETHYST, [0.75, 0.4, 1.0]);
    cluster(Math.round(W * 0.72), Math.round(D * 0.8), 5, M.CRYSTAL, [0.3, 0.95, 0.9]);
    cluster(Math.round(W * 0.15), Math.round(D * 0.82), 4, M.AMETHYST, [0.75, 0.4, 1.0]);
    // crystals pushing out of the foot of the back walls
    for (let k = 0; k < 8; k++) {
      const alongX = k % 2 === 0;
      const u = Math.round(WALL_T + 16 + r() * ((alongX ? W : D) - 50));
      const [x, z] = alongX ? [u, WALL_T + 6] : [WALL_T + 6, u];
      crystal(c, x, z, 6 + Math.floor(r() * 10), alongX ? 0 : 0.3, M.AMETHYST);
    }
    c.lights.push({ pos: [W * 0.5, FLOOR + 30, D * 0.5], radius: Math.max(W, D) * 0.7, color: [0.32, 0.22, 0.45] });
    for (let k = 0; k < 14; k++) shroom(c, Math.round(WALL_T + 8 + r() * (W - 30)), Math.round(WALL_T + 8 + r() * (D - 30)), k % 3 === 0);
    lilies(c, 6);
    dust(c, 30);
    c.emitters.push({ kind: 'sparkle', pos: [W / 2, 30, D / 2], size: [W / 2 - 10, 20, D / 2 - 10], count: 40, color: [0.85, 0.55, 1.0] });
    c.emitters.push({ kind: 'firefly', pos: [W / 2, 22, D / 2], size: [W / 2 - 14, 10, D / 2 - 14], count: 10, color: [0.45, 0.95, 1.0] });
  },
};

/* ------------------------------------------------------- blossom courtyard */
const garden: Theme = {
  id: 'garden', name: 'Blossom Courtyard',
  build(c) {
    const { W, D, r, g } = c;
    c.sky = true;
    c.amb = [0.95, 0.98, 0.9];
    const fx = Math.round(W * 0.68), fz = Math.round(D * 0.66), fr = 13;
    const pool = (x: number, z: number) => Math.hypot(x - fx, z - fz) < fr - 2;
    slab(c, 'grass', pool);
    walls(c, c.bio.wall);
    // flagstone paths crossing the lawn
    for (let z = WALL_T; z < D - WALL_T; z++) for (let x = WALL_T; x < W - WALL_T; x++) {
      const onPath = Math.abs(z - Math.round(D * 0.5) + Math.round(Math.sin(x * 0.05) * 6)) < 5 || Math.abs(x - fx) < 5;
      if (onPath && g.get(x, 0, z) !== M.POOLBED && hash2(x >> 2, z >> 2, 4) < 0.85) g.set(x, FLOOR - 1, z, (x % 6 === 0 || z % 6 === 0) ? M.GROUT : M.STONE);
    }
    // fountain basin
    for (let z = -fr - 1; z <= fr + 1; z++) for (let x = -fr - 1; x <= fr + 1; x++) {
      const d = Math.hypot(x, z);
      if (d >= fr - 2 && d <= fr + 1) g.box(fx + x, FLOOR - 1, fz + z, fx + x + 1, FLOOR + 3, fz + z + 1, M.STEP);
    }
    g.box(fx - 1, 2, fz - 1, fx + 2, FLOOR + 10, fz + 2, M.STEP);
    g.box(fx - 3, FLOOR + 10, fz - 3, fx + 4, FLOOR + 11, fz + 4, M.STEP);
    c.emitters.push({ kind: 'bubble', pos: [fx, FLOOR + 12, fz], size: [3, 1, 3], count: 14, color: [0.75, 0.95, 1.0] });
    // the tree
    const tx = Math.round(W * 0.32), tz = Math.round(D * 0.36);
    tree(c, tx, tz, 34, 26);
    grassCover(c, 0.25);
    // flower beds along the walls
    for (let z = WALL_T + 2; z < D - WALL_T - 2; z++) for (let x = WALL_T + 2; x < W - WALL_T - 2; x++) {
      const edge = Math.min(x - WALL_T, z - WALL_T, W - WALL_T - 1 - x, D - WALL_T - 1 - z);
      if (edge < 8 && hash2(x, z, 77) < 0.09) {
        const h = 2 + Math.floor(hash2(x, z, 78) * 4);
        for (let k = 0; k < h - 1; k++) g.put(x, FLOOR + k, z, M.GRASS);
        g.put(x, FLOOR + h - 1, z, [M.FLOWER_P, M.FLOWER_W, M.BLOSSOM, M.GOLD][Math.floor(hash2(x, z, 79) * 4)]);
      }
    }
    // hedges and benches
    for (const [hx, hz, len] of [[0.1, 0.75, 30], [0.5, 0.12, 36]] as const) {
      const x0 = Math.round(hx * W), z0 = Math.round(hz * D);
      g.box(x0, FLOOR, z0, x0 + len, FLOOR + 8, z0 + 7, (x, y, z) => (hash2(x, y, z) < 0.15 ? M.LEAF : M.LEAF_DARK));
    }
    for (const [bx, bz] of [[0.5, 0.42], [0.2, 0.58]] as const) {
      const x0 = Math.round(bx * W), z0 = Math.round(bz * D);
      g.box(x0, FLOOR + 4, z0, x0 + 14, FLOOR + 5, z0 + 5, M.PLANK);
      g.box(x0 + 1, FLOOR - 1, z0 + 1, x0 + 3, FLOOR + 4, z0 + 4, M.STEP); g.box(x0 + 11, FLOOR - 1, z0 + 1, x0 + 13, FLOOR + 4, z0 + 4, M.STEP);
    }
    lantern(c, Math.round(W * 0.85), Math.round(D * 0.4));
    vines(c, 0.55, 50); wallMoss(c, 0.6);
    for (let k = 0; k < 5; k++) fern(c, Math.round(WALL_T + 12 + r() * (W - 40)), Math.round(WALL_T + 12 + r() * (D - 40)), 7);
    c.emitters.push({ kind: 'petal', pos: [tx, 60, tz], size: [30, 6, 30], count: 22 });
    c.emitters.push({ kind: 'firefly', pos: [W / 2, 24, D / 2], size: [W / 2 - 14, 12, D / 2 - 14], count: 14 });
    dust(c, 50);
  },
};

/* ----------------------------------------------------------- ember forge */
const forge: Theme = {
  id: 'forge', name: 'Ember Forge',
  build(c) {
    const { W, D, r, g } = c;
    slab(c, c.bio.floor === 'basalt' ? 'basalt' : 'flag');
    walls(c, c.bio.wall);
    c.amb = [1.1, 0.82, 0.72];
    // hearth against the back wall with its chimney
    const hx = Math.round(W * 0.42), hw = 34, hd = 18;
    g.box(hx, FLOOR - 1, WALL_T, hx + hw, FLOOR + 24, WALL_T + hd, (x, y, z) => ((y + (x >> 2)) % 5 === 0 ? M.MORTAR : M.BRICK));
    g.box(hx + 6, FLOOR + 24, WALL_T, hx + hw - 6, WALL_H, WALL_T + 10, (x, y) => (y % 6 === 0 ? M.MORTAR : M.BRICK));
    g.box(hx + 5, FLOOR + 2, WALL_T + 4, hx + hw - 5, FLOOR + 18, WALL_T + hd, M.AIR);
    for (let z = WALL_T + 4; z < WALL_T + hd; z++) for (let x = hx + 5; x < hx + hw - 5; x++) {
      g.set(x, FLOOR + 1, z, M.COAL);
      if (hash2(x, z, 1) < 0.7) g.set(x, FLOOR + 2, z, M.EMBER);
      const h = Math.floor(hash2(x, z, 2) * 9 * (1 - Math.abs(x - hx - hw / 2) / (hw / 2)));
      for (let y = 0; y < h; y++) g.set(x, FLOOR + 3 + y, z, y > h - 3 ? M.EMBER : M.FIRE);
    }
    c.lights.push({ pos: [hx + hw / 2, FLOOR + 10, WALL_T + hd + 4], radius: 80, color: [1.0, 0.5, 0.18], flicker: 0.35 });
    c.emitters.push({ kind: 'ember', pos: [hx + hw / 2, FLOOR + 14, WALL_T + hd - 4], size: [hw / 2 - 6, 2, 6], count: 40 });
    // anvil on a stump
    const ax = Math.round(W * 0.55), az = Math.round(D * 0.5);
    g.box(ax - 3, FLOOR - 1, az - 3, ax + 4, FLOOR + 5, az + 4, M.BARK);
    g.box(ax - 5, FLOOR + 5, az - 2, ax + 6, FLOOR + 7, az + 3, M.IRON);
    g.box(ax - 2, FLOOR + 7, az - 2, ax + 3, FLOOR + 9, az + 3, M.IRON);
    g.box(ax - 8, FLOOR + 9, az - 2, ax + 8, FLOOR + 11, az + 3, M.IRON);
    g.box(ax + 8, FLOOR + 10, az - 1, ax + 11, FLOOR + 11, az + 2, M.IRON);
    g.box(ax - 2, FLOOR + 11, az + 1, ax + 5, FLOOR + 12, az + 2, M.EMBER); // a glowing blade on the anvil
    // weapon racks on the west wall
    for (let k = 0; k < 7; k++) {
      const z = Math.round(D * 0.3) + k * 8;
      if (c.windows.some(([z0, z1]) => z > z0 - 4 && z < z1 + 4)) continue;
      g.box(WALL_T, FLOOR + 6, z, WALL_T + 2, FLOOR + 30, z + 1, M.IRON);
      g.box(WALL_T, FLOOR + 6, z - 2, WALL_T + 2, FLOOR + 8, z + 3, M.GOLD);
      g.box(WALL_T, FLOOR + 3, z, WALL_T + 2, FLOOR + 6, z + 1, M.BARK);
    }
    g.box(WALL_T, FLOOR + 32, Math.round(D * 0.28), WALL_T + 3, FLOOR + 33, Math.round(D * 0.3) + 56, M.PLANK_DARK);
    // ore and coal heaps, a quench barrel, tools
    goldPile(c, Math.round(W * 0.8), Math.round(D * 0.75), 7);
    for (let k = 0; k < 3; k++) { const x = Math.round(W * (0.2 + k * 0.08)), z = Math.round(D * 0.82); boulder(c, x, z, 4, false, k === 1 ? M.COAL : M.ROCK); }
    barrel(c, ax + 20, az + 4, M.BREW);
    crate(c, W - WALL_T - 14, FLOOR - 1, WALL_T + 2, 12); crate(c, W - WALL_T - 12, FLOOR + 11, WALL_T + 4, 8);
    brazier(c, Math.round(W * 0.2), Math.round(D * 0.35), 8);
    wallMoss(c, 1.0);
    dust(c, 40);
    void r;
  },
};

/* ---------------------------------------------------------- gilded shrine */
const shrine: Theme = {
  id: 'shrine', name: 'Gilded Shrine',
  build(c) {
    const { W, D, r, g } = c;
    slab(c, 'marble');
    walls(c, c.bio.wall);
    c.amb = [0.95, 0.95, 1.08];
    const cx = Math.round(W * 0.5);
    // colonnade
    for (let z = Math.round(D * 0.22); z < D * 0.85; z += 34) for (const x of [Math.round(W * 0.28), Math.round(W * 0.72)]) column(c, x, z, 52);
    // carpet aisle to the altar
    carpet(c, cx - 7, Math.round(D * 0.22), cx + 8, D - WALL_T - 4);
    // altar dais at the back with the idol
    for (let s = 0; s < 4; s++) g.box(cx - 22 + s * 3, FLOOR - 1, WALL_T, cx + 23 - s * 3, FLOOR + 1 + s * 2, WALL_T + 26 - s * 4, s % 2 ? M.MARBLE_DARK : M.MARBLE);
    const iy = FLOOR + 7;
    g.box(cx - 3, iy, WALL_T + 4, cx + 4, iy + 22, WALL_T + 11, (x, y) => (y > iy + 18 ? M.GOLD : M.MARBLE));
    for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++)
      if (Math.hypot(x, y, z) <= 4) g.set(cx + x, iy + 28 + y, WALL_T + 7 + z, M.LANTERN);
    c.lights.push({ pos: [cx, iy + 28, WALL_T + 12], radius: 70, color: [1.0, 0.85, 0.5], flicker: 0.04 });
    c.emitters.push({ kind: 'gold', pos: [cx, iy + 28, WALL_T + 8], size: [12, 10, 8], count: 24 });
    brazier(c, cx - 30, WALL_T + 30); brazier(c, cx + 29, WALL_T + 30);
    // offerings
    goldPile(c, cx - 34, WALL_T + 12, 6); goldPile(c, cx + 34, WALL_T + 12, 6);
    chest(c, Math.round(W * 0.12), Math.round(D * 0.4)); chest(c, Math.round(W * 0.8), Math.round(D * 0.7));
    for (let k = 0; k < 10; k++) {
      const x = Math.round(W * 0.35 + r() * W * 0.3), z = Math.round(D * 0.3 + r() * D * 0.55);
      if (Math.abs(x - cx) < 10 || g.get(x, FLOOR, z)) continue;
      candle(c, x, FLOOR, z, 2 + Math.floor(r() * 3), k % 3 === 0);
    }
    vines(c, 0.12, 30); wallMoss(c, 0.9);
    dust(c, 50);
  },
};

export const THEMES: Theme[] = [flooded, library, lab, grotto, garden, forge, shrine, ...THEMES2];
export const themeById = (id: string) => THEMES.find((t) => t.id === id)!;
