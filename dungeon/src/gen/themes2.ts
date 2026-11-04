/* Rooms for the desert, ice, archive, volcanic and celestial floors. */
import { FLOOR, M, WALL_H, WALL_T, hash2 } from './core.ts';
import {
  type RoomCtx, banner, barrel, bookcase, boulder, brazier, cactus, candle, carpet, chest, column, crate, crystal,
  deadTree, freeShelf, goldPile, grassCover, jar, lantern, liquidPond, obelisk, palm, pondMask, rug, sandDrifts,
  sarcophagus, shroom, slab, snowCover, table, telescope, throne, tree, vines, wallFaces, walls, waterDistance,
} from './build.ts';
import type { Theme } from './themes.ts';

const dust = (c: RoomCtx, n: number) =>
  c.emitters.push({ kind: 'dust', pos: [c.W / 2, 34, c.D / 2], size: [c.W / 2 - 8, 24, c.D / 2 - 8], count: n });
const P = (c: RoomCtx, fx: number, fz: number): [number, number] => [Math.round(fx * c.W), Math.round(fz * c.D)];

/* A stone fireplace against the back wall, fire inside. */
function fireplace(c: RoomCtx, x0: number, w: number, mat: number) {
  const { g } = c;
  const d = 14;
  g.box(x0, FLOOR - 1, WALL_T, x0 + w, FLOOR + 22, WALL_T + d, (x, y) => ((y + (x >> 2)) % 5 === 0 ? M.MORTAR : mat));
  g.box(x0 + 4, FLOOR + 22, WALL_T, x0 + w - 4, WALL_H, WALL_T + 8, mat);
  g.box(x0 + 4, FLOOR + 1, WALL_T + 3, x0 + w - 4, FLOOR + 15, WALL_T + d, M.AIR);
  for (let z = WALL_T + 3; z < WALL_T + d; z++) for (let x = x0 + 4; x < x0 + w - 4; x++) {
    g.set(x, FLOOR, z, M.COAL);
    const h = Math.floor(hash2(x, z, 2) * 8 * (1 - Math.abs(x - x0 - w / 2) / (w / 2)));
    for (let y = 0; y < h; y++) g.set(x, FLOOR + 1 + y, z, y > h - 3 ? M.EMBER : M.FIRE);
  }
  c.lights.push({ pos: [x0 + w / 2, FLOOR + 8, WALL_T + d + 4], radius: 70, color: [1.0, 0.55, 0.22], flicker: 0.3 });
  c.emitters.push({ kind: 'ember', pos: [x0 + w / 2, FLOOR + 10, WALL_T + d - 4], size: [w / 2 - 5, 2, 4], count: 18 });
}

/* ================================================================ desert */

const oasis: Theme = {
  id: 'oasis', name: 'Palm Oasis',
  build(c) {
    c.sky = true;
    const pool = pondMask(c, [[0.55, 0.55, 0.22, 0.2], [0.42, 0.66, 0.14, 0.12]], 14);
    slab(c, 'sand', pool);
    walls(c, c.bio.wall);
    const dist = waterDistance(c);
    // a ring of green where the water reaches
    for (let z = WALL_T; z < c.D - WALL_T; z++) for (let x = WALL_T; x < c.W - WALL_T; x++) {
      const d = dist[x + c.W * z];
      if (d > 0 && d < 9 && hash2(x, z, 5) < 0.9 - d * 0.08) {
        c.g.set(x, FLOOR - 1, z, M.GRASS);
        if (hash2(x, z, 6) < 0.18) for (let k = 0; k < 1 + (hash2(x, z, 7) * 4 | 0); k++) c.g.put(x, FLOOR + k, z, k > 1 ? M.GRASS_LIGHT : M.GRASS);
      }
    }
    for (const [fx, fz] of [[0.32, 0.4], [0.72, 0.36], [0.76, 0.74], [0.3, 0.78], [0.6, 0.28]]) palm(c, ...P(c, fx, fz), 26 + Math.floor(c.r() * 10));
    for (const [fx, fz] of [[0.15, 0.2], [0.88, 0.16], [0.14, 0.6], [0.88, 0.9]]) cactus(c, ...P(c, fx, fz), 10 + Math.floor(c.r() * 8));
    for (const [fx, fz] of [[0.2, 0.36], [0.23, 0.4]]) jar(c, ...P(c, fx, fz));
    rug(c, ...P(c, 0.12, 0.42), 20, 14, M.CLOTH, M.GLYPH);
    sandDrifts(c, 6);
    c.emitters.push({ kind: 'firefly', pos: [c.W * 0.55, 18, c.D * 0.55], size: [c.W * 0.25, 6, c.D * 0.25], count: 8 });
    dust(c, 30);
  },
};

