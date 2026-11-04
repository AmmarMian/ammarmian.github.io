import * as THREE from 'three';
import anime from 'animejs';
import { RAD, R, FH, WH, ROT } from './util';
import { F, NF, floorY } from './scene-constants';
import { panelTaken, FIGURE_TOP_PX, FIGURE_BOTTOM_PX, NARROW_QUERY } from '../ui/layout';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Below this width the callout becomes a bottom sheet, not a side panel —
// shifting the camera sideways would just push the tower off-frame for
// no reason, so the tower stays centred there instead.
const isNarrowViewport = () => window.matchMedia(NARROW_QUERY).matches;

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
  const TOP = floorY(NF - 1) + 2.5;

  /* Per-storey correction to the default viewing angle. Every floor is looked
     at from the same bearing relative to its own rotation, which is right for
     the rooms that were laid out around that assumption and wrong for any that
     were not — the cellar's tub and window face a different quarter. */
  const VIEW_TURN: Record<number, number> = { [F.bath]: 90 };
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

  /* The part of the screen the subject should sit in, as fractions of the
     viewport (w, h) and the centre of that region in NDC (x, y). It used to
     be "the whole screen, then slide the tower sideways by most of its own
     radius", which put the room hard against the far edge with a dead gap
     between it and the text. Centring it in what the panel leaves free puts
     it next to the words that describe it. */
  function freeWindow(panel: boolean): { w: number; h: number; x: number; y: number } {
    const W = window.innerWidth;
    if (isNarrowViewport()) {
      // The bottom sheet takes roughly the lower half, the dot nav a strip
      // at the top: the room goes in what is between.
      if (!panel) return { w: 1, h: 1, x: 0, y: 0 };
      const top = 0.07, bottom = 0.5;
      return { w: 0.96, h: bottom - top, x: 0, y: 1 - (top + bottom) };
    }
    if (!panelSide) return { w: 1, h: 1, x: 0, y: 0 };
    const H = window.innerHeight;
    const consoleOpen = document.body.dataset.console === 'on';
    const p = Math.min(0.6, panelTaken(W, consoleOpen) / W);
    const centre = p; // NDC centre of the remaining [-1 + 2p, 1] strip
    // Clear of the nav rail above and the figure caption below.
    const t = FIGURE_TOP_PX / H, b = consoleOpen ? 0 : FIGURE_BOTTOM_PX / H;
    return { w: 1 - p, h: 1 - t - b, x: panelSide === 'right' ? -centre : centre, y: b - t };
  }

  /** Move the look-at point so the subject lands at the window's centre. */
  function offsetTarget(centre: THREE.Vector3, dir: THREE.Vector3, dist: number,
    win: { x: number; y: number }): THREE.Vector3 {
    if (!win.x && !win.y) return centre;
    const forward = dir.clone().multiplyScalar(-1);
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    const halfH = dist * Math.tan((camera.fov * Math.PI) / 360);
    const halfW = halfH * camera.aspect;
    return centre
      .addScaledVector(right, -win.x * halfW)
      .addScaledVector(up, -win.y * halfH);
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
    onDustRange(k === null ? floorY(0) : floorY(k), k === null ? TOP : floorY(k) + WH);

    const box = new THREE.Box3();
    if (k === null) box.setFromObject(model); else box.setFromObject(floors[k].g);
    if (k !== null) box.max.y = Math.min(box.max.y, floorY(k) + WH + 0.5);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const elev = k === null ? 0.5 : (ELEVATION[k] ?? 0.5);
    const dir = k === null
      ? new THREE.Vector3(1, elev, 1.2).normalize()
      : (() => {
        const a = 355 + k * ROT + (VIEW_TURN[k] ?? 0);
        return new THREE.Vector3(Math.sin(RAD(a)), elev, Math.cos(RAD(a))).normalize();
      })();
    const win = freeWindow(k !== null);
    const halfV = Math.tan((camera.fov * Math.PI) / 360);
    // Fit the subject to whichever side of the free window is tighter, not
    // always the height — on a phone the width is what runs out first.
    const fit = Math.min(win.h * halfV, win.w * halfV * camera.aspect);
    const dist = (sph.radius / fit) * (k === null ? 1.25 : 1.05);
    const target = offsetTarget(sph.center.clone(), dir, dist, win);
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
    if (k !== null) box.max.y = Math.min(box.max.y, floorY(k) + WH + 0.5);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    // Keep the visitor's own azimuth — they may have turned the tower since
    // it was framed, and yanking it back would feel like a reset.
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = camera.position.distanceTo(controls.target);
    const target = offsetTarget(sph.center.clone(), dir, dist, freeWindow(k !== null));
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
