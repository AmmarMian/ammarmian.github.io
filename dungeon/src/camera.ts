/* Orthographic camera: fixed 30 degree pitch (2:1 pixel lines), any yaw.
 * Yaw 45 degrees looks from the +x/+z corner, the classic view. */

export type V3 = [number, number, number];
export const PITCH = Math.PI / 6;
export const CAM_BACK = 600; // must match scene.wgsl
export const BASE_ZOOM = 1.42; // art pixels per voxel: one voxel step ~ one pixel

export interface View {
  yaw: number; // radians
  zoom: number; // multiplier on BASE_ZOOM
  pan: [number, number]; // world units along screen right / up
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

export function focus(roomCenter: V3, b: Basis, pan: [number, number]): V3 {
  return [
    roomCenter[0] + b.R[0] * pan[0] + b.U[0] * pan[1],
    roomCenter[1] + b.R[1] * pan[0] + b.U[1] * pan[1],
    roomCenter[2] + b.R[2] * pan[0] + b.U[2] * pan[1],
  ];
}

/* The four views where the pixel lines are exactly 2:1. */
export const ISO_YAWS = [45, 135, 225, 315].map((d) => (d * Math.PI) / 180);
export function nearestIso(yaw: number) {
  const k = Math.round((yaw - Math.PI / 4) / (Math.PI / 2));
  return Math.PI / 4 + k * (Math.PI / 2);
}