const tomb: Theme = {
  id: 'tomb', name: "Pharaoh's Tomb",
  build(c) {
    slab(c, 'sandtile');
    walls(c, c.bio.wall);
    c.amb = [0.85, 0.75, 0.7];
    const [cx, cz] = P(c, 0.5, 0.42);
    sarcophagus(c, cx - 7, cz - 4);
    // guardian statues and a row of canopic jars
    for (const dx of [-30, 30]) obelisk(c, cx + dx, cz - 10, 26);
    for (let k = 0; k < 8; k++) jar(c, Math.round(c.W * 0.15) + k * 9, Math.round(c.D * 0.82), 7 + (k % 3), k % 2 ? M.TERRACOTTA : M.SANDSTONE_DARK);
    brazier(c, cx - 22, cz + 18); brazier(c, cx + 21, cz + 18);
    goldPile(c, ...P(c, 0.82, 0.3), 6); goldPile(c, ...P(c, 0.15, 0.3), 5);
    chest(c, ...P(c, 0.78, 0.62));
    carpet(c, cx - 5, cz + 14, cx + 6, c.D - WALL_T - 4);
    sandDrifts(c, 8);
    c.emitters.push({ kind: 'gold', pos: [cx, FLOOR + 14, cz], size: [16, 6, 10], count: 14 });
    dust(c, 40);
  },
};

const bazaar: Theme = {
  id: 'bazaar', name: 'Sand Bazaar',
  build(c) {
    const { g } = c;
    slab(c, 'sandtile');
    walls(c, c.bio.wall);
    const colors = [M.CLOTH, M.BOOK_B, M.CARPET_TRIM, M.GLYPH];
    const stalls = [[0.22, 0.25], [0.6, 0.22], [0.25, 0.65], [0.66, 0.62]];
    stalls.forEach(([fx, fz], i) => {
      const [x0, z0] = P(c, fx, fz);
      const top = table(c, x0, z0, 24, 12, 8);
      for (const [dx, dz] of [[0, 0], [23, 0], [0, 11], [23, 11]]) g.box(x0 + dx, FLOOR - 1, z0 + dz, x0 + dx + 1, FLOOR + 24, z0 + dz + 1, M.PLANK_DARK);
      // striped awning
      g.box(x0 - 2, FLOOR + 24, z0 - 2, x0 + 26, FLOOR + 25, z0 + 14, (x) => (Math.floor((x - x0) / 4) % 2 ? colors[i] : M.PAPER));
      for (let k = 0; k < 7; k++) {
        const px = x0 + 2 + k * 3;
        if (i % 2) jar(c, px, z0 + 6, 5, k % 2 ? M.TERRACOTTA : M.GLYPH);
        else g.box(px, top, z0 + 3, px + 2, top + 2, z0 + 9, [M.CHEST, M.GOLD, M.POTION_G, M.BOOK_R][k % 4]);
      }
      rug(c, x0 + 2, z0 + 15, 20, 10, colors[(i + 1) % 4], colors[(i + 2) % 4]);
    });
    lantern(c, ...P(c, 0.45, 0.45)); lantern(c, ...P(c, 0.85, 0.85));
    for (let k = 0; k < 5; k++) crate(c, c.W - WALL_T - 12, FLOOR - 1, WALL_T + 30 + k * 11, 10);
    for (let k = 0; k < 6; k++) jar(c, WALL_T + 8 + k * 8, c.D - WALL_T - 8, 8);
    sandDrifts(c, 4);
    dust(c, 50);
  },
};

const dunehall: Theme = {
  id: 'dunehall', name: 'Swallowed Hall',
  build(c) {
    const { g, r } = c;
    slab(c, 'sand');
    walls(c, c.bio.wall);
    // a colonnade the desert has half buried
    for (let z = Math.round(c.D * 0.25); z < c.D * 0.85; z += 36) for (const fx of [0.3, 0.7]) column(c, Math.round(fx * c.W), z, 20 + Math.floor(r() * 36), M.SANDSTONE);
    // and a colossal head, eyes still painted
    const [hx, hz] = P(c, 0.5, 0.55);
    for (let y = -14; y <= 14; y++) for (let z = -14; z <= 14; z++) for (let x = -14; x <= 14; x++) {
      if (Math.hypot(x, y * 1.15, z) > 14) continue;
      const eye = (z > 10) && y > 1 && y < 5 && (Math.abs(x - 5) < 3 || Math.abs(x + 5) < 3);
      g.set(hx + x, FLOOR + 2 + y, hz + z, eye ? M.GLYPH : y > 9 ? M.GOLD : M.SANDSTONE);
    }
    sandDrifts(c, 16);
    for (let k = 0; k < 4; k++) cactus(c, Math.round(WALL_T + 16 + r() * (c.W - 40)), Math.round(WALL_T + 16 + r() * (c.D - 40)), 8 + Math.floor(r() * 6));
    boulder(c, ...P(c, 0.2, 0.8), 6, false, M.SANDSTONE_DARK);
    c.emitters.push({ kind: 'sand', pos: [c.W / 2, 20, c.D / 2], size: [c.W / 2 - 10, 10, c.D / 2 - 10], count: 40 });
    dust(c, 40);
  },
};

