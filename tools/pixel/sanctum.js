/* The portal sanctum (Elsewhere): 192×160 native, on room-kit.js.
 *
 * A bare stone vault built around the gate: a great ring of cold light on
 * the back wall with another world showing through it (the sea floor, fish
 * drifting past), runes turning around the ring, a circle of the same light
 * cut into the floor, candles on iron stands, a chest, a plant.
 *
 *   node sanctum.js   → preview/sanctum.png, .gif, -1x.png
 */
const P = require("./core/pixel.js");
const kit = require("./room-kit.js");
const r = kit.room();
const { set, rect, glow, CANDLES, FY1, VX, BX0, BY0, BX1, BY1, proj } = r;

const stoneV = (x, y) => 0.44 + 0.06 * P.fbm(x * 0.04, y * 0.06, 2, 33) - (y % 18 === 0 ? 0.04 : 0);   // smooth dressed stone, courses barely marked
r.shell({
  floor: (x, y, h) => {                                               // big flagstones
    const fx = Math.floor((h.X - 6) / 22), fd = Math.floor(h.d * 5 + (fx % 2) * 0.5);
    const lx = Math.floor((96 + (x - 1 - 96) / h.s - 6) / 22) !== fx;
    const ld = Math.abs((h.d * 5 + (fx % 2) * 0.5) % 1) < 0.06;
    set(x, y, "stone", lx || ld ? 0.26 : 0.6 + 0.1 * P.hash(fx, fd, 3) - (h.d > 0.94 ? 0.12 : 0));
  },
  ceil: (x, y, h) => set(x, y, "stone", 0.2 + (Math.abs(h.X - 96) < 30 ? 0.04 : 0), 0.6),
  side: (x, y, h) => set(x, y, "stone", h.d > 0.965 ? 0.18 : stoneV(x, y) - h.d * 0.08, 0.8),
});
rect(BX0, BY0, BX1, BY1, "stone", stoneV);
// pilasters either side of the gate
for (const px of [56, 132]) rect(px, BY0, px + 6, BY1, "stone", (x) => (x === px ? 0.62 : x === px + 6 ? 0.28 : 0.44));

/* ---------- the gate ---------- */
const GX = 96, GY = 66, GR = 26;
const SEA = [[14, 52, 84], [20, 74, 108], [32, 98, 130], [52, 128, 150]];
for (let y = GY - GR - 3; y <= GY + GR + 3; y++) for (let x = GX - GR - 3; x <= GX + GR + 3; x++) {
  const d = Math.hypot(x - GX, y - GY);
  if (d <= GR - 3) {                                                  // the world beyond: the sea floor, lit from above
    const t = (y - (GY - GR)) / (2 * GR);
    let c = SEA[P.band(1 - t, 4, x, y, 0.3)];
    if (y > GY + GR - 12 + 2 * Math.sin(x * 0.3)) c = [70, 96, 84];   // sand and weed at the bottom
    if (y > GY + 10 && Math.abs(Math.sin(x * 0.7)) < 0.18 && y > GY + GR - 22 + (x % 5)) c = [40, 110, 70];
    glow(x, y, c);
  } else if (d <= GR) glow(x, y, d > GR - 1.2 ? [150, 236, 245] : d > GR - 2.2 ? [220, 252, 255] : [110, 210, 228]);
  else if (d <= GR + 3) set(x, y, "stone", 0.75 - (d - GR) * 0.1);
}
const RUNES = [];
for (let k = 0; k < 12; k++) RUNES.push((k / 12) * 2 * Math.PI);

/* ---------- the circle in the floor ---------- */
const FLOOR_RING = [];
r.onFloor(96, 0.42, 46, 0.3, (x, y, e) => {
  if (Math.abs(e - 0.92) < 0.045 || Math.abs(e - 0.62) < 0.035) FLOOR_RING.push([x, y, e]);
});
for (const [x, y, e] of FLOOR_RING) glow(x, y, e > 0.8 ? [110, 210, 228] : [80, 170, 196]);

