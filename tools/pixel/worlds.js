/* The worlds beyond the gate, as backdrops for the pixel tower.
 *
 * The 3D tower can step through the sanctum's gate into another world; the
 * 2D tower does the same by changing the land it stands in. Each world is a
 * 320×300 picture on the same frame as overview.js's dusk landscape: the
 * tower stands at x 112–208, its ground line is y 241, and the cellar (the
 * bathhouse) sits below it, so every world has something underfoot too.
 *
 * Same rules as the rest of the tower: flat colour bands mixed only in a thin
 * strip, hue-shifted ramps, one light low from the left, far layers hazed
 * toward the colour of the air.
 *
 *   node worlds.js   → preview/worlds.png (every world with the tower in it)
 */
const P = require("./core/pixel.js");
const T = require("./tower.js");
const { W, H, OX, OY, backdrop: home } = require("./overview.js");
const GY = T.GROUND + OY;                              // 241
const TC = OX + 48;                                    // the tower's centre line
/* Every world goes on upward for EXT more pixels above the 320×300 frame
   (drawn at y < 0), so a tall screen, or a room high in the tower, never
   reaches the top of the picture. */
const EXT = 200;
const tall = () => { const b = new P.Buf(W, H + EXT); b.oy = -EXT; return b; };
/* Every world loops in LOOP frames: each drawing function takes the frame t
   and draws that moment. Motion is slow and small, and frame LOOP is frame 0
   again, so the loop never jumps. */
const LOOP = 16, TAU = Math.PI * 2;
/* By day: the site's light theme. Set around a call with byDay(). The moon,
   space and the abandoned city are always night; the forest and the sea floor
   are drawn by day and graded to night. */
let DAY = false;
const byDay = (fn) => (...a) => { DAY = true; try { return fn(...a); } finally { DAY = false; } };
const cycle = (t, k = 1) => (TAU * k * t) / LOOP;

/** Night over a scene drawn by day: every colour dimmed and pulled toward
 *  moonlight blue, as the light itself changes, rather than a dark wash on top. */
function nightGrade(b, k = [0.34, 0.42, 0.6], lift = [6, 9, 18]) {
  for (let i = 0; i < b.px.length; i++) {
    const c = P.unpack(b.px[i]);
    b.px[i] = P.col(c.map((v, j) => Math.min(255, Math.round(v * k[j] + lift[j]))));
  }
}

/** Stars twinkle: any pixel much brighter than its four neighbours, above
 *  yMax, is a star; a third of them dip for two frames in turn, and a few
 *  flare with short arms. Found again on every frame from the same picture,
 *  so the set never changes. */
function twinkle(b, t, yMax, skip = () => false) {
  const lum = (c) => (c & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + ((c >>> 16) & 255) * 0.11;
  const stars = [];
  for (let y = -EXT + 1; y < yMax; y++) for (let x = 1; x < W - 1; x++) {
    if (skip(x, y)) continue;
    const c = b.get(x, y), l = lum(c), n = [b.get(x - 1, y), b.get(x + 1, y), b.get(x, y - 1), b.get(x, y + 1)];
    if (l > 120 && n.every((m) => l - lum(m) > 45)) stars.push([x, y, c, n]);
  }
  stars.forEach(([x, y, c, n], i) => {
    const ph = (t + i * 5) % LOOP, bg = P.unpack(n[0]);
    if (i % 3 === 0 && ph < 2) b.pset(x, y, mix(P.unpack(c), bg, 0.65));
    else if (i % 13 === 0 && ph >= 6 && ph < 8) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.pset(x + dx, y + dy, mix(bg, P.unpack(c), 0.55));
  });
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hexes = (...a) => a.map(hex);
const mix = (a, b, u) => P.mix(a, b, u).map(Math.round);

/* ------------------------------ shared kit ------------------------------ */
function kit(b) {
  const put = (x, y, c) => b.pset(x, y, c);
  const at = (x, y) => P.unpack(b.get(x, y));
  const blend = (x, y, c, a) => P.blend(b, Math.round(x), Math.round(y), c, a);
  /** Flat bands from y0 to y1, mixed only where two meet. */
  const bands = (cols, y0, y1, o = {}) => {
    const pow = o.pow ?? 1, strip = o.strip ?? 0.06, x0 = o.x0 ?? 0, x1 = o.x1 ?? W;
    for (let y = y0; y < y1; y++) {
      const v = Math.pow((y - y0) / Math.max(1, y1 - y0 - 1), pow);
      for (let x = x0; x < x1; x++) put(x, y, cols[P.band(v, cols.length, x, y, strip)]);
    }
  };
  /** Layers of rock or earth, gently bent, from y0 to the bottom. */
  const strata = (cols, y0, o = {}) => {
    const th = o.thick ?? 9, seed = o.seed ?? 13;
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
      if (o.mask && !o.mask(x, y)) continue;
      const warp = 3 * P.fbm(x * 0.04, y * 0.02, 2, seed);
      put(x, y, cols[Math.floor((y - y0 + warp) / th) % cols.length]);
    }
  };
  const pebbles = (n, y0, light, mid, dark, seed, mask) => {
    for (let k = 0; k < n; k++) {
      const x = Math.floor(P.hash(k, 1, seed) * W), y = y0 + 4 + Math.floor(P.hash(k, 2, seed) * (H - y0 - 6));
      if (mask && !mask(x, y)) continue;
      put(x, y, light); put(x + 1, y, mid); put(x, y + 1, mid); put(x + 1, y + 1, dark);
    }
  };
  const stars = (n, y1, seed, cols, x0 = 0, x1 = W) => {
    for (let k = 0; k < n; k++) {
      const x = x0 + Math.floor(P.hash(k, 1, seed) * (x1 - x0)), y = Math.floor(Math.pow(P.hash(k, 2, seed), 1.4) * y1);
      put(x, y, cols[Math.floor(P.hash(k, 3, seed) * cols.length)]);
    }
  };
  /** Stars in the sky above the frame (y < 0). */
  const starsAbove = (n, seed, cols) => {
    for (let k = 0; k < n; k++) put(Math.floor(P.hash(k, 1, seed) * W), -1 - Math.floor(P.hash(k, 2, seed) * EXT), cols[Math.floor(P.hash(k, 3, seed) * cols.length)]);
  };
  /** A bright star: a dot with short arms. */
  const twinkle = (x, y, c, dim) => { put(x, y, c); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, dim); };
  /** A ridge line from a list of peaks: [x, height, half-width]. */
  const ridge = (peaks, base, rough, seed) => (x) => {
    let h = 0;
    for (const [px, ph, pw] of peaks) h = Math.max(h, ph * (1 - Math.abs(x - px) / pw));
    return base - h - rough * P.fbm(x * 0.15, seed, 2, seed);
  };
  const peaks = (n, step, hmin, hmax, wmin, wmax, seed) => Array.from({ length: n }, (_, i) =>
    [-30 + i * step + P.hash(i, 1, seed) * step * 0.5, hmin + P.hash(i, 2, seed) * (hmax - hmin), wmin + P.hash(i, 3, seed) * (wmax - wmin)]);
  /** Fill under a top line, the face coloured by which way it slopes (light from the left). */
  const range = (top, y1, lit, mid, dark, cut = 0.15) => {
    for (let x = 0; x < W; x++) {
      const t = Math.round(top(x)), s = top(x + 1) - top(x - 1);
      for (let y = t; y < y1; y++) put(x, y, s > cut ? lit : s < -cut ? dark : mid);
    }
  };
  /** A sphere lit from the left: fn(nx, ny, lum) → colour, or null to leave it. */
  const sphere = (cx, cy, r, fn, L = [-0.72, -0.38, 0.58]) => {
    const ll = Math.hypot(...L);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz = Math.sqrt(1 - q), lum = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ll);
      const c = fn(nx, ny, lum, x, y);
      if (c) put(x, y, c);
    }
  };
  return { put, at, blend, bands, strata, pebbles, stars, starsAbove, twinkle, ridge, peaks, range, sphere };
}

/** Is (x, y) inside the 1×(a×b) ellipse at (cx, cy)? */
const inEll = (x, y, cx, cy, a, b) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1;

/* ------------------------------- sea floor ------------------------------
 * Under the sea: blue-green water darkening with depth, shafts of light from
 * the surface, a whale passing far off, two schools of fish, kelp swaying up
 * from the sand, and the tower sunk to its doorstep in a pale seabed. */