const obeliskCourt: Theme = {
  id: 'obelisk', name: 'Court of the Sun',
  build(c) {
    c.sky = true;
    slab(c, 'sandtile');
    walls(c, c.bio.wall);
    const [cx, cz] = P(c, 0.5, 0.5);
    obelisk(c, cx, cz, 60);
    for (const [dx, dz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) brazier(c, cx + dx, cz + dz, 6);
    carpet(c, cx - 4, cz + 8, cx + 5, c.D - WALL_T - 4);
    for (const [fx, fz] of [[0.14, 0.15], [0.86, 0.15], [0.14, 0.86], [0.86, 0.86]]) palm(c, ...P(c, fx, fz), 24);
    sandDrifts(c, 7);
    c.emitters.push({ kind: 'gold', pos: [cx, 60, cz], size: [6, 10, 6], count: 10 });
    dust(c, 30);
  },
};

/* =================================================================== ice */

const frozenLake: Theme = {
  id: 'frozenlake', name: 'Frozen Mere',
  build(c) {
    const pool = pondMask(c, [[0.55, 0.55, 0.32, 0.28], [0.3, 0.75, 0.18, 0.15]]);
    slab(c, 'snow');
    liquidPond(c, pool);
    walls(c, c.bio.wall);
    const dist = waterDistance(c);
    // frozen reeds poking through the bank
    for (let z = WALL_T; z < c.D - WALL_T; z++) for (let x = WALL_T; x < c.W - WALL_T; x++) {
      const d = dist[x + c.W * z];
      if (d > 0 && d < 3 && hash2(x, z, 41) < 0.08) for (let k = 0; k < 3 + (hash2(x, z, 42) * 7 | 0); k++) c.g.put(x, FLOOR + k, z, k > 4 ? M.ICE : M.REED);
    }
    deadTree(c, ...P(c, 0.2, 0.25), 26); deadTree(c, ...P(c, 0.84, 0.82), 20);
    boulder(c, ...P(c, 0.85, 0.3), 6, false); boulder(c, ...P(c, 0.15, 0.6), 5, false);
    lantern(c, ...P(c, 0.3, 0.48));
    for (let k = 0; k < 4; k++) crystal(c, Math.round(c.W * (0.4 + k * 0.08)), Math.round(c.D * 0.2), 6 + k * 3, 0.1, M.ICE);
    vines(c);
    snowCover(c, 0.6);
    c.emitters.push({ kind: 'sparkle', pos: [c.W * 0.55, 12, c.D * 0.55], size: [c.W * 0.3, 3, c.D * 0.25], count: 24, color: [0.85, 0.95, 1.0] });
  },
};

const iceCave: Theme = {
  id: 'icecave', name: 'Glacier Cave',
  build(c) {
    const { g, r } = c;
    slab(c, 'snow');
    walls(c, c.bio.wall, false);
    c.amb = [0.85, 0.95, 1.15];
    // frozen spires, some glowing from within
    for (let k = 0; k < 18; k++) {
      const x = Math.round(WALL_T + 14 + r() * (c.W - 2 * WALL_T - 28)), z = Math.round(WALL_T + 14 + r() * (c.D - 2 * WALL_T - 28));
      crystal(c, x, z, 8 + Math.floor(r() * 26), (r() - 0.5) * 0.6, r() < 0.3 ? M.CRYSTAL : M.ICE);
    }
    for (const [fx, fz] of [[0.25, 0.3], [0.7, 0.65], [0.4, 0.8]]) {
      const [x, z] = P(c, fx, fz);
      for (let k = 0; k < 4; k++) crystal(c, x + Math.round((r() - 0.5) * 8), z + Math.round((r() - 0.5) * 8), 10 + Math.floor(r() * 14), (r() - 0.5) * 0.5, M.CRYSTAL);
      c.lights.push({ pos: [x, FLOOR + 12, z], radius: 48, color: [0.35, 0.85, 1.0], flicker: 0.04 });
    }
    // great icicles from the ceiling line
    for (const wl of wallFaces(c)) for (let u = WALL_T; u < wl.len - WALL_T; u += 3) {
      if (hash2(u, 2, c.seed) > 0.5) continue;
      const len = 6 + Math.floor(Math.pow(hash2(u, 3, c.seed), 2) * 30);
      for (let k = 0; k < len; k++) for (let d = 1; d <= Math.max(1, 3 - (k >> 3)); d++) { const [x, y, z] = wl.at(u, WALL_H - k, d); g.put(x, y, z, M.ICE); }
    }
    shroom(c, ...P(c, 0.85, 0.2));
    snowCover(c, 0.5);
    c.emitters.push({ kind: 'sparkle', pos: [c.W / 2, 30, c.D / 2], size: [c.W / 2 - 10, 20, c.D / 2 - 10], count: 30, color: [0.6, 0.95, 1.0] });
  },
};

const frostGarden: Theme = {
  id: 'frostgarden', name: 'Frost Garden',
  build(c) {
    const { g } = c;
    c.sky = true;
    const [fx, fz] = P(c, 0.6, 0.62);
    slab(c, 'snow');
    liquidPond(c, (x, z) => Math.hypot(x - fx, z - fz) < 11);
    walls(c, c.bio.wall);
    for (let z = -13; z <= 13; z++) for (let x = -13; x <= 13; x++) {
      const d = Math.hypot(x, z);
      if (d >= 11 && d <= 13) g.box(fx + x, FLOOR - 1, fz + z, fx + x + 1, FLOOR + 3, fz + z + 1, M.STEP);
    }
    g.box(fx - 1, 2, fz - 1, fx + 2, FLOOR + 8, fz + 2, M.ICE);
    for (const [ax, az, h] of [[0.25, 0.3, 30], [0.8, 0.25, 24], [0.22, 0.8, 22]] as const) deadTree(c, ...P(c, ax, az), h);
    for (const [hx, hz, len] of [[0.1, 0.5, 30], [0.45, 0.12, 36]] as const) {
      const [x0, z0] = P(c, hx, hz);
      g.box(x0, FLOOR, z0, x0 + len, FLOOR + 7, z0 + 6, (x, y, z) => (hash2(x, y, z) < 0.25 ? M.LEAF_DARK : M.SNOW));
    }
    // frost roses
    for (let k = 0; k < 30; k++) { const x = Math.round(WALL_T + 10 + c.r() * (c.W - 30)), z = Math.round(WALL_T + 10 + c.r() * (c.D - 30)); g.put(x, FLOOR, z, M.LEAF_DARK); g.put(x, FLOOR + 1, z, M.CRYSTAL); }
    lantern(c, ...P(c, 0.4, 0.45));
    vines(c);
    snowCover(c, 0.75);
  },
};

const hearth: Theme = {
  id: 'hearth', name: 'Hearth Hall',
  build(c) {
    const { g } = c;
    slab(c, 'plank');
    walls(c, c.bio.wall);
    c.amb = [1.1, 0.95, 0.85];
    fireplace(c, Math.round(c.W * 0.4), 36, M.STEP);
    rug(c, ...P(c, 0.38, 0.32), 40, 24, M.SNOW, M.PAPER); // a pale fur before the fire
    const top = table(c, ...P(c, 0.45, 0.62), 40, 12, 9);
    for (let k = 0; k < 4; k++) candle(c, Math.round(c.W * 0.45) + 5 + k * 10, top, Math.round(c.D * 0.62) + 5, 3, k % 2 === 0);
    for (const dz of [-5, 14]) g.box(Math.round(c.W * 0.45), FLOOR - 1, Math.round(c.D * 0.62) + dz, Math.round(c.W * 0.45) + 40, FLOOR + 4, Math.round(c.D * 0.62) + dz + 3, M.PLANK_DARK);
    for (let k = 0; k < 3; k++) barrel(c, c.W - WALL_T - 9, WALL_T + 14 + k * 13);
    crate(c, WALL_T, FLOOR - 1, c.D - WALL_T - 24, 10); crate(c, WALL_T, FLOOR + 9, c.D - WALL_T - 22, 8);
    // firewood stacked by the hearth
    for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) g.set(Math.round(c.W * 0.4) - 12 + x, FLOOR - 1 + y, WALL_T + 2 + (y & 1), (x + y) % 3 ? M.BARK : M.PLANK);
    banner(c, 'z0', Math.round(c.W * 0.2), M.BOOK_B); banner(c, 'z0', Math.round(c.W * 0.75), M.BOOK_B);
    vines(c);
    dust(c, 40);
  },
};

