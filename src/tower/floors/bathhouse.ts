import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, R, rnd, pick, wall, railing, potPlant } from '../util';
import { M } from '../materials';
import type { Anim } from '../anim';

/* ===== bathhouse: glazed tile, standing water, and a window that is
   emphatically not looking at the same place the rest of the tower is =====

   The one room in the building with no work in it. Everything here is warm,
   wet and low: a sunken tub, a copper tap that actually runs, ferns crowding
   the light, and a tall casement whose glass shows somewhere else entirely.
   That last part is the point of the room — see the vista shader below. */

/** Which view the casement is showing. */
export const VISTAS = ['meadow', 'coast'] as const;
export type Vista = typeof VISTAS[number];

export function buildBathhouse(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  /* The carrelage. Laid as real tiles rather than a texture: at this scale a
     grid of small boxes reads better than any map would, and it lets the
     pattern actually be a pattern — a pale field, a deep border following the
     curve of the wall, and a warm compass set into the middle. */
  const TILE = 0.62;
  for (let x = -R; x <= R; x += TILE) {
    for (let z = -R; z <= R; z += TILE) {
      const d = Math.hypot(x + TILE / 2, z + TILE / 2);
      if (d > R - 0.16) continue;
      const ring = Math.floor(d / TILE);
      const checker = (Math.round(x / TILE) + Math.round(z / TILE)) % 2 === 0;
      let m = checker ? 'tile_pale' : 'porcelain_shade';
      if (d > R - 1.25) m = checker ? 'tile_deep' : 'tile_pale';   // border course
      if (d < 1.3) m = ring % 2 ? 'tile_warm' : 'tile_pale';       // the rosette
      addBox('floor_tile', m, TILE - 0.05, 0.14, TILE - 0.05, x + TILE / 2, -0.07, z + TILE / 2, 0, g);
    }
  }
  addCyl('platform_body', 'stone_light', R - 0.02, R - 0.3, 0.72, 30, 0, -0.56, 0, g);
  addCyl('platform_footing', 'stone', R - 0.34, R - 0.8, 0.42, 26, 0, -1.1, 0, g);

  wall(g, ['stone_light', 'stone_warm', 'stone_light'], ['stone_light'], 'tile_deep');
  railing(g, 'wood_deep', 'wood_mid', 356, 448);

  /* Tiled wainscot: the same glazed course carried up the wall to shoulder
     height, with a deep band at the top so it ends deliberately. */
  for (let a = 100; a <= 236; a += 4.4) {
    for (let k = 0; k < 4; k++) {
      arcBox('wall_tile', (k + Math.round(a)) % 2 ? 'tile_pale' : 'porcelain_shade',
        0.35, 0.5, 0.12, a, R - 0.34, 0.3 + k * 0.52, g);
    }
    arcBox('wall_tile_band', 'tile_deep', 0.35, 0.22, 0.16, a, R - 0.34, 2.48, g);
  }

  /* ---------------------------- the tub ---------------------------- */
  const tub = new THREE.Group(); tub.name = 'bathtub';
  const TW = 2.5, TD = 1.35, TH = 0.78;
  // outer shell, built as four walls and a floor so the inside is hollow
  addBox('tub_floor', 'porcelain', TW, 0.16, TD, 0, 0.08, 0, 0, tub);
  for (const dz of [-1, 1]) addBox('tub_side', 'porcelain', TW, TH, 0.16, 0, TH / 2, dz * (TD / 2 - 0.08), 0, tub);
  for (const dx of [-1, 1]) addBox('tub_end', 'porcelain', 0.16, TH, TD, dx * (TW / 2 - 0.08), TH / 2, 0, 0, tub);
  // a rolled rim all the way round
  for (const dz of [-1, 1]) addBox('tub_rim', 'porcelain_shade', TW + 0.14, 0.12, 0.26, 0, TH + 0.02, dz * (TD / 2 - 0.03), 0, tub);
  for (const dx of [-1, 1]) addBox('tub_rim', 'porcelain_shade', 0.26, 0.12, TD + 0.14, dx * (TW / 2 - 0.03), TH + 0.02, 0, 0, tub);
  // clawed feet, because of course
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    addBox('tub_foot', 'copper', 0.2, 0.26, 0.2, dx * (TW / 2 - 0.26), 0.13, dz * (TD / 2 - 0.24), 0, tub);
    addBox('tub_claw', 'brass', 0.26, 0.1, 0.26, dx * (TW / 2 - 0.26), 0.05, dz * (TD / 2 - 0.24), 0, tub);
  }
  // the water: a slab that rocks, plus a few floating things
  const water = addBox('tub_water', 'bathwater', TW - 0.3, 0.34, TD - 0.3, 0, 0.5, 0, 0, tub);
  for (let i = 0; i < 5; i++) {
    addBox('suds', 'porcelain', 0.16 + rnd() * 0.14, 0.09, 0.14 + rnd() * 0.12,
      (rnd() - 0.5) * (TW - 0.7), 0.69, (rnd() - 0.5) * (TD - 0.6), rnd() * 3, tub);
  }
  addBox('soap', 'linen', 0.2, 0.09, 0.14, 0.8, 0.72, 0.34, 0.4, tub);
  tub.position.copy(polar(196, 3.0));
  tub.rotation.y = RAD(196 + 90);
  g.add(tub);

  /* the tap, and the water it is running */
  const tapG = new THREE.Group(); tapG.name = 'bath_tap';
  addCyl('tap_stem', 'copper', 0.07, 0.09, 0.86, 8, 0, 0.43, 0, tapG);
  addBox('tap_spout', 'copper', 0.5, 0.11, 0.11, 0.18, 0.86, 0, 0, tapG);
  addBox('tap_mouth', 'copper', 0.14, 0.16, 0.14, 0.4, 0.79, 0, 0, tapG);
  for (const [dz, mm] of [[-0.22, 'copper'], [0.22, 'brass']] as const) {
    addCyl('tap_valve_post', 'copper', 0.05, 0.05, 0.2, 6, -0.1, 0.72, dz, tapG);
    const w2 = addCyl('tap_valve', mm, 0.15, 0.15, 0.05, 8, -0.1, 0.84, dz, tapG);
    w2.rotation.x = Math.PI / 2;
  }
  // the stream, a thin column of the same water as the bath
  const stream = addBox('tap_stream', 'bathwater', 0.09, 0.62, 0.09, 0.4, 0.47, 0, 0, tapG);
  const tp = polar(196 - 26, 3.0);
  tapG.position.set(tp.x, 0.72, tp.z);
  tapG.rotation.y = RAD(196 - 26 + 90);
  g.add(tapG);

  /* --------------------------- the casement ---------------------------
     A tall window whose glass is not glass. It shows a place that has nothing
     to do with whichever world the tower is standing in — which is the whole
     idea: a room you go to in order to be somewhere else for a minute. Two
     views, both drawn procedurally in the fragment shader, switched by the
     brass lever beside the frame or by the console. */
  const uVista = { value: 0 };      // 0 = meadow, 1 = coast; lerped, so it dissolves
  const uT = { value: 0 };
  const vistaMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { uVista, uT },
    vertexShader: `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uVista; uniform float uT;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.02; a *= 0.5; } return s; }

      /* 1 · a meadow, all wind. The grass is a band of vertical strokes whose
         phase runs with a slow travelling wave, so gusts cross the field
         rather than the whole thing waving at once. */
      vec3 meadow(vec2 uv){
        vec3 sky = mix(vec3(0.62,0.78,0.92), vec3(0.20,0.45,0.78), smoothstep(0.45, 1.0, uv.y));
        // fair-weather cloud, drifting
        float cl = smoothstep(0.55, 0.85, fbm(vec2(uv.x * 3.0 - uT * 0.012, uv.y * 5.0)));
        sky = mix(sky, vec3(0.96,0.97,0.99), cl * smoothstep(0.5, 0.95, uv.y) * 0.85);
        // hills behind
        float hill = 0.42 + 0.05 * sin(uv.x * 5.0) + 0.03 * fbm(vec2(uv.x * 4.0, 1.0));
        vec3 c = uv.y > hill ? sky : mix(vec3(0.35,0.52,0.30), vec3(0.48,0.64,0.36), uv.y / hill);
        // the field, and the wind crossing it
        float fld = 0.34 + 0.02 * fbm(vec2(uv.x * 6.0, 3.0));
        if (uv.y < fld) {
          float gust = sin(uv.x * 7.0 - uT * 1.1) * 0.5 + 0.5;
          float blade = noise(vec2(uv.x * 220.0 + sin(uT * 0.9 + uv.x * 12.0) * gust * 2.4, uv.y * 12.0));
          vec3 near = mix(vec3(0.24,0.42,0.20), vec3(0.55,0.70,0.32), blade);
          near *= 0.72 + 0.5 * (uv.y / fld);                 // darker down among the roots
          c = near;
          // wildflowers, only in the near half
          float fl = step(0.986, hash(floor(vec2(uv.x * 90.0, uv.y * 34.0))));
          c = mix(c, vec3(0.96,0.9,0.55), fl * step(uv.y, fld * 0.8));
          float fl2 = step(0.992, hash(floor(vec2(uv.x * 70.0 + 9.0, uv.y * 30.0))));
          c = mix(c, vec3(0.92,0.55,0.68), fl2 * step(uv.y, fld * 0.7));
        }
        return c;
      }

      /* 2 · mountains with the sea behind them, late in the day. */
      vec3 coast(vec2 uv){
        vec3 sky = mix(vec3(0.98,0.78,0.55), vec3(0.16,0.32,0.62), smoothstep(0.30, 1.0, uv.y));
        float sun = smoothstep(0.055, 0.0, length((uv - vec2(0.68, 0.44)) * vec2(1.0, 1.35)));
        sky += vec3(1.0,0.72,0.38) * sun * 1.3;
        sky += vec3(0.9,0.5,0.25) * smoothstep(0.34, 0.0, length((uv - vec2(0.68, 0.44)) * vec2(1.0, 1.2))) * 0.28;
        vec3 c = sky;
        // sea, with the sun's road running back to the horizon
        float sea = 0.40;
        if (uv.y < sea) {
          float d = (sea - uv.y);
          c = mix(vec3(0.10,0.28,0.44), vec3(0.05,0.13,0.28), d * 2.2);
          float road = exp(-pow((uv.x - 0.68) / (0.02 + d * 0.55), 2.0));
          float chop = step(0.55, fract(uv.y * 90.0 + sin(uv.x * 40.0 + uT * 0.8) * 0.3 + uT * 0.25));
          c += vec3(1.0,0.78,0.45) * road * chop * (0.55 + 0.45 * sin(uT * 2.0 + uv.x * 30.0));
        }
        // three ridges, palest at the back
        float r1 = 0.40 + 0.11 * fbm(vec2(uv.x * 2.2, 0.0));
        float r2 = 0.36 + 0.15 * fbm(vec2(uv.x * 3.4 + 4.0, 0.0));
        float r3 = 0.30 + 0.19 * fbm(vec2(uv.x * 4.8 + 9.0, 0.0));
        if (uv.y < r1) c = mix(c, vec3(0.42,0.45,0.58), 0.85);
        if (uv.y < r2) c = mix(c, vec3(0.28,0.30,0.42), 0.92);
        if (uv.y < r3) {
          c = vec3(0.16,0.17,0.26);
          // snow catching the last of the light on the highest one
          c = mix(c, vec3(0.85,0.84,0.88), smoothstep(r3 - 0.035, r3, uv.y) * 0.8);
        }
        return c;
      }

      void main(){
        vec2 uv = vUv;
        vec3 c = mix(meadow(uv), coast(uv), uVista);
        // the glass itself: a cool wash at the edges and a faint bloom of dew
        float edge = smoothstep(0.0, 0.16, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
        c = mix(c * 0.72 + vec3(0.06,0.09,0.12), c, edge);
        c += vec3(0.05,0.07,0.08) * fbm(uv * 26.0) * (1.0 - edge);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const cas = new THREE.Group(); cas.name = 'vista_casement';
  const CW = 2.35, CH = 3.0;
  addBox('casement_reveal', 'stone_light', CW + 0.5, CH + 0.5, 0.26, 0, CH / 2, -0.1, 0, cas);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), vistaMat);
  pane.name = 'vista_pane';
  pane.position.set(0, CH / 2, 0.04);
  cas.add(pane);
  // leading: a frame, a transom and two mullions over the view
  addBox('casement_sill', 'stone_light', CW + 0.7, 0.22, 0.55, 0, -0.06, 0.12, 0, cas);
  addBox('casement_head', 'stone_light', CW + 0.7, 0.24, 0.4, 0, CH + 0.1, 0.06, 0, cas);
  for (const dx of [-1, 1]) addBox('casement_jamb', 'stone_light', 0.26, CH + 0.2, 0.4, dx * (CW / 2 + 0.12), CH / 2, 0.06, 0, cas);
  for (const dx of [-0.4, 0.4]) addBox('casement_mullion', 'wood_ebony', 0.09, CH, 0.14, dx * CW, CH / 2, 0.1, 0, cas);
  addBox('casement_transom', 'wood_ebony', CW, 0.09, 0.14, 0, CH * 0.62, 0.1, 0, cas);
  cas.position.copy(polar(300, R - 0.44));
  cas.rotation.y = RAD(300 + 180);
  g.add(cas);
  // the view has to light the room, or it reads as a poster
  const vistaLight = new THREE.PointLight(0xcfe4d8, 7, 7, 2);
  vistaLight.name = 'vista_light';
  vistaLight.position.copy(polar(300, R - 2.0, 1.9));
  fg.add(vistaLight);

  /* the lever that changes the view */
  const lever = new THREE.Group(); lever.name = 'vista_lever';
  addBox('lever_plate', 'brass', 0.28, 0.42, 0.1, 0, 0, 0, 0, lever);
  const leverArm = addBox('lever_arm', 'copper', 0.09, 0.42, 0.09, 0, 0.18, 0.1, 0, lever);
  addBox('lever_knob', 'brass', 0.16, 0.16, 0.16, 0, 0.38, 0.1, 0, lever);
  lever.position.copy(polar(287, R - 0.62, 1.55));
  lever.rotation.y = RAD(287 + 180);
  g.add(lever);

  /* ------------------------- fittings and green ------------------------- */
  const wash = new THREE.Group(); wash.name = 'washstand';
  addBox('wash_top', 'tile_pale', 1.3, 0.14, 0.66, 0, 0.92, 0, 0, wash);
  addCyl('wash_basin', 'porcelain', 0.36, 0.26, 0.24, 12, -0.2, 1.03, 0, wash);
  addBox('wash_apron', 'wood_deep', 1.2, 0.5, 0.55, 0, 0.62, 0, 0, wash);
  for (const dx of [-0.55, 0.55]) addBox('wash_leg', 'wood_ebony', 0.13, 0.85, 0.5, dx, 0.42, 0, 0, wash);
  addCyl('wash_tap', 'copper', 0.05, 0.05, 0.34, 6, -0.2, 1.2, -0.22, wash);
  addBox('wash_tap_spout', 'copper', 0.06, 0.06, 0.22, -0.2, 1.35, -0.13, 0, wash);
  addBox('wash_jug', 'terracotta', 0.24, 0.3, 0.24, 0.42, 1.14, 0.04, 0.3, wash);
  addBox('wash_mirror', 'glow_pane', 0.62, 0.78, 0.05, 0, 1.9, -0.3, 0, wash);
  addBox('wash_mirror_frame', 'brass', 0.72, 0.88, 0.03, 0, 1.9, -0.33, 0, wash);
  wash.position.copy(polar(146, R - 1.05));
  wash.rotation.y = RAD(146 + 180);
  g.add(wash);

  // a folding screen, for modesty the fox does not respect
  const scr = new THREE.Group(); scr.name = 'bath_screen';
  [-1, 0, 1].forEach((i) => {
    const leaf = addBox('screen_leaf', i === 0 ? 'linen' : 'cloth_purple', 0.9, 1.9, 0.07, i * 0.82, 0.95, Math.abs(i) * 0.22, 0, scr);
    leaf.rotation.y = i * 0.42;
  });
  scr.position.copy(polar(232, 3.6));
  scr.rotation.y = RAD(232 + 160);
  g.add(scr);

  // towels on a rail, and a shelf of bottles
  const rail = new THREE.Group(); rail.name = 'towel_rail';
  addCyl('rail_bar', 'copper', 0.05, 0.05, 1.5, 8, 0, 1.5, 0, rail).rotation.z = Math.PI / 2;
  for (const dx of [-0.72, 0.72]) addBox('rail_bracket', 'copper', 0.07, 0.3, 0.07, dx, 1.36, 0, 0, rail);
  [-0.42, 0.02, 0.46].forEach((dx, i) => {
    addBox('towel', i === 1 ? 'cloth_red' : 'linen', 0.34, 0.72, 0.12, dx, 1.12, 0.04, 0, rail);
  });
  rail.position.copy(polar(166, R - 0.5));
  rail.rotation.y = RAD(166 + 180);
  g.add(rail);

  /* Ferns everywhere. A bathroom is the one place in a house where plants
     genuinely thrive, and the room should look like somebody knows that. */
  potPlant(g, 268, 4.3, { kind: 1, scale: 1.5, pot: 'plant_pot_pale' });
  potPlant(g, 252, 4.5, { kind: 0, scale: 1.2 });
  potPlant(g, 318, 4.2, { kind: 0, scale: 1.35, pot: 'plant_pot_pale' });
  potPlant(g, 210, 4.6, { kind: 1, scale: 1.1 });
  potPlant(g, 178, 4.5, { kind: 2, scale: 1.0, pot: 'plant_pot_pale' });
  potPlant(g, 128, 4.4, { kind: 0, scale: 0.95 });
  // one on the tub's rim, and one on the washstand
  potPlant(g, 196, 1.6, { kind: 2, scale: 0.7, pot: 'plant_pot_pale' });
  potPlant(g, 150, 3.9, { y: 1.0, kind: 2, scale: 0.55 });
  // and a hanging one over the water
  const hang = potPlant(g, 205, 2.2, { y: 3.1, kind: 2, scale: 0.9, pot: 'plant_pot_pale' });
  addBox('plant_hook', 'iron', 0.06, 0.9, 0.06, 0, 0.85, 0, 0, hang);

  // duckboards by the tub, because the tiles are cold
  for (let i = 0; i < 7; i++) {
    arcBox('duckboard', i % 2 ? 'wood_mid' : 'wood_dark', 0.16, 0.06, 1.1, 208 + i * 3.4, 2.0, 0.05, g);
  }

  // candles round the rim of the tub — the room is meant to be sat in
  for (const a of [182, 210]) {
    const cp = polar(a, 3.9);
    addCyl('bath_candle', 'candle', 0.09, 0.11, 0.3, 8, cp.x, 0.15, cp.z, g);
    addBox('bath_candle_flame', 'flame', 0.08, 0.13, 0.08, cp.x, 0.36, cp.z, 0, g);
  }

  const warm = new THREE.PointLight(0xffc890, 7, 7, 2);
  warm.position.copy(polar(196, 2.6, 2.2));
  fg.add(warm);

  /* Steam, hanging over the water and never quite leaving the room. */
  anim.bath = { water, stream, tap: tapG, lever: leverArm, uVista, uT, vistaLight };

  return { tub, tapG, cas, lever, pane, uVista, VISTAS };
}
