/* The whole tower, the overview: 96×280 native, every floor a small cutaway.
 *
 * Bottom up, as the stairs go: bath cellar (underground), portal sanctum
 * (ground), sleeping quarters, library, laboratory, kitchen, and the
 * observatory open to the sky. Same palette, same one-light shading and the
 * same section cut as the room drawings, so zooming from here into a room
 * reads as one place. Each floor carries its own light sources: render(f)
 * keeps floor f lit and puts the others' lights out.
 *
 *   node tower.js   → preview/tower.png (all lit, and one floor in focus)
 */
const P = require("./core/pixel.js");
const W = 96, H = 280;

const R = {
  wood:  P.hueRamp(7, { hue: 24, sat: 0.5,  light: [0.05, 0.47], shift: 22 }),
  floor: P.hueRamp(7, { hue: 20, sat: 0.52, light: [0.06, 0.5],  shift: 22 }),
  cut:   P.hueRamp(4, { hue: 22, sat: 0.22, light: [0.07, 0.2],  shift: 20 }),
  stone: P.hueRamp(6, { hue: 30, sat: 0.14, light: [0.1, 0.5],   shift: 30 }),
  paper: P.hueRamp(6, { hue: 40, sat: 0.38, light: [0.22, 0.86], shift: 20 }),
  blood: P.hueRamp(6, { hue: 4,  sat: 0.58, light: [0.07, 0.48], shift: 20 }),
  green: P.hueRamp(5, { hue: 150, sat: 0.22, light: [0.07, 0.4], shift: 25 }),
  blue:  P.hueRamp(5, { hue: 218, sat: 0.26, light: [0.07, 0.42], shift: 25 }),
  brass: P.hueRamp(6, { hue: 42, sat: 0.55, light: [0.14, 0.74], shift: 25 }),
  sky:   P.hueRamp(6, { hue: 250, sat: 0.16, light: [0.12, 0.62], shift: 30 }),
  leaf:  P.hueRamp(5, { hue: 112, sat: 0.36, light: [0.07, 0.48], shift: 35 }),
  grass: P.hueRamp(5, { hue: 100, sat: 0.3,  light: [0.08, 0.42], shift: 35 }),
  earth: P.hueRamp(5, { hue: 26,  sat: 0.3,  light: [0.05, 0.26], shift: 25 }),
  tile:  P.hueRamp(6, { hue: 170, sat: 0.18, light: [0.1, 0.6],   shift: 30 }),
  water: P.hueRamp(5, { hue: 185, sat: 0.45, light: [0.18, 0.62], shift: 25 }),
  quilt: P.hueRamp(5, { hue: 30,  sat: 0.55, light: [0.15, 0.6],  shift: 40 }),
  clay:  P.hueRamp(5, { hue: 18,  sat: 0.45, light: [0.12, 0.55], shift: 25 }),
};
// the materials the rooms use come from the rooms' own palette, so tower and rooms match
for (const k of ["wood", "floor", "cut", "stone", "paper", "blood", "green", "blue", "brass", "leaf", "clay", "tile", "water", "ochre", "slate", "linen", "ebony", "copper"]) R[k] = require("./room-kit.js").RAMPS[k];
const MATS = Object.keys(R), M = Object.fromEntries(MATS.map((k, i) => [k, i]));
const mat = new Int16Array(W * H).fill(-1), val = new Float32Array(W * H);
const owner = new Int8Array(W * H).fill(-1);       // which floor a pixel belongs to (-1: outside)
const fixedL = new Float32Array(W * H);            // >0: lit by this (sky, the cut, the land)
const emit = [];                                   // self-lit pixels: [x, y, rgb, floor]
let cur = -1;                                      // the floor being drawn
const set = (x, y, m, v) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x; mat[i] = M[m]; val[i] = v; owner[i] = cur; fixedL[i] = 0;
};
const rect = (x0, y0, x1, y1, m, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, m, typeof v === "function" ? v(x, y) : v); };
const glow = (x, y, rgb) => emit.push([x, y, rgb, cur]);
const FIRE = [[255, 246, 214], [255, 196, 100], [222, 110, 40]];

/* Outside the tower is left empty: backdrop.js draws the land and sky behind it. */
const GROUND = 221;                                 // ground level: the sanctum stands on it