/* =============================================================== archive */

/* Bookcases up the full height of every wall, with a gallery to reach them. */
function tallStacks(c: RoomCtx, height: number, gallery: boolean) {
  const { g } = c;
  for (const wl of wallFaces(c)) {
    let u = WALL_T + 6;
    while (u < wl.len - WALL_T - 10) {
      if (wl.side === 'x0' && c.windows.some(([z0, z1]) => u + 30 > z0 - 4 && u < z1 + 4)) { u += 4; continue; }
      const len = Math.min(30, wl.len - WALL_T - 6 - u);
      if (len > 8) bookcase(c, wl.side, u, len, height, 6);
      u += len + 3;
    }
    if (!gallery) continue;
    for (let u2 = WALL_T; u2 < wl.len - WALL_T; u2++) for (let k = 7; k <= 13; k++) {
      const [x, y, z] = wl.at(u2, FLOOR + 30, k);
      g.set(x, y, z, k === 13 ? M.PLANK_DARK : M.PLANK);
      if (k === 13) { g.set(x, y + 1, z, u2 % 4 === 0 ? M.PLANK_DARK : M.AIR); g.set(x, y + 4, z, M.PLANK_DARK); if (u2 % 4 === 0) for (let dy = 2; dy < 4; dy++) g.set(x, y + dy, z, M.PLANK_DARK); }
    }
  }
}

