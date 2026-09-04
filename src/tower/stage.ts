import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { M } from './materials';

export function createStage(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  // touch-action:none hands pinch/drag entirely to OrbitControls instead of
  // letting the browser also try to scroll or zoom the page underneath it.
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
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
  function applyPixel() {
    const ratio = pixelOn ? 1 / pixelScale : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    fit();
    renderer.domElement.style.imageRendering = pixelOn ? 'pixelated' : 'auto';
    for (const k in M) { (M[k] as any).flatShading = pixelOn; M[k].needsUpdate = true; }
  }
  function setPixel(scale: number) {
    if (scale === 0) pixelOn = false; else { pixelOn = true; pixelScale = scale; }
    applyPixel();
    return { pixelOn, pixelScale };
  }
  window.addEventListener('resize', () => setTimeout(applyPixel, 60));

  return { renderer, scene, camera, controls, fit, setPixel, applyPixel, hemi, key, fill };
}
