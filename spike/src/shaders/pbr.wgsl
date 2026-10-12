// The library floor, physically based: GGX specular, tangent-space normal maps from Poly Haven's
// sets, a shadow-mapped sun that really does come through the round window, point lamps, a baked
// ambient-occlusion term in the vertices, and a sky for what the window looks onto. The sunbeam is
// a separate volumetric pass (godrays.wgsl) that marches the same shadow map.

struct Globals {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  sunVP: mat4x4f,
  cam: vec4f,          // xyz position, w time
  // lights: [pos.xyz, range], [rgb * intensity, flicker]
  lights: array<vec4f, 12>,
  sun: vec4f,          // xyz toward the sun, w strength
  sunCol: vec4f,
  skyTop: vec4f,
  skyHorizon: vec4f,
  ambient: vec4f,      // rgb sky ambient, w scale
  ground: vec4f,       // rgb bounce from the floor
  qMin: vec4f,         // vertex decode: position = qMin + p * qSize
  qSize: vec4f,
  shadow: vec4f,       // x = map size, y = depth bias, z = normal offset, w = debug
  winC: vec4f,         // window centre, w = glass radius
  winN: vec4f,         // outward normal
  winR: vec4f,         // right axis, w = mullion half width
  candleVP: array<mat4x4f, 6>,   // the candelabra's six cube faces
}
@group(0) @binding(0) var<uniform> G: Globals;

struct Mat {
  tint: vec4f,         // rgb, a unused
  p: vec4f,            // x roughness override (<0 none), y metal override (<0 none), z normal strength, w emissive
}
@group(0) @binding(1) var<uniform> M: Mat;
@group(0) @binding(2) var diffTex: texture_2d<f32>;
@group(0) @binding(3) var norTex: texture_2d<f32>;
@group(0) @binding(4) var armTex: texture_2d<f32>;
@group(0) @binding(5) var samp: sampler;
@group(0) @binding(6) var sunShadow: texture_depth_2d;

// Orbiting books: three vec4 each. [centre.xyz, spread], [yaw, pitch, roll, flap], [tint.rgb, _]
@group(0) @binding(7) var<uniform> books: array<vec4f, 24>;
@group(0) @binding(8) var<uniform> globeModel: mat4x4f;

// Shelf books, four vec4 each: [pos.xyz, yaw], [sx, sy, lean, ao at the foot], [tint.rgb, ao at the head], [label cell, 0, 0, 0]
@group(0) @binding(9) var<storage, read> shelf: array<vec4f>;

// The candelabra's shadow cube: one depth map per face. casterVP is what a shadow pass projects with.
@group(0) @binding(10) var cf0: texture_depth_2d;
@group(0) @binding(11) var cf1: texture_depth_2d;
@group(0) @binding(12) var cf2: texture_depth_2d;
@group(0) @binding(13) var cf3: texture_depth_2d;
@group(0) @binding(14) var cf4: texture_depth_2d;
@group(0) @binding(15) var cf5: texture_depth_2d;
@group(0) @binding(16) var<uniform> casterVP: mat4x4f;

// Which slice of the shelf-book buffer a draw covers: x = first instance; yzw = the spine-label atlas (columns, cell width, cell height as fractions).
@group(0) @binding(17) var<uniform> inst: vec4f;

// Props that spin and bob on their own, one matrix each (a spell circle, an orrery ring): inst.x picks the matrix.
@group(0) @binding(18) var<uniform> spinM: array<mat4x4f, 6>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec2f,
  @location(3) col: vec4f,
  @location(4) d: vec4f,
}

fn decode(p: vec4f) -> vec3f { return G.qMin.xyz + p.xyz * G.qSize.xyz; }

fn rotY(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(vec3f(c, 0, -s), vec3f(0, 1, 0), vec3f(s, 0, c)); }
fn rotX(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(vec3f(1, 0, 0), vec3f(0, c, s), vec3f(0, -s, c)); }
fn rotZ(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(vec3f(c, s, 0), vec3f(-s, c, 0), vec3f(0, 0, 1)); }

