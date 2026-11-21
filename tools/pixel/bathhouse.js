/* The bath cellar (Settings): 192×160 native, on room-kit.js.
 *
 * Tiled walls under tall frosted panes that glow green-gold, a checkered
 * floor, and the sunken wooden tub in the middle — steaming, with the brass
 * plug on its chain (the plug that empties what the tower remembers). Potted
 * palms, a bench of rolled towels, a tray with a bottle and two cups, candles.
 *
 *   node bathhouse.js   → preview/bathhouse.png, .gif, -1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { set, rect, glow, CANDLES, FY1, VX, BX0, BY0, BX1, BY1, proj } = r;
const R = kit.RAMPS;

const tileWall = (u, v) => (u % 1 < 0.08 || v % 1 < 0.1 ? 0.32 : 0.5 + 0.06 * P.hash(Math.floor(u), Math.floor(v), 5));
r.shell({
  floor: (x, y, h) => {                                               // big checker tiles, teal and cream
    const i = Math.floor((h.X - 6) / 15), j = Math.floor(h.d * 7);
    const seam = Math.floor((96 + (x - 1 - 96) / h.s - 6) / 15) !== i || (h.d * 7) % 1 < 0.05;
    const cream = (i + j) % 2 === 0;
    set(x, y, cream ? "linen" : "tile", seam ? 0.35 : cream ? 0.62 : 0.62);
  },
  ceil: (x, y, h) => r.beams(x, y, h, { at: [40, 96, 152] }),
  side: (x, y, h) => {
    if (h.d > 0.965) return set(x, y, "tile", 0.2, 0.8);
    set(x, y, "tile", tileWall(h.d * 16, h.Y / 6) - h.d * 0.08, 0.8);
  },
});
rect(BX0, BY0, BX1, BY1, "tile", (x, y) => tileWall((x - BX0) / 5, (y - BY0) / 5));

/* ---------- three tall frosted windows on the back wall ---------- */
const PANE = [[196, 206, 160], [166, 184, 140], [226, 222, 178]];
const WINS = [[44, 70], [80, 112], [122, 148]];
for (const [x0, x1] of WINS) {
  rect(x0 - 2, BY0 + 2, x1 + 2, 86, "wood", (x, y) => (x === x0 - 2 || y === BY0 + 2 ? 0.85 : 0.5));
  for (let y = BY0 + 4; y <= 84; y++) for (let x = x0; x <= x1; x++) {
    const mull = (x - x0) % 9 === 8 || (y - BY0 - 4) % 12 === 11;
    if (mull) set(x, y, "wood", 0.45);
    else glow(x, y, PANE[P.band(1 - (y - BY0) / 70, 3, x, y, 0.3) === 2 ? 2 : (y - BY0) > 40 ? 1 : 0]);
  }
  rect(x0 - 3, 86, x1 + 3, 87, "wood", (x, y) => (y === 86 ? 0.95 : 0.5));
}

/* ---------- palms in the back corners ---------- */
for (const X of [22, 170]) {
  const [px, py] = proj(X, FY1, 0.88).map(Math.round);
  rect(px - 4, py - 8, px + 4, py, "clay", (x) => (x === px - 4 ? 0.85 : x === px + 4 ? 0.45 : 0.65));
  rect(px, py - 20, px, py - 9, "wood", 0.6);
  for (const [a, len] of [[-2.6, 12], [-2.1, 10], [-1.6, 9], [-1.1, 10], [-0.5, 12], [-3.0, 9], [-0.2, 9]])
    for (let i = 0; i < len; i++) {
      const x = px + Math.cos(a) * i, y = py - 20 + Math.sin(a) * i + (i * i) / 18;
      set(x, y, "leaf", 0.75 - i * 0.03); set(x, y + 1, "leaf", 0.45);
    }
}

