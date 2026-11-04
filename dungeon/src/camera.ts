/* Orthographic camera: fixed 30 degree pitch (2:1 pixel lines), any yaw.
 * Yaw 45 degrees looks from the +x/+z corner, the classic view. */
import type { FloorData, RoomMeta } from './gen/types.ts';

export type V3 = [number, number, number];
export const PITCH = Math.PI / 6;
export const CAM_BACK = 900; // must match scene.wgsl
export const BASE_ZOOM = 1.42; // art pixels per voxel: one voxel step ~ one pixel

export interface View {
  yaw: number; // radians
  zoom: number; // multiplier on BASE_ZOOM
  target: V3; // world point at the centre of the screen
}

export interface Basis { R: V3; U: V3; D: V3; cut: [number, number, number, number] }

export function basis(yaw: number): Basis {
  const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const D: V3 = [-cp * Math.cos(yaw), -sp, -cp * Math.sin(yaw)];
  const R: V3 = [Math.sin(yaw), 0, -Math.cos(yaw)];
  const U: V3 = [R[1] * D[2] - R[2] * D[1], R[2] * D[0] - R[0] * D[2], R[0] * D[1] - R[1] * D[0]];
  // a wall is cut when its outward side faces the camera
  const near = (nx: number, nz: number) => (nx * -D[0] + nz * -D[2] > 0.12 ? 1 : 0);
  return { R, U, D, cut: [near(-1, 0), near(1, 0), near(0, -1), near(0, 1)] };
}

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* The four views where the pixel lines are exactly 2:1. */
export function nearestIso(yaw: number) {
  const k = Math.round((yaw - Math.PI / 4) / (Math.PI / 2));
  return Math.PI / 4 + k * (Math.PI / 2);
}

export const roomCenter = (rm: RoomMeta): V3 => [rm.x + rm.w / 2, 24, rm.z + rm.d / 2];
export const floorCenter = (f: FloorData): V3 => [(f.bounds[0] + f.bounds[2]) / 2, 20, (f.bounds[1] + f.bounds[3]) / 2];

/* Zoom at which a box of w x d (plus wall height) fills `fill` of the screen.
   The footprint of a box under any yaw is bounded by its 45 degree one. */
export function fitZoom(w: number, d: number, res: [number, number], fill = 0.9) {
  const across = (w + d) * Math.SQRT1_2;
  const tall = across * 0.5 + 74 * 0.866;
  return Math.min((res[0] * fill) / (across * BASE_ZOOM), (res[1] * fill) / (tall * BASE_ZOOM));
}

/* Ray through an art pixel, as the shader builds it. */
export function pixelRay(view: View, res: [number, number], px: number, py: number) {
  const b = basis(view.yaw);
  const z = BASE_ZOOM * view.zoom;
  const sx = (px - res[0] / 2) / z, sy = (py - res[1] / 2) / z;
  const ro: V3 = [0, 1, 2].map((i) => view.target[i] + b.R[i] * sx - b.U[i] * sy - b.D[i] * CAM_BACK) as V3;
  return { ro, rd: b.D };
}

/* The room whose floor is under a ray (corridors are not pickable). */
export function pickRoom(f: FloorData, ro: V3, rd: V3): number {
  let best = -1, bestT = Infinity;
  f.rooms.forEach((rm, i) => {
    if (rm.kind !== 'room') return;
    const lo: V3 = [rm.x, 0, rm.z], hi: V3 = [rm.x + rm.w, 14, rm.z + rm.d];
    let t0 = -Infinity, t1 = Infinity;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(rd[a]) < 1e-9) { if (ro[a] < lo[a] || ro[a] > hi[a]) return; continue; }
      let u = (lo[a] - ro[a]) / rd[a], v = (hi[a] - ro[a]) / rd[a];
      if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    }
    if (t1 > t0 && t0 < bestT) { bestT = t0; best = i; }
  });
  return best;
}
