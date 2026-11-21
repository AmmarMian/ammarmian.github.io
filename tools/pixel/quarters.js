/* The sleeping quarters (About): 192×160 native, on room-kit.js.
 *
 * Warm oak and textiles, from the 3D room: plank walls, the round window
 * and its beam, a painting of the tower itself, the patchwork bed with its
 * posts and brass finials, the crimson rug with a star at its heart, a
 * nightstand in the foreground with the candle, a mug and a red journal, a
 * dresser, an armchair, a plant — and the black cat, asleep by the bed.
 *
 *   node quarters.js   → preview/quarters.png, quarters.gif, quarters-1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { W, set, rect, surface, CANDLES, FX0, FX1, FY1, VX, VY, K, BX0, BY0, BX1, BY1, proj } = r;
const R = kit.RAMPS;

/* ---------- walls: vertical oak planks, a dado rail ---------- */
r.shell({
  floor: (x, y, h) => r.planks(x, y, h, { width: 13, seed: 4 }),
  ceil: (x, y, h) => r.beams(x, y, h, { at: [30, 70, 122, 162] }),
  side: (x, y, h) => {
    const { Y, d } = h, f = 0.8;
    if (d > 0.965) return set(x, y, "wood", 0.16, f);
    if (Math.abs(Y - 104) < 1.2) return set(x, y, "wood", 0.75, f);                 // dado rail
    const board = Math.floor(d * 14), seam = Math.floor(d * 14 - 0.12) !== board;
    set(x, y, "wood", seam ? 0.16 : (Y > 104 ? 0.27 : 0.33) + 0.05 * P.hash(board, 1, 3), f);
  },
});
rect(BX0, BY0, BX1, BY1, "wood", (x, y) => {
  const seam = (x - BX0) % 6 === 0;
  if (y === 92) return 0.75;
  if (y === 93) return 0.3;
  return seam ? 0.16 : (y > 93 ? 0.27 : 0.33) + 0.05 * P.hash((x - BX0) / 6 | 0, 1, 3);
});
for (const px of [BX0, BX0 + 1, BX1 - 1, BX1]) rect(px, BY0, px, BY1, "wood", px === BX0 || px === BX1 - 1 ? 0.7 : 0.4);

/* ---------- the round window, left of centre ---------- */
const WX = 72, WY = 44;
r.roundWindow(WX, WY);

/* ---------- a painting of the tower, framed ---------- */
{
  const x0 = 116, x1 = 146, y0 = 32, y1 = 60;
  rect(x0, y0, x1, y1, "wood", (x, y) => (x === x0 || y === y0 ? 0.95 : x === x1 || y === y1 ? 0.35 : 0.7));
  rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, "brass", (x, y) => (x === x0 + 1 || y === y0 + 1 ? 0.85 : 0.5));
  rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, "blood", (x, y) => (y < y0 + 12 ? 0.58 : 0.52));
  rect(x0 + 2, y1 - 6, x1 - 2, y1 - 2, "green", (x, y) => (y === y1 - 6 ? 0.75 : 0.55) + ((x >> 1) % 2 ? 0.05 : 0));
  const tx = 131;                                                     // the tower, as it is painted
  rect(tx - 3, y0 + 9, tx + 3, y1 - 6, "ebony", (x) => (x === tx - 3 ? 0.9 : 0.6));
  for (let j = 0; j < 6; j++) rect(tx - j / 2 - 0.5, y0 + 3 + j, tx + j / 2 + 0.5, y0 + 3 + j, "green", 0.6);
  for (const [wx, wy] of [[tx - 1, y0 + 12], [tx + 1, y0 + 16], [tx - 1, y0 + 20], [tx + 1, y0 + 24]]) set(wx, wy, "ochre", 1);
}
// one sconce between them
rect(101, 62, 103, 62, "brass", 0.85); set(102, 63, "brass", 0.6); rect(102, 59, 102, 61, "paper", 0.95); CANDLES.push([102, 58]);