/* ---------- the tower body ---------- */
const TX0 = 18, TX1 = 77;                           // outer edge of the cut walls
const IX0 = TX0 + 3, IX1 = TX1 - 3;                 // the rooms inside
// floors, bottom up: [top y of the room, bottom y of the room]
const F = [
  [226, 255],   // 0 bath cellar
  [191, 218],   // 1 portal sanctum
  [158, 187],   // 2 sleeping quarters
  [125, 154],   // 3 library
  [92, 121],    // 4 laboratory
  [59, 88],     // 5 kitchen
  [30, 55],     // 6 observatory (open to the sky)
];
const NAMES = ["bath", "sanctum", "quarters", "library", "lab", "kitchen", "observatory"];

/* A small box in perspective: back wall, side walls, floor and ceiling. */
function box(y0, y1, o) {
  const VX = (IX0 + IX1) / 2, VY = y0 + (y1 - y0) * 0.42, K = 0.78;
  for (let y = y0; y <= y1; y++) for (let x = IX0; x <= IX1; x++) {
    const sF = (y - VY) / (y1 - VY), sC = (y - VY) / (y0 - VY);
    const sL = (x - VX) / (IX0 - VX), sR = (x - VX) / (IX1 - VX);
    const ok = (s) => s >= K && s <= 1.0001;
    let kind = "back", s = 0, X = 0;
    for (const [k, sv] of [["floor", sF], ["ceil", sC], ["side", sL], ["side", sR]]) {
      if (!ok(sv) || sv <= s) continue;
      if (k === "floor" || k === "ceil") { const XX = VX + (x - VX) / sv; if (XX < IX0 || XX > IX1) continue; X = XX; }
      else { const YY = VY + (y - VY) / sv; if (YY < y0 || YY > y1) continue; }
      kind = k; s = sv;
    }
    const d = (1 - s) / (1 - K);
    if (kind === "floor") {
      const seam = Math.floor((VX + (x - 1 - VX) / s - IX0) / 7) !== Math.floor((X - IX0) / 7);
      set(x, y, o.floor, seam ? 0.3 : 0.6 - d * 0.15);
    } else if (kind === "ceil") set(x, y, o.ceil || o.wall, 0.22);
    else if (kind === "side") set(x, y, o.wall, (o.wallV || 0.45) * 0.75 - d * 0.1);
    else set(x, y, o.wall, o.wallV || 0.45);
  }
  return { VX, VY, K, bx0: Math.round(VX + (IX0 - VX) * K), bx1: Math.round(VX + (IX1 - VX) * K),
    by0: Math.round(VY + (y0 - VY) * K), by1: Math.round(VY + (y1 - VY) * K) };
}
function roundWindow(cx, cy, r) {
  for (let y = cy - r - 1; y <= cy + r + 1; y++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r - 0.5) set(x, y, "sky", 0.7 + (y - cy) / (3 * r));
    else if (d <= r + 0.8) set(x, y, "stone", 0.75);
  }
  set(cx, cy, "wood", 0.3);
}
function candle(x, y) { set(x, y, "paper", 0.95); set(x, y + 1, "paper", 0.8); glow(x, y - 1, FIRE[1]); }

/* ---------- 0: the bath cellar: tiles, three glowing windows, the tub ---------- */
cur = 0; {
  const [y0, y1] = F[0], b = box(y0, y1, { wall: "tile", floor: "tile", wallV: 0.5 });
  for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) if (x % 3 === 0 || y % 3 === 0) set(x, y, "tile", 0.36);
  for (const [x0, x1] of [[31, 39], [43, 53], [57, 65]]) {                 // the frosted panes
    rect(x0 - 1, b.by0, x1 + 1, b.by0 + 12, "wood", 0.5);
    for (let y = b.by0 + 1; y <= b.by0 + 11; y++) for (let x = x0; x <= x1; x++)
      if ((x - x0) % 4 !== 3 && (y - b.by0) % 5 !== 0) glow(x, y, y < b.by0 + 6 ? [226, 222, 178] : [196, 206, 160]);
  }
  for (let y = y1 - 4; y <= y1; y++) for (let x = IX0; x <= IX1; x++) if (((x >> 2) + (y >> 1)) % 2) set(x, y, "linen", 0.62);   // checker floor
  rect(32, y1 - 7, 64, y1 - 3, "wood", (x, y) => (y === y1 - 7 ? 0.95 : 0.55));                                                  // the tub
  for (let x = 34; x <= 62; x++) set(x, y1 - 8, "water", 0.75 + ((x % 7) === 0 ? 0.2 : 0));
  set(60, y1 - 8, "brass", 0.95);                                                                                                // the plug
  for (const px of [25, 71]) {
    rect(px - 1, y1 - 5, px + 1, y1 - 2, "clay", 0.7);
    for (const [dx, dy] of [[-2, -7], [0, -9], [2, -7], [-1, -8], [1, -8], [-3, -6], [3, -6]]) set(px + dx, y1 + dy, "leaf", 0.6);
  }
  candle(30, y1 - 6); candle(66, y1 - 6);
}

