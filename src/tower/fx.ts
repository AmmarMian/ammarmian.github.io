import * as THREE from 'three';

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
export function setBackdrop(scene: THREE.Scene, kind: 'void' | 'blueprint' | 'meadow', persist = true) {
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
