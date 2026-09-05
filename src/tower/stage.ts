import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { M } from './materials';
import type { Profile } from './quality';

export function createStage(container: HTMLElement, quality: Profile) {
  /* powerPreference is the only say a page gets in *which* GPU draws it. On a
     laptop with two adapters the browser otherwise picks the integrated one to
     save battery, and this scene is well past what that can hold. Asking for
     the fast one is a hint, not a guarantee — gpuInfo() reports what actually
     answered, and `gpu` in the console prints it.

     antialias is fixed at context creation and cannot be changed afterwards,
     so it follows the *opening* tier only. Dropping to low later coarsens the
     pixels instead, which is the bigger saving anyway. */
  const renderer = new THREE.WebGLRenderer({
    antialias: quality.antialias, alpha: true, powerPreference: 'high-performance',
  });
  let maxRatio = quality.maxPixelRatio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  container.appendChild(renderer.domElement);
  // touch-action:none hands pinch/drag entirely to OrbitControls instead of
  // letting the browser also try to scroll or zoom the page underneath it.
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';

  const scene = new THREE.Scene();
  /* The far plane has to clear the whole sky, not just the tower. Every world
     hangs its dome at radius 460 and the orbit can sit 48 out from the centre,
     so the far side of the sky reaches ~508 — and the moon's gas giant, at 359
     out with a radius of 104, reaches ~511. At the old far = 500 those parts
     were clipped away, and because the canvas is alpha:true the clipped region
     showed the page behind it: a hard-edged hole in the sky, white or black
     depending on the backdrop, moving with the camera and flickering along its
     boundary. Near goes up with it, so depth precision stays where it was —
     nothing ever gets within 5.5 of the camera (see minDistance below). */
  const camera = new THREE.PerspectiveCamera(45, 1, 0.15, 1600);
  camera.position.set(10, 8, 14);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5.5;
  controls.maxDistance = 48;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.62;
  controls.autoRotate = false;

  const hemi = new THREE.HemisphereLight(0x9fb0ff, 0x2a2038, 0.34);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(4, 7, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ea8ff, 0.5);
  fill.position.set(-6, 4, -5);
  scene.add(fill);

  function fit() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(container);

  let pixelOn = true, pixelScale = 4;
  let flatApplied: boolean | null = null;
  function applyPixel() {
    const ratio = pixelOn ? 1 / pixelScale : Math.min(window.devicePixelRatio || 1, maxRatio);
    renderer.setPixelRatio(ratio);
    fit();
    renderer.domElement.style.imageRendering = pixelOn ? 'pixelated' : 'auto';
    /* Only when it actually changed. flatShading is a shader define, so
       needsUpdate recompiles every material in the tower — and applyPixel runs
       on every window resize, where the pixel mode has not moved at all. */
    if (flatApplied !== pixelOn) {
      flatApplied = pixelOn;
      for (const k in M) { (M[k] as any).flatShading = pixelOn; M[k].needsUpdate = true; }
    }
  }
  function setPixel(scale: number) {
    if (scale === 0) pixelOn = false; else { pixelOn = true; pixelScale = scale; }
    applyPixel();
    return { pixelOn, pixelScale };
  }
  window.addEventListener('resize', () => setTimeout(applyPixel, 60));

  /** The quality tier moved: re-cap the device pixel ratio. Only bites when
   *  the pixel-art downscale is off, which is where a 3x phone screen would
   *  otherwise be rendering nine times the pixels of a 1x one. */
  function setMaxPixelRatio(r: number) {
    if (maxRatio === r) return;
    maxRatio = r;
    applyPixel();
  }

  return { renderer, scene, camera, controls, fit, setPixel, applyPixel, setMaxPixelRatio, hemi, key, fill };
}
