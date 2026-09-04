// Reversible particle-flow field + fox constellation overlay.
// window.Flow.startField(canvas, getCfg) -> { reseed, destroy, pattern }
(function () {
"use strict";

// Respect the OS-level motion preference: skip every continuous rAF loop
// (particle field, fox, spine) and render one static frame instead.
var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

var PATTERNS = ["curl", "ridges", "swirl", "bands", "cells"];

// Fox head as a star chart. Front view, normalized 0..1 (y down).
// Outline runs clockwise from the left ear tip; interior stars mark eyes and muzzle.
// mag = relative magnitude (brightness/size); not every vertex is a bright star,
// which is what keeps it reading as a constellation rather than a traced logo.
var FOX_STARS = [
  // ears + skull
  [0.105, 0.030, 1.25], //  0 left ear tip
  [0.240, 0.215, 0.55], //  1 left ear inner
  [0.500, 0.170, 0.70], //  2 crown
  [0.760, 0.215, 0.55], //  3 right ear inner
  [0.895, 0.030, 1.25], //  4 right ear tip
  // right side down
  [0.850, 0.330, 0.60], //  5 right temple
  [0.955, 0.545, 1.00], //  6 right cheek flare
  [0.775, 0.665, 0.55], //  7 right ruff
  [0.615, 0.735, 0.50], //  8 right jaw
  [0.565, 0.865, 0.45], //  9 right muzzle
  // nose
  [0.500, 0.955, 1.45], // 10 nose (brightest)
  // left side up
  [0.435, 0.865, 0.45], // 11 left muzzle
  [0.385, 0.735, 0.50], // 12 left jaw
  [0.225, 0.665, 0.55], // 13 left ruff
  [0.045, 0.545, 1.00], // 14 left cheek flare
  [0.150, 0.330, 0.60], // 15 left temple
  // interior
  [0.345, 0.475, 1.15], // 16 left eye
  [0.655, 0.475, 1.15], // 17 right eye
  [0.500, 0.615, 0.80]  // 18 muzzle bridge
];

// Silhouette edges, plus a faint mask line across the eyes and down the bridge.
var FOX_EDGES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],
  [10,11],[11,12],[12,13],[13,14],[14,15],[15,0],
  [16,18],[17,18],[18,10]
];
// Drawn fainter than the silhouette: the chart's "guide" lines.
var FOX_SOFT = [16, 17, 18];

// Unconnected field stars so the figure sits in a sky rather than floating alone.
var FOX_FIELD = [
  [-0.22, 0.16, 0.40], [1.19, 0.30, 0.34], [-0.14, 0.78, 0.30],
  [1.10, 0.82, 0.42], [0.30, -0.19, 0.28], [0.82, -0.14, 0.36],
  [0.20, 1.16, 0.32], [1.28, 0.58, 0.26]
];