function seafloor(t = 0) {
  const b = tall(), k = kit(b);
  const WATER = hexes("#4b98a2", "#3a8193", "#2f6c86", "#275a78", "#204a69", "#1b3d5b", "#17324e");
  k.bands(WATER, 0, GY, { pow: 0.9 });
  k.bands(hexes("#72bcb7", "#64b0b1", "#57a4aa", "#4b98a2"), -EXT, 0);                // lighter toward the surface, far above

  // shafts of light, slanting down from the surface, gone before the floor
  for (const [x0, w, len] of [[28, 9, 170], [74, 5, 120], [218, 7, 150], [262, 11, 190], [300, 5, 110]]) {
    for (let y = -EXT; y < len + 16; y++) {
      const cx = x0 + y * 0.32, fade = y < len ? 1 : 1 - (y - len) / 16;
      for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
        if (P.bt(x, y) >= fade) continue;
        k.put(x, y, mix(k.at(x, y), hex("#9fd6cf"), Math.abs(x - cx) < w / 4 ? 0.16 : 0.09));
      }
    }
  }

  // the whale, far off and hazed into the water, swimming left
  const hazeW = (y) => k.at(4, y);
  const whale = (x, y) => {
    const u = (x - 30) / 84;                                      // 0 at the snout, 1 at the flukes
    if (u < 0 || u > 1) return null;
    const half = u < 0.55 ? 9 * Math.sqrt(Math.max(0, 1 - ((u - 0.4) / 0.42) ** 2)) : 9 * (1 - (u - 0.55) / 0.45) ** 1.6 + 1;
    const mid = 58 + u * 6;
    if (Math.abs(y - mid) <= half) return y > mid + half * 0.35 ? "belly" : "back";
    return null;
  };
  for (let y = 40; y < 90; y++) for (let x = 24; x < 130; x++) {
    let part = whale(x, y);
    // the flukes: two blades swept back from the tail stock
    const fx = x - 114, fy = y - 64;
    if (!part && fx >= -4 && fx <= 6 && Math.abs(fy) <= 7 && Math.abs(fy) >= fx * 0.4 - 1 && Math.abs(fy) <= 2 + (fx + 4) * 0.7) part = "back";
    // the long pectoral fin, hanging down and back
    if (!part && y > 64 && y < 75 && Math.abs(x - (54 + (y - 64) * 1.1)) < 2.2) part = "back";
    if (!part) continue;
    k.put(x, y, mix(hazeW(y), part === "back" ? hex("#0f2a3e") : hex("#3b6d7e"), 0.55));
  }
  k.put(38, 58, mix(hazeW(58), hex("#0a1e2c"), 0.6));               // the eye

  // two schools of fish, each fish a dash with a tail, catching the light
  // the school drifts back and forth as one, a little; each fish flicks its tail in its own time
  const school = (cx, cy, rx, ry, n, seed, near) => {
    const dx = Math.round(2 * Math.sin(cycle(t) + seed)), dy = Math.round(Math.sin(cycle(t) + seed * 2));
    for (let i = 0; i < n; i++) {
      const a = P.hash(i, 1, seed) * Math.PI * 2, r = Math.sqrt(P.hash(i, 2, seed));
      const x = Math.round(cx + Math.cos(a) * rx * r) + dx, y = Math.round(cy + Math.sin(a) * ry * r) + dy;
      const c = near ? hex("#c5e2dc") : mix(k.at(x, y), hex("#9cc8c8"), 0.6), d = near ? hex("#6a9aa6") : mix(k.at(x, y), hex("#5d8f9c"), 0.6);
      const flick = (t + i) % 4 < 2 ? 0 : 1;
      k.put(x, y, c); k.put(x + 1, y, c); k.put(x + 2, y, d); k.put(x + 3, y - 1 + flick, d); k.put(x + 3, y + 1, d);
    }
  };
  school(258, 120, 34, 14, 46, 7, false);
  school(48, 158, 22, 9, 24, 11, true);

  // a far reef: a low hazed ridge along the floor
  const reef = k.ridge(k.peaks(12, 34, 6, 18, 14, 22, 21), GY - 2, 4, 21);
  k.range(reef, GY, hex("#2c5d6c"), hex("#25516a"), hex("#1f4660"));

  // kelp: a stem that sways up from the sand, blades off alternate sides
  const KELP = hexes("#3b4a22", "#55632a", "#717a32", "#8f8f3e");
  const kelp = (x0, h, ph) => {
    // its resting curve, and a slow sway that grows toward the tip
    const sx = (y) => x0 + 3.2 * Math.sin((GY - y) * 0.07 + ph) * Math.min(1, (GY - y) / 30) + 1.6 * Math.sin(cycle(t) + ph * 1.7) * ((GY - y) / h) ** 1.4;
    for (let y = GY; y > GY - h; y--) k.put(sx(y), y, KELP[1]);
    for (let j = 6, side = ph > 1 ? 1 : -1; j < h - 2; j += 5, side = -side) {
      const y = GY - j, x = sx(y), len = 4 + Math.round(3 * Math.sin(j * 0.3 + ph) ** 2);
      for (let i = 1; i <= len; i++) {
        const yy = y - Math.round(i * 0.55);
        k.put(x + side * i, yy, side < 0 ? KELP[3] : KELP[2]);           // the side facing the light is lighter
        if (i > 1 && i < len) k.put(x + side * i, yy + 1, side < 0 ? KELP[2] : KELP[0]);
      }
    }
  };
  [[8, 70, 0.3], [19, 96, 2.1], [31, 58, 4], [57, 84, 1.2], [84, 46, 3.3], [103, 62, 0.8], [222, 74, 2.6], [238, 104, 0.1], [251, 52, 1.7], [276, 88, 3.8], [298, 64, 2.9], [312, 92, 1.4]]
    .forEach(([x, h, p]) => kelp(x, h, p));

  /* bubbles: mostly single specks, a few small ones, scattered through the
     lower water; each rises 1, 2 or 3 px a frame over its own short track
     (so a loop is exactly one climb) and is gone at both ends of it */
  for (let i = 0; i < 46; i++) {
    const v = 1 + Math.floor(P.hash(i, 1, 33) * 3), track = v * LOOP;
    const x0 = 6 + Math.floor(P.hash(i, 2, 33) * (W - 12)), bottom = 120 + Math.floor(P.hash(i, 3, 33) * (GY - 124));
    const ph = (t + Math.floor(P.hash(i, 4, 33) * LOOP)) % LOOP;
    if (ph === 0 || ph === LOOP - 1) continue;
    const y = bottom - ph * v, x = x0 + Math.round(Math.sin(y * 0.25 + i) * (v === 1 ? 0.6 : 1.2));
    if (y < 8) continue;
    const big = P.hash(i, 5, 33);
    if (big < 0.12) {                                                             // a small ring, lit at the top left
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) k.put(x + dx, y + dy, mix(k.at(x + dx, y + dy), hex("#c6ece6"), 0.7));
      k.put(x - 1, y - 1, hex("#eef8f4"));
    } else if (big < 0.4) {                                                       // a pair of pixels
      k.put(x, y, mix(k.at(x, y), hex("#d6f2ec"), 0.8)); k.put(x, y - 1, mix(k.at(x, y - 1), hex("#a6d6d2"), 0.5));
    } else k.put(x, y, mix(k.at(x, y), hex("#cdeee8"), 0.65));                  // a speck
    void track;
  }

  // the seabed: pale sand in ripples, then darker sand and stone beneath
  const SAND = hexes("#7d806c", "#959279", "#aca586", "#c0b893");
  for (let x = 0; x < W; x++) {
    for (let y = GY; y < GY + 4; y++) k.put(x, y, SAND[y === GY ? 3 : (Math.floor(x / 5 + (y - GY) * 2) % 3 === 0) ? 1 : 2]);
    if (P.hash(x, 4, 31) < 0.3) k.put(x, GY - 1, SAND[2]);
  }
  for (const [x, c] of [[46, "#d98a5a"], [92, "#e4cdb0"], [236, "#d98a5a"], [287, "#e4cdb0"]]) {      // a starfish, a shell
    if (c === "#d98a5a") { for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [1, 1]]) k.put(x + dx, GY - 1 + dy, hex(c)); }
    else { k.put(x, GY - 1, hex(c)); k.put(x + 1, GY - 1, hex(c)); k.put(x, GY - 2, hex("#f2e6d0")); }
  }
  k.strata(hexes("#3d3c33", "#47453a", "#524e40"), GY + 4, { seed: 17 });
  k.pebbles(40, GY, hex("#6a6450"), hex("#4e4a3c"), hex("#34322a"), 23);
  if (!DAY) {
    /* night: the water goes deep and dark, and specks of living light drift
       in it, each brightening and fading over its own part of the loop */
    nightGrade(b, [0.26, 0.36, 0.52], [3, 8, 16]);
    for (let i = 0; i < 70; i++) {
      const ph = (t + Math.floor(P.hash(i, 1, 37) * LOOP)) % LOOP, glow = Math.sin((ph / LOOP) * Math.PI);
      if (glow < 0.25) continue;
      const x = Math.round(4 + P.hash(i, 2, 37) * (W - 8) + Math.sin(cycle(t) + i)), y = Math.round(-60 + P.hash(i, 3, 37) * (GY + 50) - ph * 0.5);
      const c = P.hash(i, 4, 37) < 0.5 ? hex("#7af0dc") : hex("#9ad8ff");
      b.pset(x, y, mix(P.unpack(b.get(x, y)), c, glow > 0.8 ? 0.95 : 0.55));
      if (glow > 0.8 && P.hash(i, 5, 37) < 0.4) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.pset(x + dx, y + dy, mix(P.unpack(b.get(x + dx, y + dy)), c, 0.3));
    }
  }
  return b;
}

