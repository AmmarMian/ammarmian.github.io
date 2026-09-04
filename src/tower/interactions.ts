import * as THREE from 'three';
import { FLOOR_IDS, FLOOR_NAMES } from './scene-constants';

export interface IXEntry {
  root: THREE.Object3D;
  label: string;
  fn: (e: IXEntry) => void;
  tick?: (e: IXEntry, t: number, dt: number) => void;
  t: number;
  on: boolean;
  marker?: THREE.Group;
}

const markerMat = new THREE.MeshBasicMaterial({
  color: 0xffe0a8, transparent: true, opacity: 0.22,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});

export function createInteractionSystem(model: THREE.Group, floors: { g: THREE.Group }[]) {
  const IX: IXEntry[] = [];
  const markerList: THREE.Group[] = [];

  function floorOf(o: THREE.Object3D | null) {
    let p = o;
    while (p && !FLOOR_IDS.includes(p.name)) p = p.parent;
    return p ? FLOOR_IDS.indexOf(p.name) : -1;
  }

  function interact(root: THREE.Object3D, label: string, fn: (e: IXEntry) => void, tick?: IXEntry['tick']) {
    const entry: IXEntry = { root, label, fn, tick, t: 0, on: false };
    root.traverse((o) => { (o.userData as any).ix = entry; });
    IX.push(entry);
    const fi = floorOf(root);
    if (fi >= 0) {
      model.updateMatrixWorld(true);
      const fg2 = floors[fi].g;
      const b = new THREE.Box3().setFromObject(root);
      const top = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 0.34, (b.min.z + b.max.z) / 2);
      fg2.worldToLocal(top);
      const m = new THREE.Group();
      m.name = 'ix_marker';
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 5), markerMat.clone());
      dot.name = 'ix_dot'; m.add(dot);
      m.position.copy(top);
      (m.userData as any) = { floor: fi, base: top.y };
      fg2.add(m);
      markerList.push(m);
      entry.marker = m;
    }
    return entry;
  }

  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered: IXEntry | null = null;

  function pickIX(camera: THREE.Camera, cv: HTMLElement, clientX: number, clientY: number) {
    const r = cv.getBoundingClientRect();
    ptr.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObject(model, true);
    for (const h of hits) if ((h.object.userData as any).ix) return (h.object.userData as any).ix as IXEntry;
    return null;
  }

  function pickFloor(camera: THREE.Camera, cv: HTMLElement, clientX: number, clientY: number) {
    const r = cv.getBoundingClientRect();
    ptr.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObject(model, true);
    for (const h of hits) {
      const fi = floorOf(h.object);
      if (fi >= 0) return fi;
    }
    return -1;
  }

  let hoveredFloor = -1;

  function wirePointer(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    onNavigateFloor: (i: number) => void,
    onHoverFloor?: (i: number) => void,
  ) {
    const cv = renderer.domElement;
    cv.addEventListener('pointermove', (ev) => {
      const e = pickIX(camera, cv, ev.clientX, ev.clientY);
      hovered = e;
      const fi = e ? -1 : pickFloor(camera, cv, ev.clientX, ev.clientY);
      cv.style.cursor = e ? 'pointer' : fi >= 0 ? 'pointer' : '';
      if (fi !== hoveredFloor) { hoveredFloor = fi; onHoverFloor?.(fi); }
      const label = e ? e.label : fi >= 0 ? FLOOR_NAMES[fi] : null;
      window.dispatchEvent(new CustomEvent('lair-hover', { detail: label }));
    });
    cv.addEventListener('pointerleave', () => {
      if (hoveredFloor !== -1) { hoveredFloor = -1; onHoverFloor?.(-1); }
    });
    // Distinguish a genuine click from the start of an orbit-drag: only
    // act on pointerup, and only if the pointer barely moved. Acting on
    // pointerdown instead would fire navigation the instant a drag begins,
    // which is what made drag-to-rotate feel broken.
    let downX = 0, downY = 0, dragging = false;
    cv.addEventListener('pointerdown', (ev) => {
      downX = ev.clientX; downY = ev.clientY; dragging = false;
    });
    cv.addEventListener('pointermove', (ev) => {
      if (ev.buttons && (Math.abs(ev.clientX - downX) > 10 || Math.abs(ev.clientY - downY) > 10)) dragging = true;
    });
    cv.addEventListener('pointerup', (ev) => {
      if (dragging) return;
      const e = pickIX(camera, cv, ev.clientX, ev.clientY);
      if (e) {
        e.fn(e);
        window.dispatchEvent(new CustomEvent('lair-act', { detail: e.label }));
        return;
      }
      const fi = pickFloor(camera, cv, ev.clientX, ev.clientY);
      if (fi >= 0) onNavigateFloor(fi);
    });
  }

  function tick(t: number, dt: number) {
    for (const e of IX) {
      if (e.t > 0) e.t = Math.max(0, e.t - dt);
      if (e.tick) e.tick(e, t, dt);
    }
    for (const m of markerList) {
      if (!m.visible) continue;
      const near = hovered && hovered.marker === m;
      const ud = m.userData as any;
      m.position.y = ud.base + Math.sin(t * 1.6 + ud.base) * 0.03;
      const want = near ? 2.4 : 1;
      m.scale.setScalar(m.scale.x + (want - m.scale.x) * Math.min(dt * 8, 1));
      const dot = m.children[0] as THREE.Mesh;
      const mat = dot.material as THREE.MeshBasicMaterial;
      const wantOp = near ? 0.9 : 0.18 + Math.sin(t * 1.8 + ud.base) * 0.05;
      mat.opacity += (wantOp - mat.opacity) * Math.min(dt * 8, 1);
    }
  }

  return { interact, IX, markerList, wirePointer, tick, floorOf };
}