const readingHall: Theme = {
  id: 'readinghall', name: 'Great Reading Hall',
  build(c) {
    const { g, r } = c;
    slab(c, 'plank');
    walls(c, 'plaster');
    c.amb = [1.05, 0.92, 0.85];
    tallStacks(c, 62, true);
    // long reading tables, lamps, open books
    for (const fz of [0.36, 0.62]) {
      const [x0, z0] = P(c, 0.25, fz);
      const top = table(c, x0, z0, Math.round(c.W * 0.5), 10, 8);
      for (let k = 0; k < 5; k++) {
        const x = x0 + 4 + k * Math.round(c.W * 0.1);
        candle(c, x, top, z0 + 4, 3, k % 2 === 0);
        g.box(x + 3, top, z0 + 2, x + 8, top + 1, z0 + 7, M.PAPER);
      }
    }
    // ladders up to the gallery
    for (const u of [0.3, 0.7]) for (let y = FLOOR - 1; y < FLOOR + 31; y++) {
      g.set(Math.round(c.W * u), y, WALL_T + 8, M.PLANK_DARK); g.set(Math.round(c.W * u) + 4, y, WALL_T + 8, M.PLANK_DARK);
      if (y % 3 === 0) g.box(Math.round(c.W * u), y, WALL_T + 8, Math.round(c.W * u) + 5, y + 1, WALL_T + 9, M.PLANK);
    }
    // books drifting in the air
    for (let k = 0; k < 16; k++) {
      const x = Math.round(30 + r() * (c.W - 60)), z = Math.round(30 + r() * (c.D - 60)), y = Math.round(40 + r() * 20);
      g.box(x, y, z, x + 3, y + 1, z + 2, [M.BOOK_R, M.BOOK_B, M.BOOK_G, M.BOOK_Y][k % 4]);
      g.box(x + 1, y + 1, z, x + 2, y + 2, z + 2, M.PAPER);
    }
    c.emitters.push({ kind: 'sparkle', pos: [c.W / 2, 50, c.D / 2], size: [c.W / 2 - 30, 10, c.D / 2 - 30], count: 30, color: [1.0, 0.85, 0.5] });
    dust(c, 60);
  },
};

