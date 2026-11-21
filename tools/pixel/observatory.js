/* The observatory (Contact): 192×160 native, on room-kit.js.
 *
 * The top of the tower, open to the night: a crenellated parapet, a deck of
 * boards, the brass telescope on its tripod, an armillary sphere, the
 * brazier, a sundial set in the floor, and the writing desk with its star
 * chart and the letter rack — four sealed letters, the four ways to write.
 *
 *   node observatory.js   → preview/observatory.png, .gif, -1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { set, setFixed, rect, glow, CANDLES, FX0, FX1, FY0, FY1, VX, VY, BX0, BY0, BX1, BY1, proj } = r;
const R = kit.RAMPS;

/* ---------- the sky: everything above the parapet ---------- */
const PARA = 104;                                                      // parapet top, in world Y
const SKY = [[18, 20, 46], [24, 27, 60], [32, 34, 74], [42, 42, 88], [56, 50, 100]];
// the sky is left empty: the page draws the real sky behind the room, the same one the whole tower stands in
const sky = (x, y) => { set(x, y, "night", 0); r.mat[Math.round(y) * 192 + Math.round(x)] = -1; };
r.shell({
  floor: (x, y, h) => r.planks(x, y, h, { width: 12, seed: 21 }),
  ceil: (x, y) => sky(x, y),
  side: (x, y, h) => {
    const { Y, d } = h;
    if (Y < PARA) return sky(x, y);                                     // the side parapets: plain, with a lit coping
    set(x, y, "stone", Y < PARA + 2 ? 0.85 : 0.5 - d * 0.1, 0.85);
  },
});
const [, BP] = proj(96, PARA, 1).map(Math.round);
for (let y = BY0; y <= BY1; y++) for (let x = BX0; x <= BX1; x++) {
  if (y < BP - 3) sky(x, y);
  else if (y < BP && Math.floor((x - BX0) / 8) % 2) sky(x, y);
  else set(x, y, "stone", y < BP - 2 || (y < BP + 1 && !(Math.floor((x - BX0) / 8) % 2)) ? 0.85 : 0.48);
}
/* ---------- the sundial, set in the floor ---------- */
r.onFloor(96, 0.36, 20, 0.12, (x, y, e, h) => {
  const a = Math.atan2((h.d - 0.36) / 0.12, (h.X - 96) / 20);
  const tick = e > 0.82 && Math.abs(((a / Math.PI) * 6 + 12) % 1 - 0.5) > 0.38;
  set(x, y, "brass", e > 0.92 ? 0.45 : tick ? 0.3 : 0.62 + (e < 0.15 ? 0.2 : 0));
});
{ const [gx, gy] = proj(96, FY1, 0.36).map(Math.round); for (let i = 0; i < 7; i++) set(gx + (i >> 1), gy - i, "brass", 0.9 - i * 0.04); }

/* ---------- the armillary sphere, left ---------- */
const [AX, AY] = proj(72, FY1, 0.84).map(Math.round);
r.solidBox({ X0: 66, X1: 78, Ytop: 124, Ybot: FY1, d0: 0.8, d1: 0.88 }, { front: (x, y) => set(x, y, "stone", 0.62), top: (x, y) => set(x, y, "stone", 0.85), side: (x, y) => set(x, y, "stone", 0.4) });
const ASY = AY - 30;
const ring = (rx, ry, m, v) => { for (let a = 0; a < 6.283; a += 0.05) set(AX + Math.round(Math.cos(a) * rx), ASY + Math.round(Math.sin(a) * ry), m, v + 0.2 * Math.cos(a + 2)); };
rect(AX, ASY + 9, AX, AY - 16, "brass", 0.7);
ring(9, 9, "brass", 0.65); ring(9, 3, "brass", 0.6);
glow(AX, ASY, [255, 222, 150]); glow(AX - 1, ASY, [230, 170, 90]); glow(AX + 1, ASY, [230, 170, 90]); glow(AX, ASY - 1, [230, 170, 90]); glow(AX, ASY + 1, [230, 170, 90]);

/* ---------- the telescope on its tripod, right of centre ---------- */
{
  const [tx, ty] = proj(128, FY1, 0.6).map(Math.round);
  for (const dx of [-9, 0, 9]) for (let j = 0; j <= 26; j++) set(tx + Math.round((dx * j) / 26), ty - 26 + j, "wood", dx < 0 ? 0.8 : 0.5);
  rect(tx - 2, ty - 29, tx + 2, ty - 26, "brass", (x, y) => (y === ty - 29 ? 0.95 : 0.6));
  for (let i = -14; i <= 22; i++) {                                     // the tube, aimed up and to the left
    const cx = tx - i * 0.9, cy = ty - 30 - i * 0.62, w = i < -8 ? 1.5 : i > 16 ? 3 : 2.3;
    for (let k = -w; k <= w; k++) set(Math.round(cx + k * 0.55), Math.round(cy - k * 0.8), "brass", k < -w / 3 ? 0.98 : k > w / 3 ? 0.45 : 0.72);
  }
  for (const i of [-6, 8, 20]) { const cx = tx - i * 0.9, cy = ty - 30 - i * 0.62; for (let k = -3; k <= 3; k++) set(Math.round(cx + k * 0.55), Math.round(cy - k * 0.8), "copper", 0.75); }
}

