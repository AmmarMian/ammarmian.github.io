import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, rnd, pick, slab } from '../util';
import { M } from '../materials';
import type { Anim } from '../anim';

/* ===== observatory: open sky, stone parapet, brass instruments ===== */
export function buildObservatory(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  slab(g, 'plank_ash', 'plank_ash_dark', 'stone_warm', 'stone');

  for (let a = 100; a <= 452; a += 4.4) {
    if (a > 336 && a < 366) continue;
    arcBox('parapet_block', pick(['stone', 'stone_warm', 'stone_light']), 0.36, 1.15, 0.36, a, 5.4 - 0.2, 0.6, g);
    arcBox('parapet_cap', 'stone_light', 0.4, 0.14, 0.44, a, 5.4 - 0.2, 1.24, g);
    if (Math.round(a) % 22 === 0) arcBox('parapet_merlon', 'stone', 0.34, 0.5, 0.38, a, 5.4 - 0.2, 1.55, g);
  }

  const t = new THREE.Group(); t.name = 'telescope';
  addBox('pier_base', 'stone', 1.15, 0.22, 1.15, 0, 0.11, 0, 0, t);
  addBox('pier_step', 'stone_light', 0.9, 0.16, 0.9, 0, 0.3, 0, 0, t);
  addBox('pier_column', 'stone_warm', 0.56, 1.0, 0.56, 0, 0.88, 0, 0, t);
  addBox('pier_cap', 'stone_light', 0.72, 0.14, 0.72, 0, 1.45, 0, 0, t);
  addCyl('mount_bearing', 'brass', 0.24, 0.26, 0.18, 12, 0, 1.6, 0, t);
  for (const dx of [-0.36, 0.36]) {
    addBox('fork_arm', 'iron', 0.14, 0.66, 0.2, dx, 1.98, 0, 0, t);
    addCyl('fork_pivot', 'brass', 0.11, 0.11, 0.16, 12, dx, 2.3, 0, t).rotation.z = Math.PI / 2;
  }
  addBox('fork_yoke', 'iron', 0.86, 0.16, 0.22, 0, 1.72, 0, 0, t);
  const tube = new THREE.Group(); tube.name = 'telescope_tube_assembly';
  addCyl('tube_body', 'brass', 0.25, 0.25, 2.1, 16, 0, 0.15, 0, tube);
  addCyl('tube_dew_shield', 'iron', 0.3, 0.29, 0.5, 16, 0, 1.42, 0, tube);
  addCyl('tube_ring_fore', 'iron', 0.28, 0.28, 0.12, 16, 0, 0.85, 0, tube);
  addCyl('tube_ring_aft', 'iron', 0.28, 0.28, 0.12, 16, 0, -0.5, 0, tube);
  addBox('focuser_block', 'iron', 0.26, 0.26, 0.3, 0, -0.85, 0.24, 0, tube);
  addCyl('eyepiece', 'brass', 0.09, 0.11, 0.34, 12, 0, -0.86, 0.5, tube).rotation.x = Math.PI / 2;
  addCyl('focus_knob', 'brass', 0.07, 0.07, 0.12, 10, 0.22, -0.85, 0.2, tube).rotation.z = Math.PI / 2;
  addCyl('finder_body', 'brass', 0.07, 0.07, 0.62, 10, 0.26, 0.5, 0.12, tube);
  addBox('finder_bracket', 'iron', 0.1, 0.1, 0.24, 0.26, 0.2, 0.1, 0, tube);
  addCyl('counterweight_rod', 'iron', 0.05, 0.05, 0.7, 8, 0, -1.35, 0, tube);
  addCyl('counterweight', 'iron', 0.19, 0.19, 0.24, 12, 0, -1.72, 0, tube);
  tube.position.set(0, 2.3, 0);
  tube.rotation.x = -0.62;
  t.add(tube);
  t.position.copy(polar(120, 2.0)); t.rotation.y = RAD(302);
  g.add(t);

  const orr = new THREE.Group(); orr.name = 'orrery';
  addCyl('orrery_stand', 'wood_dark', 0.16, 0.3, 0.9, 10, 0, 0.45, 0, orr);
  addBox('orrery_base', 'wood_deep', 0.7, 0.14, 0.7, 0, 0.07, 0, 0, orr);
  const ringMat = M.brass;
  [[0.62, 0.5], [0.9, -0.35], [1.15, 0.2]].forEach(([r, tilt], i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 40), ringMat);
    ring.name = 'orrery_ring_' + (i + 1);
    ring.position.y = 1.1; ring.rotation.x = Math.PI / 2 + tilt; ring.rotation.z = tilt * 0.4;
    orr.add(ring);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), i === 1 ? M.glass_blue : M.glass_amber);
    bead.name = 'orrery_planet_' + (i + 1);
    bead.position.set(Math.cos(i * 2) * r, 1.1 + Math.sin(tilt) * r * 0.4, Math.sin(i * 2) * r);
    orr.add(bead);
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), M.flame);
  sun.name = 'orrery_sun'; sun.position.y = 1.1; orr.add(sun);
  orr.position.copy(polar(210, 2.6));
  g.add(orr);
  anim.rings.push({ o: orr, spin: 0.12 });
  const ol = new THREE.PointLight(0xffc06a, 5, 4, 2); ol.position.copy(polar(210, 2.6, 1.5)); fg.add(ol);

  const ct = new THREE.Group(); ct.name = 'chart_table';
  addBox('chart_top', 'wood_dark', 1.8, 0.14, 1.1, 0, 0.86, 0, 0, ct);
  addBox('chart_apron', 'wood_deep', 1.7, 0.36, 0.95, 0, 0.62, 0, 0, ct);
  for (const dx of [-0.75, 0.75]) addBox('chart_leg', 'wood_ebony', 0.16, 0.8, 0.6, dx, 0.4, 0, 0, ct);
  addBox('star_chart', 'paper', 1.3, 0.05, 0.8, -0.05, 0.95, 0, 0.06, ct);
  for (let i = 0; i < 9; i++) addBox('chart_star', 'brass', 0.06, 0.055, 0.06, -0.5 + (i % 3) * 0.42, 0.99, -0.24 + Math.floor(i / 3) * 0.24, 0, ct);
  addBox('rolled_chart', 'paper', 0.9, 0.11, 0.11, 0.3, 1.0, 0.34, 0.1, ct);
  addBox('compass_dividers', 'brass', 0.4, 0.05, 0.06, 0.35, 0.96, -0.3, 0.5, ct);
  addBox('chart_lantern_base', 'iron', 0.2, 0.08, 0.2, 0.76, 0.96, 0.16, 0, ct);
  addBox('chart_lantern_glass', 'glow_pane', 0.18, 0.26, 0.18, 0.76, 1.12, 0.16, 0, ct);
  addBox('chart_lantern_cap', 'iron', 0.22, 0.08, 0.22, 0.76, 1.28, 0.16, 0, ct);
  ct.position.copy(polar(30, 3.1)); ct.rotation.y = RAD(30);
  g.add(ct);
  const ll = new THREE.PointLight(0xffd9a0, 6, 5, 2); ll.position.copy(polar(30, 3.1, 1.6)); fg.add(ll);

  const bp = polar(160, 4.0);
  addCyl('brazier_bowl', 'iron', 0.42, 0.26, 0.34, 12, bp.x, 0.9, bp.z, g);
  addCyl('brazier_stem', 'iron', 0.1, 0.16, 0.75, 10, bp.x, 0.37, bp.z, g);
  addBox('brazier_foot', 'iron', 0.5, 0.1, 0.5, bp.x, 0.05, bp.z, 0, g);
  addCyl('brazier_embers', 'flame', 0.34, 0.34, 0.1, 12, bp.x, 1.06, bp.z, g);
  const bl = new THREE.PointLight(0xff8a3c, 12, 7, 2); bl.position.set(bp.x, 1.4, bp.z); fg.add(bl);
  const cw = polar(268, 4.0);
  addBox('crate_charts', 'wood_dark', 0.8, 0.6, 0.8, cw.x, 0.3, cw.z, RAD(268), g);
  addBox('crate_charts_lid', 'wood_deep', 0.84, 0.1, 0.84, cw.x, 0.65, cw.z, RAD(268), g);
  for (let i = 0; i < 3; i++) addBox('chart_tube', 'paper', 0.12, 0.12, 0.8, cw.x + 0.1 * i - 0.1, 0.78, cw.z, RAD(268 + i * 8), g);
  for (let i = 0; i < 8; i++) {
    const p = polar(rnd() * 360, 1.0 + rnd() * 3.2);
    addBox('loose_page', 'paper', 0.32 + rnd() * 0.16, 0.035, 0.24 + rnd() * 0.12, p.x, 0.015, p.z, rnd() * Math.PI, g);
  }
  const moon = new THREE.DirectionalLight(0xbdd2ff, 2.3);
  moon.position.set(3, 14, -4); fg.add(moon);
  const moonFill = new THREE.DirectionalLight(0x8fa6e8, 0.9);
  moonFill.position.set(-5, 6, 5); fg.add(moonFill);
  const deckGlow = new THREE.PointLight(0xd8c9ff, 6, 9, 2);
  deckGlow.position.set(0, 2.6, 0); fg.add(deckGlow);

  /* --- extra detail --- */
  addBox('armillary_base', 'wood_deep', 0.6, 0.14, 0.6, polar(74, 3.5).x, 0.07, polar(74, 3.5).z, 0, g);
  const arm = new THREE.Group(); arm.name = 'armillary';
  arm.position.copy(polar(74, 3.5, 1.1));
  [[0.7, 0], [0.7, 1.2], [0.7, 2.4]].forEach(([r, tilt]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 30), M.brass);
    ring.rotation.x = tilt; ring.rotation.z = tilt * 0.5; arm.add(ring);
  });
  const armCore = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M.rune_glow);
  armCore.name = 'armillary_core'; arm.add(armCore);
  addCyl('armillary_post', 'wood_dark', 0.08, 0.11, 0.95, 10, polar(74, 3.5).x, 0.6, polar(74, 3.5).z, g);
  g.add(arm);
  anim.rings.push({ o: arm, spin: 0.2 });

  const sd = polar(340, 2.9);
  addCyl('sundial_plinth', 'stone_warm', 0.34, 0.42, 0.85, 12, sd.x, 0.42, sd.z, g);
  addCyl('sundial_face', 'stone_light', 0.5, 0.5, 0.1, 16, sd.x, 0.9, sd.z, g);
  const gnomon = addBox('sundial_gnomon', 'brass', 0.05, 0.42, 0.3, sd.x, 1.1, sd.z, 0, g);
  gnomon.rotation.x = 0.5;
  const bl2 = polar(258, 3.9);
  addBox('bell_frame_l', 'wood_dark', 0.14, 1.6, 0.14, bl2.x - 0.35, 0.8, bl2.z, 0, g);
  addBox('bell_frame_r', 'wood_dark', 0.14, 1.6, 0.14, bl2.x + 0.35, 0.8, bl2.z, 0, g);
  addBox('bell_beam', 'wood_deep', 0.95, 0.14, 0.16, bl2.x, 1.65, bl2.z, 0, g);
  const bell = addCyl('bell', 'brass', 0.16, 0.34, 0.5, 12, bl2.x, 1.3, bl2.z, g);
  const bellClapper = addBox('bell_clapper', 'iron', 0.08, 0.14, 0.08, bl2.x, 1.02, bl2.z, 0, g);

  for (let i = 0; i < 4; i++) {
    const p = polar(140 + i * 7, 4.0);
    addBox('lens_stand', 'wood_dark', 0.2, 0.5, 0.2, p.x, 0.25, p.z, 0, g);
    addCyl('lens', 'glow_pane', 0.18, 0.18, 0.05, 14, p.x, 0.55, p.z, g).rotation.x = Math.PI / 2;
  }
  const comet = new THREE.Group(); comet.name = 'comet_model';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), M.rune_glow);
  head.name = 'comet_head'; comet.add(head);
  for (let i = 0; i < 5; i++) addBox('comet_tail', 'rune_violet', 0.1 - i * 0.014, 0.1 - i * 0.014, 0.1 - i * 0.014, -0.22 - i * 0.16, 0, 0, 0, comet);
  g.add(comet);
  anim.books.push({ o: comet, r: 2.2, a0: 0, y: 3.2, sp: 0.5, c: new THREE.Vector3(0, 0, 0), face: true });
  const cl2 = new THREE.PointLight(0x9fd8ff, 5, 5, 2);
  cl2.position.set(0, 3.4, 0); fg.add(cl2);

  return { telescopeTube: tube, orr, arm, bell, bellClapper };
}
