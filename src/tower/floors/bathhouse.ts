import * as THREE from 'three';
import { addBox, addCyl, arcBox, polar, RAD, R, rnd, wall, potPlant } from '../util';
import { M } from '../materials';
import { makePoints } from '../fx';
import type { Anim } from '../anim';

/* ===== the bath cellar =====

   Cut into the rock under the sanctum, so there is no daylight down here and
   no view out — except the one window, which does not open onto anything that
   could possibly be on the other side of that wall. It sits low and level with
   the water, beside the tub, so the whole point of the room is that you can
   lie in the bath and look at somewhere else.

   The bath is a sunken ofuro: square, deep, wooden, filled to the brim and
   steaming, with a board floating across it carrying a flask and a cup. */

export const VISTAS = ['meadow', 'coast'] as const;
export type Vista = typeof VISTAS[number];

export function buildBathhouse(g: THREE.Group, fg: THREE.Group, anim: Anim) {
  /* Carrelage. Laid as real tiles: at this scale a grid of small boxes reads
     better than any texture would, and it lets the pattern be a pattern. */
  const TILE = 0.58;
  for (let x = -R; x <= R; x += TILE) {
    for (let z = -R; z <= R; z += TILE) {
      const cx = x + TILE / 2, cz = z + TILE / 2;
      const d = Math.hypot(cx, cz);
      if (d > R - 0.16) continue;
      const checker = (Math.round(x / TILE) + Math.round(z / TILE)) % 2 === 0;
      let m = checker ? 'tile_pale' : 'porcelain_shade';
      if (d > R - 1.2) m = checker ? 'tile_deep' : 'tile_pale';
      if (d < 1.5) m = checker ? 'tile_warm' : 'tile_pale';
      addBox('floor_tile', m, TILE - 0.05, 0.14, TILE - 0.05, cx, -0.07, cz, 0, g);
    }
  }
  addCyl('platform_body', 'stone', R - 0.02, R - 0.1, 0.9, 30, 0, -0.6, 0, g);

  // walls all the way round: this is a cellar, so there is no open side
  wall(g, ['stone', 'stone_warm', 'stone_light'], ['stone_light'], 'tile_deep', 96, 344);
  for (let a = 96; a <= 344; a += 4.4) {
    for (let k = 0; k < 3; k++) {
      arcBox('wall_tile', (k + Math.round(a)) % 2 ? 'tile_pale' : 'porcelain_shade',
        0.35, 0.5, 0.12, a, R - 0.34, 0.3 + k * 0.52, g);
    }
    arcBox('wall_tile_band', 'tile_deep', 0.35, 0.2, 0.16, a, R - 0.34, 1.94, g);
  }
  // a vaulted ceiling, because you can see it from in the water
  for (let a = 0; a < 360; a += 7.5) {
    arcBox('vault_rib', 'stone_warm', 0.4, 0.5, 1.6, a, R - 0.9, 4.5, g);
    arcBox('vault_rib', 'stone', 0.4, 0.5, 1.4, a, R - 2.2, 4.95, g);
  }
  addCyl('vault_boss', 'stone_light', 1.4, 1.1, 0.4, 16, 0, 5.15, 0, g);

  /* ------------------------------ the ofuro ------------------------------
     Square, sunk into the floor, cedar-lined, brim-full. Sunk rather than
     standing means the water sits at the height of the window. */
  const tub = new THREE.Group(); tub.name = 'ofuro';
  const TW = 2.6, TD = 2.6, TH = 1.15;
  // the well: four inner walls dropping below the tiles
  for (const dz of [-1, 1]) addBox('ofuro_side', 'wood_mid', TW, TH, 0.18, 0, -TH / 2 + 0.02, dz * (TD / 2), 0, tub);
  for (const dx of [-1, 1]) addBox('ofuro_side', 'wood_mid', 0.18, TH, TD, dx * (TW / 2), -TH / 2 + 0.02, 0, 0, tub);
  addBox('ofuro_floor', 'wood_dark', TW, 0.16, TD, 0, -TH, 0, 0, tub);
  // the coping: a broad cedar rim you sit on
  for (const dz of [-1, 1]) addBox('ofuro_coping', 'wood_mid', TW + 0.8, 0.16, 0.4, 0, 0.08, dz * (TD / 2 + 0.2), 0, tub);
  for (const dx of [-1, 1]) addBox('ofuro_coping', 'wood_mid', 0.4, 0.16, TD + 0.8, dx * (TW / 2 + 0.2), 0.08, 0, 0, tub);
  for (const dx of [-1, 1]) for (const dz of [-1, 1])
    addBox('ofuro_corner', 'wood_dark', 0.4, 0.2, 0.4, dx * (TW / 2 + 0.2), 0.1, dz * (TD / 2 + 0.2), 0, tub);

  /* The water. Its top face rides up and down as the bath fills, so `fill`
     is a real state and not a flourish — see the tap, below. */
  const water = addBox('ofuro_water', 'bathwater', TW - 0.2, 1.0, TD - 0.2, 0, -0.45, 0, 0, tub);

  /* The floating board: a slat tray with a flask, a cup, and blossoms. */
  const tray = new THREE.Group(); tray.name = 'bath_tray';
  for (let i = 0; i < 5; i++) addBox('tray_slat', i % 2 ? 'wood_mid' : 'wood_dark', 1.0, 0.05, 0.15, 0, 0, -0.32 + i * 0.16, 0, tray);
  for (const dx of [-0.42, 0.42]) addBox('tray_rail', 'wood_dark', 0.07, 0.06, 0.82, dx, -0.03, 0, 0, tray);
  addCyl('sake_flask', 'porcelain', 0.1, 0.14, 0.3, 10, -0.22, 0.18, 0.02, tray);
  addCyl('sake_neck', 'porcelain', 0.045, 0.05, 0.12, 8, -0.22, 0.38, 0.02, tray);
  addCyl('sake_cup', 'porcelain', 0.08, 0.06, 0.09, 10, 0.06, 0.08, -0.1, tray);
  addCyl('sake_cup', 'porcelain', 0.08, 0.06, 0.09, 10, 0.24, 0.08, 0.14, tray);
  addBox('tray_dish', 'porcelain_shade', 0.22, 0.03, 0.22, 0.42, 0.05, -0.12, 0.3, tray);
  tray.position.set(-0.35, 0.06, 0.3);
  tray.rotation.y = 0.24;
  tub.add(tray);

  /* Blossoms on the water. Six of them, drifting on their own slow circles. */
  const petals: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const p = addBox('petal', i % 3 === 0 ? 'plant_bloom' : 'linen', 0.15, 0.02, 0.11,
      0, 0.05, 0, rnd() * 3, tub);
    (p.userData as any) = { a: rnd() * 6.28, r: 0.35 + rnd() * 0.85, sp: 0.08 + rnd() * 0.16 };
    petals.push(p);
  }

  tub.position.copy(polar(300, 2.35));
  tub.rotation.y = RAD(300);
  g.add(tub);

  /* --------------------------- the window ---------------------------
     Low, wide and level with the water: seen from in the bath it fills the
     view, and from anywhere else in the room it is a window. Parallel to the
     wall it sits in, which is what makes it read as a window and not a
     screen hung in front of one. */
  const uVista = { value: 0 };
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

      /* A meadow, drawn as grass rather than as a green rectangle with a
         texture on it. Each blade is a real silhouette: the field is sliced
         into columns, every column carries one blade whose height, lean and
         colour come from its own hash, and the fragment is grass if it falls
         below that blade's tip. Three passes of it — far, middle, near — with
         the near ones taller, darker at the root and leaning further, so the
         field has depth instead of being a wall of noise. The wind is a
         travelling wave in the lean, so gusts cross the field. */
      float bladesAt(vec2 uv, float density, float height, float phase, float amp){
        float col = uv.x * density;
        float id = floor(col);
        float f = fract(col);
        float h = hash(vec2(id, phase));
        // this blade's own lean, plus the gust crossing the field right now
        float gust = sin(id * 0.35 - uT * 1.25 + phase) * 0.5 + 0.5;
        float lean = (h - 0.5) * 0.5 + gust * amp;
        // the blade tapers, so the column it occupies narrows toward the tip
        float top = height * (0.55 + h * 0.9);
        float y = uv.y;
        float t = clamp(y / max(top, 0.001), 0.0, 1.0);
        float centre = 0.5 + lean * t * t;         // curve, not a straight tilt
        float halfW = mix(0.42, 0.05, t);
        return step(abs(f - centre), halfW) * step(y, top);
      }
      vec3 meadow(vec2 uv){
        vec3 sky = mix(vec3(0.66,0.80,0.93), vec3(0.19,0.44,0.78), smoothstep(0.42, 1.0, uv.y));
        float cl = smoothstep(0.52, 0.86, fbm(vec2(uv.x * 2.6 - uT * 0.010, uv.y * 4.4)));
        sky = mix(sky, vec3(0.97,0.98,1.0), cl * smoothstep(0.46, 0.95, uv.y) * 0.9);
        vec3 c = sky;

        // a hedgerow on the skyline, so the field ends somewhere
        float hedge = 0.315 + 0.022 * fbm(vec2(uv.x * 9.0, 2.0));
        if (uv.y < hedge) c = mix(vec3(0.20,0.31,0.20), vec3(0.30,0.42,0.26), fbm(vec2(uv.x * 26.0, 5.0)));

        // three ranks of grass, far to near
        vec2 g1 = vec2(uv.x, uv.y - 0.02);
        if (bladesAt(g1 * vec2(1.0, 3.6), 260.0, 0.30, 0.0, 0.10) > 0.5)
          c = mix(vec3(0.36,0.50,0.26), vec3(0.52,0.66,0.32), hash(vec2(floor(uv.x * 260.0), 1.0)));
        vec2 g2 = vec2(uv.x, uv.y - 0.005);
        if (bladesAt(g2 * vec2(1.0, 2.1), 150.0, 0.42, 3.0, 0.16) > 0.5)
          c = mix(vec3(0.27,0.42,0.20), vec3(0.46,0.61,0.27), hash(vec2(floor(uv.x * 150.0), 2.0)));
        if (bladesAt(uv * vec2(1.0, 1.25), 78.0, 0.52, 7.0, 0.24) > 0.5) {
          float sh = hash(vec2(floor(uv.x * 78.0), 3.0));
          c = mix(vec3(0.17,0.30,0.13), vec3(0.38,0.54,0.22), sh);
          c *= 0.55 + 0.75 * clamp(uv.y / 0.42, 0.0, 1.0);   // dark down at the roots
        }
        // seed heads and a few flowers riding above the grass
        float sd = step(0.9955, hash(floor(vec2(uv.x * 150.0, uv.y * 60.0))));
        c = mix(c, vec3(0.86,0.82,0.55), sd * step(uv.y, 0.34) * step(0.06, uv.y));
        float fl = step(0.9975, hash(floor(vec2(uv.x * 120.0 + 11.0, uv.y * 52.0))));
        c = mix(c, vec3(0.95,0.93,0.62), fl * step(uv.y, 0.26));
        float fl2 = step(0.9985, hash(floor(vec2(uv.x * 96.0 + 41.0, uv.y * 44.0))));
        c = mix(c, vec3(0.90,0.52,0.66), fl2 * step(uv.y, 0.22));
        return c;
      }

      /* Mountains with the sea behind them, late in the day. */
      vec3 coast(vec2 uv){
        vec3 sky = mix(vec3(0.98,0.78,0.55), vec3(0.15,0.31,0.62), smoothstep(0.28, 1.0, uv.y));
        float sun = smoothstep(0.05, 0.0, length((uv - vec2(0.7, 0.42)) * vec2(1.0, 1.35)));
        sky += vec3(1.0,0.72,0.38) * sun * 1.4;
        sky += vec3(0.9,0.5,0.25) * smoothstep(0.32, 0.0, length((uv - vec2(0.7, 0.42)) * vec2(1.0, 1.2))) * 0.3;
        vec3 c = sky;
        float sea = 0.36;
        if (uv.y < sea) {
          float d = sea - uv.y;
          c = mix(vec3(0.10,0.28,0.44), vec3(0.04,0.11,0.26), d * 2.6);
          float road = exp(-pow((uv.x - 0.7) / (0.018 + d * 0.6), 2.0));
          float chop = step(0.52, fract(uv.y * 110.0 + sin(uv.x * 44.0 + uT * 0.7) * 0.35 + uT * 0.22));
          c += vec3(1.0,0.78,0.45) * road * chop * (0.55 + 0.45 * sin(uT * 1.9 + uv.x * 26.0));
        }
        float r1 = 0.38 + 0.10 * fbm(vec2(uv.x * 2.2, 0.0));
        float r2 = 0.34 + 0.14 * fbm(vec2(uv.x * 3.4 + 4.0, 0.0));
        float r3 = 0.28 + 0.18 * fbm(vec2(uv.x * 4.8 + 9.0, 0.0));
        if (uv.y < r1) c = mix(c, vec3(0.42,0.45,0.58), 0.85);
        if (uv.y < r2) c = mix(c, vec3(0.27,0.29,0.41), 0.92);
        if (uv.y < r3) {
          c = vec3(0.15,0.16,0.25);
          c = mix(c, vec3(0.86,0.85,0.89), smoothstep(r3 - 0.03, r3, uv.y) * 0.85);
        }
        return c;
      }

      void main(){
        vec3 c = mix(meadow(vUv), coast(vUv), uVista);
        // it is behind glass: cooler at the edges, and misted at the bottom
        float edge = smoothstep(0.0, 0.13, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        c = mix(c * 0.74 + vec3(0.06,0.09,0.11), c, edge);
        float mist = smoothstep(0.22, 0.0, vUv.y) * 0.5;
        c = mix(c, vec3(0.80,0.86,0.88), mist * (0.4 + 0.6 * fbm(vUv * 18.0)));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

  const cas = new THREE.Group(); cas.name = 'vista_casement';
  const CW = 3.1, CH = 1.5;                   // low and wide, at bath height
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), vistaMat);
  pane.name = 'vista_pane';
  cas.add(pane);
  // set into the wall: a splayed stone reveal, a sill, and a light frame
  addBox('casement_sill', 'stone_light', CW + 0.6, 0.2, 0.6, 0, -CH / 2 - 0.1, 0.16, 0, cas);
  addBox('casement_head', 'stone_light', CW + 0.6, 0.22, 0.5, 0, CH / 2 + 0.11, 0.1, 0, cas);
  for (const dx of [-1, 1]) addBox('casement_jamb', 'stone_light', 0.24, CH + 0.2, 0.5, dx * (CW / 2 + 0.12), 0, 0.1, 0, cas);
  for (const dx of [-0.33, 0, 0.33]) addBox('casement_mullion', 'wood_ebony', 0.07, CH, 0.1, dx * CW, 0, 0.06, 0, cas);
  addBox('casement_transom', 'wood_ebony', CW, 0.07, 0.1, 0, 0, 0.06, 0, cas);
  // the window is level with the water, on the wall the tub stands against
  cas.position.copy(polar(300, R - 0.42, 1.05));
  cas.rotation.y = RAD(300 + 180);
  g.add(cas);
  const vistaLight = new THREE.PointLight(0xcfe4d8, 8, 8, 2);
  vistaLight.name = 'vista_light';
  vistaLight.position.copy(polar(300, R - 2.2, 1.5));
  fg.add(vistaLight);

  // the lever that changes it, within reach of the water
  const lever = new THREE.Group(); lever.name = 'vista_lever';
  addBox('lever_plate', 'brass', 0.26, 0.4, 0.1, 0, 0, 0, 0, lever);
  const leverArm = addBox('lever_arm', 'copper', 0.08, 0.4, 0.08, 0, 0.17, 0.09, 0, lever);
  addBox('lever_knob', 'brass', 0.15, 0.15, 0.15, 0, 0.36, 0.09, 0, lever);
  lever.position.copy(polar(288, R - 0.6, 1.35));
  lever.rotation.y = RAD(288 + 180);
  g.add(lever);

  /* ------------------------------- the tap -------------------------------
     A bamboo spout over the corner of the tub. Clicking it runs the water. */
  const tapG = new THREE.Group(); tapG.name = 'bath_tap';
  addCyl('tap_post', 'wood_dark', 0.09, 0.11, 1.5, 8, 0, 0.75, 0, tapG);
  const spout = addCyl('tap_spout', 'wood_mid', 0.08, 0.08, 0.8, 8, 0.3, 1.42, 0, tapG);
  spout.rotation.z = Math.PI / 2 - 0.22;
  addCyl('tap_collar', 'copper', 0.1, 0.1, 0.09, 8, 0, 1.44, 0, tapG);
  const valve = addCyl('tap_valve', 'brass', 0.16, 0.16, 0.06, 8, 0, 1.05, 0.12, tapG);
  valve.rotation.x = Math.PI / 2;
  const stream = addBox('tap_stream', 'bathwater', 0.08, 0.9, 0.08, 0.63, 0.95, 0, 0, tapG);
  const tpp = polar(300, 2.35);
  const tapOff = polar(300 + 90, 1.5);
  tapG.position.set(tpp.x + tapOff.x, 0.1, tpp.z + tapOff.z);
  tapG.rotation.y = RAD(300 + 90);
  g.add(tapG);

  /* Steam. It hangs over the water and never quite leaves the room, which is
     the single thing that says this water is hot. */
  const steam = makePoints(g, 90, 0xdfe9ee, 0.22, () => ({
    x: tpp.x + (Math.random() - 0.5) * 2.4,
    y: 0.2 + Math.random() * 2.2,
    z: tpp.z + (Math.random() - 0.5) * 2.4,
    v: 0.12 + Math.random() * 0.24,
  }));
  (steam.m.material as THREE.PointsMaterial).opacity = 0.12;

  /* ------------------------------ the green ------------------------------
     Far more of it than anywhere else in the tower, at three heights: standing
     on the floor, sitting on ledges, and hanging from the vault. A bathroom is
     the one room in a house where plants genuinely thrive. */
  // floor-standing, round the walls
  for (const [a, d, k, sc] of [
    [110, 4.5, 0, 1.5], [126, 4.6, 1, 1.2], [150, 4.5, 0, 1.35], [168, 4.6, 1, 1.05],
    [190, 4.5, 0, 1.25], [214, 4.6, 1, 1.45], [238, 4.5, 2, 1.1], [258, 4.6, 0, 1.3],
    [332, 4.5, 1, 1.4], [344, 4.4, 0, 1.15],
  ] as const) potPlant(g, a, d, { kind: k as 0 | 1 | 2, scale: sc, pot: a % 2 ? 'plant_pot' : 'plant_pot_pale' });

  // a ledge running round the tiled wall, with pots stood on it
  for (let a = 104; a <= 340; a += 4.4) arcBox('plant_ledge', 'stone_light', 0.35, 0.14, 0.42, a, R - 0.5, 2.15, g);
  for (const [a, k] of [[118, 2], [140, 0], [162, 2], [186, 1], [208, 2], [232, 0], [252, 2], [330, 2]] as const)
    potPlant(g, a, R - 0.62, { y: 2.22, kind: k as 0 | 1 | 2, scale: 0.62, pot: 'plant_pot_pale' });

  // and hanging from the vault on iron hooks
  for (const [a, d, y, sc] of [
    [122, 3.4, 3.5, 0.95], [158, 3.8, 3.7, 0.85], [196, 3.2, 3.4, 1.0],
    [232, 3.7, 3.6, 0.8], [264, 3.0, 3.5, 0.9], [330, 3.5, 3.6, 0.85],
  ] as const) {
    const h = potPlant(g, a, d, { y, kind: 2, scale: sc, pot: 'plant_pot_pale' });
    const hook = addBox('plant_hook', 'iron', 0.05, 1.5, 0.05, 0, 1.5, 0, 0, h);
    hook.name = 'plant_hook';
    addBox('plant_hook_ring', 'iron', 0.18, 0.05, 0.18, 0, 0.78, 0, 0, h);
  }

  /* ------------------------- fittings and the rest ------------------------- */
  const wash = new THREE.Group(); wash.name = 'washstand';
  addBox('wash_top', 'tile_pale', 1.2, 0.14, 0.6, 0, 0.92, 0, 0, wash);
  addCyl('wash_basin', 'porcelain', 0.32, 0.24, 0.22, 12, -0.16, 1.02, 0, wash);
  addBox('wash_apron', 'wood_deep', 1.1, 0.48, 0.5, 0, 0.62, 0, 0, wash);
  for (const dx of [-0.5, 0.5]) addBox('wash_leg', 'wood_ebony', 0.12, 0.85, 0.46, dx, 0.42, 0, 0, wash);
  addCyl('wash_tap', 'copper', 0.045, 0.045, 0.3, 6, -0.16, 1.18, -0.2, wash);
  addBox('wash_jug', 'terracotta', 0.22, 0.28, 0.22, 0.4, 1.13, 0.04, 0.3, wash);
  addBox('wash_mirror', 'glow_pane', 0.58, 0.7, 0.05, 0, 1.72, -0.26, 0, wash);
  addBox('wash_mirror_frame', 'brass', 0.68, 0.8, 0.03, 0, 1.72, -0.29, 0, wash);
  wash.position.copy(polar(140, R - 1.0));
  wash.rotation.y = RAD(140 + 180);
  g.add(wash);

  // duckboards, a stool, and a stack of folded towels
  for (let i = 0; i < 8; i++)
    arcBox('duckboard', i % 2 ? 'wood_mid' : 'wood_dark', 0.16, 0.06, 1.2, 232 + i * 3.2, 2.4, 0.05, g);
  const sp = polar(258, 2.2);
  addBox('bath_stool', 'wood_mid', 0.5, 0.09, 0.36, sp.x, 0.36, sp.z, RAD(258), g);
  for (const dx of [-0.18, 0.18]) addBox('stool_leg', 'wood_dark', 0.08, 0.34, 0.3, sp.x + dx, 0.17, sp.z, RAD(258), g);
  const tw = polar(246, 3.4);
  for (let i = 0; i < 3; i++)
    addBox('folded_towel', i === 1 ? 'cloth_red' : 'linen', 0.5, 0.13, 0.36, tw.x, 0.07 + i * 0.14, tw.z, RAD(246) + i * 0.06, g);

  // lanterns: the only light down here that is not the window
  for (const a of [120, 200, 280]) {
    const lp = polar(a, R - 0.62);
    addBox('lantern_body', 'glow_pane', 0.26, 0.34, 0.2, lp.x, 2.9, lp.z, RAD(a), g);
    addBox('lantern_cap', 'iron', 0.34, 0.07, 0.28, lp.x, 3.11, lp.z, RAD(a), g);
    addBox('lantern_bracket', 'iron', 0.1, 0.1, 0.3, lp.x, 2.9, lp.z, RAD(a), g);
    const pl = new THREE.PointLight(0xffc890, 5, 5.5, 2);
    pl.position.copy(polar(a, R - 1.1, 2.9));
    fg.add(pl);
  }

  /* The drain. It is also the reset: pulling the plug empties everything. */
  const drain = new THREE.Group(); drain.name = 'bath_drain';
  const dp = polar(300 + 180, 1.0);
  addCyl('drain_grate', 'brass', 0.22, 0.22, 0.05, 10, 0, 0.02, 0, drain);
  for (let i = 0; i < 4; i++) addBox('drain_bar', 'iron', 0.36, 0.03, 0.04, 0, 0.05, -0.12 + i * 0.08, 0, drain);
  addCyl('drain_chain', 'iron', 0.02, 0.02, 0.5, 5, 0.14, 0.28, 0, drain);
  addBox('drain_plug', 'wood_dark', 0.14, 0.08, 0.14, 0.14, 0.56, 0, 0, drain);
  drain.position.set(tpp.x + dp.x * 0.6, 0.05, tpp.z + dp.z * 0.6);
  g.add(drain);

  anim.bath = {
    water, stream, tap: tapG, lever: leverArm, tray, petals, steam,
    uVista, uT, vistaLight,
    fill: 0.62, filling: 0,
  };

  return { tub, tapG, cas, lever, pane, drain, wash, uVista, VISTAS };
}