/* ---------- the dresser under the painting, with a vase ---------- */
r.solidBox({ X0: 126, X1: 162, Ytop: 110, Ybot: 147, d0: 0.86, d1: 0.98 }, {
  front: (x, y, X, Y) => {
    const drawer = Y > 114 ? Math.floor((Y - 114) / 11) : -1, dy = (Y - 114) % 11;
    let v = Y < 113 ? 0.82 : drawer < 0 ? 0.6 : dy < 1.2 ? 0.28 : dy < 2.2 ? 0.7 : 0.52;
    if (X < 127.5 || X > 160.5) v = 0.62;
    set(x, y, "wood", v);
    if (drawer >= 0 && Math.abs(dy - 6) < 0.9 && (Math.abs(X - 137) < 1.2 || Math.abs(X - 151) < 1.2)) set(x, y, "brass", 0.95);
  },
  top: (x, y) => set(x, y, "wood", 0.95),
});
for (let j = 0; j < 7; j++) for (let i = -2; i <= 2; i++) {
  const hw = j < 4 ? 2 - (j === 0) : j < 5 ? 1 : 0 + (j === 6);
  if (Math.abs(i) <= hw) set(130 + i, 96 - j, "linen", i < 0 ? 0.95 : i > 0 ? 0.6 : 0.8);
}

/* ---------- a plant on the floor beside the dresser ---------- */
{
  const [px, py] = proj(114, FY1, 0.93).map(Math.round);
  rect(px - 3, py - 7, px + 3, py, "clay", (x) => (x === px - 3 ? 0.85 : x === px + 3 ? 0.45 : 0.65));
  for (const [lx, ly, rr] of [[0, -11, 3], [-4, -14, 3], [3, -16, 3], [-1, -20, 2.6], [4, -10, 2.2], [-5, -9, 2]])
    for (let y = Math.floor(py + ly - rr); y <= py + ly + rr; y++) for (let x = Math.floor(px + lx - rr); x <= px + lx + rr; x++) {
      const d = Math.hypot(x - px - lx, (y - py - ly) * 1.3);
      if (d <= rr) set(x, y, "leaf", 0.45 + 0.45 * (1 - d / rr) - (y - py - ly) * 0.05 + (x < px + lx ? 0.1 : 0));
    }
}

/* ---------- the rug, with an eight-pointed star at its heart ---------- */
const RUG = { X: 116, d: 0.44, rx: 46, rd: 0.33 };
r.onFloor(RUG.X, RUG.d, RUG.rx, RUG.rd, (x, y, e, h) => {
  const a = Math.atan2((h.d - RUG.d) / RUG.rd, (h.X - RUG.X) / RUG.rx);
  const star = 0.36 + 0.12 * Math.cos(8 * a);
  let m = "blood", v = 0.6;
  if (e > 0.94) v = 0.34;
  else if (Math.abs(e - 0.8) < 0.035) v = 0.3;
  else if (Math.abs(e - star) < 0.035) { m = "brass"; v = 0.6; }
  else if (e < star) v = e < 0.12 ? 0.32 : 0.48;
  set(x, y, m, v);
});

