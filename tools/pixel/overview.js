/* The overview picture: the tower standing in its landscape, 320×300 native.
 * The page crops it to whatever shape the picture pane is, so the land
 * never stops short of an edge: ×3 fills a 576×900 pane, ×2 a phone.
 * The same landscape (without the tower) is drawn enlarged behind a room
 * when you zoom in, so the outside is one place at every scale.
 *
 * Dusk, back to front: a sky from indigo to a peach afterglow with a few thin
 * clouds lit from below, two alpine ranges (the far one hazy, snow catching
 * the last pink light), a dark wooded ridge, the meadow the tower stands in,
 * and layered earth around the cellar. One light: low, from the left.
 *
 *   node overview.js   → preview/overview.png (all lit, and the library in focus)
 */
const P = require("./core/pixel.js");
const T = require("./tower.js");
const W = 320, H = 300, OX = (W - 96) / 2, OY = 20;   // where the 96×280 tower sits
const GY = T.GROUND + OY;                         // ground line: 241

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SKY = ["#191a36", "#23244a", "#33315e", "#4b406f", "#6c5079", "#95627a", "#bd7a76", "#dc9b7c"].map(hex);
const FAR = { lit: hex("#8a74a0"), mid: hex("#6e5f8c"), dark: hex("#594c78"), snow: hex("#efc3b4"), snowDark: hex("#b49ab8") };
const MID = { lit: hex("#4f4a72"), mid: hex("#423e64"), dark: hex("#363356") };
const NEAR = { body: hex("#24303c"), tree: hex("#1b2530"), treeLit: hex("#2c3a44") };
const GRASS = ["#2c3f2c", "#3a5234", "#4a663c", "#5c7a44"].map(hex);
const EARTH = ["#2a1d16", "#33241b", "#3d2c20", "#4a3828"].map(hex);
const CLOUD = { body: hex("#5d4a74"), under: hex("#c98a80"), top: hex("#7a5e86") };

