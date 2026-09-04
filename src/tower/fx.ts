import * as THREE from 'three';

// Each star twinkles at its own phase/rate and carries a soft colour
// temperature (cool blue-white through faint ember), rendered as a round
// glyph via a fragment shader rather than square PointsMaterial dots.
const STAR_VERT = `
  attribute float aSeed;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = aColor;
    vTwinkle = 0.5 + 0.5 * sin(uTime * (0.5 + fract(aSeed) * 1.3) + aSeed * 6.2831853);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (240.0 / -mv.z) * (0.55 + 0.45 * vTwinkle);
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_FRAG = `
  precision mediump float;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float core = smoothstep(0.5, 0.0, length(uv));
    gl_FragColor = vec4(vColor, core * (0.35 + 0.65 * vTwinkle));
  }
`;

export function buildStarfield(scene: THREE.Scene) {
  const n = 2200;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const size = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(70 + Math.random() * 90);
    pos.set([v.x, v.y, v.z], i * 3);
    seed[i] = Math.random() * Math.PI * 2;
    size[i] = 0.9 + Math.random() * 2.6;
    const hue = 0.56 + (Math.random() - 0.5) * 0.3;
    tmp.setHSL(hue, 0.3 + Math.random() * 0.35, 0.72 + Math.random() * 0.22);
    color.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geo, mat);
  stars.name = 'starfield'; stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}

export function buildNebula(scene: THREE.Scene) {
  const clouds: [number, THREE.Vector3, number, number][] = [
    [0x8a5cff, new THREE.Vector3(-90, 40, -70), 52, 0.055],
    [0x2f8fc0, new THREE.Vector3(95, -20, -80), 60, 0.05],
    [0xc0407a, new THREE.Vector3(30, 70, 110), 46, 0.042],
    [0x3fd0c0, new THREE.Vector3(-70, -50, 90), 44, 0.038],
  ];
  for (const [color, center, radius, opacity] of clouds) {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3().randomDirection();
      const r = radius * Math.pow(Math.random(), 0.55);
      pos.set([center.x + d.x * r, center.y + d.y * r * 0.6, center.z + d.z * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cloud = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 16, sizeAttenuation: true, transparent: true, opacity,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    cloud.name = 'nebula'; cloud.frustumCulled = false;
    scene.add(cloud);
  }
  const world = new THREE.Mesh(
    new THREE.SphereGeometry(9, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0x5a4a7a, transparent: true, opacity: 0.75 })
  );
  world.name = 'far_world'; world.position.set(-78, 34, -96);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(15, 1.1, 6, 48),
    new THREE.MeshBasicMaterial({ color: 0x8f7fb8, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  ring.name = 'far_world_ring'; ring.rotation.x = 1.1; ring.rotation.z = 0.3;
  world.add(ring);
  scene.add(world);
}

export function makePoints(parent: THREE.Object3D, count: number, color: number, size: number, spawn: (i: number) => { x: number; y: number; z: number; v: number }) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const p = spawn(i);
    pos.set([p.x, p.y, p.z], i * 3); vel[i] = p.v;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({
    color, size, transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  m.frustumCulled = false; parent.add(m);
  return { m, pos, vel, boost: 1 };
}

let groundPlane: THREE.Mesh | null = null, gridHelper: THREE.Mesh | null = null;
export function setBackdrop(scene: THREE.Scene, kind: 'space' | 'void' | 'blueprint' | 'meadow', persist = true) {
  const show = (name: string, on: boolean) => scene.children.forEach((o) => { if (o.name === name) o.visible = on; });
  const space = kind === 'space';
  show('starfield', space);
  show('nebula', space);
  show('far_world', space);
  if (!groundPlane) {
    groundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ color: 0x6f8f4a, roughness: 0.95 })
    );
    groundPlane.name = 'backdrop_ground';
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.05;
    scene.add(groundPlane);
    const S = 1024, cvs = document.createElement('canvas');
    cvs.width = cvs.height = S;
    const cx2 = cvs.getContext('2d')!;
    cx2.strokeStyle = '#ffffff';
    cx2.lineWidth = 2;
    const cell = S / 32;
    for (let i = 0; i <= 32; i++) {
      const v = i * cell;
      cx2.globalAlpha = i % 4 === 0 ? 0.85 : 0.4;
      cx2.beginPath(); cx2.moveTo(v, 0); cx2.lineTo(v, S); cx2.stroke();
      cx2.beginPath(); cx2.moveTo(0, v); cx2.lineTo(S, v); cx2.stroke();
    }
    cx2.globalAlpha = 1;
    cx2.globalCompositeOperation = 'destination-in';
    const grad = cx2.createRadialGradient(S / 2, S / 2, S * 0.04, S / 2, S / 2, S * 0.48);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx2.fillStyle = grad;
    cx2.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    gridHelper = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 64),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false })
    );
    gridHelper.name = 'backdrop_grid';
    gridHelper.rotation.x = -Math.PI / 2;
    gridHelper.position.y = -0.03;
    scene.add(gridHelper);
  }
  groundPlane.visible = kind === 'meadow';
  gridHelper.visible = kind === 'blueprint';
  document.body.dataset.backdrop = kind;
  if (persist) { try { localStorage.setItem('lair-backdrop', kind); } catch {} }
  return kind;
}
