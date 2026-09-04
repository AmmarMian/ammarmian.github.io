import * as THREE from 'three';
import anime from 'animejs';
// Kept a static import on purpose. Loading the worlds lazily splits out a
// 22KB (gzipped) chunk but costs ~150KB in the entry chunk: installWorlds
// takes the whole THREE namespace as an argument, and once that namespace
// escapes across a lazy-chunk boundary Rollup can no longer prove which of
// three.js is unused, so it retains all of it. Measured, not assumed.
import { installWorlds } from '../worlds.js';
import { createStage } from './stage';
import { M } from './materials';
import { R, FH, WH, ROT, RAD, polar, landing, spiralStair } from './util';
import { F, NF, FLOOR_IDS, FLOOR_NAMES } from './scene-constants';
import { createAnim } from './anim';
import { buildQuarters } from './floors/quarters';
import { buildLibrary } from './floors/library';
import { buildLaboratory, CAULDRON_LOCAL } from './floors/laboratory';
import { buildObservatory } from './floors/observatory';
import { buildSanctum } from './floors/sanctum';
import { buildKitchen } from './floors/kitchen';
import { buildWizardMesh, createWizardController } from './wizard';
import { buildFoxMesh, createFoxState, foxDecide } from './fox';
import { makePoints, setBackdrop as setBackdropFx } from './fx';
import { createFocusController } from './focus';
import { createInteractionSystem } from './interactions';

export type TowerScene = ReturnType<typeof createTowerScene>;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Which floor the wizard is keeping himself busy on, by hour of day.
function stationForHour(hour: number): number {
  if (hour < 6) return F.quarters;      // deep night — asleep
  if (hour < 9) return F.kitchen;       // early — breakfast
  if (hour < 13) return F.library;      // morning — reading
  if (hour < 18) return F.lab;          // afternoon — the work
  if (hour < 22) return F.sanctum;      // evening — the portal
  return F.observatory;                 // late — stargazing
}