/* --------------------------------- moon ---------------------------------
 * A grey airless plain under a black sky: a ringed gas giant hanging low on
 * the left, hard-edged hills, and groves of umbrella trees (flat crowns on
 * thin stems) growing in the dust. */
function moon(t = 0) {
  const b = tall(), k = kit(b);
  k.bands(hexes("#05050c", "#090a16", "#0e1020", "#13162b", "#191c35"), 0, GY, { pow: 1.4 });
  k.stars(120, GY - 30, 41, hexes("#e8e6f2", "#b9b6d0", "#8a88a8", "#d8c8b0"));
  k.bands(hexes("#030308", "#05050c"), -EXT, 0);
  k.starsAbove(80, 43, hexes("#e8e6f2", "#b9b6d0", "#8a88a8"));
  for (const [x, y] of [[214, 22], [292, 64], [36, 168], [248, 120], [104, 14]]) k.twinkle(x, y, hex("#ffffff"), hex("#8f8cb0"));

  // the gas giant: banded, lit from the left, with a ring tilted across it
  const GX = 66, GYc = 92, GR = 40, tilt = -0.22;
  const ringAt = (x, y) => {                                     // ring radius (in planet radii) of (x, y), and whether it is the near half
    const dx = x + 0.5 - GX, dy = y + 0.5 - GYc, c = Math.cos(tilt), s = Math.sin(tilt);
    const u = dx * c + dy * s, v = (-dx * s + dy * c) / 0.24;
    return { r: Math.hypot(u, v) / GR, near: v > 0 };
  };
  const RING = (r) => (r > 1.32 && r < 1.62) ? (r > 1.5 && r < 1.54 ? null : r < 1.42 ? hex("#cdbb9a") : hex("#a8987e")) : (r >= 1.66 && r < 1.8 ? hex("#7d7264") : null);
  for (let y = GYc - 30; y < GYc + 30; y++) for (let x = GX - 80; x < GX + 80; x++) {      // the far half of the ring, behind
    const { r, near } = ringAt(x, y), c = RING(r);
    if (c && !near) k.put(x, y, mix(c, hex("#0e1020"), 0.25));
  }
  const BANDS = [hex("#d9b98a"), hex("#c08a5c"), hex("#e3cfa4"), hex("#a8674a"), hex("#d6ad7a"), hex("#8f5a44")];
  k.sphere(GX, GYc, GR, (nx, ny, lum, x, y) => {
    const lat = ny + 0.06 * Math.sin(nx * 5 + ny * 3) + 0.04 * (P.fbm(x * 0.12, y * 0.4, 2, 5) - 0.5);
    const base = BANDS[((Math.floor((lat + 1) * 4.2) % BANDS.length) + BANDS.length) % BANDS.length];
    const step = P.band(Math.pow(lum, 0.8), 5, x, y, 0.2);       // 0 night side … 4 full light
    // the ring's shadow, a dark stripe across the lit face just below the equator
    const sh = Math.abs(ny - 0.2 - nx * 0.22) < 0.05 ? 0.55 : 1;
    return mix(hex("#0e0c18"), base, [0.12, 0.3, 0.55, 0.8, 1][step] * sh);
  });
  for (let y = GYc - 30; y < GYc + 30; y++) for (let x = GX - 80; x < GX + 80; x++) {      // the near half, in front
    const { r, near } = ringAt(x, y), c = RING(r);
    if (c && near) k.put(x, y, c);
  }

  // hard grey hills, then the plain
  const far = k.ridge(k.peaks(12, 34, 16, 40, 22, 34, 47), GY - 10, 3, 47);
  k.range(far, GY, hex("#6c6a76"), hex("#56545f"), hex("#43414c"), 0.2);
  const near = (x) => GY - 4 - 3 * Math.sin(x * 0.05 + 2) - 2 * Math.sin(x * 0.17);
  k.range(near, GY, hex("#8a8892"), hex("#77757f"), hex("#62606b"), 0.25);

  // umbrella groves: a thin pale stem and a flat crown, lit on top
  const UM = { stem: hex("#8a8494"), top: hex("#6b8a8c"), body: hex("#4b6670"), under: hex("#2e3d4a") };
  const umbrella = (x, base, h, r) => {
    for (let y = base; y > base - h; y--) k.put(x + Math.round(Math.sin((base - y) * 0.2) * 0.6), y, UM.stem);
    const cy = base - h;
    for (let dx = -r; dx <= r; dx++) {
      const e = 1 - (dx / r) ** 2, th = Math.max(1, Math.round(3 * Math.sqrt(e)));
      for (let j = 0; j < th; j++) k.put(x + dx, cy - j, j === th - 1 ? (dx < r * 0.3 ? UM.top : UM.body) : j === 0 ? UM.under : UM.body);
    }
  };
  [[14, 12, 6], [26, 17, 8], [40, 10, 5], [56, 15, 7], [69, 11, 6], [86, 19, 9], [100, 9, 4],
   [216, 14, 7], [231, 10, 5], [247, 18, 9], [263, 12, 6], [279, 16, 8], [296, 11, 5], [310, 15, 7]]
    .forEach(([x, h, r], i) => umbrella(x, Math.round(near(x)) + 1 + (i % 2), h, r));

  // the dust underfoot, a few crater rims, and the basalt below
  for (let x = 0; x < W; x++) for (let y = GY; y < GY + 3; y++) k.put(x, y, hexes("#a9a7b0", "#94929c", "#7f7d88")[y - GY]);
  for (const cx of [34, 78, 240, 292]) for (let dx = -5; dx <= 5; dx++) {
    const rim = Math.abs(dx) >= 3 && Math.abs(dx) <= 5;
    if (rim) k.put(cx + dx, GY - 1, dx < 0 ? hex("#b8b6c0") : hex("#76747e"));
    else k.put(cx + dx, GY, hex("#6a6874"));
  }
  k.strata(hexes("#2a2932", "#33323c", "#3c3b46"), GY + 3, { seed: 29, thick: 8 });
  k.pebbles(46, GY, hex("#5a5866"), hex("#46454f"), hex("#24232b"), 31);
  twinkle(b, t, GY - 40, (x, y) => Math.hypot(x - 66, y - 92) < 90);
  return b;
}

/* -------------------------------- forest --------------------------------
 * Deep in an old wood in the late afternoon: rows of firs going back into
 * the green haze, broad oaks among them, two great firs close by, the low
 * sun coming through in long shafts, ferns on the floor and a bed of flowers
 * where the light lands. Every tree is grown, not stamped: conifers and
 * branching trees from the core, their foliage lit from the upper left and
 * hazed toward the colour of the air with distance.
 */
