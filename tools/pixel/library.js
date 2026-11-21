/* The library, one room of the pixel tower: 192×160 native.
 * Built on room-kit.js (perspective box, light, section cut, animation);
 * everything here is what makes it the library.
 *
 *   node library.js   → preview/library.png, library.gif, library-1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { W, set, rect, surface, val, mat, CANDLES, FX0, FX1, FY0, FY1, VX, BX0, BY0, BX1, BY1, proj } = r;
const MATS = Object.keys(kit.RAMPS);
const R = kit.RAMPS;

/* ---------- side walls: shelves in perspective ---------- */
const SIDE_BOARDS = [30, 48, 66, 84, 102];
const sideBook = (() => {                                       // a fixed run of books along the depth, per shelf
  const runs = {};
  return (wall, shelf, d) => {
    const key = wall + shelf;
    if (!runs[key]) {
      const r = P.rng(wall === "left" ? 31 + shelf : 71 + shelf), list = [];
      let a = 0.04;
      while (a < 0.98) {
        const w = 0.045 + r() * 0.03, q = r();
        const m = q < 0.08 ? null : q < 0.6 ? "paper" : q < 0.8 ? "blood" : q < 0.9 ? "wood" : q < 0.95 ? "green" : "blue";
        list.push({ a, b: a + w, m, h: 0.55 + r() * 0.4 });
        a += w + (r() < 0.12 ? 0.02 : 0.004);
      }
      runs[key] = list;
    }
    return runs[key].find((bk) => d >= bk.a && d < bk.b);
  };
})();
function sideWall(x, y, hit) {
  const { Y, d, kind } = hit, f = 0.78;
  // uprights at the front edge, the middle and the back corner
  for (const ud of [0, 0.5]) if (Math.abs(d - ud) < 0.035) return set(x, y, "wood", 0.75, f);
  if (d > 0.965) return set(x, y, "wood", 0.18, f);              // the corner, in shadow
  if (Y < 11) return set(x, y, "wood", Y < 8 ? 0.95 : 0.7, f);    // crown
  if (Y >= 108) {                                                 // cabinets
    const door = Math.floor(d * 6), dd = d * 6 - door;
    return set(x, y, "wood", Y < 110 || dd < 0.08 ? 0.68 : dd > 0.92 ? 0.3 : Y > 144 ? 0.25 : 0.5, f);
  }
  for (const by of SIDE_BOARDS) if (Y >= by && Y < by + 2.2) return set(x, y, "wood", Y < by + 1.1 ? 0.92 : 0.5, f);
  const shelf = SIDE_BOARDS.findIndex((by) => Y < by);
  const top = shelf === 0 ? 11 : SIDE_BOARDS[shelf - 1] + 2.2, bot = SIDE_BOARDS[shelf];
  const bk = sideBook(kind, shelf, d);
  const hy = (bot - Y) / (bot - top);
  if (bk && bk.m && hy < bk.h) {
    let v = bk.m === "paper" ? 0.6 : bk.m === "wood" ? 0.85 : 0.68;
    const u = (d - bk.a) / (bk.b - bk.a);
    if (u < 0.3) v *= 1.15;
    if (Math.abs(hy - bk.h) < 0.06) v *= 1.15;
    if (bk.m === "paper" && Math.abs(hy - bk.h + 0.18) < 0.05) v = 0.32;
    return set(x, y, bk.m, v, f);
  }
  return set(x, y, "wood", 0.13, f);
}

r.shell({ floor: (x, y, h) => r.planks(x, y, h), ceil: (x, y, h) => r.beams(x, y, h), side: sideWall });

/* ---------- the back wall (drawn at its own scale) ---------- */
rect(BX0, BY0, BX1, BY1, "wood", (x) => ((x - BX0) % 8 === 0 ? 0.18 : 0.3));
/* Every spine on the back shelves, in room pixels: the page puts one
   publication on each of a spread of them, so a book is a paper. */
