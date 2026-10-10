// The library floor: one lit shader for the baked room, the spinning globe and the orbiting books,
// a second fragment entry for the sunbeam, and a sky for what the window looks onto.
//
// Lighting is deliberately small. The room's occlusion is baked into the vertices (d.x), the four
// lamps are plain point lights, and the one light that matters, the sun through the round window,
// is not a spot with a shadow map but an analytic test: trace from the fragment toward the sun,
// see whether that ray crosses the window plane inside the glass and outside the mullions.

struct Globals {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  cam: vec4f,          // xyz position, w time
  // lights: [pos.xyz, range], [rgb * intensity, flicker]
  lights: array<vec4f, 8>,
  winC: vec4f,         // window centre, w = glass radius
  winN: vec4f,         // outward normal, w = mullion half width
  winR: vec4f,         // right axis
  sun: vec4f,          // xyz toward the sun, w = strength
  sunCol: vec4f,       // rgb
  skyTop: vec4f,
  skyHorizon: vec4f,
  ambient: vec4f,      // rgb sky ambient, w = overall scale
  ground: vec4f,       // rgb bounce from the floor
  qMin: vec4f,         // vertex decode: position = qMin + p * qSize
  qSize: vec4f,
}
@group(0) @binding(0) var<uniform> G: Globals;

// Orbiting books: three vec4 each. [centre.xyz, spread], [yaw, pitch, roll, flap], [tint.rgb, _]
@group(0) @binding(1) var<uniform> books: array<vec4f, 24>;
@group(0) @binding(2) var<uniform> globeModel: mat4x4f;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec4f,
  @location(3) d: vec4f,
}

fn decode(p: vec4f) -> vec3f { return G.qMin.xyz + p.xyz * G.qSize.xyz; }

fn rotY(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(vec3f(c, 0, -s), vec3f(0, 1, 0), vec3f(s, 0, c)); }
fn rotX(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(vec3f(1, 0, 0), vec3f(0, c, s), vec3f(0, -s, c)); }
fn rotZ(a: f32) -> mat3x3f { let c = cos(a); let s = sin(a); return mat3x3f(vec3f(c, s, 0), vec3f(-s, c, 0), vec3f(0, 0, 1)); }

@vertex fn vs_static(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) c: vec4f, @location(3) d: vec4f) -> VOut {
  let p = decode(pq); let n = nq.xyz;
  var o: VOut;
  o.pos = G.viewProj * vec4f(p, 1.0);
  o.wp = p; o.n = n; o.col = c; o.d = d;
  return o;
}

@vertex fn vs_globe(@location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) c: vec4f, @location(3) d: vec4f) -> VOut {
  let p = decode(pq); let n = nq.xyz;
  var o: VOut;
  let w = globeModel * vec4f(p, 1.0);
  o.pos = G.viewProj * w;
  o.wp = w.xyz; o.n = normalize((globeModel * vec4f(n, 0.0)).xyz); o.col = c; o.d = d;
  return o;
}

@vertex fn vs_book(@builtin(instance_index) i: u32, @location(0) pq: vec4f, @location(1) nq: vec4f, @location(2) c: vec4f, @location(3) d: vec4f) -> VOut {
  let p = decode(pq); let n = nq.xyz;
  let a = books[i * 3u];
  let b = books[i * 3u + 1u];
  let t = books[i * 3u + 2u];
  // The leaves hinge on the spine: side is -1, 0 or +1, stored in d.y.
  let side = (d.y * 255.0 - 127.0) / 127.0;
  let open = a.w + b.w * 0.12 * sin(G.cam.w * 2.2 + f32(i));
  let hinge = rotZ(side * open);
  // A leaf rotates about the spine (origin), the whole book then turns as one.
  let m = rotY(b.x) * rotX(b.y) * rotZ(b.z);
  var lp = p; var ln = n;
  if (abs(side) > 0.5) { lp = hinge * p; ln = hinge * n; }
  let w = m * lp + a.xyz;
  var o: VOut;
  o.pos = G.viewProj * vec4f(w, 1.0);
  o.wp = w; o.n = normalize(m * ln);
  // d.w marks the cover: it takes the per-book tint, the pages keep their own colour.
  let isSkin = d.w > 0.5;
  o.col = vec4f(select(c.rgb, t.rgb, isSkin), c.a);
  o.d = d;
  return o;
}

fn srgb2lin(c: vec3f) -> vec3f { return pow(c, vec3f(2.2)); }

