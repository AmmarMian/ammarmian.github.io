// Isometric voxel room, ray-marched at low resolution.
//
// One fragment = one art pixel. The primary ray is orthographic (fixed 2:1
// dimetric camera) and walks the voxel grid with a DDA; sun shadows, water
// refraction and the light shafts are all derived from the same grid, so the
// generator in room.ts is the only description of the room.

struct Params {
  center: vec3f,
  time: f32,
  dims: vec3f,     // room size in voxels
  zoom: f32,
  res: vec2f,
  nWin: f32,
  nLights: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> vox: array<u32>;
// windows (z0, z1, y0, y1) first, then lights as (pos, radius), (colour, 0) pairs
@group(0) @binding(2) var<storage, read> roomData: array<vec4f>;

const H: i32 = 80;
const WATER_Y: f32 = 8.6;
const WALL_T: f32 = 6.0;
const WALL_TOP: f32 = 73.0;

const M_POOLBED: u32 = 10u;
const M_LILY: u32 = 11u;
const M_LANTERN: u32 = 18u;
const M_CRYSTAL: u32 = 19u;
const M_SHROOM: u32 = 25u;
const M_DARK: u32 = 26u;

// camera: yaw 45, pitch 30 (2:1 pixel lines)
const CAM_D = vec3f(-0.61237244, -0.5, -0.61237244);
const CAM_R = vec3f(0.70710678, 0.0, -0.70710678);
const CAM_U = vec3f(-0.35355339, 0.8660254, -0.35355339);

// towards the sun, which comes in through the windows of the x = 0 wall
const SUN_L = vec3f(-0.7360, 0.6133, 0.2862);
const SUN_C = vec3f(1.55, 1.42, 0.92);
const AMB_LO = vec3f(0.19, 0.30, 0.33);
const AMB_HI = vec3f(0.44, 0.58, 0.50);

var<private> PAL: array<vec3f, 32> = array<vec3f, 32>(
  vec3f(0.0, 0.0, 0.0),       // 0 air
  vec3f(0.47, 0.54, 0.45),    // 1 stone
  vec3f(0.20, 0.27, 0.24),    // 2 grout
  vec3f(0.37, 0.45, 0.41),    // 3 brick
  vec3f(0.17, 0.23, 0.22),    // 4 mortar
  vec3f(0.30, 0.55, 0.25),    // 5 moss
  vec3f(0.36, 0.66, 0.27),    // 6 grass
  vec3f(0.24, 0.19, 0.15),    // 7 dirt
  vec3f(0.60, 0.43, 0.27),    // 8 plank
  vec3f(0.38, 0.26, 0.17),    // 9 plank dark
  vec3f(0.30, 0.22, 0.16),    // 10 pool bed tag
  vec3f(0.33, 0.62, 0.30),    // 11 lily
  vec3f(0.40, 0.68, 0.30),    // 12 leaf
  vec3f(0.30, 0.56, 0.26),    // 13 vine
  vec3f(0.96, 0.96, 0.86),    // 14 flower white
  vec3f(0.98, 0.56, 0.66),    // 15 flower pink
  vec3f(0.98, 0.76, 0.30),    // 16 gold
  vec3f(0.66, 0.21, 0.17),    // 17 chest
  vec3f(1.00, 0.82, 0.45),    // 18 lantern
  vec3f(0.45, 1.00, 0.92),    // 19 crystal
  vec3f(0.55, 0.60, 0.50),    // 20 step
  vec3f(0.30, 0.34, 0.32),    // 21 rock
  vec3f(0.48, 0.45, 0.32),    // 22 sand
  vec3f(0.33, 0.23, 0.16),    // 23 bark
  vec3f(0.47, 0.64, 0.30),    // 24 reed
  vec3f(0.55, 0.98, 0.86),    // 25 shroom
  vec3f(0.02, 0.04, 0.05),    // 26 dark
  vec3f(0.22, 0.22, 0.26),    // 27 iron
  vec3f(0.66, 0.84, 0.38),    // 28 grass light
  vec3f(0.18, 0.40, 0.20),    // 29 leaf dark
  vec3f(0.44, 0.27, 0.15),    // 30 cattail
  vec3f(1.0, 0.0, 1.0),       // 31
);

fn hash3(p: vec3i) -> f32 {
  var h = (u32(p.x) * 73856093u) ^ (u32(p.y) * 19349663u) ^ (u32(p.z) * 83492791u);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967295.0;
}

fn hash2f(p: vec2f) -> f32 {
  return hash3(vec3i(i32(floor(p.x)), i32(floor(p.y)), 911));
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2f(i);
  let b = hash2f(i + vec2f(1.0, 0.0));
  let c = hash2f(i + vec2f(0.0, 1.0));
  let d = hash2f(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn dimsi() -> vec3i { return vec3i(params.dims); }

fn inb(c: vec3i) -> bool {
  let d = dimsi();
  return all(c >= vec3i(0)) && all(c < d);
}

fn mat(c: vec3i) -> u32 {
  if (!inb(c)) { return 0u; }
  let d = dimsi();
  let i = u32(c.x + d.x * (c.z + d.z * c.y));
  return (vox[i >> 2u] >> ((i & 3u) * 8u)) & 0xffu;
}

fn solid(c: vec3i) -> f32 {
  return select(0.0, 1.0, mat(c) != 0u);
}

struct Hit {
  t: f32,
  cell: vec3i,
  n: vec3f,
  m: u32,
}

fn safe_inv(v: vec3f) -> vec3f {
  return vec3f(
    select(1e8, 1.0 / v.x, abs(v.x) > 1e-6),
    select(1e8, 1.0 / v.y, abs(v.y) > 1e-6),
    select(1e8, 1.0 / v.z, abs(v.z) > 1e-6));
}

// Amanatides & Woo. On a miss, `cell` is the first cell outside the grid,
// which tells the caller which face the ray left through.
fn trace(ro: vec3f, rd: vec3f, maxSteps: i32) -> Hit {
  var h: Hit;
  h.m = 0u;
  h.t = 1e9;
  h.cell = vec3i(0, 100000, 0); // never entered the grid
  h.n = vec3f(0.0, 1.0, 0.0);
  let inv = safe_inv(rd);
  let t0 = (vec3f(0.0) - ro) * inv;
  let t1 = (params.dims - ro) * inv;
  let tn = min(t0, t1);
  let tf = max(t0, t1);
  let tmin = max(max(tn.x, tn.y), tn.z);
  let tmax = min(min(tf.x, tf.y), tf.z);
  if (tmax < max(tmin, 0.0)) { return h; }
  var t = max(tmin, 0.0);
  let p = ro + rd * (t + 1e-4);
  var cell = clamp(vec3i(floor(p)), vec3i(0), dimsi() - 1);
  let stp = vec3i(sign(rd));
  let tDelta = abs(inv);
  var tMax = (vec3f(cell) + max(sign(rd), vec3f(0.0)) - ro) * inv;
  tMax = select(vec3f(1e9), tMax, abs(rd) > vec3f(1e-6));
  var n = vec3f(0.0);
  if (tn.x >= tn.y && tn.x >= tn.z) { n = vec3f(-sign(rd.x), 0.0, 0.0); }
  else if (tn.y >= tn.z) { n = vec3f(0.0, -sign(rd.y), 0.0); }
  else { n = vec3f(0.0, 0.0, -sign(rd.z)); }

  for (var i = 0; i < maxSteps; i++) {
    let m = mat(cell);
    if (m != 0u) {
      h.m = m; h.t = t; h.cell = cell; h.n = n;
      return h;
    }
    if (tMax.x < tMax.y && tMax.x < tMax.z) {
      cell.x += stp.x; t = tMax.x; tMax.x += tDelta.x; n = vec3f(-f32(stp.x), 0.0, 0.0);
    } else if (tMax.y < tMax.z) {
      cell.y += stp.y; t = tMax.y; tMax.y += tDelta.y; n = vec3f(0.0, -f32(stp.y), 0.0);
    } else {
      cell.z += stp.z; t = tMax.z; tMax.z += tDelta.z; n = vec3f(0.0, 0.0, -f32(stp.z));
    }
    if (!inb(cell)) { break; }
  }
  h.t = t;
  h.cell = cell;
  return h;
}

// Sun visibility from a voxel face. The room has a roof, so light only
// arrives through the openings in the x = 0 wall.
fn sun_vis(cell: vec3i, n: vec3f) -> f32 {
  if (dot(n, SUN_L) <= 0.0) { return 0.0; }
  let o = vec3f(cell) + 0.5 + n * 0.51;
  if (o.y > WALL_TOP) { return 0.0; } // the roof we cut away still shades the wall tops
  let h = trace(o, SUN_L, 260);
  if (h.m != 0u) { return 0.0; }
  return select(0.0, 1.0, h.cell.x < 0);
}

fn in_window(q: vec2f) -> f32 {
  // q = (z, y) on the window wall
  var v = 0.0;
  for (var k = 0; k < i32(params.nWin); k++) {
    let w = roomData[k];
    let rad = (w.y - w.x) * 0.5;
    let cz = (w.x + w.y) * 0.5;
    let archY = w.w - rad;
    let inRect = q.x > w.x && q.x < w.y && q.y > w.z && q.y < w.w;
    let inArch = q.y <= archY || length(vec2f(q.x - cz, q.y - archY)) < rad;
    if (inRect && inArch) {
      // a little falloff towards the edges of the shaft
      let e = min(min(q.x - w.x, w.y - q.x), min(q.y - w.z, w.w - q.y));
      v = max(v, smoothstep(0.0, 3.0, e));
    }
  }
  return v;
}

// Analytic light shaft density at a point: project back along the sun
// direction onto the window wall.
fn shaft(p: vec3f) -> f32 {
  if (p.x < WALL_T) { return 0.0; }
  let s = (WALL_T * 0.5 - p.x) / SUN_L.x;
  let q = p + SUN_L * s;
  let w = in_window(vec2f(q.z, q.y));
  // shafts thin out the further they travel
  return w * exp(-s * 0.012);
}

fn ao(cell: vec3i, n: vec3f) -> f32 {
  let ni = vec3i(n);
  let a = cell + ni;
  var t1 = vec3i(1, 0, 0);
  var t2 = vec3i(0, 0, 1);
  if (abs(n.x) > 0.5) { t1 = vec3i(0, 1, 0); t2 = vec3i(0, 0, 1); }
  else if (abs(n.z) > 0.5) { t1 = vec3i(1, 0, 0); t2 = vec3i(0, 1, 0); }
  var occ = 0.0;
  occ += solid(a + t1) + solid(a - t1) + solid(a + t2) + solid(a - t2);
  occ += 0.6 * (solid(a + t1 + t2) + solid(a + t1 - t2) + solid(a - t1 + t2) + solid(a - t1 - t2));
  // wider ring, cheap contact darkening at the foot of walls
  occ += 0.35 * (solid(a + t1 * 3) + solid(a - t1 * 3) + solid(a + t2 * 3) + solid(a - t2 * 3));
  return clamp(1.0 - occ * 0.085, 0.35, 1.0);
}

fn band(x: f32, steps: f32) -> f32 {
  return floor(x * steps + 0.5) / steps;
}

fn albedo(h: Hit) -> vec3f {
  var c = PAL[h.m];
  let v = hash3(h.cell);
  // per-voxel jitter: the "texture" of pixel art
  c *= 0.9 + 0.18 * v;
  if (h.m == 1u || h.m == 3u || h.m == 20u) {
    // per-stone tint so the flags and bricks read as separate pieces
    let tile = vec3i(h.cell.x / 10, h.cell.y / 6, h.cell.z / 10);
    let tv = hash3(tile + vec3i(17));
    c *= 0.86 + 0.24 * tv;
    c = mix(c, c * vec3f(0.85, 1.05, 0.95), step(0.7, hash3(tile + vec3i(3))));
  }
  return c;
}

fn point_lights(p: vec3f, n: vec3f) -> vec3f {
  var acc = vec3f(0.0);
  let base = i32(params.nWin);
  for (var k = 0; k < i32(params.nLights); k++) {
    let L = roomData[base + 2 * k];
    let lc = roomData[base + 2 * k + 1].rgb;
    let d = L.xyz - p;
    let dist = length(d);
    var f = clamp(1.0 - dist / L.w, 0.0, 1.0);
    f = f * f;
    let ndl = max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.7 + 0.3;
    var flick = 1.0;
    if (k == 0) { flick = 0.9 + 0.1 * sin(params.time * 9.0) * sin(params.time * 5.3); }
    acc += lc * band(f * ndl * flick, 4.0) * 1.3;
  }
  return acc;
}

fn shade(h: Hit, p: vec3f) -> vec3f {
  let m = h.m;
  if (m == M_DARK) { return PAL[m]; }
  let base = albedo(h);
  if (m == M_LANTERN || m == M_CRYSTAL || m == M_SHROOM) {
    let pulse = 0.92 + 0.08 * sin(params.time * 2.0 + f32(h.cell.x));
    return base * (1.15 + 0.15 * h.n.y) * pulse;
  }
  let n = h.n;
  let occ = ao(h.cell, n);
  let amb = mix(AMB_LO, AMB_HI, n.y * 0.5 + 0.5) * occ;
  let sv = sun_vis(h.cell, n);
  let ndl = max(dot(n, SUN_L), 0.0);
  let sun = SUN_C * band(sv * (0.35 + 0.65 * ndl), 3.0);
  // darker towards the floor: the room fills with green gloom
  let height = clamp((p.y - 4.0) / 60.0, 0.0, 1.0);
  let gloom = mix(0.8, 1.08, height);
  var c = base * (amb * gloom + sun + point_lights(p, n));
  // under-water caustics on lit pool floor
  if (p.y < WATER_Y) {
    let cz = vnoise(p.xz * 0.35 + vec2f(params.time * 0.4, params.time * 0.25)) +
             vnoise(p.xz * 0.5 - vec2f(params.time * 0.3, -params.time * 0.2));
    let caus = smoothstep(1.15, 1.35, cz);
    c += SUN_C * caus * 0.35 * max(sv, 0.25) * base;
  }
  return c;
}

fn background(px: vec2f) -> vec3f {
  let uv = px / params.res;
  let v = length((uv - 0.5) * vec2f(1.0, 1.3));
  return mix(vec3f(0.05, 0.11, 0.11), vec3f(0.015, 0.035, 0.04), smoothstep(0.1, 0.8, v));
}

fn miss_color(h: Hit, px: vec2f, ro: vec3f, rd: vec3f) -> vec3f {
  let pe = ro + rd * h.t;
  if (h.cell.x < 0 && pe.y < WALL_TOP) { return vec3f(0.80, 0.93, 0.62); } // through a window: bright foliage
  if (h.cell.z < 0) { return vec3f(0.02, 0.03, 0.04); }          // the stairwell beyond the door
  return background(px);
}

fn is_water(c: vec3i) -> bool {
  return mat(vec3i(c.x, 0, c.z)) == M_POOLBED;
}

struct Firefly { pos: vec3f, glow: f32 }

fn firefly(i: i32) -> Firefly {
  let fi = f32(i);
  let base = vec3f(
    14.0 + (params.dims.x - 28.0) * hash3(vec3i(i, 1, 5)),
    14.0 + 30.0 * hash3(vec3i(i, 2, 5)),
    14.0 + (params.dims.z - 28.0) * hash3(vec3i(i, 3, 5)));
  let t = params.time * (0.25 + 0.2 * hash3(vec3i(i, 4, 5)));
  let off = vec3f(sin(t + fi) * 7.0, sin(t * 1.7 + fi * 2.0) * 3.0, cos(t * 0.8 + fi * 3.0) * 7.0);
  var f: Firefly;
  f.pos = base + off;
  f.glow = smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(params.time * (1.0 + hash3(vec3i(i, 6, 5))) + fi * 4.0));
  return f;
}

@fragment fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let px = floor(frag.xy) + 0.5;
  let s = (px - params.res * 0.5) / params.zoom;
  let ro = params.center + CAM_R * s.x - CAM_U * s.y - CAM_D * 300.0;
  let rd = CAM_D;

  let h = trace(ro, rd, 900);
  var col: vec3f;
  var depth = 1.0;
  var tSurf = h.t;

  // water plane
  let tw = (WATER_Y - ro.y) / rd.y;
  let pw = ro + rd * tw;
  let cw = vec3i(floor(pw));
  let hitsWater = tw < h.t && inb(cw) && is_water(cw);

  if (hitsWater) {
    tSurf = tw;
    // wobbling refraction
    let wob = vec2f(
      vnoise(pw.xz * 0.6 + vec2f(params.time * 0.8, 0.0)) - 0.5,
      vnoise(pw.zx * 0.6 + vec2f(0.0, params.time * 0.7)) - 0.5);
    let rd2 = normalize(rd + vec3f(wob.x, 0.0, wob.y) * 0.25);
    let h2 = trace(pw, rd2, 80);
    var under = vec3f(0.05, 0.2, 0.2);
    var dpt = 6.0;
    if (h2.m != 0u) {
      let p2 = pw + rd2 * h2.t;
      under = shade(h2, p2);
      dpt = WATER_Y - p2.y;
    }
    let deep = vec3f(0.06, 0.33, 0.34);
    let shallow = vec3f(0.26, 0.70, 0.60);
    let k = 1.0 - exp(-dpt * 0.38);
    col = mix(under * mix(vec3f(0.7, 1.0, 0.95), vec3f(0.45, 0.85, 0.8), k), deep, k * 0.7);
    col = mix(col, shallow * 0.7, 0.25);

    // sun on the surface
    let sv = sun_vis(vec3i(i32(floor(pw.x)), i32(WATER_Y), i32(floor(pw.z))), vec3f(0.0, 1.0, 0.0));
    let ripple = vnoise(pw.xz * vec2f(0.5, 0.9) + vec2f(params.time * 0.6, params.time * 0.2))
               + 0.5 * vnoise(pw.xz * 1.3 - vec2f(params.time * 0.4, 0.0));
    col += sv * vec3f(0.30, 0.36, 0.22);
    col += step(1.12, ripple) * vec3f(0.10, 0.18, 0.15) * (0.5 + sv);
    col += step(1.38, ripple) * vec3f(0.55, 0.65, 0.45) * (0.4 + sv);

    // shoreline foam where water touches anything solid
    var touch = 0.0;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        let c = vec3i(cw.x + dx, i32(WATER_Y), cw.z + dz);
        touch = max(touch, solid(c));
        touch = max(touch, solid(c + vec3i(0, 1, 0)) * select(0.0, 1.0, mat(c + vec3i(0,1,0)) != M_LILY));
      }
    }
    let foam = touch * step(0.45, vnoise(pw.xz * 1.5 + params.time * 0.5));
    col = mix(col, vec3f(0.55, 0.80, 0.68), foam * 0.6);

