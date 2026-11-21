/* The first question's three pictures, 96×120 each, one per way of seeing
 * the site. Same palette, same light from the upper left as the tower.
 *
 *   3d    the tower as a solid: a round stone tower drawn in the round, a
 *         ring orbiting it to say "you can turn this", in the dusk land
 *   2d    the pixel tower itself, its top floors against the dusk
 *   text  an open book on the desk by a candle: the plain page
 *
 *   node chooser.js   → preview/chooser.png
 */
const P = require("./core/pixel.js");
const { RAMPS, FLAME } = require("./room-kit.js");
const T = require("./tower.js");
const ov = require("./overview.js");

const CW = 96, CH = 120;
const unpack = (c) => P.unpack(c);
const ramp = (name) => RAMPS[name].map(unpack);

/** The dusk land behind a picture: a crop of the home backdrop. */
function land(x, y) {
  const bg = ov.backdrop(1), b = new P.Buf(CW, CH);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) b.px[j * CW + i] = bg.px[(y + j) * bg.w + x + i];
  return b;
}

/* ------------------------------ 3D: a solid ------------------------------ */
function solid() {
  const b = land(4, 150);
  const STONE = ramp("stone"), BRASS = ramp("brass"), WOOD = ramp("wood");
  const CX = 48, R = 21, TOP = 34, BOT = 104, EY = 5;                  // a cylinder, seen a little from above
  const L = [-0.62, 0.78];                                                // light from the left, toward the viewer
  const across = (x) => (x + 0.5 - CX) / R;
  const sag = (x) => EY * Math.sqrt(Math.max(0, 1 - across(x) ** 2));  // how far a course line dips at this x

  // the orbit ring, far half first (behind the tower)
  const ring = (front) => {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const x = Math.round(CX + Math.cos(a) * 38), y = Math.round(70 + Math.sin(a) * 9);
      if ((Math.sin(a) > 0) !== front) continue;
      if (Math.floor(a / 0.09) % 3 === 2) continue;                    // dashed
      b.pset(x, y, front ? BRASS[4] : BRASS[1]);
    }
  };
  ring(false);
  // a soft shadow on the ground
  for (let y = BOT; y < BOT + 6; y++) for (let x = CX - 30; x <= CX + 30; x++)
    if (((x - CX - 4) / 30) ** 2 + ((y - BOT - 1) / 4) ** 2 <= 1) b.pset(x, y, P.mix(unpack(b.get(x, y)), [20, 14, 24], 0.5));
  // the wall: lit across its roundness, courses of stone that dip with the curve
  for (let x = CX - R; x <= CX + R; x++) {
    const u = across(x);
    if (Math.abs(u) > 1) continue;
    const nz = Math.sqrt(1 - u * u), lum = Math.max(0, u * L[0] + nz * L[1]);
    const step = P.band(0.05 + lum * 0.72, STONE.length, x, 0, 0.25);     // a step darker than full: dusk, not noon
    for (let y = TOP + Math.round(sag(x)); y <= BOT + Math.round(sag(x)); y++) {
      const row = y - TOP - sag(x), course = Math.floor(row / 6);
      const mortar = row % 6 < 1 || (Math.floor((u * 8 + (course % 2) * 0.5)) !== Math.floor(((u + 1 / R) * 8 + (course % 2) * 0.5)) && row % 6 < 6);
      b.pset(x, y, STONE[Math.max(0, step - (mortar ? 1 : 0))]);
    }
  }
  // lit windows, one per floor, near the middle where the wall faces you
  for (let f = 0; f < 4; f++) {
    const wx = CX - 2 + (f % 2 ? 6 : -6), wy = TOP + 12 + f * 17;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) {
      if (j === 0 && (i === 0 || i === 3)) continue;                     // an arched head
      b.pset(wx + i, wy + j + Math.round(sag(wx) * 0.4), j < 2 ? FLAME[0] : FLAME[1]);
    }
  }
  // the top: a wooden floor seen from above, merlons round its rim, the telescope
  for (let y = TOP - EY; y <= TOP + EY; y++) for (let x = CX - R; x <= CX + R; x++) {
    const e = across(x) ** 2 + ((y - TOP) / EY) ** 2;
    if (e > 1) continue;
    b.pset(x, y, e > 0.62 ? STONE[e > 0.85 ? 4 : 3] : WOOD[Math.floor((x - CX + 40) / 4) % 2 ? 3 : 4]);
  }
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += Math.PI / 7) {     // merlons on the far rim
    const x = Math.round(CX + Math.cos(a) * (R - 1)), y = Math.round(TOP + Math.sin(a) * (EY - 0.5));
    for (let j = 1; j <= 3; j++) { b.pset(x, y - j, STONE[3]); b.pset(x + 1, y - j, STONE[2]); }
  }
  for (let a = 0.2; a < Math.PI - 0.1; a += Math.PI / 7) {               // and on the near rim
    const x = Math.round(CX + Math.cos(a) * (R - 1)), y = Math.round(TOP + Math.sin(a) * (EY - 0.5));
    for (let j = 1; j <= 3; j++) { b.pset(x, y - j, STONE[4]); b.pset(x + 1, y - j, STONE[3]); }
  }
  for (let i = 0; i < 16; i++) { b.pset(CX - 2 + i, TOP - 2 - Math.round(i * 0.75), BRASS[i < 3 ? 2 : 4]); b.pset(CX - 2 + i, TOP - 1 - Math.round(i * 0.75), BRASS[2]); }
  b.pset(CX - 3, TOP - 1, BRASS[1]); b.pset(CX - 3, TOP, BRASS[1]);
  ring(true);
  // the arrowhead on the near side: it turns
  const ax = CX + 30, ay = 77;
  for (const [dx, dy] of [[0, 0], [-1, -1], [-2, -2], [-1, 1], [-2, 2], [1, 0]]) b.pset(ax + dx, ay + dy, BRASS[5]);
  return b;
}