function forestStill() {
  const b = tall(), k = kit(b);
  // the sky between the crowns, warm low down where the sun is, cooler above
  k.bands(hexes("#2a4250", "#33525c", "#3f6466"), -EXT, 0);
  k.bands(hexes("#3f6466", "#56786c", "#7c9474", "#a8ae7e", "#cfc289"), 0, GY - 20, { pow: 0.9 });
  k.bands(hexes("#cfc289", "#b8b47e"), GY - 20, GY);

  const BARK = hexes("#231a19", "#33261f", "#4a3828", "#655036");
  const FIR = hexes("#0f2119", "#17301f", "#214226", "#2f5a2e", "#447238", "#5e8a42");
  const OAK = hexes("#18260f", "#243a16", "#33501c", "#476a24", "#62842e", "#80a03c");
  const AIR = hex("#8fa684");
  const fir = (x, h, rx, haze, seed) => P.conifer(b, { x, base: GY + 1, h, rx, cols: FIR, bark: BARK, haze, hazeCol: AIR, seed, width: 1 + h / 90 });
  const oak = (x, trunk, haze, seed, depth = 4) => P.branchTree(b, {
    x, base: GY + 1, trunk, width: 2 + trunk / 22, depth, spread: 0.55, up: 0.18, decay: 0.74, clumpR: [4, 8], tipClumps: 3,
    cols: OAK, bark: BARK, haze, hazeCol: AIR, seed, gaps: 0.08,
  });
  const r = P.rng(61);

  // far: a wall of firs, half lost in the haze
  for (let x = -6; x < W + 6; x += 10 + Math.floor(r() * 8)) fir(x, 150 + Math.floor(r() * 90), 15 + r() * 5, 0.6, 100 + x);
  // middle: taller firs and a few oaks, less hazed
  for (let x = 4; x < W; x += 20 + Math.floor(r() * 14)) {
    if (r() < 0.3) oak(x, 44 + Math.floor(r() * 16), 0.34, 200 + x, 5);
    else fir(x, 230 + Math.floor(r() * 110), 21 + r() * 6, 0.32, 300 + x);
  }

  // shafts of low sun from the upper left: flat light inside, a dithered rim only at the edge
  for (const [x0, w] of [[-10, 10], [52, 6], [196, 8], [244, 13]]) {
    for (let y = 90; y < GY; y++) {                                       // only under the crowns, never across open sky
      const cx = x0 + (y - 40) * 0.42;
      for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
        const d = Math.abs(x - cx) / (w / 2);
        if (d > 0.8 && P.bt(x, y) > 0.5) continue;
        k.put(x, y, mix(k.at(x, y), hex("#f0dc98"), d < 0.45 ? 0.2 : 0.11));
      }
    }
  }

  // near: two great firs and an old oak, sharp and dark against the light
  oak(56, 52, 0.06, 401, 5);
  oak(262, 46, 0.06, 402, 5);
  fir(8, 420, 34, 0.02, 403);
  fir(312, 400, 32, 0.02, 404);

  // the forest floor: moss and litter, the sunlit patch where the flowers are
  const MOSS = hexes("#2e4426", "#3c5a2c", "#4e7034", "#6a8a40");
  for (let x = 0; x < W; x++) for (let y = GY; y < GY + 3; y++) {
    const sun = x > 262 && x < 316;
    k.put(x, y, sun ? hexes("#8aa04a", "#6e8a3e", "#566e34")[y - GY] : MOSS[3 - (y - GY) - (P.hash(x, y, 9) < 0.3 ? 1 : 0)]);
  }

  // ferns: fronds arching out from a crown, leaflets along each
  const FERN = hexes("#2b4a25", "#3e6630", "#58843a", "#77a046");
  const fern = (x0, h, seed) => {
    const rr = P.rng(seed);
    for (let f = 0; f < 7; f++) {
      const ang = -Math.PI / 2 + (f - 3) * 0.42 + (rr() - 0.5) * 0.2, len = h * (0.7 + rr() * 0.4) * (1 - Math.abs(f - 3) * 0.08);
      for (let s = 0; s < len; s += 0.8) {
        const u = s / len, a = ang + (ang + Math.PI / 2) * u * 1.1;
        const x = x0 + Math.cos(a) * s, y = GY - 1 + Math.sin(a) * s + u * u * 3;
        k.put(x, y, FERN[1]);
        if (u > 0.1 && u < 0.92 && Math.floor(s) % 2 === 0) {
          const l = Math.round(2.5 * (1 - u) + 0.5);
          for (let j = 1; j <= l; j++) { k.put(x - j * 0.7, y - j * 0.5, FERN[f < 3 ? 3 : 2]); k.put(x + j * 0.7, y - j * 0.3, FERN[f < 3 ? 2 : 0]); }
        }
      }
    }
  };
  [[12, 14, 1], [34, 10, 2], [74, 16, 3], [98, 11, 4], [224, 13, 5], [250, 9, 6], [304, 12, 7]].forEach(([x, h, s]) => fern(x, h, s));

  // the flower bed in the sun
  const PETALS = hexes("#e88aa2", "#f2d46c", "#f1e9dc", "#ab8ad8", "#e8a058");
  for (let i = 0; i < 46; i++) {
    const x = 262 + Math.floor(P.hash(i, 1, 81) * 54), h = 2 + Math.floor(P.hash(i, 2, 81) * 6);
    for (let j = 1; j < h; j++) k.put(x, GY - j, FERN[2]);
    const c = PETALS[Math.floor(P.hash(i, 3, 81) * PETALS.length)];
    k.put(x, GY - h, c);
    if (P.hash(i, 4, 81) < 0.5) { k.put(x - 1, GY - h, c); k.put(x + 1, GY - h, c); }
  }

  // loam underneath, threaded with roots
  k.strata(hexes("#231a14", "#2b2018", "#33271d"), GY + 3, { seed: 67, thick: 10 });
  for (const x0 of [6, 13, 62, 66, 240, 246, 296, 300]) {
    let x = x0, y = GY + 3;
    for (let s = 0; s < 34; s++) { k.put(x, y, hex("#4a3a2a")); y++; x += Math.round((P.hash(x0, s, 5) - 0.5) * 2.2); }
  }
  k.pebbles(30, GY, hex("#5a4a3a"), hex("#433528"), hex("#2a2019"), 69);
  return b;
}
const forestCache = {};
/** Dust and seeds drifting down through the sun shafts: each mote sinks 16 px
 *  over a loop, brightest in the middle of its fall and gone at both ends. */
function forest(t = 0) {
  const key = DAY ? "day" : "night";
  if (!forestCache[key]) {
    const still = forestStill();
    if (!DAY) {
      nightGrade(still);
      // the moon, caught between the crowns high up, and a few stars where the sky shows
      const sk = kit(still);
      for (let y = -170; y <= -150; y++) for (let x = 140; x <= 160; x++) {
        const d = Math.hypot(x - 150, y + 160);
        if (d <= 5.5) sk.put(x, y, Math.hypot(x - 151.5, y + 161) < 1.3 ? hex("#cfd6d8") : hex("#eef2ea"));
        else if (d <= 9 && P.bt(x, y) < 0.5) sk.put(x, y, mix(P.unpack(still.get(x, y)), hex("#8aa0b8"), 0.4));
      }
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(P.hash(i, 1, 97) * W), y = -EXT + Math.floor(P.hash(i, 2, 97) * 200);
        const c = P.unpack(still.get(x, y));
        if (c[2] > 40 && c[1] < 70) sk.put(x, y, hex("#d8dcec"));         // only on open sky, not on leaves
      }
    }
    forestCache[key] = still;
  }
  const b = tall();
  b.px.set(forestCache[key].px);
  if (!DAY) {
    /* fireflies near the ground: each one drifts a little and glows for six
       frames of the sixteen, at its own time */
    for (let i = 0; i < 44; i++) {
      const ph = (t + Math.floor(P.hash(i, 1, 93) * LOOP)) % LOOP;
      if (ph >= 6) continue;
      const x = Math.round(4 + P.hash(i, 2, 93) * (W - 8) + 2 * Math.sin(cycle(t) + i));
      const y = Math.round(GY - 6 - P.hash(i, 3, 93) * 70 + 1.5 * Math.cos(cycle(t) + i * 2));
      const bright = ph >= 1 && ph <= 4;
      b.pset(x, y, bright ? hex("#f0f8a0") : hex("#a8b860"));
      if (bright) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.pset(x + dx, y + dy, mix(P.unpack(b.get(x + dx, y + dy)), hex("#c8dc70"), 0.35));
    }
    return b;
  }
  for (let i = 0; i < 70; i++) {
    const [x0, w] = [[-10, 10], [52, 6], [196, 8], [244, 13]][i % 4];
    const ph = (t + Math.floor(P.hash(i, 1, 91) * LOOP)) % LOOP;
    const y = 96 + Math.floor(P.hash(i, 2, 91) * (GY - 120)) + ph, cx = x0 + (y - 40) * 0.42 + (P.hash(i, 3, 91) - 0.5) * w;
    const a = Math.sin((ph / LOOP) * Math.PI);
    if (a < 0.3) continue;
    b.pset(Math.round(cx + Math.sin(ph * 0.4 + i)), y, mix(P.unpack(b.get(Math.round(cx), y)), hex("#fff2c4"), a > 0.8 ? 0.85 : 0.5));
  }
  return b;
}

/* --------------------------------- beach --------------------------------
 * A low sun over the sea: the sky warming to gold at the horizon, glitter
 * on the water under the sun, waves shoaling toward a white surf line, and
 * the tower standing in the sand above the tide. */