const observatory: Theme = {
  id: 'observatory', name: 'Star Observatory',
  build(c) {
    const { g } = c;
    c.sky = true;
    slab(c, 'marble');
    walls(c, c.bio.wall === 'plaster' ? 'plaster' : c.bio.wall);
    // a star chart inlaid in the floor
    const [cx, cz] = P(c, 0.5, 0.52);
    const R = Math.min(c.W, c.D) * 0.32;
    for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
      const d = Math.hypot(x, z);
      if (d > R) continue;
      const ring = Math.abs(d - R) < 1 || Math.abs(d - R * 0.6) < 0.6;
      const star = hash2(Math.round(x), Math.round(z), 77) < 0.012;
      g.set(Math.round(cx + x), FLOOR - 1, Math.round(cz + z), ring || star ? M.GOLD : M.BOOK_B);
    }
    telescope(c, cx - 4, cz - 4);
    // an orrery: planets on gold arms
    const [ox, oz] = P(c, 0.78, 0.25);
    g.box(ox, FLOOR - 1, oz, ox + 2, FLOOR + 12, oz + 2, M.GOLD);
    g.box(ox - 1, FLOOR + 12, oz - 1, ox + 3, FLOOR + 15, oz + 3, M.LANTERN);
    for (const [k, rad] of [6, 10, 14].entries()) {
      const a = k * 2.1;
      const px = Math.round(ox + Math.cos(a) * rad), pz = Math.round(oz + Math.sin(a) * rad);
      for (let s = 0; s <= rad; s++) g.set(Math.round(ox + Math.cos(a) * s), FLOOR + 13, Math.round(oz + Math.sin(a) * s), M.GOLD);
      g.box(px - 1, FLOOR + 12, pz - 1, px + 2, FLOOR + 15, pz + 2, [M.BOOK_R, M.GLYPH, M.CRYSTAL][k]);
    }
    c.lights.push({ pos: [ox + 1, FLOOR + 16, oz + 1], radius: 30, color: [1.0, 0.85, 0.5] });
    for (const wl of wallFaces(c)) if (wl.side === 'z0' || wl.side === 'x1') bookcase(c, wl.side, WALL_T + 10, Math.min(40, wl.len - 30), 30);
    for (let k = 0; k < 6; k++) candle(c, cx + Math.round(Math.cos(k) * (R + 4)), FLOOR, cz + Math.round(Math.sin(k) * (R + 4)), 3, k % 2 === 0);
    c.emitters.push({ kind: 'star', pos: [c.W / 2, 66, c.D / 2], size: [c.W / 2 - 10, 8, c.D / 2 - 10], count: 30 });
  },
};

const scriptorium: Theme = {
  id: 'scriptorium', name: 'Scriptorium',
  build(c) {
    const { g } = c;
    slab(c, 'plank');
    walls(c, 'plaster');
    c.amb = [1.05, 0.92, 0.85];
    tallStacks(c, 40, false);
    // rows of writing desks, each with a candle, a page and an inkwell
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const x0 = Math.round(c.W * (0.24 + col * 0.2)), z0 = Math.round(c.D * (0.3 + row * 0.18));
      const top = table(c, x0, z0, 14, 8, 7);
      g.box(x0 + 3, top, z0 + 2, x0 + 8, top + 1, z0 + 6, M.PAPER);
      g.set(x0 + 10, top, z0 + 2, M.COAL);
      candle(c, x0 + 11, top, z0 + 5, 2, (row + col) % 2 === 0);
      g.box(x0 + 4, FLOOR - 1, z0 + 9, x0 + 9, FLOOR + 4, z0 + 12, (x, y, z) => (y === FLOOR + 3 ? M.PLANK : z === z0 + 11 ? M.PLANK_DARK : M.AIR));
    }
    // racks of scrolls
    for (let k = 0; k < 2; k++) {
      const x0 = Math.round(c.W * (0.12 + k * 0.7)), z0 = Math.round(c.D * 0.78);
      for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) g.set(x0 + x, FLOOR - 1 + y, z0, y % 4 === 0 || x % 4 === 0 ? M.PLANK_DARK : (x + y) % 3 ? M.PAPER : M.CANDLE);
    }
    freeShelf(c, Math.round(c.W * 0.85), Math.round(c.D * 0.25), 30, false, 24);
    dust(c, 50);
    c.emitters.push({ kind: 'sparkle', pos: [c.W / 2, 30, c.D / 2], size: [c.W / 2 - 30, 12, c.D / 2 - 30], count: 12, color: [1.0, 0.85, 0.5] });
  },
};

/* ============================================================= volcanic */