// Does a ray from `p` toward the sun leave through the glass of the round window?
fn sunVisible(p: vec3f) -> f32 {
  let L = G.sun.xyz;
  let wn = G.winN.xyz;
  let ld = dot(L, wn);
  if (ld < 0.05) { return 0.0; }
  let dist = dot(G.winC.xyz - p, wn);
  if (dist < 0.0) { return 0.0; }                 // already outside the wall
  let t = dist / ld;
  let q = p + L * t - G.winC.xyz;
  let u = dot(q, G.winR.xyz);
  let v = q.y;
  let soft = 0.015 + t * 0.012;
  let inGlass = 1.0 - smoothstep(G.winC.w - soft, G.winC.w + soft, length(vec2f(u, v)));
  let m = G.winN.w;
  let bars = smoothstep(m - soft, m + soft, abs(u)) * smoothstep(m - soft, m + soft, abs(v));
  return inGlass * bars;
}

fn light(wp: vec3f, N: vec3f, V: vec3f, albedo: vec3f, ao: f32, spec: f32) -> vec3f {
  var diffuse = vec3f(0.0);
  // hemisphere ambient, occluded by the baked AO
  let hemi = mix(G.ground.rgb, G.ambient.rgb, N.y * 0.5 + 0.5) * G.ambient.w;
  diffuse += hemi * ao;
  var specular = vec3f(0.0);

  for (var i = 0u; i < 4u; i++) {
    let lp = G.lights[i * 2u];
    let lc = G.lights[i * 2u + 1u];
    let toL = lp.xyz - wp;
    let dist = length(toL);
    let L = toL / max(dist, 1e-4);
    let fall = clamp(1.0 - pow(dist / lp.w, 4.0), 0.0, 1.0);
    let atten = fall * fall / (1.0 + dist * dist * 0.35);
    let flick = 1.0 + lc.w * (0.07 * sin(G.cam.w * 11.0 + f32(i)) + 0.05 * sin(G.cam.w * 17.3) + 0.03 * sin(G.cam.w * 5.1));
    // wrapped diffuse: lamps are close and the room is small, so a hard terminator looks harsh
    let ndl = clamp((dot(N, L) + 0.35) / 1.35, 0.0, 1.0);
    let c = lc.rgb * atten * flick;
    diffuse += c * ndl * mix(1.0, ao, 0.6);
    let H = normalize(L + V);
    specular += c * pow(max(dot(N, H), 0.0), 48.0) * spec;
  }

  // the sun through the round window
  let vis = sunVisible(wp);
  if (vis > 0.0) {
    let L = G.sun.xyz;
    let ndl = max(dot(N, L), 0.0);
    let s = G.sunCol.rgb * G.sun.w * vis;
    diffuse += s * ndl;
    let H = normalize(L + V);
    specular += s * pow(max(dot(N, H), 0.0), 64.0) * spec * 2.0;
  }
  return albedo * diffuse + specular;
}

@fragment fn fs_main(in: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var N = normalize(in.n);
  if (!front) { N = -N; }
  let V = normalize(G.cam.xyz - in.wp);
  let albedo = srgb2lin(in.col.rgb);
  let ao = in.d.x;
  let spec = in.d.z;
  var c = light(in.wp, N, V, albedo, ao, spec);
  c += albedo * in.col.a * 3.0;                    // emissive
  return vec4f(c, 1.0);
}

// ---- sunbeam ---------------------------------------------------------------------------------

@fragment fn fs_shaft(in: VOut) -> @location(0) vec4f {
  let V = normalize(G.cam.xyz - in.wp);
  let edge = pow(clamp(abs(dot(V, normalize(in.n))), 0.0, 1.0), 1.4);
  let t = in.d.x;
  let a = 0.16 * (1.0 - 0.75 * t) * edge * (0.9 + 0.1 * sin(G.cam.w * 0.6 + t * 6.0));
  return vec4f(srgb2lin(in.col.rgb) * G.sun.w * 0.5 * a, a);
}

// ---- sky -------------------------------------------------------------------------------------

struct SkyOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f }

@vertex fn vs_sky(@builtin(vertex_index) v: u32) -> SkyOut {
  var q = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: SkyOut;
  o.pos = vec4f(q[v], 0.9999, 1.0);
  o.ndc = q[v];
  return o;
}

@fragment fn fs_sky(in: SkyOut) -> @location(0) vec4f {
  let far = G.invViewProj * vec4f(in.ndc, 1.0, 1.0);
  let near = G.invViewProj * vec4f(in.ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  let h = clamp(dir.y, -0.2, 1.0);
  var sky = mix(G.skyHorizon.rgb, G.skyTop.rgb, pow(clamp(h, 0.0, 1.0), 0.55));
  let sd = max(dot(dir, G.sun.xyz), 0.0);
  sky += G.sunCol.rgb * (pow(sd, 1800.0) * 3.0 + pow(sd, 24.0) * 0.12);
  // below the horizon: a hazy ground colour, the tower stands on something
  sky = mix(sky, G.skyHorizon.rgb * 0.55, smoothstep(0.0, -0.18, dir.y));
  return vec4f(sky, 1.0);
}