function beach(t = 0) {
  const b = tall(), k = kit(b);
  const HZ = 176, SHORE = 226;
  if (DAY) k.bands(hexes("#3c74b8", "#4880c0", "#568ec8", "#679ccf", "#7cabd5", "#93badb", "#abc8df", "#c2d6e2"), 0, HZ, { pow: 1.1 });
  else k.bands(hexes("#2c3a6c", "#3e4c82", "#5d5f94", "#8a6e98", "#bb7f8a", "#df9a7c", "#f2bd80", "#f8d898"), 0, HZ, { pow: 1.2 });
  if (!DAY) k.stars(18, 50, 91, hexes("#e8e4f4", "#b8acd0"));
  k.bands(DAY ? hexes("#2c5ea0", "#3468ac", "#3c74b8") : hexes("#1a2248", "#222c5a", "#2c3a6c"), -EXT, 0);
  if (!DAY) k.starsAbove(50, 93, hexes("#e8e4f4", "#b8acd0"));
  // the sun, half set, with a soft halo
  // the sun: half set at dusk; by day high on the left, white
  const SX = 64, SY = DAY ? 44 : HZ - 3, GLOW = DAY ? hex("#e4eef6") : hex("#ffd890");
  for (let y = SY - 16; y < Math.min(HZ, SY + 17); y++) for (let x = SX - 16; x <= SX + 16; x++) {
    const d = Math.hypot(x - SX, (y - SY) * 1.05);
    if (d <= (DAY ? 6.5 : 8.5)) k.put(x, y, d < (DAY ? 5 : 6) ? hex("#fff8e4") : DAY ? hex("#fff2c8") : hex("#ffe1a0"));
    else if (d <= 12) k.put(x, y, mix(k.at(x, y), GLOW, 0.35));
    else if (d <= 16 && P.bt(x, y) < 0.4) k.put(x, y, mix(k.at(x, y), GLOW, 0.2));
  }
  // long thin clouds lit from below
  for (const [cx, cy, len] of [[30, 118, 46], [118, 132, 38], [214, 104, 64], [292, 138, 44], [176, 154, 30]]) {
    for (let x = cx - len / 2; x <= cx + len / 2; x++) {
      const e = Math.abs(x - cx) / (len / 2), th = Math.round(2.6 * (1 - e * e) + P.noise(x * 0.3, cy, 3));
      for (let j = 0; j < th; j++) k.put(Math.round(x), cy - j, DAY ? (j === 0 ? hex("#cdd8e4") : hex("#f4f7fa")) : j === 0 ? hex("#f6b98a") : hex("#9a6e92"));
    }
  }
  // the sea, deeper blue toward the horizon, teal in the shallows
  const SEA = DAY ? hexes("#5a88bc", "#4a7eb2", "#3f78a8", "#3c80a2", "#44929e", "#5aa8a6") : hexes("#4a6296", "#3d5a88", "#36597e", "#346279", "#3a7280", "#4a8a8c");
  k.bands(SEA, HZ, SHORE, { pow: 0.9, strip: 0.1 });
  // wave crests: short light dashes, further apart as they come closer
  // they slide along, one pixel a frame, each row repeating every 16 px so the loop closes; alternate rows run the other way
  for (let y = HZ + 2, gap = 2, row = 0; y < SHORE - 4; y += gap, gap = Math.min(7, gap + 0.6), row++) {
    const yy = Math.round(y), len = Math.min(9, 2 + Math.round((yy - HZ) / 10)), a = Math.floor(P.hash(yy, 1, 3) * 16);
    const shift = row % 2 ? t : -t;
    for (let x0 = -16; x0 < W + 16; x0 += 16) for (let i = 0; i < len; i++) {
      const x = x0 + ((((a + shift) % 16) + 16) % 16) + i;
      if (P.hash(x0, yy, 4) < 0.3) continue;                                  // a gap now and then, so it isn't a ruled line
      k.put(x, yy, mix(k.at(x, yy), hex("#b6d2dc"), 0.55));
    }
  }
  // the sun's glitter path, widening toward the shore
  for (let y = HZ; y < SHORE - 2; y++) {
    const half = 5 + (y - HZ) * 0.42;
    for (let x = Math.floor(SX - half); x <= SX + half; x++) {
      const h = P.hash(x, y, 77 + (t >> 1));                                // the glitter changes every other frame
      if (h < (DAY ? 0.08 : 0.16) * (1 - Math.abs(x - SX) / half)) { k.put(x, y, DAY ? hex("#f4f8fa") : hex("#ffe8b0")); if (h < 0.05) k.put(x + 1, y, DAY ? hex("#d8eaf2") : hex("#ffd590")); }
    }
  }
  // the surf: a white line breaking up, then wet sand that shines
  for (let x = 0; x < W; x++) {
    // the surf breathes in and out a pixel or two over the loop
    const edge = SHORE - 2 + Math.round(1.6 * Math.sin(x * 0.07) + P.noise(x * 0.2, 1, 5) * 1.5 + 1.2 * Math.sin(cycle(t) + x * 0.02));
    for (let y = edge - 2; y <= edge; y++) k.put(x, y, y === edge ? hex("#f2f4f2") : P.hash(x, y, 8) < 0.5 ? hex("#cfe0e4") : hex("#a8c8d0"));
    for (let y = edge + 1; y < edge + 4; y++) k.put(x, y, y === edge + 1 ? hex("#9c8a70") : hex("#b39a74"));
    for (let y = edge + 4; y < GY; y++) k.put(x, y, hexes("#cdb183", "#d8bd8c", "#e2c996")[P.band((y - edge - 4) / (GY - edge - 4), 3, x, y, 0.2)]);
  }
  // sand ripples and shells, the dry sand, then layered sand below
  for (let x = 0; x < W; x++) {
    for (let y = GY; y < GY + 3; y++) k.put(x, y, hexes("#e6cd9a", "#d4b886", "#c2a474")[y - GY]);
    if ((x + Math.round(2 * Math.sin(x * 0.2))) % 7 === 0) k.put(x, GY - 3, hex("#c9ad7e"));
  }
  for (const [x, y, c] of [[30, GY - 1, "#f4e4d4"], [86, GY - 2, "#e8a58a"], [238, GY - 1, "#f4e4d4"], [276, GY - 4, "#d9927a"], [304, GY - 1, "#efd8c2"]]) {
    k.put(x, y, hex(c)); k.put(x + 1, y, hex(c)); k.put(x, y - 1, mix(hex(c), hex("#ffffff"), 0.4));
  }
  k.strata(hexes("#6a5638", "#776243", "#836d4c"), GY + 3, { seed: 71, thick: 8 });
  k.pebbles(36, GY, hex("#a08a68"), hex("#7a6648"), hex("#56452f"), 73);
  if (!DAY) twinkle(b, t, 70, (x, y) => Math.hypot(x - 64, y - 173) < 20);
  return b;
}

/* --------------------------------- city ---------------------------------
 * An abandoned city at dusk: towers in two rows, a few windows still lit,
 * cars stopped where they were left, and a patrolling eye hanging over the
 * street, sweeping it with a red beam. */
function city(t = 0) {
  const b = tall(), k = kit(b);
  if (DAY) {                                                                // a hazy pale day over the empty streets
    k.bands(hexes("#6f88a8", "#7c94b0", "#8aa0b8", "#99acbf", "#a8b6c4", "#b7c0c6", "#c4c6c4"), 0, GY, { pow: 1.1 });
    k.bands(hexes("#5c779c", "#6680a2", "#6f88a8"), -EXT, 0);
  } else {
    k.bands(hexes("#1b1832", "#272242", "#3a2c50", "#553a5a", "#784a5e", "#9c5c5e", "#bc7460"), 0, GY, { pow: 1.15 });
    k.stars(20, 60, 101, hexes("#d8d4e8", "#a8a0c0"));
    k.bands(hexes("#100e20", "#161429", "#1b1832"), -EXT, 0);
    k.starsAbove(40, 103, hexes("#d8d4e8", "#a8a0c0"));
  }

  const r = P.rng(103);
  const building = (x, w, top, body, edge, win, lit, seed) => {
    for (let y = top; y < GY; y++) for (let i = 0; i < w; i++) k.put(x + i, y, i === 0 ? edge : body);
    // windows on a grid; most dark, some lit, a few broken
    for (let y = top + 3; y < GY - 3; y += 4) for (let i = 2; i < w - 2; i += 3) {
      const h = P.hash(x + i, y, seed);
      k.put(x + i, y, h < lit ? win : h < lit + 0.06 ? mix(win, body, 0.6) : mix(body, hex("#000000"), 0.25));
    }
    if (P.hash(x, top, seed) < 0.5) for (let j = 1; j < 6; j++) k.put(x + Math.floor(w / 2), top - j, edge);   // an aerial
    else { k.put(x + 2, top - 1, body); k.put(x + 3, top - 1, body); k.put(x + 2, top - 2, body); k.put(x + 3, top - 2, body); }  // a water tank
  };
  // the far row: hazed, many small lights
  for (let x = -6; x < W;) { const w = 10 + Math.floor(r() * 14); building(x, w, GY - 50 - Math.floor(r() * 70), DAY ? hex("#8592a4") : hex("#4d3a5c"), DAY ? hex("#97a3b4") : hex("#5c4668"), DAY ? hex("#a4aebc") : hex("#c9946a"), DAY ? 0.02 : 0.12, 1); x += w + Math.floor(r() * 3); }
  // the near row: darker, taller, warmer windows
  for (let x = -4; x < W;) {
    const w = 14 + Math.floor(r() * 16);
    if (x + w < 118 || x > 202) building(x, w, GY - 40 - Math.floor(r() * 110), DAY ? hex("#4c5464") : hex("#231d30"), DAY ? hex("#626b7c") : hex("#3a2e44"), DAY ? hex("#8a96a8") : hex("#f0c070"), DAY ? 0.03 : 0.08, 2);
    x += w + 4 + Math.floor(r() * 8);
  }

  // street lamps, dark but for one that still burns
  const flicker = DAY || t === 3 || t === 4 || t === 9;                     // the one that burns is failing (and by day, off)
  for (const [x, lit] of [[96, true], [226, false]]) {
    const on = lit && !flicker;
    for (let y = GY - 26; y < GY; y++) k.put(x, y, hex("#2a2530"));
    k.put(x + 1, GY - 26, hex("#2a2530")); k.put(x + 2, GY - 26, hex("#2a2530")); k.put(x + 2, GY - 25, on ? hex("#ffe2a0") : hex("#3e3844"));
    if (on) for (let y = GY - 24; y < GY; y++) { const half = (y - (GY - 24)) * 0.4; for (let xx = Math.floor(x + 2 - half); xx <= x + 2 + half; xx++) if (P.bt(xx, y) < 0.5) k.put(xx, y, mix(k.at(xx, y), hex("#ffd890"), 0.12)); }
  }

  // the road, then stopped cars on it
  for (let x = 0; x < W; x++) {
    for (let y = GY; y < GY + 6; y++) k.put(x, y, y === GY ? hex("#5a5460") : y === GY + 3 && (x % 10) < 5 ? hex("#8a7a4a") : hex("#2d2a33"));
  }
  const car = (x, body, dir) => {
    const shape = [
      "....xxxxxxxx....",
      "...xggggggggx...",
      "..xgggg.ggggx...",
      "xxxxxxxxxxxxxxxx",
      "xLxxxxxxxxxxxxxx",
      "xxxxxxxxxxxxxxxx",
      ".ww.........ww..",
    ];
    const dark = mix(body, hex("#000000"), 0.45), lit = mix(body, hex("#ffffff"), 0.18);
    shape.forEach((row, j) => [...row].forEach((ch, i) => {
      const xx = dir > 0 ? x + i : x + 15 - i, y = GY - 7 + j;
      if (ch === "x") k.put(xx, y, j === 3 ? lit : j === 5 ? dark : body);
      else if (ch === "g") k.put(xx, y, i < 6 ? hex("#6a6a82") : hex("#3a3a50"));
      else if (ch === "L") k.put(xx, y, hex("#c8b890"));
      else if (ch === "w") k.put(xx, y, hex("#141218"));
    }));
  };
  car(8, hex("#7a3a36"), 1); car(56, hex("#2f5a62"), -1); car(232, hex("#8a6a34"), 1); car(284, hex("#4a4a6a"), -1);

  // under the street: concrete, a sewer, cables
  k.strata(hexes("#2c2a30", "#34323a", "#3d3a42"), GY + 6, { seed: 107, thick: 7 });
  for (const [cx, cy] of [[48, GY + 30], [274, GY + 34]]) {
    for (let y = cy - 9; y <= cy + 9; y++) for (let x = cx - 9; x <= cx + 9; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= 7) k.put(x, y, y > cy + 4 ? hex("#2a4048") : hex("#121016"));
      else if (d <= 9) k.put(x, y, x < cx ? hex("#5a5660") : hex("#45414c"));
    }
  }
  for (const y of [GY + 14, GY + 16]) for (let x = 0; x < W; x++) if (x < 118 || x > 202) k.put(x, y + Math.round(Math.sin(x * 0.05)), y === GY + 14 ? hex("#7a4a3a") : hex("#3a4a5a"));
  if (!DAY) twinkle(b, t, 50);
  return b;
}

