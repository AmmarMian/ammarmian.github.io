/* The kitchen (Now): 192×160 native, on room-kit.js.
 *
 * Stone walls, the hearth with its fire on the right and the hearth spirit
 * bobbing over it, the round window and its beam on the left, a chalkboard
 * with this month's chores, a shelf of plates, copper pans on hooks, and the
 * laden table in front: bread, a cheese wheel, a bowl of fruit, a steaming
 * pot and a candle.
 *
 *   node kitchen.js   → preview/kitchen.png, .gif, -1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { set, rect, glow, CANDLES, FY1, VX, BX0, BY0, BX1, BY1, proj } = r;

const stoneV = (x, y) => 0.44 + 0.05 * P.fbm(x * 0.05, y * 0.05, 2, 12) + (((y >> 3) + (x >> 4)) % 5 === 0 && (y & 7) === 0 ? -0.08 : 0);
r.shell({
  floor: (x, y, h) => r.planks(x, y, h, { width: 14, seed: 12 }),
  ceil: (x, y, h) => r.beams(x, y, h, { at: [34, 96, 158] }),
  side: (x, y, h) => set(x, y, "stone", h.d > 0.965 ? 0.22 : stoneV(x, y) - h.d * 0.08, 0.8),
});
rect(BX0, BY0, BX1, BY1, "stone", stoneV);

/* ---------- the window and its beam, left ---------- */
const WX = 62, WY = 42;
r.roundWindow(WX, WY);

/* ---------- the chalkboard: what's on this month ---------- */
{
  const x0 = 80, x1 = 104, y0 = 34, y1 = 54;
  rect(x0, y0, x1, y1, "wood", (x, y) => (x === x0 || y === y0 ? 0.9 : x === x1 || y === y1 ? 0.35 : 0.65));
  rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, "slateBoard", 0.7);
  const chalk = [[3, 4, 12], [3, 7, 16], [3, 10, 9], [3, 13, 14], [3, 16, 7]];
  for (const [cx, cy, len] of chalk) {
    set(x0 + cx, y0 + cy, "linen", 0.85);                             // a tick box
    for (let i = 0; i < len; i++) if (P.hash(i, cy, 3) < 0.8) set(x0 + cx + 3 + i, y0 + cy, "linen", 0.55 + ((i & 3) === 0 ? 0.2 : 0));
  }
  set(x0 + 3, y0 + 7, "ochre", 1); set(x0 + 3, y0 + 13, "ochre", 1);    // two already done
}

/* ---------- a shelf of plates and the copper pans ---------- */
rect(BX0 + 4, 62, 76, 63, "wood", (x, y) => (y === 62 ? 0.92 : 0.5));
for (let x = BX0 + 6; x <= 72; x += 6) for (let j = 0; j < 6; j++) for (let i = 0; i < 5; i++)
  if (Math.hypot(i - 2, j - 2.5) <= 2.6) set(x + i, 61 - j, "linen", Math.hypot(i - 2, j - 2.5) < 1.2 ? 0.7 : i < 2 ? 0.95 : 0.8);
rect(84, 60, 104, 60, "ebony", 0.6);                                   // the hook rail
for (const [px, rr] of [[88, 3], [96, 4], [103, 2.6]]) {
  rect(px, 61, px, 63, "ebony", 0.8);
  for (let y = 64; y <= 64 + rr * 2; y++) for (let x = px - rr; x <= px + rr; x++) {
    const e = Math.hypot((x - px) / rr, (y - 64 - rr) / rr);
    if (e <= 1) set(x, y, "copper", 0.5 + 0.4 * (1 - e) + (x < px ? 0.15 : 0));
  }
}