/* ---------- 1: the portal sanctum: the gate onto the sea floor ---------- */
cur = 1; {
  const [y0, y1] = F[1];
  box(y0, y1, { wall: "stone", floor: "stone", wallV: 0.46 });
  const cx = 48, cy = y0 + 12;
  const SEA = [[14, 52, 84], [20, 74, 108], [32, 98, 130], [52, 128, 150]];
  for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > 6.4 && d <= 7.8) glow(x, y, d > 7.1 ? [120, 220, 235] : [210, 250, 255]);
    else if (d <= 6.4) glow(x, y, y > cy + 3 ? [70, 96, 84] : SEA[Math.max(0, Math.min(3, 3 - ((y - cy + 6) >> 2)))]);
    else if (d <= 9) set(x, y, "stone", 0.7);
  }
  glow(cx - 2, cy - 1, [214, 236, 240]); glow(cx - 1, cy - 1, [214, 236, 240]);                            // a fish
  for (let x = 30; x <= 66; x++) if (Math.abs(x - 48) > 3) glow(x, y1 - 2, (x & 1) ? [110, 210, 228] : [80, 170, 196]);   // the floor circle
  for (const sx of [29, 67]) { rect(sx, y1 - 9, sx, y1 - 1, "ebony", 0.8); candle(sx, y1 - 11); }
}

/* ---------- 2: the sleeping quarters: plank walls, the painting, the patchwork bed ---------- */
cur = 2; {
  const [y0, y1] = F[2], b = box(y0, y1, { wall: "wood", floor: "floor", wallV: 0.36 });
  for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) if (x % 4 === 0) set(x, y, "wood", 0.2);
  roundWindow(40, y0 + 8, 3);
  rect(54, y0 + 4, 62, y0 + 11, "brass", 0.75); rect(55, y0 + 5, 61, y0 + 10, "blood", 0.6);                // the painting of the tower
  rect(58, y0 + 6, 58, y0 + 9, "wood", 0.1); rect(55, y0 + 10, 61, y0 + 10, "green", 0.6);
  const Q = ["blood", "slate", "ochre", "linen"];                                                         // the bed and its patchwork
  rect(24, y1 - 7, 46, y1 - 6, "wood", 0.6);
  for (let y = y1 - 11; y <= y1 - 8; y++) for (let x = 28; x <= 46; x++) set(x, y, (x - 28) % 4 === 0 ? "linen" : Q[((x - 28) >> 2) % 4 ^ ((y - y1) & 2 ? 1 : 0)], 0.62);
  rect(24, y1 - 12, 27, y1 - 9, "linen", (x, y) => (y === y1 - 12 ? 0.95 : 0.75));
  rect(23, y1 - 15, 23, y1 - 3, "wood", 0.8); set(23, y1 - 16, "brass", 0.95); rect(46, y1 - 13, 46, y1 - 3, "wood", 0.8); set(46, y1 - 14, "brass", 0.95);
  for (let x = 44; x <= 66; x++) set(x, y1 - 1, "blood", x % 5 ? 0.55 : 0.75);                                 // the rug
  rect(56, y1 - 9, 64, y1 - 3, "wood", (x, y) => (y === y1 - 9 ? 0.85 : 0.5));                                // the dresser
  rect(59, y1 - 6, 61, y1 - 6, "brass", 0.8);
  rect(69, y1 - 7, 72, y1 - 6, "wood", 0.8); rect(70, y1 - 5, 70, y1 - 1, "wood", 0.5); candle(70, y1 - 10);   // the nightstand and its candle
  rect(48, y1 - 2, 51, y1 - 2, "ebony", 0.5); glow(48, y1 - 3, [150, 235, 120]);                               // the cat
}