/* ---------- the tub: a wooden surround, water inside ---------- */
const TUB = { X0: 52, X1: 140, d0: 0.3, d1: 0.64, Ytop: 132 };
const RIM = 4;
r.solidBox({ ...TUB, Ybot: FY1 }, {
  front: (x, y, X, Y) => set(x, y, "wood", Y < TUB.Ytop + 1.5 ? 0.98 : (Math.floor((X - TUB.X0) / 6) % 2 ? 0.52 : 0.6)),
  top: (x, y, X, d) => {
    const inside = X > TUB.X0 + RIM && X < TUB.X1 - RIM && d > TUB.d0 + 0.03 && d < TUB.d1 - 0.03;
    if (inside) set(x, y, "water", 0.55 + 0.25 * Math.sin(X * 0.4 + d * 30) * 0.3 + (d > TUB.d1 - 0.07 ? -0.15 : 0));
    else set(x, y, "wood", 0.82);
  },
  side: (x, y) => set(x, y, "wood", 0.42),
});
const [PX, PY] = proj(128, TUB.Ytop, 0.36).map(Math.round);          // the plug on its chain
for (let i = 0; i < 6; i++) set(PX - i, PY - 1 + (i % 2), "brass", i % 2 ? 0.6 : 0.95);
rect(PX - 8, PY - 2, PX - 6, PY, "brass", 0.85);
{
  const [tx, ty] = proj(64, TUB.Ytop, 0.36).map(Math.round);         // a tray on the rim: bottle and two cups
  rect(tx - 6, ty - 1, tx + 6, ty, "wood", (x, y) => (y === ty - 1 ? 0.95 : 0.55));
  rect(tx - 3, ty - 8, tx - 1, ty - 2, "linen", (x) => (x === tx - 3 ? 0.95 : 0.7)); set(tx - 2, ty - 9, "linen", 0.9);
  for (const dx of [2, 5]) rect(tx + dx, ty - 3, tx + dx + 1, ty - 2, "linen", 0.85);
}

/* ---------- a bench of towels, right; candles round the tub ---------- */
r.solidBox({ X0: 150, X1: 182, Ytop: 128, Ybot: 132, d0: 0.18, d1: 0.34 }, { front: (x, y) => set(x, y, "wood", 0.6), top: (x, y) => set(x, y, "wood", 0.85), side: (x, y) => set(x, y, "wood", 0.4) });
for (const X of [151, 179]) r.solidBox({ X0: X, X1: X + 2, Ytop: 132, Ybot: FY1, d0: 0.19, d1: 0.21 }, { front: (x, y) => set(x, y, "wood", 0.42) });
{
  const [bx, by] = proj(166, 128, 0.26).map(Math.round);
  for (const [dx, dy, m] of [[-9, 0, "linen"], [-3, 0, "tile"], [3, 0, "linen"], [-6, -5, "blood"], [0, -5, "linen"]])
    for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) if (Math.hypot(i - 2.5, j - 2) <= 2.8) set(bx + dx + i, by + dy - j, m, Math.hypot(i - 2.5, j - 2) < 1 ? 0.5 : i < 3 ? 0.92 : 0.7);
}
for (const [X, d] of [[46, 0.28], [146, 0.6], [48, 0.66]]) {
  const [cx, cy] = proj(X, FY1, d).map(Math.round);
  rect(cx, cy - 5, cx, cy, "linen", 0.95); rect(cx + 1, cy - 5, cx + 1, cy, "linen", 0.7);
  CANDLES.push([cx, cy - 6]);
}

r.cutEdges();

/* ---------- light: the windows glow, the water throws it back ---------- */
const light = (x, y) => {
  let L = 0.44;
  for (const [x0, x1] of WINS) L += 0.2 * Math.exp(-Math.hypot(x - (x0 + x1) / 2, (y - 60) * 0.7) / 34);
  for (const [cx, cy] of CANDLES) L += 0.3 * Math.exp(-Math.hypot(x - cx, y - cy) / 16);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;
  return L * (1 - 0.3 * (vx * vx + vy * vy));
};

/* ---------- render; steam rises off the water, glints move on it ---------- */
const room = r.finish({ light });
const [TX0, TY] = proj(TUB.X0 + RIM, TUB.Ytop, (TUB.d0 + TUB.d1) / 2).map(Math.round);
const [TX1] = proj(TUB.X1 - RIM, TUB.Ytop, (TUB.d0 + TUB.d1) / 2).map(Math.round);
room.animate((b, t) => {
  const a = (2 * Math.PI * t) / 48;
  for (let k = 0; k < 9; k++) {                                       // steam: soft wisps, each rising once a loop
    const ph = ((t + k * 5.3) % 48) / 48;
    const x = Math.round(TX0 + 6 + ((TX1 - TX0 - 12) * k) / 8 + 3 * Math.sin(a + k + ph * 4));
    const y = Math.round(TY - 2 - ph * 30);
    P.blend(b, x, y, [236, 240, 232], 0.4 * (1 - ph));
    P.blend(b, x + 1, y, [236, 240, 232], 0.25 * (1 - ph));
    if (ph > 0.3) P.blend(b, x, y - 1, [236, 240, 232], 0.2 * (1 - ph));
  }
  for (let k = 0; k < 6; k++) {                                       // glints on the water
    const x = Math.round(TX0 + 4 + ((k * 13 + t) % (TX1 - TX0 - 8)));
    if ((t + k * 8) % 16 < 6) b.pset(x, TY - 1 + (k % 3), [220, 250, 245]);
  }
});

module.exports = room;
if (require.main === module) kit.preview("bathhouse", room, { ref: __dirname + "/../../spike/out/all_bath.png" });