/* ---------- the hearth, right, with its fire ---------- */
const HX0 = 116, HX1 = 150, HY0 = 46;
rect(HX0, HY0, HX1, BY1, "stone", (x, y) => (x === HX0 || y === HY0 ? 0.85 : 0.6 + (((x - HX0) >> 3) + ((y - HY0) >> 2)) % 2 * 0.06));
rect(HX0 - 3, HY0 - 3, HX1 + 3, HY0 - 1, "stone", (x, y) => (y === HY0 - 3 ? 0.95 : 0.55));   // the mantel
for (const [x, m] of [[HX0, "copper"], [HX0 + 6, "clay"], [HX0 + 11, "clay"], [HX1 - 4, "linen"]]) rect(x, HY0 - 8, x + 2, HY0 - 4, m, 0.8);
const FX = (HX0 + HX1) >> 1, FYb = BY1 - 1;
for (let y = HY0 + 10; y <= BY1; y++) for (let x = HX0 + 6; x <= HX1 - 6; x++) {
  const arch = Math.hypot((x - FX) / 11, (y - (HY0 + 18)) / 8);
  if (y > HY0 + 18 || arch <= 1) {
    const t = (FYb - y) / (FYb - HY0 - 10);                            // 0 at the fire, 1 at the top of the arch
    const EMBER = [[42, 24, 28], [70, 36, 32], [124, 56, 38], [204, 100, 46]];
    glow(x, y, EMBER[P.band(Math.pow(1 - t, 2.2), 4, x, y, 0.35)]);     // dark above, warm only near the fire
  }
}
for (let x = FX - 8; x <= FX + 8; x++) { glow(x, FYb, (x & 1) ? [120, 50, 30] : [240, 120, 50]); glow(x, FYb - 1, [180, 80, 40]); }
for (const dx of [-6, -4, -2, 0, 2, 4, 6]) CANDLES.push([FX + dx, FYb - 2 - (Math.abs(dx) < 3 ? 2 : 0)]);
for (const dx of [-5, -1, 3]) CANDLES.push([FX + dx, FYb - 5]);
rect(FX + 4, HY0 + 14, FX + 4, HY0 + 18, "ebony", 0.7);                // the pot hook and a kettle
for (let y = HY0 + 19; y <= HY0 + 25; y++) for (let x = FX; x <= FX + 8; x++) if (Math.hypot(x - FX - 4, (y - HY0 - 22) * 1.2) <= 4) set(x, y, "ebony", x < FX + 3 ? 0.9 : 0.55);

/* ---------- the table, laden ---------- */
const TB = { X0: 24, X1: 106, d0: 0.16, d1: 0.44, Ytop: 116 };
r.solidBox({ ...TB, Ybot: 121 }, {
  front: (x, y, X, Y) => set(x, y, "wood", Y < 117 ? 0.98 : 0.55),
  top: (x, y, X) => set(x, y, "wood", 0.6 + (Math.floor(X / 14) % 2 ? 0.05 : 0)),
  side: (x, y) => set(x, y, "wood", 0.4),
});
for (const X of [27, 101]) r.solidBox({ X0: X, X1: X + 3, Ytop: 121, Ybot: FY1, d0: 0.19, d1: 0.21 }, { front: (x, y) => set(x, y, "wood", 0.45), side: (x, y) => set(x, y, "wood", 0.3) });
const TC = [];
const on = (X, d) => proj(X, TB.Ytop, d).map(Math.round);
const dome = (cx, cy, rx, ry, m, hi = 0.9) => {
  for (let y = cy - ry; y <= cy; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const e = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (e <= 1) set(x, y, m, 0.45 + (hi - 0.45) * (1 - e) + (x < cx ? 0.12 : -0.05));
  }
};
{ const [x, y] = on(36, 0.3); dome(x, y, 7, 5, "ochre"); dome(x + 11, y + 1, 5, 4, "ochre"); for (const i of [-3, 0, 3]) set(x + i, y - 3, "clay", 0.5); }   // bread
{ const [x, y] = on(60, 0.33);                                                       // cheese wheel with a wedge cut
  for (let yy = y - 4; yy <= y; yy++) for (let xx = x - 7; xx <= x + 7; xx++) {
    if (yy - (y - 4) > 0 && xx > x + 2 && yy < y - 1) continue;
    set(xx, yy, "ochre", yy === y - 4 ? 0.98 : xx > x + 2 ? 0.95 : 0.7);
  }
}
{ const [x, y] = on(80, 0.37);                                                      // the fruit bowl
  for (let yy = y - 3; yy <= y; yy++) for (let xx = x - 8; xx <= x + 8; xx++) if (Math.hypot((xx - x) / 8, (yy - y + 3) / 3.5) <= 1) set(xx, yy, "wood", 0.6 + (yy === y - 3 ? 0.3 : 0));
  for (const [dx, dy, m] of [[-5, -5, "blood"], [-1, -6, "leaf"], [3, -5, "blood"], [6, -4, "ochre"], [1, -8, "blood"], [-3, -8, "leaf"]])
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!(i !== 1 && j !== 1) || (i === 1 || j === 1)) set(x + dx + i - 1, y + dy + j - 1, m, i === 0 && j === 0 ? 0.95 : j === 2 ? 0.45 : 0.68);
}
const [SX, SY] = on(96, 0.26);                                                       // the pot of soup, steaming
for (let yy = SY - 8; yy <= SY; yy++) for (let xx = SX - 7; xx <= SX + 7; xx++) set(xx, yy, "copper", yy === SY - 8 ? 0.95 : xx < SX - 3 ? 0.8 : xx > SX + 4 ? 0.4 : 0.6);
for (let xx = SX - 6; xx <= SX + 6; xx++) set(xx, SY - 9, "ochre", 0.75);
for (const dx of [-9, 8]) rect(SX + dx, SY - 6, SX + dx + 1, SY - 6, "copper", 0.6);
{ const [x, y] = on(50, 0.22); rect(x - 2, y - 1, x + 2, y, "brass", (xx, yy) => (yy === y - 1 ? 0.95 : 0.6)); rect(x, y - 8, x, y - 2, "linen", 0.98); rect(x + 1, y - 8, x + 1, y - 2, "linen", 0.75); CANDLES.push([x, y - 9]); TC.push(x, y - 9); }
for (let x = 28; x <= 104; x++) for (let y = 122; y <= 124; y++) r.shade(x, y, 0.65);   // the table's shadow