/* ---------- 3: the library ---------- */
cur = 3; {
  const [y0, y1] = F[3], b = box(y0, y1, { wall: "wood", floor: "floor", wallV: 0.3 });
  const shelf = (x0, x1, seed) => {
    const r = P.rng(seed);
    rect(x0, b.by0, x1, b.by1 - 3, "wood", 0.14);
    for (const sy of [b.by0 + 5, b.by0 + 10, b.by0 + 15]) {
      for (let x = x0 + 1; x <= x1 - 1; x++) {
        const q = r(), h = 3 + (r() * 2 | 0);
        const m = q < 0.55 ? "paper" : q < 0.78 ? "blood" : q < 0.9 ? "green" : "blue";
        for (let j = 1; j <= h; j++) set(x, sy - j, m, m === "paper" ? 0.62 : 0.7);
      }
      rect(x0, sy, x1, sy, "wood", 0.85);
    }
    rect(x0, b.by0, x0, b.by1, "wood", 0.8); rect(x1, b.by0, x1, b.by1, "wood", 0.5);
  };
  shelf(b.bx0, 41, 11); shelf(55, b.bx1, 12);
  roundWindow(48, y0 + 8, 3);
  rect(44, y1 - 9, 53, y1 - 8, "wood", 0.9); rect(45, y1 - 7, 52, y1 - 4, "wood", 0.45);
  candle(45, y1 - 11);
  for (let x = 34; x <= 62; x++) set(x, y1 - 1, x === 34 || x === 62 ? "blood" : (x % 6 === 0 ? "brass" : "blood"), 0.6);
  for (let y = y1 - 16; y <= y1 - 3; y++) set(Math.round(40 - (y - y1 + 16) * 0.2), y, "wood", 0.85);   // the ladder rail
  // the beam from the window down to the floor
  for (let y = y0 + 12; y <= y1 - 1; y++) { const c = 49 + (y - y0 - 12) * 0.5; for (let x = Math.round(c - 2); x <= c + 2; x++) emit.push([x, y, null, 3]); }
}

/* ---------- 4: the laboratory ---------- */
cur = 4; {
  const [y0, y1] = F[4], b = box(y0, y1, { wall: "stone", floor: "floor", wallV: 0.42 });
  roundWindow(48, y0 + 8, 3);
  // shelves of jars: some of them glow
  for (const sy of [y0 + 9, y0 + 14]) for (const [x0, x1] of [[b.bx0 + 1, 40], [56, b.bx1 - 1]]) {
    rect(x0, sy, x1, sy, "wood", 0.8);
    for (let x = x0; x <= x1; x += 3) {
      const g = P.hash(x, sy, 2), col = g < 0.3 ? [120, 230, 140] : g < 0.5 ? [240, 120, 200] : g < 0.65 ? [140, 200, 255] : null;
      if (col) { glow(x, sy - 1, col); glow(x, sy - 2, col.map((c) => Math.round(c * 0.75))); }
      else { set(x, sy - 1, "paper", 0.55); set(x, sy - 2, "paper", 0.7); }
    }
  }
  // the cauldron, green and bubbling, with its fire under it
  for (let y = y1 - 8; y <= y1 - 3; y++) for (let x = 42; x <= 54; x++) {
    const d = Math.hypot((x - 48) / 6.5, (y - (y1 - 8)) / 5);
    if (d <= 1) set(x, y, "stone", 0.25 + 0.2 * (x < 48 ? 1 : 0));
  }
  for (let x = 43; x <= 53; x++) glow(x, y1 - 8, [130, 235, 120]);
  glow(46, y1 - 10, [170, 250, 150]); glow(50, y1 - 11, [170, 250, 150]);
  for (const x of [45, 48, 51]) glow(x, y1 - 2, FIRE[1]);
  rect(26, y1 - 8, 34, y1 - 7, "wood", 0.85); rect(27, y1 - 6, 28, y1 - 2, "wood", 0.5); rect(32, y1 - 6, 33, y1 - 2, "wood", 0.5);
  set(29, y1 - 9, "brass", 0.8); set(31, y1 - 10, "brass", 0.9);
}