const BOOKS = [];
function books(x0, x1, yTop, yBot, seed) {
  const r = P.rng(seed);
  let x = x0;
  while (x <= x1 - 1) {
    if (r() < 0.07) { x += 2 + (r() * 2 | 0); continue; }
    if (r() < 0.04 && x1 - x > 5) {                                  // a vase
      const h = 5 + (r() * 2 | 0);
      for (let j = 0; j < h; j++) for (let i = -1; i <= 1; i++) if (!(j === h - 1 && i)) set(x + 1 + i, yBot - j, "paper", i < 0 ? 0.95 : i > 0 ? 0.6 : 0.8);
      x += 4; continue;
    }
    const w = r() < 0.65 ? 2 : 3;
    const h = Math.min(yBot - yTop, 6 + (r() * 4 | 0));
    const q = r();
    const m = q < 0.56 ? "paper" : q < 0.76 ? "blood" : q < 0.86 ? "wood" : q < 0.93 ? "green" : "blue";
    const base = m === "paper" ? 0.62 : m === "wood" ? 0.85 : 0.7;
    for (let j = 0; j < h; j++) for (let i = 0; i < w && x + i <= x1; i++) {
      let v = base * (i === 0 ? 1.18 : i === w - 1 ? 0.78 : 1);
      if (j === h - 1) v *= 1.12;
      if (m === "paper" && j === h - 2) v = 0.32;
      set(x + i, yBot - j, m, v);
    }
    BOOKS.push({ x, y: yBot - h + 1, w: Math.min(w, x1 - x + 1), h });
    x += w + (r() < 0.15 ? 1 : 0);
  }
}
const BACK_BOARDS = [38, 50, 62, 74];
function backUnit(x0, x1, mid, seed) {
  rect(x0, BY0, x1, BY1, "wood", 0.13);
  rect(x0, BY0, x1, BY0 + 2, "wood", (x, y) => (y === BY0 ? 0.95 : 0.7));
  const tops = [BY0 + 3, ...BACK_BOARDS.map((b) => b + 2)], bots = [...BACK_BOARDS.map((b) => b - 1), 85];
  const edges = [x0, mid, x1];
  for (let s = 0; s < tops.length; s++) for (let b = 0; b < 2; b++) books(edges[b] + 2, edges[b + 1] - 1, tops[s], bots[s], seed + s * 5 + b);
  for (const by of [...BACK_BOARDS, 86]) rect(x0, by, x1, by + 1, "wood", (x, y) => (y === by ? 0.92 : 0.5));
  for (const ex of edges) rect(ex, BY0, ex + 1, BY1, "wood", (x) => (x === ex ? 0.85 : 0.55));
  for (let b = 0; b < 2; b++) {
    const a = edges[b] + 2, z = edges[b + 1] - 1, m = (a + z) >> 1;
    for (const [d0, d1] of [[a, m - 1], [m, z]]) {
      rect(d0, 88, d1, BY1, "wood", (x, y) => (x === d0 || y === 88 ? 0.7 : x === d1 ? 0.3 : 0.5));
      rect(d0 + 2, 91, d1 - 2, BY1 - 3, "wood", (x, y) => (x === d0 + 2 || y === 91 ? 0.36 : 0.56));
    }
    set(m - 2, 101, "brass", 0.9); set(m + 1, 101, "brass", 0.9);
  }
}
backUnit(BX0, 73, 55, 200);
backUnit(119, BX1, 137, 300);

// the centre bay: round window, sconces, a little shelf with a bust
rect(74, BY0, 118, BY1, "wood", (x) => ((x - 74) % 11 === 0 ? 0.2 : 0.34));
rect(74, BY0, 118, BY0 + 2, "wood", (x, y) => (y === BY0 ? 0.95 : 0.7));
const WX = 96, WY = 43;
for (let y = WY - 11; y <= WY + 11; y++) for (let x = WX - 11; x <= WX + 11; x++) {
  const d = Math.hypot(x - WX, y - WY);
  if (d <= 10.5 && d > 7.5) {
    const nx = (x - WX) / d, ny = (y - WY) / d;
    set(x, y, "stone", 0.62 + 0.3 * (-nx * 0.6 - ny * 0.8) * (d > 9 ? 1 : -0.6));
  } else if (d <= 7.5) set(x, y, "sky", 0.55 + ((y - (WY - 7)) / 15) * 0.45);
}
rect(WX, WY - 7, WX, WY + 7, "wood", 0.3);
rect(WX - 7, WY, WX + 7, WY, "wood", 0.3);
rect(WX - 9, WY + 11, WX + 9, WY + 12, "stone", (x, y) => (y === WY + 11 ? 0.9 : 0.45));
for (const sx of [80, 112]) {
  rect(sx - 1, 62, sx + 1, 62, "brass", 0.85); set(sx, 63, "brass", 0.6);
  rect(sx, 59, sx, 61, "paper", 0.95);
  CANDLES.push([sx, 58]);
}
rect(86, 70, 106, 71, "wood", (x, y) => (y === 70 ? 0.92 : 0.5));
for (let j = 0; j < 5; j++) for (let i = -2; i <= 2; i++) {
  const hw = j < 2 ? 2 : j < 3 ? 1 : 1 + (j === 4 ? -1 : 0);
  if (Math.abs(i) <= hw) set(101 + i, 69 - j, "paper", i < 0 ? 0.95 : 0.7);
}

