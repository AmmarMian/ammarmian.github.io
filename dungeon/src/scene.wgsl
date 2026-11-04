// A floor of the tower, ray-marched at low resolution.
//
// One fragment = one art pixel. The camera is orthographic (30 degree pitch,
// any yaw). Each room is its own voxel grid; a primary ray visits the rooms
// whose boxes it crosses, nearest first, and walks each with a two-level DDA
// (8^3 bricks skip the empty air, then single voxels). Sun shadows, water,
// light shafts and mist all come from the same grids.

struct Params {
  center: vec3f,
  time: f32,
  camR: vec3f,     // screen right
  zoom: f32,       // art pixels per voxel unit
  camU: vec3f,     // screen up
  nRooms: f32,
  camD: vec3f,     // view direction
  nParticles: f32,
  cut: vec4f,      // 1 = walls on this side face the camera and are cut down: -x, +x, -z, +z
  res: vec2f,
  focus: f32,      // room index in focus, or -1
  focusAmt: f32,   // 0..1, eases in and out
}

@group(0) @binding(0) var<uniform> params: Params;
// every room's voxels (one byte each, four to a u32) then its bricks
// (one u32 per 8^3: bit 0 solid, bit 1 swaying plants may reach it)
@group(0) @binding(1) var<storage, read> vox: array<u32>;
// header, then 4 vec4 per room, then windows (z0, z1, y0, y1), then lights
// as (pos, radius), (colour, flicker) pairs; see packFloor in floor.ts
@group(0) @binding(2) var<storage, read> roomData: array<vec4f>;
// two vec4 per particle, placed on the CPU each frame:
// (screen x, screen y, depth t, kind) and (rgb, extra)
@group(0) @binding(3) var<storage, read> particles: array<vec4f>;
// particles binned into 16px screen tiles: tile offsets, then indices
@group(0) @binding(4) var<storage, read> ptiles: array<u32>;

const WATER_Y: f32 = 8.6;
const WALL_T: f32 = 6.0;
const WALL_TOP: f32 = 73.0;
const FLOOR: i32 = 10;
const CUT_Y: i32 = 14;       // walls facing the camera are cut down to this height
const CAM_BACK: f32 = 900.0; // rays start this far behind the focus plane
const MAX_ROOMS: i32 = 16;

const RF_CORRIDOR: u32 = 1u; // never cut away
const RF_SKY: u32 = 2u;      // open to the sky
const RF_SUN: u32 = 4u;      // has windows or sky: worth a shadow ray

const M_POOLBED: u32 = 10u;
const M_LILY: u32 = 11u;
const M_DARK: u32 = 26u;

// towards the sun, which comes in through the windows of x = 0 walls
const SUN_L = vec3f(-0.7360, 0.6133, 0.2862);
const HEADER: i32 = 10; // vec4s before the room table (see packFloor)

// the floor's biome: its light and colours, read once per pixel
struct Biome {
  ambLo: vec3f, ambHi: vec3f, sun: vec3f,
  bgNear: vec3f, bgFar: vec3f,
  mist: vec3f, shaft: vec3f, haze: vec3f, outside: vec3f,
}
var<private> BI: Biome;
fn load_biome() {
  BI.ambLo = roomData[1].xyz; BI.ambHi = roomData[2].xyz; BI.sun = roomData[3].xyz;
  BI.bgNear = roomData[4].xyz; BI.bgFar = roomData[5].xyz;
  BI.mist = roomData[6].xyz; BI.shaft = roomData[7].xyz; BI.haze = roomData[8].xyz; BI.outside = roomData[9].xyz;
}