function backdrop(dim = 1) {
  const b = new P.Buf(W, H);
  const put = (x, y, c) => b.pset(x, y, c.map((v) => Math.round(v * dim)));
  const pick = (ramp, v, x, y) => ramp[P.band(v, ramp.length, x, y, 0.12)];

  // sky: flat bands, mixed only in a thin strip where two meet
  for (let y = 0; y < GY; y++) for (let x = 0; x < W; x++) put(x, y, SKY[P.band(Math.pow(y / (GY - 10), 1.25), SKY.length, x, y, 0.05)]);
  for (let k = 0; k < 34; k++) {                                         // stars, thinning toward the glow
    const x = Math.floor(P.hash(k, 1, 51) * W), y = Math.floor(Math.pow(P.hash(k, 2, 51), 1.6) * 100);
    put(x, y, y < 50 ? hex("#e8e4f4") : hex("#b8acd0"));
  }
  // the moon, up and to the right of the tower, with a soft halo
  const MX = OX + 96 + 34, MY = 34;
  for (let y = MY - 8; y <= MY + 8; y++) for (let x = MX - 8; x <= MX + 8; x++) {
    const d = Math.hypot(x - MX, y - MY);
    if (d <= 4.2) put(x, y, Math.hypot(x - MX - 1.5, y - MY + 1) < 1.2 ? hex("#d0ccbe") : hex("#f0ecd6"));
    else if (d <= 6.5) put(x, y, hex("#3a3868"));
    else if (d <= 8 && y < 60) put(x, y, hex("#2c2c56"));
  }

  // thin clouds, flat on top, their undersides catching the afterglow
  for (const [cx, cy, len] of [[16, 120, 40], [86, 112, 46], [206, 96, 58], [156, 138, 30], [226, 150, 36], [296, 116, 48]]) {
    for (let x = cx - len / 2; x <= cx + len / 2; x++) {
      const e = Math.abs(x - cx) / (len / 2), th = Math.round(3 * (1 - e * e) + P.noise(x * 0.3, cy, 3) * 1.2);
      for (let j = 0; j < th; j++) put(Math.round(x), cy - j, j === 0 ? CLOUD.under : j === th - 1 ? CLOUD.top : CLOUD.body);
    }
  }

  // a ridge from a list of peaks: [x, height above the base, half-width]
  const ridge = (peaks, base, x, rough, seed) => {
    let h = 0;
    for (const [px, ph, pw] of peaks) h = Math.max(h, ph * (1 - Math.abs(x - px) / pw));
    return base - h - rough * P.fbm(x * 0.15, seed, 2, seed);
  };
  const slope = (f, x) => f(x + 1) - f(x - 1);                  // >0: the ground rises to the left, so this face looks left, to the light

  // the far range: hazy, snow on the peaks
  const peaks = (n, step, hmin, hmax, wmin, wmax, seed) => Array.from({ length: n }, (_, i) =>
    [-30 + i * step + P.hash(i, 1, seed) * step * 0.5, hmin + P.hash(i, 2, seed) * (hmax - hmin), wmin + P.hash(i, 3, seed) * (wmax - wmin)]);
  const FARP = peaks(Math.ceil(W / 38) + 3, 38, 40, 74, 28, 40, 3), MIDP = peaks(Math.ceil(W / 40) + 3, 40, 20, 40, 24, 30, 9);
  const farTop = (x) => ridge(FARP, GY - 18, x, 4, 3);
  for (let x = 0; x < W; x++) {
    const top = Math.round(farTop(x)), s = slope(farTop, x);
    for (let y = top; y < GY; y++) {
      const depth = y - top, snowy = top < GY - 62 && depth < (GY - 62 - top) * 0.6 + 2;
      const lit = s > 0.15, flat = Math.abs(s) <= 0.15;
      put(x, y, snowy ? (lit || flat ? FAR.snow : FAR.snowDark) : lit ? FAR.lit : flat ? FAR.mid : FAR.dark);
    }
  }
  // the middle range: closer, darker, no snow
  const midTop = (x) => ridge(MIDP, GY - 6, x, 3, 9);
  for (let x = 0; x < W; x++) {
    const top = Math.round(midTop(x)), s = slope(midTop, x);
    for (let y = top; y < GY; y++) put(x, y, s > 0.2 ? MID.lit : s < -0.2 ? MID.dark : MID.mid);
  }
  // the wooded ridge: a low hill line covered in small firs
  const nearTop = (x) => GY - 8 - 4 * Math.sin(x * 0.045 + 1) - 2 * Math.sin(x * 0.13);
  for (let x = 0; x < W; x++) for (let y = Math.round(nearTop(x)); y < GY; y++) put(x, y, NEAR.body);
  const r = P.rng(5);
  for (let x = 2; x < W; x += 3 + (r() * 3 | 0)) {
    const h = 6 + (r() * 6 | 0), base = Math.round(nearTop(x)) + 2;
    for (let j = 0; j < h; j++) {
      const hw = Math.floor((j / h) * 2.6);
      for (let i = -hw; i <= hw; i++) put(x + i, base - h + j, i < 0 ? NEAR.treeLit : NEAR.tree);
    }
  }

  // the meadow the tower stands in, then the earth
  for (let x = 0; x < W; x++) {
    for (let y = GY; y < GY + 3; y++) put(x, y, GRASS[y === GY ? 3 : y === GY + 1 ? 2 : 1]);
    if (P.hash(x, 1, 7) < 0.35) put(x, GY - 1, GRASS[P.hash(x, 2, 7) < 0.5 ? 2 : 3]);       // tufts
    if (P.hash(x, 3, 7) < 0.12) put(x, GY - 2, GRASS[2]);
  }
  for (let y = GY + 3; y < H; y++) for (let x = 0; x < W; x++) {
    const warp = 3 * P.fbm(x * 0.04, y * 0.02, 2, 13);                 // strata, gently bent
    const layer = Math.floor((y - GY + warp) / 9) % 3;
    put(x, y, EARTH[layer]);
  }
  for (let k = 0; k < 44; k++) {                                       // a few stones
    const x = Math.floor(P.hash(k, 1, 21) * W), y = GY + 8 + Math.floor(P.hash(k, 2, 21) * (H - GY - 10));
    put(x, y, EARTH[3]); put(x + 1, y, EARTH[3]); put(x, y + 1, EARTH[1]); put(x + 1, y + 1, EARTH[0]);
  }
  return b;
}

/** The whole picture: f = the floor in focus (-1 for all lit). */
function overview(f = -1) {
  const b = backdrop(f >= 0 ? 0.72 : 1), tw = T.render(f);
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) {
    const c = tw.px[y * T.W + x];
    if (c >>> 24) b.px[(y + OY) * W + x + OX] = c;
  }
  return b;
}
module.exports = { overview, backdrop, W, H, OX, OY };

if (require.main === module) {
  const all = overview(-1), lib = overview(3);
  P.save(all, __dirname + "/preview/overview-1x.png");
  P.save(P.sheet([{ buf: all, label: "ALL LIT", scale: 3 }, { buf: lib, label: "LIBRARY IN FOCUS", scale: 3 }], { cols: 2 }),
    __dirname + "/preview/overview.png");
  console.log("colours:", P.colorCount(all).length);
}
