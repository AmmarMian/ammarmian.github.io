/* The laboratory (Projects): 192×160 native, on room-kit.js.
 *
 * Stone walls lined with shelves of jars — each lit jar is a project — the
 * round window throwing its beam onto the cauldron, green and bubbling over
 * its fire; a workbench with an alembic, a copper still, herbs hanging from
 * the beams, a red cushion on the boards.
 *
 *   node laboratory.js   → preview/laboratory.png, .gif, -1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { set, rect, surface, glow, CANDLES, FX0, FX1, FY1, VX, BX0, BY0, BX1, BY1, proj } = r;
const R = kit.RAMPS;

const JAR = [[120, 230, 140], [240, 128, 200], [140, 200, 255], [255, 196, 96]];
const stoneV = (x, y) => 0.42 + 0.05 * P.fbm(x * 0.05, y * 0.05, 2, 6);

/* ---------- walls: plastered stone, shelves of jars ---------- */
const SIDE = [40, 62, 84];
r.shell({
  floor: (x, y, h) => r.planks(x, y, h, { width: 12, seed: 6 }),
  ceil: (x, y, h) => r.beams(x, y, h, { at: [28, 64, 96, 128, 164] }),
  side: (x, y, h) => {
    const { Y, d } = h, f = 0.8;
    if (d > 0.965) return set(x, y, "stone", 0.2, f);
    for (const sy of SIDE) {
      if (Y >= sy && Y < sy + 2) return set(x, y, "wood", Y < sy + 1 ? 0.9 : 0.5, f);
      if (Y < sy && Y > sy - 9 && d > 0.08 && d < 0.9) {                // jars standing on the board
        const slot = Math.floor(d * 16), u = d * 16 - slot, k = P.hash(slot, sy, 8);
        if (k < 0.75 && u > 0.2 && u < 0.85 && Y > sy - 5 - (k * 4 | 0)) {
          const top = Y < sy - 4 - (k * 4 | 0);
          return set(x, y, top ? "clay" : k < 0.25 ? "green" : k < 0.45 ? "blue" : k < 0.6 ? "blood" : "paper", top ? 0.6 : u < 0.4 ? 0.85 : 0.6, f);
        }
      }
    }
    set(x, y, "stone", stoneV(x, y) - d * 0.08, f);
  },
});
rect(BX0, BY0, BX1, BY1, "stone", stoneV);

/* ---------- the back wall: window in the middle, jar shelves either side ---------- */
const WX = 96, WY = 43;
r.roundWindow(WX, WY);
const glowing = [];                                                    // jars that are lit: [x, y, colour]
for (const [x0, x1] of [[BX0 + 3, 80], [112, BX1 - 3]])
  for (const sy of [44, 58, 72]) {
    rect(x0 - 1, sy, x1 + 1, sy + 1, "wood", (x, y) => (y === sy ? 0.92 : 0.5));
    for (let x = x0; x <= x1 - 2; x += 4) {
      const k = P.hash(x, sy, 3);
      if (k > 0.85) continue;
      const h = 4 + (k * 4 | 0), lit = k < 0.32;
      for (let j = 1; j <= h; j++) for (let i = 0; i < 3; i++) {
        if (j === h && i !== 1) continue;                               // a narrow neck
        if (lit) glow(x + i, sy - j, JAR[(k * 13 | 0) % 4].map((c) => Math.round(c * (i === 0 ? 1 : 0.75))));
        else set(x + i, sy - j, j === h ? "clay" : k < 0.55 ? "paper" : "green", i === 0 ? 0.85 : 0.55);
      }
      if (lit) glowing.push([x + 1, sy - 2, JAR[(k * 13 | 0) % 4]]);
    }
  }

/* ---------- herbs drying from the front beam ---------- */
for (const hx of [30, 44, 140, 156, 170]) {
  const len = 6 + (P.hash(hx, 1, 2) * 5 | 0);
  rect(hx, 6, hx, 8, "ochre", 0.5);
  for (let j = 0; j < len; j++) for (let i = -1; i <= 1; i++) if (P.hash(hx + i, j, 5) < 0.7 - j * 0.03) set(hx + i, 9 + j, j % 3 ? "leaf" : "ochre", 0.55 + i * 0.1);
}

/* ---------- the workbench with an alembic ---------- */
r.solidBox({ X0: 10, X1: 58, Ytop: 114, Ybot: 119, d0: 0.5, d1: 0.78 }, {
  front: (x, y, X, Y) => set(x, y, "wood", Y < 115 ? 0.95 : 0.55),
  top: (x, y) => set(x, y, "wood", 0.75), side: (x, y) => set(x, y, "wood", 0.4),
});
for (const X of [11, 55]) r.solidBox({ X0: X, X1: X + 2, Ytop: 119, Ybot: FY1, d0: 0.52, d1: 0.54 }, { front: (x, y) => set(x, y, "wood", 0.4) });
{
  const [ax, ay] = proj(26, 114, 0.62).map(Math.round);               // flask, neck and the arm to the receiver
  for (let y = ay - 6; y <= ay; y++) for (let x = ax - 4; x <= ax + 4; x++) if (Math.hypot(x - ax, (y - ay + 3) * 1.2) <= 4) set(x, y, "copper", x < ax ? 0.85 : 0.55);
  rect(ax, ay - 11, ax, ay - 6, "copper", 0.75);
  for (let i = 0; i < 10; i++) set(ax + i, ay - 11 + Math.round(i * 0.6), "copper", 0.7);
  const [bx, by] = proj(42, 114, 0.6).map(Math.round);
  for (let y = by - 5; y <= by; y++) for (let x = bx - 3; x <= bx + 3; x++) if (Math.hypot(x - bx, (y - by + 2) * 1.3) <= 3.2) glow(x, y, x < bx ? [170, 240, 190] : [110, 200, 140]);
  glowing.push([bx, by - 2, [140, 230, 160]]);
  const [cx, cy] = proj(50, 114, 0.7).map(Math.round);                // a candle on the bench
  rect(cx, cy - 4, cx, cy, "linen", 0.95); CANDLES.push([cx, cy - 5]);
}