/* ---------- 5: the kitchen ---------- */
cur = 5; {
  const [y0, y1] = F[5], b = box(y0, y1, { wall: "stone", floor: "floor", wallV: 0.45 });
  for (let y = b.by0; y <= b.by1; y++) for (let x = b.bx0; x <= b.bx1; x++) if (y % 3 === 0 && (x + y) % 5 === 0) set(x, y, "stone", 0.3);
  roundWindow(36, y0 + 8, 3);
  // the hearth with its fire
  rect(54, y0 + 6, 68, y1 - 3, "stone", (x, y) => (x === 54 || y === y0 + 6 ? 0.75 : 0.5));
  for (let y = y0 + 12; y <= y1 - 3; y++) for (let x = 57; x <= 65; x++) {                                   // the open hearth, glowing up from the fire
    const t = (y1 - 3 - y) / (y1 - 15 - y0);
    glow(x, y, t < 0.3 ? [204, 100, 46] : t < 0.6 ? [124, 56, 38] : [60, 32, 30]);
  }
  rect(36, y0 + 13, 44, y0 + 18, "wood", 0.7); rect(37, y0 + 14, 43, y0 + 17, "wood", 0.08);                  // the chalkboard
  for (const yy of [y0 + 15, y0 + 16]) for (let x = 38; x <= 42; x += 2) set(x, yy, "paper", 0.7);
  for (const [x, y, k] of [[60, y1 - 4, 0], [61, y1 - 5, 0], [59, y1 - 4, 1], [62, y1 - 4, 1], [61, y1 - 6, 1], [58, y1 - 3, 2], [63, y1 - 3, 2], [60, y1 - 6, 2]]) glow(x, y, FIRE[k]);
  // the table, laden
  rect(26, y1 - 9, 48, y1 - 8, "wood", 0.9); rect(27, y1 - 7, 28, y1 - 2, "wood", 0.5); rect(46, y1 - 7, 47, y1 - 2, "wood", 0.5);
  for (const [x, m] of [[29, "paper"], [30, "paper"], [33, "blood"], [34, "leaf"], [35, "blood"], [38, "clay"], [39, "clay"], [42, "paper"], [43, "brass"]]) set(x, y1 - 10, m, 0.75);
  set(38, y1 - 11, "clay", 0.85); candle(44, y1 - 12);
}

/* ---------- 6: the observatory, open to the sky ---------- */
cur = 6; {
  const [y0, y1] = F[6];
  // the platform floor and a low parapet at the back and sides
  for (let y = y1 - 4; y <= y1; y++) for (let x = IX0; x <= IX1; x++) set(x, y, "floor", y === y1 - 4 ? 0.75 : 0.5 + ((x - IX0) % 7 === 0 ? -0.2 : 0));
  rect(IX0, y1 - 9, IX1, y1 - 5, "stone", (x, y) => (y === y1 - 9 ? 0.85 : (x % 6 === 0 ? 0.3 : 0.5)));
  for (let x = IX0; x <= IX1; x += 6) rect(x, y1 - 11, x + 2, y1 - 10, "stone", 0.75);     // crenellations
  // the telescope on its tripod, pointing up and left
  for (let i = 0; i < 12; i++) { set(56 - i, y1 - 12 - i * 0.8, "brass", 0.75); set(57 - i, y1 - 12 - i * 0.8, "brass", 0.45); }
  rect(56, y1 - 12, 58, y1 - 11, "brass", 0.85);
  for (const dx of [-3, 0, 3]) for (let j = 0; j < 6; j++) set(57 + Math.round(dx * j / 6), y1 - 10 + j, "wood", 0.6);
  // the armillary sphere
  for (let a = 0; a < 6.28; a += 0.25) { set(32 + Math.round(Math.cos(a) * 4), y1 - 16 + Math.round(Math.sin(a) * 4), "brass", 0.8); set(32 + Math.round(Math.cos(a) * 4), y1 - 16 + Math.round(Math.sin(a) * 1.5), "brass", 0.6); }
  rect(32, y1 - 12, 32, y1 - 5, "brass", 0.6);
  // the brazier
  rect(68, y1 - 9, 72, y1 - 8, "brass", 0.7); rect(70, y1 - 7, 70, y1 - 5, "brass", 0.5);
  for (const [x, y, k] of [[70, y1 - 10, 0], [69, y1 - 10, 1], [71, y1 - 10, 1], [70, y1 - 11, 1], [70, y1 - 12, 2]]) glow(x, y, FIRE[k]);
}
cur = -1;

