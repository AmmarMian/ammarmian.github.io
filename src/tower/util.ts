import * as THREE from 'three';
import { M, shaftMat } from './materials';

export const R = 5.4;    // platform radius
export const FH = 6.2;   // floor-to-floor height
export const WH = 5.3;   // wall height
export const ROT = 102;  // rotation between floors
export const WALL_A = [100, 250];
export const STAIR_A = [250, 352];
export const STAIR_N = 22;

let seed = 20260902;
export const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
export const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length) % a.length];
export const RAD = (a: number) => (a * Math.PI) / 180;

export function addBox(name: string, m: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M[m]);
  mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.y = ry;
  parent.add(mesh); return mesh;
}
export function addCyl(name: string, m: string, rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, parent: THREE.Object3D) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M[m]);
  mesh.name = name; mesh.position.set(x, y, z);
  parent.add(mesh); return mesh;
}
export function arcBox(name: string, m: string, w: number, h: number, d: number, ang: number, rad: number, y: number, parent: THREE.Object3D, extraRy = 0) {
  const a = RAD(ang);
  return addBox(name, m, w, h, d, rad * Math.sin(a), y, rad * Math.cos(a), a + extraRy, parent);
}
export const polar = (ang: number, rad: number, y = 0) => new THREE.Vector3(rad * Math.sin(RAD(ang)), y, rad * Math.cos(RAD(ang)));

export function lightShaft(from: THREE.Vector3, to: THREE.Vector3, r1: number, r2: number, parent: THREE.Object3D) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r2, len, 10, 1, true);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, shaftMat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  parent.add(m);
  return m;
}

/* ---------- shared shell pieces ---------- */
export function slab(g: THREE.Object3D, plankA: string, plankB: string, bodyMat: string, footMat: string) {
  for (let z = -R; z <= R; z += 0.45) {
    const half = Math.sqrt(Math.max(R * R - z * z, 0));
    if (half < 0.3) continue;
    addBox('floor_plank', rnd() < 0.55 ? plankA : plankB, half * 2, 0.2, 0.41, 0, -0.1, z, 0, g);
    addBox('floor_seam', 'wood_ebony', half * 2, 0.2, 0.04, 0, -0.105, z + 0.215, 0, g);
  }
  addCyl('platform_body', bodyMat, R - 0.02, R - 0.3, 0.72, 30, 0, -0.56, 0, g);
  addCyl('platform_footing', footMat, R - 0.34, R - 0.8, 0.42, 26, 0, -1.1, 0, g);
}

export function wall(g: THREE.Object3D, panels: string[], upper: string[], trim: string, aFrom = WALL_A[0], aTo = 236) {
  for (let a = aFrom; a <= aTo; a += 4.4) {
    arcBox('wall_panel', pick(panels), 0.35, WH, 0.3, a, R - 0.18, WH / 2, g);
    arcBox('wall_panel_cap', pick(upper), 0.35, 0.8, 0.34, a, R - 0.2, WH - 0.4, g);
    arcBox('wall_trim', trim, 0.35, 0.2, 0.38, a, R - 0.2, 0.12, g);
  }
}

export function railing(g: THREE.Object3D, post: string, rail: string, aFrom: number, aTo: number) {
  for (let a = aFrom; a <= aTo; a += 6.2) {
    arcBox('rail_post', post, 0.14, 0.9, 0.14, a, R - 0.26, 0.44, g);
    arcBox('rail_top', rail, 0.62, 0.14, 0.22, a, R - 0.26, 0.94, g);
    arcBox('rail_mid', 'wood_ebony', 0.62, 0.08, 0.12, a, R - 0.26, 0.48, g);
  }
  for (const a of [aFrom - 2, aTo + 2]) arcBox('rail_newel', 'wood_deep', 0.26, 1.3, 0.26, a, R - 0.26, 0.65, g);
}