/* --------------------------------- space --------------------------------
 * Out in deep space: a painted nebula, an asteroid belt crossing the dark,
 * an ocean world turning nearby, and the tower floating in it, cellar
 * and all, with a few stones that came through the gate with it. */
function space(t = 0) {
  const b = tall(), k = kit(b);
  k.bands(hexes("#05040b", "#08071a", "#0b0a22"), -EXT, H, { pow: 1 });
  // the nebula: two clouds of colour in flat steps, brightest at their hearts
  const NEB = [hexes("#1e1236", "#3a1a4e", "#6a2a66", "#a8487a", "#e08a92"), hexes("#0e1a32", "#123048", "#1c4e5e", "#2e7a7a", "#6ab8a8")];
  for (let y = -EXT; y < H; y++) for (let x = 0; x < W; x++) {
    const a = P.fbm(x * 0.014, y * 0.022, 4, 111) + 0.35 * Math.exp(-(((x - 70) / 110) ** 2 + ((y - 70) / 70) ** 2)) - 0.62;
    const c = P.fbm(x * 0.018 + 9, y * 0.018, 4, 113) + 0.3 * Math.exp(-(((x - 260) / 90) ** 2 + ((y - 180) / 80) ** 2)) - 0.64;
    const fade = 1;
    if (a * fade > 0.02) k.put(x, y, NEB[0][P.band(Math.min(0.85, a * fade * 2.2), 5, x, y, 0.25)]);
    else if (c * fade > 0.02) k.put(x, y, NEB[1][P.band(Math.min(0.85, c * fade * 2.2), 5, x, y, 0.25)]);
  }
  k.stars(160, H, 117, hexes("#f0eef8", "#b8b4d8", "#8884b0", "#f2d8b8", "#a8d0e8"));
  k.starsAbove(110, 119, hexes("#f0eef8", "#b8b4d8", "#8884b0", "#a8d0e8"));
  for (const [x, y] of [[40, 30], [224, 18], [300, 120], [16, 200], [252, 260], [100, 150]]) k.twinkle(x, y, hex("#ffffff"), hex("#9a94c8"));

  // the ocean world, lit from the left, with an atmosphere's thin edge
  k.sphere(266, 74, 26, (nx, ny, lum, x, y) => {
    const cloud = P.loopNoise(y * 0.32, x * 0.14 + ny * 4, t, LOOP, 0.06, 3, 121) > 0.6;    // its clouds drift round, slowly
    const step = P.band(lum, 5, x, y, 0.2);
    const base = cloud ? hexes("#1a2240", "#4a5a7a", "#9aa8c0", "#d8e0ea", "#f6f8fa")[step] : hexes("#081430", "#0e2a5a", "#1a4a86", "#2a6aa8", "#4a90c4")[step];
    return base;
  });
  for (let a = 1.75; a < 4.55; a += 0.01) k.put(Math.round(266 + Math.cos(a) * 26.5), Math.round(74 + Math.sin(a) * 26.5), hex("#6ab0e0"));   // the lit limb

  // the asteroid belt: a band of rocks across the sky, thick in the middle
  const belt = (x) => 196 - x * 0.2;
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(P.hash(i, 1, 131) * W), off = (P.hash(i, 2, 131) + P.hash(i, 3, 131) - 1) * 22, y = Math.round(belt(x) + off);
    const s = P.hash(i, 4, 131) < 0.12 ? 3 : P.hash(i, 4, 131) < 0.4 ? 2 : 1;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      if (s === 3 && (dx + dy === 0 || dx + dy === 4)) continue;
      k.put(x + dx, y + dy, dx === 0 || dy === 0 ? hex("#8a7a6e") : hex("#4a3e3a"));
    }
  }

  // nothing underfoot: the tower floats, cellar and all, with a few stones that came with it
  const ROCK = hexes("#2a1e22", "#46342e", "#6e5446", "#8a6c56");
  for (const [cx, cy, rr, turf] of [[44, 226, 6, true], [288, 214, 4, true], [110, 262, 2.5, false], [214, 276, 3, false], [122, 292, 1.6, false], [200, 252, 1.6, false], [86, 286, 2, false]]) {
    k.sphere(cx, cy, rr, (nx, ny, lum, x, y) => ROCK[P.band(lum, 4, x, y, 0.2)]);
    if (turf) for (let x = cx - rr + 1; x < cx + rr; x++) k.put(x, cy - rr + 1, hex("#4a663c"));
  }
  twinkle(b, t, H, (x, y) => Math.hypot(x - 266, y - 74) < 30);
  // a shooting star, once a loop, high on the left
  if (t >= 4 && t < 10) {
    const s0 = t - 4, hx = 14 + s0 * 13, hy = -60 + s0 * 5;
    for (let j = 0; j < 9; j++) b.pset(hx - j * 2, hy - Math.round(j * 0.8), mix(P.unpack(b.get(hx - j * 2, hy - Math.round(j * 0.8))), hex("#fff6e0"), (1 - j / 9) * (1 - s0 / 7)));
  }
  return b;
}

/* --------------------------------- rain ---------------------------------
 * A town in the rain at night: low cloud, a castle lit on its hill,
 * steep roofs and warm windows, carts left out on the wet cobbles, and the
 * rain itself, falling slant across everything. */
/* The rain town's colours, by night and by day. By day it is a wet
   afternoon: a pale silver sky, plaster houses under dark terracotta, a
   green-grey hill, the castle in slate, windows mostly dark, the cobbles
   shining with the sky. Each is painted, not the night picture lightened. */
