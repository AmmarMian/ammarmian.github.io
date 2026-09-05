import * as THREE from 'three';
import { addBox, polar, RAD, R, FH, ROT, STAIR_A, STAIR_N } from './util';

export function buildWizardMesh() {
  const w = new THREE.Group();
  w.name = 'wizard';
  addBox('boot_l', 'wood_ebony', 0.17, 0.13, 0.28, -0.13, 0.065, 0.04, 0, w);
  addBox('boot_r', 'wood_ebony', 0.17, 0.13, 0.28, 0.13, 0.065, 0.04, 0, w);
  addBox('robe_hem', 'robe_deep', 0.8, 0.2, 0.7, 0, 0.2, 0, 0, w);
  addBox('robe_lower', 'cloth_purple', 0.68, 0.3, 0.6, 0, 0.44, 0, 0, w);
  addBox('robe_waist', 'cloth_purple', 0.56, 0.24, 0.5, 0, 0.71, 0, 0, w);
  addBox('robe_belt', 'brass', 0.58, 0.1, 0.52, 0, 0.86, 0, 0, w);
  addBox('robe_buckle', 'brass', 0.14, 0.14, 0.1, 0, 0.86, 0.28, 0, w);
  addBox('robe_chest', 'cloth_purple', 0.54, 0.3, 0.46, 0, 1.06, 0, 0, w);
  addBox('cloak', 'robe_deep', 0.66, 1.0, 0.14, 0, 0.78, -0.28, 0, w);
  addBox('cloak_hem', 'robe_deep', 0.7, 0.16, 0.2, 0, 0.3, -0.26, 0, w);
  addBox('shoulders', 'robe_deep', 0.64, 0.14, 0.48, 0, 1.24, 0, 0, w);
  addBox('collar', 'robe_deep', 0.42, 0.12, 0.36, 0, 1.34, 0.02, 0, w);
  addBox('amulet_cord', 'brass', 0.06, 0.18, 0.06, 0, 1.2, 0.24, 0, w);
  addBox('amulet', 'orb', 0.13, 0.13, 0.1, 0, 1.07, 0.26, 0, w);
  for (const [dx, dy] of [[-0.16, 0.52], [0.19, 0.62], [-0.06, 0.36]])
    addBox('robe_star', 'brass', 0.08, 0.08, 0.06, dx, dy, 0.31, 0, w);
  addBox('sleeve_l', 'cloth_purple', 0.18, 0.42, 0.22, -0.36, 1.02, 0.0, 0, w);
  addBox('sleeve_l_cuff', 'robe_deep', 0.2, 0.1, 0.24, -0.36, 0.79, 0.02, 0, w);
  const handL = addBox('hand_l', 'skin', 0.15, 0.14, 0.17, -0.36, 0.68, 0.06, 0, w);
  addBox('sleeve_r', 'cloth_purple', 0.18, 0.4, 0.22, 0.36, 1.04, 0.04, 0, w);
  addBox('sleeve_r_cuff', 'robe_deep', 0.2, 0.1, 0.24, 0.36, 0.86, 0.1, 0, w);
  addBox('hand_r', 'skin', 0.15, 0.14, 0.17, 0.37, 0.78, 0.14, 0, w);
  addBox('head', 'skin', 0.33, 0.3, 0.31, 0, 1.5, 0.0, 0, w);
  addBox('nose', 'skin', 0.09, 0.1, 0.11, 0, 1.47, 0.19, 0, w);
  addBox('brow', 'linen', 0.31, 0.06, 0.06, 0, 1.58, 0.15, 0, w);
  addBox('hair_back', 'linen', 0.34, 0.34, 0.14, 0, 1.44, -0.16, 0, w);
  addBox('moustache', 'linen', 0.255, 0.075, 0.125, 0, 1.402, 0.172, 0, w);
  addBox('beard_top', 'linen', 0.315, 0.2, 0.235, 0, 1.283, 0.121, 0, w);
  addBox('beard_mid', 'linen', 0.262, 0.245, 0.191, 0, 1.073, 0.143, 0, w);
  addBox('beard_low', 'linen', 0.194, 0.211, 0.157, 0, 0.872, 0.158, 0, w);
  addBox('beard_tip', 'linen', 0.117, 0.153, 0.124, 0, 0.703, 0.169, 0, w);
  addBox('hat_brim', 'robe_deep', 0.66, 0.1, 0.62, 0, 1.69, 0, 0, w);
  addBox('hat_band', 'brass', 0.48, 0.07, 0.45, 0, 1.77, 0, 0, w);
  addBox('hat_1', 'cloth_purple', 0.46, 0.24, 0.42, 0, 1.9, -0.01, 0, w);
  addBox('hat_2', 'cloth_purple', 0.34, 0.22, 0.31, 0.03, 2.1, -0.03, 0, w);
  addBox('hat_3', 'robe_deep', 0.23, 0.2, 0.21, 0.08, 2.28, -0.06, 0, w);
  addBox('hat_tip', 'robe_deep', 0.13, 0.17, 0.13, 0.14, 2.43, -0.09, 0, w);
  addBox('hat_star', 'brass', 0.09, 0.09, 0.06, -0.05, 1.92, 0.22, 0, w);
  addBox('staff', 'wood_mid', 0.09, 2.3, 0.09, 0.46, 1.15, 0.14, 0, w);
  addBox('staff_grip', 'wood_ebony', 0.11, 0.22, 0.11, 0.46, 0.8, 0.14, 0, w);
  addBox('staff_knot', 'wood_dark', 0.14, 0.14, 0.14, 0.46, 1.55, 0.14, 0, w);
  addBox('staff_claw', 'brass', 0.19, 0.14, 0.19, 0.46, 2.24, 0.14, 0, w);
  const staffOrb = addBox('staff_orb', 'orb', 0.24, 0.24, 0.24, 0.46, 2.42, 0.14, 0, w);
  return { wizard: w, handL, staffOrb };
}

