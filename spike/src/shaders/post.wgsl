// The pixel-art look: the scene was drawn small, this reads it back with nearest filtering (so
// the pixels stay square), tone maps it from HDR, and adds a touch of vignette.

struct Params { exposure: f32, vignette: f32, time: f32, pad: f32 }
@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let hdr = textureSampleLevel(scene, samp, uv, 0.0).rgb * params.exposure;
  var c = aces(hdr);
  c = pow(c, vec3f(1.0 / 2.2));
  let q = uv - 0.5;
  c *= 1.0 - params.vignette * dot(q, q) * 1.6;
  return vec4f(c, 1.0);
}