const RAIN_PAL = {
  night: {
    sky: hexes("#11141f", "#161b29", "#1c2333", "#232b3d", "#2c3446", "#383c4c"), above: hexes("#161b28", "#11141f"),
    cloud: { lit: hex("#3a3a4c"), dense: hex("#1a1f2c"), mid: hex("#242a3a") },
    hill: [hex("#333a4c"), hex("#2c3344"), hex("#252b3a")],
    cas: hex("#3c4256"), casDark: hex("#2e3446"), casEdge: hex("#4a5064"), keepRoof: hex("#4a3a44"),
    win: hex("#e6b060"), winLow: hex("#b88448"), winDark: null, lit: 0.45,
    roof: hexes("#2a2230", "#3a2e38"), wall: hexes("#2a3040", "#323a4c"), chimney: hex("#3a3036"),
    lantern: true, cobble: [hex("#1a1c24"), hex("#5a6072"), hex("#454b5c"), hex("#3a3f4e")], puddle: hex("#a88a5a"),
    wood: hexes("#5a3e2a", "#46301f", "#33231a"), earth: hexes("#22202a", "#2a2732", "#322e3a"), stones: [hex("#5a5666"), hex("#45414f"), hex("#24222b")],
    drop: hex("#9aaac4"), splash: [hex("#8a98b0"), hex("#6a7890")],
  },
  day: {
    sky: hexes("#8b95a3", "#959fab", "#a0a9b3", "#abb3ba", "#b6bcc0", "#c0c4c4"), above: hexes("#7e8999", "#858f9d"),
    cloud: { lit: hex("#c2c7cc"), dense: hex("#848d9a"), mid: hex("#949ca8") },
    hill: [hex("#8a9a8c"), hex("#7b8c80"), hex("#6d7e74")],
    cas: hex("#9a9ca2"), casDark: hex("#888a92"), casEdge: hex("#acaeb4"), keepRoof: hex("#6e5258"),
    win: hex("#4e5868"), winLow: hex("#3e4654"), winDark: true, lit: 0.5,
    roof: hexes("#7a4438", "#90543f"), wall: hexes("#c2b39a", "#d2c4aa"), chimney: hex("#6c4a40"),
    lantern: false, cobble: [hex("#585c62"), hex("#a6acb2"), hex("#8a9098"), hex("#7c828a")], puddle: hex("#c2cad2"),
    wood: hexes("#8a6440", "#6e4e32", "#543a26"), earth: hexes("#4e443c", "#5a4e44", "#665848"), stones: [hex("#8e8478"), hex("#746a60"), hex("#4a423a")],
    drop: hex("#5a6878"), splash: [hex("#d8dee4"), hex("#b4bcc4")],
  },
};

function rain(t = 0, drops = false) {
  const b = tall(), k = kit(b), C = DAY ? RAIN_PAL.day : RAIN_PAL.night;
  k.bands(C.sky, 0, GY, { pow: 1.1 });

  // one field of cloud from the top of the sky down, thickening upward into a full overcast
  const cloud = (x, y) => P.fbm(x * 0.02, y * 0.05, 3, 151) - Math.max(y, -16) / 260;     // no thicker than this, so it keeps its texture all the way up
  k.bands(C.above, -EXT, 0);
  for (let y = -EXT; y < 120; y++) for (let x = 0; x < W; x++) {
    const v = cloud(x, y);
    if (v < 0.4) continue;
    const under = v - cloud(x, y + 3);
    k.put(x, y, under > 0.02 ? C.cloud.lit : v > 0.55 ? C.cloud.dense : C.cloud.mid);
  }

  // the hill and the castle on it, far and hazed
  const hill = (x) => GY - 8 - 70 * Math.exp(-(((x - 52) / 46) ** 2)) - 4 * P.fbm(x * 0.1, 1, 2, 153);
  k.range(hill, GY, C.hill[0], C.hill[1], C.hill[2], 0.3);
  const block = (x0, x1, top, crenel) => {
    for (let x = x0; x <= x1; x++) for (let y = top; y < hill(x) + 2; y++) k.put(x, y, x === x0 ? C.casEdge : x > x1 - 2 ? C.casDark : C.cas);
    if (crenel) for (let x = x0; x <= x1; x += 2) k.put(x, top - 1, C.cas);
  };
  block(30, 72, 132, true);                                      // the curtain wall
  block(26, 34, 114, true); block(66, 75, 110, true);            // two towers
  block(46, 56, 100, false);                                      // the keep, with a pointed roof
  for (let j = 0; j < 10; j++) for (let x = 46 + Math.ceil(j * 0.55); x <= 56 - Math.ceil(j * 0.55); x++) k.put(x, 99 - j, j < 9 ? C.keepRoof : C.casDark);
  for (const [x, y] of [[29, 120], [50, 106], [52, 112], [69, 116], [40, 138], [60, 140]]) { k.put(x, y, C.win); k.put(x, y + 1, C.win); }

  // the town: steep roofs with chimneys; windows lit at night, dark glass by day
  const house = (x, w, h) => {
    const base = GY, top = base - h, peak = Math.ceil(w / 2) + 2;
    for (let y = top; y < base; y++) for (let i = 0; i < w; i++) k.put(x + i, y, i === 0 ? C.wall[1] : C.wall[0]);
    for (let j = 0; j < peak; j++) for (let i = j - 1; i <= w - j; i++) k.put(x + i, top - 1 - j, i < w / 2 ? C.roof[1] : C.roof[0]);
    k.put(x + w - 4, top - peak + 1, C.roof[0]); for (let j = 0; j < 4; j++) k.put(x + w - 4, top - peak - j + 2, C.chimney);    // a chimney
    for (let y = top + 3; y < base - 3; y += 6) for (let i = 2; i < w - 2; i += 4) if (P.hash(x + i, y, 157) < C.lit) {
      const warm = C.winDark && P.hash(x + i, y, 158) < 0.12;                // by day, one window in a few still has a lamp on
      k.put(x + i, y, warm ? hex("#e8c07a") : C.win); k.put(x + i + 1, y, warm ? hex("#e8c07a") : C.win);
      k.put(x + i, y + 1, warm ? hex("#c89a5a") : C.winLow); k.put(x + i + 1, y + 1, warm ? hex("#c89a5a") : C.winLow);
    }
  };
  const r = P.rng(159);
  for (let x = -6; x < W;) { const w = 12 + Math.floor(r() * 9); if (x + w < 116 || x > 204) house(x, w, 16 + Math.floor(r() * 18)); x += w + 2 + Math.floor(r() * 4); }

  // a lantern by a door, its glow on the wet (by day: unlit, a dark iron box)
  for (const [x, y, i] of [[100, GY - 14, 0], [214, GY - 12, 1]]) {
    if (!C.lantern) { k.put(x, y, hex("#3a3a40")); k.put(x, y + 1, hex("#2c2c32")); continue; }
    const low = (t + i * 7) % 8 === 0;                                     // the flame gutters now and then
    k.put(x, y, low ? hex("#e8b060") : hex("#ffe2a0")); k.put(x, y + 1, hex("#e8a050"));
    if (low) continue;
    for (let yy = y - 6; yy < y + 7; yy++) for (let xx = x - 6; xx <= x + 6; xx++) if (Math.hypot(xx - x, yy - y) < 6 && P.bt(xx, yy) < 0.5 && !(xx === x && (yy === y || yy === y + 1))) k.put(xx, yy, mix(k.at(xx, yy), hex("#ffcc80"), 0.14));
  }

  // cobbles, wet and shining
  for (let x = 0; x < W; x++) for (let y = GY; y < GY + 5; y++) {
    const row = y - GY, cx = (x + (row % 2) * 3) % 6;
    k.put(x, y, cx === 0 ? C.cobble[0] : row === 0 ? C.cobble[1] : cx < 3 ? C.cobble[2] : C.cobble[3]);
  }
  for (const x of [100, 214, 29, 50]) for (let y = GY; y < GY + 5; y++) if (P.bt(x, y) < 0.6) k.put(x, y, C.puddle);   // light caught in puddles

  // carts left out: a box on two spoked wheels, shafts down on the stones
  const cart = (x, dir) => {
    const WOOD = C.wood;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 6; j++) k.put(x + i, GY - 12 + j, j === 0 ? WOOD[0] : i % 4 === 0 ? WOOD[2] : WOOD[1]);
    for (let i = 0; i < 12; i++) k.put(dir > 0 ? x + 16 + i : x - 1 - i, GY - 7 + Math.round(i * 0.55), WOOD[2]);
    const wx = x + 8, wy = GY - 5;
    b.ring(wx, wy, 3.6, 1, WOOD[2], 1);
    for (const [dx, dy] of [[0, -3], [0, 3], [-3, 0], [3, 0], [0, 0]]) k.put(wx + dx, wy + dy, WOOD[0]);
  };
  cart(28, 1); cart(252, -1);

  // below: old stone and earth
  k.strata(C.earth, GY + 5, { seed: 161, thick: 8 });
  k.pebbles(40, GY, C.stones[0], C.stones[1], C.stones[2], 163);

  // the rain, slanting, across the whole scene (on the site the page draws it falling; this is for still pictures)
  if (drops) for (let i = 0; i < 1500; i++) {
    const x0 = Math.floor(P.hash(i, 1, 171) * (W + 40)) - 20, y0 = Math.floor(P.hash(i, 2, 171) * (GY + EXT)) - EXT;
    const len = 3 + Math.floor(P.hash(i, 3, 171) * 3);
    for (let j = 0; j < len; j++) { const x = x0 + Math.floor((y0 + j) / 3) - Math.floor(y0 / 3), y = y0 + j; if (y < GY) k.put(x, y, mix(k.at(x, y), C.drop, j === len - 1 ? 0.5 : 0.3)); }
  }
  // splashes: a different few every frame
  for (let i = 0; i < 40; i++) { const x = Math.floor(P.hash(i, 5, 171 + t) * W); k.put(x, GY - 1, C.splash[0]); k.put(x - 1, GY - 2, C.splash[1]); k.put(x + 1, GY - 2, C.splash[1]); }
  return b;
}


/* The city's watcher, on its own: a 64×64 sprite for each frame of its loop,
   looking left (dir -1) or right (dir 1). The page flies it slowly round
   the tower, always looking at it; the city picture itself has no eye. */