/* ---------- the bed: frame, patchwork quilt, pillows, headboard and posts ---------- */
const BED = { X0: 12, X1: 66, d0: 0.34, d1: 0.9 };
const QUILT = ["blood", "slate", "ochre", "linen", "blood", "ochre"];
const patch = (u, v) => {
  const fu = u - Math.floor(u), fv = v - Math.floor(v);
  if (fu < 0.09 || fv < 0.09) return ["linen", 0.5];                     // stitched seams between patches
  const iu = Math.floor(u), iv = Math.floor(v);
  const m = QUILT[(iu * 2 + iv * 3 + (iu * iv) % 2) % QUILT.length];   // a checker that never repeats a colour next to itself
  return [m, 0.62];
};
r.solidBox({ X0: 10, X1: 68, Ytop: 92, Ybot: 147, d0: 0.9, d1: 0.94 }, {            // headboard
  front: (x, y, X, Y) => set(x, y, "wood", Y < 94 ? 0.9 : (Math.floor((X - 10) / 7) % 2 ? 0.42 : 0.3)),
  top: (x, y) => set(x, y, "wood", 0.9), side: (x, y) => set(x, y, "wood", 0.4),
});
r.solidBox({ X0: BED.X0, X1: BED.X1, Ytop: 130, Ybot: 141, d0: BED.d0, d1: BED.d1 }, {  // frame
  front: (x, y) => set(x, y, "wood", 0.5), side: (x, y) => set(x, y, "wood", 0.36),
});
r.solidBox({ X0: BED.X0 + 1, X1: BED.X1 - 1, Ytop: 118, Ybot: 133, d0: BED.d0 - 0.01, d1: BED.d1 }, {
  top: (x, y, X, d) => { const [m, v] = patch((X - BED.X0) / 9, d * 6); set(x, y, m, v + 0.15); },
  front: (x, y, X, Y) => { const [m, v] = patch((X - BED.X0) / 9, (Y - 118) / 7.5 + 0.5); set(x, y, m, v * (Y < 119.5 ? 1.25 : 0.9)); },
  side: (x, y, Y, d) => { const [m, v] = patch(d * 6, (Y - 118) / 7.5 + 0.5); set(x, y, m, v * 0.72); },
});
for (const [a, b] of [[16, 37], [41, 62]])                                         // pillows
  r.solidBox({ X0: a, X1: b, Ytop: 111, Ybot: 119, d0: 0.78, d1: 0.88 }, {
    front: (x, y, X, Y) => set(x, y, "linen", Y < 112.5 ? 0.98 : 0.78 - (Y - 112) * 0.03),
    top: (x, y) => set(x, y, "linen", 0.95), side: (x, y) => set(x, y, "linen", 0.55),
  });
for (const X of [BED.X0 - 1, BED.X1 - 2]) {                                       // foot posts with brass finials
  r.solidBox({ X0: X, X1: X + 3, Ytop: 100, Ybot: 147, d0: 0.32, d1: 0.35 }, {
    front: (x, y, XX) => set(x, y, "wood", XX < X + 1.2 ? 0.85 : 0.45), side: (x, y) => set(x, y, "wood", 0.35),
  });
  const [fx, fy] = proj(X + 1.5, 100, 0.32).map(Math.round);
  rect(fx - 1, fy - 2, fx + 1, fy - 1, "brass", (xx) => (xx === fx - 1 ? 0.98 : 0.65)); set(fx, fy - 3, "brass", 0.9);
}

/* ---------- the cat, asleep on the floor by the foot of the bed ---------- */
const [CX, CY] = proj(70, FY1, 0.24).map(Math.round);
const catShape = [
  "  ##            ",
  " ####   ####    ",
  "###########     ",
  " #############  ",
  "  ############ #",
];
catShape.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#") set(CX + i - 4, CY - 5 + j, "ebony", j < 2 ? 0.9 : 0.6); }));
for (let i = -3; i <= 13; i++) r.shade(CX + i, CY, 0.6);