export function landing(g: THREE.Object3D, jamb: string, deck: string) {
  const A = 250;
  arcBox('landing_deck', deck, 2.0, 0.18, 1.5, A, R - 0.35, 0.09, g);
  arcBox('landing_threshold', 'stone_light', 2.0, 0.1, 0.3, A, R + 0.34, 0.13, g);
  for (const off of [-13, 13]) {
    arcBox('door_jamb', jamb, 0.34, 3.1, 0.6, A + off, R - 0.3, 1.55, g);
    arcBox('door_jamb_plinth', 'stone_light', 0.42, 0.24, 0.68, A + off, R - 0.3, 0.24, g);
    arcBox('door_jamb_cap', 'stone_light', 0.42, 0.2, 0.68, A + off, R - 0.3, 3.2, g);
  }
  for (let o = -12; o <= 12; o += 3) {
    const h = 0.5 - Math.abs(o) * 0.012;
    arcBox('door_arch', 'stone_light', 0.5, h, 0.6, A + o, R - 0.3, 3.42 + (0.5 - h) / 2, g);
  }
  arcBox('door_keystone', 'stone_warm', 0.4, 0.44, 0.66, A, R - 0.3, 3.86, g);
  for (const off of [-15, 15]) {
    arcBox('door_lantern_bracket', 'iron', 0.12, 0.1, 0.3, A + off, R - 0.55, 2.5, g);
    arcBox('door_lantern', 'glow_pane', 0.18, 0.26, 0.18, A + off, R - 0.72, 2.42, g);
    arcBox('door_lantern_cap', 'iron', 0.22, 0.07, 0.22, A + off, R - 0.72, 2.58, g);
  }
}

export function spiralStair(g: THREE.Object3D, treadA: string, treadB: string) {
  for (let i = 0; i < STAIR_N; i++) {
    const a = STAIR_A[0] + (i * (STAIR_A[1] - STAIR_A[0])) / (STAIR_N - 1);
    const y = 0.3 + i * (FH / (STAIR_N - 1));
    arcBox('stair_tread', i % 2 ? treadA : treadB, 0.78, 0.17, 0.92, a, R + 0.3, y, g);
    arcBox('stair_riser', 'wood_deep', 0.78, 0.32, 0.8, a, R + 0.3, y - 0.22, g);
    arcBox('stair_skirt', 'wood_ebony', 0.78, 0.66, 0.6, a, R + 0.3, y - 0.5, g);
    arcBox('stair_baluster', 'wood_dark', 0.13, 0.9, 0.13, a, R + 0.68, y + 0.6, g);
    arcBox('stair_handrail', 'wood_mid', 0.8, 0.14, 0.2, a, R + 0.68, y + 1.1, g);
  }
}

export function roundWindow(g: THREE.Object3D, ang: number, y: number, r = 0.74) {
  const grp = new THREE.Group();
  grp.name = 'window';
  grp.position.copy(polar(ang, R - 0.4, y));
  grp.rotation.y = RAD(ang);
  const frame = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 16), M.stone_light);
  frame.name = 'window_frame'; frame.rotation.x = Math.PI / 2; grp.add(frame);
  const pane = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.13, r - 0.13, 0.2, 16), M.glow_pane);
  pane.name = 'window_pane'; pane.rotation.x = Math.PI / 2; grp.add(pane);
  const span = (r - 0.1) * 2;
  addBox('window_mullion_v', 'wood_ebony', 0.12, span, 0.34, 0, 0, 0, 0, grp);
  addBox('window_mullion_h', 'wood_ebony', span, 0.12, 0.34, 0, 0, 0, 0, grp);
  addBox('window_sill', 'stone_light', span + 0.3, 0.16, 0.5, 0, -r - 0.05, 0.1, 0, grp);
  g.add(grp);
}

export function windowGlow(fg: THREE.Object3D, ang: number, y: number, spread: number) {
  const halo = new THREE.PointLight(0xffe3b0, 14, 5, 2);
  halo.position.copy(polar(ang, R - 1.0, y));
  fg.add(halo);
  const from = polar(ang, R - 0.5, y);
  const to = polar(ang - 18, 1.1, 0.06);
  lightShaft(from, to, spread, spread * 2.4, fg);
  const spot = new THREE.SpotLight(0xffdcaa, 120, 18, 0.6, 0.7, 2);
  spot.position.copy(from);
  spot.target.position.copy(to);
  fg.add(spot, spot.target);
}