/* ---------- the copper still, right ---------- */
r.solidBox({ X0: 150, X1: 178, Ytop: 128, Ybot: FY1, d0: 0.62, d1: 0.78 }, {
  front: (x, y) => set(x, y, "stone", 0.5), top: (x, y) => set(x, y, "stone", 0.7), side: (x, y) => set(x, y, "stone", 0.38),
});
{
  const [sx, sy] = proj(164, 128, 0.7).map(Math.round);
  for (let y = sy - 14; y <= sy; y++) for (let x = sx - 9; x <= sx + 9; x++) {
    const e = Math.hypot((x - sx) / 9, (y - sy + 7) / 7.5);
    if (e <= 1) set(x, y, "copper", 0.45 + 0.45 * (1 - e) + (x < sx ? 0.15 : -0.05));
  }
  rect(sx - 1, sy - 22, sx + 1, sy - 14, "copper", (x) => (x === sx - 1 ? 0.9 : 0.5));
  for (let i = 0; i < 12; i++) set(sx - 1 - i, sy - 22 + Math.round(i * 0.4), "copper", 0.7);
}

/* ---------- the cauldron, over its fire ---------- */
const CA = { X: 100, d: 0.42 };
const [KX, KY] = proj(CA.X, FY1, CA.d).map(Math.round);
for (let y = KY - 15; y <= KY - 2; y++) for (let x = KX - 13; x <= KX + 13; x++) {
  const e = Math.hypot((x - KX) / 13, (y - (KY - 13)) / 11);
  if (y >= KY - 13 && e <= 1) set(x, y, "ebony", 0.5 + 0.5 * (1 - e) + (x < KX - 4 ? 0.4 : 0));
}
rect(KX - 13, KY - 14, KX + 13, KY - 13, "ebony", (x, y) => (y === KY - 14 ? 1 : 0.7));         // the rim
const BREW = [[150, 245, 130], [110, 210, 100], [190, 255, 170]];
for (let x = KX - 11; x <= KX + 11; x++) glow(x, KY - 15, BREW[(x & 3) === 0 ? 2 : (x & 1)]);    // the brew, seen over the rim
for (const dx of [-8, 8]) rect(KX + dx, KY - 2, KX + dx, KY, "ebony", 0.6);                    // legs
const FIRE = [[-4, 0], [-1, 0], [2, 0], [5, 0]];
for (const [dx] of FIRE) CANDLES.push([KX + dx, KY - 1]);
rect(KX - 7, KY, KX + 7, KY, "wood", 0.5);                                                       // the logs

/* ---------- a red cushion on the boards, front left ---------- */
r.solidBox({ X0: 30, X1: 56, Ytop: 140, Ybot: FY1, d0: 0.06, d1: 0.22 }, {
  front: (x, y, X, Y) => set(x, y, "blood", Y < 141 ? 0.9 : 0.55), top: (x, y, X, d) => set(x, y, "blood", 0.72 + (Math.abs(X - 43) < 1 ? -0.2 : 0)),
  side: (x, y) => set(x, y, "blood", 0.45),
});
for (const [x, y] of [[140, 140], [70, 132], [122, 144]]) rect(x, y, x + 3, y, "paper", 0.9), rect(x + 1, y + 1, x + 4, y + 1, "paper", 0.7);

r.cutEdges();

/* ---------- light: the window's beam lands on the cauldron; the fire and the brew glow ---------- */
const BEAM = { x0: WX + 1, y0: WY + 6, x1: KX, y1: KY - 16, h0: 4, h1: 12 };
const shaft = r.makeShaft(BEAM.x0, BEAM.y0, BEAM.x1, BEAM.y1, BEAM.h0, BEAM.h1);
const light = (x, y) => {
  let L = 0.42;
  L += 0.26 * Math.exp(-Math.hypot(x - WX, y - WY) / 50);
  L += 0.28 * shaft(x, y);
  L += 0.5 * Math.exp(-Math.hypot(x - KX, y - KY + 6) / 24);         // the fire and the brew
  for (const [gx, gy] of glowing) L += 0.12 * Math.exp(-Math.hypot(x - gx, y - gy) / 6);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;
  return L * (1 - 0.35 * (vx * vx + vy * vy));
};

/* ---------- render; the brew bubbles, one jar breathes ---------- */
const room = r.finish({ light, shaft, beam: BEAM });
room.animate((b, t) => {
  for (let k = 0; k < 3; k++) {                                       // bubbles rise a little and pop, each on its own beat
    const ph = (t + k * 16) % 48, bx = KX - 7 + k * 7 + (k === 1 ? 1 : 0);
    if (ph < 10) b.pset(bx, KY - 16 - (ph >> 2), ph < 8 ? [200, 255, 185] : [150, 245, 130]);
  }
  const [gx, gy, c] = glowing[2] || glowing[0];
  const s = 0.75 + 0.25 * Math.cos((2 * Math.PI * t) / 48);
  b.pset(gx, gy, c.map((v) => Math.round(Math.min(255, v * (0.6 + 0.6 * s)))));
});

module.exports = room;
if (require.main === module) kit.preview("laboratory", room, { ref: __dirname + "/../../spike/out/all_lab.png" });
