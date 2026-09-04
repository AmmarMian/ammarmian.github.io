import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, rnd, pick, slab, wall, railing, roundWindow, windowGlow } from '../util';
import type { Anim } from '../anim';

/* ===== kitchen: hearth spirit, floating chores, a laden table ===== */
export function buildKitchen(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  slab(g, 'plank_warm_mid', 'plank_oak_dark', 'wood_deep', 'stone');
  wall(g, ['stone_warm', 'stone', 'stone_light', 'stone_warm'], ['stone_light', 'stone'], 'wood_deep');
  railing(g, 'wood_deep', 'wood_mid', 356, 448);
  roundWindow(g, 214, 3.2, 0.7);
  windowGlow(fg, 214, 3.2, 0.58);

  const hp = polar(150, 5.4 - 0.75);
  const hearth = new THREE.Group(); hearth.name = 'hearth';
  hearth.position.set(hp.x, 0, hp.z); hearth.rotation.y = RAD(150);
  addBox('hearth_back', 'stone', 2.6, 3.2, 0.3, 0, 1.6, -0.25, 0, hearth);
  for (const dx of [-1.1, 1.1]) addBox('hearth_pier', 'stone_light', 0.42, 2.0, 0.9, dx, 1.0, 0.15, 0, hearth);
  addBox('hearth_lintel', 'stone_light', 2.64, 0.36, 1.0, 0, 2.18, 0.15, 0, hearth);
  addBox('hearth_mantel', 'wood_dark', 2.9, 0.18, 1.15, 0, 2.45, 0.15, 0, hearth);
  addBox('hearth_hood', 'stone_warm', 2.0, 1.1, 0.8, 0, 3.05, 0.05, 0, hearth);
  addBox('hearth_floor', 'stone_warm', 2.2, 0.14, 1.1, 0, 0.07, 0.2, 0, hearth);
  for (let i = 0; i < 5; i++) addBox('firewood', 'wood_deep', 0.9, 0.14, 0.14, -0.3 + (i % 2) * 0.2, 0.2 + i * 0.13, 0.1 + (i % 3) * 0.09, RAD(6 + i * 9), hearth);

  const spirit = new THREE.Group(); spirit.name = 'fire_spirit';
  spirit.position.set(0, 0.55, 0.15);
  const flameMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const tongues: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const w = 0.3 - i * 0.028;
    const tg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, w), flameMat(i < 3 ? 0xffb040 : 0xffd870, 0.6));
    tg.name = 'spirit_tongue';
    tg.position.set(Math.sin(i * 1.7) * 0.14, 0.1 + i * 0.15, Math.cos(i * 2.1) * 0.1);
    spirit.add(tg); tongues.push(tg);
  }
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.34), flameMat(0xffca55, 0.75));
  core.name = 'spirit_core'; core.position.y = 0.3; spirit.add(core);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a0d06 });
  for (const dx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.04), eyeMat);
    eye.name = 'spirit_eye'; eye.position.set(dx, 0.36, 0.18); spirit.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.04), eyeMat);
  mouth.name = 'spirit_mouth'; mouth.position.set(0, 0.22, 0.18); spirit.add(mouth);
  for (const dx of [-0.24, 0.24]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.09), flameMat(0xffb040, 0.65));
    arm.name = 'spirit_arm'; arm.position.set(dx, 0.28, 0.06); spirit.add(arm);
  }
  hearth.add(spirit);
  anim.spirit = { g: spirit, tongues, core, mouth };
  const fire1 = new THREE.PointLight(0xff9a40, 14, 9, 2);
  fire1.position.set(hp.x, 1.0, hp.z); fg.add(fire1);
  anim.fireLight = fire1;
  addBox('kettle_arm', 'iron', 1.1, 0.08, 0.08, -0.4, 1.5, 0.2, 0, hearth);
  addBox('kettle_chain', 'iron', 0.05, 0.4, 0.05, 0.1, 1.28, 0.2, 0, hearth);
  const kettle = addCyl('kettle', 'iron', 0.28, 0.34, 0.42, 12, 0.1, 0.9, 0.2, hearth);
  addCyl('kettle_lid', 'iron', 0.22, 0.3, 0.08, 12, 0.1, 1.14, 0.2, hearth);
  addBox('kettle_spout', 'iron', 0.24, 0.09, 0.09, 0.38, 1.0, 0.2, 0.3, hearth);
  g.add(hearth);

  const tb = new THREE.Group(); tb.name = 'dining_table';
  addBox('table_top', 'plank_warm', 3.0, 0.16, 1.5, 0, 0.9, 0, 0, tb);
  addBox('table_rail', 'wood_dark', 2.8, 0.16, 1.3, 0, 0.76, 0, 0, tb);
  for (const dx of [-1.25, 1.25]) {
    addBox('table_trestle', 'wood_deep', 0.22, 0.8, 1.1, dx, 0.4, 0, 0, tb);
    addBox('table_foot', 'wood_deep', 0.34, 0.12, 1.3, dx, 0.06, 0, 0, tb);
  }
  addBox('table_stretcher', 'wood_deep', 2.2, 0.14, 0.16, 0, 0.34, 0, 0, tb);
  for (const dz of [-1.05, 1.05]) {
    addBox('bench_seat', 'wood_mid', 2.4, 0.14, 0.42, 0, 0.48, dz, 0, tb);
    for (const dx of [-0.9, 0.9]) addBox('bench_leg', 'wood_deep', 0.16, 0.48, 0.36, dx, 0.24, dz, 0, tb);
  }
  addBox('board', 'wood_mid', 0.8, 0.05, 0.5, -0.95, 1.0, 0.1, 0.1, tb);
  for (let i = 0; i < 3; i++) addBox('bread_loaf', 'plank_ash', 0.34, 0.2, 0.22, -1.1 + i * 0.22, 1.11, 0.1 + (i % 2) * 0.1, RAD(8 * i), tb);
  addBox('bread_slice', 'linen', 0.18, 0.04, 0.16, -0.6, 1.02, 0.22, 0.4, tb);
  addCyl('soup_pot', 'cauldron', 0.34, 0.28, 0.34, 12, 0.05, 1.15, -0.3, tb);
  addCyl('soup', 'terracotta', 0.28, 0.28, 0.06, 12, 0.05, 1.31, -0.3, tb);
  const ladle = addBox('ladle', 'wood_mid', 0.06, 0.4, 0.06, 0.22, 1.36, -0.3, 0, tb);
  ladle.rotation.z = 0.4;
  addCyl('roast_platter', 'linen', 0.42, 0.4, 0.06, 14, 0.85, 1.01, 0.05, tb);
  addBox('roast', 'terracotta', 0.5, 0.22, 0.34, 0.85, 1.14, 0.05, 0.2, tb);
  addBox('roast_glaze', 'cloth_red_dark', 0.42, 0.1, 0.28, 0.85, 1.26, 0.05, 0.2, tb);
  addCyl('pie_dish', 'terracotta', 0.28, 0.24, 0.1, 12, 1.3, 1.03, -0.4, tb);
  addCyl('pie', 'glass_amber', 0.26, 0.26, 0.1, 12, 1.3, 1.12, -0.4, tb);
  addCyl('fruit_bowl', 'wood_dark', 0.3, 0.2, 0.16, 12, -0.35, 1.06, 0.42, tb);
  for (let i = 0; i < 5; i++) addBox('fruit', pick(['cloth_red', 'glass_amber', 'leaf', 'cloth_red_dark']), 0.13, 0.13, 0.13, -0.35 + Math.cos(i * 1.3) * 0.13, 1.18, 0.42 + Math.sin(i * 1.3) * 0.13, 0, tb);
  addBox('cheese_wheel', 'glass_amber', 0.3, 0.16, 0.3, 0.45, 1.06, 0.45, 0.3, tb);
  addBox('cheese_wedge', 'glass_amber', 0.16, 0.12, 0.12, 0.68, 1.04, 0.5, 0.7, tb);
  addCyl('jug', 'terracotta', 0.16, 0.2, 0.36, 10, -1.15, 1.16, -0.42, tb);
  addBox('jug_handle', 'terracotta', 0.06, 0.16, 0.06, -0.98, 1.2, -0.42, 0, tb);
  for (let i = 0; i < 4; i++) {
    const dx = -0.75 + i * 0.5, dz = i % 2 ? 0.52 : -0.52;
    addCyl('plate', 'linen', 0.2, 0.18, 0.04, 12, dx, 1.0, dz, tb);
    addBox('cup', 'terracotta', 0.13, 0.16, 0.13, dx + 0.24, 1.06, dz, 0, tb);
    addBox('spoon', 'brass', 0.2, 0.03, 0.05, dx - 0.24, 1.0, dz, 0.2, tb);
  }
  addCyl('table_candle', 'candle', 0.07, 0.09, 0.3, 8, 0.35, 1.13, -0.05, tb);
  addBox('table_flame', 'flame', 0.09, 0.13, 0.09, 0.35, 1.34, -0.05, 0, tb);
  tb.position.copy(polar(310, 2.5)); tb.rotation.y = RAD(310);
  g.add(tb);
  const tl = new THREE.PointLight(0xffc070, 7, 6, 2);
  tl.position.copy(polar(310, 2.5, 2.2)); fg.add(tl);

  const sink = new THREE.Group(); sink.name = 'wash_station';
  addBox('sink_counter', 'stone_light', 2.0, 0.18, 0.8, 0, 0.92, 0, 0, sink);
  addBox('sink_apron', 'wood_deep', 1.9, 0.55, 0.65, 0, 0.62, 0, 0, sink);
  addBox('sink_basin', 'stone', 0.9, 0.3, 0.6, -0.4, 0.88, 0, 0, sink);
  addBox('sink_water', 'glass_blue', 0.8, 0.06, 0.5, -0.4, 1.0, 0, 0, sink);
  addBox('drying_rack', 'wood_dark', 0.9, 0.06, 0.5, 0.6, 1.03, 0, 0, sink);
  for (let i = 0; i < 3; i++) addCyl('drying_plate', 'linen', 0.2, 0.2, 0.04, 12, 0.35 + i * 0.25, 1.2, 0, sink).rotation.z = Math.PI / 2;
  sink.position.copy(polar(232, 3.8)); sink.rotation.y = RAD(232);
  g.add(sink);
  const chores: any[] = [];
  const sinkWorld = polar(232, 3.4, 1.5);
  for (let i = 0; i < 6; i++) {
    const item = new THREE.Group(); item.name = 'floating_chore_' + (i + 1);
    if (i % 3 === 0) {
      addBox('sponge', 'glass_green', 0.22, 0.12, 0.16, 0, 0, 0, 0, item);
      addBox('suds', 'linen', 0.1, 0.08, 0.1, 0.06, 0.1, 0.05, 0, item);
    } else if (i % 3 === 1) {
      addCyl('washed_plate', 'linen', 0.2, 0.2, 0.04, 12, 0, 0, 0, item);
      addCyl('washed_plate_rim', 'plank_ash', 0.21, 0.21, 0.02, 12, 0, 0.03, 0, item);
    } else {
      addBox('washed_cup', 'terracotta', 0.15, 0.18, 0.15, 0, 0, 0, 0, item);
      addBox('washed_cup_handle', 'terracotta', 0.05, 0.08, 0.05, 0.1, 0.02, 0, 0, item);
    }
    g.add(item);
    const c = { o: item, r: 0.8 + (i % 3) * 0.35, a0: (i / 6) * Math.PI * 2, y: 1.9 + (i % 3) * 0.3, sp: 0.5 + (i % 3) * 0.15, c: sinkWorld };
    chores.push(c);
    anim.books.push(c);
  }
  anim.chores = chores;

  for (const sy of [1.1, 1.75, 2.4]) {
    for (let a2 = 262; a2 <= 296; a2 += 4.4) arcBox('dresser_shelf', 'wood_dark', 0.4, 0.12, 0.6, a2, 5.4 - 0.5, sy, g);
    for (let a2 = 263; a2 <= 295; a2 += 3.0) {
      if (rnd() < 0.25) continue;
      arcBox('pantry_jar', pick(['glass_amber', 'glass_green', 'terracotta', 'glass_blue']), 0.2, 0.26, 0.2, a2, 5.4 - 0.56, sy + 0.19, g);
      arcBox('pantry_lid', 'wood_deep', 0.22, 0.06, 0.22, a2, 5.4 - 0.56, sy + 0.35, g);
    }
  }
  for (const a2 of [261, 297]) arcBox('dresser_post', 'wood_ebony', 0.24, 2.9, 0.62, a2, 5.4 - 0.5, 1.7, g);
  const pr2 = polar(310, 2.5);
  addBox('pot_rack', 'iron', 2.2, 0.1, 0.5, pr2.x, 3.3, pr2.z, RAD(310), g);
  for (const dx of [-0.9, 0.9]) addBox('pot_rack_chain', 'iron', 0.05, 0.9, 0.05, pr2.x + dx * Math.cos(RAD(310)), 3.8, pr2.z - dx * Math.sin(RAD(310)), 0, g);
  for (let i = 0; i < 5; i++) {
    const off = -0.8 + i * 0.4;
    const px2 = pr2.x + off * Math.cos(RAD(310)), pz2 = pr2.z - off * Math.sin(RAD(310));
    addCyl('hanging_pot', i % 2 ? 'cauldron' : 'brass', 0.2, 0.24, 0.28, 12, px2, 3.0, pz2, g);
    addBox('hanging_pot_handle', 'iron', 0.06, 0.2, 0.06, px2, 3.22, pz2, 0, g);
  }
  for (let a2 = 128; a2 <= 172; a2 += 4.4) {
    arcBox('herb_string', 'wood_mid', 0.9, 0.03, 0.03, a2, 5.4 - 1.5, 3.6, g);
    if (Math.round(a2) % 9 === 0) {
      arcBox('strung_herb', rnd() < 0.5 ? 'leaf' : 'leaf_dark', 0.14, 0.3, 0.14, a2, 5.4 - 1.5, 3.4, g);
      arcBox('strung_garlic', 'linen', 0.13, 0.13, 0.13, a2 + 2, 5.4 - 1.5, 3.44, g);
    }
  }
  const fs = polar(74, 4.0);
  addBox('flour_sack', 'linen', 0.6, 0.7, 0.5, fs.x, 0.35, fs.z, 0.3, g);
  addBox('flour_sack_b', 'linen', 0.5, 0.55, 0.45, fs.x + 0.55, 0.28, fs.z - 0.2, 0.8, g);
  addBox('flour_dust', 'linen', 0.3, 0.03, 0.3, fs.x + 0.2, 0.02, fs.z + 0.3, 0.4, g);
  const br = polar(340, 4.0);
  const broomHandle = addBox('broom_handle', 'wood_mid', 0.08, 1.9, 0.08, br.x, 0.95, br.z, 0, g);
  broomHandle.rotation.z = 0.16;
  addBox('broom_head', 'plank_ash', 0.34, 0.3, 0.18, br.x - 0.17, 0.15, br.z, 0, g);
  addCyl('cat_bowl', 'terracotta', 0.16, 0.12, 0.1, 10, br.x + 0.7, 0.05, br.z + 0.4, g);
  for (let i = 0; i < 8; i++) {
    const p = polar(rnd() * 360, 1.2 + rnd() * 2.8);
    addBox('crumb', pick(['plank_ash', 'linen', 'leaf']), 0.1 + rnd() * 0.06, 0.03, 0.08 + rnd() * 0.05, p.x, 0.015, p.z, rnd() * Math.PI, g);
  }

  return { spirit, soupPot: kettle, kettle, broomHandle, potRack: pr2 };
}
