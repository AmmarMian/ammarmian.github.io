// Upscale the low-res scene to the canvas with hard pixels, add the
// selective outline and the colour grade.

struct Post {
  scale: f32,
  fade: f32,
  offset: vec2f,
  lowres: vec2f,
}

@group(0) @binding(0) var<uniform> post: Post;
@group(0) @binding(1) var src: texture_2d<f32>;

fn load(p: vec2i) -> vec4f {
  let q = clamp(p, vec2i(0), vec2i(post.lowres) - 1);
  return textureLoad(src, q, 0);
}

fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }

@fragment fn fs_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  let lp = vec2i(floor((frag.xy - post.offset) / post.scale));
  let c = load(lp);
  var col = c.rgb;
  let d = c.a;

  // outline: a pixel sitting just behind a nearer neighbour gets darkened,
  // which draws a 1px contour around every silhouette
  let dl = load(lp + vec2i(-1, 0)).a;
  let dr = load(lp + vec2i(1, 0)).a;
  let du = load(lp + vec2i(0, -1)).a;
  let dd = load(lp + vec2i(0, 1)).a;
  let thr = 4.0 / 1200.0;
  let behind = max(max(d - dl, d - dr), max(d - du, d - dd));
  if (behind > thr) {
    col = col * vec3f(0.42, 0.52, 0.55) + vec3f(0.0, 0.015, 0.02);
  }

  // bloom: a cheap ring of taps picks up the bright parts (sun patches,
  // lanterns, crystals) and lets them glow over their neighbours
  var glow = vec3f(0.0);
  for (var i = 0; i < 12; i++) {
    let ang = f32(i) * 0.5235988;
    for (var r = 1; r <= 3; r++) {
      let o = vec2i(round(vec2f(cos(ang), sin(ang)) * f32(r) * 1.6));
      let s = load(lp + o).rgb;
      glow += max(s - vec3f(0.62), vec3f(0.0)) / f32(r);
    }
  }
  col += glow * 0.075;

  // grade: cool teal shadows, warm green-yellow highlights
  let l = luma(col);
  let shadowTint = vec3f(0.80, 1.0, 1.08);
  let highTint = vec3f(1.06, 1.04, 0.86);
  col *= mix(shadowTint, highTint, smoothstep(0.15, 0.8, l));
  col = mix(vec3f(l), col, 1.12); // a touch more saturation
  col = col / (1.0 + max(col - 1.0, vec3f(0.0)) * 0.6); // soft shoulder

  // quantise with an ordered dither in art-pixel space: gives gradients
  // the stepped look of hand-placed pixels
  let b = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  let bi = (lp.x & 3) + (lp.y & 3) * 4;
  let levels = 28.0;
  col = floor(col * levels + b[bi] / 16.0) / levels;

  // vignette
  let uv = frag.xy / (post.lowres * post.scale);
  let v = smoothstep(0.95, 0.35, length((uv - 0.5) * vec2f(1.1, 1.3)));
  col *= mix(0.72, 1.0, v);

  return vec4f(clamp(col * post.fade, vec3f(0.0), vec3f(1.0)), 1.0);
}