const lavaHall: Theme = {
  id: 'lavahall', name: 'Lava Rift',
  build(c) {
    const { g, r } = c;
    const mask = (x: number, z: number) => {
      const zc = c.D * 0.5 + Math.sin(x * 0.04) * c.D * 0.12;
      return x > WALL_T + 2 && x < c.W - WALL_T - 2 && Math.abs(z - zc) < 14 + Math.sin(x * 0.11) * 4;
    };
    slab(c, 'basalt');
    liquidPond(c, mask);
    walls(c, c.bio.wall);
    c.amb = [1.05, 0.8, 0.75];
    // a stone bridge across the rift
    const bx = Math.round(c.W * 0.5);
    for (let z = WALL_T; z < c.D - WALL_T; z++) if (mask(bx, z) || mask(bx - 6, z) || mask(bx + 6, z)) {
      g.box(bx - 7, FLOOR - 1, z, bx + 8, FLOOR, z + 1, M.BASALT);
      g.set(bx - 7, FLOOR, z, M.COAL); g.set(bx + 7, FLOOR, z, M.COAL);
      if (z % 10 === 0) g.box(bx - 7, 2, z, bx + 8, FLOOR - 1, z + 2, M.BASALT);
    }
    // obsidian spires
    for (let k = 0; k < 14; k++) {
      const x = Math.round(WALL_T + 10 + r() * (c.W - 30)), z = Math.round(WALL_T + 10 + r() * (c.D - 30));
      if (g.get(x, 0, z) === M.POOLBED) continue;
      crystal(c, x, z, 6 + Math.floor(r() * 18), (r() - 0.5) * 0.5, M.COAL);
    }
    for (let k = 0; k < 6; k++) c.lights.push({ pos: [c.W * (0.1 + k * 0.16), FLOOR + 4, c.D * 0.5 + Math.sin(c.W * (0.1 + k * 0.16) * 0.04) * c.D * 0.12], radius: 46, color: [1.0, 0.42, 0.12], flicker: 0.2 });
    c.emitters.push({ kind: 'ember', pos: [c.W / 2, FLOOR + 2, c.D / 2], size: [c.W / 2 - 10, 2, 14], count: 22 });
    dust(c, 20);
  },
};

const foundry: Theme = {
  id: 'foundry', name: 'Great Foundry',
  build(c) {
    const { g } = c;
    slab(c, 'basalt');
    walls(c, c.bio.wall);
    // a crucible of molten metal hanging on chains
    const [cx, cz] = P(c, 0.45, 0.45);
    for (let y = 0; y < 12; y++) {
      const rad = 7 + Math.sin((y / 12) * Math.PI) * 2;
      for (let z = -10; z <= 10; z++) for (let x = -10; x <= 10; x++) {
        const d = Math.hypot(x, z);
        if (d > rad) continue;
        g.set(cx + x, FLOOR + 14 + y, cz + z, y === 10 && d < rad - 1.2 ? M.LAVA : y < 10 && d < rad - 1.2 ? M.AIR : M.IRON);
      }
    }
    for (const [dx, dz] of [[-6, 0], [6, 0]]) for (let y = FLOOR + 24; y < WALL_H; y++) g.set(cx + dx, y, cz + dz, y % 2 ? M.IRON : M.COAL);
    g.box(WALL_T, WALL_H - 4, cz - 1, c.W - WALL_T, WALL_H - 2, cz + 2, M.IRON);
    // the pour: a stream into a channel of moulds
    for (let y = FLOOR; y < FLOOR + 24; y++) g.set(cx + 8, y, cz, M.LAVA);
    for (let x = cx + 6; x < c.W - WALL_T - 8; x++) {
      g.set(x, FLOOR - 1, cz, M.LAVA); g.set(x, FLOOR - 1, cz - 1, M.IRON); g.set(x, FLOOR - 1, cz + 1, M.IRON);
      if ((x - cx) % 10 === 0) g.box(x - 3, FLOOR - 1, cz + 3, x + 3, FLOOR, cz + 8, (xx, y, z) => (z === cz + 3 || xx === x - 3 || xx === x + 2 || z === cz + 7 ? M.IRON : M.LAVA));
    }
    // stacked ingots
    for (let k = 0; k < 3; k++) for (let y = 0; y < 4; y++) for (let i = 0; i < 4 - y; i++)
      g.box(Math.round(c.W * 0.15) + k * 16 + i * 3 + y, FLOOR - 1 + y * 2, Math.round(c.D * 0.8), Math.round(c.W * 0.15) + k * 16 + i * 3 + y + 2, FLOOR + 1 + y * 2, Math.round(c.D * 0.8) + 6, k === 1 ? M.GOLD : M.IRON);
    fireplace(c, Math.round(c.W * 0.65), 30, M.BASALT);
    brazier(c, ...P(c, 0.2, 0.3), 8);
    c.lights.push({ pos: [cx, FLOOR + 10, cz], radius: 60, color: [1.0, 0.5, 0.15], flicker: 0.2 });
    c.emitters.push({ kind: 'ember', pos: [cx + 8, FLOOR + 4, cz], size: [3, 2, 3], count: 20 });
    dust(c, 20);
  },
};

/* ============================================================ celestial */