function startField(cv, getCfg) {
  var ctx = cv.getContext("2d");

  var perm = new Uint8Array(512), b0 = new Uint8Array(256);
  for (var i0 = 0; i0 < 256; i0++) b0[i0] = i0;
  var sd = 1337; var rnd = function () { return (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; };
  for (var i1 = 255; i1 > 0; i1--) { var j = (rnd() * (i1 + 1)) | 0; var t = b0[i1]; b0[i1] = b0[j]; b0[j] = t; }
  for (var i2 = 0; i2 < 512; i2++) perm[i2] = b0[i2 & 255];
  var sm = function (t) { return t * t * t * (t * (t * 6 - 15) + 10); };
  var gr = function (h, x, y) { return ((h & 1) ? -x : x) + ((h & 2) ? -y : y); };
  var noise = function (x, y) {
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    var u = sm(x), v = sm(y), A = perm[X] + Y, B = perm[X + 1] + Y;
    var L = function (a, b, t) { return a + (b - a) * t; };
    return L(L(gr(perm[A], x, y), gr(perm[B], x - 1, y), u), L(gr(perm[A + 1], x, y - 1), gr(perm[B + 1], x - 1, y - 1), u), v);
  };
  var fbm = function (x, y) { return noise(x, y) * 0.6 + noise(x * 2.3, y * 2.3) * 0.28 + noise(x * 5.1, y * 5.1) * 0.12; };

  var W = 0, H = 0, dpr = 1, N = 0, MAX = 0;
  var ring = null, head = null, len = null, minLen = null, life = null, cap = null, klass = null;
  var clock = 0, target = 0, dirty = true, vel = 0;

  // Fleet classes: mostly scouts, a few cruisers, rare carriers.
  var CLASS_R = [0.55, 0.95, 1.7, 2.8];
  var classOf = function (r) { return r < 0.62 ? 0 : r < 0.87 ? 1 : r < 0.97 ? 2 : 3; };
  var sd2 = 24601;
  var rnd2 = function () { return (sd2 = (sd2 * 1103515245 + 12345) >>> 0) / 4294967296; };

  // one random pattern per page load, unless the caller pins one
  var picked = PATTERNS[(Math.random() * PATTERNS.length) | 0];
  var patternOf = function (c) { return (!c.pattern || c.pattern === "random") ? picked : c.pattern; };

  var angleFor = function (pattern, nx, ny, z, turb, scale) {
    switch (pattern) {
      case "ridges": return fbm(nx * 0.3 + 11.3, ny * 0.3 - 4.7) * Math.PI * turb + Math.PI * 0.5;
      case "swirl": {
        var dx = nx - 0.5 * W * scale, dy = ny - 0.5 * H * scale;
        return Math.atan2(dy, dx) + Math.PI * 0.5 + fbm(nx + z, ny + z) * turb * 0.6;
      }
      case "bands": return fbm(nx * 0.2, ny * 1.6 + z) * turb * 0.55;
      case "cells": return (fbm(nx * 1.8 + z, ny * 1.8) + fbm(ny * 1.1, nx * 1.1 - z)) * Math.PI * turb * 0.8;
      default: {
        var relief = fbm(nx * 0.28 + 11.3, ny * 0.28 - 4.7) * 2.4;
        return fbm(nx + z * 3, ny + relief + z) * Math.PI * turb + relief * 0.7;
      }
    }
  };

  var alloc = function () {
    var c = getCfg();
    N = c.count; MAX = Math.max(4, c.trail);
    ring = new Float32Array(N * MAX * 2);
    head = new Int32Array(N); len = new Int32Array(N); minLen = new Int32Array(N);
    life = new Int32Array(N); cap = new Int32Array(N); klass = new Uint8Array(N);
    var respawn0 = c.auto > 0 || c.mode !== "rewind";
    sd2 = 24601;
    for (var i = 0; i < N; i++) {
      var x = rnd2() * W, y = rnd2() * H;
      ring[i * MAX * 2] = x; ring[i * MAX * 2 + 1] = y;
      head[i] = 0; len[i] = 1; minLen[i] = 1;
      // Per-particle trail cap: with respawn on, only a minority ever reach full
      // length, which keeps standing coverage low enough for crossings to read.
      cap[i] = respawn0 ? Math.max(6, Math.floor(MAX * (0.12 + rnd2() * rnd2() * 0.9))) : MAX;
      life[i] = Math.floor(cap[i] * (0.4 + rnd2() * 1.6));
      klass[i] = classOf(rnd2());
    }
  };

  var stepForward = function () {
    var c = getCfg(), z = clock * 0.0009, pat = patternOf(c), m = 40;
    // Respawning is only safe when the timeline is never rewound (auto / one-way).
    var respawn = c.auto > 0 || c.mode !== "rewind";
    for (var i = 0; i < N; i++) {
      var base = i * MAX * 2, h = head[i];
      if (respawn && --life[i] <= 0) {
        var nx = Math.random() * W, ny = Math.random() * H;
        ring[base] = nx; ring[base + 1] = ny;
        head[i] = 0; len[i] = 1; minLen[i] = 1;
        cap[i] = Math.max(6, Math.floor(MAX * (0.12 + Math.random() * Math.random() * 0.9)));
        life[i] = Math.floor(cap[i] * (0.8 + Math.random() * 1.2));
        klass[i] = classOf(Math.random());
        continue;
      }
      var x = ring[base + h * 2], y = ring[base + h * 2 + 1];
      var a = angleFor(pat, x * c.scale, y * c.scale, z, c.turb, c.scale);
      x += Math.cos(a) * c.step; y += Math.sin(a) * c.step;
      if (x < -m) x += (-m - x) * 0.06; else if (x > W + m) x -= (x - (W + m)) * 0.06;
      if (y < -m) y += (-m - y) * 0.06; else if (y > H + m) y -= (y - (H + m)) * 0.06;
      var nh = (h + 1) % MAX;
      ring[base + nh * 2] = x; ring[base + nh * 2 + 1] = y;
      head[i] = nh;
      if (len[i] < cap[i]) len[i]++; else if (minLen[i] > 1) minLen[i]--;
    }
    clock++;
  };

  var stepBack = function () {
    var moved = false;
    for (var i = 0; i < N; i++) {
      if (len[i] > minLen[i]) { head[i] = (head[i] - 1 + MAX) % MAX; len[i]--; moved = true; }
    }
    if (moved) clock--;
    return moved;
  };

  var prewarm = function () {
    var n = Math.min(getCfg().prewarm, MAX - 1);
    for (var k = 0; k < n; k++) stepForward();
    for (var i = 0; i < N; i++) minLen[i] = len[i];
    clock = 0;
  };

  var lastY = window.scrollY;
  var reseed = function () { alloc(); prewarm(); target = clock; vel = 0; lastY = window.scrollY; dirty = true; };

  var resize = function () {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    reseed();
    if (REDUCED_MOTION) draw(0);
  };

  // Every advance of the fleet comes from a scroll gesture. `vel` decays so the
  // ships glide to a stop instead of freezing the instant the wheel does.
  var push = function (d) {
    var c = getCfg();
    if (c.auto > 0) return;
    if (c.mode !== "rewind") d = Math.abs(d);
    vel += d * 0.10 * (c.scrollPower || 1);
  };

  var onScroll = function () {
    var y = window.scrollY;
    push((y - lastY) * 0.06);
    lastY = y;
  };

  var pageScrolls = function () {
    return (document.documentElement.scrollHeight - window.innerHeight) > 4;
  };

  // Pages that fill exactly one viewport still deserve the gesture: read the
  // wheel / drag directly when there is nothing for the document to scroll.
  var onWheel = function (e) { if (!pageScrolls()) push(e.deltaY * 0.06); };
  var touchY = 0;
  var onTouchStart = function (e) { touchY = e.touches[0].clientY; };
  var onTouchMove = function (e) {
    var y = e.touches[0].clientY;
    if (!pageScrolls()) push((touchY - y) * 0.06);
    touchY = y;
  };

  // ---- fox ----
  var foxGeom = function () {
    var s = Math.min(W, H) * 0.46;          // head box width
    var hs = s * 1.02;                       // very slightly taller than wide
    var ox = W * 0.5 - s * 0.5, oy = H * 0.5 - hs * 0.52;
    var at = function (p) { return [ox + p[0] * s, oy + p[1] * hs, p[2]]; };
    return { head: FOX_STARS.map(at), field: FOX_FIELD.map(at) };
  };

  var drawFox = function (c, t, R, G, B) {
    var mode = c.fox;
    if (!mode || mode === "none") return;
    var strength = 1;
    if (mode === "glyph") {
      var doc = Math.max(1, document.body.scrollHeight - window.innerHeight);
      var p = Math.min(1, Math.max(0, window.scrollY / doc));
      strength = Math.max(0, 1 - Math.abs(p - 0.34) / 0.16);
    }
    if (strength <= 0.001) return;

    var g = foxGeom(), pts = g.head;
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgb(" + R + "," + G + "," + B + ")";
    ctx.lineWidth = 1;

    for (var e = 0; e < FOX_EDGES.length; e++) {
      var a = FOX_EDGES[e][0], b = FOX_EDGES[e][1];
      var soft = FOX_SOFT.indexOf(a) >= 0 && FOX_SOFT.indexOf(b) >= 0 ? 0.45 : 1;
      var breath = 0.5 + 0.5 * Math.sin(t * 0.45 + a * 0.6);
      ctx.globalAlpha = 0.055 * strength * soft * (0.55 + 0.45 * breath);
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }

    var star = function (x, y, mag, phase) {
      var tw = 0.55 + 0.45 * Math.sin(t * 0.8 + phase);
      var r = 2.0 * mag;
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
      rg.addColorStop(0, "rgba(" + R + "," + G + "," + B + "," + (0.6 * strength * tw).toFixed(3) + ")");
      rg.addColorStop(0.22, "rgba(" + R + "," + G + "," + B + "," + (0.15 * strength * tw).toFixed(3) + ")");
      rg.addColorStop(1, "rgba(" + R + "," + G + "," + B + ",0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r * 8, 0, Math.PI * 2);
      ctx.fill();
      // bright core
      ctx.globalAlpha = Math.min(1, 0.5 * strength * tw * mag);
      ctx.fillStyle = "rgb(" + R + "," + G + "," + B + ")";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.6, r * 0.34), 0, Math.PI * 2);
      ctx.fill();
    };

    for (var i3 = 0; i3 < pts.length; i3++) star(pts[i3][0], pts[i3][1], pts[i3][2], i3 * 1.9);
    for (var i4 = 0; i4 < g.field.length; i4++) star(g.field[i4][0], g.field[i4][1], g.field[i4][2], 3.1 + i4 * 2.4);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  // Fleet mode: each particle is a ship — a dot sized by class, trailing a short
  // wake. Reads as a formation crossing the field rather than a hair-line plot.
  var drawFleet = function (c, R, G, B) {
    var respawn = c.auto > 0 || c.mode !== "rewind";
    var ease = function (t) { return t * t * (3 - 2 * t); };
    var base = c.dot || 1.6;
    var wakeN = Math.max(2, Math.min(MAX - 1, Math.round(c.wake || 18)));
    var dots = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    var wakes = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    var alpha = [0, 0, 0, 0], seen = [0, 0, 0, 0];

    for (var i = 0; i < N; i++) {
      var l = len[i];
      if (l < 1) continue;
      var w = 1;
      if (respawn) {
        var fin = Math.min(1, l / Math.max(4, cap[i] * 0.35));
        var fout = Math.min(1, life[i] / Math.max(6, cap[i] * 0.6));
        w = ease(Math.min(fin, fout));
      }
      if (w <= 0.06) continue;
      var k = klass[i], b2 = i * MAX * 2, h = head[i];
      var x = ring[b2 + h * 2], y = ring[b2 + h * 2 + 1];
      var r = base * CLASS_R[k] * (0.6 + 0.4 * w);
      dots[k].moveTo(x + r, y);
      dots[k].arc(x, y, r, 0, Math.PI * 2);
      alpha[k] += w; seen[k]++;
      var K = Math.min(l, wakeN);
      if (K > 2) {
        var st = (h - (K - 1) + MAX * 2) % MAX;
        wakes[k].moveTo(ring[b2 + st * 2], ring[b2 + st * 2 + 1]);
        for (var s = 1; s < K; s++) {
          var idx = (st + s) % MAX;
          wakes[k].lineTo(ring[b2 + idx * 2], ring[b2 + idx * 2 + 1]);
        }
      }
    }

    ctx.globalCompositeOperation = "lighter";
    var col = "rgb(" + R + "," + G + "," + B + ")";
    for (var k2 = 0; k2 < 4; k2++) {
      if (!seen[k2]) continue;
      var a2 = alpha[k2] / seen[k2];
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(0.4, base * CLASS_R[k2] * 0.42);
      ctx.globalAlpha = Math.min(1, c.opacity * c.bright * a2 * 0.5);
      ctx.stroke(wakes[k2]);
      ctx.fillStyle = col;
      ctx.globalAlpha = Math.min(1, c.opacity * c.bright * a2 * (1.1 + k2 * 0.5));
      ctx.fill(dots[k2]);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  var draw = function (t) {
    var c = getCfg();
    var hex = c.ink.replace("#", "");
    var R = parseInt(hex.slice(0, 2), 16), G = parseInt(hex.slice(2, 4), 16), B = parseInt(hex.slice(4, 6), 16);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    if (c.render === "dots") { drawFleet(c, R, G, B); drawFox(c, t, R, G, B); return; }

    var total = 0;
    for (var i = 0; i < N; i++) total += len[i];
    var stride = Math.max(1, Math.ceil(total / 200000));

    // Particles are bucketed by rendered weight, so a fading trail simply moves
    // down a bucket instead of vanishing on the frame it dies.
    var LV = 6, weights = [0.55, 0.8, 1.0];
    var paths = []; for (var bb = 0; bb < LV; bb++) paths.push(new Path2D());
    var respawn = c.auto > 0 || c.mode !== "rewind";
    var ease2 = function (t) { return t * t * (3 - 2 * t); };

    for (var i5 = 0; i5 < N; i5++) {
      var l2 = len[i5];
      if (l2 < 2) continue;
      var w2 = weights[i5 % 3];
      if (respawn) {
        var rampIn = Math.max(4, cap[i5] * 0.35);
        var rampOut = Math.max(6, cap[i5] * 0.6);
        var fin2 = Math.min(1, l2 / rampIn);
        var fout2 = Math.min(1, life[i5] / rampOut);
        w2 *= ease2(Math.min(fin2, fout2));
      }
      var b3 = Math.round(w2 * (LV - 1));
      if (b3 <= 0) continue;
      var path = paths[b3], base2 = i5 * MAX * 2, h2 = head[i5];
      var start = (h2 - (l2 - 1) + MAX * 2) % MAX;
      path.moveTo(ring[base2 + start * 2], ring[base2 + start * 2 + 1]);
      for (var k3 = stride; k3 < l2; k3 += stride) {
        var idx2 = (start + k3) % MAX;
        path.lineTo(ring[base2 + idx2 * 2], ring[base2 + idx2 * 2 + 1]);
      }
      if ((l2 - 1) % stride !== 0) path.lineTo(ring[base2 + h2 * 2], ring[base2 + h2 * 2 + 1]);
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgb(" + R + "," + G + "," + B + ")";
    for (var b4 = 1; b4 < LV; b4++) {
      var f = b4 / (LV - 1);
      ctx.globalAlpha = Math.min(1, c.opacity * c.bright * f);
      ctx.lineWidth = c.width * (0.8 + 0.2 * f);
      ctx.stroke(paths[b4]);
    }
    ctx.globalAlpha = 1;
    drawFox(c, t, R, G, B);
  };

  var raf = 0, t = 0;
  var tick = function () {
    raf = requestAnimationFrame(tick);
    t += 1 / 60;
    var c = getCfg();
    if (c.auto > 0) target += c.auto;
    if (Math.abs(vel) > 0.0015) { target += vel; vel *= 0.90; } else vel = 0;
    var breath = c.drift * 14 * Math.sin(t * 0.22) + c.drift * 5 * Math.sin(t * 0.71 + 1.3);
    var want = Math.round(target + breath);
    var budget = 14;
    while (clock < want && budget-- > 0) { stepForward(); dirty = true; }
    while (clock > want && budget-- > 0) { if (!stepBack()) break; dirty = true; }
    if (dirty || c.auto > 0 || (c.fox && c.fox !== "none")) { draw(t); dirty = false; }
  };

  resize();
  window.addEventListener("resize", resize);
  if (!REDUCED_MOTION) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    raf = requestAnimationFrame(tick);
  }

  return {
    reseed: reseed,
    setPattern: function (p) { if (p && p !== "random") picked = p; else picked = PATTERNS[(Math.random() * PATTERNS.length) | 0]; reseed(); },
    get pattern() { return patternOf(getCfg()); },
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    }
  };
}

// Pixel fox that wanders the baseline of the page, stops, sits, then moves on.
// Sprite sheet: 4 cols x 4 rows of 48x32 frames.
//   row 0 idle (side)   row 1 walk (side)
//   row 2 sit-down transition (side -> front)   row 3 sitting (front)
var FW = 48, FH = 32, COLS = 4;

function startFox(el, opts) {
  var o = Object.assign({ scale: 3, speed: 26, margin: 64, still: false }, opts || {});
  var S = o.scale;

  el.style.width = FW * S + "px";
  el.style.height = FH * S + "px";
  el.style.backgroundImage = "url(assets/fox-sprite.png)";
  el.style.backgroundSize = FW * COLS * S + "px " + FH * 4 * S + "px";
  el.style.imageRendering = "pixelated";
  el.style.willChange = "background-position";
  if (!o.still) {
    el.style.position = "absolute";
    el.style.bottom = "0";
    el.style.left = "0";
    el.style.willChange = "transform, background-position";
  }

  // Pinned sit: holds the sitting pose, with an occasional ear/tail twitch — until
  // dash() is called, when it stands, runs a short lap, and settles back down.
  if (o.still) {
    var RUN = o.dashRange || 130, SPEED = 92;
    var raf1 = 0, t1 = 0, last1 = performance.now();
    var next = 2 + Math.random() * 3, twitch = -1;
    var phase1 = "sit", x1 = 0, dir1 = 1, leg = 0, frame1 = 0, ft1 = 0;
    var show1 = function (row, fr) { el.style.backgroundPosition = "-" + fr * FW * S + "px -" + row * FH * S + "px"; };
    var move1 = function () { el.style.transform = "translateX(" + Math.round(x1) + "px) scaleX(" + dir1 + ")"; };
    show1(3, 0);
    var loop1 = function (now) {
      raf1 = requestAnimationFrame(loop1);
      var dt = Math.min(0.05, (now - last1) / 1000);
      last1 = now; t1 += dt;

      if (phase1 === "sit") {
        if (twitch < 0 && t1 >= next) { twitch = 0; t1 = 0; }
        if (twitch >= 0) {
          var seq = [1, 2, 3, 2, 1, 0];
          var i = Math.floor(t1 / 0.09);
          if (i >= seq.length) { twitch = -1; t1 = 0; next = 2.5 + Math.random() * 4; show1(3, 0); }
          else show1(3, seq[i]);
        }
        return;
      }

      if (phase1 === "standup") {
        show1(2, 3 - Math.min(3, Math.floor(t1 / 0.13)));
        if (t1 >= 0.55) { phase1 = "run"; t1 = 0; leg = 0; dir1 = 1; frame1 = 0; ft1 = 0; }
        return;
      }

      if (phase1 === "run") {
        ft1 += dt;
        if (ft1 >= 0.12) { ft1 = 0; frame1 = (frame1 + 1) % COLS; }
        show1(1, frame1);
        x1 += dir1 * SPEED * dt;
        if (leg === 0 && x1 >= RUN) { x1 = RUN; dir1 = -1; leg = 1; }
        else if (leg === 1 && x1 <= -RUN * 0.45) { x1 = -RUN * 0.45; dir1 = 1; leg = 2; }
        else if (leg === 2 && x1 >= 0) { x1 = 0; phase1 = "sitdown"; t1 = 0; }
        move1();
        return;
      }

      show1(2, Math.min(3, Math.floor(t1 / 0.13)));
      if (t1 >= 0.55) { phase1 = "sit"; t1 = 0; twitch = -1; next = 2 + Math.random() * 3; show1(3, 0); }
    };
    if (!REDUCED_MOTION) raf1 = requestAnimationFrame(loop1);
    return {
      dash: function () { if (!REDUCED_MOTION && phase1 === "sit") { phase1 = "standup"; t1 = 0; twitch = -1; } },
      destroy: function () { cancelAnimationFrame(raf1); }
    };
  }

  var bounds = function () {
    var p = el.parentElement;
    return { lo: o.margin, hi: Math.max(o.margin + 40, (p ? p.clientWidth : window.innerWidth) - o.margin - FW * S) };
  };

  var x = bounds().lo + Math.random() * 120;
  var dir = 1, row = 1, frame = 0, ft = 0;
  var phase = "walk", pt = 0, dur = 4 + Math.random() * 5;

  var setPhase = function (p) {
    phase = p; frame = 0; ft = 0; pt = 0;
    if (p === "walk") { row = 1; dur = 5 + Math.random() * 7; }
    else if (p === "idle") { row = 0; dur = 1.6 + Math.random() * 2.4; }
    else if (p === "sitdown") { row = 2; dur = 0.56; }
    else if (p === "sit") { row = 3; dur = 4 + Math.random() * 6; }
    else if (p === "standup") { row = 2; dur = 0.56; }
  };

  var paint = function () {
    el.style.backgroundPosition = "-" + frame * FW * S + "px -" + row * FH * S + "px";
    el.style.transform = "translateX(" + Math.round(x) + "px) scaleX(" + dir + ")";
  };
  paint();

  var raf = 0, last = performance.now();
  var tick = function (now) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now; pt += dt; ft += dt;

    var rate = phase === "walk" ? 0.13 : phase === "sit" ? 0.28 : phase === "idle" ? 0.22 : 0.14;
    if (ft >= rate) {
      ft = 0;
      if (phase === "sitdown") frame = Math.min(3, frame + 1);
      else if (phase === "standup") frame = Math.min(3, frame + 1);
      else frame = (frame + 1) % COLS;
    }

    if (phase === "walk") {
      var b = bounds();
      x += dir * o.speed * dt;
      if (x <= b.lo) { x = b.lo; dir = 1; }
      if (x >= b.hi) { x = b.hi; dir = -1; }
      if (pt >= dur) setPhase(Math.random() < 0.55 ? "sitdown" : "idle");
    } else if (pt >= dur) {
      if (phase === "sitdown") setPhase("sit");
      else if (phase === "sit") setPhase("standup");
      else if (phase === "standup") { dir = Math.random() < 0.5 ? 1 : -1; setPhase("walk"); }
      else setPhase("walk");
    }

    // standup plays the transition backwards
    if (phase === "standup") {
      var f = 3 - Math.min(3, Math.floor(pt / 0.14));
      el.style.backgroundPosition = "-" + f * FW * S + "px -" + row * FH * S + "px";
      el.style.transform = "translateX(" + Math.round(x) + "px) scaleX(" + dir + ")";
      return;
    }
    paint();
  };
  if (!REDUCED_MOTION) raf = requestAnimationFrame(tick);

  return { dash: function () {}, destroy: function () { cancelAnimationFrame(raf); } };
}

// A rail that threads the entries of a list: a faint track, a star at every entry,
// and a small fleet of craft that travels star to star. The fleet's position is the
// page's scroll position mapped onto the rail — nothing moves unless you scroll.
function startSpine(svg, rowsEl, opts) {
  var o = Object.assign({ ink: "#c9d6e6", ships: 9 }, opts || {});
  var NS = "http://www.w3.org/2000/svg";
  var uid = "sp" + Math.random().toString(36).slice(2, 8);
  var raf = 0, H = 0, cx = 0, nodes = [], ships = [], railTop = 0;

  svg.setAttribute("xmlns", NS);
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";

  var mk = function (tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  var defs = mk("defs", {});
  var grad = mk("linearGradient", { id: uid, x1: "0", y1: "0", x2: "0", y2: "1" });
  var stops = [["0", "0"], ["0.1", "0.16"], ["0.9", "0.16"], ["1", "0"]];
  for (var si = 0; si < stops.length; si++) {
    grad.appendChild(mk("stop", { offset: stops[si][0], "stop-color": o.ink, "stop-opacity": stops[si][1] }));
  }
  defs.appendChild(grad);
  var track = mk("line", { stroke: "url(#" + uid + ")", "stroke-width": "1" });
  var gStars = mk("g", {});
  var gShips = mk("g", {});
  svg.appendChild(defs); svg.appendChild(track); svg.appendChild(gStars); svg.appendChild(gShips);

  // A fleet reads as a fleet when the craft differ: a couple of heavy ones near the
  // lane, scouts scattered wider and running slightly ahead or behind.
  var RAD = [2.6, 1.1, 1.7, 0.9, 1.3, 2.1, 1.0, 1.5, 0.85, 1.2, 1.9, 1.0];
  for (var i = 0; i < o.ships; i++) {
    var r = RAD[i % RAD.length];
    var wake = mk("line", { stroke: o.ink, "stroke-width": String(Math.max(0.6, r * 0.5)), "stroke-opacity": "0", "stroke-linecap": "round" });
    var dot = mk("circle", { r: r, fill: o.ink, "fill-opacity": "0.75" });
    gShips.appendChild(wake); gShips.appendChild(dot);
    ships.push({
      wake: wake, dot: dot, r: r,
      u: 0, sp: 0, idle: 0,
      lane: (i % 2 ? 1 : -1) * (1.6 + (i * 2.7) % 6) * (r < 1.4 ? 1 : 0.35), // scouts spread, heavies hold the line
      off: -0.012 * i - (i % 3) * 0.008,                                      // formation depth
      ease: 0.16 - (i % 4) * 0.022
    });
  }

  var build = function () {
    var rail = svg.parentElement.getBoundingClientRect();
    var rowsBox = rowsEl.getBoundingClientRect();
    var W = rail.width || 56;
    cx = Math.round(W * 0.5) + 0.5;
    H = rowsBox.height;
    railTop = rowsBox.top + window.scrollY;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.style.width = W + "px";
    svg.style.height = H + "px";

    track.setAttribute("x1", cx); track.setAttribute("x2", cx);
    track.setAttribute("y1", -12); track.setAttribute("y2", H + 12);

    while (gStars.firstChild) gStars.removeChild(gStars.firstChild);
    nodes = [];
    rowsEl.querySelectorAll("[data-node]").forEach(function (el) {
      var r = el.getBoundingClientRect();
      var y = r.top - rowsBox.top + Math.min(24, r.height / 2);
      var halo = mk("circle", { cx: cx, cy: y, r: 6, fill: o.ink, "fill-opacity": "0.06" });
      var core = mk("circle", { cx: cx, cy: y, r: 2, fill: o.ink, "fill-opacity": "0.65" });
      halo.style.transition = "r .45s cubic-bezier(.2,.8,.2,1), fill-opacity .45s ease";
      core.style.transition = "r .45s cubic-bezier(.2,.8,.2,1)";
      gStars.appendChild(halo); gStars.appendChild(core);
      nodes.push({ halo: halo, core: core, y: y, lit: 0 });
      el.addEventListener("mouseenter", function () {
        halo.setAttribute("r", 14); halo.setAttribute("fill-opacity", "0.15"); core.setAttribute("r", 3.2);
      });
      el.addEventListener("mouseleave", function () {
        halo.setAttribute("r", 6); halo.setAttribute("fill-opacity", "0.06"); core.setAttribute("r", 2);
      });
    });
  };

  // Scroll is the only input: where the reader is on the rail is where the fleet is.
  // Read in the frame, not in the scroll handler, so a burst of scroll events costs
  // one layout read instead of dozens.
  var targetU = 0, pending = true;
  var readScroll = function () { pending = true; };
  if (!REDUCED_MOTION) window.addEventListener("scroll", readScroll, { passive: true });

  var aimAt = function (u) { return Math.max(0, Math.min(1, u)); };
  var sample = function () {
    return aimAt((window.scrollY + window.innerHeight * 0.55 - railTop) / H);
  };

  var tick = function () {
    raf = requestAnimationFrame(tick);
    if (!H) return;
    if (pending) { targetU = sample(); pending = false; }

    var busy = false, lo = 2, hi = -1;
    for (var si2 = 0; si2 < ships.length; si2++) {
      var s = ships[si2];
      var d = aimAt(targetU + s.off) - s.u;
      var settled = Math.abs(d) < 0.00006 && s.sp < 0.004;
      if (settled) { if (s.idle) { if (s.u < lo) lo = s.u; if (s.u > hi) hi = s.u; continue; } s.idle = 1; }
      else { s.idle = 0; busy = true; }
      s.u += d * s.ease;
      // smoothed speed: raw per-frame delta flickers and makes the lane offset jitter
      s.sp += (Math.min(1, Math.abs(d) * 22) - s.sp) * 0.18;
      var sp = s.sp;
      var y = s.u * H;
      var x = cx + s.lane * (0.35 + 0.65 * sp);
      var dirn = d >= 0 ? 1 : -1;
      var tail = (4 + sp * 46) * (0.5 + s.r * 0.35);
      s.dot.setAttribute("cx", x.toFixed(2));
      s.dot.setAttribute("cy", y.toFixed(2));
      s.dot.setAttribute("fill-opacity", (0.35 + 0.55 * Math.min(1, 0.4 + sp)).toFixed(3));
      s.wake.setAttribute("x1", x.toFixed(2)); s.wake.setAttribute("x2", x.toFixed(2));
      s.wake.setAttribute("y1", (y - dirn * tail).toFixed(2));
      s.wake.setAttribute("y2", y.toFixed(2));
      s.wake.setAttribute("stroke-opacity", (0.03 + 0.22 * sp).toFixed(3));
      if (s.u < lo) lo = s.u;
      if (s.u > hi) hi = s.u;
    }

    // A star lights as a craft passes. Only the stars inside the fleet's band can
    // change, so long lists cost the same as short ones.
    if (busy && hi >= lo) {
      var top = lo * H - 70, bot = hi * H + 70;
      for (var ni = 0; ni < nodes.length; ni++) {
        var n = nodes[ni];
        var near = n.y >= top && n.y <= bot;
        if (!near) {
          if (n.lit) { n.lit = 0; n.core.setAttribute("fill-opacity", "0.5"); n.halo.setAttribute("fill-opacity", "0.06"); }
          continue;
        }
        var g = 0;
        for (var si3 = 0; si3 < ships.length; si3++) {
          var q = 1 - Math.abs(ships[si3].u * H - n.y) / 70;
          if (q > g) g = q;
        }
        if (g < 0) g = 0;
        n.lit = 1;
        n.core.setAttribute("fill-opacity", (0.5 + 0.5 * g).toFixed(3));
        n.halo.setAttribute("fill-opacity", (0.06 + 0.1 * g).toFixed(3));
      }
    }
  };

  build();
  targetU = sample();
  for (var si4 = 0; si4 < ships.length; si4++) ships[si4].u = aimAt(targetU + ships[si4].off);
  if (!REDUCED_MOTION) raf = requestAnimationFrame(tick);
  var ro = new ResizeObserver(function () { build(); pending = true; });
  ro.observe(rowsEl);

  return {
    refresh: function () { build(); pending = true; },
    destroy: function () {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", readScroll);
    }
  };
}

// Shared page chrome: responsive nav, fox mascot, particle field, optional spine.
// Static-page replacement for the dc-runtime component shell — no React involved.
function initChrome(opts) {
  var o = opts || {};
  var onResize = function () {
    var narrow = window.innerWidth < 720;
    document.body.classList.toggle("narrow", narrow);
    if (!narrow) document.body.classList.remove("nav-open");
  };
  onResize();
  window.addEventListener("resize", onResize);

  if (o.navToggle) {
    o.navToggle.addEventListener("click", function () {
      document.body.classList.toggle("nav-open");
    });
  }

  var result = {};

  if (o.canvas) {
    result.field = startField(o.canvas, typeof o.cfg === "function" ? o.cfg : function () { return o.cfg; });
  }

  if (o.foxEl) {
    result.fox = startFox(o.foxEl, { scale: 1.5, still: true });
    if (o.foxEl.hasAttribute("data-fox-dash")) {
      o.foxEl.addEventListener("click", function () { if (result.fox) result.fox.dash(); });
    }
  }

  if (o.spineSvg && o.spineRows) {
    result.spine = startSpine(o.spineSvg, o.spineRows, { ink: (o.cfg && o.cfg.ink) || "#c9d6e6" });
  }

  return result;
}

window.Flow = { PATTERNS: PATTERNS, startField: startField, startFox: startFox, startSpine: startSpine, initChrome: initChrome };
})();