/* ---------- the ladder, leaning on the back-left shelves ---------- */
for (let y = BY0 + 2; y <= 121; y++) {
  const t = (y - BY0 - 2) / (121 - BY0 - 2), xa = Math.round(70 - t * 6);
  set(xa - 1, y, "wood", 1.0); set(xa, y, "wood", 0.6);
  set(xa + 5, y, "wood", 0.95); set(xa + 6, y, "wood", 0.55);
  if ((y - BY0) % 6 === 0) for (let i = 1; i < 5; i++) set(xa + i, y, "wood", 0.98);
  if ((y - BY0) % 6 === 1) for (let i = 1; i < 5; i++) set(xa + i, y, "wood", 0.1);
}

/* ---------- on the floor: the rug and the light patch (in floor coordinates) ---------- */
// the patch the beam lays on the floor, with the shadow of the window's cross in it
const PATCH = { X: 114, d: 0.3, rx: 15, rd: 0.13 };
const patchAt = (X, d) => {
  const e = Math.hypot((X - PATCH.X) / PATCH.rx, (d - PATCH.d) / PATCH.rd);
  if (e > 1) return 0;
  if (Math.abs(X - PATCH.X) < 0.9 || Math.abs(d - PATCH.d) < 0.012) return 0.15;   // the mullion's shadow
  return 1 - e * e * 0.6;
};
for (let y = FY0; y <= FY1; y++) for (let x = FX0; x <= FX1; x++) {
  const h = surface(x, y);
  if (h.kind !== "floor") continue;
  const e = Math.hypot((h.X - 98) / 50, (h.d - 0.42) / 0.3);
  if (e > 1) continue;
  let m = "blood", v = 0.62;
  if (e > 0.94) v = 0.36;
  else if (Math.abs(e - 0.8) < 0.04 || Math.abs(e - 0.52) < 0.04) { m = "brass"; v = 0.55; }
  else if (e < 0.12) { m = "brass"; v = 0.6; }
  else if (e < 0.28) v = 0.42;
  set(x, y, m, v);
}

/* ---------- the chair behind the desk ---------- */
const inChair = (x, y) => x >= 101 && x <= 109 && y <= 106 && y >= 84 + Math.abs(x - 105) * 1.4;
for (let y = 80; y <= 106; y++) for (let x = 99; x <= 111; x++) {
  if (inChair(x, y)) {
    const edge = !inChair(x - 1, y) || !inChair(x, y - 1), shade = !inChair(x + 1, y);
    set(x, y, "wood", edge ? 1.0 : shade ? 0.5 : ((x - 101) % 3 === 0 ? 0.42 : 0.72));
  } else if (inChair(x - 1, y) || inChair(x + 1, y) || inChair(x, y + 1) || inChair(x, y - 1)) set(x, y, "wood", 0.06);
}
set(105, 85, "brass", 0.9);

/* ---------- the desk: we look down on its top a little ---------- */
const DY = 105;                                                      // top surface starts here
for (let y = DY - 2; y <= DY; y++) {                                 // the top, seen from above
  const inset = DY - y;
  rect(78 + inset, y, 113 - inset, y, "wood", y === DY - 2 ? 0.9 : 0.78);
}
rect(77, DY + 1, 114, DY + 1, "wood", 0.98);                         // the front edge catches the light
rect(78, DY + 2, 113, 121, "wood", (x) => (x === 78 ? 0.7 : x === 113 ? 0.3 : 0.48));
for (const dy of [DY + 3, DY + 9]) {
  rect(80, dy, 91, dy + 4, "wood", (x, y) => (y === dy ? 0.72 : y === dy + 4 ? 0.28 : 0.55));
  set(85, dy + 2, "brass", 0.95);
}
rect(93, DY + 3, 110, 121, "wood", (x, y) => (y < DY + 5 ? 0.16 : 0.26));
rect(111, DY + 2, 113, 121, "wood", (x) => (x === 111 ? 0.62 : 0.4));
// what's on it
rect(96, DY - 3, 101, DY - 2, "paper", (x, y) => (y === DY - 3 ? 0.98 : 0.75));
rect(102, DY - 3, 107, DY - 2, "paper", (x, y) => (y === DY - 3 ? 0.9 : 0.68));
set(101, DY - 2, "paper", 0.4);
for (let i = 0; i < 5; i++) set(107 + i, DY - 4 - i, "paper", 0.95);
rect(82, DY - 3, 88, DY - 2, "brass", (x, y) => (y === DY - 3 ? 0.95 : 0.6));
rect(85, DY - 8, 85, DY - 4, "brass", 0.8);
rect(82, DY - 8, 88, DY - 8, "brass", 0.85);
for (const cx of [82, 85, 88]) { rect(cx, DY - 11, cx, DY - 9, "paper", 0.98); CANDLES.push([cx, DY - 12]); }
// the desk's shadow on the floor, away from the window light
for (let y = 122; y <= 125; y++) for (let x = 74; x <= 110; x++) {
  const i = y * W + x;
  if (MATS[mat[i]] === "floor" || MATS[mat[i]] === "blood" || MATS[mat[i]] === "brass") val[i] *= 0.62 + (y - 122) * 0.09;
}