/* --------------------------- 2D: the pixel tower ------------------------- */
function pixel() {
  const full = ov.overview(-1);
  const b = new P.Buf(CW, CH);
  const x0 = ov.OX, y0 = ov.OY - 8;                                       // the tower's top floors, the sky above them
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) b.px[j * CW + i] = full.px[(y0 + j) * full.w + x0 + i];
  return b;
}

/* ------------------------- text: a book by a candle ----------------------- */
function book() {
  const b = new P.Buf(CW, CH);
  const WOOD = ramp("wood"), PAPER = ramp("paper"), BLOOD = ramp("blood"), INK = [58, 40, 44];
  // the desk, planks running across, darker away from the candle
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const glow = Math.max(0, 1 - Math.hypot(x - 78, y - 22) / 90);
    const v = 0.12 + glow * 0.55 + (y % 14 === 0 ? -0.15 : 0);
    b.pset(x, y, WOOD[P.band(P.clamp(v), WOOD.length, x, y, 0.2)]);
  }
  // the open book: two pages bowing up from the gutter, the left catching the light
  const BX0 = 10, BX1 = 86, BY0 = 34, BY1 = 104, GX = 48;
  for (let x = BX0 - 1; x <= BX1 + 1; x++) for (let y = BY0 + 2; y <= BY1 + 3; y++) b.pset(x, y, [40, 24, 26]);      // the cover's edge, a shadow
  for (let x = BX0; x <= BX1; x++) {
    const u = (x - GX) / (x < GX ? GX - BX0 : BX1 - GX);                   // -1 … 0 at the gutter … 1
    const lift = Math.round(4 * Math.sin(Math.abs(u) * Math.PI * 0.9));     // the page curls up from the spine
    for (let y = BY0 - lift; y <= BY1 - lift + 2; y++) {
      const near = Math.abs(u) < 0.08 ? 1 : Math.abs(u) < 0.18 ? 2 : u < 0 ? 5 : 3;
      b.pset(x, y, PAPER[Math.max(1, near)]);
    }
    // lines of text, a red initial and heading on the left page
    if (Math.abs(u) > 0.16 && Math.abs(u) < 0.9) {
      for (let k = 0; k < 9; k++) {
        const y = BY0 - lift + 10 + k * 6;
        const end = k === 8 ? 0.5 : 0.9 - (P.hash(k, x < GX ? 1 : 2, 3) * 0.12);
        if (Math.abs(u) < end && P.hash(x, k, 7) > 0.14) b.pset(x, y, k === 0 && u < 0 ? BLOOD[3] : INK);
      }
    }
  }
  for (let j = 0; j < 7; j++) for (let i = 0; i < 6; i++) b.pset(BX0 + 7 + i, BY0 + 12 + j - 3, BLOOD[i < 2 || j < 2 ? 4 : 3]);   // the initial
  for (let y = BY0 + 4; y < BY1 + 12; y++) { b.pset(GX + 1, y, BLOOD[2]); b.pset(GX + 2, y, BLOOD[3]); }                     // a ribbon
  // the candle, upper right, and its light
  for (let y = 6; y < 26; y++) for (let x = 74; x < 80; x++) b.pset(x, y, PAPER[x < 76 ? 5 : 3]);
  b.pset(76, 5, [60, 40, 30]);
  for (const [x, y, c] of [[76, 1, 0], [76, 2, 0], [76, 3, 1], [77, 3, 1], [75, 4, 2], [76, 4, 1], [77, 4, 2]]) b.pset(x, y, FLAME[c]);
  for (let y = 0; y < 14; y++) for (let x = 66; x < 88; x++) {
    const d = Math.hypot(x - 76, y - 3);
    if (d > 4 && d < 10 && P.bt(x, y) < 0.4 && !(x >= 74 && x < 80 && y >= 5)) b.pset(x, y, P.mix(unpack(b.get(x, y)), [255, 210, 130], 0.3));
  }
  return b;
}

module.exports = { solid, pixel, book, CW, CH };

if (require.main === module) {
  P.save(P.sheet([{ buf: solid(), label: "3D", scale: 4 }, { buf: pixel(), label: "2D", scale: 4 }, { buf: book(), label: "TEXT", scale: 4 }], { cols: 3 }),
    __dirname + "/preview/chooser.png");
}