@vertex fn vs_static(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> VOut {
  let p = decode(pq);
  var o: VOut;
  o.pos = G.viewProj * vec4f(p, 1.0);
  o.wp = p; o.n = nq.xyz; o.uv = uv; o.col = c; o.d = d;
  return o;
}

@vertex fn vs_globe(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> VOut {
  let w = globeModel * vec4f(decode(pq), 1.0);
  var o: VOut;
  o.pos = G.viewProj * w;
  o.wp = w.xyz; o.n = normalize((globeModel * vec4f(nq.xyz, 0.0)).xyz); o.uv = uv; o.col = c; o.d = d;
  return o;
}

fn bookWorld(i: u32, p: vec3f, n: vec3f, side: f32) -> array<vec3f, 2> {
  let a = books[i * 3u];
  let b = books[i * 3u + 1u];
  let open = a.w + b.w * 0.12 * sin(G.cam.w * 2.2 + f32(i));
  let hinge = rotZ(side * open);
  let m = rotY(b.x) * rotX(b.y) * rotZ(b.z);
  var lp = p * books[i * 3u + 2u].w; var ln = n;       // w scales the whole book; 0 hides it
  if (abs(side) > 0.5) { lp = hinge * lp; ln = hinge * n; }
  return array<vec3f, 2>(m * lp + a.xyz, normalize(m * ln));
}

@vertex fn vs_book(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> VOut {
  let side = (d.y * 255.0 - 127.0) / 127.0;
  let w = bookWorld(i, decode(pq), nq.xyz, side);
  var o: VOut;
  o.pos = G.viewProj * vec4f(w[0], 1.0);
  o.wp = w[0]; o.n = w[1]; o.uv = uv;
  o.col = vec4f(books[i * 3u + 2u].rgb, c.a);   // each book carries its own cover colour
  o.d = d;
  return o;
}

@vertex fn vs_orbit(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> VOut {
  // flasks, orbs and the like circling something: the same per-instance pose the books use, without a hinge
  let a = books[i * 3u];
  let b = books[i * 3u + 1u];
  let t = books[i * 3u + 2u];
  let m = rotY(b.x) * rotX(b.y) * rotZ(b.z);
  let w = m * (decode(pq) * t.w) + a.xyz;
  var o: VOut;
  o.pos = G.viewProj * vec4f(w, 1.0);
  o.wp = w; o.n = normalize(m * nq.xyz); o.uv = uv;
  o.col = vec4f(select(c.rgb, t.rgb, d.w > 0.5), c.a);
  o.d = d;
  return o;
}

@vertex fn vs_spin(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> VOut {
  let M4 = spinM[u32(inst.x)];
  let w = M4 * vec4f(decode(pq), 1.0);
  var o: VOut;
  o.pos = G.viewProj * w;
  o.wp = w.xyz; o.n = normalize((M4 * vec4f(nq.xyz, 0.0)).xyz); o.uv = uv; o.col = c; o.d = d;
  return o;
}

fn shelfWorld(ii: u32, p: vec3f, n: vec3f) -> array<vec3f, 2> {
  let i = ii + u32(inst.x);
  let a = shelf[i * 4u];
  let b = shelf[i * 4u + 1u];
  let m = rotY(a.w) * rotZ(b.z);
  return array<vec3f, 2>(m * (p * vec3f(b.x, b.y, select(0.0, 1.0, b.x > 0.0))) + a.xyz, normalize(m * n));
}

@vertex fn vs_shelf(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> VOut {
  let p = decode(pq);
  let w = shelfWorld(i, p, nq.xyz);
  let ix = i + u32(inst.x);
  let t = shelf[ix * 4u + 2u];
  let b = shelf[ix * 4u + 1u];
  let cell = u32(shelf[ix * 4u + 3u].x);
  var o: VOut;
  o.pos = G.viewProj * vec4f(w[0], 1.0);
  o.wp = w[0]; o.n = w[1]; o.uv = uv * vec2f(b.x, b.y);
  if (d.z > 0.5) {
    // a spine label: its quad addresses one cell of the typeset atlas
    let cols = u32(inst.y);
    o.uv = (vec2f(f32(cell % cols), f32(cell / cols)) + uv) * vec2f(inst.z, inst.w);
  }
  o.col = vec4f(select(c.rgb, t.rgb, d.w > 0.5), c.a);
  // occlusion: the shelf above darkens the head, the board below the foot
  let ao = mix(b.w, t.w, clamp(p.y / 0.34 + 0.5, 0.0, 1.0));
  o.d = vec4f(ao, d.y, d.z, d.w);
  return o;
}

@vertex fn vs_shadow_shelf(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> @builtin(position) vec4f {
  let w = shelfWorld(i, decode(pq), nq.xyz);
  return casterVP * vec4f(w[0], 1.0);
}

// ---- shadow caster -----------------------------------------------------------------------------

@vertex fn vs_shadow(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> @builtin(position) vec4f {
  return casterVP * vec4f(decode(pq), 1.0);
}
@vertex fn vs_shadow_globe(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> @builtin(position) vec4f {
  return casterVP * (globeModel * vec4f(decode(pq), 1.0));
}
@vertex fn vs_shadow_book(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> @builtin(position) vec4f {
  let side = (d.y * 255.0 - 127.0) / 127.0;
  let w = bookWorld(i, decode(pq), nq.xyz, side);
  return casterVP * vec4f(w[0], 1.0);
}
@vertex fn vs_shadow_orbit(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> @builtin(position) vec4f {
  let a = books[i * 3u];
  let b = books[i * 3u + 1u];
  let t = books[i * 3u + 2u];
  return casterVP * vec4f(rotY(b.x) * rotX(b.y) * rotZ(b.z) * (decode(pq) * t.w) + a.xyz, 1.0);
}
@vertex fn vs_shadow_spin(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) uv: vec2f, @location(3) c: vec4f, @location(4) d: vec4f) -> @builtin(position) vec4f {
  return casterVP * (spinM[u32(inst.x)] * vec4f(decode(pq), 1.0));
}
@fragment fn fs_shadow() -> @location(0) vec4f { return vec4f(0.0); }

// ---- lighting ----------------------------------------------------------------------------------

const PI = 3.14159265;

fn srgb2lin(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

/// Fraction of the sun that reaches `wp`: a 5x5 tent-filtered compare against the shadow map.
fn sunVisibility(wp: vec3f, N: vec3f) -> f32 {
  let L = G.sun.xyz;
  let slope = clamp(1.0 - dot(N, L), 0.0, 1.0);
  let q = G.sunVP * vec4f(wp + N * (G.shadow.z * (0.5 + slope)), 1.0);
  let uv = vec2f(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || q.z > 1.0) { return 1.0; }
  let size = G.shadow.x;
  let f = uv * size - 0.5;
  let base = vec2i(floor(f));
  let fr = fract(f);
  var acc = 0.0;
  var wsum = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let wx = select(1.0 - fr.x, select(1.0, fr.x, x == 2), x == -2);
      let wy = select(1.0 - fr.y, select(1.0, fr.y, y == 2), y == -2);
      let t = textureLoad(sunShadow, clamp(base + vec2i(x, y), vec2i(0), vec2i(i32(size) - 1)), 0);
      let lit = select(0.0, 1.0, q.z - G.shadow.y <= t);
      acc += lit * wx * wy;
      wsum += wx * wy;
    }
  }
  return acc / wsum;
}

fn cubeLoad(f: u32, c: vec2i) -> f32 {
  switch (f) {
    case 0u: { return textureLoad(cf0, c, 0); }
    case 1u: { return textureLoad(cf1, c, 0); }
    case 2u: { return textureLoad(cf2, c, 0); }
    case 3u: { return textureLoad(cf3, c, 0); }
    case 4u: { return textureLoad(cf4, c, 0); }
    default: { return textureLoad(cf5, c, 0); }
  }
}

/// Fraction of the candelabra's light that reaches `wp`: pick the cube face, then a 3x3 PCF compare.
fn candleVis(wp: vec3f, N: vec3f) -> f32 {
  let lp = G.lights[0].xyz;
  let d = wp - lp;
  let a = abs(d);
  var f = 0u;
  if (a.x >= a.y && a.x >= a.z) { f = select(1u, 0u, d.x > 0.0); }
  else if (a.y >= a.z) { f = select(3u, 2u, d.y > 0.0); }
  else { f = select(5u, 4u, d.z > 0.0); }
  let dist = length(d);
  let off = N * (0.012 + dist * 0.006);
  let q = G.candleVP[f] * vec4f(wp + off, 1.0);
  let ndc = q.xyz / q.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let size = 1024.0;
  let px = uv * size - 0.5;
  let base = vec2i(floor(px));
  var acc = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let t = cubeLoad(f, clamp(base + vec2i(x, y), vec2i(0), vec2i(1023)));
      acc += select(0.0, 1.0, ndc.z - 0.0004 <= t);
    }
  }
  return acc / 9.0;
}

fn dGGX(NoH: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-6);
}
fn vSmith(NoV: f32, NoL: f32, a: f32) -> f32 {
  let k = a * 0.5;
  return 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k) + 1e-5);
}
fn fSchlick(VoH: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(1.0 - VoH, 5.0);
}

/// What a reflection sees: sky through the window side, a warm dim room elsewhere.
fn envColor(dir: vec3f, rough: f32) -> vec3f {
  let up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  var sky = mix(G.skyHorizon.rgb, G.skyTop.rgb, smoothstep(0.45, 1.0, up));
  let room = mix(G.ground.rgb * 0.5, G.ambient.rgb * 0.6, up);
  var c = mix(room, sky, smoothstep(0.35, 0.75, up) * 0.55);
  let sd = max(dot(dir, G.sun.xyz), 0.0);
  c += G.sunCol.rgb * pow(sd, mix(900.0, 8.0, rough)) * mix(3.0, 0.15, rough);
  return c;
}

struct Surf {
  albedo: vec3f,
  rough: f32,
  metal: f32,
  ao: f32,
  N: vec3f,
}

fn shade(wp: vec3f, s: Surf, V: vec3f) -> vec3f {
  let N = s.N;
  let NoV = max(dot(N, V), 1e-3);
  let a = max(s.rough * s.rough, 0.02);
  let f0 = mix(vec3f(0.04), s.albedo, s.metal);
  let diffuse = s.albedo * (1.0 - s.metal);
  var col = vec3f(0.0);

  // lamps
  for (var i = 0u; i < 6u; i++) {
    let lp = G.lights[i * 2u];
    let lc = G.lights[i * 2u + 1u];
    if (lp.w <= 0.0) { continue; }
    let toL = lp.xyz - wp;
    let dist = length(toL);
    let L = toL / max(dist, 1e-4);
    let fall = clamp(1.0 - pow(dist / lp.w, 4.0), 0.0, 1.0);
    let atten = fall * fall / (dist * dist + 0.25);
    let flick = 1.0 + lc.w * (0.08 * sin(G.cam.w * 11.0 + f32(i)) + 0.05 * sin(G.cam.w * 17.3) + 0.03 * sin(G.cam.w * 5.1));
    let NoL = max(dot(N, L), 0.0);
    var sh = 1.0;
    if (i == 0u && NoL > 0.0 && atten > 0.0005) { sh = candleVis(wp, N); }
    let H = normalize(L + V);
    let spec = dGGX(max(dot(N, H), 0.0), a) * vSmith(NoV, NoL, a) * fSchlick(max(dot(V, H), 0.0), f0);
    col += (diffuse / PI + spec) * lc.rgb * atten * flick * NoL * sh * mix(1.0, s.ao, 0.5);
  }

  // the sun
  let L = G.sun.xyz;
  let NoL = max(dot(N, L), 0.0);
  if (NoL > 0.0) {
    let vis = sunVisibility(wp, N);
    if (vis > 0.0) {
      let H = normalize(L + V);
      let spec = dGGX(max(dot(N, H), 0.0), a) * vSmith(NoV, NoL, a) * fSchlick(max(dot(V, H), 0.0), f0);
      col += (diffuse / PI + spec) * G.sunCol.rgb * G.sun.w * NoL * vis;
    }
  }

  // ambient: hemisphere irradiance, occluded; and a reflection of the sky/room
  let hemi = mix(G.ground.rgb, G.ambient.rgb, N.y * 0.5 + 0.5) * G.ambient.w;
  col += diffuse * hemi * s.ao;
  let R = reflect(-V, N);
  let specOcc = clamp(pow(NoV + s.ao, exp2(-16.0 * s.rough - 1.0)) - 1.0 + s.ao, 0.0, 1.0);
  let envBRDF = f0 * (1.0 - s.rough * 0.6) + vec3f(pow(1.0 - NoV, 5.0)) * (1.0 - s.rough) * 0.6;
  col += envColor(R, s.rough) * envBRDF * specOcc * G.ambient.w * 1.2;
  return col;
}

@fragment fn fs_pbr(in: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  // derivatives before anything branches
  let dp1 = dpdx(in.wp);
  let dp2 = dpdy(in.wp);
  let duv1 = dpdx(in.uv);
  let duv2 = dpdy(in.uv);
  let tex = textureSample(diffTex, samp, in.uv);
  let nm = textureSample(norTex, samp, in.uv).xyz * 2.0 - 1.0;
  let arm = textureSample(armTex, samp, in.uv).xyz;

  var Ng = normalize(in.n);
  if (!front) { Ng = -Ng; }
  // cotangent frame from screen derivatives (no stored tangents)
  let dp2perp = cross(dp2, Ng);
  let dp1perp = cross(Ng, dp1);
  let T = dp2perp * duv1.x + dp1perp * duv2.x;
  let B = dp2perp * duv1.y + dp1perp * duv2.y;
  let invmax = inverseSqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  let ns = M.p.z;
  let nt = vec3f(nm.x * ns, -nm.y * ns, max(nm.z, 0.2));
  let N = normalize(T * invmax * nt.x + B * invmax * nt.y + Ng * nt.z);

  // albedo: the texture, or the per-vertex tint standing in for its colour (books keep the leather's grain)
  let texLin = tex.rgb * M.tint.rgb;   // the texture is rgba8unorm-srgb: sampling already linearised it
  let tintLin = srgb2lin(in.col.rgb);
  let grain = clamp(luma(texLin) / 0.07, 0.45, 1.5);
  let mode = in.d.w;
  let albedo = mix(texLin * tintLin, tintLin * grain, mode);
  let rough = select(arm.y, M.p.x, M.p.x >= 0.0);
  let metal = select(arm.z, M.p.y, M.p.y >= 0.0);
  let ao = in.d.x * mix(1.0, arm.x, 0.8);

  var S: Surf;
  S.albedo = albedo; S.rough = clamp(rough, 0.04, 1.0); S.metal = metal; S.ao = ao; S.N = N;
  let V = normalize(G.cam.xyz - in.wp);
  if (G.shadow.w > 0.5) { return vec4f(vec3f(sunVisibility(in.wp, Ng)), length(G.cam.xyz - in.wp)); }
  let kind = M.tint.w;                      // 0 opaque, > 0 glass of that opacity, < 0 additive glow
  if (kind < 0.0) {
    return vec4f(albedo * max(M.p.w, 1.0) * 2.0 * tex.a, 1.0);
  }
  if (kind > 0.0) {
    // glass: nearly no diffuse, a clear specular skin, a Fresnel rim, and a faint tint where you look through
    let gt = select(M.tint.rgb, in.col.rgb, in.d.w > 0.5);        // a jar's own colour, or the material's
    S.albedo = gt * gt * 0.06; S.rough = clamp(rough, 0.03, 0.2); S.metal = 0.0;
    let fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    var g = shade(in.wp, S, V) + gt * gt * 0.05 * G.ambient.w;
    g += S.albedo * max(M.p.w, 0.0) * 40.0;
    return vec4f(g, clamp(kind + fres * 0.55, 0.0, 0.95));
  }
  var c = shade(in.wp, S, V);
  let emissive = max(in.col.a, max(M.p.w, 0.0));
  c += albedo * emissive * 6.0;
  return vec4f(c, length(G.cam.xyz - in.wp));
}

// ---- sky ---------------------------------------------------------------------------------------

struct SkyOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f }

@vertex fn vs_sky(@builtin(vertex_index) v: u32) -> SkyOut {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: SkyOut;
  o.pos = vec4f(q[v], 0.9999, 1.0);
  o.ndc = q[v];
  return o;
}

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1, 0)), u.x), mix(hash21(i + vec2f(0, 1)), hash21(i + vec2f(1, 1)), u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var q = p;
  for (var i = 0; i < 5; i++) { s += a * vnoise(q); q = q * 2.03 + 7.1; a *= 0.5; }
  return s;
}