/* wizard/fox route: interior of each floor, out to the spiral, up, in again */
export function buildRoute(NF: number) {
  const route: THREE.Vector3[] = [];
  const stations: number[] = [];
  // one interior standing-spot per storey, in floor order
  const INTERIOR: [number, number][] = [[196, 2.2], [30, 2.3], [250, 2.1], [300, 2.4], [308, 2.4], [165, 1.7], [40, 2.3]];
  const pushP = (ang: number, rad: number, y: number) => route.push(polar(ang, rad, y));

  stations[0] = route.length;
  pushP(INTERIOR[0][0], INTERIOR[0][1], 0.02);
  for (let k = 0; k < NF - 1; k++) {
    const rot = k * ROT;
    pushP(STAIR_A[0] + rot, 3.5, k * FH + 0.06);
    for (let i = 0; i < STAIR_N; i++) {
      const a = STAIR_A[0] + rot + (i * (STAIR_A[1] - STAIR_A[0])) / (STAIR_N - 1);
      pushP(a, R + 0.28, k * FH + 0.42 + i * (FH / (STAIR_N - 1)));
    }
    pushP(STAIR_A[1] + rot, 3.6, (k + 1) * FH + 0.04);
    stations[k + 1] = route.length;
    pushP(INTERIOR[k + 1][0] + (k + 1) * ROT, INTERIOR[k + 1][1], (k + 1) * FH + 0.02);
    if (k < NF - 2) pushP(STAIR_A[1] + rot, 3.6, (k + 1) * FH + 0.04);
  }
  const routeCurve = new THREE.CatmullRomCurve3(route, false, 'catmullrom', 0.3);
  const segLen = route.map((p, i) => (i < route.length - 1 ? p.distanceTo(route[i + 1]) : 0.001));

  function advance(at: number, goal: number, speed: number, dt: number) {
    const d = goal - at;
    if (Math.abs(d) < 0.0005) return { at: goal, moving: false };
    const i = Math.max(0, Math.min(segLen.length - 1, Math.floor(at)));
    const slow = Math.min(1, 0.35 + Math.abs(d) * 0.8);
    let step = (speed * slow * dt) / Math.max(segLen[i], 0.08);
    step = Math.min(step, Math.abs(d));
    return { at: at + Math.sign(d) * step, moving: true };
  }
  function pathPoint(at: number, out: THREE.Vector3, tan?: THREE.Vector3) {
    const u = Math.max(0, Math.min(1, at / (route.length - 1)));
    routeCurve.getPoint(u, out);
    if (tan) routeCurve.getTangent(u, tan);
    return out;
  }

  return { route, stations, advance, pathPoint };
}

export interface Errand { to: number; hold?: number }

export function createWizardController(NF: number) {
  const { route, stations, advance, pathPoint } = buildRoute(NF);
  let wizAt = 0, wizTarget = 0, wizDir = 1;
  const queue: { to: number; hold: number; resolve: () => void }[] = [];
  let holdTimer = 0;
  let pumping = false;

  function pump() {
    if (pumping || queue.length === 0) return;
    pumping = true;
    wizTarget = queue[0].to;
  }

  function sendWizard(errand: Errand): Promise<void> {
    return new Promise((resolve) => {
      queue.push({ to: errand.to, hold: errand.hold ?? 900, resolve });
      pump();
    });
  }

  /** legacy one-storey-per-call API used by the ambient "send him up the stairs" button */
  function stepWizard() {
    if (wizTarget === NF - 1) wizDir = -1;
    if (wizTarget === 0) wizDir = 1;
    wizTarget = Math.max(0, Math.min(NF - 1, wizTarget + wizDir));
    return wizTarget;
  }

  function update(dt: number, arrived: (station: number) => void) {
    const goal = stations[wizTarget];
    const step = advance(wizAt, goal, 1.9, dt);
    wizAt = step.at;
    if (!step.moving && pumping && queue.length) {
      holdTimer += dt;
      if (holdTimer * 1000 >= queue[0].hold) {
        const job = queue.shift()!;
        holdTimer = 0;
        pumping = false;
        job.resolve();
        arrived(wizTarget);
        pump();
      }
    }
    return { moving: step.moving, at: wizAt };
  }

  /** Drop him at a station immediately — no walk, no queue. Used to start
   *  him already going about his business rather than setting off from
   *  the ground floor every time the page loads. */
  function placeAt(station: number) {
    wizTarget = station;
    wizAt = stations[station];
  }

  return {
    stations, route, pathPoint, advance,
    sendWizard, stepWizard, placeAt, update,
    get wizAt() { return wizAt; },
    get wizTarget() { return wizTarget; },
  };
}