var<private> PAL: array<vec3f, 64> = array<vec3f, 64>(
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
  vec3f(0.62, 0.18, 0.16),    // 31 book red
  vec3f(0.18, 0.28, 0.55),    // 32 book blue
  vec3f(0.20, 0.45, 0.26),    // 33 book green
  vec3f(0.80, 0.62, 0.25),    // 34 book ochre
  vec3f(0.92, 0.88, 0.75),    // 35 candle wax
  vec3f(1.00, 0.86, 0.46),    // 36 flame
  vec3f(0.78, 0.38, 1.00),    // 37 potion violet
  vec3f(0.45, 1.00, 0.40),    // 38 potion green
  vec3f(1.00, 0.32, 0.38),    // 39 potion red
  vec3f(0.48, 1.00, 0.36),    // 40 brew
  vec3f(0.55, 0.12, 0.14),    // 41 carpet
  vec3f(0.85, 0.65, 0.25),    // 42 carpet trim
  vec3f(1.00, 0.62, 0.20),    // 43 fire
  vec3f(0.92, 0.26, 0.08),    // 44 ember
  vec3f(0.74, 0.44, 1.00),    // 45 amethyst
  vec3f(0.82, 0.84, 0.80),    // 46 marble
  vec3f(0.98, 0.68, 0.78),    // 47 blossom
  vec3f(0.92, 0.88, 0.72),    // 48 paper
  vec3f(0.10, 0.09, 0.09),    // 49 coal
  vec3f(0.40, 0.37, 0.47),    // 50 cave rock
  vec3f(1.00, 0.90, 0.48),    // 51 coin
  vec3f(0.55, 0.58, 0.56),    // 52 marble dark
  vec3f(0.70, 0.90, 0.90),    // 53 glass
  vec3f(0.82, 0.64, 0.42),    // 54 sandstone
  vec3f(0.60, 0.43, 0.28),    // 55 sandstone dark
  vec3f(0.24, 0.58, 0.62),    // 56 glyph paint
  vec3f(0.55, 0.74, 0.86),    // 57 ice
  vec3f(0.92, 0.96, 1.00),    // 58 snow
  vec3f(0.33, 0.29, 0.30),    // 59 basalt
  vec3f(1.00, 0.46, 0.10),    // 60 lava
  vec3f(0.36, 0.58, 0.32),    // 61 cactus
  vec3f(0.74, 0.39, 0.23),    // 62 terracotta
  vec3f(0.80, 0.28, 0.24),    // 63 cloth
);

// material flags: plants sway, emissive materials light themselves
const PLANTS_LO: u32 = (1u << 6u) | (1u << 12u) | (1u << 13u) | (1u << 14u) | (1u << 15u) |
                       (1u << 24u) | (1u << 28u) | (1u << 29u) | (1u << 30u);
const EMIT_LO: u32 = (1u << 18u) | (1u << 19u) | (1u << 25u);
const EMIT_HI: u32 = (1u << 4u) | (1u << 5u) | (1u << 6u) | (1u << 7u) | (1u << 8u) | (1u << 11u) | (1u << 12u) | (1u << 13u) | (1u << 28u);
fn is_plant(m: u32) -> bool { return m < 32u && ((PLANTS_LO >> m) & 1u) == 1u; }
fn is_emissive(m: u32) -> bool {
  if (m < 32u) { return ((EMIT_LO >> m) & 1u) == 1u; }
  return ((EMIT_HI >> (m - 32u)) & 1u) == 1u;
}

/* ------------------------------------------------------------ the room */

struct RoomInfo {
  org: vec3f,
  dims: vec3i,
  voxOff: u32,
  brickOff: u32,
  flags: u32,
  win: vec2i,     // first, count (absolute vec4 index)
  lights: vec2i,
  amb: vec3f,
  idx: i32,
}
var<private> RM: RoomInfo;

fn load_room(i: i32) {
  let a = roomData[HEADER + i * 4];
  let b = roomData[HEADER + 1 + i * 4];
  let c = roomData[HEADER + 2 + i * 4];
  let d = roomData[HEADER + 3 + i * 4];
  RM.org = vec3f(a.x, 0.0, a.y);
  RM.dims = vec3i(i32(a.z), i32(b.x), i32(a.w));
  RM.voxOff = u32(b.y);
  RM.brickOff = u32(b.z);
  RM.flags = u32(b.w);
  RM.win = vec2i(i32(c.x), i32(c.y));
  RM.lights = vec2i(i32(c.z), i32(c.w));
  RM.amb = d.xyz;
  RM.idx = i;
}

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

fn inb(c: vec3i) -> bool {
  return all(c >= vec3i(0)) && all(c < RM.dims);
}

fn mat(c: vec3i) -> u32 {
  if (!inb(c)) { return 0u; }
  let i = u32(c.x + RM.dims.x * (c.z + RM.dims.z * c.y));
  return (vox[RM.voxOff + (i >> 2u)] >> ((i & 3u) * 8u)) & 0xffu;
}

fn solid(c: vec3i) -> f32 {
  return select(0.0, 1.0, mat(c) != 0u);
}

fn brick_flags(c: vec3i) -> u32 {
  let bd = (RM.dims + 7) / 8;
  let b = c >> vec3u(3u);
  return vox[RM.brickOff + u32(b.x + bd.x * (b.z + bd.z * b.y))];
}

