// Final image: scene + bloom + volumetric beam, exposure, ACES, grade, vignette, a hair of grain.
struct Params { exposure: f32, bloom: f32, vignette: f32, time: f32, rays: f32, pad0: f32, pad1: f32, pad2: f32 }
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var bloomTex: texture_2d<f32>;
@group(0) @binding(2) var rays: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var<uniform> params: Params;

fn aces(c: vec3f) -> vec3f {
  let m1 = mat3x3f(vec3f(0.59719, 0.07600, 0.02840), vec3f(0.35458, 0.90834, 0.13383), vec3f(0.04823, 0.01566, 0.83777));
  let m2 = mat3x3f(vec3f(1.60475, -0.10208, -0.00327), vec3f(-0.53108, 1.10813, -0.07276), vec3f(-0.07367, -0.00605, 1.07602));
  let v = m1 * c;
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(m2 * (a / b), vec3f(0.0), vec3f(1.0));
}
fn srgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var hdr = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  hdr += textureSampleLevel(bloomTex, samp, uv, 0.0).rgb * params.bloom;
  hdr += textureSampleLevel(rays, samp, uv, 0.0).rgb * params.rays;
  var c = aces(hdr * params.exposure);
  // gentle grade: a touch of warmth in the mids, lifted blacks stay deep
  c = pow(c, vec3f(1.0, 1.02, 1.06));
  let q = uv - 0.5;
  c *= 1.0 - params.vignette * dot(q, q) * 1.5;
  c = srgb(c);
  let n = hash12(uv * 1873.0 + params.time) - 0.5;
  c += n / 255.0 * 1.6;
  return vec4f(c, 1.0);
}