/* ---------- the nightstand, in the foreground ---------- */
const NS = { X0: 142, X1: 184, d0: 0, d1: 0.16 };
r.solidBox({ ...NS, Ytop: 112, Ybot: 117 }, {
  front: (x, y, X, Y) => set(x, y, "wood", Y < 113 ? 0.95 : 0.55),
  top: (x, y, X, d) => set(x, y, "wood", 0.72 + ((X | 0) % 9 === 0 ? -0.15 : 0)),
  side: (x, y) => set(x, y, "wood", 0.4),
});
for (const X of [144, 180]) r.solidBox({ X0: X, X1: X + 3, Ytop: 117, Ybot: FY1, d0: 0.01, d1: 0.03 }, { front: (x, y) => set(x, y, "wood", 0.42), side: (x, y) => set(x, y, "wood", 0.3) });
const atop = (X, d) => proj(X, 112, d).map(Math.round);
{
  const [cx, cy] = atop(160, 0.1);                                    // the candle in its brass holder
  rect(cx - 2, cy - 1, cx + 2, cy, "brass", (x, y) => (y === cy - 1 ? 0.95 : 0.6));
  rect(cx, cy - 9, cx, cy - 2, "linen", 0.98); rect(cx + 1, cy - 9, cx + 1, cy - 2, "linen", 0.75);
  CANDLES.push([cx, cy - 10]);
  const [mx, my] = atop(174, 0.09);                                   // the mug
  rect(mx - 2, my - 4, mx + 1, my, "clay", (x) => (x === mx - 2 ? 0.9 : x === mx + 1 ? 0.5 : 0.7));
  set(mx + 2, my - 3, "clay", 0.6); set(mx + 2, my - 2, "clay", 0.5);
  const [bx, by] = atop(158, 0.02);                                   // the red journal and its quill
  rect(bx - 6, by - 1, bx + 1, by, "blood", (x, y) => (y === by - 1 ? 0.85 : 0.5));
  for (let i = 0; i < 5; i++) set(bx - 1 + i, by - 2 - (i >> 1), "linen", 0.95);
}

r.cutEdges();

/* ---------- light ---------- */
const PATCH = { X: 96, d: 0.56, rx: 14, rd: 0.12 };
const patchAt = (X, d) => {
  const e = Math.hypot((X - PATCH.X) / PATCH.rx, (d - PATCH.d) / PATCH.rd);
  if (e > 1) return 0;
  if (Math.abs(X - PATCH.X) < 0.9 || Math.abs(d - PATCH.d) < 0.012) return 0.15;
  return 1 - e * e * 0.6;
};
const [PX, PY] = proj(PATCH.X, FY1, PATCH.d);
const BEAM = { x0: WX + 1, y0: WY + 6, x1: PX, y1: PY, h0: 4, h1: 14 };
const shaft = r.makeShaft(BEAM.x0, BEAM.y0, BEAM.x1, BEAM.y1, BEAM.h0, BEAM.h1);
const [NX, NY] = CANDLES[CANDLES.length - 1];
const light = (x, y) => {
  let L = 0.4;
  L += 0.28 * Math.exp(-Math.hypot(x - WX, y - WY) / 50);
  L += 0.3 * shaft(x, y);
  for (const [cx, cy, s, rr] of [[NX, NY, 0.7, 26], [102, 58, 0.12, 8]]) L += s * Math.exp(-Math.hypot(x - cx, y - cy) / rr);
  const h = surface(x, y);
  if (h.kind === "floor") L += 0.5 * patchAt(h.X, h.d);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;
  return L * (1 - 0.35 * (vx * vx + vy * vy));
};

/* ---------- render; the cat blinks and flicks its tail ---------- */
const room = r.finish({ light, shaft, beam: BEAM });
const EYE = [150, 235, 120];
room.animate((b, t, out) => {
  const shut = (t % 24) >= 20 && (t % 24) < 22;                     // a slow blink twice a loop
  if (!shut) { b.pset(CX - 2, CY - 3, EYE); b.pset(CX, CY - 3, EYE); }
  const tail = [[0, 0], [0, -1], [1, -1], [0, -1]][Math.floor(t / 12) % 4];  // the tip lifts and settles
  b.pset(CX + 11, CY - 1, out.get(CX + 11, CY - 1));
  b.pset(CX + 11 + tail[0], CY - 1 + tail[1], R.ebony[2]);
});

module.exports = room;
if (require.main === module) kit.preview("quarters", room, { ref: __dirname + "/../../spike/out/all_quarters.png" });
