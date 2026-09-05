import * as THREE from 'three';
import { addBox, addCyl, polar, RAD, slab, wall, railing, potPlant } from '../util';
import { M } from '../materials';
import type { Anim } from '../anim';

/* ===== portal sanctum: bare stone vault built around the gate ===== */
export function buildSanctum(sg: THREE.Group, sf: THREE.Group, anim: Anim) {
  slab(sg, 'stone', 'stone_warm', 'stone', 'stone');
  wall(sg, ['stone', 'stone_warm', 'stone', 'stone_light'], ['stone_light', 'stone'], 'stone');
  railing(sg, 'stone_light', 'stone_warm', 356, 448);

  const portal = new THREE.Group(); portal.name = 'portal';
  portal.position.copy(polar(168, 5.4 - 0.6, 2.4));
  portal.rotation.y = RAD(168);
  const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.17, 8, 40), M.portal_stone);
  ringOuter.name = 'portal_ring'; portal.add(ringOuter);
  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.07, 6, 40), M.portal_rim);
  ringInner.name = 'portal_rim'; ringInner.position.z = 0.06; portal.add(ringInner);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.95, 40), new THREE.MeshBasicMaterial({
    color: 0x7fd8ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }));
  halo.name = 'portal_halo'; halo.position.z = 0.07; portal.add(halo);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.62, 24, 1, true), M.portal_stone);
  throat.name = 'portal_throat'; throat.rotation.x = Math.PI / 2; throat.position.z = -0.3; portal.add(throat);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const vous = addBox('portal_voussoir', i % 2 ? 'stone_light' : 'stone_warm', 0.3, 0.42, 0.24,
      Math.cos(a) * 1.66, Math.sin(a) * 1.66, -0.02, 0, portal);
    vous.rotation.z = a;
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rune = addBox('portal_rune', i % 2 ? 'rune_glow' : 'rune_violet', 0.16, 0.16, 0.1,
      Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.14, 0, portal);
    anim.rings.push({ o: rune, phase: i * 0.5 });
  }
  const view = new THREE.Group(); view.name = 'portal_view'; view.position.z = -0.06; portal.add(view);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.34, 32), new THREE.MeshBasicMaterial({ color: 0x060a12 }));
  disc.name = 'portal_backdrop'; view.add(disc);
  const worlds: { name: string; g: THREE.Group }[] = [];
  function world(name: string, sky: number, build: (flat: any) => void) {
    const wg = new THREE.Group(); wg.name = 'portal_world_' + name;
    const back = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), new THREE.MeshBasicMaterial({ color: sky }));
    back.position.z = 0.01; wg.add(back);
    const flat = (m: number, w: number, h: number, x: number, y: number, z = 0.02) => {
      const q2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: m }));
      q2.position.set(x, y, z); wg.add(q2); return q2;
    };
    build(flat);
    wg.visible = false; view.add(wg); worlds.push({ name, g: wg });
  }
  /* One preview per real destination, named for the world it stands for, so
     the gate can be asked to show a particular one — the modal pins these on
     hover — and its idle cycle is a genuine tour of where you can go rather
     than seven invented places. Flat quads only: at this size anything more
     is mud. */
  world('seafloor', 0x0d4a6b, (f) => {
    f(0x0a3a58, 2.8, 2.8, 0, 0);
    f(0xc9b06a, 2.8, 0.7, 0, -0.95, 0.02);
    [[-0.8, 0.7], [-0.2, 1.0], [0.5, 0.8], [1.0, 0.5]].forEach(([x, h], i) => {
      f(i % 2 ? 0x2f9f8a : 0x3fbf9a, 0.14, h, x, -0.6 + h / 2, 0.04);
    });
    f(0x9fe8ff, 0.5, 2.4, -0.45, 0.5, 0.03);     // a shaft off the surface
    f(0x9fe8ff, 0.3, 2.4, 0.65, 0.5, 0.03);
    f(0x6f7f4a, 0.22, 0.14, 0.15, 0.3, 0.06);
    f(0x6f7f4a, 0.16, 0.1, -0.55, 0.65, 0.06);
  });
  world('moon', 0x2a2748, (f) => {
    f(0x1a2038, 2.8, 2.8, 0, 0);
    f(0xb08a5f, 1.5, 1.5, -0.55, 0.72, 0.02);    // the gas giant, low and huge
    f(0xd8c0a0, 1.5, 0.12, -0.55, 0.78, 0.03);   // its rings
    f(0xe8e0d0, 0.16, 0.16, 0.95, 1.05, 0.03);
    f(0x4a5f3a, 2.8, 1.0, 0, -0.85, 0.04);
    f(0x5f7a48, 2.8, 0.22, 0, -0.36, 0.05);
    [[-0.9, 0.5], [0.2, 0.62], [0.95, 0.44]].forEach(([x, sc]) => {
      f(0x3b2a1e, 0.1 * sc, 0.6 * sc, x, -0.3 + 0.3 * sc, 0.06);
      f(0x2f5f33, 0.7 * sc, 0.5 * sc, x, 0.12 * sc + 0.05, 0.07);
    });
  });
  world('forest', 0x2f4a3a, (f) => {
    f(0x1d3328, 2.8, 1.1, 0, -0.8);
    f(0x24402f, 2.8, 2.8, 0, 0.4, 0.01);
    [[-1.0, 0.24], [-0.5, 0.2], [0.1, 0.28], [0.62, 0.18], [1.05, 0.22]].forEach(([x, w], i) => {
      f(0x3b2a1e, w, 2.2, x, 0.3, 0.03 + i * 0.002);
      f(i % 2 ? 0x2f6b3f : 0x387a48, w * 3.4, 1.0, x, 0.85, 0.04);
    });
    f(0x5f8f4f, 2.8, 0.3, 0, -0.35, 0.06);
    f(0xd8e8b0, 0.5, 0.12, 0.3, 1.05, 0.07);
    f(0x8fbf6a, 0.24, 0.1, -0.7, -0.45, 0.07);
  });
  world('beach', 0x1a63c4, (f) => {
    f(0x7fd0ec, 2.8, 1.2, 0, 0.75, 0.01);        // warm low sky
    f(0xf2b478, 2.8, 0.5, 0, 0.2, 0.02);
    f(0xffd08a, 0.36, 0.36, 0.62, 0.34, 0.03);   // the sun, sitting low
    f(0x1f7f9f, 2.8, 0.62, 0, -0.2, 0.04);       // sea
    f(0x2fb0b0, 2.8, 0.2, 0, -0.44, 0.05);       // the bar
    f(0xf0f6f8, 2.8, 0.09, 0, -0.56, 0.06);      // the surf line
    f(0xd8b878, 2.8, 0.7, 0, -0.95, 0.06);       // sand
    f(0xffcf9a, 1.0, 0.12, 0.62, -0.1, 0.07);    // the glitter path
  });
  world('city', 0x0a101a, (f) => {
    f(0x121824, 2.8, 2.8, 0, 0.2);
    f(0x1a1a1a, 2.8, 1.0, 0, -0.85, 0.02);
    [[-0.9, 0.5, 0.9], [-0.45, 0.7, 1.3], [0.05, 0.45, 0.7], [0.5, 0.85, 1.5], [0.95, 0.55, 1.0]]
      .forEach(([x, w, h], i) => {
        f(i % 2 ? 0x24222c : 0x2e2b34, w, h, x, -0.35 + h / 2, 0.03);
        if (i % 2) f(0xffb466, 0.08, 0.1, x - 0.1, -0.2 + h * 0.6, 0.04);
        f(0xffb466, 0.08, 0.1, x + 0.11, -0.35 + h * 0.35, 0.04);
      });
    f(0xff8a3c, 0.34, 0.34, 0.15, 0.95, 0.06);   // the eye
    f(0x1a1613, 0.12, 0.12, 0.15, 0.95, 0.07);   // its pupil
    f(0xffb466, 0.9, 0.06, 0.15, -0.42, 0.05);   // sodium pooled on wet road
  });
  world('space', 0x05060f, (f) => {
    f(0x05060f, 2.8, 2.8, 0, 0);
    f(0x2a1f4a, 1.7, 1.0, -0.4, 0.55, 0.01);     // nebula
    f(0x4a2f6b, 1.0, 0.6, -0.2, 0.4, 0.02);
    f(0xff6a35, 0.28, 0.28, 0.85, 0.85, 0.03);   // the red dwarf
    f(0x2f6b8f, 0.7, 0.7, 0.35, -0.5, 0.03);     // the ocean world
    f(0x4a9f7a, 0.34, 0.16, 0.28, -0.42, 0.04);
    [[-0.9, 0.9], [-0.3, 1.15], [0.6, 1.0], [1.05, 0.2], [-1.0, -0.4], [0.15, -0.95]]
      .forEach(([x, y]) => f(0xe8f0ff, 0.05, 0.05, x, y, 0.05));
  });
  world('rain', 0x2b303a, (f) => {
    f(0x4a5462, 2.8, 2.8, 0, 0.3);
    f(0x2f3a2a, 2.8, 1.0, 0, -0.85, 0.02);
    f(0x10171e, 2.2, 0.18, -0.1, -0.62, 0.03);   // standing water
    f(0x10171e, 1.0, 0.12, 0.75, -0.38, 0.03);
    [[-0.95, 0.22], [-0.3, 0.18], [0.45, 0.24], [1.0, 0.16]].forEach(([x, w]) => {
      f(0x2e2a26, w, 1.7, x, 0.35, 0.04);        // bare trunks
      f(0x2e2a26, w * 2.2, 0.06, x, 0.95, 0.05);
    });
    // the rain itself: a lot of thin verticals, leaning together
    for (let i = 0; i < 22; i++) f(0xbcc8d8, 0.02, 0.5, -1.25 + i * 0.115, 0.15 + (i % 3) * 0.35, 0.06);
  });
  // even the sanctum: something living beside the gate
  potPlant(sg, 210, 4.5, { kind: 0, scale: 1.2 });
  potPlant(sg, 120, 4.4, { kind: 1, scale: 0.95, pot: 'plant_pot_pale' });

  sg.add(portal);
  anim.portal = { view, worlds, i: 0, at: 0 };
  const pl = new THREE.PointLight(0x8fd8ff, 9, 6, 2);
  pl.position.copy(polar(168, 5.4 - 1.4, 2.4)); sf.add(pl);

  const dial = new THREE.Group(); dial.name = 'portal_dial';
  dial.position.copy(polar(150, 5.4 - 0.62, 2.1));
  dial.rotation.y = RAD(150);
  addBox('dial_backplate', 'portal_stone', 1.1, 1.5, 0.16, 0, 0, 0, 0, dial);
  addBox('dial_backplate_trim', 'brass', 1.2, 0.1, 0.2, 0, 0.78, 0, 0, dial);
  addBox('dial_backplate_foot', 'brass', 1.2, 0.1, 0.2, 0, -0.78, 0, 0, dial);
  const wheel = new THREE.Group(); wheel.name = 'dial_wheel'; wheel.position.set(0, 0.3, 0.13); dial.add(wheel);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 24), M.brass);
  ring.name = 'dial_ring'; wheel.add(ring);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const mk = addBox('dial_mark', i === 0 ? 'portal_rim' : 'brass', 0.09, 0.2, 0.09, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.02, 0, wheel);
    mk.rotation.z = -a;
  }
  addCyl('dial_hub', 'portal_rim', 0.12, 0.12, 0.18, 10, 0, 0, 0.04, wheel).rotation.x = Math.PI / 2;
  const lever = new THREE.Group(); lever.name = 'portal_lever';
  lever.position.set(0, -0.42, 0.16); dial.add(lever);
  addBox('lever_arm', 'brass', 0.1, 0.44, 0.1, 0, -0.22, 0, 0, lever);
  addBox('lever_knob', 'portal_rim', 0.19, 0.19, 0.19, 0, -0.48, 0, 0, lever);
  sg.add(dial);
  const dialGlow = new THREE.PointLight(0x8fd8ff, 5, 3, 2);
  dialGlow.position.copy(polar(150, 5.4 - 1.2, 2.1)); sf.add(dialGlow);
  anim.dial = { wheel, lever };

  const offP = polar(300, 3.2);
  addBox('offer_table', 'stone_light', 1.3, 0.16, 0.7, offP.x, 0.85, offP.z, RAD(300), sg);
  for (const dx of [-0.5, 0.5]) {
    const p = polar(300, 3.2);
    addBox('offer_leg', 'stone', 0.2, 0.85, 0.5, p.x + dx * Math.cos(RAD(300)), 0.42, p.z - dx * Math.sin(RAD(300)), RAD(300), sg);
  }
  for (let i = 0; i < 4; i++) {
    const p = polar(294 + i * 4, 3.2);
    addBox('offer_candle', 'candle', 0.12, 0.3, 0.12, p.x, 1.08, p.z, 0, sg);
    addBox('offer_flame', 'flame', 0.08, 0.12, 0.08, p.x, 1.29, p.z, 0, sg);
  }
  const kneelP = polar(168, 2.2);
  addBox('kneeling_cushion', 'cloth_red_dark', 0.7, 0.16, 0.5, kneelP.x, 0.08, kneelP.z, RAD(168), sg);
  const chalkCircle = addCyl('chalk_circle', 'rune_glow', 2.0, 2.0, 0.02, 40, 0, 0.02, 0, sg);
  (chalkCircle as any).material = new THREE.MeshBasicMaterial({ color: 0x6fd0e8, transparent: true, opacity: 0.14 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    addBox('chalk_glyph', 'rune_glow', 0.16, 0.02, 0.16, Math.cos(a) * 1.75, 0.025, Math.sin(a) * 1.75, a, sg);
  }
  const rc = polar(122, 3.9);
  addBox('relic_crate', 'wood_dark', 0.9, 0.7, 0.9, rc.x, 0.35, rc.z, RAD(122), sg);
  addBox('relic_crate_lid', 'wood_deep', 0.94, 0.1, 0.94, rc.x, 0.73, rc.z, RAD(122), sg);
  addBox('relic_shell', 'linen', 0.3, 0.2, 0.34, rc.x + 0.1, 0.87, rc.z, 0.4, sg);
  addBox('relic_coral', 'terracotta', 0.18, 0.34, 0.18, rc.x - 0.22, 0.9, rc.z + 0.1, 0, sg);
  addBox('relic_ore', 'rune_violet', 0.2, 0.18, 0.2, rc.x + 0.05, 0.86, rc.z - 0.3, 0.7, sg);
  const torch = new THREE.PointLight(0xff9a55, 9, 8, 2);
  torch.position.copy(polar(300, 3.0, 1.6)); sf.add(torch);

  return { dial, portal };
}