// Walls on the camera side are cut down so every room stays visible from
// any angle. The band also takes the corner pillars and what hangs on them.
// While a room is in focus, the walls of all the others sink, so nothing
// stands between the camera and it.
fn hidden(c: vec3i) -> bool {
  if (c.y < CUT_Y || (RM.flags & RF_CORRIDOR) != 0u) { return false; }
  let d = RM.dims;
  let band = i32(WALL_T) + 5;
  if (params.focus >= 0.0 && RM.idx != i32(params.focus)) {
    let cap = i32(mix(f32(d.y), 30.0, params.focusAmt));
    if (c.y >= cap && (c.x < band || c.x >= d.x - band || c.z < band || c.z >= d.z - band)) { return true; }
  }
  return (params.cut.x > 0.5 && c.x < band) || (params.cut.y > 0.5 && c.x >= d.x - band) ||
         (params.cut.z > 0.5 && c.z < band) || (params.cut.w > 0.5 && c.z >= d.z - band);
}

// Wind, as a smooth displacement in voxels. Grass bends more the higher up
// the blade; vines hanging from the wall tops swing at their free end, along
// the wall. Sampled continuously, so the motion stays smooth when zoomed in.
fn sway(p: vec3f) -> vec3f {
  let t = params.time;
  let d = vec3f(RM.dims);
  let w0 = p.xz + RM.org.xz;
  let gust = sin(t * 0.7 + w0.x * 0.021 + w0.y * 0.013) * 0.5 + 0.5;
  let w = sin(t * 1.9 + w0.x * 0.09 + w0.y * 0.05) * (0.55 + 0.6 * gust)
        + 0.25 * sin(t * 4.3 + w0.x * 0.4 + p.y * 0.3);
  let nearX = p.x < WALL_T + 3.0 || p.x >= d.x - WALL_T - 3.0;
  let nearZ = p.z < WALL_T + 3.0 || p.z >= d.z - WALL_T - 3.0;
  if (p.y > f32(FLOOR + 14) && (nearX || nearZ)) {
    let free = clamp((WALL_TOP - p.y) / 26.0, 0.0, 1.0);
    let a = w * free * 1.8;
    if (nearX) { return vec3f(0.0, 0.0, a); }
    return vec3f(a, 0.0, 0.0);
  }
  let hgt = clamp((p.y - f32(FLOOR)) / 6.0, 0.0, 1.0);
  let a = w * hgt * hgt * 1.6;
  return vec3f(a, 0.0, a * 0.4);
}