/* ---------- the section cut: walls and slabs between the floors ---------- */
function cut(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    set(x, y, "cut", 0.55 + 0.2 * P.fbm(x * 0.08, y * 0.08, 2, 3)); fixedL[y * W + x] = 1;
  }
}
const TOP = F[6][1] - 11;                                    // the parapet top: above this, open sky
cut(TX0, F[5][0] - 3, IX0 - 1, F[0][1] + 3); cut(IX1 + 1, F[5][0] - 3, TX1, F[0][1] + 3);
cut(TX0, F[6][1] - 9, IX0 - 1, F[5][0] - 4); cut(IX1 + 1, F[6][1] - 9, TX1, F[5][0] - 4);
for (let k = 0; k < 6; k++) {
  const yb = F[k][0] - 1, yt = F[k + 1][1] + 1;              // the slab between floor k+1 and floor k
  cut(TX0, Math.min(yt, yb), TX1, Math.max(yt, yb));
  rect(IX0, yt, IX1, yt, "floor", 0.62); fixedL.fill(0.8, yt * W + IX0, yt * W + IX1 + 1);
}
cut(TX0, F[0][1] + 1, TX1, F[0][1] + 3);                     // the cellar's floor
// a lit lip down the inside of the walls
for (let y = TOP; y <= F[0][1]; y++) { if (mat[y * W + IX0 - 1] === M.cut) { val[y * W + IX0 - 1] = 1; } }

/* ---------- light ---------- */
const SOURCES = {
  0: [[40, F[0][1] - 13, 0.3, 8], [56, F[0][1] - 13, 0.3, 8], [48, F[0][1] - 5, 0.3, 14]],
  1: [[48, F[1][0] + 11, 0.6, 14], [31, F[1][1] - 10, 0.35, 8]],
  2: [[70, F[2][1] - 9, 0.45, 10], [48, F[2][0] + 9, 0.12, 8]],
  3: [[50, F[3][1] - 6, 0.3, 12], [45, F[3][1] - 12, 0.35, 8]],
  4: [[48, F[4][1] - 8, 0.45, 9], [48, F[4][0] + 8, 0.12, 8]],
  5: [[61, F[5][1] - 5, 0.6, 12], [36, F[5][0] + 8, 0.12, 8]],
  6: [[70, F[6][1] - 11, 0.5, 12], [48, F[6][0], 0.35, 40]],
};
function render(focus = -1) {
  const out = new P.Buf(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (mat[i] < 0) continue;
    const f = owner[i];
    let L, strip = 0.08;
    if (fixedL[i]) { L = fixedL[i] * (focus >= 0 ? 0.8 : 1); strip = 0.001; }
    else {
      L = 0.4;
      for (const [cx, cy, s, r] of SOURCES[f] || []) L += s * Math.exp(-Math.hypot(x - cx, y - cy) / r);
      if (focus >= 0 && f !== focus) { L = 0.42; strip = 0.001; }      // lights out: flat, no flicker of detail
    }
    const ramp = R[MATS[mat[i]]];
    out.put(i, ramp[P.band(val[i] * L, ramp.length, x, y, strip)]);
  }
  for (const [x, y, rgb, f] of emit) {
    const on = focus < 0 || f === focus || f === -1;
    if (!rgb) { if (on) P.blend(out, x, y, [255, 224, 160], 0.22); continue; }   // the library's beam
    if (on) out.pset(x, y, rgb);
    else if (f === 1) P.blend(out, x, y, rgb, 0.35);                // the gate never quite goes out
  }
  return out;
}

module.exports = { render, W, H, F, NAMES, GROUND };