/* ---------- a plant, a stack of books, loose pages ---------- */
rect(69, 114, 74, 121, "clay", (x) => (x === 69 ? 0.85 : x === 74 ? 0.45 : 0.65));
rect(68, 113, 75, 113, "clay", 0.9);
for (const [lx, ly, rr] of [[70, 109, 2.8], [74, 107, 3], [72, 104, 2.4], [67, 106, 2.2], [76, 111, 1.8]])
  for (let y = Math.floor(ly - rr); y <= ly + rr; y++) for (let x = Math.floor(lx - rr); x <= lx + rr; x++) {
    const d = Math.hypot(x - lx, (y - ly) * 1.3);
    if (d <= rr) set(x, y, "leaf", 0.45 + 0.45 * (1 - d / rr) - (y - ly) * 0.05 + (x < lx ? 0.1 : 0));
  }
for (const [m, a, z, y] of [["blood", 120, 129, 128], ["paper", 121, 128, 126], ["green", 119, 127, 124]])
  rect(a, y - 1, z, y, m, (x, yy) => (yy === y - 1 ? 0.9 : 0.55));
const PAGES = [[146, 136], [58, 140], [132, 143], [160, 130]];
for (const [x, y] of PAGES) { rect(x, y, x + 3, y, "paper", 0.9); rect(x + 1, y + 1, x + 4, y + 1, "paper", 0.7); }

/* ---------- the globe, in the foreground ---------- */
const GX = 24, GY = 118, GR = 11;
for (let y = GY - GR; y <= GY + GR; y++) for (let x = GX - GR; x <= GX + GR; x++) {
  const dx = (x - GX) / GR, dy = (y - GY) / GR, d = Math.hypot(dx, dy);
  if (d > 1) continue;
  const lit = 0.5 + 0.45 * (dx * 0.55 - dy * 0.6) + 0.25 * Math.sqrt(1 - d * d);
  const land = P.fbm(x * 0.2, y * 0.2, 3, 11) > 0.56;
  set(x, y, land ? "leaf" : "ocean", land ? lit * 0.75 : lit);
}
for (let a = -1.2; a <= 2.4; a += 0.03)
  set(GX + Math.round(Math.cos(a) * (GR + 2)), GY - Math.round(Math.sin(a) * (GR + 2)), "brass", 0.75 + 0.2 * Math.cos(a));
rect(GX, GY + GR + 1, GX, 141, "brass", 0.7);
rect(GX - 6, 142, GX + 6, 143, "wood", (x, y) => (y === 142 ? 0.8 : 0.4));
for (const lx of [-6, 6]) rect(GX + lx, 144, GX + lx, 146, "wood", 0.35);
for (let x = GX - 7; x <= GX + 9; x++) { const i = 146 * W + x; val[i] *= 0.6; }      // its shadow

r.cutEdges();

/* ---------- the light ---------- */
// the beam: from the window, toward us and down onto the patch on the floor
const [PX, PY] = proj(PATCH.X, FY1, PATCH.d);
const BEAM = { x0: WX + 1, y0: WY + 6, x1: PX, y1: PY, h0: 5, h1: 17 };
const shaft = r.makeShaft(BEAM.x0, BEAM.y0, BEAM.x1, BEAM.y1, BEAM.h0, BEAM.h1);
const light = (x, y) => {
  let L = 0.4;
  L += 0.3 * Math.exp(-Math.hypot(x - WX, y - WY) / 55);
  L += 0.32 * shaft(x, y);
  for (const [cx, cy, s, r] of [[85, DY - 12, 0.55, 18], [80, 58, 0.22, 10], [112, 58, 0.22, 10]])
    L += s * Math.exp(-Math.hypot(x - cx, y - cy) / r);
  const h = surface(x, y);
  if (h.kind === "floor") L += 0.55 * patchAt(h.X, h.d);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;                         // darker toward the corners
  return L * (1 - 0.35 * (vx * vx + vy * vy));
};

/* ---------- render, and what moves beyond the kit's flames and dust ---------- */
const room = r.finish({ light, shaft, beam: BEAM });
room.animate((b, t, out) => {                                      // one loose page lifts a corner once per loop
  const lift = t >= 30 && t < 38 ? (t < 34 ? t - 30 : 38 - t) : 0;
  if (!lift) return;
  const [px, py] = PAGES[0];
  for (let i = 2; i < 4; i++) { b.pset(px + i, py, out.get(px + i, py + 3)); b.pset(px + i, py - Math.min(lift, 2), R.paper[5]); }
});
const { out, frame, T, DELAY } = room;

module.exports = { out, frame, T, DELAY, BOOKS };

if (require.main === module) kit.preview("library", room, { ref: __dirname + "/../../spike/out/all_library.png" });