@fragment fn fs_sky(in: SkyOut) -> @location(0) vec4f {
  let far = G.invViewProj * vec4f(in.ndc, 1.0, 1.0);
  let near = G.invViewProj * vec4f(in.ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  let h = clamp(dir.y, -0.2, 1.0);
  var sky = mix(G.skyHorizon.rgb, G.skyTop.rgb, pow(clamp(h, 0.0, 1.0), 0.5));
  let sd = max(dot(dir, G.sun.xyz), 0.0);
  // clouds on a plane overhead, lit from the sun's side
  if (dir.y > 0.02) {
    let cp = dir.xz / (dir.y + 0.25) * 1.3 + vec2f(G.cam.w * 0.01, 0.0);
    let cl = smoothstep(0.48, 0.78, fbm(cp));
    let lit = mix(vec3f(0.62, 0.66, 0.74), vec3f(1.15, 1.05, 0.92), clamp(sd * 1.4, 0.0, 1.0));
    sky = mix(sky, lit * 0.9, cl * clamp(dir.y * 3.0, 0.0, 1.0) * 0.85);
  }
  // stars and a band of galaxy when the sky is dark enough to show them (skyTop.w is how many)
  let stars = G.skyTop.w;
  if (stars > 0.0 && dir.y > -0.05) {
    // points, not squares: a jittered star in each cell of a 3D grid, shining by its distance from the sight line
    let g = dir * 360.0;
    let cell = floor(g);
    let h1 = hash21(cell.xz + cell.y * 17.31);
    let h2 = hash21(cell.zx * 1.7 + cell.y * 5.13 + 3.1);
    let h3 = hash21(cell.xy * 2.3 + cell.z * 9.7);
    let sp = cell + vec3f(0.5) + (vec3f(h1, h2, h3) - 0.5) * 0.7;
    let ds = length(g - sp);
    let tw = 0.75 + 0.25 * sin(G.cam.w * (1.0 + h1 * 3.0) + h2 * 40.0);
    let star = step(0.985, h1) * smoothstep(0.34, 0.0, ds) * (0.3 + 0.7 * h3) * tw;
    let band = exp(-pow(dot(dir, normalize(vec3f(0.35, 0.8, -0.5))) * 3.2, 2.0));
    let dust = fbm(dir.xz * 7.0 / (abs(dir.y) + 0.4));
    sky = sky * (1.0 - 0.9 * stars) + sky * 0.9 * stars * 0.0;
    sky += vec3f(0.9, 0.95, 1.1) * star * stars * 3.0 + vec3f(0.14, 0.16, 0.28) * band * (0.4 + dust) * stars * 0.5;
  }
  sky += G.sunCol.rgb * (pow(sd, 2400.0) * 40.0 + pow(sd, 30.0) * 0.5) * (1.0 - 0.8 * stars);
  sky = mix(sky, G.skyHorizon.rgb * 0.5, smoothstep(0.0, -0.18, dir.y));
  return vec4f(sky, 1.0e4);
}

// ---- dust --------------------------------------------------------------------------------------

struct MoteOut {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,
  @location(1) glow: f32,
}

@vertex fn vs_mote(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> MoteOut {
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let s = f32(i);
  let h = vec3f(hash21(vec2f(s, 1.7)), hash21(vec2f(s, 9.3)), hash21(vec2f(s, 4.1)));
  // motes fill the room, drifting; they only shine where the sun reaches them
  let t = G.cam.w * (0.02 + 0.03 * h.x);
  var p = vec3f((h.x - 0.5) * 9.0, 0.3 + h.y * 4.2, (h.z - 0.5) * 9.0);
  p += vec3f(sin(t * 3.0 + s) * 0.35, 0.0, cos(t * 2.4 + s * 0.6) * 0.35);
  p.y = 0.3 + fract(h.y + t * 0.08) * 4.2;
  let vis = sunVisibility(p, G.sun.xyz);
  let lamp = G.lights[1];
  let near = clamp(1.0 - length(p - G.lights[0].xyz) / 2.2, 0.0, 1.0);
  var o: MoteOut;
  let clip = G.viewProj * vec4f(p, 1.0);
  let size = (0.0035 + 0.003 * h.y) ;
  let offs = corners[v] * size * vec2f(1.0, 1.0);
  // billboard in view space via the projection's scale
  let right = vec3f(G.viewProj[0][0], G.viewProj[1][0], G.viewProj[2][0]);
  let upv = vec3f(G.viewProj[0][1], G.viewProj[1][1], G.viewProj[2][1]);
  let r = normalize(right); let u = normalize(upv);
  let wp = p + (r * offs.x + u * offs.y);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.q = corners[v];
  let twinkle = 0.65 + 0.35 * sin(G.cam.w * (1.0 + h.x * 2.0) + s);
  o.glow = (vis * 1.0 + near * 0.35) * twinkle;
  return o;
}
@fragment fn fs_mote(in: MoteOut) -> @location(0) vec4f {
  let d = dot(in.q, in.q);
  let a = clamp(1.0 - d, 0.0, 1.0);
  let c = in.glow * a * a;
  return vec4f(G.sunCol.rgb * c * 2.2, 0.0);
}
