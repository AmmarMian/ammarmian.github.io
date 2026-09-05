import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, rnd, pick, slab, wall, railing, roundWindow, windowGlow } from '../util';
import { M } from '../materials';
import type { Anim } from '../anim';

/** One specimen jar on the alchemy shelves, and whether a project has
 *  claimed it. */
export interface JarSlot {
  group: THREE.Group;
  body: THREE.Mesh;
  angle: number;
  y: number;
  taken: boolean;
}

export const CAULDRON_LOCAL = new THREE.Vector3(0.3, 0, -0.5);

/* ===== laboratory: stone, glass, cauldron light ===== */
export function buildLaboratory(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  slab(g, 'plank_ash', 'plank_ash_dark', 'stone_warm', 'stone');
  wall(g, ['stone', 'stone_warm', 'stone_light', 'stone'], ['stone_light', 'stone'], 'stone');
  railing(g, 'wood_deep', 'wood_dark', 356, 448);
  roundWindow(g, 178, 3.5, 0.88);
  windowGlow(fg, 178, 3.5, 0.72);

  /* The specimen shelves. Every jar here is a slot a real project can take —
     see bindProjects in scene.ts. The bottle is built as a group so a bound
     one can be lit, labelled and made to bubble as a single thing. */
  const slots: JarSlot[] = [];
  for (const [a0, a1] of [[112, 150], [206, 244]] as const) {
    for (const sy of [1.05, 1.78, 2.51, 3.24, 3.97]) {
      for (let a = a0; a <= a1; a += 4.4) arcBox('alchemy_board', 'wood_dark', 0.4, 0.12, 0.72, a, 5.4 - 0.56, sy, g);
      for (let a = a0 + 1; a <= a1 - 1; a += 3.2) {
        if (rnd() < 0.3) continue;
        const gl = pick(['glass_blue', 'glass_green', 'glass_violet', 'glass_amber']);
        const jar = new THREE.Group();
        jar.name = 'jar';
        const body = arcBox('bottle_body', gl, 0.2, 0.28, 0.2, a, 5.4 - 0.62, sy + 0.2, jar);
        arcBox('bottle_neck', gl, 0.09, 0.14, 0.09, a, 5.4 - 0.62, sy + 0.4, jar);
        if (rnd() < 0.4) arcBox('bottle_stopper', 'wood_deep', 0.12, 0.07, 0.12, a, 5.4 - 0.62, sy + 0.5, jar);
        g.add(jar);
        slots.push({ group: jar, body, angle: a, y: sy + 0.2, taken: false });
      }
    }
    for (const a of [a0 - 1, a1 + 1]) arcBox('alchemy_post', 'wood_ebony', 0.24, 4.4, 0.74, a, 5.4 - 0.56, 2.4, g);
    for (let a = a0 + 2; a <= a1 - 2; a += 5) {
      const n = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) arcBox('herb_bundle', i % 2 ? 'leaf' : 'leaf_dark', 0.1, 0.18, 0.1, a, 5.4 - 0.66, 4.42 - i * 0.18, g);
    }
  }

  const cc = CAULDRON_LOCAL;
  addCyl('cauldron_belly_low', 'cauldron', 0.62, 0.34, 0.4, 12, cc.x, 0.44, cc.z, g);
  const cauldronBelly = addCyl('cauldron_belly', 'cauldron', 0.64, 0.62, 0.44, 12, cc.x, 0.84, cc.z, g);
  addCyl('cauldron_rim', 'cauldron', 0.58, 0.64, 0.14, 12, cc.x, 1.1, cc.z, g);
  addCyl('cauldron_brew', 'brew', 0.5, 0.5, 0.08, 12, cc.x, 1.05, cc.z, g);
  for (const [dx, dz] of [[-0.34, 0.24], [0.34, 0.24], [0, -0.4]]) addBox('cauldron_foot', 'iron', 0.18, 0.28, 0.18, cc.x + dx, 0.14, cc.z + dz, 0, g);
  const rod = addBox('cauldron_stir_rod', 'wood_mid', 0.09, 1.7, 0.09, cc.x + 0.12, 1.42, cc.z + 0.06, 0, g);
  rod.rotation.z = 0.3; rod.rotation.x = -0.16;
  const brewLight = new THREE.PointLight(0x63e07f, 11, 6, 2);
  brewLight.position.set(cc.x, 1.5, cc.z); fg.add(brewLight);
  for (const [dx, dz] of [[-0.2, 0.1], [0.2, 0.1], [0, -0.22]]) addBox('coal', 'flame', 0.16, 0.1, 0.16, cc.x + dx, 0.06, cc.z + dz, 0, g);

  const wc = new THREE.Group(); wc.name = 'work_counter';
  addBox('counter_top', 'stone_light', 2.7, 0.18, 0.9, 0, 0.92, 0, 0, wc);
  addBox('counter_apron', 'wood_deep', 2.55, 0.55, 0.75, 0, 0.6, 0, 0, wc);
  for (const dx of [-1.15, 1.15]) addBox('counter_leg', 'wood_ebony', 0.2, 0.85, 0.62, dx, 0.42, 0, 0, wc);
  [-1.05, -0.62, -0.2, 0.28, 0.72, 1.1].forEach((dx, i) => {
    const gl = pick(['glass_blue', 'glass_green', 'glass_violet', 'glass_amber']);
    addBox('flask_body', gl, 0.23, 0.3, 0.23, dx, 1.16, -0.05 + (rnd() - 0.5) * 0.2, 0, wc);
    addBox('flask_neck', gl, 0.1, 0.17, 0.1, dx, 1.4, -0.05, 0, wc);
    if (i % 3 === 0) addBox('flask_stopper', 'wood_deep', 0.13, 0.07, 0.13, dx, 1.51, -0.05, 0, wc);
  });
  addBox('mortar', 'stone_light', 0.36, 0.28, 0.36, 0.05, 1.15, 0.3, 0, wc);
  addBox('pestle', 'stone_light', 0.1, 0.1, 0.36, 0.05, 1.34, 0.3, 0.6, wc);
  wc.position.copy(polar(158, 3.5)); wc.rotation.y = RAD(158);
  g.add(wc);

  const pp = polar(292, 4.1);
  addCyl('flower_pot', 'terracotta', 0.44, 0.3, 0.62, 12, pp.x, 0.31, pp.z, g);
  addBox('pot_lip', 'terracotta', 0.96, 0.14, 0.96, pp.x, 0.64, pp.z, 0, g);
  addBox('plant_stem', 'leaf_dark', 0.1, 1.4, 0.1, pp.x, 1.3, pp.z, 0, g);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, r = 0.3 + rnd() * 0.26;
    addBox('leaf_blade', i % 2 ? 'leaf' : 'leaf_dark', 0.34, 0.1, 0.28, pp.x + Math.sin(a) * r, 0.88 + i * 0.17, pp.z + Math.cos(a) * r, a, g);
  }
  addBox('bloom', 'cloth_red', 0.26, 0.26, 0.26, pp.x + 0.1, 2.05, pp.z - 0.05, 0, g);

  const cr = polar(330, 4.1);
  addBox('crate', 'wood_dark', 0.8, 0.65, 0.8, cr.x, 0.33, cr.z, RAD(330), g);
  addBox('crate_lid', 'wood_deep', 0.84, 0.1, 0.84, cr.x, 0.68, cr.z, RAD(330), g);
  addBox('crate_bottle', 'glass_violet', 0.2, 0.28, 0.2, cr.x + 0.1, 0.87, cr.z, 0, g);
  addBox('spilled_jar', 'glass_green', 0.26, 0.26, 0.26, 1.6, 0.13, 0.5, 0.4, g);
  addBox('discarded_robe', 'cloth_purple', 1.25, 0.14, 0.85, -1.35, 0.07, 0.5, 0.7, g);
  addBox('discarded_robe_fold', 'cloth_purple', 0.62, 0.13, 0.46, -1.6, 0.2, 0.66, 0.3, g);
  for (let i = 0; i < 14; i++) {
    const p = polar(rnd() * 360, 0.9 + rnd() * 3.5);
    addBox('loose_page', 'paper', 0.34 + rnd() * 0.16, 0.035, 0.26 + rnd() * 0.12, p.x, 0.015, p.z, rnd() * Math.PI, g);
  }

  /* --- extra detail --- */
  const still = new THREE.Group(); still.name = 'distillery';
  addBox('still_bench', 'stone_light', 1.5, 0.16, 0.7, 0, 0.9, 0, 0, still);
  addBox('still_bench_apron', 'wood_deep', 1.4, 0.5, 0.6, 0, 0.6, 0, 0, still);
  addCyl('still_boiler', 'brass', 0.3, 0.36, 0.5, 12, -0.45, 1.24, 0, still);
  addCyl('still_neck', 'brass', 0.1, 0.14, 0.5, 10, -0.45, 1.72, 0, still);
  addBox('still_arm', 'brass', 0.7, 0.09, 0.09, -0.12, 1.94, 0, 0, still);
  addCyl('still_coil', 'brass', 0.09, 0.09, 0.6, 10, 0.22, 1.62, 0, still);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 20), M.brass);
  coil.name = 'still_coil_loop'; coil.position.set(0.22, 1.4, 0); coil.rotation.x = Math.PI / 2; still.add(coil);
  addBox('still_receiver', 'glass_green', 0.26, 0.3, 0.26, 0.58, 1.13, 0, 0, still);
  addBox('still_drip', 'brew', 0.06, 0.14, 0.06, 0.58, 1.36, 0, 0, still);
  addBox('still_burner', 'flame', 0.3, 0.1, 0.3, -0.45, 1.02, 0, 0, still);
  still.position.copy(polar(268, 3.6)); still.rotation.y = RAD(268); g.add(still);
  const sl = new THREE.PointLight(0x63e07f, 5, 4, 2);
  sl.position.copy(polar(268, 3.4, 1.8)); fg.add(sl);

  for (let i = 0; i < 5; i++) {
    const p = polar(322 + i * 6, 4.1);
    addBox('specimen_jar', 'glass_blue', 0.26, 0.34, 0.26, p.x, 1.1, p.z, 0, g);
    addBox('specimen_lid', 'brass', 0.28, 0.08, 0.28, p.x, 1.31, p.z, 0, g);
    addBox('specimen', pick(['leaf', 'cloth_red_dark', 'brass', 'linen']), 0.13, 0.13, 0.13, p.x, 1.06, p.z, rnd(), g);
  }
  addBox('specimen_shelf', 'wood_dark', 2.4, 0.14, 0.6, polar(334, 4.1).x, 0.92, polar(334, 4.1).z, RAD(334), g);
  for (const dx of [-1.0, 1.0]) {
    const p = polar(334, 4.1);
    addBox('specimen_shelf_leg', 'wood_ebony', 0.14, 0.9, 0.5, p.x + dx * Math.cos(RAD(334)), 0.45, p.z - dx * Math.sin(RAD(334)), RAD(334), g);
  }

  addBox('scale_base', 'brass', 0.4, 0.1, 0.3, -2.4, 0.95, -1.9, 0.4, g);
  addCyl('scale_post', 'brass', 0.05, 0.05, 0.7, 8, -2.4, 1.35, -1.9, g);
  addBox('scale_beam', 'brass', 0.8, 0.05, 0.06, -2.4, 1.68, -1.9, 0.4, g);
  addCyl('scale_pan_l', 'brass', 0.14, 0.1, 0.06, 10, -2.72, 1.52, -2.04, g);
  addCyl('scale_pan_r', 'brass', 0.14, 0.1, 0.06, 10, -2.08, 1.52, -1.76, g);
  addBox('scale_bench', 'wood_dark', 1.1, 0.14, 0.7, -2.4, 0.86, -1.9, 0.4, g);
  for (const [dx, dz] of [[-0.4, -0.2], [0.4, 0.2]]) addBox('scale_bench_leg', 'wood_ebony', 0.14, 0.86, 0.5, -2.4 + dx, 0.43, -1.9 + dz, 0.4, g);
  addBox('hourglass_cap_top', 'wood_deep', 0.24, 0.06, 0.24, -1.95, 1.28, -1.68, 0, g);
  const hgUpper = addCyl('hourglass_upper', 'glow_pane', 0.11, 0.03, 0.2, 10, -1.95, 1.15, -1.68, g);
  addCyl('hourglass_lower', 'glow_pane', 0.03, 0.11, 0.2, 10, -1.95, 0.99, -1.68, g);
  addBox('hourglass_cap_bottom', 'wood_deep', 0.24, 0.06, 0.24, -1.95, 0.92, -1.68, 0, g);
  addBox('skull', 'linen', 0.26, 0.24, 0.26, 2.05, 1.03, -1.2, 0.5, g);
  addBox('skull_jaw', 'linen', 0.2, 0.08, 0.2, 2.05, 0.9, -1.16, 0.5, g);
  addBox('skull_socket_l', 'wood_ebony', 0.07, 0.07, 0.04, 1.94, 1.06, -1.08, 0.5, g);
  addBox('skull_socket_r', 'wood_ebony', 0.07, 0.07, 0.04, 2.14, 1.06, -1.14, 0.5, g);
  addBox('skull_plinth', 'stone', 0.42, 0.8, 0.42, 2.05, 0.4, -1.2, 0.5, g);

  const glowMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const spell = new THREE.Group(); spell.name = 'spell_circle';
  spell.position.set(0.3, 2.5, -0.5);
  const haze = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40), glowMat(0x4fbfe8, 0.09));
  haze.name = 'spell_haze'; haze.rotation.x = -Math.PI / 2; spell.add(haze);
  [[1.5, 0.02, 0x7fe0ff, 0.5], [1.15, 0.014, 0xb98ee0, 0.42], [0.7, 0.012, 0x7fe0ff, 0.36]].forEach(([r, th, col, op], i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r as number, th as number, 4, 60), glowMat(col as number, op as number));
    ring.name = 'spell_ring_' + (i + 1); ring.rotation.x = Math.PI / 2; spell.add(ring);
    anim.rings.push({ o: ring, spin: i % 2 ? -0.5 : 0.32 });
  });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), glowMat(i % 3 ? 0x8fe6ff : 0xc9a0ff, 0.55));
    gm.name = 'spell_glyph';
    gm.position.set(Math.cos(a) * 1.32, 0, Math.sin(a) * 1.32);
    gm.rotation.x = -Math.PI / 2; gm.rotation.z = -a;
    spell.add(gm);
    anim.rings.push({ o: gm, phase: i * 0.62 });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sk = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.035), glowMat(0x7fe0ff, 0.3));
    sk.name = 'spell_spoke';
    sk.position.set(Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65);
    sk.rotation.x = -Math.PI / 2; sk.rotation.z = -a;
    spell.add(sk);
  }
  g.add(spell);
  anim.rings.push({ o: spell, bob: 0.16 });
  const spellLight = new THREE.PointLight(0x6fd8ff, 4, 5, 2);
  spellLight.position.set(0.3, 2.5, -0.5); fg.add(spellLight);
  for (let i = 0; i < 5; i++) {
    const rg = addBox('floating_reagent', pick(['glass_violet', 'glass_amber', 'glass_green', 'glass_blue']), 0.2, 0.26, 0.2, 0, 0, 0, 0, g);
    anim.books.push({ o: rg, r: 1.05, a0: (i / 5) * Math.PI * 2, y: 2.9, sp: -0.55, c: new THREE.Vector3(0.3, 0, -0.5), tilt: true });
  }

  return { cauldronBelly, still, spell, hgUpper, slots };
}
