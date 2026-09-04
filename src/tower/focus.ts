import * as THREE from 'three';
import anime from 'animejs';
import { RAD, R, FH, WH, ROT } from './util';
import { F } from './scene-constants';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Below this width the callout becomes a bottom sheet, not a side panel —
// shifting the camera sideways would just push the tower off-frame for
// no reason, so the tower stays centred there instead.
const isNarrowViewport = () => window.matchMedia('(max-width: 900px)').matches;

// The default approach angle looks steeply down and the spiral stair
// hides most of the sanctum floor behind its own treads at that pitch —
// drop the camera a bit lower (flatter) there so the scene reads clearly.
const ELEVATION: Partial<Record<number, number>> = { [F.sanctum]: 0.3 };

const HOME_ROTATE_SPEED = 0.5;

export function createFocusController(opts: {
  camera: THREE.PerspectiveCamera;
  controls: any;
  model: THREE.Group;
  floors: { g: THREE.Group; fg: THREE.Group }[];
  dust: { m: THREE.Points };
  bubbles: { m: THREE.Points };
  markerList: THREE.Object3D[];
  onDustRange: (lo: number, hi: number) => void;
}) {
  const { camera, controls, model, floors, dust, bubbles, markerList, onDustRange } = opts;
  const NF = floors.length;
  const TOP = FH * (NF - 1) + 2.5;
  let panelSide: 'left' | 'right' | null = null;

  function flyTo(pos: THREE.Vector3, tgt: THREE.Vector3, dur = 2200): Promise<void> {
    controls.autoRotate = false;
    if (reducedMotion()) {
      controls.enabled = true;
      camera.position.copy(pos);
      controls.target.copy(tgt);
      controls.update();
      return Promise.resolve();
    }
    controls.enabled = false;
    anime.remove([camera.position, controls.target]);
    return new Promise((resolve) => {
      anime({
        targets: camera.position, x: pos.x, y: pos.y, z: pos.z,
        duration: dur, easing: 'easeInOutQuint',
        complete: () => { controls.enabled = true; resolve(); },
      });
      anime({
        targets: controls.target, x: tgt.x, y: tgt.y, z: tgt.z,
        duration: dur, easing: 'easeInOutQuint',
        update: () => controls.update(),
      });
    });
  }

  // Remembered so the framing can be re-derived when something other than
  // navigation changes it — the console opening, for one.
  let framedFloor: number | null = null;

  function focusFloor(k: number | null): Promise<void> {
    framedFloor = k;
    floors.forEach((f, i) => {
      const on = k === null || i <= k;
      f.g.visible = on; f.fg.visible = on;
    });
    markerList.forEach((m) => { m.visible = k !== null && (m.userData as any).floor === k; });
    dust.m.visible = true;
    bubbles.m.visible = k === null || k === 2;
    onDustRange(k === null ? 0 : k * FH, k === null ? TOP : k * FH + WH);

    const box = new THREE.Box3();
    if (k === null) box.setFromObject(model); else box.setFromObject(floors[k].g);
    if (k !== null) box.max.y = Math.min(box.max.y, k * FH + WH + 0.5);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sph.radius / Math.tan((camera.fov * Math.PI) / 360)) * (k === null ? 1.25 : 1.05);
    const elev = k === null ? 0.5 : (ELEVATION[k] ?? 0.5);
    const dir = k === null
      ? new THREE.Vector3(1, elev, 1.2).normalize()
      : new THREE.Vector3(Math.sin(RAD(355 + k * ROT)), elev, Math.cos(RAD(355 + k * ROT))).normalize();
    const target = sph.center.clone();
    if (panelSide && !isNarrowViewport()) {
      // Push the tower well clear of the panel's side, in *screen* space —
      // each floor is approached from a different azimuth, so a world-axis
      // shift would land in the wrong direction (or vanish) depending on
      // which way the camera happens to be facing that floor.
      const forward = dir.clone().multiplyScalar(-1);
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const shift = sph.radius * 0.85;
      target.addScaledVector(right, panelSide === 'right' ? shift : -shift);
    }
    return flyTo(target.clone().add(dir.clone().multiplyScalar(dist)), target).then(() => {
      // A gentle idle turn on the whole-tower view — grabbing the camera
      // (drag/pan/zoom) interrupts it immediately, so it never fights the
      // visitor's own free-look.
      controls.autoRotate = k === null;
      controls.autoRotateSpeed = HOME_ROTATE_SPEED;
    });
  }

  function setPanelOpen(open: boolean, side: 'left' | 'right' = 'right') {
    panelSide = open ? side : null;
  }

  /** Re-run the current framing without changing which floor is in view —
   *  for when the space available to the tower changes rather than the
   *  subject, as when the console opens beside it. */
  function reframe(dur = 900): Promise<void> {
    const k = framedFloor;
    const box = new THREE.Box3();
    if (k === null) box.setFromObject(model); else box.setFromObject(floors[k].g);
    if (k !== null) box.max.y = Math.min(box.max.y, k * FH + WH + 0.5);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const target = sph.center.clone();
    // Keep the visitor's own azimuth — they may have turned the tower since
    // it was framed, and yanking it back would feel like a reset.
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (panelSide && !isNarrowViewport()) {
      const forward = dir.clone().multiplyScalar(-1);
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      target.addScaledVector(right, sph.radius * 0.85 * (panelSide === 'right' ? 1 : -1));
    }
    const dist = camera.position.distanceTo(controls.target);
    const wasRotating = controls.autoRotate;
    return flyTo(target.clone().addScaledVector(dir, dist), target, dur).then(() => {
      controls.autoRotate = wasRotating;
    });
  }

  // Any deliberate interaction is the visitor taking the wheel — stop the
  // idle rotation so free navigation never feels like it's fighting back.
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  return { flyTo, focusFloor, setPanelOpen, reframe };
}