function eye(t = 0, dir = -1) {
  const b = new P.Buf(64, 64), k = kit(b);
  /* The watcher, as in the 3D city: a riveted metal eyeball between two
     armoured lids, an amber iris with a black pupil and a coal inside it,
     a catchlight on the cornea, and three rusted rings turning round it on
     their own tilted axes, all in a faint orange halo. It looks down and
     left, at the tower. */
  const EX = 32, EY = 32, ER = 13;
  for (let y = EY - 26; y <= EY + 26; y++) for (let x = EX - 26; x <= EX + 26; x++) {      // the halo, three flat steps
    const d = Math.hypot(x - EX, y - EY);
    if (d > 25) continue;
    const a = d < 16 ? 0.16 : d < 21 ? 0.1 : P.bt(x, y) < 0.5 ? 0.06 : 0;
    if (a) k.put(x, y, ((Math.round(a * 255) << 24) | (0x2e << 16) | (0x60 << 8) | 0xc8) >>> 0);   // see-through, over whatever sky it crosses
  }
  // the rings: circles in 3D, tilted, drawn as their back halves then (after the ball) their front halves
  const RINGS = [
    // tipped back no further than keeps each one clear of the ball, so none crosses the eye
    { r: 16, ax: 0.42, az: 0.5, spin: 1, col: hexes("#a0582a", "#7a4018", "#4a2610") },
    { r: 18.5, ax: 0.68, az: -0.75, spin: -1, col: hexes("#8a5236", "#62361f", "#3c2016") },
    { r: 21, ax: 0.8, az: 0.12, spin: 1, col: hexes("#7a6448", "#544232", "#30281e") },
  ];
  const ringPts = (R) => {
    const pts = [];
    for (let t = 0; t < Math.PI * 2; t += 0.012) {
      let x = Math.cos(t) * R.r, y = Math.sin(t) * R.r, z = 0;
      [y, z] = [y * Math.cos(R.ax), y * Math.sin(R.ax)];                     // tip it back
      const az = R.az + R.spin * Math.PI * (t / LOOP);                     // turning: half a turn a loop brings an ellipse back to itself
      [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];   // and round
      pts.push({ x: Math.round(EX + x), y: Math.round(EY + y), z, lit: x < -R.r * 0.3 || y < -R.r * 0.5 });
    }
    return pts;
  };
  // each ring is traced into a mask and thinned to a clean one-pixel line before it is coloured
  const RW = 56, RO = [EX - RW / 2, EY - RW / 2];
  const rings = RINGS.map((R) => {
    const m = new Uint8Array(RW * RW), info = new Map();
    for (const p of ringPts(R)) {
      const i = (p.y - RO[1]) * RW + (p.x - RO[0]);
      m[i] = 1;
      if (!info.has(i)) info.set(i, p);
    }
    return { R, m: P.pixelPerfect(m, RW, RW), info };
  });
  const drawRings = (front) => {
    for (const { R, m, info } of rings) for (const [i, p] of info) {
      if (!m[i] || (p.z > 0) !== front) continue;
      if (!front && Math.hypot(p.x - EX, p.y - EY) < ER + 0.5) continue;
      k.put(p.x, p.y, front ? (p.lit ? R.col[0] : R.col[1]) : R.col[2]);
    }
  };
  drawRings(false);
  // the ball: grimy grey plate with seams, lit from the left, a hot rim from the city below
  const GAZE = [dir * 0.36 + 0.07 * Math.sin(cycle(t)), 0.2 + 0.04 * Math.sin(cycle(t, 2))];   // it looks about, a little
  const shut = t === 11 ? 0.45 : t === 12 ? 0 : 1;                                         // and blinks once a loop                                                 // where the iris sits on the face: toward the tower, a little down
  const SHELL = hexes("#1c1a1e", "#2c292c", "#403b3c", "#57514f", "#6e6762");
  const IRIS = hexes("#3a1606", "#6e300e", "#a85618", "#dc8a2a", "#f6be5a");
  k.sphere(EX, EY, ER, (nx, ny, lum, x, y) => {
    const ix = (nx - GAZE[0]) / 0.9, iy = (ny - GAZE[1]) / 0.95, ir = Math.hypot(ix, iy);    // the iris, foreshortened on the curve
    // the lids leave an almond open around the gaze; the rest is armour
    const open = shut * 0.56 * Math.sqrt(Math.max(0, 1 - ((nx - GAZE[0]) / 1.25) ** 2)), dy = Math.abs(ny - GAZE[1]);
    if (dy > open) {
      if (dy < open + 0.13) return hex("#141214");                                         // the lash ridge
      const band = Math.floor((Math.abs(ny) - 0.5) * 9) % 2;                               // overlapping plates
      return SHELL[Math.min(4, P.band(lum, 4, x, y, 0.2) + band)];
    }
    if (ir < 0.5) {
      if (ir < 0.17) return ir < 0.07 ? hex("#c8401a") : hex("#0a0808");                   // the pupil, a coal deep in it
      if (ir > 0.43) return hex("#2a1006");                                                 // the limbal ring
      const fibre = P.hash(Math.round(Math.atan2(iy, ix) * 4), 0, 9) < 0.3 ? -1 : 0;       // a few darker fibres
      return IRIS[Math.max(0, Math.min(4, 4 - Math.floor((ir - 0.17) * 13) + fibre))];      // brighter toward the pupil
    }
    if (dy > open - 0.1) return SHELL[0];                                                   // the white's shadow under the lid
    const seam = Math.abs(((Math.atan2(nx, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))) * 4.7 / Math.PI) % 1 + 1) % 1 - 0.5) > 0.42;
    let step = P.band(lum, 5, x, y, 0.2) - (seam ? 1 : 0);
    if (ny > 0.55 && nx > -0.2) step = Math.max(step, 2);                                   // the city's glow underneath
    return SHELL[Math.max(0, Math.min(4, step))];
  });
  // the catchlight, and the rim lit warm from below
  const cx0 = Math.round(EX + (GAZE[0] - 0.24) * ER), cy0 = Math.round(EY + (GAZE[1] - 0.22) * ER);
  if (shut > 0.5) { k.put(cx0, cy0, hex("#fff6e4")); k.put(cx0 + 1, cy0, hex("#f2d8b0")); k.put(cx0, cy0 + 1, hex("#f2d8b0")); }
  for (let a = 0.35; a < 2.8; a += 0.03) k.put(Math.round(EX + Math.cos(a) * (ER - 0.4)), Math.round(EY + Math.sin(a) * (ER - 0.4)), hex("#9a5a3a"));
  drawRings(true);

  return b;
}

const WORLDS = { seafloor, moon, forest, beach, city, space, rain };

/** A world with the tower in it, for previews. */
function withTower(bg) {
  const tw = T.render(-1), b = new P.Buf(W, bg.h);
  b.px.set(bg.px);
  const top = bg.h - H;
  for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) { const c = tw.px[y * T.W + x]; if (c >>> 24) b.px[(y + OY + top) * W + x + OX] = c; }
  return b;
}

/* The home dusk, carried on upward: the night deepens, more stars. */
const homeLand = {};
function homeTall(t = 0) {
  const b = tall(), k = kit(b), key = DAY ? "day" : "night", land = homeLand[key] ?? (homeLand[key] = home(1, DAY));
  b.px.set(land.px, EXT * W);
  if (DAY) { k.bands(hexes("#2f62a6", "#3769ae", "#3f76ba"), -EXT, 0); return b; }
  k.bands(hexes("#111226", "#15162e", "#191a36"), -EXT, 0);
  k.starsAbove(60, 131, hexes("#e8e4f4", "#b8acd0", "#8f88b0"));
  twinkle(b, t, 110, (x, y) => Math.hypot(x - 242, y - 34) < 12);
  return b;
}
/* the day pictures: the worlds whose light changes with the hour */
const DAYS = { home: byDay(homeTall), beach: byDay(beach), rain: byDay(rain), forest: byDay(forest), seafloor: byDay(seafloor) };   // never the city: it is always night there
module.exports = { WORLDS, DAYS, withTower, homeTall, eye, EXT, LOOP };

if (require.main === module) {
  const only = process.argv[2];
  const list = only ? [[only, WORLDS[only]()]] : [["home", homeTall()], ...Object.entries(WORLDS).map(([k, f]) => [k, k === "rain" ? f(0, true) : f()])];
  P.save(P.sheet(list.map(([k, bg]) => ({ buf: withTower(bg), label: k.toUpperCase(), scale: only ? 3 : 2 })), { cols: only ? 1 : 4 }),
    __dirname + `/preview/worlds${only ? "-" + only : ""}.png`);
  if (!only) P.save(P.sheet(Object.entries(DAYS).map(([k, f]) => ({ buf: withTower(k === "rain" ? f(0, true) : f(0)), label: k.toUpperCase() + " BY DAY", scale: 2 })), { cols: 4 }),
    __dirname + "/preview/worlds-day.png");
  for (const [k, bg] of list) console.log(k, "colours:", P.colorCount(bg).length);
}
