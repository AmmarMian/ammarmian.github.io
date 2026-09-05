import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, rnd, slab, wall, railing, roundWindow, windowGlow, potPlant } from '../util';
import type { Anim } from '../anim';

/* ===== sleeping quarters: warm oak, textiles, candlelight ===== */
export function buildQuarters(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  slab(g, 'plank_warm', 'plank_warm_mid', 'wood_dark', 'stone');
  wall(g, ['wood_mid', 'wood_dark', 'wood_mid'], ['wood_dark', 'wood_deep'], 'wood_deep');
  railing(g, 'wood_dark', 'wood_mid', 356, 448);
  roundWindow(g, 196, 3.1, 0.62);
  windowGlow(fg, 196, 3.1, 0.52);

  for (let a = 116; a <= 140; a += 4.4) {
    arcBox('tapestry_panel', 'tapestry', 0.35, 3.0, 0.1, a, 5.4 - 0.36, 3.2, g);
    arcBox('tapestry_hem', 'cloth_red_dark', 0.35, 0.18, 0.14, a, 5.4 - 0.36, 1.65, g);
  }
  const tapRod = arcBox('tapestry_rod', 'wood_ebony', 2.2, 0.12, 0.16, 128, 5.4 - 0.36, 4.78, g);

  addCyl('rug_field', 'rug', 2.0, 2.0, 0.05, 20, -0.5, 0.03, 1.0, g);
  addCyl('rug_ring', 'rug_ink', 1.45, 1.45, 0.055, 20, -0.5, 0.035, 1.0, g);
  addCyl('rug_center', 'rug', 0.85, 0.85, 0.06, 20, -0.5, 0.04, 1.0, g);

  const b = new THREE.Group(); b.name = 'bed';
  addBox('bed_frame', 'wood_dark', 1.7, 0.32, 2.5, 0, 0.21, 0, 0, b);
  addBox('bed_mattress', 'linen', 1.6, 0.26, 2.3, 0, 0.48, 0, 0, b);
  addBox('bed_headboard', 'wood_deep', 1.72, 1.15, 0.18, 0, 0.85, 1.25, 0, b);
  for (let i = -2; i <= 2; i++) addBox('bed_slat', 'wood_mid', 0.13, 0.92, 0.22, i * 0.33, 0.88, 1.24, 0, b);
  addBox('bed_footboard', 'wood_deep', 1.72, 0.6, 0.16, 0, 0.55, -1.25, 0, b);
  addBox('bed_pillow', 'linen', 1.3, 0.24, 0.55, 0, 0.7, 0.86, 0, b);
  addBox('bed_blanket', 'cloth_red', 1.66, 0.32, 1.4, 0, 0.72, -0.34, 0, b);
  addBox('bed_blanket_fold', 'cloth_red_dark', 1.7, 0.26, 0.5, 0, 0.9, -0.12, 0, b);
  addBox('bed_blanket_drape', 'cloth_red', 1.6, 0.66, 0.34, 0, 0.52, -1.08, 0, b);
  b.position.set(-2.55, 0, 1.35); b.rotation.y = RAD(292);
  g.add(b);

  addBox('nightstand', 'wood_dark', 0.7, 0.16, 0.7, -1.15, 0.72, 2.9, 0.3, g);
  for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]])
    addBox('nightstand_leg', 'wood_deep', 0.1, 0.72, 0.1, -1.15 + dx, 0.36, 2.9 + dz, 0.3, g);
  const flame = addBox('candle_stub', 'candle', 0.16, 0.34, 0.16, -1.15, 0.97, 2.9, 0, g);
  const candleFlame = addBox('candle_flame', 'flame', 0.1, 0.15, 0.1, -1.15, 1.22, 2.9, 0, g);
  const cl = new THREE.PointLight(0xffb066, 8, 5, 2); cl.position.set(-1.15, 1.3, 2.9); fg.add(cl);

  const cx = polar(66, 4.1);
  addBox('chest_body', 'wood_dark', 1.2, 0.55, 0.75, cx.x, 0.28, cx.z, RAD(66), g);
  const chestLid = addBox('chest_lid', 'wood_deep', 1.25, 0.17, 0.79, cx.x, 0.63, cx.z, RAD(66), g);
  addBox('chest_band', 'brass', 1.28, 0.1, 0.81, cx.x, 0.46, cx.z, RAD(66), g);
  addBox('folded_robe', 'cloth_purple', 0.6, 0.2, 0.42, cx.x - 0.1, 0.81, cx.z + 0.05, RAD(66), g);
  addBox('slippers', 'wood_deep', 0.45, 0.12, 0.3, -0.9, 0.06, 0.1, 0.4, g);

  for (const [a, y] of [[150, 2.6], [166, 3.2], [232, 2.8]]) {
    arcBox('sconce_bracket', 'iron', 0.14, 0.1, 0.32, a, 5.4 - 0.42, y, g);
    arcBox('sconce_candle', 'candle', 0.14, 0.44, 0.14, a, 5.4 - 0.5, y + 0.27, g);
    arcBox('sconce_flame', 'flame', 0.09, 0.14, 0.09, a, 5.4 - 0.5, y + 0.56, g);
    const pl = new THREE.PointLight(0xff9f55, 6, 5, 2); pl.position.copy(polar(a, 5.4 - 0.7, y + 0.6)); fg.add(pl);
  }

  /* --- extra detail --- */
  addBox('washstand_top', 'wood_dark', 0.8, 0.14, 0.6, 1.9, 0.86, 2.6, 0.5, g);
  for (const [dx, dz] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]])
    addBox('washstand_leg', 'wood_deep', 0.1, 0.86, 0.1, 1.9 + dx, 0.43, 2.6 + dz, 0.5, g);
  addCyl('wash_basin', 'linen', 0.26, 0.2, 0.18, 12, 1.9, 1.02, 2.6, g);
  addCyl('wash_water', 'glass_blue', 0.22, 0.22, 0.05, 12, 1.9, 1.09, 2.6, g);
  addBox('wash_jug', 'terracotta', 0.22, 0.3, 0.22, 2.2, 1.08, 2.45, 0.3, g);
  addBox('hand_mirror', 'glow_pane', 0.2, 0.02, 0.28, 1.62, 0.94, 2.7, 0.4, g);

  for (let a = 258; a <= 300; a += 5.2) arcBox('laundry_line', 'linen', 0.9, 0.03, 0.03, a, 3.4, 4.1, g);
  for (const [a, h, m] of [[264, 0.8, 'cloth_purple'], [276, 0.7, 'linen'], [288, 0.85, 'robe_deep']] as const) {
    arcBox('hung_robe', m, 0.5, h as number, 0.06, a as number, 3.4, 4.1 - (h as number) / 2, g);
    arcBox('hung_robe_peg', 'wood_deep', 0.06, 0.1, 0.06, a as number, 3.4, 4.14, g);
  }

  const cat = new THREE.Group(); cat.name = 'familiar_cat';
  addBox('cat_body', 'wood_ebony', 0.46, 0.22, 0.26, 0, 0.11, 0, 0, cat);
  addBox('cat_head', 'wood_ebony', 0.2, 0.18, 0.18, 0.28, 0.19, 0, 0, cat);
  addBox('cat_ear_l', 'wood_ebony', 0.06, 0.08, 0.06, 0.24, 0.31, -0.06, 0, cat);
  addBox('cat_ear_r', 'wood_ebony', 0.06, 0.08, 0.06, 0.24, 0.31, 0.06, 0, cat);
  addBox('cat_eye_l', 'flame', 0.03, 0.03, 0.03, 0.38, 0.2, -0.05, 0, cat);
  addBox('cat_eye_r', 'flame', 0.03, 0.03, 0.03, 0.38, 0.2, 0.05, 0, cat);
  addBox('cat_tail', 'wood_ebony', 0.3, 0.07, 0.07, -0.3, 0.14, 0.08, 0.5, cat);
  cat.position.set(-2.2, 0.86, 0.55); cat.rotation.y = RAD(200);
  g.add(cat);

  addBox('bedside_mug', 'terracotta', 0.16, 0.16, 0.16, -0.78, 0.81, 3.0, 0.2, g);
  addBox('boot_pair', 'wood_deep', 0.5, 0.18, 0.34, 0.6, 0.09, 2.9, 0.9, g);
  addBox('journal', 'cloth_red_dark', 0.34, 0.09, 0.26, -1.5, 0.85, 2.72, 0.4, g);
  addBox('quill', 'linen', 0.28, 0.04, 0.04, -1.5, 0.92, 2.72, 1.1, g);

  // green in the bedroom too — a trailing one on the chest, a big one by the wall
  potPlant(g, 44, 4.4, { kind: 0, scale: 1.25 });
  potPlant(g, 84, 4.5, { kind: 1, scale: 1.0, pot: 'plant_pot_pale' });
  potPlant(g, 300, 4.3, { kind: 2, scale: 0.9 });

  return { candleFlame, chestLid, cat, tapRod };
}
