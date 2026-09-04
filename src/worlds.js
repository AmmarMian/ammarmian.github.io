/* worlds.js — backdrop worlds, outer tower shell and the teleport transition
 * for the sorcerer's tower.
 *
 * Self-contained: nothing here reaches into lair.js. Drop-in usage:
 *
 *   import { installWorlds } from './worlds.js';
 *   const worlds = installWorlds({ THREE, scene, camera, model, fx, dims });
 *   worlds.set('seafloor');            // 'seafloor' | 'moon' | 'forest' | 'beach' | 'city' | 'space' | null
 *   worlds.shell('ghost');             // 'off' | 'ghost' | 'solid'
 *   worlds.teleport('forest');         // rise into light, swap world, descend
 *   worlds.tick(tSeconds, dtSeconds);  // once per frame
 *
 * dims: { R, FH, NF, WH, TOP? }
 */

export function installWorlds({ THREE, scene, camera, model, fx, dims }) {
  const { R, FH, NF, WH } = dims;
  const ROT = dims.ROT ?? 102;   // degrees each storey is rotated
  const TOP = dims.TOP ?? FH * (NF - 1) + WH;
  const RAD = (a) => (a * Math.PI) / 180;
  const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);

  /* merge a few small static geometries without BufferGeometryUtils */
  function mergeG(list) {
    const parts = list.map((gg) => (gg.index ? gg.toNonIndexed() : gg));
    let total = 0;
    for (const p of parts) total += p.attributes.position.count;
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3);
    let o = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, o * 3);
      nrm.set(p.attributes.normal.array, o * 3);
      o += p.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    return out;
  }

  /* ========================= shared shader plumbing ====================== */

  const NOISE = `
    float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=hash21(i), b=hash21(i+vec2(1.0,0.0)), c=hash21(i+vec2(0.0,1.0)), d=hash21(i+vec2(1.0,1.0));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
    float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
  `;

  // instanceMatrix is only declared on instanced draws, so guard it
  const IM = `mat4 wIM = mat4(1.0);
    #ifdef USE_INSTANCING
      wIM = instanceMatrix;
    #endif`;

  const uT = { value: 0 };      // one clock for every custom shader
  const uWind = { value: 1 };
  /* x-ray occluders: anything sitting between the camera and the tower
     dissolves with a screen-door pattern — no sorting, no extra passes */
  const uFadeOn = { value: 0 };
  const uFadeTgt = { value: new THREE.Vector3(0, TOP * 0.45, 0) };
  const uFadeRad = { value: 15 };
  const uFadeAmt = { value: 0.9 };

  /* Keep three's lighting/shadow/fog pipeline and inject only what we need:
     world position, a world normal, and a hook in the diffuse stage. Far
     cheaper to get right than a hand-rolled lighting model. */
  function patchStd(mat, { frag = '', vert = '', emis = '', occluder = false, uniforms = {} } = {}) {
    mat.onBeforeCompile = (s) => {
      s.uniforms.uT = uT;
      s.uniforms.uWind = uWind;
      s.uniforms.uFadeOn = uFadeOn;
      s.uniforms.uFadeTgt = uFadeTgt;
      s.uniforms.uFadeRad = uFadeRad;
      s.uniforms.uFadeAmt = uFadeAmt;
      for (const k in uniforms) s.uniforms[k] = uniforms[k];
      s.vertexShader = `varying vec3 vWP;\nvarying vec3 vWN;\nvarying float vFade;\nuniform float uT;\nuniform float uWind;\nuniform float uFadeOn;\nuniform vec3 uFadeTgt;\nuniform float uFadeRad;\nuniform float uFadeAmt;\n${NOISE}\n` +
        s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          ${IM}
          vWN = normalize(mat3(modelMatrix) * mat3(wIM) * objectNormal);
          ${vert}
          vWP = (modelMatrix * wIM * vec4(transformed, 1.0)).xyz;
          vFade = 0.0;
          ${occluder ? `
          if (uFadeOn > 0.5) {
            // does this instance sit in the cylinder between eye and tower?
            vec3 origin = (modelMatrix * wIM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            vec3 ax = uFadeTgt - cameraPosition;
            float L = max(length(ax), 0.001);
            ax /= L;
            vec3 rel = origin - cameraPosition;
            float along = dot(rel, ax) / L;
            float perp = length(rel - ax * (along * L));
            vFade = smoothstep(0.02, 0.22, along) * (1.0 - smoothstep(0.78, 0.97, along))
                  * (1.0 - smoothstep(uFadeRad, uFadeRad * 2.0, perp));
            vFade = clamp(vFade * uFadeAmt, 0.0, 1.0);
          }` : ''}`);
      let fs = s.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>\n${frag}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${emis}`);
      if (occluder) {
        /* occluders between eye and tower fade right out. alphaTest runs
           first so the leaf silhouette survives; then the whole surface is
           blended down — true transparency, no dither pattern. */
        fs = fs.replace('#include <alphatest_fragment>', `
          #include <alphatest_fragment>
          diffuseColor.a *= 1.0 - vFade;
          if (diffuseColor.a < 0.004) discard;`);
      }
      s.fragmentShader = `varying vec3 vWP;\nvarying vec3 vWN;\nvarying float vFade;\nuniform float uT;\nuniform float uFadeAmt;\n${NOISE}\n` + fs;
    };
    mat.customProgramCacheKey = () => 'w' + (frag.length * 31 + vert.length * 7 + emis.length) + (occluder ? 'o' : '');
    return mat;
  }

  function skyDome(top, mid, bot, radius = 460) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        cTop: { value: new THREE.Color(top) },
        cMid: { value: new THREE.Color(mid) },
        cBot: { value: new THREE.Color(bot) },
      },
      vertexShader: `varying vec3 vP;
        void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; uniform vec3 cTop, cMid, cBot;
        void main(){
          float h = normalize(vP).y;
          vec3 c = h > 0.0 ? mix(cMid, cTop, pow(h, 0.62)) : mix(cMid, cBot, pow(-h, 0.55));
          float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453) - 0.5;
          gl_FragColor = vec4(c + d * 0.006, 1.0);
        }`,
    }));
    dome.renderOrder = -10;
    return dome;
  }

  const softTex = (() => {
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const rayTex = (() => {
    const W = 8, H = 128, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.26)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  function lightShafts(parent, { count, color, top, len, rTop, rBot, spread, opacity }) {
    const mat = new THREE.MeshBasicMaterial({
      map: rayTex, color, transparent: true, opacity, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const geo = new THREE.CylinderGeometry(rTop, rBot, len, 7, 1, true);
    const rays = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const d = spread * (0.3 + Math.random() * 0.7);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(a) * d, top - len / 2, Math.sin(a) * d);
      m.rotation.set(rnd(0.11, -0.11), rnd(3), rnd(0.11, -0.11));
      m.userData = { b: m.rotation.z, p: rnd(6) };
      parent.add(m);
      rays.push(m);
    }
    rays.mat = mat;
    return rays;
  }

  function pointCloud(parent, n, spawn, { color, size, opacity = 0.8, additive = true }) {
    const pos = new Float32Array(n * 3), vel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = spawn(i);
      pos.set([p.x, p.y, p.z], i * 3); vel[i] = p.v ?? 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size, map: softTex, transparent: true, opacity, depthWrite: false,
      sizeAttenuation: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    m.frustumCulled = false;
    parent.add(m);
    return { m, pos, vel, n };
  }

  // scatter helper: fill an InstancedMesh from a generator, trim the count
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(),
    _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
  const YUP = new THREE.Vector3(0, 1, 0);

  /* ============================ scene lighting =========================== */

  const rig = { hemi: null, keys: [] };
  scene.traverse((o) => {
    if (o.isHemisphereLight) rig.hemi = o;
    else if (o.isDirectionalLight) rig.keys.push(o);
  });
  const rigDefaults = {
    hemi: rig.hemi && { i: rig.hemi.intensity, sky: rig.hemi.color.clone(), gnd: rig.hemi.groundColor.clone() },
    keys: rig.keys.map((l) => ({ i: l.intensity, c: l.color.clone(), p: l.position.clone() })),
  };
  function applyLight(cfg) {
    if (rig.hemi) {
      const d = rigDefaults.hemi;
      rig.hemi.intensity = cfg ? cfg.hemi.i : d.i;
      rig.hemi.color.set(cfg ? cfg.hemi.sky : d.sky);
      rig.hemi.groundColor.set(cfg ? cfg.hemi.gnd : d.gnd);
    }
    rig.keys.forEach((l, i) => {
      const d = rigDefaults.keys[i];
      if (!cfg) { l.intensity = d.i; l.color.copy(d.c); l.position.copy(d.p); return; }
      const k = l.castShadow ? cfg.key : cfg.fill;
      l.intensity = d.i * k.mul;
      l.color.set(k.c);
      if (l.castShadow && k.p) l.position.set(...k.p);
    });
  }

  /* ======================= 1 · underwater seafloor ======================= */

  function buildSeafloor() {
    const g = new THREE.Group();
    g.name = 'world_seafloor';
    g.add(skyDome(0x3f97b8, 0x0d3f60, 0x02101c));

    /* sand: CPU dunes, then caustics in the fragment shader. two scrolling fbm
       fields subtracted give the ridged web of light a wave-lensed surface
       throws, for the price of one extra noise sample. */
    const sgeo = new THREE.PlaneGeometry(520, 520, 110, 110);
    const sp = sgeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i);
      const d = Math.hypot(x, y);
      const h = Math.sin(x * 0.045) * Math.cos(y * 0.037) * 1.6 + Math.sin(x * 0.012 + y * 0.02) * 3.4;
      sp.setZ(i, h * Math.min(1, Math.max(0, (d - 7.5) / 14)));
    }
    sgeo.computeVertexNormals();
    const sand = new THREE.Mesh(sgeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0xa9946d, roughness: 1, flatShading: true }), {
        frag: `
          vec2 cp = vWP.xz * 0.11;
          float a = fbm(cp + vec2(uT * 0.055, uT * 0.041));
          float b = fbm(cp * 1.63 - vec2(uT * 0.032, uT * 0.06));
          float caus = pow(max(0.0, 1.0 - abs(a - b) * 4.4), 3.0);
          diffuseColor.rgb *= 0.6 + 0.62 * fbm(cp * 0.42);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20,0.40,0.42), 0.36);
          diffuseColor.rgb += vec3(0.40,0.78,0.72) * caus * 0.9;
        `,
      }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -0.06;
    sand.receiveShadow = true;
    g.add(sand);

    const rockMat = patchStd(new THREE.MeshStandardMaterial({ color: 0x4a5a5c, roughness: 1, flatShading: true }), {
      frag: `diffuseColor.rgb *= 0.7 + 0.6 * fbm(vWP.xz * 0.5 + vWP.y * 0.3);
             diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18,0.34,0.30), 0.3);`,
    });
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 40);
    for (let i = 0; i < 40; i++) {
      const a = rnd(6.28), d = rnd(190, 13), sz = rnd(5, 1);
      _e.set(rnd(3), rnd(3), rnd(3));
      rocks.setMatrixAt(i, _m4.compose(
        _v.set(Math.cos(a) * d, -sz * 0.4, Math.sin(a) * d),
        _q.setFromEuler(_e), _s.set(sz, sz * rnd(1, 0.45), sz)));
    }
    rocks.receiveShadow = true;
    g.add(rocks);

    /* the surface, far overhead — its own shader so fog doesn't flatten it */
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uT },
      vertexShader: `varying vec2 vP;
        void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${NOISE}
        varying vec2 vP; uniform float uT;
        void main(){
          vec2 p = vP * 0.035;
          float a = fbm(p + vec2(uT*0.09, uT*0.05));
          float b = fbm(p*1.7 - vec2(uT*0.05, uT*0.08));
          float w = pow(max(0.0, 1.0 - abs(a-b)*3.6), 2.4);
          float fade = 1.0 - smoothstep(120.0, 340.0, length(vP));
          gl_FragColor = vec4(vec3(0.52,0.86,0.92) * (0.09 + w * 0.95) * fade, 1.0);
        }`,
    }));
    surf.rotation.x = Math.PI / 2;
    surf.position.y = 86;
    g.add(surf);

    const rays = lightShafts(g, { count: 10, color: 0x9fe8ff, top: 84, len: 98, rTop: 3, rBot: 13, spread: 92, opacity: 0.1 });

    /* kelp — instanced blades swayed entirely on the GPU */
    const kelpGeo = new THREE.PlaneGeometry(0.3, 2.9, 1, 4);
    kelpGeo.translate(0, 1.45, 0);
    const kelp = new THREE.InstancedMesh(kelpGeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0x2f6b4a, roughness: 1, flatShading: true, side: THREE.DoubleSide }), {
        vert: `
          vec3 base = (modelMatrix * wIM * vec4(0.0,0.0,0.0,1.0)).xyz;
          float ph = base.x * 0.28 + base.z * 0.19;
          float k = pow(clamp(transformed.y / 2.9, 0.0, 1.0), 1.6);
          transformed.x += sin(uT * 0.9 + ph) * k * 0.75 * uWind;
          transformed.z += cos(uT * 0.7 + ph * 1.3) * k * 0.5 * uWind;
        `,
        frag: `diffuseColor.rgb *= 0.45 + 0.85 * clamp(vWP.y / 2.9, 0.0, 1.0);`,
      }), 900);
    for (let i = 0; i < 900; i++) {
      const a = rnd(6.28), d = rnd(180, 11);
      kelp.setMatrixAt(i, _m4.compose(
        _v.set(Math.cos(a) * d, -0.2, Math.sin(a) * d),
        _q.setFromAxisAngle(YUP, rnd(6.28)),
        _s.set(rnd(1.3, 0.6), rnd(1.7, 0.55), 1)));
    }
    kelp.frustumCulled = false;
    g.add(kelp);

    /* fish schools — one draw call each; the orbit and the tail flap are both
       computed in the vertex shader from per-instance attributes */
    /* merge without BufferGeometryUtils: everything here is tiny and static */
    function mergeGeos(list) {
      let total = 0;
      const parts = list.map((gg) => (gg.index ? gg.toNonIndexed() : gg));
      for (const p of parts) total += p.attributes.position.count;
      const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3);
      let o = 0;
      for (const p of parts) {
        pos.set(p.attributes.position.array, o * 3);
        nrm.set(p.attributes.normal.array, o * 3);
        o += p.attributes.position.count;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      return out;
    }
    /* body = squashed octahedron (pointed nose and tail root), plus a forked
       caudal fin, a dorsal and two pectorals. reads as a fish at any scale. */
    function fishGeo(size) {
      const body = new THREE.OctahedronGeometry(1, 0);
      body.scale(size * 0.30, size * 0.52, size * 1.5);
      const tail = new THREE.BoxGeometry(size * 0.08, size * 0.9, size * 0.62);
      tail.translate(0, size * 0.08, -size * 1.62);
      const tail2 = new THREE.BoxGeometry(size * 0.08, size * 0.42, size * 0.3);
      tail2.translate(0, -size * 0.34, -size * 1.28);
      const dorsal = new THREE.BoxGeometry(size * 0.07, size * 0.5, size * 0.7);
      dorsal.translate(0, size * 0.52, -size * 0.1);
      const finL = new THREE.BoxGeometry(size * 0.5, size * 0.06, size * 0.3);
      finL.translate(-size * 0.3, -size * 0.1, size * 0.25);
      const finR = finL.clone();
      finR.translate(size * 0.6, 0, 0);
      return mergeGeos([body, tail, tail2, dorsal, finL, finR]);
    }
    function school(n, center, radius, yBase, color, size, speed) {
      const geo = fishGeo(size);
      const seed = new Float32Array(n * 4), ctr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        seed.set([radius + rnd(7, -7), yBase + rnd(7, -7), rnd(6.28), speed * rnd(1.25, 0.8)], i * 4);
        ctr.set([center[0] + rnd(5, -5), center[1], center[2] + rnd(5, -5)], i * 3);
      }
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
      geo.setAttribute('aCtr', new THREE.InstancedBufferAttribute(ctr, 3));
      const mat = patchStd(new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true }), {
        vert: `
          float ang = aSeed.z + uT * aSeed.w;
          vec3 c = aCtr + vec3(cos(ang) * aSeed.x, aSeed.y + sin(uT * 0.6 + aSeed.z) * 1.7, sin(ang) * aSeed.x);
          vec3 dir = vec3(-sin(ang), 0.0, cos(ang));
          vec3 rgt = vec3(dir.z, 0.0, -dir.x);
          float flap = sin(uT * 9.0 + aSeed.z) * 0.3 * (0.4 - transformed.z);
          transformed = c + rgt * (transformed.x + flap) + vec3(0.0, transformed.y, 0.0) + dir * transformed.z;
        `,
        frag: `diffuseColor.rgb *= 0.75 + 0.55 * fbm(vWP.xz * 0.4);`,
      });
      const inner = mat.onBeforeCompile;
      mat.onBeforeCompile = (s, r) => {
        inner(s, r);
        s.vertexShader = 'attribute vec4 aSeed;\nattribute vec3 aCtr;\n' + s.vertexShader;
      };
      mat.customProgramCacheKey = () => 'fish';
      const im = new THREE.InstancedMesh(geo, mat, n);
      for (let i = 0; i < n; i++) im.setMatrixAt(i, _m4.identity());
      im.frustumCulled = false;
      g.add(im);
      return im;
    }
    school(340, [-22, 20, -28], 26, 20, 0xd8e7a0, 0.6, 0.22);
    school(240, [34, 30, 22], 22, 30, 0x9fd8e8, 0.5, -0.3);
    school(180, [8, 12, 44], 18, 12, 0xe8b070, 0.45, 0.35);

    /* whales — boxy to match the tower, three of them on wide slow arcs */
    const wm = {
      body: new THREE.MeshStandardMaterial({ color: 0x4a5f80, roughness: 0.85, flatShading: true }),
      belly: new THREE.MeshStandardMaterial({ color: 0xb5c1cc, roughness: 0.85, flatShading: true }),
      ink: new THREE.MeshStandardMaterial({ color: 0x1d2430, roughness: 0.9, flatShading: true }),
    };
    function whale(scale) {
      const w = new THREE.Group();
      const box = (m, sx, sy, sz, x, y, z, p = w) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wm[m]);
        b.position.set(x, y, z); p.add(b); return b;
      };
      box('body', 5.0, 4.2, 13.0, 0, 0, 0);
      box('body', 4.1, 3.3, 4.0, 0, 0.2, 7.6);
      box('body', 2.5, 2.0, 2.8, 0, -0.1, 10.4);
      box('belly', 3.6, 1.0, 12.0, 0, -2.0, 0.4);
      box('belly', 2.8, 0.7, 3.4, 0, -1.6, 7.8);
      box('ink', 0.5, 0.5, 0.5, -1.5, 0.6, 10.8);
      box('ink', 0.5, 0.5, 0.5, 1.5, 0.6, 10.8);
      box('body', 0.9, 2.4, 3.0, 0, 2.9, -1.6);
      const finL = box('body', 4.6, 0.5, 2.4, -3.4, -1.2, 4.0);
      const finR = box('body', 4.6, 0.5, 2.4, 3.4, -1.2, 4.0);
      const tail = new THREE.Group();
      tail.position.set(0, 0, -6.2); w.add(tail);
      box('body', 2.6, 2.0, 4.0, 0, 0, -2.0, tail);
      box('body', 8.8, 0.6, 2.6, 0, 0.2, -4.6, tail);
      w.scale.setScalar(scale);
      w.userData = { tail, finL, finR };
      return w;
    }
    const whales = [
      { m: whale(1.0), r: 88, y: 36, sp: 0.03, ph: 0 },
      { m: whale(0.6), r: 62, y: 24, sp: -0.05, ph: 2.1 },
      { m: whale(0.4), r: 52, y: 18, sp: -0.05, ph: 2.5 },
    ];
    whales.forEach((w) => g.add(w.m));

    const bubbles = pointCloud(g, 280, () => {
      const a = rnd(6.28), d = rnd(160, 8);
      return { x: Math.cos(a) * d, y: rnd(80), z: Math.sin(a) * d, v: rnd(5, 1.6) };
    }, { color: 0xbfeaff, size: 0.5, opacity: 0.5 });
    const motes = pointCloud(g, 520, () => ({ x: rnd(170, -170), y: rnd(72), z: rnd(170, -170), v: rnd(0.5, 0.05) }),
      { color: 0xcfe8d8, size: 0.32, opacity: 0.32 });

    return {
      group: g,
      fog: new THREE.FogExp2(0x0e4a68, 0.0092),
      css: '#062033',
      glass: { color: 0xdff2ff, emissive: 0x7fd0e8, intensity: 0.85 },
      light: {
        hemi: { i: 0.9, sky: 0x7fd8e8, gnd: 0x0d3a4a },
        key: { mul: 0.75, c: 0xa8ecff, p: [10, 42, 8] },
        fill: { mul: 0.6, c: 0x2f7f9f },
      },
      tick(t, dt) {
        rays.forEach((m, i) => {
          m.rotation.z = m.userData.b + Math.sin(t * 0.22 + m.userData.p) * 0.07;
        });
        rays.mat.opacity = 0.095 + Math.sin(t * 0.4) * 0.025;
        for (const w of whales) {
          const a = w.ph + t * w.sp;
          w.m.position.set(Math.cos(a) * w.r, w.y + Math.sin(t * 0.15 + w.ph) * 5, Math.sin(a) * w.r);
          w.m.rotation.y = -a + Math.PI / 2 + (w.sp < 0 ? Math.PI : 0);
          w.m.rotation.x = Math.sin(t * 0.15 + w.ph) * 0.12;
          w.m.userData.tail.rotation.x = Math.sin(t * 0.9 + w.ph) * 0.2;
          w.m.userData.finL.rotation.z = Math.sin(t * 0.7 + w.ph) * 0.18;
          w.m.userData.finR.rotation.z = -Math.sin(t * 0.7 + w.ph) * 0.18;
        }
        const bp = bubbles.pos;
        for (let i = 0; i < bp.length; i += 3) {
          bp[i + 1] += bubbles.vel[i / 3] * dt;
          bp[i] += Math.sin(t + i) * dt * 0.4;
          if (bp[i + 1] > 84) bp[i + 1] = 0;
        }
        bubbles.m.geometry.attributes.position.needsUpdate = true;
        const mp = motes.pos;
        for (let i = 0; i < mp.length; i += 3) {
          mp[i + 1] += motes.vel[i / 3] * dt;
          if (mp[i + 1] > 74) mp[i + 1] = 0;
        }
        motes.m.geometry.attributes.position.needsUpdate = true;
      },
    };
  }

  /* ===================== 2 · moon of a ringed gas giant ================== */

  function buildMoon() {
    const g = new THREE.Group();
    g.name = 'world_moon';
    g.add(skyDome(0x14204a, 0x4d5896, 0x9c7f8a));

    /* one height function drives the mesh, the grass scatter, the trees and the
       river ribbon, so nothing floats: hilltop under the tower, a meandering
       channel, and a cliff to the east for the cascade. */
    const CLIFF = 62;
    const smoothstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    function height(x, z) {
      const r = Math.hypot(x, z);
      let h = -13 + 13 * Math.exp(-(r * r) / (2 * 62 * 62));
      h += Math.sin(x * 0.05) * Math.cos(z * 0.043) * 1.2 + Math.sin(x * 0.017 + z * 0.021) * 2.2;
      h -= 34 * smoothstep(CLIFF, CLIFF + 16, x);
      return h;
    }
    // flatten the pad the tower stands on
    const ground = (x, z) => height(x, z) * (1 - Math.exp(-Math.pow(Math.hypot(x, z) / 9.5, 4)));

    const tgeo = new THREE.PlaneGeometry(460, 460, 180, 180);
    const tp2 = tgeo.attributes.position;
    for (let i = 0; i < tp2.count; i++) tp2.setZ(i, ground(tp2.getX(i), tp2.getY(i)));
    tgeo.computeVertexNormals();
    const terr = new THREE.Mesh(tgeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0x6f8b4a, roughness: 1, flatShading: true }), {
        frag: `
          vec2 p = vWP.xz * 0.06;
          float m = fbm(p) * 0.6 + fbm(p * 3.1) * 0.4;
          vec3 grass = mix(vec3(0.17,0.26,0.11), vec3(0.36,0.46,0.19), m);
          vec3 rock  = mix(vec3(0.26,0.24,0.23), vec3(0.44,0.40,0.35), m);
          float bare = smoothstep(0.30, 0.62, (1.0 - clamp(vWN.y, 0.0, 1.0)) + fbm(p * 5.0) * 0.14);
          diffuseColor.rgb = mix(grass, rock, bare);
          diffuseColor.rgb *= 0.86 + 0.28 * fbm(p * 0.5);
        `,
      }));
    terr.rotation.x = -Math.PI / 2;
    terr.position.y = -0.05;
    terr.receiveShadow = true;
    g.add(terr);

    /* the gas giant: banded fbm with a swirl offset, a soft terminator and a
       tilted ring sheet whose gaps come from a second noise octave */
    const planet = new THREE.Group();
    planet.position.set(-155, 100, -305);
    planet.rotation.z = 0.13;
    const body = new THREE.Mesh(new THREE.SphereGeometry(104, 64, 40), new THREE.ShaderMaterial({
      fog: false,
      uniforms: {
        uT,
        uSun: { value: new THREE.Vector3(0.55, 0.3, 0.78).normalize() },
        uHaze: { value: new THREE.Color(0x6f6a92) },
      },
      vertexShader: `varying vec3 vN; varying vec2 vU; varying vec3 vWPos;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vU = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0); vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE}
        varying vec3 vN; varying vec2 vU; varying vec3 vWPos;
        uniform float uT; uniform vec3 uSun; uniform vec3 uHaze;
        /* banded flow: latitude bands sheared by a domain-warped noise field,
           so the belts churn and curl instead of running dead straight */
        float belts(vec2 p){
          float warp = fbm(vec2(p.x * 2.2 + uT * 0.004, p.y * 5.0)) * 2.4
                     + fbm(vec2(p.x * 6.0 - uT * 0.002, p.y * 12.0)) * 0.7;
          float lat = p.y * 30.0 + warp * 3.2;
          float band = 0.5 + 0.5 * sin(lat);
          band = mix(band, fbm(vec2(lat * 0.6, p.x * 3.0)), 0.55);
          return band + fbm(vec2(p.x * 14.0 + uT * 0.01, p.y * 40.0)) * 0.14;
        }
        void main(){
          float b = belts(vU);
          vec3 dark  = vec3(0.42,0.27,0.20);
          vec3 mid   = vec3(0.68,0.51,0.34);
          vec3 cream = vec3(0.92,0.86,0.73);
          vec3 c = mix(dark, mid, smoothstep(0.18, 0.55, b));
          c = mix(c, cream, smoothstep(0.55, 0.88, b));
          // polar hoods, slightly cooler and smoother
          float pole = smoothstep(0.34, 0.06, min(vU.y, 1.0 - vU.y));
          c = mix(c, vec3(0.60,0.58,0.62), pole * 0.55);
          // one great vortex, sheared with the belt it sits in
          vec2 sp = vec2(vU.x - 0.32, (vU.y - 0.40) * 2.3);
          float sd = length(sp);
          float sw = atan(sp.y, sp.x) + sd * 7.0 - uT * 0.05;
          float storm = smoothstep(0.16, 0.02, sd) * (0.55 + 0.45 * sin(sw * 3.0));
          c = mix(c, vec3(0.74,0.34,0.24), storm * 0.85);
          c = mix(c, vec3(0.96,0.90,0.82), smoothstep(0.20, 0.16, sd) * 0.25 * storm);
          float lam = clamp(dot(vN, uSun) * 0.62 + 0.52, 0.0, 1.0);
          float limb = pow(clamp(dot(vN, normalize(cameraPosition - vWPos)), 0.0, 1.0), 0.45);
          c *= lam * (0.7 + 0.4 * limb);
          // atmosphere: the whole disc sits behind this moon's air
          float haze = 0.10 + 0.20 * (1.0 - smoothstep(20.0, 190.0, vWPos.y));
          c = mix(c, uHaze, haze);
          c += uHaze * pow(1.0 - limb, 3.0) * 0.30;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    planet.add(body);
    const rings = new THREE.Mesh(new THREE.RingGeometry(128, 224, 160, 1), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      vertexShader: `varying vec2 vP;
        void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `${NOISE}
        varying vec2 vP;
        void main(){
          float u = (length(vP) - 128.0) / 96.0;
          float bands = fbm(vec2(u * 34.0, 0.5)) * 0.7 + fbm(vec2(u * 92.0, 3.2)) * 0.3;
          float a = smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.8, 1.0, u));
          a *= 0.25 + bands * 0.75;
          gl_FragColor = vec4(mix(vec3(0.70,0.64,0.53), vec3(0.92,0.88,0.80), bands), a * 0.7);
        }`,
    }));
    rings.rotation.set(-Math.PI / 2 + 0.34, 0, 0.2);
    planet.add(rings);
    // atmospheric wash over the whole disc, so it belongs to this sky
    const veil = new THREE.Mesh(new THREE.SphereGeometry(112, 32, 20), new THREE.MeshBasicMaterial({
      color: 0x6f6a92, transparent: true, opacity: 0.09, depthWrite: false, fog: false,
    }));
    planet.add(veil);
    g.add(planet);

    /* stars: a shell of points, unfogged, thinned out toward the horizon
       where this moon's atmosphere would wash them away */
    (() => {
      const N = 1400;
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const u = rnd(1, -0.12), a = rnd(6.28);
        const rxz = Math.sqrt(Math.max(0, 1 - u * u));
        pos.set([Math.cos(a) * rxz * 430, u * 430, Math.sin(a) * rxz * 430], i * 3);
        const k = (0.35 + 0.65 * Math.max(0, u)) * rnd(1, 0.35);
        _c.setHSL(rnd(0.68, 0.5), rnd(0.35, 0), 0.5);
        col.set([_c.r * k, _c.g * k, _c.b * k], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 2.6, map: softTex, vertexColors: true, transparent: true, opacity: 0.9,
        depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      stars.renderOrder = -9;
      g.add(stars);
    })();

    const moon2 = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xbfb3a8, fog: false }));
    moon2.position.set(130, 156, -250);
    g.add(moon2);

    /* grass — a dense instanced meadow. the blade is pre-curved and the wind
       bends it further in the vertex shader; per-instance colour plus a
       height gradient keep 30k copies from reading as one flat mat. */
    const bladeGeo = new THREE.PlaneGeometry(0.2, 1.5, 1, 5);
    bladeGeo.translate(0, 0.75, 0);
    (() => {
      const p = bladeGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getY(i) / 1.5;
        p.setZ(i, p.getZ(i) + u * u * 0.35);          // natural arc
        p.setX(i, p.getX(i) * (1 - u * 0.7));          // taper to a tip
      }
      bladeGeo.computeVertexNormals();
    })();
    const GN = 62000;
    const grass = new THREE.InstancedMesh(bladeGeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0x3d5a24, roughness: 1, flatShading: true, side: THREE.DoubleSide }), {
        vert: `
          vec3 base = (modelMatrix * wIM * vec4(0.0,0.0,0.0,1.0)).xyz;
          float k = pow(clamp(position.y / 1.5, 0.0, 1.0), 1.5);
          float gust = sin(uT * 1.5 + base.x * 0.09 + base.z * 0.07) * 0.5 + sin(uT * 3.1 + base.x * 0.3) * 0.16;
          transformed.x += gust * k * 0.95 * uWind;
          transformed.z += gust * k * 0.5 * uWind;
          vGH = clamp(position.y / 1.5, 0.0, 1.0);
        `,
        frag: `diffuseColor.rgb *= 0.5 + 0.55 * vGH;`,
      }), GN);
    // carry the blade-local height so the root can sit in shadow
    grass.material.onBeforeCompile = ((prev) => (s, r) => {
      prev(s, r);
      s.vertexShader = 'varying float vGH;\n' + s.vertexShader;
      s.fragmentShader = 'varying float vGH;\n' + s.fragmentShader;
    })(grass.material.onBeforeCompile);
    grass.material.customProgramCacheKey = () => 'grass';
    grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(GN * 3), 3);
    let gi = 0;
    for (let i = 0; i < GN * 3 && gi < GN; i++) {
      // clumped scatter: a seed point with a tight spray around it
      const ca = rnd(6.28), cd = 9 + Math.pow(Math.random(), 0.62) * 215;
      const cx = Math.cos(ca) * cd, cz = Math.sin(ca) * cd;
      const clump = 5 + Math.floor(rnd(9));
      for (let j = 0; j < clump && gi < GN; j++) {
        const x = cx + rnd(2.4, -2.4), z = cz + rnd(2.4, -2.4);
        if (x > CLIFF - 4 && x < CLIFF + 22) continue;
        const r = Math.hypot(x, z);
        if (r < 8.4 || r > 232) continue;
        const h = ground(x, z);
        if (h < -30) continue;
        const near = 1 - Math.min(1, r / 90);
        grass.setMatrixAt(gi, _m4.compose(
          _v.set(x, h - 0.12, z), _q.setFromAxisAngle(YUP, rnd(6.28)),
          _s.set(rnd(1.4, 0.7), rnd(2.1, 0.55) * (1 + (1 - near) * 0.5), 1)));
        _c.setHSL(0.23 + rnd(0.07, -0.04), rnd(0.6, 0.35), rnd(0.30, 0.12));
        grass.setColorAt(gi, _c);
        gi++;
      }
    }
    grass.count = gi;
    grass.frustumCulled = false;
    g.add(grass);

    /* trees */
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1, flatShading: true });
    const leafMat = patchStd(new THREE.MeshStandardMaterial({ color: 0x3f6b34, roughness: 1, flatShading: true }), {
      vert: `
        vec3 base = (modelMatrix * wIM * vec4(0.0,0.0,0.0,1.0)).xyz;
        float s = sin(uT * 1.1 + base.x * 0.05 + base.z * 0.04) * 0.24 * uWind;
        transformed.x += s; transformed.z += s * 0.6;
      `,
      frag: `diffuseColor.rgb *= 0.7 + 0.55 * fbm(vWP.xz * 0.7 + vWP.y);`,
    });
    for (let i = 0; i < 26; i++) {
      const a = rnd(6.28), d = rnd(200, 22);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (x > CLIFF - 6 && x < CLIFF + 20) continue;
      const y = ground(x, z);
      if (y < -26) continue;
      const tr = new THREE.Group();
      tr.position.set(x, y, z);
      tr.scale.setScalar(rnd(1.5, 0.7));
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 7), barkMat);
      trunk.position.y = 3.5;
      trunk.castShadow = true;
      tr.add(trunk);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4 - k * 0.75, 0), leafMat);
        c.position.set(rnd(1, -1), 6.6 + k * 2.3, rnd(1, -1));
        c.scale.y = 0.8;
        c.castShadow = true;
        tr.add(c);
      }
      g.add(tr);
    }

    /* clouds — deliberately few, chunky slabs drifting past */
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xdcd3e8, roughness: 1, flatShading: true, transparent: true, opacity: 0.88,
    });
    const clouds = [];
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5 + Math.floor(rnd(4)); k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(rnd(30, 14), rnd(6, 3), rnd(20, 10)), cloudMat);
        b.position.set(rnd(26, -26), rnd(4, -4), rnd(16, -16));
        c.add(b);
      }
      c.position.set(rnd(320, -320), rnd(80, 46), rnd(200, -320));
      c.userData.sp = rnd(2.4, 0.8);
      g.add(c);
      clouds.push(c);
    }

    const rays = lightShafts(g, { count: 5, color: 0xffd9b0, top: 98, len: 112, rTop: 6, rBot: 26, spread: 130, opacity: 0.05 });
    const pollen = pointCloud(g, 320, () => ({ x: rnd(170, -170), y: rnd(30, 1), z: rnd(170, -170), v: rnd(0.6, 0.1) }),
      { color: 0xffe9b0, size: 0.3, opacity: 0.38 });

    return {
      group: g,
      fog: new THREE.Fog(0x6f6a92, 170, 500),
      css: '#2a2748',
      glass: { color: 0xffe4c0, emissive: 0xffb877, intensity: 1.5 },
      light: {
        hemi: { i: 0.85, sky: 0xc4cff5, gnd: 0x4a4030 },
        key: { mul: 1.05, c: 0xffe3bc, p: [22, 30, 28] },
        fill: { mul: 0.7, c: 0xa898e8 },
      },
      tick(t, dt) {
        planet.rotation.y = 0.4 + t * 0.011;
        planet.position.y = 100 + Math.sin(t * 0.02) * 2.5;
        clouds.forEach((c) => {
          c.position.x += c.userData.sp * dt;
          if (c.position.x > 350) c.position.x = -350;
        });
        rays.forEach((m, i) => { m.rotation.z = m.userData.b + Math.sin(t * 0.13 + i) * 0.05; });
        const pp = pollen.pos;
        for (let i = 0; i < pp.length; i += 3) {
          pp[i + 1] += pollen.vel[i / 3] * dt;
          pp[i] += Math.sin(t * 0.5 + i) * dt * 0.6;
          if (pp[i + 1] > 34) pp[i + 1] = 0;
        }
        pollen.m.geometry.attributes.position.needsUpdate = true;
      },
    };
  }

  /* ========================== 3 · deep forest =========================== */

  function buildForest() {
    const g = new THREE.Group();
    g.name = 'world_forest';
    g.add(skyDome(0x9fc47a, 0x2f4a2a, 0x0b1710));

    /* one alpha-tested card stands in for a dozen leaves — the standard trick
       for dense foliage: cheap fill, no sorting, silhouette does the work */
    const leafTex = (() => {
      const S = 128, c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.6;
        const d = 14 + Math.random() * 40;
        x.save();
        x.translate(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.85);
        x.rotate(a + 1.2);
        x.beginPath(); x.ellipse(0, 0, 8 + Math.random() * 9, 15 + Math.random() * 12, 0, 0, 6.3); x.fill();
        x.restore();
      }
      x.beginPath(); x.ellipse(S / 2, S / 2, 22, 26, 0, 0, 6.3); x.fill();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();

    const ggeo = new THREE.PlaneGeometry(400, 400, 100, 100);
    const gp = ggeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i);
      const d = Math.hypot(x, y);
      const h = Math.sin(x * 0.06) * Math.cos(y * 0.05) * 1.2 + Math.sin(x * 0.02 + y * 0.03) * 2.0;
      gp.setZ(i, h * Math.min(1, Math.max(0, (d - 13) / 12)));
    }
    ggeo.computeVertexNormals();
    const floor = new THREE.Mesh(ggeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 1, flatShading: true }), {
        frag: `
          vec2 p = vWP.xz * 0.13;
          float m = fbm(p) * 0.65 + fbm(p * 4.2) * 0.35;
          vec3 soil = mix(vec3(0.12,0.09,0.06), vec3(0.27,0.20,0.13), m);
          vec3 moss = mix(vec3(0.11,0.20,0.10), vec3(0.25,0.37,0.16), m);
          diffuseColor.rgb = mix(soil, moss, smoothstep(0.42, 0.72, fbm(p * 0.7 + 3.0)));
          float dapple = fbm(vWP.xz * 0.05 + vec2(uT * 0.012, 0.0));
          diffuseColor.rgb += vec3(0.32,0.27,0.12) * pow(smoothstep(0.60, 0.95, dapple), 2.0);
        `,
      }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.06;
    floor.receiveShadow = true;
    g.add(floor);

    /* trunks — instanced, tapered, leaning a little, mossy at the base */
    const trunkGeo = new THREE.CylinderGeometry(0.42, 0.95, 1, 8, 1, false);
    trunkGeo.translate(0, 0.5, 0);
    const TN = 140;
    const trunks = new THREE.InstancedMesh(trunkGeo, patchStd(
      new THREE.MeshStandardMaterial({
        color: 0x4a3a2a, roughness: 1, flatShading: true,
        transparent: true, depthWrite: true, alphaTest: 0.002,
      }), {
        occluder: true,
        frag: `
          float bark = fbm(vec2(atan(vWN.z, vWN.x) * 6.0, vWP.y * 1.7));
          diffuseColor.rgb *= 0.6 + 0.75 * bark;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15,0.24,0.13), smoothstep(3.0, 0.0, vWP.y) * 0.6);
        `,
      }), TN);
    const trees = [];
    let ti = 0;
    for (let i = 0; i < TN * 5 && ti < TN; i++) {
      const a = rnd(6.28), d = rnd(185, 26);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = rnd(36, 19);
      const w = rnd(1.5, 0.75);
      _e.set(rnd(0.09, -0.09), rnd(6.28), rnd(0.09, -0.09));
      trunks.setMatrixAt(ti++, _m4.compose(_v.set(x, -0.2, z), _q.setFromEuler(_e), _s.set(w, h, w)));
      trees.push({ x, z, h, w });
    }
    trunks.count = ti;
    trunks.castShadow = true;
    trunks.frustumCulled = false;
    g.add(trunks);

    /* canopy — thousands of cards clustered on the trunks plus a layer right
       over the tower, so it sits half-buried in leaves. wind per-vertex,
       colour per-instance, vertical tint fakes canopy occlusion. */
    const cardGeo = new THREE.PlaneGeometry(1, 1);
    const foliage = (tint) => patchStd(new THREE.MeshStandardMaterial({
      color: 0xffffff, map: leafTex, alphaMap: leafTex, alphaTest: 0.42,
      roughness: 1, side: THREE.DoubleSide, transparent: true, depthWrite: true,
    }), {
      occluder: true,
      vert: `
        vec3 base = (modelMatrix * wIM * vec4(0.0,0.0,0.0,1.0)).xyz;
        float sway = sin(uT * 0.34 + base.x * 0.16 + base.z * 0.13) * 0.5
                   + sin(uT * 0.68 + base.z * 0.4) * 0.15;
        transformed.x += sway * uWind;
        transformed.z += sway * 0.55 * uWind;
        transformed.y += sin(uT * 0.47 + base.x * 0.2) * 0.11 * uWind;
      `,
      frag: tint,
    });
    const CN = 4800;
    const canopy = new THREE.InstancedMesh(cardGeo, foliage(`
      float depth = clamp((vWP.y - 3.0) / 34.0, 0.0, 1.0);
      diffuseColor.rgb *= mix(vec3(0.28,0.38,0.24), vec3(1.15,1.18,0.88), pow(depth, 0.8));
    `), CN);
    canopy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CN * 3), 3);
    let ci = 0;
    const card = (x, y, z, s) => {
      if (ci >= CN) return;
      _e.set(rnd(1.1, -1.1), rnd(6.28), rnd(0.8, -0.8));
      canopy.setMatrixAt(ci, _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s)));
      _c.setHSL(0.24 + rnd(0.09, -0.05), rnd(0.62, 0.34), rnd(0.42, 0.15));
      canopy.setColorAt(ci, _c);
      ci++;
    };
    for (const tr of trees) {
      const n = 22 + Math.floor(rnd(16));
      for (let k = 0; k < n; k++) {
        const a = rnd(6.28), rr = rnd(7 * tr.w, 1);
        card(tr.x + Math.cos(a) * rr, tr.h * rnd(1.02, 0.62) + rnd(3, -3), tr.z + Math.sin(a) * rr, rnd(9, 4.5));
      }
      for (let k = 0; k < 5; k++) {
        const a = rnd(6.28), rr = rnd(5, 1.5);
        card(tr.x + Math.cos(a) * rr, rnd(4, 1), tr.z + Math.sin(a) * rr, rnd(4.5, 2.2));
      }
    }
    while (ci < CN) {
      const a = rnd(6.28), rr = Math.sqrt(Math.random()) * 72;
      card(Math.cos(a) * rr, rnd(TOP + 32, TOP + 7), Math.sin(a) * rr, rnd(13, 6));
    }
    canopy.count = ci;
    canopy.frustumCulled = false;
    g.add(canopy);

    /* ferns filling the middle distance */
    const FN = 1500;
    const ferns = new THREE.InstancedMesh(cardGeo, foliage(
      `diffuseColor.rgb *= vec3(0.32,0.46,0.26) * (0.7 + 0.7 * fbm(vWP.xz * 0.8));`), FN);
    let fi = 0;
    for (let i = 0; i < FN * 3 && fi < FN; i++) {
      const a = rnd(6.28), d = rnd(165, 24);
      if (d < 26) continue;
      _e.set(rnd(0.4, -0.4), rnd(6.28), 0);
      const s = rnd(4.6, 2.2);
      ferns.setMatrixAt(fi++, _m4.compose(
        _v.set(Math.cos(a) * d, rnd(2.6, 0.7), Math.sin(a) * d), _q.setFromEuler(_e), _s.set(s, s, s)));
    }
    ferns.count = fi;
    ferns.frustumCulled = false;
    g.add(ferns);

    /* the flower bed: a ring of blooms circling the tower */
    const swayVert = `
      vec3 base = (modelMatrix * wIM * vec4(0.0,0.0,0.0,1.0)).xyz;
      float s = sin(uT * 0.5 + base.x * 0.5 + base.z * 0.4) * 0.08 * uWind;
      transformed.x += s * max(position.y, 0.2);
      transformed.z += s * 0.5 * max(position.y, 0.2);
    `;
    const stemMat = patchStd(new THREE.MeshStandardMaterial({ color: 0x3f6b30, roughness: 1, flatShading: true }), { vert: swayVert });
    const bloomMat = patchStd(new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.7, flatShading: true, emissive: 0x140c02, emissiveIntensity: 1,
    }), { vert: swayVert });
    const stemGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
    stemGeo.translate(0, 0.5, 0);
    const BN = 1000;
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, BN);
    const blooms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.1, 0.42), bloomMat, BN);
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.06, 0.18), stemMat, BN);
    blooms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BN * 3), 3);
    const PAL = ['#e8d27a', '#e0728f', '#b98ce8', '#f2f0e2', '#f0a05a', '#8fd8e8'];
    for (let i = 0; i < BN; i++) {
      const a = rnd(6.28);
      const d = 7.3 + Math.pow(Math.random(), 0.7) * 3.8;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = rnd(1.5, 0.6);
      _q.setFromAxisAngle(YUP, rnd(6.28));
      stems.setMatrixAt(i, _m4.compose(_v.set(x, 0, z), _q, _s.set(1, h, 1)));
      blooms.setMatrixAt(i, _m4.compose(_v.set(x, h, z), _q, _s.set(rnd(1.3, 0.7), 1, rnd(1.3, 0.7))));
      pads.setMatrixAt(i, _m4.compose(_v.set(x + rnd(0.5, -0.5), 0.05, z + rnd(0.5, -0.5)), _q, _s.set(1, 1, 1)));
      blooms.setColorAt(i, _c.set(PAL[Math.floor(Math.random() * PAL.length)]));
    }
    [stems, blooms, pads].forEach((m) => { m.frustumCulled = false; g.add(m); });

    const rays = lightShafts(g, { count: 12, color: 0xffe3a8, top: TOP + 16, len: TOP + 24, rTop: 1.6, rBot: 7, spread: 46, opacity: 0.1 });
    const pollen = pointCloud(g, 440, () => ({ x: rnd(95, -95), y: rnd(30, 0.5), z: rnd(95, -95), v: rnd(0.7, 0.1) }),
      { color: 0xffe9b0, size: 0.34, opacity: 0.42 });
    const flies = pointCloud(g, 100, () => ({ x: rnd(55, -55), y: rnd(9, 1), z: rnd(55, -55), v: rnd(6.28) }),
      { color: 0xd8ff9f, size: 0.5, opacity: 0.7 });

    return {
      group: g,
      fog: new THREE.FogExp2(0x1c3222, 0.0115),
      css: '#0e1a11',
      glass: { color: 0xfff0cc, emissive: 0xffc884, intensity: 2.0 },
      fade: { on: 1, radius: 20, amount: 1.0 },
      light: {
        hemi: { i: 0.95, sky: 0xa8d88f, gnd: 0x241c12 },
        key: { mul: 0.95, c: 0xffe6b0, p: [10, 46, 14] },
        fill: { mul: 0.55, c: 0x6f9f5f },
      },
      tick(t, dt) {
        rays.forEach((m) => { m.rotation.z = m.userData.b + Math.sin(t * 0.3 + m.userData.p) * 0.06; });
        rays.mat.opacity = 0.085 + Math.sin(t * 0.5) * 0.025;
        const pp = pollen.pos;
        for (let i = 0; i < pp.length; i += 3) {
          pp[i + 1] += pollen.vel[i / 3] * dt;
          pp[i] += Math.sin(t * 0.7 + i) * dt * 0.7;
          if (pp[i + 1] > 32) pp[i + 1] = 0;
        }
        pollen.m.geometry.attributes.position.needsUpdate = true;
        const fp = flies.pos;
        for (let i = 0; i < fp.length; i += 3) {
          const ph = flies.vel[i / 3];
          fp[i] += Math.cos(t * 0.8 + ph) * dt * 1.6;
          fp[i + 1] += Math.sin(t * 1.3 + ph) * dt * 0.8;
          fp[i + 2] += Math.sin(t * 0.7 + ph * 1.7) * dt * 1.6;
        }
        flies.m.geometry.attributes.position.needsUpdate = true;
        flies.m.material.opacity = 0.5 + Math.sin(t * 3) * 0.25;
      },
    };
  }

  /* ============================== 4 · beach ============================= */

  function buildBeach() {
    const g = new THREE.Group();
    g.name = 'world_beach';
    g.add(skyDome(0x2f86d0, 0x9fcde4, 0xe8dcc4));

    /* The whole world is one straight shoreline running along x, with the sea
       on the -z side and the tower standing on dry sand. Because depth is a
       function of z alone, every band the shader draws — the wet sand, the
       foam, the breaking line — is a clean stripe across the full width. */
    const SEA = 0;            // still-water level
    const SHORE = -30;        // z of the waterline
    const SLOPE = 0.075;      // rise per unit inland

    const PROFILE = `
      // metres of water above the bed; negative on dry sand
      float depthAt(vec2 p){ return (${SHORE.toFixed(1)} - p.y) * ${SLOPE.toFixed(3)}; }`;
    const bed = (x, z) => {
      // gentle swell inland, dead flat where the tower stands
      const ripple = Math.sin(x * 0.06) * 0.35 + Math.sin(x * 0.021 + z * 0.03) * 0.5;
      const h = (z - SHORE) * SLOPE + ripple * Math.min(1, Math.max(0, (z - SHORE) / 40));
      return h;
    };
    const ground = (x, z) => bed(x, z) * (1 - Math.exp(-Math.pow(Math.hypot(x, z) / 9.5, 4)));

    const tgeo = new THREE.PlaneGeometry(700, 700, 170, 170);
    const tp = tgeo.attributes.position;
    // the plane is rotated -90° about X, which maps its local +y to world -z:
    // sample the profile with -y or the whole beach slopes the wrong way
    for (let i = 0; i < tp.count; i++) tp.setZ(i, ground(tp.getX(i), -tp.getY(i)));
    tgeo.computeVertexNormals();
    const sand = new THREE.Mesh(tgeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 1, flatShading: true }), {
        frag: `
          float d = (${SHORE.toFixed(1)} - vWP.z) * ${SLOPE.toFixed(3)};
          vec2 p = vWP.xz;
          // ripple marks run parallel to the water, as they actually do
          float ripple = fbm(vec2(p.x * 0.10, p.y * 0.85)) * 0.6 + fbm(p * 0.55) * 0.4;
          vec3 dry = mix(vec3(0.62,0.46,0.22), vec3(0.86,0.70,0.40), ripple);
          vec3 wet = mix(vec3(0.30,0.22,0.13), vec3(0.48,0.37,0.22), ripple);
          float swash = 0.5 + 0.5 * sin(uT * 0.34) + 0.12 * sin(uT * 1.1);
          float run = -0.9 - swash * 1.3;         // how far up the sand water reaches
          diffuseColor.rgb = mix(dry, wet, smoothstep(run - 0.5, run + 1.1, d));
          // the dried scum line at the top of the last big set
          float line = exp(-pow((d - run) * 2.6, 2.0));
          diffuseColor.rgb += vec3(0.13,0.12,0.10) * line * (0.5 + 0.5 * fbm(p * 1.8));
          diffuseColor.rgb *= 0.93 + 0.13 * fbm(p * 5.0);
        `,
      }));
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    g.add(sand);

    /* The sea: a 4-term Gerstner sum in the vertex shader, all wave trains
       running shoreward with a slight spread, amplitude shoaling as the bed
       comes up. The same derivatives give the normal, so there is no normal
       map and no reflection pass — one draw call for the whole ocean. */
    const WAVES = `
      void waveAt(vec2 p, out float h, out vec2 dh, out float crest){
        h = 0.0; dh = vec2(0.0); crest = 0.0;
        float shoal = smoothstep(0.0, 7.0, depthAt(p));
        vec4 amp = vec4(0.55, 0.30, 0.15, 0.075);
        vec4 wl  = vec4(46.0, 26.0, 14.0, 7.5);
        vec4 spd = vec4(0.60, 0.78, 1.00, 1.30);
        vec4 skew = vec4(0.0, 0.16, -0.22, 0.09);   // small spread in the swell
        for (int i = 0; i < 4; i++) {
          float a = amp[i] * shoal;
          float k = 6.28318 / wl[i];
          vec2 dir = normalize(vec2(skew[i], 1.0));
          float ph = k * dot(dir, p) + uT * spd[i] * 6.0;
          h += a * sin(ph);
          dh += dir * (a * k * cos(ph));
          crest += a * k * pow(max(0.0, sin(ph)), 6.0);
        }
      }`;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 560, 220, 180), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide,
      uniforms: {
        uT,
        uSun: { value: new THREE.Vector3(0.42, 0.30, -0.85).normalize() },
        uSky: { value: new THREE.Color(0x7fb4dc) },
        uHaze: { value: new THREE.Color(0xbcd4e0) },
      },
      vertexShader: `uniform float uT;
        ${NOISE}${PROFILE}${WAVES}
        varying vec3 vWP; varying vec3 vN; varying float vCrest; varying float vDepth;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h; vec2 dh; float crest;
          waveAt(wp.xz, h, dh, crest);
          wp.y += h;
          vWP = wp.xyz;
          vN = normalize(vec3(-dh.x, 1.0, -dh.y));
          vCrest = crest;
          vDepth = depthAt(wp.xz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `${NOISE}
        uniform float uT; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHaze;
        varying vec3 vWP; varying vec3 vN; varying float vCrest; varying float vDepth;
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vWP);
          float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
          // deep blue offshore, green over the shallow bed
          vec3 c = mix(vec3(0.09,0.40,0.48), vec3(0.004,0.045,0.20), smoothstep(0.3, 10.0, vDepth));
          c = mix(c, uSky, fres * 0.55);
          vec3 Hv = normalize(uSun + V);
          float spec = pow(max(dot(N, Hv), 0.0), 200.0);
          float sparkle = smoothstep(0.55, 1.0, fbm(vWP.xz * 3.0 + uT * 0.6));
          c += vec3(1.0,0.96,0.88) * spec * (2.0 + sparkle * 4.5);

          float swash = 0.5 + 0.5 * sin(uT * 0.34) + 0.12 * sin(uT * 1.1);
          // 1 · the break: where the shoaling crest oversteepens
          float breakUp = smoothstep(0.55, 1.4, vCrest) * (0.45 + 0.55 * fbm(vWP.xz * 1.8 - uT * 1.5));
          // 2 · the sheet sliding up the sand — a stripe in depth, so it never
          //     breaks apart along the shore
          float run = -0.9 - swash * 1.3;
          float sheet = smoothstep(run + 1.2, run, vDepth);
          float lace = 0.5 + 0.5 * fbm(vWP.xz * 1.7 + uT * 0.9);
          // 3 · the bright leading edge of that sheet
          float edge = exp(-pow((vDepth - run) * 3.2, 2.0));
          float foam = clamp(breakUp * 1.25 + sheet * lace * 1.15 + edge * 1.3, 0.0, 1.0);
          c = mix(c, vec3(0.93,0.96,0.97), foam);
          c = mix(c, uHaze, smoothstep(220.0, 620.0, length(vWP - cameraPosition)) * 0.85);
          // thin at the tip so it dies on the sand instead of ending in a line
          float a = clamp((vDepth - run) * 1.1, 0.0, 1.0);
          gl_FragColor = vec4(c, max(a, foam * a * 2.2));
        }`,
    }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, SEA, SHORE - 250);
    sea.frustumCulled = false;
    g.add(sea);

    // the sun, out over the water
    const sunPos = new THREE.Vector3(120, 74, -420);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(11, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff8e6, fog: false, transparent: true, opacity: 0.9 }));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshBasicMaterial({
      map: softTex, color: 0xffe4b4, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    [sun, glow].forEach((m) => { m.position.copy(sunPos); m.lookAt(0, 26, 0); g.add(m); });

    // two gulls, high and slow. nothing else is added to this world.
    const gullMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.9, flatShading: true });
    const gulls = [];
    for (let i = 0; i < 2; i++) {
      const gg = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.6), gullMat);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.7), gullMat);
      const wr = wl.clone();
      wl.position.set(-1.4, 0.12, 0.1);
      wr.position.set(1.4, 0.12, 0.1);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.4), gullMat);
      head.position.set(0, 0.24, 1.0);
      gg.add(body, wl, wr, head);
      gg.scale.setScalar(rnd(1.4, 1.0));
      g.add(gg);
      gulls.push({ m: gg, wl, wr, r: rnd(130, 80), y: rnd(56, 34), sp: rnd(0.16, 0.08) * (i ? -1 : 1), ph: rnd(6.28) });
    }

    return {
      group: g,
      fog: new THREE.Fog(0xbcd4e0, 240, 700),
      css: '#7fb4d8',
      glass: { color: 0xfff6e4, emissive: 0xffd9a0, intensity: 0.45 },
      light: {
        hemi: { i: 0.9, sky: 0xbfdcf0, gnd: 0xb08a52 },
        key: { mul: 1.05, c: 0xfff2d8, p: [26, 30, 34] },
        fill: { mul: 0.6, c: 0x8fbcd8 },
      },
      tick(t) {
        for (const b of gulls) {
          const a = b.ph + t * b.sp;
          b.m.position.set(Math.cos(a) * b.r, b.y + Math.sin(t * 0.4 + b.ph) * 3, Math.sin(a) * b.r - 70);
          b.m.rotation.y = -a + Math.PI / 2 + (b.sp < 0 ? Math.PI : 0);
          b.m.rotation.z = Math.sin(t * 0.5 + b.ph) * 0.28;
          const flap = Math.sin(t * 3.2 + b.ph) * 0.45;
          b.wl.rotation.z = flap;
          b.wr.rotation.z = -flap;
        }
      },
    };
  }

  /* ========================= 5 · abandoned city ======================== */

  function buildCity() {
    const g = new THREE.Group();
    g.name = 'world_city';
    g.add(skyDome(0x0a101a, 0x121824, 0x2a1d16));

    /* asphalt: a crossroads under the tower, cracked, with standing water */
    const ggeo = new THREE.PlaneGeometry(460, 460, 150, 150);
    const gp = ggeo.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i);
      const road = Math.min(Math.abs(x), Math.abs(y)) < 11 ? 0.25 : 1;
      const h = (Math.sin(x * 0.08) * Math.cos(y * 0.07) * 0.5 + Math.sin(x * 0.31 + y * 0.24) * 0.22) * road;
      gp.setZ(i, h * Math.min(1, Math.max(0, (Math.hypot(x, y) - 11) / 10)));
    }
    ggeo.computeVertexNormals();
    const road = new THREE.Mesh(ggeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.85, flatShading: true }), {
        frag: `
          vec2 p = vWP.xz;
          float onRoad = 1.0 - smoothstep(10.0, 13.0, min(abs(p.x), abs(p.y)));
          float grain = fbm(p * 1.6) * 0.6 + fbm(p * 7.0) * 0.4;
          vec3 asphalt = mix(vec3(0.055,0.058,0.066), vec3(0.135,0.140,0.152), grain);
          vec3 walk = mix(vec3(0.14,0.135,0.125), vec3(0.24,0.23,0.215), grain);
          diffuseColor.rgb = mix(walk, asphalt, onRoad);
          // lane dashes down both roads
          float dashX = step(0.55, fract(p.y * 0.07)) * (1.0 - smoothstep(0.35, 0.75, abs(p.x)));
          float dashZ = step(0.55, fract(p.x * 0.07)) * (1.0 - smoothstep(0.35, 0.75, abs(p.y)));
          diffuseColor.rgb += vec3(0.30,0.28,0.20) * max(dashX, dashZ) * onRoad * (0.35 + 0.5 * grain);
          // cracks: ridged noise, widened where the ground buckled
          float cr = 1.0 - abs(fbm(p * 0.55) * 2.0 - 1.0);
          float crack = smoothstep(0.86, 0.99, cr) + smoothstep(0.9, 1.0, 1.0 - abs(fbm(p * 1.9 + 7.0) * 2.0 - 1.0)) * 0.6;
          diffuseColor.rgb *= 1.0 - clamp(crack, 0.0, 1.0) * 0.75;
          // puddles sit in the hollows and mirror the sodium haze
          float pud = smoothstep(0.58, 0.74, fbm(p * 0.32 + 2.0));
          vec3 V = normalize(cameraPosition - vWP);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03,0.04,0.05), pud * 0.85);
          diffuseColor.rgb += vec3(0.30,0.22,0.13) * pud * fres * (0.35 + 0.4 * sin(vWP.x * 0.4 + uT * 0.3));
        `,
      }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = -0.05;
    road.receiveShadow = true;
    g.add(road);

    /* blocks: instanced boxes with a procedural window grid. only a handful of
       panes are lit, and the lit ones flicker on their own clock. */
    const BN = 150;
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), patchStd(
      new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95, flatShading: true, emissive: 0x000000, emissiveIntensity: 1 }), {
        frag: `
          vec3 n = normalize(vWN);
          vec2 face = abs(n.x) > 0.5 ? vec2(vWP.z, vWP.y) : vec2(vWP.x, vWP.y);
          vec2 id = floor(face / vec2(3.4, 3.8));
          vec2 f = fract(face / vec2(3.4, 3.8));
          float pane = step(0.14, f.x) * step(f.x, 0.80) * step(0.20, f.y) * step(f.y, 0.76);
          pane *= 1.0 - step(0.5, n.y);
          float bId = hash21(floor(vWP.xz / 26.0));
          float grime = fbm(vWP.xz * 0.4 + vWP.y * 0.05);
          vec3 wall = mix(vec3(0.085,0.082,0.078), vec3(0.20,0.19,0.175), grime);
          wall *= 0.55 + 0.7 * smoothstep(0.0, 60.0, vWP.y);
          wall = mix(wall, vec3(0.05,0.055,0.06), step(0.5, n.y));
          diffuseColor.rgb = mix(wall, vec3(0.02,0.025,0.03), pane * 0.9);
          float lit = step(0.952, hash21(id + bId * 37.0)) * pane;
          float flick = 0.7 + 0.3 * sin(uT * (3.0 + hash21(id) * 9.0) + hash21(id) * 20.0);
          if (hash21(id + 3.0) > 0.9) flick *= step(0.35, fract(uT * 0.7 + hash21(id)));
          litAmt = lit * flick;
        `,
        emis: `
          totalEmissiveRadiance += mix(vec3(1.0,0.76,0.40), vec3(0.55,0.85,0.75), step(0.6, hash21(vWP.xz))) * litAmt * 2.4;
        `,
      }), BN);
    blocks.material.onBeforeCompile = ((prev) => (s, r) => {
      prev(s, r);
      s.fragmentShader = s.fragmentShader.replace('void main() {', 'void main() {\n  float litAmt = 0.0;');
    })(blocks.material.onBeforeCompile);
    blocks.material.customProgramCacheKey = () => 'cityblock';
    let bi = 0;
    for (let i = 0; i < BN * 4 && bi < BN; i++) {
      const x = rnd(230, -230), z = rnd(230, -230);
      if (Math.min(Math.abs(x), Math.abs(z)) < 17) continue;      // keep the roads clear
      const r = Math.hypot(x, z);
      if (r < 30) continue;
      const wd = rnd(30, 13), dp = rnd(30, 13);
      const ht = rnd(88, 16) * (r < 70 ? 0.55 : 1);
      _e.set(rnd(0.03, -0.03), rnd(6.28), rnd(0.03, -0.03));       // a few lean
      blocks.setMatrixAt(bi++, _m4.compose(
        _v.set(x, ht / 2 - 0.5, z), _q.setFromEuler(_e), _s.set(wd, ht, dp)));
    }
    blocks.count = bi;
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    blocks.frustumCulled = false;
    g.add(blocks);

    // rubble where facades came down
    const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), patchStd(
      new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 1, flatShading: true }), {
        frag: `diffuseColor.rgb *= 0.45 + 0.7 * fbm(vWP.xz * 0.9 + vWP.y);`,
      }), 260);
    for (let i = 0; i < 260; i++) {
      const a = rnd(6.28), d = rnd(210, 24), sz = rnd(2.6, 0.4);
      _e.set(rnd(3), rnd(3), rnd(3));
      rubble.setMatrixAt(i, _m4.compose(
        _v.set(Math.cos(a) * d, sz * 0.2, Math.sin(a) * d), _q.setFromEuler(_e),
        _s.set(sz, sz * rnd(1, 0.4), sz)));
    }
    rubble.receiveShadow = true;
    g.add(rubble);

    /* cars, stopped mid-journey. one merged low-poly shell, instanced, with
       paint colour per instance and a couple shoved sideways. */
    const carGeo = (() => {
      const body = new THREE.BoxGeometry(2.0, 0.85, 4.6);
      body.translate(0, 0.75, 0);
      const cabin = new THREE.BoxGeometry(1.8, 0.75, 2.2);
      cabin.translate(0, 1.5, -0.15);
      const parts = [body, cabin];
      for (const [dx, dz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
        const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8);
        wheel.rotateZ(Math.PI / 2);
        wheel.translate(dx, 0.42, dz);
        parts.push(wheel);
      }
      return mergeG(parts);
    })();
    const CARS = 26;
    const cars = new THREE.InstancedMesh(carGeo, patchStd(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.25, flatShading: true }), {
        frag: `
          // dust film, heavier low down; a little rust in the noise
          float dust = smoothstep(1.6, 0.1, vWP.y) * 0.55 + fbm(vWP.xz * 3.0) * 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.55, vec3(0.20,0.18,0.15), clamp(dust, 0.0, 0.8));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28,0.14,0.08), smoothstep(0.72, 0.95, fbm(vWP.xyz.xz * 1.4 + vWP.y)) * 0.5);
        `,
      }), CARS);
    cars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CARS * 3), 3);
    const PAINT = ['#8f9298', '#3f4a5c', '#6b2f28', '#2f4a3a', '#b8b2a6', '#1f2328'];
    for (let i = 0; i < CARS; i++) {
      const onX = Math.random() < 0.5;
      const along = rnd(215, -215), lane = (Math.random() < 0.5 ? -1 : 1) * rnd(8.5, 3.2);
      const x = onX ? along : lane, z = onX ? lane : along;
      const askew = Math.random() < 0.22 ? rnd(1.2, -1.2) : rnd(0.09, -0.09);
      _e.set(0, (onX ? Math.PI / 2 : 0) + askew, Math.random() < 0.08 ? 2.9 : 0);
      cars.setMatrixAt(i, _m4.compose(_v.set(x, 0, z), _q.setFromEuler(_e), _s.set(1, 1, 1)));
      cars.setColorAt(i, _c.set(PAINT[Math.floor(Math.random() * PAINT.length)]));
    }
    cars.castShadow = true;
    g.add(cars);

    /* a few street lamps still burning: emissive head, additive cone, and a
       pool on the tarmac — three real lights, the rest faked */
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.9, flatShading: true });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffdca8, emissive: 0xffb75a, emissiveIntensity: 3.2, roughness: 0.4, flatShading: true,
    });
    const coneMat = new THREE.MeshBasicMaterial({
      map: rayTex, color: 0xffc070, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const poolMat = new THREE.MeshBasicMaterial({
      map: softTex, color: 0xffb466, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    const lamps = [];
    for (let i = 0; i < 14; i++) {
      const onX = i % 2 === 0;
      const along = -200 + i * 30 + rnd(8, -8), lane = (i % 4 < 2 ? -1 : 1) * 12.5;
      const x = onX ? along : lane, z = onX ? lane : along;
      const on = Math.random() < 0.45;
      const post = new THREE.Group();
      post.position.set(x, 0, z);
      post.rotation.y = Math.atan2(-x, -z) + (Math.random() < 0.15 ? rnd(0.5, -0.5) : 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, 9, 6), lampMat);
      pole.position.y = 4.5;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.4), lampMat);
      arm.position.set(0, 9, 1.1);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 1.8), lampMat);
      head.position.set(0, 8.85, 2.2);
      post.add(pole, arm, head);
      if (on) {
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.5), bulbMat);
        bulb.position.set(0, 8.66, 2.2);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 7, 8.6, 10, 1, true), coneMat);
        cone.position.set(0, 4.4, 2.2);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(19, 19), poolMat);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(0, 0.08, 2.2);
        post.add(bulb, cone, pool);
        lamps.push({ bulb, cone, pool, ph: rnd(6.28), bad: Math.random() < 0.3 });
        if (lamps.length <= 3) {
          const pl = new THREE.PointLight(0xffb466, 90, 34, 2);
          pl.position.set(0, 8.4, 2.2);
          post.add(pl);
        }
      }
      g.add(post);
    }

    /* The watcher — a mechanical eye. Built like a real one: a sclera shell,
       a curved cornea over an iris with a true black pupil that dilates, a
       specular catchlight, and two armoured lids that blink. Everything uses
       its own haze mix rather than scene fog, so it stays a silhouette at any
       fog density. */
    const eye = new THREE.Group();
    eye.name = 'city_eye';
    eye.position.set(118, 56, 0);
    const EYE_R = 23;
    const HAZE = new THREE.Color(0x0e141c);

    // the shell: riveted plating, grimy, with a hot rim from the city below
    const plate = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uT, uHaze: { value: HAZE } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vW;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position;
          vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE}
        varying vec3 vN; varying vec3 vP; varying vec3 vW; uniform float uT; uniform vec3 uHaze;
        void main(){
          vec3 n = normalize(vN);
          vec2 sph = vec2(atan(vP.z, vP.x), acos(clamp(vP.y / max(length(vP), 0.001), -1.0, 1.0)));
          float seam = smoothstep(0.03, 0.0, abs(fract(sph.x * 4.7) - 0.5) - 0.44)
                     + smoothstep(0.03, 0.0, abs(fract(sph.y * 5.2) - 0.5) - 0.45);
          float grime = fbm(sph * 6.0) * 0.6 + fbm(sph * 22.0) * 0.4;
          vec3 c = mix(vec3(0.16,0.155,0.15), vec3(0.30,0.29,0.28), grime);
          c *= 1.0 - clamp(seam, 0.0, 1.0) * 0.55;
          float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
          c += vec3(0.34,0.17,0.10) * rim;
          gl_FragColor = vec4(mix(c, uHaze, 0.28), 1.0);
        }`,
    });
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 40, 26), plate));

    /* the iris — a spherical cap so it lies on the eyeball's curvature. the
       radial coordinate is the polar angle, which is what makes a real black
       pupil, a fibrous stroma and a limbal ring all fall out cleanly. */
    const iris = new THREE.Group();
    const uPupil = { value: 0.3 };
    const irisMat = new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide,
      uniforms: { uT, uPupil, uHaze: { value: HAZE } },
      vertexShader: `varying vec3 vL; varying vec3 vW; varying vec3 vN;
        void main(){ vL = normalize(position); vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE}
        varying vec3 vL; varying vec3 vW; varying vec3 vN;
        uniform float uT; uniform float uPupil; uniform vec3 uHaze;
        void main(){
          float r = acos(clamp(vL.y, -1.0, 1.0)) / 0.92;
          float a = atan(vL.z, vL.x);
          // stroma: radial fibres, crypts, a little colour variation
          float fibre = fbm(vec2(a * 11.0, r * 3.0)) * 0.6 + fbm(vec2(a * 34.0, r * 7.0)) * 0.4;
          float crypt = smoothstep(0.55, 0.95, fbm(vec2(a * 7.0, r * 5.0 + 3.0)));
          vec3 base = mix(vec3(0.42,0.20,0.07), vec3(0.86,0.52,0.16), fibre);
          base = mix(base, vec3(0.20,0.09,0.04), crypt * 0.55);
          // the collarette, where a real iris steps in thickness
          base *= 0.75 + 0.45 * smoothstep(0.34, 0.44, r);
          // it is lit from inside, brighter toward the pupil
          base += vec3(1.0,0.36,0.10) * smoothstep(0.9, 0.30, r) * 0.35;
          // limbal ring: the dark band at the outer edge
          base *= 1.0 - smoothstep(0.80, 1.0, r) * 0.85;
          // the pupil — genuinely black, and it dilates
          float pr = uPupil;
          float pupil = smoothstep(pr + 0.03, pr - 0.03, r);
          vec3 c = mix(base, vec3(0.012,0.010,0.010), pupil);
          // ...with a furnace deep inside it, only just visible
          c += vec3(1.0,0.20,0.05) * pupil * (0.10 + 0.10 * sin(uT * 0.6)) * smoothstep(pr, 0.0, r);
          c = mix(c, uHaze, 0.14);
          gl_FragColor = vec4(c, smoothstep(1.02, 0.97, r));
        }`,
    });
    const capGeo = new THREE.SphereGeometry(EYE_R * 1.004, 56, 34, 0, Math.PI * 2, 0, 0.92);
    const irisCap = new THREE.Mesh(capGeo, irisMat);
    irisCap.rotation.x = Math.PI / 2;              // face the group's +z
    // cornea: a clear dome over the iris carrying the catchlight
    const cornea = new THREE.Mesh(
      new THREE.SphereGeometry(EYE_R * 1.055, 48, 30, 0, Math.PI * 2, 0, 0.85),
      new THREE.ShaderMaterial({
        fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uT },
        vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vW;
          void main(){ vL = normalize(position); vN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `varying vec3 vL; varying vec3 vN; varying vec3 vW; uniform float uT;
          void main(){
            vec3 V = normalize(cameraPosition - vW);
            float fres = pow(1.0 - clamp(dot(normalize(vN), V), 0.0, 1.0), 2.6);
            // a single hard catchlight, offset like a real highlight
            vec3 L = normalize(vec3(-0.45, 0.62, 0.65));
            float spec = pow(max(dot(normalize(vN), normalize(L + V)), 0.0), 90.0);
            vec3 c = vec3(0.30,0.34,0.42) * fres * 0.5 + vec3(1.0,0.95,0.88) * spec * 1.1;
            gl_FragColor = vec4(c, clamp(fres * 0.35 + spec, 0.0, 1.0));
          }`,
      }));
    cornea.rotation.x = Math.PI / 2;
    iris.add(irisCap, cornea);
    eye.add(iris);

    /* lids: two armoured shells a hair larger than the eyeball. open, they sit
       swung back out of the way; closed, they meet across the middle. */
    const lidMat = new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide,
      uniforms: { uT, uHaze: { value: HAZE } },
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vW;
        void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE}
        varying vec3 vP; varying vec3 vN; varying vec3 vW; uniform vec3 uHaze;
        void main(){
          vec3 n = normalize(vN);
          vec2 sph = vec2(atan(vP.z, vP.x), acos(clamp(vP.y / max(length(vP), 0.001), -1.0, 1.0)));
          // heavy overlapping plates, like a shutter or a beetle's elytra
          float band = abs(fract(sph.y * 7.0) - 0.5);
          float step_ = smoothstep(0.46, 0.5, band);
          float grime = fbm(sph * 8.0);
          vec3 c = mix(vec3(0.12,0.115,0.11), vec3(0.24,0.23,0.22), grime);
          c *= 0.7 + 0.5 * step_;
          float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
          c += vec3(0.30,0.15,0.09) * rim * 0.8;
          gl_FragColor = vec4(mix(c, uHaze, 0.24), 1.0);
        }`,
    });
    const lidGeo = new THREE.SphereGeometry(EYE_R * 1.075, 44, 26, 0, Math.PI * 2, 0, 1.15);
    const lidTop = new THREE.Mesh(lidGeo, lidMat);
    const lidBot = new THREE.Mesh(lidGeo, lidMat);
    lidBot.rotation.x = Math.PI;                   // cap points down
    eye.add(lidTop, lidBot);
    // a lash ridge on each lid edge, so the closing line reads
    const lashMat = new THREE.MeshBasicMaterial({ color: 0x1a1613, fog: false });
    const lashR = EYE_R * 1.075 * Math.sin(1.15), lashY = EYE_R * 1.075 * Math.cos(1.15);
    for (const [lid, sign] of [[lidTop, 1], [lidBot, -1]]) {
      const lash = new THREE.Mesh(new THREE.TorusGeometry(lashR, EYE_R * 0.032, 5, 40), lashMat);
      lash.rotation.x = Math.PI / 2;
      lash.position.y = lashY * sign * (sign > 0 ? 1 : -1);
      lid.add(lash);
    }

    // armature: three rings turning on their own axes
    const arms = [];
    for (let i = 0; i < 3; i++) {
      const ringMat = new THREE.MeshBasicMaterial({ color: [0x6f3a18, 0x5a3020, 0x4a3c2e][i], fog: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(EYE_R * (1.22 + i * 0.17), EYE_R * 0.038, 5, 44), ringMat);
      ring.rotation.set(rnd(3), rnd(3), rnd(3));
      eye.add(ring);
      arms.push({ ring, sp: rnd(0.05, 0.012) * (i % 2 ? -1 : 1) });
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(EYE_R * 5.5, EYE_R * 5.5), new THREE.MeshBasicMaterial({
      map: softTex, color: 0xa8502a, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    halo.position.z = -EYE_R * 1.2;
    eye.add(halo);
    // blink state: mostly open, with the odd double-blink
    const blink = { next: 3.5, t: -1, dur: 0.34 };
    g.add(eye);

    const ash = pointCloud(g, 620, () => ({ x: rnd(180, -180), y: rnd(70, 0.5), z: rnd(180, -180), v: rnd(1.4, 0.2) }),
      { color: 0x8f9aa8, size: 0.26, opacity: 0.3, additive: false });

    const _look = new THREE.Vector3();
    return {
      group: g,
      fog: new THREE.FogExp2(0x0e141c, 0.0092),
      css: '#080c12',
      glass: { color: 0xffdca8, emissive: 0xffa64a, intensity: 2.6 },
      light: {
        hemi: { i: 0.8, sky: 0x4a5f8a, gnd: 0x1a140e },
        key: { mul: 0.5, c: 0x7f9fd0, p: [-30, 40, -20] },
        fill: { mul: 0.85, c: 0xc07a3a },
      },
      tick(t, dt) {
        for (const a of arms) { a.ring.rotation.z += a.sp * dt * 6; a.ring.rotation.x += a.sp * dt * 2.4; }
        /* it patrols: a slow wide circuit of the city at rooftop height, so
           it drifts through frame from any camera angle instead of sitting
           above the zoom ceiling */
        const ea = t * 0.035;
        eye.position.set(
          Math.cos(ea) * 118,
          52 + Math.sin(t * 0.055) * 12 + Math.sin(ea * 2) * 8,
          Math.sin(ea) * 118);
        // the gaze holds the tower, with a small saccade drift
        _look.set(Math.sin(t * 0.23) * 5, TOP * 0.45 + Math.sin(t * 0.31) * 3, Math.cos(t * 0.19) * 5);
        iris.lookAt(_look);
        eye.children[0].rotation.y = -ea;          // the shell plating turns
        halo.lookAt(camera.position);

        /* blink: lids swing shut and open again, then wait a random while.
           the pupil constricts through the blink, as a real one does. */
        blink.next -= dt;
        if (blink.t < 0 && blink.next <= 0) {
          blink.t = 0;
          blink.dur = 0.3 + Math.random() * 0.14;
          blink.next = 2.5 + Math.random() * 7;
        }
        let shut = 0;
        if (blink.t >= 0) {
          blink.t += dt;
          const u = blink.t / blink.dur;
          // shut fast, open slower — the asymmetry is most of the realism
          shut = u < 0.38 ? u / 0.38 : Math.max(0, 1 - (u - 0.38) / 0.62);
          shut = shut * shut * (3 - 2 * shut);
          if (u >= 1) blink.t = -1;
        }
        // open: swung back 0.62 rad past the rim; closed: meeting at the middle
        lidTop.rotation.x = -0.62 + shut * 1.30;
        lidBot.rotation.x = Math.PI + 0.62 - shut * 1.30;
        // pupil: slow hunting dilation, pinched shut during a blink
        uPupil.value = (0.30 + 0.09 * Math.sin(t * 0.21) + 0.03 * Math.sin(t * 1.7)) * (1 - shut * 0.55);
        iris.visible = shut < 0.985;
        for (const l of lamps) {
          const base = l.bad ? (Math.random() < 0.06 ? 0.15 : 1) : 1;
          const k = base * (0.86 + 0.14 * Math.sin(t * 9 + l.ph));
          l.bulb.material.emissiveIntensity = 3.2 * k;
          l.cone.material.opacity = 0.15 * k;
          l.pool.material.opacity = 0.28 * k;
        }
        const ap = ash.pos;
        for (let i = 0; i < ap.length; i += 3) {
          ap[i + 1] -= ash.vel[i / 3] * dt;
          ap[i] += Math.sin(t * 0.3 + i) * dt * 1.1;
          if (ap[i + 1] < 0) ap[i + 1] = 70;
        }
        ash.m.geometry.attributes.position.needsUpdate = true;
      },
    };
  }

  /* ============================ 6 · deep space ============================ */

  function buildSpace() {
    const g = new THREE.Group();
    g.name = 'world_space';
    g.add(skyDome(0x11132c, 0x05060f, 0x000000));

    /* stars: two overlapping shells (near/bright, far/dim) so parallax reads
       even though nothing here actually moves relative to the camera. each
       point twinkles on its own phase, in a round glyph rather than a square
       dot — the same trick as the nav's own starfield, just self-contained. */
    const stars = (() => {
      const N = 3200;
      const pos = new Float32Array(N * 3), seed = new Float32Array(N),
        size = new Float32Array(N), col = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const far = Math.random() < 0.6;
        const v = new THREE.Vector3().randomDirection().multiplyScalar(far ? rnd(400, 260) : rnd(220, 90));
        pos.set([v.x, v.y, v.z], i * 3);
        seed[i] = rnd(6.28);
        size[i] = far ? rnd(1.6, 0.6) : rnd(3.2, 1.4);
        _c.setHSL(rnd(0.62, 0.5) + (Math.random() < 0.12 ? rnd(0.12, 0.02) : 0), rnd(0.4, 0.05), rnd(0.95, 0.55));
        col.set([_c.r, _c.g, _c.b], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.ShaderMaterial({
        fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT },
        vertexShader: `attribute float aSeed; attribute float aSize; attribute vec3 aColor;
          uniform float uT; varying vec3 vColor; varying float vTwinkle;
          void main() {
            vColor = aColor;
            vTwinkle = 0.5 + 0.5 * sin(uT * (0.4 + fract(aSeed) * 1.1) + aSeed * 6.2831853);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (300.0 / -mv.z) * (0.6 + 0.4 * vTwinkle);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `varying vec3 vColor; varying float vTwinkle;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float core = smoothstep(0.5, 0.0, length(uv) * 2.0);
            gl_FragColor = vec4(vColor, core * (0.4 + 0.6 * vTwinkle));
          }`,
      });
      const m = new THREE.Points(geo, mat);
      m.frustumCulled = false;
      g.add(m);
      return m;
    })();

    /* nebulae: soft colour washes far out, each its own slow-turning group so
       the parallax between them reads even though the camera barely moves */
    const nebGroup = new THREE.Group();
    g.add(nebGroup);
    const NEB = [
      [0x9a6cff, new THREE.Vector3(-135, 60, -160), 85, 0.16],
      [0x3fa0e0, new THREE.Vector3(160, -40, -125), 95, 0.15],
      [0xe0508c, new THREE.Vector3(40, 100, 170), 78, 0.14],
      [0x4fe8d0, new THREE.Vector3(-110, -90, 135), 72, 0.13],
    ];
    for (const [color, center, radius, opacity] of NEB) {
      pointCloud(nebGroup, 1300, () => {
        const d = new THREE.Vector3().randomDirection();
        const r = radius * Math.pow(Math.random(), 0.5);
        return { x: center.x + d.x * r, y: center.y + d.y * r * 0.55, z: center.z + d.z * r };
      }, { color, size: 22, opacity, additive: true });
    }

    /* the sun: a small, hot red dwarf. Its direction also lights the ocean
       world below, so the two agree on where "up" is. */
    const SUN_DIR = new THREE.Vector3(0.5, 0.32, 0.8).normalize();
    const SUN_COLOR = new THREE.Vector3(1.6, 0.6, 0.34);
    const sun = new THREE.Group();
    sun.position.copy(SUN_DIR.clone().multiplyScalar(360));
    sun.add(new THREE.Mesh(new THREE.SphereGeometry(13, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff6a35, fog: false })));
    const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex, color: 0xff8747, transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    sunHalo.scale.setScalar(130);
    sun.add(sunHalo);
    const sunHalo2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex, color: 0xffcf9a, transparent: true, opacity: 0.7, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    sunHalo2.scale.setScalar(46);
    sun.add(sunHalo2);
    g.add(sun);

    /* a lone ocean world: seamless object-space noise (no UV, so no seam)
       carves continents and swirling cloud bands, lit by the red dwarf above
       with a lambert term, a sun glint off open water, and a blue limb haze */
    const planet = new THREE.Group();
    planet.position.set(150, 45, -225);
    planet.rotation.z = 0.2;
    const body = new THREE.Mesh(new THREE.SphereGeometry(48, 48, 34), new THREE.ShaderMaterial({
      fog: false,
      uniforms: { uT, uSunDir: { value: SUN_DIR }, uSunColor: { value: SUN_COLOR } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vWPos;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position;
          vec4 wp = modelMatrix * vec4(position,1.0); vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${NOISE}
        varying vec3 vN; varying vec3 vP; varying vec3 vWPos;
        uniform float uT; uniform vec3 uSunDir; uniform vec3 uSunColor;
        void main(){
          vec3 n = normalize(vN);
          float land = fbm(vP.xy * 0.028 + vP.yz * 0.011) * 0.6 + fbm(vP.yz * 0.06) * 0.4;
          float continent = smoothstep(0.52, 0.64, land);
          vec3 ocean = mix(vec3(0.03,0.16,0.40), vec3(0.08,0.34,0.52), smoothstep(-0.2, 0.6, land));
          vec3 shore = mix(vec3(0.30,0.38,0.20), vec3(0.58,0.50,0.32), smoothstep(0.62, 0.92, land));
          vec3 surf = mix(ocean, shore, continent);
          vec2 cp = vP.xy * 0.09 + vec2(uT * 0.02, uT * 0.01);
          float clouds = fbm(cp) * 0.6 + fbm(vP.yz * 0.15 - vec2(uT * 0.014, 0.0)) * 0.4;
          float cloudMask = smoothstep(0.56, 0.8, clouds);
          surf = mix(surf, vec3(0.94,0.96,0.98), cloudMask * 0.85);
          float lam = clamp(dot(n, uSunDir) * 0.55 + 0.48, 0.0, 1.0);
          vec3 lit = surf * (0.22 + 0.95 * lam) * uSunColor;
          vec3 viewDir = normalize(cameraPosition - vWPos);
          vec3 h = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(n, h), 0.0), 70.0) * (1.0 - continent) * (1.0 - cloudMask) * lam;
          lit += vec3(1.0,0.82,0.62) * spec * 1.8;
          float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.4);
          lit += mix(vec3(0.25,0.5,0.85), uSunColor, 0.4) * fres * 0.55;
          gl_FragColor = vec4(lit, 1.0);
        }`,
    }));
    planet.add(body);
    g.add(planet);

    const moon2 = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xc9c2d8, fog: false }));
    moon2.position.set(-125, 85, 170);
    g.add(moon2);

    /* a belt of tumbled rock, held in one static InstancedMesh and orbited by
       rotating the whole group each frame — far cheaper than per-instance
       matrix updates for something this far from the camera */
    const belt = new THREE.Group();
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = patchStd(new THREE.MeshStandardMaterial({
      color: 0x6a6482, roughness: 1, flatShading: true, emissive: 0x1c1830, emissiveIntensity: 0.7,
    }), {
      frag: `diffuseColor.rgb *= 0.7 + 0.55 * fbm(vWP.xz * 0.4 + vWP.y * 0.3);`,
    });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 46);
    for (let i = 0; i < 46; i++) {
      const a = rnd(6.28), d = rnd(200, 130), y = rnd(40, -30), sz = rnd(4.5, 1);
      _e.set(rnd(3), rnd(3), rnd(3));
      rocks.setMatrixAt(i, _m4.compose(
        _v.set(Math.cos(a) * d, y, Math.sin(a) * d), _q.setFromEuler(_e), _s.set(sz, sz * rnd(1, 0.5), sz)));
    }
    belt.add(rocks);
    g.add(belt);

    const motes = pointCloud(g, 420, () => ({
      x: rnd(180, -180), y: rnd(130, -130), z: rnd(180, -180), v: rnd(0.15, 0.02),
    }), { color: 0xbfd0ff, size: 0.4, opacity: 0.4 });

    return {
      group: g,
      fog: new THREE.FogExp2(0x05060d, 0.0011),
      css: '#03040a',
      glass: { color: 0xcfe4ff, emissive: 0x8fb0ff, intensity: 1.3 },
      light: {
        hemi: { i: 0.95, sky: 0x5a70c8, gnd: 0x14162c },
        key: { mul: 0.9, c: 0xffab7a, p: [22, 14, 35] },
        fill: { mul: 0.55, c: 0x7a8ad0 },
      },
      tick(t, dt) {
        nebGroup.rotation.y = t * 0.004;
        planet.rotation.y = 0.2 + t * 0.02;
        belt.rotation.y = t * 0.015;
        const mp = motes.pos;
        for (let i = 0; i < mp.length; i += 3) {
          mp[i + 1] += motes.vel[i / 3] * dt;
          if (mp[i + 1] > 130) mp[i + 1] = -130;
        }
        motes.m.geometry.attributes.position.needsUpdate = true;
      },
    };
  }

  /* ============================== teleport =============================== */

  const tp = {
    on: { value: 0 }, cut: { value: -50 }, flash: { value: 0 },
    active: false, phase: 0, t: 0, kind: null, baseY: model.position.y,
  };
  const patchedMats = new WeakSet();

  /* one shared clip: fragments below `cut` are discarded and the band just
     above it burns white. the tower rises while the cut climbs faster, so it
     reads as the whole building being drawn up into the light. */
  function patchTeleport(mats) {
    for (const m of mats) {
      if (!m || m.isShaderMaterial || patchedMats.has(m)) continue;
      patchedMats.add(m);
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (s, r) => {
        if (prev) prev(s, r);
        s.uniforms.uTpOn = tp.on;
        s.uniforms.uTpCut = tp.cut;
        s.uniforms.uTpFlash = tp.flash;
        s.vertexShader = 'varying float vTpY;\n' + s.vertexShader.replace(
          '#include <project_vertex>', `
          mat4 tpIM = mat4(1.0);
          #ifdef USE_INSTANCING
            tpIM = instanceMatrix;
          #endif
          vTpY = (modelMatrix * tpIM * vec4(transformed, 1.0)).y;
          #include <project_vertex>`);
        s.fragmentShader = 'varying float vTpY;\nuniform float uTpOn;\nuniform float uTpCut;\nuniform float uTpFlash;\n' +
          s.fragmentShader
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
              float tpEdge = 0.0;
              if (uTpOn > 0.5) {
                if (vTpY < uTpCut) discard;
                tpEdge = smoothstep(uTpCut + 2.4, uTpCut, vTpY);
              }`)
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
              gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.94, 0.76),
                                     clamp(uTpFlash * 0.85 + tpEdge, 0.0, 1.0));`);
      };
      const key = m.customProgramCacheKey;
      m.customProgramCacheKey = () => 'tp' + (key ? key.call(m) : m.type);
      m.needsUpdate = true;
    }
  }
  (() => {
    const mats = new Set();
    model.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    });
    patchTeleport([...mats]);
  })();

  const tpFx = new THREE.Group();
  tpFx.name = 'teleport_fx';
  tpFx.visible = false;
  scene.add(tpFx);
  const addFx = (mesh) => { tpFx.add(mesh); return mesh; };
  const flat = (color, opacity = 0) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const tpRing = addFx(new THREE.Mesh(new THREE.RingGeometry(R * 0.55, R * 1.02, 64), flat(0xfff0c8)));
  const tpRing2 = addFx(new THREE.Mesh(new THREE.RingGeometry(R * 0.9, R * 1.0, 64), flat(0xffe0a0)));
  tpRing.rotation.x = tpRing2.rotation.x = -Math.PI / 2;
  tpRing.position.y = 0.07; tpRing2.position.y = 0.05;
  const tpDisc = addFx(new THREE.Mesh(new THREE.CircleGeometry(R * 1.14, 48), flat(0xfffbe8)));
  tpDisc.rotation.x = -Math.PI / 2;
  const tpCol = addFx(new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.95, R * 1.12, TOP + 14, 24, 1, true),
    Object.assign(flat(0xffe9b8), { map: rayTex })));
  tpCol.position.y = (TOP + 14) / 2;
  const tpSparks = pointCloud(tpFx, 260, () => {
    const a = rnd(6.28), d = rnd(R * 1.2, 0.5);
    return { x: Math.cos(a) * d, y: rnd(TOP), z: Math.sin(a) * d, v: rnd(26, 8) };
  }, { color: 0xfff0c0, size: 0.32, opacity: 0 });

  const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const OUT = 0.95, IN = 1.05, LIFT = 7;

  /* onSwap runs at the midpoint instead of the built-in world switch, so a
     host page can swap to any backdrop it manages itself */
  function teleport(kind, onSwap) {
    if (tp.active) return false;
    tp.kind = kind;
    tp.swap = onSwap || null;
    tp.active = true;
    tp.phase = 0;
    tp.t = 0;
    tp.on.value = 1;
    tp.baseY = model.position.y;
    tpFx.position.set(model.position.x, model.position.y, model.position.z);
    tpFx.visible = true;
    if (fx) fx.visible = false;
    window.dispatchEvent(new CustomEvent('lair-teleport', { detail: { kind, phase: 'out' } }));
    return true;
  }

  function tickTeleport(dt) {
    if (!tp.active) return;
    tp.t += dt;
    const lo = -1.5, hi = TOP + 12;
    const out = tp.phase === 0;
    const u = Math.min(tp.t / (out ? OUT : IN), 1);
    const e = easeIO(u);
    const k = out ? e : 1 - e;
    tp.cut.value = lo + (hi - lo) * k;
    model.position.y = tp.baseY + k * LIFT;
    tp.flash.value = out ? Math.sin(u * Math.PI) * 0.7 : (1 - e) * 0.7;
    tpRing.scale.setScalar(0.4 + k * 2.6);
    tpRing2.scale.setScalar(0.4 + k * 4.6);
    tpRing.material.opacity = out ? Math.sin(u * Math.PI) * 0.9 : (1 - u) * 0.85;
    tpRing2.material.opacity = out ? Math.sin(u * Math.PI) * 0.35 : (1 - u) * 0.3;
    tpCol.material.opacity = out ? Math.sin(u * Math.PI) * 0.55 : (1 - e) * 0.5;
    tpDisc.position.y = tp.cut.value - model.position.y + tp.baseY;
    tpDisc.scale.setScalar(1 + k * 0.4);
    tpDisc.material.opacity = out ? 0.55 * Math.sin(Math.min(1, u * 1.4) * Math.PI) : (1 - e) * 0.5;
    tpSparks.m.material.opacity = out ? 0.8 * Math.sin(u * Math.PI) : (1 - e) * 0.6;

    const sp = tpSparks.pos;
    for (let i = 0; i < sp.length; i += 3) {
      sp[i + 1] += tpSparks.vel[i / 3] * dt;
      if (sp[i + 1] > TOP + 10) sp[i + 1] = 0;
    }
    tpSparks.m.geometry.attributes.position.needsUpdate = true;

    if (u < 1) return;
    if (out) {
      if (tp.swap) tp.swap(tp.kind); else set(tp.kind, true);
      tp.phase = 1;
      tp.t = 0;
      tpFx.position.set(model.position.x, tp.baseY, model.position.z);
      window.dispatchEvent(new CustomEvent('lair-teleport', { detail: { kind: tp.kind, phase: 'in' } }));
    } else {
      tp.active = false;
      tp.on.value = 0;
      tp.flash.value = 0;
      tp.cut.value = lo;
      model.position.y = tp.baseY;
      tpFx.visible = false;
      if (fx) { fx.visible = true; fx.position.copy(model.position); }
      window.dispatchEvent(new CustomEvent('lair-teleport', { detail: { kind: tp.kind, phase: 'done' } }));
    }
  }

  /* ========================== the outer shell ============================ */

  let shell = null, shellMode = 'off', shellHidden = false;

  /* the lit panes are the one part of the shell that has to answer to the
     backdrop: candlelight at dusk, cold and dim under water, sodium-tinted in
     the city. set() pushes the active world's values in here. */
  const GLASS_DEFAULT = { color: 0xffe9b8, emissive: 0xffcf7a, intensity: 1.7 };
  const shellGlass = new THREE.MeshStandardMaterial({
    color: GLASS_DEFAULT.color, emissive: GLASS_DEFAULT.emissive,
    emissiveIntensity: GLASS_DEFAULT.intensity, roughness: 0.4, flatShading: true,
  });
  function applyGlass(cfg) {
    const c = cfg || GLASS_DEFAULT;
    shellGlass.color.set(c.color);
    shellGlass.emissive.set(c.emissive);
    shellGlass.emissiveIntensity = c.intensity;
  }

  /* ghost mode: a fresnel rim so the silhouette stays legible while the
     interior shows straight through. respects the teleport clip. */
  const ghostMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uCol: { value: new THREE.Color(0x9fc4ff) },
      uTpOn: tp.on, uTpCut: tp.cut,
    },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        mat4 im = mat4(1.0);
        #ifdef USE_INSTANCING
          im = instanceMatrix;
        #endif
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      uniform vec3 uCol; uniform float uTpOn; uniform float uTpCut;
      void main(){
        if (uTpOn > 0.5 && vY < uTpCut) discard;
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uCol * (0.04 + f * 0.85), 0.05 + f * 0.36);
      }`,
  });

  function buildShell() {
    const s = new THREE.Group();
    s.name = 'tower_shell';
    const SR = R + 1.55;                  // clears the spiral stair and its handrail
    const MS = {
      stone: new THREE.MeshStandardMaterial({ color: 0x6b6259, roughness: 0.95, flatShading: true }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x544c45, roughness: 0.95, flatShading: true }),
      stoneLight: new THREE.MeshStandardMaterial({ color: 0x837868, roughness: 0.95, flatShading: true }),
      band: new THREE.MeshStandardMaterial({ color: 0x4a423b, roughness: 0.9, flatShading: true }),
      wood: new THREE.MeshStandardMaterial({ color: 0x6b4325, roughness: 0.95, flatShading: true }),
      iron: new THREE.MeshStandardMaterial({ color: 0x3f3a36, metalness: 0.4, roughness: 0.6, flatShading: true }),
      // the observatory needs sky: its roof is glazed, not shingled
      roofGlass: new THREE.MeshStandardMaterial({
        color: 0xbcdcf0, roughness: 0.18, metalness: 0.1, flatShading: true,
        transparent: true, opacity: 0.26, depthWrite: false,
      }),
    };
    const glassMat = shellGlass;

    /* every block is a unit cube placed by matrix, so the whole masonry is a
       handful of instanced draws instead of two thousand meshes */
    const buckets = {};
    const put = (m, w2, h, d, x, y, z, ry = 0) => {
      (buckets[m] ??= []).push({ p: [x, y, z], s: [w2, h, d], ry });
    };
    const arc = (m, w2, h, d, ang, rad, y, extraRy = 0) => {
      const a = RAD(ang);
      put(m, w2, h, d, rad * Math.sin(a), y, rad * Math.cos(a), a + extraRy);
    };

    /* round bays, one per interior oculus — same world angle (local + k·ROT),
       same height, so inside and outside finally agree */
    const BAYS = [
      { k: 1, la: 196, r: 0.62, y: 3.1 },   // quarters
      { k: 2, la: 214, r: 0.70, y: 3.2 },   // kitchen
      { k: 3, la: 175, r: 0.82, y: 3.4 },   // library
      { k: 4, la: 178, r: 0.88, y: 3.5 },   // lab
    ].map((b) => ({
      ...b,
      a: b.la + b.k * ROT,
      rr: b.r * (SR / R),                    // same angular size seen from the axis
      wy: b.k * FH + b.y,
    }));
    const DA = 352;                        // the door, on the sanctum storey

    for (let k = 0; k < NF - 1; k++) {
      const base = k * FH;
      const courseH = 0.62;
      const rows = Math.round((FH - 0.4) / courseH);
      for (let r = 0; r < rows; r++) {
        const y = base + 0.12 + r * courseH + courseH / 2;
        const off = (r % 2) * 4.5;
        for (let a = 0; a < 360; a += 9) {
          const aa = a + off;
          let skip = false;
          for (const b of BAYS) {
            if (b.k !== k) continue;
            const dx = RAD(((aa - b.a + 540) % 360) - 180) * SR;
            if (Math.hypot(dx, y - b.wy) < b.rr + 0.22) { skip = true; break; }
          }
          if (!skip && k === 0) {
            const dd = RAD(((aa - DA + 540) % 360) - 180) * SR;
            if (Math.abs(dd) < 1.4 && y < 3.8) skip = true;
          }
          if (skip) continue;
          const mm = (r + Math.round(aa / 9)) % 5 === 0 ? 'stoneLight' : (r % 3 === 0 ? 'stoneDark' : 'stone');
          arc(mm, 0.92, courseH * 0.94, 0.44, aa, SR, y);
        }
      }
      for (let a = 0; a < 360; a += 8) arc('band', 0.86, 0.34, 0.64, a, SR + 0.06, base + FH - 0.16);
      const bb = BAYS.find((b) => b.k === k);
      if (bb) arc('stoneDark', 1.6, FH * 0.86, 1.6, bb.a + 180, SR + 0.55, base + FH * 0.45);
    }

    /* observatory storey: an open arcade, so the telescope has a horizon */
    const OB = (NF - 1) * FH;
    const PIERS = 8;
    for (let i2 = 0; i2 < PIERS; i2++) {
      const a0 = (i2 * 360) / PIERS;
      arc('stone', 1.6, WH * 0.72, 1.2, a0, SR, OB + WH * 0.36 + 0.2);
      for (let j2 = 1; j2 <= 5; j2++) {
        const u = j2 / 6;
        arc('stoneLight', 0.9, 0.5, 0.62, a0 + u * (360 / PIERS), SR,
          OB + WH * 0.72 + 0.3 + Math.sin(u * Math.PI) * 1.15);
      }
    }
    for (let a = 0; a < 360; a += 8) arc('band', 0.88, 0.42, 0.82, a, SR + 0.08, OB + WH + 0.4);

    // door, steps and a lantern
    arc('wood', 2.4, 3.6, 0.5, DA, SR - 0.04, 1.8);
    arc('iron', 2.6, 0.24, 0.66, DA, SR, 3.7);
    arc('iron', 0.2, 0.2, 0.74, DA, SR, 1.95);
    arc('stoneLight', 3.5, 0.5, 1.3, DA, SR + 0.2, 0.2);
    for (let i2 = 0; i2 < 3; i2++) {
      arc('stoneLight', 4.3 + i2 * 0.7, 0.34, 1.5 + i2 * 0.5, DA, SR + 0.7 + i2 * 0.35, -0.16 - i2 * 0.34);
    }
    arc('iron', 0.14, 0.9, 0.14, DA + 8, SR + 0.3, 4.05);

    // balcony under the arcade
    const BY = OB + WH * 0.2;
    for (let a = 0; a < 360; a += 7) {
      arc('stoneDark', 0.84, 0.3, 1.8, a, SR + 0.62, BY);
      arc('band', 0.26, 0.9, 0.26, a, SR + 1.1, BY + 0.6);
      arc('band', 0.94, 0.22, 0.5, a, SR + 1.1, BY + 1.12);
    }

    /* glazed cone roof: iron ribs and rings holding tinted panels */
    const RY = TOP + 0.95;
    for (let a = 0; a < 360; a += 6) arc('band', 1.22, 0.5, 2.0, a, SR + 0.6, RY);
    const RINGS = 12;
    for (let i2 = 0; i2 < RINGS; i2++) {
      const u = i2 / RINGS;
      const rad = (SR + 0.45) * (1 - u * 0.95);
      const y = RY + 0.5 + u * 8.4;
      const step = Math.max(7.5, 360 / Math.max(6, Math.round((2 * Math.PI * rad) / 1.05)));
      for (let a = 0; a < 360; a += step) {
        arc('roofGlass', 1.1, 0.78, 0.5, a + (i2 % 2) * step / 2, rad, y);
      }
      if (i2 % 3 === 0) for (let a = 0; a < 360; a += 30) arc('iron', 0.28, 0.86, 0.7, a, rad + 0.1, y);
    }
    for (let a = 0; a < 360; a += 30) {
      // ribs read as a continuous line because each ring drops one in
      arc('iron', 0.22, 0.5, 0.5, a, SR + 0.4, RY + 0.5);
    }
    put('band', 1.0, 1.2, 1.0, 0, RY + 9.4, 0);
    put('iron', 0.14, 2.6, 0.14, 0, RY + 11.0, 0);
    put('iron', 1.6, 0.5, 0.1, 0, RY + 12.15, 0);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const solids = [];
    for (const name in buckets) {
      const list = buckets[name];
      const im = new THREE.InstancedMesh(unit, MS[name], list.length);
      list.forEach((b, idx) => {
        im.setMatrixAt(idx, _m4.compose(
          _v.set(b.p[0], b.p[1], b.p[2]),
          _q.setFromAxisAngle(YUP, b.ry),
          _s.set(b.s[0], b.s[1], b.s[2])));
      });
      im.name = 'shell_' + name;
      im.castShadow = name !== 'roofGlass';
      im.receiveShadow = true;
      im.userData.solid = MS[name];
      solids.push(im);
      s.add(im);
    }

    /* the round windows themselves: stone ring, iron mullions, lit pane.
       one group per bay so the whole assembly just rotates into place. */
    for (const b of BAYS) {
      const grp = new THREE.Group();
      grp.rotation.y = RAD(b.a);
      grp.position.set(0, b.wy, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(b.rr + 0.1, 0.3, 5, 20), MS.stoneLight);
      ring.position.z = SR;
      ring.castShadow = true;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(b.rr * 2.4, 0.28, 0.9), MS.band);
      sill.position.set(0, -b.rr - 0.5, SR + 0.1);
      const pane = new THREE.Mesh(new THREE.CylinderGeometry(b.rr, b.rr, 0.3, 24), glassMat);
      pane.rotation.x = Math.PI / 2;
      pane.position.z = SR - 0.02;
      // the cross frame sits proud of the glass, plus a rim ring inside the
      // reveal — the same mullion pattern the interior oculus has
      const barA = new THREE.Mesh(new THREE.BoxGeometry(b.rr * 2.02, 0.13, 0.26), MS.iron);
      barA.position.z = SR + 0.16;
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.13, b.rr * 2.02, 0.26), MS.iron);
      barB.position.z = SR + 0.16;
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), MS.iron);
      hub.position.z = SR + 0.2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(b.rr - 0.03, 0.05, 4, 24), MS.iron);
      rim.position.z = SR + 0.14;
      grp.add(ring, sill, pane, barA, barB, hub, rim);
      s.add(grp);
      const frame = [ring, sill, barA, barB, hub, rim];
      const fmats = [MS.stoneLight, MS.band, MS.iron, MS.iron, MS.iron, MS.iron];
      frame.forEach((m, fi) => { m.userData.solid = fmats[fi]; solids.push(m); });
    }

    // the door lantern and the finial glass stay lit in every mode
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), glassMat);
    const la = RAD(DA + 8);
    lantern.position.set((SR + 0.3) * Math.sin(la), 3.35, (SR + 0.3) * Math.cos(la));
    const finial = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), glassMat);
    finial.position.set(0, RY + 12.55, 0);
    s.add(lantern, finial);

    s.userData = { solids };
    model.add(s);
    patchTeleport([...Object.values(MS), glassMat]);
    return s;
  }

  function setShell(mode) {
    if (mode !== undefined) shellMode = mode;
    if (!shell && shellMode === 'off') return shellMode;
    if (!shell) shell = buildShell();
    shell.visible = shellMode !== 'off' && !shellHidden;
    for (const im of shell.userData.solids) {
      im.material = shellMode === 'ghost' ? ghostMat : im.userData.solid;
      im.castShadow = shellMode === 'solid' && im.userData.solid !== shell.userData.roofMat;
    }
    return shellMode;
  }

  /* ============================== switching ============================== */

  const built = {};
  const BUILDERS = { seafloor: buildSeafloor, moon: buildMoon, forest: buildForest, beach: buildBeach, city: buildCity, space: buildSpace };
  const savedFog = scene.fog;
  let current = null;

  function set(kind, quiet) {
    if (kind === current && !quiet) return current;
    if (current && built[current]) built[current].group.visible = false;
    current = kind;
    if (!kind) {
      scene.fog = savedFog;
      applyLight(null);
      uFadeOn.value = 0;
      applyGlass(null);
      refreshFog();
      return current;
    }
    if (!built[kind]) {
      built[kind] = BUILDERS[kind]();
      scene.add(built[kind].group);
    }
    const w = built[kind];
    w.group.visible = true;
    scene.fog = w.fog;
    applyLight(w.light);
    uFadeOn.value = w.fade ? w.fade.on : 0;
    if (w.fade) { uFadeRad.value = w.fade.radius; uFadeAmt.value = w.fade.amount; }
    applyGlass(w.glass);
    refreshFog();
    return current;
  }
  // switching between no fog / Fog / FogExp2 changes the shader defines
  function refreshFog() {
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m && m.fog) m.needsUpdate = true; });
    });
  }

  function tick(t, dt) {
    uT.value = t;
    if (current && built[current]) built[current].tick(t, dt);
    tickTeleport(dt);
  }

  return {
    kinds: ['seafloor', 'moon', 'forest', 'beach', 'city', 'space'],
    set,
    tick,
    teleport,
    teleporting: () => tp.active,
    shell: setShell,
    shellMode: () => shellMode,
    /* focus mode: keep the shell out of the way while one storey is on screen */
    shellFocus(hidden) { shellHidden = !!hidden; if (shell) setShell(); },
    cssFor: (kind) => (built[kind] ? built[kind].css : null),
    wind: (v) => { uWind.value = v; },
    current: () => current,
  };
}