// Part of a room's walls (with the pillars and what hangs on them), above
// the cut line: the parts that may stand in front of the next room.
fn is_wall(c: vec3i) -> bool {
  if (c.y < CUT_Y || (RM.flags & RF_CORRIDOR) != 0u) { return false; }
  let band = i32(WALL_T) + 5;
  return c.x < band || c.x >= RM.dims.x - band || c.z < band || c.z >= RM.dims.z - band;
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

fn cell_tmax(cell: vec3i, ro: vec3f, rd: vec3f, inv: vec3f) -> vec3f {
  let tm = (vec3f(cell) + max(sign(rd), vec3f(0.0)) - ro) * inv;
  return select(vec3f(1e9), tm, abs(rd) > vec3f(1e-6));
}

// Two-level Amanatides & Woo in the current room (local coordinates).
// `primary` turns on the camera-only effects (wall cutaway, swaying plants);
// shadow rays see the room as it stands. On a miss, `cell` is the first cell
// outside the grid, which tells the caller which face the ray left through.
fn trace(ro: vec3f, rd: vec3f, maxSteps: i32, primary: bool) -> Hit {
  var h: Hit;
  h.m = 0u;
  h.t = 1e9;
  h.cell = vec3i(0, 100000, 0); // never entered the grid
  h.n = vec3f(0.0, 1.0, 0.0);
  let inv = safe_inv(rd);
  let t0 = (vec3f(0.0) - ro) * inv;
  let t1 = (vec3f(RM.dims) - ro) * inv;
  let tn = min(t0, t1);
  let tf = max(t0, t1);
  let tmin = max(max(tn.x, tn.y), tn.z);
  let tmax = min(min(tf.x, tf.y), tf.z);
  if (tmax < max(tmin, 0.0)) { return h; }
  var t = max(tmin, 0.0);
  var cell = clamp(vec3i(floor(ro + rd * (t + 1e-4))), vec3i(0), RM.dims - 1);
  let stp = vec3i(sign(rd));
  let tDelta = abs(inv);
  var tMax = cell_tmax(cell, ro, rd, inv);
  var n = vec3f(0.0);
  if (tn.x >= tn.y && tn.x >= tn.z) { n = vec3f(-sign(rd.x), 0.0, 0.0); }
  else if (tn.y >= tn.z) { n = vec3f(0.0, -sign(rd.y), 0.0); }
  else { n = vec3f(0.0, 0.0, -sign(rd.z)); }

  for (var i = 0; i < maxSteps; i++) {
    let flags = brick_flags(cell);
    if (flags == 0u) {
      // jump to where the ray leaves this brick
      let b0 = vec3f((cell >> vec3u(3u)) * 8);
      let tb = (b0 + max(sign(rd), vec3f(0.0)) * 8.0 - ro) * inv;
      let tbs = select(vec3f(1e9), tb, abs(rd) > vec3f(1e-6));
      var te = tbs.x;
      n = vec3f(-sign(rd.x), 0.0, 0.0);
      if (tbs.y < te) { te = tbs.y; n = vec3f(0.0, -sign(rd.y), 0.0); }
      if (tbs.z < te) { te = tbs.z; n = vec3f(0.0, 0.0, -sign(rd.z)); }
      t = te;
      cell = vec3i(floor(ro + rd * (t + 1e-3)));
      if (!inb(cell)) { break; }
      tMax = cell_tmax(cell, ro, rd, inv);
      continue;
    }
    var m = mat(cell);
    var hc = cell;
    if (primary) {
      if (m != 0u && hidden(cell)) { m = 0u; }
      if ((flags & 2u) != 0u && (m == 0u || is_plant(m))) {
        // sample the wind where the ray crosses the middle of this cell
        let tNext = min(min(tMax.x, tMax.y), tMax.z);
        let pm = ro + rd * ((t + tNext) * 0.5);
        let off = sway(pm);
        if (dot(off, off) > 0.0025) {
          let src = vec3i(floor(pm - off));
          let ms = mat(src);
          let srcPlant = is_plant(ms) && !hidden(src);
          // the plant that was here has blown away; what blew in comes from upwind
          m = select(select(0u, m, !is_plant(m)), ms, srcPlant);
          hc = select(cell, src, srcPlant);
        }
      }
    }
    if (m != 0u) {
      h.m = m; h.t = t; h.cell = hc; h.n = n;
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

fn in_window(q: vec2f) -> f32 {
  // q = (z, y) on the room's x = 0 wall
  var v = 0.0;
  for (var k = RM.win.x; k < RM.win.x + RM.win.y; k++) {
    let w = roomData[k];
    let rad = (w.y - w.x) * 0.5;
    let cz = (w.x + w.y) * 0.5;
    let archY = w.w - rad;
    let inRect = q.x > w.x && q.x < w.y && q.y > w.z && q.y < w.w;
    let inArch = q.y <= archY || length(vec2f(q.x - cz, q.y - archY)) < rad;
    if (inRect && inArch) {
      let e = min(min(q.x - w.x, w.y - q.x), min(q.y - w.z, w.w - q.y));
      v = max(v, smoothstep(0.0, 3.0, e));
    }
  }
  return v;
}

// Sun visibility from a voxel face: through the windows, or from the open
// sky in a courtyard. Other rooms only have their own lights.
fn sun_vis(cell: vec3i, n: vec3f) -> f32 {
  if ((RM.flags & RF_SUN) == 0u || dot(n, SUN_L) <= 0.0) { return 0.0; }
  let o = vec3f(cell) + 0.5 + n * 0.51;
  let sky = (RM.flags & RF_SKY) != 0u;
  if (o.y > WALL_TOP && !sky) { return 0.0; }
  let h = trace(o, SUN_L, 260, false);
  if (h.m != 0u) { return 0.0; }
  if (sky && h.cell.y >= RM.dims.y) { return 1.0; }
  let pe = o + SUN_L * h.t;
  return select(0.0, 1.0, h.cell.x < 0 && in_window(pe.zy) > 0.0);
}

// Analytic light shaft density at a point: project back along the sun
// direction onto the window wall.
fn shaft(p: vec3f) -> f32 {
  if (RM.win.y == 0 || p.x < WALL_T) { return 0.0; }
  let s = (WALL_T * 0.5 - p.x) / SUN_L.x;
  let q = p + SUN_L * s;
  return in_window(vec2f(q.z, q.y)) * exp(-s * 0.012);
}

fn ao(cell: vec3i, n: vec3f) -> f32 {
  let a = cell + vec3i(n);
  var t1 = vec3i(1, 0, 0);
  var t2 = vec3i(0, 0, 1);
  if (abs(n.x) > 0.5) { t1 = vec3i(0, 1, 0); t2 = vec3i(0, 0, 1); }
  else if (abs(n.z) > 0.5) { t1 = vec3i(1, 0, 0); t2 = vec3i(0, 1, 0); }
  var occ = 0.0;
  occ += solid(a + t1) + solid(a - t1) + solid(a + t2) + solid(a - t2);
  occ += 0.6 * (solid(a + t1 + t2) + solid(a + t1 - t2) + solid(a - t1 + t2) + solid(a - t1 - t2));
  occ += 0.35 * (solid(a + t1 * 3) + solid(a - t1 * 3) + solid(a + t2 * 3) + solid(a - t2 * 3));
  return clamp(1.0 - occ * 0.085, 0.35, 1.0);
}

fn band(x: f32, steps: f32) -> f32 {
  return floor(x * steps + 0.5) / steps;
}

fn albedo(h: Hit) -> vec3f {
  var c = PAL[h.m];
  let v = hash3(h.cell);
  c *= 0.9 + 0.18 * v;   // per-voxel jitter: the "texture" of pixel art
  if (h.m == 1u || h.m == 3u || h.m == 20u || h.m == 46u) {
    // per-stone tint so flags and bricks read as separate pieces
    let tile = vec3i(h.cell.x / 10, h.cell.y / 6, h.cell.z / 10);
    c *= 0.86 + 0.24 * hash3(tile + vec3i(17));
    c = mix(c, c * vec3f(0.85, 1.05, 0.95), step(0.7, hash3(tile + vec3i(3))));
  }
  return c;
}

fn point_lights(p: vec3f, n: vec3f) -> vec3f {
  var acc = vec3f(0.0);
  for (var k = 0; k < RM.lights.y; k++) {
    let i = RM.lights.x + 2 * k;
    let L = roomData[i];
    let lc = roomData[i + 1];
    let d = L.xyz - p;
    let dist = length(d);
    var f = clamp(1.0 - dist / L.w, 0.0, 1.0);
    f = f * f;
    let ndl = max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.7 + 0.3;
    let fk = f32(k);
    let flick = 1.0 - lc.w * (0.5 + 0.5 * sin(params.time * 9.0 + fk * 1.7) * sin(params.time * 5.3 + fk));
    acc += lc.rgb * band(f * ndl * flick, 4.0) * 1.3;
  }
  return acc;
}

fn shade(h: Hit, p: vec3f) -> vec3f {
  let m = h.m;
  if (m == M_DARK) { return PAL[m]; }
  let base = albedo(h);
  if (is_emissive(m)) {
    let pulse = 0.92 + 0.08 * sin(params.time * 2.0 + f32(h.cell.x) + f32(h.cell.y) * 0.7);
    var flick = 1.0;
    if (m == 43u || m == 44u || m == 36u) {
      flick = 0.8 + 0.3 * hash3(h.cell + vec3i(i32(params.time * 8.0)));
    }
    return base * (1.15 + 0.15 * h.n.y) * pulse * flick;
  }
  let n = h.n;
  let occ = ao(h.cell, n);
  let amb = mix(BI.ambLo, BI.ambHi, n.y * 0.5 + 0.5) * occ * RM.amb;
  let sv = sun_vis(h.cell, n);
  let ndl = max(dot(n, SUN_L), 0.0);
  // the open sky of a courtyard is gentler than a beam through a window
  let sunK = select(1.0, 0.5, (RM.flags & RF_SKY) != 0u);
  let sun = BI.sun * band(sv * (0.35 + 0.65 * ndl), 3.0) * sunK;
  let height = clamp((p.y - 4.0) / 60.0, 0.0, 1.0);
  let gloom = mix(0.8, 1.08, height);
  var c = base * (amb * gloom + sun + point_lights(p, n));
  if (p.y < WATER_Y && liquid() == 0u) {
    let cz = vnoise(p.xz * 0.35 + vec2f(params.time * 0.4, params.time * 0.25)) +
             vnoise(p.xz * 0.5 - vec2f(params.time * 0.3, -params.time * 0.2));
    c += BI.sun * smoothstep(1.15, 1.35, cz) * 0.35 * max(sv, 0.25) * base;
  }
  return c;
}

fn background(px: vec2f) -> vec3f {
  let uv = px / params.res;
  let v = length((uv - 0.5) * vec2f(1.0, 1.3));
  return mix(BI.bgNear, BI.bgFar, smoothstep(0.1, 0.8, v));
}

fn liquid() -> u32 { return (RM.flags >> 3u) & 3u; }

// Molten rock: bright channels under a slow-drifting, cracking crust.
fn shade_lava(pw: vec3f) -> vec3f {
  let t = params.time;
  let n1 = vnoise(pw.xz * 0.12 + vec2f(t * 0.08, t * 0.05));
  let n2 = vnoise(pw.xz * 0.35 - vec2f(t * 0.15, 0.0) + n1 * 2.0);
  let vein = 1.0 - smoothstep(0.0, 0.18, abs(n1 - 0.5));
  var col = mix(vec3f(0.95, 0.38, 0.08), vec3f(1.0, 0.86, 0.38), vein);
  let crust = smoothstep(0.58, 0.72, n2);
  col = mix(col * 1.15, vec3f(0.17, 0.07, 0.05), crust * 0.85);
  return col * (0.9 + 0.1 * sin(t * 3.0 + pw.x * 0.2));
}

// A frozen pond: what lies beneath shows dimly through clear ice, crazed
// with white cracks, glinting where the light catches it.
fn shade_ice(pw: vec3f, rd: vec3f) -> vec3f {
  let h2 = trace(pw, rd, 60, true);
  var under = vec3f(0.1, 0.2, 0.3);
  if (h2.m != 0u) { under = shade(h2, pw + rd * h2.t); }
  var col = mix(under * vec3f(0.55, 0.75, 0.9), vec3f(0.70, 0.87, 0.98), 0.55);
  let n = vnoise(pw.xz * 0.18) + 0.5 * vnoise(pw.xz * 0.5);
  let crack = 1.0 - smoothstep(0.0, 0.025, abs(n - 0.75));
  col = mix(col, vec3f(0.96, 1.0, 1.0), crack * 0.7);
  let cw = vec3i(floor(pw));
  let sv = sun_vis(vec3i(cw.x, i32(WATER_Y), cw.z), vec3f(0.0, 1.0, 0.0));
  col += sv * vec3f(0.18, 0.22, 0.26);
  let glint = step(0.996, hash3(vec3i(cw.x, i32(params.time * 2.0), cw.z)));
  col += glint * vec3f(0.8, 0.9, 1.0);
  return col;
}

fn is_water(c: vec3i) -> bool {
  return mat(vec3i(c.x, 0, c.z)) == M_POOLBED;
}

// The water surface at local point pw, looking along rd.
fn shade_water(pw: vec3f, rd: vec3f) -> vec3f {
  let liq = liquid();
  if (liq == 1u) { return shade_lava(pw); }
  if (liq == 2u) { return shade_ice(pw, rd); }
  let cw = vec3i(floor(pw));
  let wob = vec2f(
    vnoise(pw.xz * 0.6 + vec2f(params.time * 0.8, 0.0)) - 0.5,
    vnoise(pw.zx * 0.6 + vec2f(0.0, params.time * 0.7)) - 0.5);
  let rd2 = normalize(rd + vec3f(wob.x, 0.0, wob.y) * 0.25);
  let h2 = trace(pw, rd2, 60, true);
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
  var col = mix(under * mix(vec3f(0.7, 1.0, 0.95), vec3f(0.45, 0.85, 0.8), k), deep, k * 0.7);
  col = mix(col, shallow * 0.7, 0.25);

  let sv = sun_vis(vec3i(cw.x, i32(WATER_Y), cw.z), vec3f(0.0, 1.0, 0.0));
  let ripple = vnoise(pw.xz * vec2f(0.5, 0.9) + vec2f(params.time * 0.6, params.time * 0.2))
             + 0.5 * vnoise(pw.xz * 1.3 - vec2f(params.time * 0.4, 0.0));
  col += sv * vec3f(0.30, 0.36, 0.22);
  col += step(1.12, ripple) * vec3f(0.10, 0.18, 0.15) * (0.5 + sv);
  col += step(1.38, ripple) * vec3f(0.55, 0.65, 0.45) * (0.4 + sv);

  // shoreline foam where the water touches anything solid
  var touch = 0.0;
  for (var dx = -1; dx <= 1; dx++) {
    for (var dz = -1; dz <= 1; dz++) {
      let c = vec3i(cw.x + dx, i32(WATER_Y), cw.z + dz);
      touch = max(touch, solid(c));
      touch = max(touch, solid(c + vec3i(0, 1, 0)) * select(0.0, 1.0, mat(c + vec3i(0, 1, 0)) != M_LILY));
    }
  }
  col = mix(col, vec3f(0.55, 0.80, 0.68), touch * step(0.45, vnoise(pw.xz * 1.5 + params.time * 0.5)) * 0.6);

  // ripple rings: something surfaces, a drip lands
  let dims = vec3f(RM.dims);
  for (var k2 = 0; k2 < 10; k2++) {
    let period = 3.0 + 3.0 * hash3(vec3i(k2, 1, 13));
    let tt = params.time + period * hash3(vec3i(k2, 2, 13));
    let cyc = floor(tt / period);
    let age = fract(tt / period) * period;
    let ci = vec3i(k2, i32(cyc), 17 + RM.idx);
    let c = vec2f(8.0 + (dims.x - 16.0) * hash3(ci), 8.0 + (dims.z - 16.0) * hash3(ci + vec3i(0, 0, 1)));
    if (!is_water(vec3i(i32(c.x), 0, i32(c.y)))) { continue; }
    let rad = age * 3.2;
    let fade = 1.0 - smoothstep(0.0, 2.2, age);
    let dd = length(pw.xz - c);
    let ring = 1.0 - smoothstep(0.35, 0.9, abs(dd - rad));
    let ring2 = 1.0 - smoothstep(0.35, 0.9, abs(dd - rad * 0.55));
    col += vec3f(0.45, 0.65, 0.55) * (ring + ring2 * 0.6) * fade * 0.55;
  }
  return col;
}

// Pulls a colour towards a dim, cool grey: rooms out of focus.
fn defocus(c: vec3f, amt: f32) -> vec3f {
  let l = dot(c, vec3f(0.299, 0.587, 0.114));
  return mix(c, vec3f(l) * vec3f(0.42, 0.55, 0.58) * 0.75, amt);
}

@fragment fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  load_biome();
  let px = floor(frag.xy) + 0.5;
  let s = (px - params.res * 0.5) / params.zoom;
  let ro = params.center + params.camR * s.x - params.camU * s.y - params.camD * CAM_BACK;
  let rd = params.camD;
  let inv = safe_inv(rd);

  // which rooms does this ray cross, nearest first
  var tin: array<f32, MAX_ROOMS>;
  var tout: array<f32, MAX_ROOMS>;
  var ids: array<i32, MAX_ROOMS>;
  var n = 0;
  for (var i = 0; i < min(i32(params.nRooms), MAX_ROOMS); i++) {
    let b = roomData[HEADER + i * 4];
    let hgt = roomData[HEADER + 1 + i * 4].x;
    let a0 = (vec3f(b.x, 0.0, b.y) - ro) * inv;
    let a1 = (vec3f(b.x + b.z, hgt, b.y + b.w) - ro) * inv;
    let t0 = max(max(min(a0.x, a1.x), min(a0.y, a1.y)), min(a0.z, a1.z));
    let t1 = min(min(max(a0.x, a1.x), max(a0.y, a1.y)), max(a0.z, a1.z));
    if (t1 <= max(t0, 0.0)) { continue; }
    var j = n;
    while (j > 0 && tin[j - 1] > t0) {
      tin[j] = tin[j - 1]; tout[j] = tout[j - 1]; ids[j] = ids[j - 1];
      j--;
    }
    tin[j] = t0; tout[j] = t1; ids[j] = i;
    n++;
  }

  var col = background(px);
  var tSurf = 1e9;   // where the view ends (behind a see-through wall, if any)
  var tDepth = 1e9;  // the nearest surface, for the outline pass
  var hitRoom = -1;
  // A wall that stands in front of another room turns see-through: the first
  // wall hit is remembered, and the ray carries on into the rooms behind it.
  var ghost = false;
  var ghostCol = vec3f(0.0);
  var ghostT = 0.0;
  var ghostRoom = -1;
  for (var k = 0; k < n; k++) {
    load_room(ids[k]);
    let lro = ro - RM.org;
    let h = trace(lro, rd, 700, true);
    let tw = (WATER_Y - lro.y) / rd.y;
    let pw = lro + rd * tw;
    let cw = vec3i(floor(pw));
    var found = false;
    var c = vec3f(0.0);
    var t = 0.0;
    if (tw < h.t && inb(cw) && is_water(cw)) {
      c = shade_water(pw, rd); t = tw; found = true;
    } else if (h.m != 0u) {
      c = shade(h, lro + rd * h.t); t = h.t; found = true;
    } else if (h.cell.y < 1000) {
      // left the room without hitting anything: a window shows the bright
      // world outside, the archway at the top of the stairs shows darkness
      // (not where the wall itself has been cut away)
      let pe = lro + rd * h.t;
      if (pe.y < WALL_TOP && pe.y > f32(CUT_Y) && (RM.flags & RF_CORRIDOR) == 0u) {
        if (h.cell.x < 0 && !hidden(vec3i(0, i32(pe.y), i32(pe.z))) && in_window(pe.zy) > 0.0) { c = BI.outside; t = h.t; found = true; }
        else if (h.cell.z < 0 && pe.y > 20.0 && !hidden(vec3i(i32(pe.x), i32(pe.y), 0))) { c = vec3f(0.02, 0.03, 0.04); t = h.t; found = true; }
      }
    }
    if (!found) { continue; }
    if (params.focus >= 0.0 && ids[k] != i32(params.focus)) { c = defocus(c, params.focusAmt * 0.75); }
    if (!ghost && h.m != 0u && t == h.t && k < n - 1 && is_wall(h.cell)) {
      ghost = true; ghostCol = c; ghostT = t; ghostRoom = ids[k];
      continue;
    }
    if (ghost) {
      // the wall as a faint pane over the room behind it
      col = mix(c, ghostCol * vec3f(0.85, 1.0, 1.0), 0.3);
      tSurf = t; tDepth = ghostT; hitRoom = ids[k];
    } else {
      col = c; tSurf = t; tDepth = t; hitRoom = ids[k];
    }
    break;
  }
  if (ghost && hitRoom < 0) {
    // nothing behind after all: the wall stays solid
    col = ghostCol; tSurf = ghostT; tDepth = ghostT; hitRoom = ghostRoom;
  }

  // the air in front of the surface: light shafts, ground mist, haze
  let bayer = fract(dot(floor(px), vec2f(0.5, 0.25)) + fract(floor(px.y) * 0.5) * 0.5);
  for (var k = 0; k < n; k++) {
    if (tin[k] >= tSurf) { break; }
    load_room(ids[k]);
    let lro = ro - RM.org;
    let ta = max(tin[k], 0.0);
    let tb = min(tout[k], tSurf);
    let N = 14;
    let dt = (tb - ta) / f32(N);
    var acc = 0.0;
    var mist = 0.0;
    var litMist = 0.0;
    var haze = 0.0;
    for (var i = 0; i < N; i++) {
      let p = lro + rd * (ta + (f32(i) + bayer) * dt);
      if (p.y > f32(RM.dims.y) - 6.0) { continue; }
      let sh = shaft(p);
      acc += sh;
      if (p.y < WATER_Y + 12.0) {
        let over = select(0.45, 1.0, is_water(vec3i(i32(p.x), 0, i32(p.z))));
        let hfall = 1.0 - smoothstep(WATER_Y, WATER_Y + 9.0 * over + 3.0, p.y);
        let nz = vnoise(p.xz * 0.05 + vec2f(params.time * 0.07, params.time * 0.03))
               + 0.5 * vnoise(p.xz * 0.13 - vec2f(params.time * 0.05, 0.0) + p.y * 0.1);
        let m = hfall * over * smoothstep(0.55, 1.2, nz);
        mist += m;
        litMist += m * sh;
      }
      haze += 0.25 + 0.75 * (1.0 - smoothstep(10.0, 50.0, p.y));
    }
    acc *= dt * 0.022;
    mist = clamp(mist * dt * 0.05, 0.0, 0.55);
    litMist *= dt * 0.08;
    haze = clamp(haze * dt * 0.0016, 0.0, 0.35);
    let dim = select(1.0, 1.0 - params.focusAmt * 0.7, params.focus >= 0.0 && ids[k] != i32(params.focus));
    col = mix(col, BI.haze, haze);
    col = mix(col, BI.mist * dim, band(mist, 5.0));
    col += BI.shaft * band(acc, 6.0) * 0.9 * dim;
    col += BI.shaft * 0.95 * band(litMist, 4.0) * dim;
    let mote = step(0.985, hash3(vec3i(i32(px.x + params.time * 1.5), i32(px.y + params.time * 3.0), 7)));
    col += vec3f(1.0, 1.0, 0.8) * mote * smoothstep(0.03, 0.12, acc) * 0.8 * dim;
  }

  // particles (dust, leaves, embers, sparkles, fireflies), placed on the CPU
  let tdim = vec2u(ceil(params.res / 16.0));
  let tcell = min(vec2u(px) / 16u, tdim - 1u);
  let tk = tcell.x + tdim.x * tcell.y;
  let pbase = tdim.x * tdim.y + 1u;
  for (var j = ptiles[tk]; j < ptiles[tk + 1u]; j++) {
    let i = i32(ptiles[pbase + j]);
    let a = particles[2 * i];
    let o = floor(px) - floor(a.xy);
    if (abs(o.x) > 3.0 || abs(o.y) > 3.0) { continue; }
    if (a.z > tSurf + 1.0) { continue; }
    let b = particles[2 * i + 1];
    let kind = i32(a.w);
    if (kind == 0) {          // one pixel
      if (all(o == vec2f(0.0))) { col += b.rgb; }
    } else if (kind == 1) {   // glow: a core and a soft halo
      let d = length(px - a.xy);
      col += b.rgb * (step(d, 0.8) + (1.0 - smoothstep(0.8, 3.5, d)) * 0.35);
    } else if (kind == 2) {   // leaf or petal: two pixels, flipping as it tumbles
      let wide = select(vec2f(1.0, 0.0), vec2f(0.0, 1.0), b.w > 0.0);
      if (all(o == vec2f(0.0))) { col = b.rgb; }
      else if (all(o == wide)) { col = b.rgb * 0.75; }
    } else {                  // sparkle: a small cross
      let ax = abs(o);
      if (all(o == vec2f(0.0))) { col += b.rgb; }
      else if ((ax.x + ax.y) == 1.0) { col += b.rgb * 0.45; }
    }
  }

  var depth = 1.0;
  if (hitRoom >= 0) { depth = clamp((tDepth - CAM_BACK + 600.0) / 1200.0, 0.0, 0.999); }
  return vec4f(col, depth);
}
