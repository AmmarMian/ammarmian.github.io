/* What every room of the pixel tower shares: 192×160 native, a dollhouse
 * cutaway in one-point perspective, materials banded onto hue-shifted ramps
 * under one light map, the plain dark section cut, a beam of window light,
 * and the ambient animation (candle flames, dust in the beam).
 *
 * A room script calls room(), draws into it with set/rect and the helpers,
 * then calls finish({ light, beam }) and gets back { out, frame, T, DELAY }.
 */
const P = require("./core/pixel.js");
const W = 192, H = 160;

/* Cosy rather than muddy: shadows lean to plum instead of grey-brown, the
 * dark end never sinks below about 10% lightness, and the warm materials
 * (wood, brass, paper, the rugs) carry real saturation. */
const RAMPS = {
  wood:   P.hueRamp(7, { hue: 27, sat: 0.52, light: [0.1, 0.6],   shift: 28 }),
  floor:  P.hueRamp(7, { hue: 23, sat: 0.55, light: [0.1, 0.6],   shift: 28 }),
  cut:    P.hueRamp(4, { hue: 15, sat: 0.18, light: [0.08, 0.22], shift: 25 }),
  stone:  P.hueRamp(6, { hue: 30, sat: 0.22, light: [0.16, 0.62], shift: 28 }),
  paper:  P.hueRamp(6, { hue: 40, sat: 0.5,  light: [0.3, 0.92],  shift: 25 }),
  blood:  P.hueRamp(6, { hue: 2,  sat: 0.66, light: [0.12, 0.58], shift: 30 }),
  green:  P.hueRamp(5, { hue: 150, sat: 0.3, light: [0.12, 0.5],  shift: 35 }),
  blue:   P.hueRamp(5, { hue: 218, sat: 0.36, light: [0.12, 0.55], shift: 30 }),
  brass:  P.hueRamp(6, { hue: 42, sat: 0.68, light: [0.2, 0.82],  shift: 30 }),
  sky:    P.hueRamp(5, { hue: 250, sat: 0.2, light: [0.4, 0.84],  shift: 35 }),
  leaf:   P.hueRamp(5, { hue: 110, sat: 0.46, light: [0.12, 0.56], shift: 40 }),
  ocean:  P.hueRamp(5, { hue: 212, sat: 0.58, light: [0.14, 0.62], shift: 30 }),
  clay:   P.hueRamp(5, { hue: 16,  sat: 0.55, light: [0.18, 0.62], shift: 30 }),
  ochre:  P.hueRamp(5, { hue: 36,  sat: 0.7,  light: [0.18, 0.66], shift: 30 }),
  slate:  P.hueRamp(5, { hue: 218, sat: 0.4,  light: [0.14, 0.55], shift: 30 }),
  linen:  P.hueRamp(6, { hue: 40,  sat: 0.3,  light: [0.36, 0.94], shift: 20 }),
  fabric: P.hueRamp(5, { hue: 230, sat: 0.12, light: [0.2, 0.68],  shift: 25 }),
  ebony:  P.hueRamp(4, { hue: 255, sat: 0.18, light: [0.06, 0.24], shift: 15 }),
  tile:   P.hueRamp(6, { hue: 168, sat: 0.3,  light: [0.16, 0.7],  shift: 35 }),
  water:  P.hueRamp(5, { hue: 182, sat: 0.55, light: [0.22, 0.7],  shift: 30 }),
  night:  P.hueRamp(6, { hue: 240, sat: 0.4,  light: [0.06, 0.32], shift: 20 }),
  copper: P.hueRamp(6, { hue: 18,  sat: 0.62, light: [0.18, 0.7],  shift: 35 }),
  slateBoard: P.hueRamp(4, { hue: 200, sat: 0.12, light: [0.1, 0.24], shift: 15 }),
};
const FLAME = [[255, 246, 214], [255, 200, 110], [226, 120, 44]].map(P.col);