/* ---------- a stool and a basket of apples ---------- */
r.solidBox({ X0: 150, X1: 166, Ytop: 130, Ybot: 134, d0: 0.2, d1: 0.34 }, { front: (x, y) => set(x, y, "wood", 0.6), top: (x, y) => set(x, y, "wood", 0.85), side: (x, y) => set(x, y, "wood", 0.4) });
for (const X of [151, 163]) r.solidBox({ X0: X, X1: X + 2, Ytop: 134, Ybot: FY1, d0: 0.21, d1: 0.23 }, { front: (x, y) => set(x, y, "wood", 0.4) });
{ const [x, y] = proj(26, FY1, 0.12).map(Math.round);
  for (let yy = y - 7; yy <= y; yy++) for (let xx = x - 7; xx <= x + 7; xx++) set(xx, yy, "ochre", ((xx + yy) & 1) ? 0.55 : 0.4);
  for (const dx of [-4, 0, 4]) dome(x + dx, y - 7, 2, 2, "blood", 0.95);
}

r.cutEdges();

/* ---------- light: the hearth is the heart of it ---------- */
const BEAM = { x0: WX + 1, y0: WY + 6, x1: 74, y1: 112, h0: 4, h1: 13 };
const shaft = r.makeShaft(BEAM.x0, BEAM.y0, BEAM.x1, BEAM.y1, BEAM.h0, BEAM.h1);
const light = (x, y) => {
  let L = 0.42;
  L += 0.24 * Math.exp(-Math.hypot(x - WX, y - WY) / 46);
  L += 0.26 * shaft(x, y);
  L += 0.62 * Math.exp(-Math.hypot(x - FX, y - FYb + 4) / 34);                  // the fire
  L += 0.18 * Math.exp(-Math.hypot(x - TC[0], y - TC[1]) / 14);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;
  return L * (1 - 0.35 * (vx * vx + vy * vy));
};

/* ---------- render; steam off the soup, and the hearth spirit bobbing ---------- */
const room = r.finish({ light, shaft, beam: BEAM });
const SPIRIT = [[255, 236, 170], [255, 186, 90], [230, 120, 50]];
room.animate((b, t) => {
  const a = (2 * Math.PI * t) / 48;
  for (let k = 0; k < 4; k++) {                                       // steam: thin wisps rising and fading
    const ph = ((t + k * 12) % 48) / 48, y = Math.round(SY - 11 - ph * 16), x = Math.round(SX - 2 + k + 2 * Math.sin(a * 2 + k + ph * 5));
    P.blend(b, x, y, [240, 232, 220], 0.45 * (1 - ph));
    if (ph < 0.6) P.blend(b, x + 1, y - 1, [240, 232, 220], 0.3 * (1 - ph));
  }
  const sx = FX, sy = HY0 + 6 + Math.round(2 * Math.sin(a * 2));      // the hearth spirit: a small flame with two dark eyes
  const body = [[0, -3, 0], [-1, -2, 1], [0, -2, 0], [1, -2, 1], [-2, -1, 2], [-1, -1, 1], [0, -1, 0], [1, -1, 1], [2, -1, 2], [-2, 0, 2], [-1, 0, 1], [0, 0, 1], [1, 0, 1], [2, 0, 2], [-1, 1, 2], [0, 1, 2], [1, 1, 2]];
  for (const [dx, dy, c] of body) b.pset(sx + dx, sy + dy, SPIRIT[c]);
  if (t % 32 < 30) { b.pset(sx - 1, sy - 1, [60, 30, 30]); b.pset(sx + 1, sy - 1, [60, 30, 30]); }
  if ((t >> 2) % 2) b.pset(sx + (t % 3) - 1, sy - 4, SPIRIT[1]);
});

module.exports = room;
if (require.main === module) kit.preview("kitchen", room, { ref: __dirname + "/../../spike/out/all_kitchen.png" });