export function createTowerScene(container: HTMLElement, opts: { onNavigateFloor: (i: number) => void; onOpenDestinations: () => void }) {
  const { renderer, scene, camera, controls, setPixel, applyPixel, hemi, key, fill } = createStage(container);

  const model = new THREE.Group();
  const fx = new THREE.Group();
  const anim = createAnim();

  const STAIR_MATS = [
    ['stone_light', 'stone_warm'], ['wood_mid', 'wood_dark'], ['wood_mid', 'wood_deep'],
    ['wood_dark', 'wood_deep'], ['stone_light', 'stone_warm'],
  ] as const;

  const ringGeo = new THREE.TorusGeometry(R + 0.14, 0.09, 8, 48);
  const floors = FLOOR_IDS.map((id, k) => {
    const g = new THREE.Group(); g.name = id;
    g.position.y = k * FH; g.rotation.y = RAD(k * ROT);
    model.add(g);
    const fg = new THREE.Group();
    fg.position.copy(g.position); fg.rotation.copy(g.rotation);
    fx.add(fg);
    // A quiet selection glow around the platform edge — brightened on
    // hover, otherwise invisible, so it never competes with the scene.
    // depthTest is off and renderOrder high so it always reads clearly,
    // the way a game's selection ring ignores what's in front of it.
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6fd6ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    ring.renderOrder = 10;
    (ring.userData as any).target = 0;
    fg.add(ring);
    return { g, fg, name: FLOOR_NAMES[k], ring };
  });
  floors.forEach((f, k) => {
    landing(f.g, k >= F.lab ? 'stone' : 'wood_deep', k >= F.lab ? 'stone_light' : 'wood_mid');
    if (k < NF - 1) { const [a, b] = STAIR_MATS[k]; spiralStair(f.g, a, b); }
  });

  buildQuarters(floors[F.quarters].g, floors[F.quarters].fg, anim);
  buildLibrary(floors[F.library].g, floors[F.library].fg, anim);
  buildLaboratory(floors[F.lab].g, floors[F.lab].fg, anim);
  buildObservatory(floors[F.observatory].g, floors[F.observatory].fg, anim);
  buildSanctum(floors[F.sanctum].g, floors[F.sanctum].fg, anim);
  buildKitchen(floors[F.kitchen].g, floors[F.kitchen].fg, anim);

  const { wizard, handL, staffOrb } = buildWizardMesh();
  model.add(wizard);
  const wizardLight = new THREE.PointLight(0x8fd8ff, 6, 4.5, 2);
  fx.add(wizardLight);
  const wiz = createWizardController(NF);
  // Where he is depends on the hour, like anyone with a routine — placed
  // there directly, not walked there, so he's already mid-routine on load.
  wiz.placeAt(stationForHour(new Date().getHours()));

  const fox = buildFoxMesh();
  model.add(fox);
  const foxLight = new THREE.PointLight(0xffb070, 2.2, 2.6, 2);
  fx.add(foxLight);
  const foxState = createFoxState(wiz.stations[F.library]);

  /* place model at origin, attach fx rig */
  const box3 = new THREE.Box3().setFromObject(model);
  const c0 = box3.getCenter(new THREE.Vector3());
  model.position.set(-c0.x, -box3.min.y, -c0.z);
  fx.position.copy(model.position);
  scene.add(model);
  scene.add(fx);

  // Installed only once the model/fx groups are fully built — it snapshots
  // the light rig (set up in createStage, above) as the "no world" baseline
  // and patches every existing mesh's material for the teleport clip effect,
  // so meshes added afterward wouldn't get patched.
  const worlds = installWorlds({ THREE, scene, camera, model, fx, dims: { R, FH, NF, WH, ROT } });

  const TOP = FH * (NF - 1) + 2.5;
  const dust = makePoints(fx, 260, 0xffd9a8, 0.05, () => {
    const a = Math.random() * Math.PI * 2, r = Math.random() * (R - 0.6);
    return { x: Math.sin(a) * r, y: Math.random() * TOP, z: Math.cos(a) * r, v: 0.06 + Math.random() * 0.16 };
  });
  dust.m.material.opacity = 0.4;
  let dustLo = 0, dustHi = TOP;
  const cauldronWorld = CAULDRON_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), RAD(F.lab * ROT));
  cauldronWorld.y = F.lab * FH + 1.1;
  const bubbles = makePoints(fx, 110, 0x8dfba6, 0.1, () => ({
    x: cauldronWorld.x + (Math.random() - 0.5) * 0.7,
    y: cauldronWorld.y + Math.random() * 1.8,
    z: cauldronWorld.z + (Math.random() - 0.5) * 0.7,
    v: 0.4 + Math.random() * 0.5,
  }));

  const interactions = createInteractionSystem(model, floors);
  wireInteractables();

  const focus = createFocusController({
    camera, controls, model, floors, dust, bubbles, markerList: interactions.markerList,
    onDustRange: (lo, hi) => { dustLo = lo; dustHi = hi; },
  });

  interactions.wirePointer(renderer, camera, opts.onNavigateFloor, (fi) => {
    floors.forEach((f, i) => { (f.ring.userData as any).target = i === fi ? 0.85 : 0; });
  });

  function wireInteractables() {
    if (anim.dial) {
      const d = anim.dial;
      const dialRoot = d.wheel.parent!;
      interactions.interact(dialRoot, 'Scroll to a destination', () => {
        d.wheel.rotation.z -= (Math.PI * 2) / 7;
        (d.lever.userData as any).kick = 1;
        opts.onOpenDestinations();
      }, (e, t) => {
        const lv = anim.dial!.lever;
        if ((lv.userData as any).kick > 0) {
          (lv.userData as any).kick = Math.max(0, (lv.userData as any).kick - 0.02);
          lv.rotation.x = -Math.sin((1 - (lv.userData as any).kick) * Math.PI) * 0.7;
        } else lv.rotation.x = 0;
      });
      const portalRoot = floors[F.sanctum].g.getObjectByName('portal')!;
      interactions.interact(portalRoot, 'Step through the gate', () => {
        const p = anim.portal;
        if (p) { p.at = 4.2; p.flash = 1; }
      });
    }
    const q = floors[F.quarters].g;
    const flame = q.getObjectByName('candle_flame');
    if (flame) interactions.interact(flame, 'Pinch the candle out', (e) => { e.on = !e.on; flame.visible = !e.on; });
    const cat = q.getObjectByName('familiar_cat');
    if (cat) interactions.interact(cat, 'Scratch the cat', (e) => { e.t = 1.6; }, (e, t) => {
      const tail = cat.getObjectByName('cat_tail')!;
      tail.rotation.y = 0.5 + (e.t > 0 ? Math.sin(t * 12) * 0.5 : Math.sin(t * 1.2) * 0.08);
      cat.position.y = 0.86 + (e.t > 0 ? Math.abs(Math.sin(t * 6)) * 0.03 : 0);
    });
    const chest = q.getObjectByName('chest_lid');
    if (chest) interactions.interact(chest, 'Open the chest', (e) => { e.on = !e.on; }, (e, t, dt) => {
      chest.rotation.x += ((e.on ? -1.1 : 0) - chest.rotation.x) * Math.min(dt * 5, 1);
    });
    const tap = q.getObjectByName('tapestry_rod');
    if (tap) interactions.interact(tap, 'Straighten the tapestry', (e) => { e.t = 1.4; }, (e, t) => {
      tap.rotation.z = e.t > 0 ? Math.sin(t * 9) * 0.06 : 0;
    });

    const lib = floors[F.library].g;
    const globe = lib.getObjectByName('globe_sphere');
    if (globe) interactions.interact(globe, 'Spin the globe', (e) => { e.t = 3.0; }, (e, t, dt) => {
      globe.rotation.y += (e.t > 0 ? 4.5 : 0.25) * dt;
    });
    const lect = lib.getObjectByName('lectern');
    if (lect) interactions.interact(lect, 'Read the grimoire', (e) => { e.t = 3.0; }, (e, t) => {
      const gr = lect.getObjectByName('grimoire')!;
      gr.position.y = 1.4 + (e.t > 0 ? 0.5 + Math.sin(t * 3) * 0.06 : 0);
      gr.rotation.y += (e.t > 0 ? 1.2 : 0) * 0.016;
    });
    const lad = lib.getObjectByName('library_ladder');
    if (lad) interactions.interact(lad, 'Slide the ladder', (e) => { e.t = 2.2; }, (e, t) => {
      lad.rotation.y = RAD(214) + (e.t > 0 ? Math.sin(e.t * 3) * 0.5 : 0);
    });
    const cc2 = lib.getObjectByName('card_catalogue');
    if (cc2) interactions.interact(cc2, 'Search the catalogue', (e) => { e.t = 2.4; }, (e, t, dt) => {
      cc2.rotation.y += (e.t > 0 ? 1.6 : 0) * dt;
    });

    const lab = floors[F.lab].g;
    const cauldron = lab.getObjectByName('cauldron_belly');
    if (cauldron) interactions.interact(cauldron, 'Stoke the cauldron', (e) => { e.t = 3.5; }, (e) => {
      (bubbles as any).boost = e.t > 0 ? 2.6 : 1;
      (M.brew as any).emissiveIntensity = e.t > 0 ? 1.4 : 0.6;
    });
    const spell = lab.getObjectByName('spell_circle');
    if (spell) interactions.interact(spell, 'Charge the circle', (e) => { e.t = 2.6; }, (e) => {
      const sc = e.t > 0 ? 1 + Math.sin(e.t * 6) * 0.12 : 1;
      spell.scale.setScalar(sc);
      spell.children.forEach((c: any) => {
        if (c.material) { c.userData.baseOp ??= c.material.opacity; c.material.opacity = c.userData.baseOp * (e.t > 0 ? 2.2 : 1); }
      });
    });
    const still = lab.getObjectByName('distillery');
    if (still) interactions.interact(still, 'Run the still', (e) => { e.t = 3.2; }, (e, t, dt) => {
      still.rotation.y += (e.t > 0 ? 1.6 : 0) * dt;
    });
    const hg = lab.getObjectByName('hourglass_upper');
    if (hg) interactions.interact(hg, 'Turn the hourglass', (e) => { e.t = 2.0; }, (e, t) => {
      hg.rotation.z = e.t > 0 ? Math.sin(e.t * 4) * 0.5 : 0;
    });

    const obs = floors[F.observatory].g;
    const bell = obs.getObjectByName('bell');
    if (bell) interactions.interact(bell, 'Ring the bell', (e) => { e.t = 2.8; }, (e, t) => {
      const cl = obs.getObjectByName('bell_clapper');
      if (cl) cl.position.x = bell.position.x + (e.t > 0 ? Math.sin(t * 16) * 0.09 * Math.min(e.t, 1) : 0);
      bell.rotation.z = e.t > 0 ? Math.sin(t * 8) * 0.1 * Math.min(e.t, 1) : 0;
    });
    const scope = obs.getObjectByName('telescope_tube_assembly');
    if (scope) interactions.interact(scope, 'Look through the telescope', (e) => {
      e.t = 2.2;
      worlds.teleport(worlds.current() === 'space' ? null : 'space');
    }, (e, t) => {
      scope.rotation.x = -0.62 + (e.t > 0 ? Math.sin(t * 2.2) * 0.35 : 0);
    });
    const orr = obs.getObjectByName('orrery');
    if (orr) interactions.interact(orr, 'Wind the orrery', (e) => { e.t = 3.4; }, (e, t, dt) => {
      orr.rotation.y += (e.t > 0 ? 1.6 : 0) * dt;
    });
    const arm2 = obs.getObjectByName('armillary');
    if (arm2) interactions.interact(arm2, 'Set the armillary', (e) => { e.t = 3.0; }, (e, t, dt) => {
      arm2.rotation.y += (e.t > 0 ? 1.6 : 0) * dt;
    });

    const kt = floors[F.kitchen].g;
    if (anim.spirit) {
      const spirit = anim.spirit.g;
      interactions.interact(spirit, 'Say hello to the fire', (e) => { e.t = 3.2; }, (e, t) => {
        anim.spirit!.mouth.scale.y = e.t > 0 ? 1 + Math.abs(Math.sin(t * 12)) * 2.4 : 1;
        anim.spirit!.g.scale.setScalar(e.t > 0 ? 1.15 : 1);
      });
    }
    const soup = kt.getObjectByName('soup_pot');
    if (soup) interactions.interact(soup, 'Stir the soup', (e) => { e.t = 2.6; }, (e, t) => {
      const ld = kt.getObjectByName('ladle');
      if (ld) ld.rotation.y = e.t > 0 ? t * 5 : 0;
    });
    const kettle = kt.getObjectByName('kettle');
    if (kettle) interactions.interact(kettle, 'Put the kettle on', (e) => { e.t = 3.0; }, (e, t) => {
      kettle.rotation.z = e.t > 0 ? Math.sin(t * 12) * 0.06 : 0;
    });
    const broom = kt.getObjectByName('broom_handle');
    if (broom) interactions.interact(broom, 'Set the broom sweeping', (e) => { e.t = 3.4; }, (e, t) => {
      broom.rotation.z = 0.16 + (e.t > 0 ? Math.sin(t * 7) * 0.35 : 0);
      broom.position.y = 0.95 + (e.t > 0 ? Math.abs(Math.sin(t * 7)) * 0.2 : 0);
    });
    const rack = kt.getObjectByName('pot_rack');
    if (rack) interactions.interact(rack, 'Rattle the pots', (e) => { e.t = 1.8; }, (e, t) => {
      rack.rotation.z = e.t > 0 ? Math.sin(t * 14) * 0.04 : 0;
    });

    interactions.interact(fox, 'Pet the fox', (e) => { e.t = 3.0; foxState.mode = 'sniff'; foxState.timer = 4; }, (e, t) => {
      if (e.t > 0) { (fox.userData as any).tail.rotation.y = Math.sin(t * 14) * 0.7; foxState.timer = Math.max(foxState.timer, 1.5); }
    });
  }

  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const _wp = new THREE.Vector3(), _wt = new THREE.Vector3();
  const _fp = new THREE.Vector3(), _ft = new THREE.Vector3();

  function tick(t: number, dt: number) {
    const dp = dust.pos;
    for (let i = 0; i < dp.length; i += 3) {
      dp[i + 1] += dust.vel[i / 3] * dt * 0.5;
      dp[i] += Math.sin(t * 0.4 + i) * dt * 0.06;
      dp[i + 2] += Math.cos(t * 0.33 + i) * dt * 0.06;
      if (dp[i + 1] > dustHi) dp[i + 1] = dustLo;
      else if (dp[i + 1] < dustLo) dp[i + 1] = dustLo;
    }
    dust.m.geometry.attributes.position.needsUpdate = true;

    const bp = bubbles.pos;
    for (let i = 0; i < bp.length; i += 3) {
      bp[i + 1] += bubbles.vel[i / 3] * dt * (bubbles.boost || 1);
      bp[i] += Math.sin(t * 2 + i) * dt * 0.1;
      if (bp[i + 1] > cauldronWorld.y + 2.4) {
        bp[i + 1] = cauldronWorld.y;
        bp[i] = cauldronWorld.x + (Math.random() - 0.5) * 0.6;
        bp[i + 2] = cauldronWorld.z + (Math.random() - 0.5) * 0.6;
      }
    }
    bubbles.m.geometry.attributes.position.needsUpdate = true;

    wiz.update(dt, () => {});
    const p = wiz.pathPoint(wiz.wizAt, _wp, _wt);
    wizard.position.set(p.x, p.y + (Math.abs(Math.sin(t * 6)) * 0.045), p.z);
    if (_wt.lengthSq() > 1e-6) {
      const want = Math.atan2(_wt.x, _wt.z);
      let dd = want - wizard.rotation.y;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      wizard.rotation.y += dd * Math.min(dt * 5, 1);
    }
    const wizFloor = Math.max(0, Math.min(NF - 1, Math.floor((p.y + 0.5) / FH)));
    wizard.visible = floors[wizFloor].g.visible;
    wizardLight.visible = wizard.visible;
    wizardLight.position.set(p.x, p.y + 2.1, p.z).add(model.position);
    wizardLight.intensity = 5 + Math.sin(t * 2.2) * 1.2;

    for (const it of anim.books) {
      const a = it.a0 + t * it.sp;
      it.o.position.set(it.c.x + Math.cos(a) * it.r, it.y + Math.sin(t * 1.3 + it.a0) * 0.22, it.c.z + Math.sin(a) * it.r);
      if (it.face) it.o.rotation.y = -a + Math.PI / 2;
      else if (it.tilt) it.o.rotation.set(Math.sin(t + it.a0) * 0.2, -a, Math.cos(t * 0.8 + it.a0) * 0.2);
      else it.o.rotation.set(Math.sin(t * 0.9 + it.a0) * 0.18, -a + Math.PI / 2, Math.sin(t * 1.4 + it.a0) * 0.12);
    }
    for (const it of anim.rings) {
      if (it.spin) it.o.rotation.z = (it.o.rotation.z || 0) + it.spin * dt;
      if (it.bob) it.o.position.y = 2.5 + Math.sin(t * 0.9) * it.bob;
      if (it.phase !== undefined) {
        const k = 0.55 + 0.45 * Math.sin(t * 2 + it.phase);
        it.o.scale.setScalar(0.8 + k * 0.4);
      }
    }
    if (anim.portal) {
      const p2 = anim.portal;
      p2.at += dt;
      const dwell = 4.2, fade = 0.7;
      const cur = p2.worlds[p2.i % p2.worlds.length];
      const nxt = p2.worlds[(p2.i + 1) % p2.worlds.length];
      cur.g.visible = true;
      if (p2.at > dwell) {
        const u = Math.min((p2.at - dwell) / fade, 1);
        nxt.g.visible = true;
        cur.g.scale.setScalar(1 - u); nxt.g.scale.setScalar(u);
        if (u >= 1) { cur.g.visible = false; cur.g.scale.setScalar(1); p2.i++; p2.at = 0; }
      } else {
        cur.g.scale.setScalar(1);
        for (const w of p2.worlds) if (w !== cur) w.g.visible = false;
      }
      if (p2.flash && p2.flash > 0) {
        p2.flash = Math.max(0, p2.flash - dt * 1.6);
        const rim = floors[F.sanctum].g.getObjectByName('portal_rim') as any;
        const halo2 = floors[F.sanctum].g.getObjectByName('portal_halo') as any;
        if (rim) rim.material.emissiveIntensity = 1.1 + p2.flash * 4;
        if (halo2) halo2.material.opacity = 0.13 + p2.flash * 0.4;
      }
    }

    if (anim.spirit) {
      const sp2 = anim.spirit;
      sp2.tongues.forEach((tg, i) => {
        tg.scale.y = 0.7 + Math.abs(Math.sin(t * 6 + i)) * 0.7;
        tg.position.x = Math.sin(i * 1.7 + t * 2.4) * 0.13;
        (tg.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.abs(Math.sin(t * 5 + i * 0.7)) * 0.4;
      });
      sp2.core.scale.set(1 + Math.sin(t * 4) * 0.05, 1 + Math.sin(t * 5.3) * 0.07, 1);
      sp2.g.position.y = 0.55 + Math.sin(t * 1.6) * 0.04;
      if (anim.fireLight) anim.fireLight.intensity = 13 + Math.sin(t * 7) * 2.5 + Math.sin(t * 13) * 1.2;
    }

    /* fox AI */
    foxState.timer -= dt;
    if (foxState.mode === 'travel') {
      const fgoal = wiz.stations[foxState.target];
      const fstep = wiz.advance(foxState.at, fgoal, 2.6, dt);
      foxState.at = fstep.at;
      if (!fstep.moving) { foxDecide(foxState, NF); }
    } else if (foxState.timer <= 0) foxDecide(foxState, NF);

    const fp = wiz.pathPoint(foxState.at, _fp, _ft);
    const trotting = foxState.mode === 'travel';
    fox.position.set(fp.x, fp.y, fp.z);
    if (trotting && _ft.lengthSq() > 1e-6) {
      const want = Math.atan2(_ft.x, _ft.z);
      let dd = want - fox.rotation.y;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      fox.rotation.y += dd * Math.min(dt * 6, 1);
    }
    const { legs, tail } = fox.userData as any;
    if (trotting) {
      legs.forEach((lg: THREE.Mesh, i: number) => { lg.rotation.x = Math.sin(t * 11 + i * Math.PI / 2) * 0.5; });
      fox.position.y = fp.y + Math.abs(Math.sin(t * 11)) * 0.04;
      tail.rotation.y = Math.sin(t * 6) * 0.35;
      fox.scale.set(1, 1, 1);
    } else if (foxState.mode === 'sleep') {
      legs.forEach((lg: THREE.Mesh) => { lg.rotation.x = 1.4; });
      fox.scale.set(1.06, 0.7, 0.92);
      fox.position.y = fp.y - 0.02;
      tail.rotation.y = 1.5 + Math.sin(t * 0.7) * 0.1;
    } else if (foxState.mode === 'play') {
      legs.forEach((lg: THREE.Mesh, i: number) => { lg.rotation.x = Math.sin(t * 9 + i) * 0.8; });
      fox.position.y = fp.y + Math.abs(Math.sin(t * 5)) * 0.3;
      fox.rotation.y += dt * 2.4;
      tail.rotation.y = Math.sin(t * 10) * 0.6;
      fox.scale.set(1, 1, 1);
    } else if (foxState.mode === 'read') {
      legs.forEach((lg: THREE.Mesh) => { lg.rotation.x = 0.9; });
      fox.scale.set(1, 0.86, 1);
      fox.rotation.x = 0.12;
      tail.rotation.y = Math.sin(t * 1.5) * 0.2;
    } else {
      legs.forEach((lg: THREE.Mesh) => { lg.rotation.x = 0; });
      fox.scale.set(1, 1, 1);
      fox.rotation.x = Math.sin(t * 2) * 0.1;
      fox.rotation.y += dt * 0.5;
      tail.rotation.y = Math.sin(t * 3) * 0.3;
    }
    const foxFloor = Math.max(0, Math.min(NF - 1, Math.floor((fp.y + 0.5) / FH)));
    fox.visible = floors[foxFloor].g.visible;
    foxLight.visible = fox.visible;
    foxLight.position.copy(fp).add(model.position).add(new THREE.Vector3(0, 0.5, 0));

    for (const f of floors) {
      const mat = f.ring.material as THREE.MeshBasicMaterial;
      mat.opacity += ((f.ring.userData as any).target - mat.opacity) * Math.min(dt * 8, 1);
    }

    interactions.tick(t, dt);
  }

  // A finer 2px grid reads cleanly across the whole tower from afar; once
  // the camera closes in on a floor the chunkier 4px grid suits the
  // close-up pixel-art look better. Hysteresis keeps it from flickering
  // right at the boundary. minDistance/maxDistance are 5.5/48, and a
  // single-floor view sits around 15-18, so the band straddles that gap.
  let pixelNear = true;
  // Pinned by the console's `pixel` command; null hands the choice back to
  // the distance rule below.
  let pixelOverride: number | null = null;
  function autoPixel() {
    if (pixelOverride !== null) return;
    const dist = camera.position.distanceTo(controls.target);
    const wantNear = pixelNear ? dist < 27 : dist < 23;
    if (wantNear !== pixelNear) { pixelNear = wantNear; setPixel(pixelNear ? 4 : 2); }
  }
  function setPixelMode(scale: number | null) {
    pixelOverride = scale;
    if (scale === null) {
      const dist = camera.position.distanceTo(controls.target);
      pixelNear = dist < 25;
      setPixel(pixelNear ? 4 : 2);
    } else setPixel(scale);
    return pixelOverride;
  }

  /* The idle turntable only ever swung the camera around the tower's waist.
     A very slow rise and fall on top of it makes the whole silhouette read
     — you see the roof, then the base — without ever feeling like motion
     you have to wait out. Roughly a minute per cycle, and it yields the
     instant the visitor takes the wheel (OrbitControls' own 'start' event
     clears autoRotate). */
  const _drift = new THREE.Spherical(), _driftV = new THREE.Vector3();
  let driftPhase = 0, driftBasePhi = 0, drifting = false;
  function idleDrift(dt: number) {
    if (!controls.autoRotate || reducedMotion()) { drifting = false; return; }
    _driftV.copy(camera.position).sub(controls.target);
    _drift.setFromVector3(_driftV);
    if (!drifting) { driftBasePhi = _drift.phi; driftPhase = 0; drifting = true; }
    driftPhase += dt;
    _drift.phi = THREE.MathUtils.clamp(
      driftBasePhi + Math.sin(driftPhase * 0.105) * 0.17,
      controls.minPolarAngle + 0.03,
      controls.maxPolarAngle - 0.03,
    );
    camera.position.copy(controls.target).add(_driftV.setFromSpherical(_drift));
    camera.lookAt(controls.target);
  }

  let raf = 0, t0 = performance.now(), running = false, contextLost = false;
  function loop(now: number) {
    const dt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    tick(now / 1000, dt);
    worlds.tick(now / 1000, dt);
    autoPixel();
    controls.update();
    idleDrift(dt);
    if (!contextLost) renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  function resume() {
    if (running) return;
    running = true;
    // Without this the first frame back sees the whole hidden interval as
    // one dt and every animation lurches forward.
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function pause() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  // A backgrounded tab has nothing to show and no reason to keep a GPU busy;
  // browsers throttle rAF but don't stop it, and this scene is not cheap.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause(); else resume();
  });

  // A GPU reset — waking a laptop from sleep is the usual cause — otherwise
  // leaves a permanently black canvas with no hint that anything is wrong.
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    contextLost = true;
    document.body.dataset.glLost = '1';
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    delete document.body.dataset.glLost;
    // Every compiled program and uploaded buffer went with the context;
    // three.js re-uploads lazily, but materials need to be told to recompile.
    scene.traverse((o: any) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) m.needsUpdate = true;
    });
    applyPixel();
  });

  // A soft day/night wash on the stage lighting, driven by the visitor's
  // own clock — brightest at 13:00, dimmest and bluest at 01:00.
  //
  // Those three lights are also what a backdrop world takes over when one
  // is active, so this must not write to them while a world holds them —
  // it used to, on a five-minute timer, which silently reverted every
  // world's carefully-set rig a few minutes after arriving. Instead the
  // wash owns the no-world case only, and hands its result to the world
  // system as the baseline to restore when the visitor comes home.
  const HEMI_SKY_DAY = new THREE.Color(0x9fb0ff), HEMI_SKY_NIGHT = new THREE.Color(0x1a2040);
  const HEMI_GROUND_DAY = new THREE.Color(0x2a2038), HEMI_GROUND_NIGHT = new THREE.Color(0x0c0d1a);
  const KEY_DAY = new THREE.Color(0xffffff), KEY_NIGHT = new THREE.Color(0x8fa8ff);
  // 'auto' follows the clock; the console can pin it either way.
  let lightMode: 'auto' | 'day' | 'night' = 'auto';

  function nightAmount() {
    if (lightMode === 'day') return 0;
    if (lightMode === 'night') return 1;
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    return 0.5 - 0.5 * Math.cos(((hour - 13 + 24) % 24) / 24 * Math.PI * 2);
  }

  function applyDayNight() {
    if (worlds.current()) return;   // a world owns the rig — leave it alone
    const night = nightAmount();
    hemi.color.copy(HEMI_SKY_DAY).lerp(HEMI_SKY_NIGHT, night);
    hemi.groundColor.copy(HEMI_GROUND_DAY).lerp(HEMI_GROUND_NIGHT, night);
    hemi.intensity = THREE.MathUtils.lerp(0.34, 0.13, night);
    key.color.copy(KEY_DAY).lerp(KEY_NIGHT, night);
    key.intensity = THREE.MathUtils.lerp(1.15, 0.32, night);
    fill.intensity = THREE.MathUtils.lerp(0.5, 0.2, night);
    // What the lights read now *is* the no-world baseline. Without this the
    // world system would keep restoring whatever the rig happened to hold
    // when it was installed, before the clock had ever been consulted.
    worlds.rebase();
  }

  function setLightMode(mode: 'auto' | 'day' | 'night') {
    lightMode = mode;
    applyDayNight();
    return lightMode;
  }

  // Coming home from a world: the world system has just restored the
  // baseline, and the clock may have moved on considerably since it was
  // taken. Re-derive it from the current hour.
  window.addEventListener('lair-teleport', (e: any) => {
    if (e.detail?.phase === 'done' && !worlds.current()) applyDayNight();
  });

  function start() {
    try {
      const savedBackdrop = localStorage.getItem('lair-backdrop') as any;
      setBackdropFx(scene, savedBackdrop || 'blueprint');
    } catch { setBackdropFx(scene, 'blueprint'); }
    setPixel(4);
    applyDayNight();
    window.setInterval(applyDayNight, 5 * 60 * 1000);
    resume();
  }
  function stop() { pause(); }

  /** The tower rises out of the ground one floor at a time — each group's
   *  local origin sits at its own floor's base, so scaling it up from the
   *  Y axis alone reads as that storey growing into place. The camera
   *  pulls back over the same span to the standard whole-tower framing, so
   *  it keeps following the rising top instead of sitting fixed at ground
   *  level watching nothing happen. Skips straight to the finished state
   *  under reduced motion. */
  function playIntro(): Promise<void> {
    // Measured against the fully-built model, before it gets squashed down
    // to start the reveal — this is the same framing focusFloor(null) uses.
    const box = new THREE.Box3().setFromObject(model);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sph.radius / Math.tan((camera.fov * Math.PI) / 360)) * 1.25;
    const dir = new THREE.Vector3(1, 0.5, 1.2).normalize();
    const camTarget = sph.center.clone();
    const camPos = camTarget.clone().addScaledVector(dir, dist);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      floors.forEach(({ g, fg }) => { g.visible = true; fg.visible = true; g.scale.set(1, 1, 1); fg.scale.set(1, 1, 1); });
      camera.position.copy(camPos);
      controls.target.copy(camTarget);
      controls.update();
      return Promise.resolve();
    }

    floors.forEach(({ g, fg }) => {
      g.visible = false; fg.visible = false;
      g.scale.set(1, 0.02, 1); fg.scale.set(1, 0.02, 1);
    });

    const perFloor = 560, overlap = 200;
    const total = perFloor + (floors.length - 1) * (perFloor - overlap);
    controls.enabled = false;
    anime({ targets: camera.position, x: camPos.x, y: camPos.y, z: camPos.z, duration: total, easing: 'easeInOutQuad' });
    anime({ targets: controls.target, x: camTarget.x, y: camTarget.y, z: camTarget.z, duration: total, easing: 'easeInOutQuad', update: () => controls.update() });

    return new Promise((resolve) => {
      const tl = anime.timeline({
        easing: 'easeOutQuint',
        complete: () => { controls.enabled = true; resolve(); },
      });
      floors.forEach(({ g, fg }, i) => {
        tl.add({
          begin: () => { g.visible = true; fg.visible = true; },
          targets: [g.scale, fg.scale],
          y: 1, duration: perFloor,
        }, i === 0 ? 0 : `-=${overlap}`);
      });
    });
  }

  const SHELF_ROW_Y = [0.95, 1.62, 2.29, 2.96, 3.63, 4.3];

  /** Fly the camera to look closely at a specific shelf slot — both points
   *  are worked out in the library floor's own local space, then carried
   *  through its world matrix together so the rotation offset between
   *  floors doesn't need handling separately. */
  async function focusShelf(shelf: { band: number; angle: number; row: number } | undefined) {
    if (!shelf) return;
    const lib = floors[F.library].g;
    lib.updateMatrixWorld(true);
    const y = SHELF_ROW_Y[shelf.row] ?? 1.62;
    const localShelf = polar(shelf.angle, R - 0.56, y);
    const localCam = polar(shelf.angle, R - 0.56 - 2.1, y + 0.55);
    const worldShelf = localShelf.clone().applyMatrix4(lib.matrixWorld);
    const worldCam = localCam.clone().applyMatrix4(lib.matrixWorld);
    await focus.flyTo(worldCam, worldShelf, 1400);
  }

  async function pluckBook(shelf: { band: number; angle: number; row: number } | undefined) {
    // Visual flourish: a small book detaches from the shelf toward the wizard's hand.
    if (!shelf) return;
    const lib = floors[F.library].g;
    const y = SHELF_ROW_Y[shelf.row] ?? 1.62;
    const start = polar(shelf.angle, R - 0.56, y + 0.2);
    const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.3), M.cloth_red_dark);
    bookMesh.position.copy(start);
    lib.add(bookMesh);
    await new Promise<void>((resolve) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { lib.remove(bookMesh); resolve(); return; }
      anime({
        targets: bookMesh.position,
        x: start.x * 0.3, y: start.y - 1.5, z: start.z * 0.3,
        duration: 700, easing: 'easeInOutQuad',
        complete: () => { lib.remove(bookMesh); resolve(); },
      });
    });
  }

  return {
    renderer, scene, camera, controls,
    floors, floorNames: floors.map((f) => f.name),
    worlds,
    focusFloor: focus.focusFloor,
    setPanelOpen: focus.setPanelOpen,
    reframe: focus.reframe,
    sendWizard: wiz.sendWizard,
    stepWizard: wiz.stepWizard,
    setBackdrop: (kind: any) => setBackdropFx(scene, kind),
    setPixel,
    setPixelMode,
    setLightMode,
    lightMode: () => lightMode,
    setAutoRotate: (on: boolean) => { controls.autoRotate = on; return on; },
    autoRotate: () => controls.autoRotate as boolean,
    pluckBook,
    focusShelf,
    playIntro,
    F, NF,
    start, stop,
  };
}
