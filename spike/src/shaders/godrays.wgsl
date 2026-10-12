// Volumetric sunlight: for each pixel, march from the camera to the surface it sees and add up the
// stretches of the ray that are in the sun, by looking them up in the same shadow map the room is
// lit from. The window's mullions, the wall's edge and the books' silhouettes all shape the beam.

struct Globals {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  sunVP: mat4x4f,
  cam: vec4f,
  lights: array<vec4f, 12>,
  sun: vec4f,
  sunCol: vec4f,
  skyTop: vec4f,
  skyHorizon: vec4f,
  ambient: vec4f,
  ground: vec4f,
  qMin: vec4f,
  qSize: vec4f,
  shadow: vec4f,
  winC: vec4f,
  winN: vec4f,
  winR: vec4f,
  candleVP: array<mat4x4f, 6>,
}
@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var scene: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var sunShadow: texture_depth_2d;

fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

fn lit(p: vec3f) -> f32 {
  let q = G.sunVP * vec4f(p, 1.0);
  let uv = vec2f(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || q.z > 1.0) { return 0.0; }
  let size = G.shadow.x;
  let c = vec2i(uv * size);
  var v = 0.0;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(select(-1, 2, (k & 1) == 1), select(-1, 2, (k & 2) == 2));
    v += select(0.0, 0.25, q.z - G.shadow.y * 2.0 <= textureLoad(sunShadow, clamp(c + o, vec2i(0), vec2i(i32(size) - 1)), 0));
  }
  return v;
}

/// 1 where a ray from `p` toward the sun leaves through the round glass, clear of the mullions.
fn throughWindow(p: vec3f) -> f32 {
  let L = G.sun.xyz;
  let ld = dot(L, G.winN.xyz);
  if (ld < 0.05) { return 0.0; }
  let dist = dot(G.winC.xyz - p, G.winN.xyz);
  if (dist < 0.0) { return 0.0; }
  let q = p + L * (dist / ld) - G.winC.xyz;
  let u = dot(q, G.winR.xyz);
  let v = q.y;
  let soft = 0.05;
  let glass = 1.0 - smoothstep(G.winC.w - soft, G.winC.w + soft, length(vec2f(u, v)));
  let m = G.winR.w;
  return glass * smoothstep(m - soft, m + soft, abs(u)) * smoothstep(m - soft, m + soft, abs(v));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ndc = vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let far = G.invViewProj * vec4f(ndc, 1.0, 1.0);
  let near = G.invViewProj * vec4f(ndc, 0.0, 1.0);
  let dir = normalize(far.xyz / far.w - near.xyz / near.w);
  let hit = textureSampleLevel(scene, samp, uv, 0.0).a;
  let maxD = min(hit, 16.0);
  let steps = 64;
  let jitter = ign(uv * vec2f(1920.0, 1080.0) + G.cam.w * 60.0);
  let dt = maxD / f32(steps);
  var acc = 0.0;
  for (var i = 0; i < steps; i++) {
    let t = (f32(i) + jitter) * dt;
    let p = G.cam.xyz + dir * t;
    let sun = lit(p);
    acc += sun * (0.05 + 3.2 * throughWindow(p)) * dt;
  }
  // forward-scattering phase, so the beam blooms when you look toward the window
  let cosT = dot(dir, G.sun.xyz);
  let g = 0.55;
  let phase = (1.0 - g * g) / (4.0 * 3.14159 * pow(1.0 + g * g - 2.0 * g * cosT, 1.5));
  let density = 0.045;
  let c = G.sunCol.rgb * G.sun.w * acc * density * (0.18 + phase * 2.4);
  return vec4f(c, 1.0);
}