function room() {
  const MATS = Object.keys(RAMPS), M = Object.fromEntries(MATS.map((k, i) => [k, i]));
  const mat = new Int16Array(W * H).fill(-1);
  const val = new Float32Array(W * H);
  const fixedL = new Float32Array(W * H);     // >0: lit by this, not by the room (the section cut)
  const lfac = new Float32Array(W * H).fill(1);
  const set = (x, y, m, v, f = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x; mat[i] = M[m]; val[i] = v; lfac[i] = f; fixedL[i] = 0;
  };
  const rect = (x0, y0, x1, y1, m, v, f) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, m, typeof v === "function" ? v(x, y) : v, f);
  };
  const matAt = (x, y) => MATS[mat[y * W + x]];
  const shade = (x, y, k) => { val[y * W + x] *= k; };
  const CANDLES = [];
  const GLOWS = [];                           // self-lit pixels: drawn over the render as they are
  const glow = (x, y, rgb) => GLOWS.push([Math.round(x), Math.round(y), rgb]);
  /** A pixel lit by L whatever the room's light is (open sky, the land outside). */
  const setFixed = (x, y, m, v, L = 1) => { set(x, y, m, v); const xx = Math.round(x), yy = Math.round(y); if (xx >= 0 && yy >= 0 && xx < W && yy < H) fixedL[yy * W + xx] = L; };

  /* ---------- the box ---------- */
  const FX0 = 6, FX1 = 185, FY0 = 6, FY1 = 147, VX = 96, VY = 58, K = 0.66;
  const proj = (X, Y, d) => { const s = 1 - d * (1 - K); return [VX + (X - VX) * s, VY + (Y - VY) * s]; };
  const [BX0, BY0] = proj(FX0, FY0, 1).map(Math.round);
  const [BX1, BY1] = proj(FX1, FY1, 1).map(Math.round);
  function surface(x, y) {
    const hits = [];
    const sL = (x - VX) / (FX0 - VX), sR = (x - VX) / (FX1 - VX), sF = (y - VY) / (FY1 - VY), sC = (y - VY) / (FY0 - VY);
    const ok = (s) => s >= K - 1e-6 && s <= 1 + 1e-6;
    if (ok(sF)) { const X = VX + (x - VX) / sF; if (X >= FX0 && X <= FX1) hits.push({ kind: "floor", s: sF, X, d: (1 - sF) / (1 - K) }); }
    if (ok(sC)) { const X = VX + (x - VX) / sC; if (X >= FX0 && X <= FX1) hits.push({ kind: "ceil", s: sC, X, d: (1 - sC) / (1 - K) }); }
    if (ok(sL)) { const Y = VY + (y - VY) / sL; if (Y >= FY0 && Y <= FY1) hits.push({ kind: "left", s: sL, Y, d: (1 - sL) / (1 - K) }); }
    if (ok(sR)) { const Y = VY + (y - VY) / sR; if (Y >= FY0 && Y <= FY1) hits.push({ kind: "right", s: sR, Y, d: (1 - sR) / (1 - K) }); }
    if (!hits.length) return { kind: "back" };
    return hits.sort((a, b) => b.s - a.s)[0];
  }
  /** Walk every pixel of the opening and hand it to the surface it lies on. */
  function shell(h) {
    for (let y = FY0; y <= FY1; y++) for (let x = FX0; x <= FX1; x++) {
      const s = surface(x, y);
      if (s.kind === "floor") h.floor && h.floor(x, y, s);
      else if (s.kind === "ceil") h.ceil && h.ceil(x, y, s);
      else if (s.kind === "left" || s.kind === "right") h.side && h.side(x, y, s);
    }
  }
  /** Floorboards running to the back wall. */
  function planks(x, y, hit, o = {}) {
    const { X, d } = hit, wdt = o.width || 11, m = o.mat || "floor";
    const plank = Math.floor((X - FX0) / wdt);
    const seamX = Math.floor((VX + (x - 1 - VX) / hit.s - FX0) / wdt) !== plank;
    const joint = (d * 3.1 + plank * 0.37) % 1;
    const tone = 0.5 + 0.2 * P.hash(plank, Math.floor(d * 3.1 + plank * 0.37), o.seed ?? 9);
    let v = seamX ? 0.2 : joint < 0.03 ? 0.24 : tone;
    if (d > 0.94) v *= 0.7;
    if (X < FX0 + 6 || X > FX1 - 6) v *= 0.8;
    set(x, y, m, v);
  }
  /** Ceiling beams running to the back. */
  function beams(x, y, hit, o = {}) {
    const { X, d } = hit;
    const beam = (o.at || [24, 60, 96, 132, 168]).some((bx) => Math.abs(X - bx) < 4);
    const cross = Math.abs(d - 0.5) < 0.05;
    set(x, y, o.mat || "wood", beam || cross ? (Math.abs(d - 0.5) < 0.02 ? 0.5 : 0.42) : 0.2, 0.7);
  }
  /** Something lying flat on the floor, in floor coordinates: fn(x, y, e, hit). */
  function onFloor(cx, cd, rx, rd, fn) {
    for (let y = FY0; y <= FY1; y++) for (let x = FX0; x <= FX1; x++) {
      const h = surface(x, y);
      if (h.kind !== "floor") continue;
      const e = Math.hypot((h.X - cx) / rx, (h.d - cd) / rd);
      if (e <= 1) fn(x, y, e, h);
    }
  }
  /** A solid box standing in the room, in world units (X across, Y down, d into the room).
   *  Paints the faces we can see: the front (d0), the top when it is below eye
   *  height, and the side that faces the middle. Each face gets its own coords. */
  function solidBox(b, f) {
    const s0 = 1 - b.d0 * (1 - K), s1 = 1 - b.d1 * (1 - K);
    const pts = [[b.X0, b.Ytop, b.d0], [b.X1, b.Ybot, b.d0], [b.X0, b.Ytop, b.d1], [b.X1, b.Ybot, b.d1], [b.X1, b.Ytop, b.d1], [b.X0, b.Ybot, b.d1]].map(([X, Y, d]) => proj(X, Y, d));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const sideX = b.X1 < VX ? b.X1 : b.X0 > VX ? b.X0 : null;
    for (let y = Math.floor(Math.min(...ys)) - 1; y <= Math.ceil(Math.max(...ys)) + 1; y++)
      for (let x = Math.floor(Math.min(...xs)) - 1; x <= Math.ceil(Math.max(...xs)) + 1; x++) {
        let X = VX + (x - VX) / s0, Y = VY + (y - VY) / s0;
        if (X >= b.X0 && X <= b.X1 && Y >= b.Ytop && Y <= b.Ybot) { f.front && f.front(x, y, X, Y); continue; }
        if (b.Ytop > VY && f.top) {
          const s = (y - VY) / (b.Ytop - VY);
          if (s <= s0 && s >= s1) { X = VX + (x - VX) / s; if (X >= b.X0 && X <= b.X1) { f.top(x, y, X, (1 - s) / (1 - K)); continue; } }
        }
        if (sideX !== null && f.side) {
          const s = (x - VX) / (sideX - VX);
          if (s <= s0 && s >= s1) { Y = VY + (y - VY) / s; if (Y >= b.Ytop && Y <= b.Ybot) f.side(x, y, Y, (1 - s) / (1 - K)); }
        }
      }
  }
  function roundWindow(WX, WY, r = 10.5, inner = 7.5) {
    for (let y = WY - r - 1; y <= WY + r + 1; y++) for (let x = WX - r - 1; x <= WX + r + 1; x++) {
      const d = Math.hypot(x - WX, y - WY);
      if (d <= r && d > inner) {
        const nx = (x - WX) / d, ny = (y - WY) / d;
        set(x, y, "stone", 0.62 + 0.3 * (-nx * 0.6 - ny * 0.8) * (d > (r + inner) / 2 ? 1 : -0.6));
      } else if (d <= inner) set(x, y, "sky", 0.55 + ((y - (WY - inner)) / (2 * inner)) * 0.45);
    }
    rect(WX, WY - inner, WX, WY + inner, "wood", 0.3);
    rect(WX - inner, WY, WX + inner, WY, "wood", 0.3);
    rect(WX - r + 1, WY + r + 0.5, WX + r - 1, WY + r + 1.5, "stone", (x, y) => (y === Math.round(WY + r + 0.5) ? 0.9 : 0.45));
  }
  /** The section cut. openAbove: rows above this are open air (the observatory) — no cut there. */
  function cutEdges(openAbove = -1) {
    const cut = (x0, y0, x1, y1) => {
      for (let y = Math.max(y0, openAbove); y <= y1; y++) for (let x = x0; x <= x1; x++) {
        set(x, y, "cut", 0.55 + 0.2 * P.fbm(x * 0.05, y * 0.05, 2, 3));
        fixedL[y * W + x] = 1;
      }
    };
    cut(0, 0, W - 1, FY0 - 1);
    cut(0, FY0, FX0 - 1, FY1);
    cut(FX1 + 1, FY0, W - 1, FY1);
    cut(0, FY1 + 3, W - 1, H - 1);
    rect(0, FY1 + 1, W - 1, FY1 + 2, "floor", (x, y) => (y === FY1 + 1 ? 0.62 : 0.32));
    for (let x = 0; x < W; x++) fixedL[(FY1 + 1) * W + x] = fixedL[(FY1 + 2) * W + x] = 0.8;
    for (let y = Math.max(FY0 - 1, openAbove); y <= FY1; y++) { set(FX0 - 1, y, "cut", 1.0); fixedL[y * W + FX0 - 1] = 1; set(FX1 + 1, y, "cut", 0.75); fixedL[y * W + FX1 + 1] = 1; }
    if (openAbove < 0) for (let x = FX0 - 1; x <= FX1 + 1; x++) { set(x, FY0 - 1, "cut", 0.9); fixedL[(FY0 - 1) * W + x] = 1; }
  }
  /** A beam of window light: from (x0,y0) widening to (x1,y1). */
  function makeShaft(x0, y0, x1, y1, h0 = 5, h1 = 12) {
    return (x, y) => {
      if (y < y0 || y > y1 + 3) return 0;
      const t = (y - y0) / (y1 - y0);
      const c = x0 + t * (x1 - x0), half = h0 + t * (h1 - h0);
      const d = Math.abs(x - c) / half;
      return d > 1 ? 0 : 1 - d * d;
    };
  }

  /* ---------- render and animate ---------- */
  function finish({ light, shaft, beam }) {
    const GAIN = 1.12;
    const out = new P.Buf(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mat[i] < 0) continue;
      const ramp = RAMPS[MATS[mat[i]]];
      const L = fixedL[i] ? fixedL[i] : light(x, y) * lfac[i] * GAIN;
      const mm = MATS[mat[i]];
      const strip = (mm === "wood" && val[i] < 0.4) ? 0.001 : (mm === "floor" || mm === "blood" || mm === "stone" || mm === "tile") ? 0.06 : 0.14;
      out.put(i, ramp[P.band(val[i] * L, ramp.length, x, y, strip)]);
    }
    for (const [x, y, rgb] of GLOWS) out.pset(x, y, rgb);
    const BEAM = [255, 224, 160];
    if (shaft && beam) for (let y = beam.y0 + 2; y <= beam.y1; y++) for (let x = FX0; x <= FX1; x++) {
      const sv = shaft(x, y);
      if (sv <= 0.05) continue;
      const k = P.band(sv, 3, x, y, 0.3);
      if (k) P.blend(out, x, y, BEAM, k === 2 ? 0.24 : 0.12);
    }
    const T = 48, DELAY = 83, MOTE = [255, 240, 205];
    const motes = Array.from({ length: 9 }, (_, k) => {
      const r = P.rng(100 + k);
      return { t: 0.1 + r() * 0.85, u: r() * 2 - 1, ax: 2 + r() * 3, ay: 3 + r() * 4, cx: 1 + (r() * 2 | 0), ph: r() * 6.28 };
    });
    const FLAMES = [
      [[0, 0, 1], [0, -1, 0]],
      [[0, 0, 1], [0, -1, 0], [0, -2, 2]],
      [[0, 0, 1], [0, -1, 0], [1, -2, 2]],
      [[0, 0, 1], [0, -1, 0], [-1, -2, 2]],
    ];
    const extras = [];
    function frame(t) {
      const b = new P.Buf(W, H);
      b.px.set(out.px);
      CANDLES.forEach(([x, y], k) => {
        const shape = FLAMES[(P.hash(k * 7 + Math.floor(t / 2), 3) * 4) | 0];
        for (const [dx, dy, c] of shape) b.pset(x + dx, y + dy, FLAME[c]);
      });
      if (shaft && beam) {
        const a = (2 * Math.PI * t) / T, { x0, y0, x1, y1, h0, h1 } = beam;
        for (const m of motes) {
          const y = Math.round(y0 + m.t * (y1 - y0) + m.ay * Math.sin(a + m.ph));
          const tt = (y - y0) / (y1 - y0);
          const x = Math.round(x0 + tt * (x1 - x0) + m.u * (h0 + tt * (h1 - h0)) * 0.8 + m.ax * Math.cos(a * m.cx + m.ph));
          const s = shaft(x, y);
          if (s > 0.45) b.pset(x, y, MOTE);
          else if (s > 0.2) P.blend(b, x, y, MOTE, 0.5);
        }
      }
      for (const fn of extras) fn(b, t, out);
      return b;
    }
    return { out, frame, T, DELAY, animate: (fn) => extras.push(fn) };
  }

  return { W, H, set, setFixed, glow, GLOWS, rect, matAt, shade, val, mat, CANDLES, FX0, FX1, FY0, FY1, VX, VY, K, BX0, BY0, BX1, BY1,
    proj, surface, shell, planks, beams, onFloor, solidBox, roundWindow, cutEdges, makeShaft, finish };
}

/** Preview sheets for a room: before/now/reference, frames, GIF. */
function preview(name, r, opt = {}) {
  const fs = require("fs"), dir = __dirname + "/preview";
  fs.mkdirSync(dir, { recursive: true });
  const frames = Array.from({ length: r.T }, (_, t) => r.frame(t));
  P.save(frames[0], `${dir}/${name}-1x.png`);
  fs.writeFileSync(`${dir}/${name}.gif`, P.gif(frames, { delay: r.DELAY, scale: 3 }));
  const items = [];
  if (opt.ref) items.push({ buf: P.resize(P.load(opt.ref), 256, 144), label: "3D REFERENCE", scale: 2 });
  items.push({ buf: frames[0], label: name.toUpperCase() + " X3", scale: 3 });
  P.save(P.sheet(items, { cols: items.length }), `${dir}/${name}.png`);
  const changed = (a, b) => { let n = 0; for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) n++; return (100 * n / a.px.length).toFixed(2) + "%"; };
  console.log(`${name}: changed px/frame ${changed(frames[0], frames[1])}, seam ${changed(frames[r.T - 1], frames[0])}, colours ${P.colorCount(frames[0]).length}`);
  return frames;
}

module.exports = { room, preview, RAMPS, FLAME, W, H };