/* ---------- the writing desk, left front: star chart and the letter rack ---------- */
const DK = { X0: 12, X1: 62, d0: 0.08, d1: 0.3, Ytop: 112 };
r.solidBox({ ...DK, Ybot: 117 }, {
  front: (x, y, X, Y) => set(x, y, "wood", Y < 113 ? 0.95 : 0.55),
  top: (x, y, X, d) => set(x, y, "wood", 0.68), side: (x, y) => set(x, y, "wood", 0.4),
});
for (const X of [14, 58]) r.solidBox({ X0: X, X1: X + 3, Ytop: 117, Ybot: FY1, d0: 0.09, d1: 0.11 }, { front: (x, y) => set(x, y, "wood", 0.45), side: (x, y) => set(x, y, "wood", 0.3) });
const onDesk = (X, d) => proj(X, DK.Ytop, d).map(Math.round);
{
  const [cx, cy] = onDesk(30, 0.2);                                   // the chart: a sheet with dots and lines
  for (let y = cy - 3; y <= cy; y++) for (let x = cx - 9; x <= cx + 9; x++) set(x, y, "paper", 0.86);
  for (const [dx, dy] of [[-6, -2], [-3, -1], [0, -2], [4, -1], [7, -2]]) set(cx + dx, cy + dy, "slate", 0.6);
  const [rx, ry] = onDesk(52, 0.25);                                  // the rack, four letters standing in it
  rect(rx - 7, ry - 1, rx + 7, ry, "wood", (x, y) => (y === ry - 1 ? 0.9 : 0.5));
  for (let k = 0; k < 4; k++) {
    const lx = rx - 6 + k * 4, h = 7 - (k % 2);
    rect(lx, ry - 1 - h, lx + 2, ry - 2, "paper", (x) => (x === lx ? 0.95 : 0.75));
    set(lx + 1, ry - 1 - (h >> 1) - 1, "blood", 0.85);                 // the wax seal
  }
  const [qx, qy] = onDesk(20, 0.12);                                  // an ink pot and quill
  rect(qx - 1, qy - 2, qx + 1, qy, "ebony", 0.8);
  for (let i = 0; i < 5; i++) set(qx + 1 + i, qy - 3 - (i >> 1), "linen", 0.95);
}

/* ---------- the brazier, right front ---------- */
const [ZX, ZY] = proj(168, FY1, 0.2).map(Math.round);
for (const dx of [-5, 0, 5]) for (let j = 0; j < 12; j++) set(ZX + Math.round(dx * (1 - j / 14)), ZY - j, "ebony", 0.7);
for (let y = ZY - 17; y <= ZY - 12; y++) for (let x = ZX - 8; x <= ZX + 8; x++) if (Math.hypot((x - ZX) / 8, (y - ZY + 17) / 5.5) <= 1) set(x, y, "copper", y === ZY - 17 ? 0.95 : x < ZX ? 0.75 : 0.5);
for (let x = ZX - 7; x <= ZX + 7; x++) glow(x, ZY - 18, (x & 1) ? [240, 130, 50] : [200, 90, 40]);
for (const dx of [-5, -2, 1, 4, -3, 2]) CANDLES.push([ZX + dx, ZY - 19 - (Math.abs(dx) < 3 ? 1 : 0)]);

for (const [x, y] of [[112, 140], [80, 144], [140, 132]]) rect(x, y, x + 3, y, "paper", 0.9), rect(x + 1, y + 1, x + 4, y + 1, "paper", 0.7);

r.cutEdges(proj(96, PARA, 0)[1] | 0);                               // open to the sky above the parapet

/* ---------- light: cool moonlight over everything, the brazier warm ---------- */
const light = (x, y) => {
  let L = 0.4;
  L += 0.1;                                                           // moonlight, from the sky behind
  L += 0.7 * Math.exp(-Math.hypot(x - ZX, y - ZY + 20) / 30);
  L += 0.18 * Math.exp(-Math.hypot(x - AX, y - ASY) / 10);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;
  return L * (1 - 0.3 * (vx * vx + vy * vy));
};

/* ---------- render: the brazier and the candles burn ---------- */
const room = r.finish({ light });

module.exports = room;
if (require.main === module) kit.preview("observatory", room, { ref: __dirname + "/../../spike/out/all_obs.png" });
