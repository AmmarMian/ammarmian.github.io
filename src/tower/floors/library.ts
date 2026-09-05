import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, rnd, pick, slab, wall, railing, roundWindow, windowGlow } from '../util';
import { M } from '../materials';
import type { Anim } from '../anim';

/** One book-sized gap on the library shelves, and whether a publication has
 *  claimed it. */
export interface ShelfSlot {
  mesh: THREE.Mesh;
  band: number;
  angle: number;
  row: number;
  height: number;
  taken: boolean;
}

/* ===== library: dark ebony shelving, books everywhere ===== */
export function buildLibrary(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  slab(g, 'plank_oak', 'plank_oak_dark', 'wood_deep', 'stone');
  wall(g, ['wood_deep', 'wood_ebony', 'wood_deep'], ['wood_ebony'], 'wood_ebony');
  railing(g, 'wood_deep', 'wood_dark', 356, 448);
  roundWindow(g, 175, 3.4, 0.82);
  windowGlow(fg, 175, 3.4, 0.68);

  /* Every spine on these shelves is a slot a real publication can move into.
     The shelf is built first and filled with anonymous books, then the HAL
     records are bound to the nearest matching slot once they arrive — see
     bindPublications in scene.ts. Keeping the record of where each one sits
     is what lets a visitor read the shelf instead of a list. */
  const shelfBands: { a0: number; a1: number }[] = [];
  const slots: ShelfSlot[] = [];
  const ROWS = [0.95, 1.62, 2.29, 2.96, 3.63, 4.3];
  for (const [bi, [a0, a1]] of ([[104, 158], [194, 248]] as const).entries()) {
    shelfBands.push({ a0, a1 });
    for (const [ri, sy] of ROWS.entries()) {
      for (let a = a0; a <= a1; a += 4.4) arcBox('shelf_board', 'wood_dark', 0.4, 0.12, 0.66, a, 5.4 - 0.54, sy, g);
      for (let a = a0 + 1; a <= a1 - 1; a += 2.0) {
        if (rnd() < 0.2) continue;
        const h = 0.3 + rnd() * 0.18;
        const mesh = arcBox('book', pick(['cloth_red_dark', 'glass_blue', 'leaf_dark', 'cloth_purple', 'linen', 'glass_green', 'cloth_red', 'glass_amber']),
          0.16, h, 0.3, a, 5.4 - 0.56, sy + 0.06 + h / 2, g, rnd() < 0.12 ? 0.3 : 0);
        slots.push({ mesh, band: bi, angle: a, row: ri, height: h, taken: false });
      }
    }
    for (const a of [a0 - 1, a1 + 1]) arcBox('shelf_end', 'wood_ebony', 0.24, 4.7, 0.7, a, 5.4 - 0.54, 2.6, g);
    for (let a = a0; a <= a1; a += 4.4) arcBox('shelf_back', 'wood_ebony', 0.4, 4.7, 0.1, a, 5.4 - 0.24, 2.6, g);
  }

  const d = new THREE.Group(); d.name = 'reading_desk';
  addBox('desk_top', 'wood_dark', 2.3, 0.16, 1.0, 0, 0.94, 0, 0, d);
  addBox('desk_apron', 'wood_deep', 2.2, 0.4, 0.85, 0, 0.68, 0, 0, d);
  for (const dx of [-0.95, 0.95]) addBox('desk_leg', 'wood_ebony', 0.18, 0.86, 0.7, dx, 0.43, 0, 0, d);
  addBox('tome_cover', 'cloth_red_dark', 0.9, 0.08, 0.62, -0.25, 1.06, 0.05, 0.15, d);
  addBox('tome_pages', 'paper', 0.8, 0.07, 0.54, -0.25, 1.13, 0.05, 0.15, d);
  addBox('book_stack_a', 'glass_blue', 0.42, 0.13, 0.32, 0.62, 1.08, -0.1, 0.4, d);
  addBox('book_stack_b', 'leaf_dark', 0.4, 0.12, 0.3, 0.62, 1.2, -0.1, 0.15, d);
  addBox('desk_candle', 'candle', 0.14, 0.4, 0.14, 0.9, 1.22, 0.25, 0, d);
  addBox('desk_flame', 'flame', 0.09, 0.14, 0.09, 0.9, 1.49, 0.25, 0, d);
  addBox('inkwell', 'iron', 0.2, 0.18, 0.2, 0.3, 1.11, 0.35, 0, d);
  d.position.copy(polar(176, 2.6)); d.rotation.y = RAD(176);
  g.add(d);
  const dl = new THREE.PointLight(0xffb066, 9, 6, 2); dl.position.copy(polar(176, 2.5, 1.8)); fg.add(dl);

  const sp = polar(166, 1.4);
  addCyl('stool_seat', 'wood_mid', 0.34, 0.3, 0.14, 10, sp.x, 0.62, sp.z, g);
  for (const [dx, dz] of [[-0.2, -0.18], [0.2, -0.18], [0, 0.24]])
    addBox('stool_leg', 'wood_deep', 0.12, 0.6, 0.12, sp.x + dx, 0.3, sp.z + dz, 0, g);

  const lad = new THREE.Group(); lad.name = 'library_ladder';
  for (const dx of [-0.28, 0.28]) addBox('ladder_rail', 'wood_mid', 0.11, 4.6, 0.11, dx, 2.3, 0, 0, lad);
  for (let i = 0; i < 11; i++) addBox('ladder_rung', 'wood_dark', 0.6, 0.09, 0.11, 0, 0.35 + i * 0.42, 0, 0, lad);
  lad.position.copy(polar(214, 4.2)); lad.rotation.y = RAD(214); lad.rotation.x = -0.16;
  g.add(lad);

  for (let i = 0; i < 5; i++) {
    const p = polar(rnd() * 360, 1.0 + rnd() * 2.8);
    const n = 2 + Math.floor(rnd() * 4);
    for (let j = 0; j < n; j++)
      addBox('floor_book', pick(['cloth_red_dark', 'glass_blue', 'leaf_dark', 'cloth_purple', 'glass_amber']),
        0.44 - j * 0.02, 0.13, 0.34, p.x + (rnd() - 0.5) * 0.1, 0.07 + j * 0.13, p.z + (rnd() - 0.5) * 0.1, rnd() * Math.PI, g);
  }
  for (let i = 0; i < 16; i++) {
    const p = polar(rnd() * 360, 0.8 + rnd() * 3.6);
    addBox('loose_page', 'paper', 0.34 + rnd() * 0.16, 0.035, 0.26 + rnd() * 0.12, p.x, 0.015, p.z, rnd() * Math.PI, g);
  }

  /* --- extra detail --- */
  const cat2 = new THREE.Group(); cat2.name = 'card_catalogue';
  addBox('catalogue_case', 'wood_ebony', 1.5, 1.5, 0.6, 0, 0.75, 0, 0, cat2);
  for (let r = 0; r < 5; r++) for (let cq = 0; cq < 4; cq++) {
    addBox('catalogue_drawer', 'wood_dark', 0.33, 0.25, 0.06, -0.55 + cq * 0.36, 0.22 + r * 0.29, 0.32, 0, cat2);
    addBox('catalogue_pull', 'brass', 0.1, 0.05, 0.05, -0.55 + cq * 0.36, 0.22 + r * 0.29, 0.37, 0, cat2);
  }
  addBox('catalogue_top', 'wood_deep', 1.6, 0.1, 0.68, 0, 1.55, 0, 0, cat2);
  addBox('catalogue_stack', 'paper', 0.4, 0.1, 0.3, 0.35, 1.65, 0.05, 0.2, cat2);
  cat2.position.copy(polar(268, 4.2)); cat2.rotation.y = RAD(268); g.add(cat2);

  const lec = new THREE.Group(); lec.name = 'lectern';
  addBox('lectern_foot', 'wood_deep', 0.6, 0.14, 0.6, 0, 0.07, 0, 0, lec);
  addCyl('lectern_post', 'wood_dark', 0.12, 0.18, 1.15, 10, 0, 0.68, 0, lec);
  const desk = addBox('lectern_desk', 'wood_dark', 0.8, 0.08, 0.6, 0, 1.3, 0, 0, lec);
  desk.rotation.x = -0.4;
  const gri = addBox('grimoire', 'cloth_purple', 0.66, 0.14, 0.48, 0, 1.4, 0.03, 0, lec);
  gri.rotation.x = -0.4;
  addBox('grimoire_chain', 'iron', 0.05, 0.7, 0.05, 0.3, 1.0, 0.1, 0, lec);
  lec.position.copy(polar(320, 2.6)); lec.rotation.y = RAD(320); g.add(lec);
  const gl = new THREE.PointLight(0xa8f2ff, 5, 3.5, 2);
  gl.position.copy(polar(320, 2.6, 2.0)); fg.add(gl);

  const gb = new THREE.Group(); gb.name = 'celestial_globe';
  addBox('globe_base', 'wood_deep', 0.5, 0.12, 0.5, 0, 0.06, 0, 0, gb);
  addCyl('globe_post', 'wood_dark', 0.09, 0.12, 0.7, 10, 0, 0.45, 0, gb);
  const meridian = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 6, 28), M.brass);
  meridian.name = 'globe_meridian'; meridian.position.y = 1.2; meridian.rotation.y = 0.4; gb.add(meridian);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), M.glass_blue);
  sphere.name = 'globe_sphere'; sphere.position.y = 1.2; gb.add(sphere);
  anim.rings.push({ o: sphere, spin: 0.25 });
  gb.position.copy(polar(300, 3.4)); g.add(gb);

  addBox('chair_seat', 'cloth_red_dark', 0.75, 0.2, 0.7, 0, 0.5, 0, 0, g).position.copy(polar(340, 1.9, 0.5));
  const chBack = addBox('chair_back', 'cloth_red_dark', 0.75, 0.85, 0.18, 0, 0, 0, RAD(340), g);
  chBack.position.copy(polar(340, 2.2, 0.95));
  for (let i = 0; i < 9; i++)
    addBox('book_tower', pick(['cloth_red_dark', 'glass_blue', 'leaf_dark', 'cloth_purple', 'glass_amber']),
      0.46 - (i % 3) * 0.03, 0.13, 0.34, 1.55, 0.07 + i * 0.13, -1.6, rnd() * 0.5, g);

  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(); b.name = 'flying_book_' + (i + 1);
    addBox('cover', pick(['cloth_red_dark', 'glass_blue', 'leaf_dark', 'cloth_purple', 'glass_amber']), 0.44, 0.06, 0.34, 0, 0, 0, 0, b);
    const pl2 = addBox('page_left', 'paper', 0.22, 0.03, 0.32, -0.14, 0.05, 0, 0, b);
    const pr = addBox('page_right', 'paper', 0.22, 0.03, 0.32, 0.14, 0.05, 0, 0, b);
    pl2.rotation.z = 0.4; pr.rotation.z = -0.4;
    g.add(b);
    anim.books.push({ o: b, r: 1.5 + (i % 3) * 0.55, a0: (i / 7) * Math.PI * 2, y: 2.5 + (i % 4) * 0.4, sp: 0.35 + (i % 3) * 0.12, c: polar(176, 2.2) });
  }
  const bl = new THREE.PointLight(0xa8f2ff, 3, 4.5, 2);
  bl.position.copy(polar(176, 2.2, 3.1)); fg.add(bl);

  return { cat2, lad, gb, lec, shelfBands, slots };
}