const throneRoom: Theme = {
  id: 'throne', name: 'Throne of Stars',
  build(c) {
    slab(c, 'marble');
    walls(c, c.bio.wall);
    const cx = Math.round(c.W * 0.5);
    throne(c, cx, WALL_T + 2);
    carpet(c, cx - 6, WALL_T + 24, cx + 7, c.D - WALL_T - 4);
    for (let z = Math.round(c.D * 0.3); z < c.D * 0.88; z += 30) for (const x of [cx - 26, cx + 25]) column(c, x, z, 54);
    for (const [k, u] of [0.15, 0.3, 0.7, 0.85].entries()) banner(c, 'z0', Math.round(c.W * u), k % 2 ? M.BOOK_B : M.CLOTH);
    brazier(c, cx - 22, WALL_T + 30); brazier(c, cx + 21, WALL_T + 30);
    // a ring of floating candles above the dais
    for (let k = 0; k < 10; k++) candle(c, cx + Math.round(Math.cos(k * 0.628) * 18), FLOOR + 44, WALL_T + 14 + Math.round(Math.sin(k * 0.628) * 10), 2, k % 3 === 0);
    c.emitters.push({ kind: 'gold', pos: [cx, FLOOR + 30, WALL_T + 14], size: [20, 14, 10], count: 20 });
    dust(c, 30);
  },
};

const treasury: Theme = {
  id: 'treasury', name: 'Royal Treasury',
  build(c) {
    const { r } = c;
    slab(c, 'marble');
    walls(c, c.bio.wall);
    c.amb = [1.05, 0.98, 0.9];
    for (let k = 0; k < 9; k++) goldPile(c, Math.round(WALL_T + 18 + r() * (c.W - 50)), Math.round(WALL_T + 18 + r() * (c.D - 50)), 4 + Math.floor(r() * 8));
    for (let k = 0; k < 6; k++) chest(c, Math.round(WALL_T + 10 + r() * (c.W - 40)), Math.round(WALL_T + 10 + r() * (c.D - 40)));
    for (const [fx, fz] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) column(c, ...P(c, fx, fz), 50, M.MARBLE);
    for (const [fx, fz] of [[0.5, 0.2], [0.2, 0.5], [0.8, 0.5]]) jar(c, ...P(c, fx, fz), 10, M.GOLD);
    lantern(c, ...P(c, 0.5, 0.5)); lantern(c, ...P(c, 0.12, 0.88));
    c.emitters.push({ kind: 'gold', pos: [c.W / 2, 16, c.D / 2], size: [c.W / 2 - 15, 6, c.D / 2 - 15], count: 50 });
    dust(c, 30);
  },
};

const starGarden: Theme = {
  id: 'stargarden', name: 'Moon Garden',
  build(c) {
    const { g } = c;
    c.sky = true;
    const [fx, fz] = P(c, 0.65, 0.65);
    slab(c, 'grass', (x, z) => Math.hypot(x - fx, z - fz) < 11);
    walls(c, c.bio.wall);
    for (let z = -13; z <= 13; z++) for (let x = -13; x <= 13; x++) {
      const d = Math.hypot(x, z);
      if (d >= 11 && d <= 13) g.box(fx + x, FLOOR - 1, fz + z, fx + x + 1, FLOOR + 3, fz + z + 1, M.MARBLE);
    }
    tree(c, ...P(c, 0.3, 0.35), 30, 22, 0.6);
    grassCover(c, 0.3);
    for (let k = 0; k < 10; k++) shroom(c, Math.round(WALL_T + 12 + c.r() * (c.W - 40)), Math.round(WALL_T + 12 + c.r() * (c.D - 40)), k % 3 === 0);
    for (let k = 0; k < 40; k++) { const x = Math.round(WALL_T + 8 + c.r() * (c.W - 24)), z = Math.round(WALL_T + 8 + c.r() * (c.D - 24)); g.put(x, FLOOR, z, M.GRASS); g.put(x, FLOOR + 1, z, k % 2 ? M.FLOWER_W : M.CRYSTAL); }
    lantern(c, ...P(c, 0.5, 0.5));
    c.emitters.push({ kind: 'firefly', pos: [c.W / 2, 22, c.D / 2], size: [c.W / 2 - 14, 12, c.D / 2 - 14], count: 24, color: [0.7, 0.85, 1.0] });
    c.emitters.push({ kind: 'petal', pos: [c.W * 0.3, 55, c.D * 0.35], size: [24, 5, 24], count: 14 });
  },
};

export const THEMES2: Theme[] = [oasis, tomb, bazaar, dunehall, obeliskCourt, frozenLake, iceCave, frostGarden, hearth, readingHall, observatory, scriptorium, lavaHall, foundry, throneRoom, treasury, starGarden];