/* ---------- candles on iron stands, a chest, a plant ---------- */
for (const [X, d, h] of [[54, 0.9, 22], [138, 0.9, 22], [24, 0.22, 30], [170, 0.22, 30]]) {
  const [sx, sy] = proj(X, FY1, d).map(Math.round);
  rect(sx, sy - h, sx, sy, "ebony", 0.8);
  rect(sx - 3, sy, sx + 3, sy, "ebony", 0.7);
  rect(sx - 2, sy - h, sx + 2, sy - h, "ebony", 0.9);
  for (const dx of [-1, 1]) { rect(sx + dx, sy - h - 4, sx + dx, sy - h - 1, "linen", 0.95); CANDLES.push([sx + dx, sy - h - 5]); }
}
r.solidBox({ X0: 152, X1: 180, Ytop: 128, Ybot: FY1, d0: 0.56, d1: 0.7 }, {
  front: (x, y, X, Y) => set(x, y, Math.abs(Y - 134) < 1.2 ? "brass" : "wood", Y < 129 ? 0.95 : Math.abs(Y - 134) < 1.2 ? 0.7 : 0.5),
  top: (x, y) => set(x, y, "wood", 0.78), side: (x, y) => set(x, y, "wood", 0.38),
});
{
  const [px, py] = proj(170, FY1, 0.92).map(Math.round);
  rect(px - 3, py - 7, px + 3, py, "clay", (x) => (x === px - 3 ? 0.85 : x === px + 3 ? 0.45 : 0.65));
  for (const [lx, ly, rr] of [[0, -11, 3], [-4, -14, 3], [3, -16, 3], [-1, -20, 2.6], [4, -10, 2.2]])
    for (let y = Math.floor(py + ly - rr); y <= py + ly + rr; y++) for (let x = Math.floor(px + lx - rr); x <= px + lx + rr; x++) {
      const d = Math.hypot(x - px - lx, (y - py - ly) * 1.3);
      if (d <= rr) set(x, y, "leaf", 0.45 + 0.45 * (1 - d / rr) - (y - py - ly) * 0.05);
    }
}
// a lectern, front left, with the book of destinations open on it
r.solidBox({ X0: 40, X1: 46, Ytop: 112, Ybot: FY1, d0: 0.16, d1: 0.2 }, { front: (x, y) => set(x, y, "wood", 0.55), side: (x, y) => set(x, y, "wood", 0.38) });
{
  const [lx, ly] = proj(43, 112, 0.18).map(Math.round);
  for (let j = 0; j < 4; j++) rect(lx - 8 + j, ly - j, lx + 8 - j, ly - j, "wood", j === 3 ? 0.95 : 0.6);
  for (let j = 0; j < 3; j++) { rect(lx - 6, ly - 4 - j, lx - 1, ly - 4 - j, "paper", 0.92 - j * 0.04); rect(lx + 1, ly - 4 - j, lx + 6, ly - 4 - j, "paper", 0.8 - j * 0.04); }
  for (const dx of [-5, -3, 2, 4]) set(lx + dx, ly - 5, "slate", 0.6);
}
// a small red rug before the gate and a cushion on it
r.onFloor(96, 0.78, 16, 0.07, (x, y, e) => set(x, y, "blood", e > 0.85 ? 0.4 : 0.62));

r.cutEdges();

/* ---------- light: the gate lights the room, the candles warm its edges ---------- */
const light = (x, y) => {
  let L = 0.36;
  L += 0.55 * Math.exp(-Math.hypot(x - GX, y - GY) / 46);
  for (const [cx, cy] of CANDLES) L += 0.1 * Math.exp(-Math.hypot(x - cx, y - cy) / 10);
  const vx = (x - VX) / 100, vy = (y - 80) / 90;
  return L * (1 - 0.35 * (vx * vx + vy * vy));
};

/* ---------- render; runes travel round the ring, fish drift past ---------- */
const room = r.finish({ light });
for (let y = 0; y < 160; y++) for (let x = 0; x < 192; x++) {
  const d = Math.hypot(x - GX, (y - GY) * 0.85);
  if (d > GR + 1 && d < 90 && room.out.px[y * 192 + x] >>> 24) P.blend(room.out, x, y, [110, 200, 224], 0.2 * Math.pow(1 - d / 90, 1.5));
}
room.animate((b, t) => {
  const a0 = (2 * Math.PI * t) / 48 / 4;                              // a quarter turn per loop: 12 runes, 3 steps — seamless
  for (const a of RUNES) {
    const x = Math.round(GX + Math.cos(a + a0) * (GR + 1.5)), y = Math.round(GY + Math.sin(a + a0) * (GR + 1.5));
    b.pset(x, y, [230, 255, 255]);
  }
  for (const [k, fy, sp] of [[0, GY - 8, 1], [1, GY + 2, 2], [2, GY - 14, 1]]) {   // three fish, each crossing the gate once a loop
    const span = 2 * (GR - 4), fx = Math.round(GX - GR + 4 + ((t * sp + k * 17) % 48) / 48 * span);
    for (const [dx, dy, c] of [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 1], [1, -1, 1], [-1, -1, 1], [-1, 1, 1], [3, 0, 1]])
      if (Math.hypot(fx + dx - GX, fy + dy - GY) < GR - 3) b.pset(fx + dx, fy + dy, c ? [150, 196, 210] : [214, 236, 240]);
    if (Math.hypot(fx + 3 - GX, fy - GY) < GR - 3) b.pset(fx + 2, fy, [30, 50, 70]);
  }
  const pulse = 0.5 + 0.5 * Math.cos((2 * Math.PI * t) / 24);
  for (const [x, y, e] of FLOOR_RING) if (e > 0.8) P.blend(b, x, y, [220, 252, 255], 0.35 * pulse);
});

module.exports = room;
if (require.main === module) kit.preview("sanctum", room, { ref: __dirname + "/../../spike/out/all_sanctum.png" });