    // ripple rings: something surfaces, a drip lands, a rising bubble pops
    for (var k = 0; k < 14; k++) {
      let period = 3.0 + 3.0 * hash3(vec3i(k, 1, 13));
      let tt = params.time + period * hash3(vec3i(k, 2, 13));
      let cyc = floor(tt / period);
      let age = fract(tt / period) * period;
      let ci = vec3i(k, i32(cyc), 17);
      let c = vec2f(8.0 + (params.dims.x - 16.0) * hash3(ci), 8.0 + (params.dims.z - 16.0) * hash3(ci + vec3i(0, 0, 1)));
      if (!is_water(vec3i(i32(c.x), 0, i32(c.y)))) { continue; }
      let rad = age * 3.2;
      let fade = 1.0 - smoothstep(0.0, 2.2, age);
      let dd = length((pw.xz - c) * vec2f(1.0, 1.0));
      let ring = 1.0 - smoothstep(0.35, 0.9, abs(dd - rad));
      let ring2 = 1.0 - smoothstep(0.35, 0.9, abs(dd - rad * 0.55));
      col += vec3f(0.45, 0.65, 0.55) * (ring + ring2 * 0.6) * fade * 0.55;
    }
  } else if (h.m != 0u) {
    let p = ro + rd * h.t;
    col = shade(h, p);
  } else {
    col = miss_color(h, px, ro, rd);
  }
  if (h.m != 0u || hitsWater) { depth = clamp(tSurf / 700.0, 0.0, 0.999); }

  // light shafts: march the air in front of the surface
  let inv = safe_inv(rd);
  let a0 = (vec3f(0.0) - ro) * inv;
  let a1 = (params.dims - ro) * inv;
  let tIn = max(max(min(a0.x, a1.x), min(a0.y, a1.y)), min(a0.z, a1.z));
  let tOut = min(tSurf, min(min(max(a0.x, a1.x), max(a0.y, a1.y)), max(a0.z, a1.z)));
  if (tOut > tIn) {
    let N = 40;
    let bayer = fract(dot(floor(px), vec2f(0.5, 0.25)) + fract(floor(px.y) * 0.5) * 0.5);
    let dt = (tOut - tIn) / f32(N);
    var acc = 0.0;
    var mist = 0.0;
    var litMist = 0.0;
    var haze = 0.0;
    for (var i = 0; i < N; i++) {
      let p = ro + rd * (tIn + (f32(i) + bayer) * dt);
      if (p.y > f32(H) - 6.0) { continue; }
      let sh = shaft(p);
      acc += sh;
      // ground mist: hugs the water and the flagstones, drifts slowly
      let over = select(0.45, 1.0, is_water(vec3i(i32(p.x), 0, i32(p.z))));
      let hfall = 1.0 - smoothstep(WATER_Y, WATER_Y + 9.0 * over + 3.0, p.y);
      let n = vnoise(p.xz * 0.05 + vec2f(params.time * 0.07, params.time * 0.03))
            + 0.5 * vnoise(p.xz * 0.13 - vec2f(params.time * 0.05, 0.0) + p.y * 0.1);
      let m = hfall * over * smoothstep(0.55, 1.2, n);
      mist += m;
      litMist += m * sh;
      // thin overall haze, denser low down
      haze += 0.25 + 0.75 * (1.0 - smoothstep(10.0, 50.0, p.y));
    }
    acc *= dt * 0.022;
    mist = clamp(mist * dt * 0.05, 0.0, 0.55);
    litMist *= dt * 0.08;
    haze = clamp(haze * dt * 0.0016, 0.0, 0.35);
    col = mix(col, vec3f(0.10, 0.22, 0.22), haze);
    col = mix(col, vec3f(0.42, 0.62, 0.56), band(mist, 5.0));
    col += vec3f(0.95, 0.98, 0.70) * band(acc, 6.0) * 0.9;
    col += vec3f(0.9, 0.95, 0.6) * band(litMist, 4.0);
    // a denser glitter of specks only visible inside the beams
    let mote = step(0.985, hash3(vec3i(i32(px.x + params.time * 1.5), i32(px.y + params.time * 3.0), 7)));
    col += vec3f(1.0, 1.0, 0.8) * mote * smoothstep(0.03, 0.12, acc) * 0.8;
  }

  // drifting dust and pollen: dim in the gloom, glinting where a beam catches them
  for (var i = 0; i < 160; i++) {
    let fi = f32(i);
    let span = vec3f(params.dims.x - 12.0, 48.0, params.dims.z - 12.0);
    let seed = vec3f(hash3(vec3i(i, 1, 21)), hash3(vec3i(i, 2, 21)), hash3(vec3i(i, 3, 21)));
    var q = seed * span + vec3f(6.0, 10.0, 6.0);
    // slow sinking drift with a wobble, wrapping vertically
    q.y = 10.0 + fract((q.y - 10.0 - params.time * (0.6 + seed.x * 0.8)) / 48.0) * 48.0;
    q.x += sin(params.time * 0.4 + fi) * 3.0 + params.time * 0.8;
    q.z += cos(params.time * 0.3 + fi * 1.7) * 3.0;
    q.x = 6.0 + fract((q.x - 6.0) / span.x) * span.x;
    let rel = q - params.center;
    let sp = params.res * 0.5 + vec2f(dot(rel, CAM_R), -dot(rel, CAM_U)) * params.zoom;
    if (any(abs(floor(px) - floor(sp)) > vec2f(0.0))) { continue; }
    if (dot(q - ro, rd) > tSurf) { continue; }
    let lit = shaft(q);
    col += mix(vec3f(0.22, 0.32, 0.26), vec3f(1.0, 0.98, 0.72), clamp(lit * 2.0, 0.0, 1.0)) * (0.5 + lit * 1.5);
  }

  // leaves spiralling down from the vines and the tops of the walls
  for (var i = 0; i < 16; i++) {
    let fi = f32(i);
    let period = 9.0 + 6.0 * hash3(vec3i(i, 1, 31));
    let tt = params.time + period * hash3(vec3i(i, 2, 31));
    let cyc = floor(tt / period);
    let a = fract(tt / period);
    let ci = vec3i(i, i32(cyc), 33);
    let start = vec3f(10.0 + (params.dims.x - 20.0) * hash3(ci), 70.0, 10.0 + (params.dims.z - 20.0) * hash3(ci + vec3i(0, 0, 1)));
    let q = start + vec3f(sin(a * 9.0 + fi) * 5.0 + a * 10.0, -a * 62.0, cos(a * 7.0 + fi) * 5.0);
    if (q.y < 9.0) { continue; }
    let rel = q - params.center;
    let sp = params.res * 0.5 + vec2f(dot(rel, CAM_R), -dot(rel, CAM_U)) * params.zoom;
    let o = floor(px) - floor(sp);
    let flip = sin(a * 40.0 + fi) > 0.0;
    let wide = select(vec2f(1.0, 0.0), vec2f(0.0, 1.0), flip);
    let on = all(o == vec2f(0.0)) || all(o == wide);
    if (!on) { continue; }
    if (dot(q - ro, rd) > tSurf) { continue; }
    let lc = select(vec3f(0.40, 0.66, 0.28), vec3f(0.78, 0.74, 0.30), hash3(ci + vec3i(5)) > 0.6);
    col = lc * (0.75 + 0.6 * shaft(q)) * select(1.0, 0.75, all(o == wide));
  }

  // fireflies
  for (var i = 0; i < 28; i++) {
    let f = firefly(i);
    let rel = f.pos - params.center;
    let sp = params.res * 0.5 + vec2f(dot(rel, CAM_R), -dot(rel, CAM_U)) * params.zoom;
    let d = length(px - sp);
    if (d > 3.5) { continue; }
    let tf = dot(f.pos - ro, rd);
    if (tf > tSurf + 1.0) { continue; }
    let core = step(d, 0.8);
    let halo = (1.0 - smoothstep(0.8, 3.5, d)) * 0.35;
    col += vec3f(0.85, 1.0, 0.55) * (core + halo) * f.glow;
  }

  return vec4f(col, depth);
}
