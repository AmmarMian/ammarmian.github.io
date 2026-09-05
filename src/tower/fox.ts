import * as THREE from 'three';
import { addBox } from './util';

export function buildFoxMesh() {
  const f = new THREE.Group();
  f.name = 'fox';
  addBox('fox_body', 'fox_fur', 0.34, 0.28, 0.66, 0, 0.34, 0, 0, f);
  addBox('fox_chest', 'fox_cream', 0.3, 0.2, 0.2, 0, 0.29, 0.3, 0, f);
  addBox('fox_neck', 'fox_fur', 0.24, 0.22, 0.16, 0, 0.42, 0.34, 0, f);
  addBox('fox_head', 'fox_fur', 0.28, 0.24, 0.28, 0, 0.56, 0.44, 0, f);
  addBox('fox_snout', 'fox_cream', 0.16, 0.13, 0.18, 0, 0.51, 0.62, 0, f);
  addBox('fox_nose', 'fox_ink', 0.07, 0.06, 0.06, 0, 0.53, 0.72, 0, f);
  addBox('fox_ear_l', 'fox_fur_dark', 0.09, 0.15, 0.06, -0.09, 0.72, 0.4, 0, f);
  addBox('fox_ear_r', 'fox_fur_dark', 0.09, 0.15, 0.06, 0.09, 0.72, 0.4, 0, f);
  addBox('fox_eye_l', 'fox_ink', 0.05, 0.05, 0.04, -0.08, 0.6, 0.58, 0, f);
  addBox('fox_eye_r', 'fox_ink', 0.05, 0.05, 0.04, 0.08, 0.6, 0.58, 0, f);
  const legs: THREE.Mesh[] = [];
  for (const [dx, dz] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
    legs.push(addBox('fox_leg', 'fox_fur_dark', 0.09, 0.24, 0.1, dx, 0.12, dz, 0, f));
    addBox('fox_paw', 'fox_ink', 0.1, 0.06, 0.11, dx, 0.03, dz, 0, f);
  }
  const tail = new THREE.Group(); tail.name = 'fox_tail_rig';
  tail.position.set(0, 0.4, -0.3);
  addBox('fox_tail_a', 'fox_fur', 0.2, 0.2, 0.26, 0, 0, -0.13, 0, tail);
  addBox('fox_tail_b', 'fox_fur', 0.17, 0.17, 0.22, 0, 0.03, -0.34, 0, tail);
  addBox('fox_tail_tip', 'fox_cream', 0.14, 0.14, 0.16, 0, 0.07, -0.51, 0, tail);
  f.add(tail);
  (f as any).userData = { legs, tail };
  return f;
}

const FOX_MODES = ['sleep', 'play', 'read', 'sniff'] as const;
export type FoxMode = typeof FOX_MODES[number] | 'travel';

export function createFoxState(startStation: number) {
  return { at: startStation, target: 0, mode: 'read' as FoxMode, timer: 5 };
}

/** `homeTo` is the storey the fox should stay near — the wizard's, after
 *  dark. Pass -1 and it roams as before. */
export function foxDecide(state: ReturnType<typeof createFoxState>, NF: number, homeTo = -1) {
  if (homeTo >= 0) {
    // night: settle wherever he is, and only move if he has moved
    if (state.target !== homeTo) {
      state.target = homeTo;
      state.mode = 'travel';
      state.timer = 30;
    } else {
      state.mode = 'sleep';
      state.timer = 20 + Math.random() * 25;
    }
    return;
  }
  if (Math.random() < 0.55) {
    state.target = Math.floor(Math.random() * NF);
    state.mode = 'travel';
    state.timer = 30;
  } else {
    state.mode = FOX_MODES[Math.floor(Math.random() * FOX_MODES.length)];
    state.timer = 6 + Math.random() * 9;
  }
}
