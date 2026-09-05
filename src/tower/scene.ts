import * as THREE from 'three';
import anime from 'animejs';
// worlds.js now imports three itself rather than being handed the namespace,
// which is what previously defeated tree-shaking across a chunk boundary (see
// the note at the top of that file). Still imported statically here: the scene
// touches the world system in its constructor — the shell's window pane is
// registered with the ambience before the first frame — so making it lazy is a
// separate change with an async seam through it, not a one-line swap.
import { installWorlds } from '../worlds.js';
import { createStage } from './stage';
import { M, SPINE_STEPS } from './materials';
import { R, FH, WH, ROT, RAD, polar, landing, spiralStair, addBox } from './util';
import { F, NF, GROUND, NF_ABOVE, floorY, FLOOR_IDS, FLOOR_NAMES } from './scene-constants';
import { createAnim } from './anim';
import { buildQuarters } from './floors/quarters';
import { buildLibrary } from './floors/library';
import { buildLaboratory, CAULDRON_LOCAL } from './floors/laboratory';
import { buildObservatory } from './floors/observatory';
import { buildSanctum } from './floors/sanctum';
import { buildKitchen } from './floors/kitchen';
import { buildBathhouse, VISTAS, type Vista } from './floors/bathhouse';
import { buildWizardMesh, createWizardController } from './wizard';
import { buildFoxMesh, createFoxState, foxDecide } from './fox';
import { makePoints, setBackdrop as setBackdropFx, suppressBackdrop } from './fx';
import { createFocusController } from './focus';
import { createQuality, gpuInfo, gpuSummary, type Tier, type Profile } from './quality';
import { createInteractionSystem } from './interactions';
import { addFloorFill, registerInteriorLights, applyAmbience, addFlameLights, interiorGain, registerShellPane,
         registerLamp, setOccupiedFloor, tickLamps, NO_DAYNIGHT, clampNight,
         cullLights, setLightTarget, lightBudget, setLightBudget } from './ambience';

export type TowerScene = ReturnType<typeof createTowerScene>;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Which floor the wizard is keeping himself busy on, by hour of day.
function stationForHour(hour: number): number {
  if (hour < 6) return F.quarters;      // deep night — asleep
  if (hour < 7) return F.bath;          // first thing — the bathhouse
  if (hour < 9) return F.kitchen;       // early — breakfast
  if (hour < 13) return F.library;      // morning — reading
  if (hour < 18) return F.lab;          // afternoon — the work
  if (hour < 22) return F.sanctum;      // evening — the portal
  return F.observatory;                 // late — stargazing
}

export function createTowerScene(container: HTMLElement, opts: {
  onNavigateFloor: (i: number) => void;
  onOpenDestinations: () => void;
  /** the plug in the bath cellar — the host decides what "clean" means */
  onReset?: () => void;
}) {
  const onResetRequest = opts.onReset;
  /* Chosen before the context exists, because antialias cannot be changed
     after it does. Everything else the tier decides is applied in
     applyQuality() below, and can move at any time. */
  const quality = createQuality();
  const { renderer, scene, camera, controls, setPixel, applyPixel, setMaxPixelRatio, hemi, key, fill } =
    createStage(container, quality.profile());

  const model = new THREE.Group();
  const fx = new THREE.Group();
  const anim = createAnim();

  // one pair per flight, so NF - 1 of them
  const STAIR_MATS = [
    ['stone_light', 'stone_warm'], ['wood_mid', 'wood_dark'], ['tile_pale', 'tile_deep'],
    ['wood_mid', 'wood_deep'], ['wood_dark', 'wood_deep'], ['stone_light', 'stone_warm'],
  ] as const;

  const ringGeo = new THREE.TorusGeometry(R + 0.14, 0.09, 8, 48);
  const floors = FLOOR_IDS.map((id, k) => {
    const g = new THREE.Group(); g.name = id;
    g.position.y = floorY(k); g.rotation.y = RAD(k * ROT);
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
    // Something to see by once the tower leaves a sunlit world — driven by
    // ambience.ts, silent (intensity 0) in broad daylight.
    addFloorFill(fg);
    return { g, fg, name: FLOOR_NAMES[k], ring };
  });
  floors.forEach((f, k) => {
    landing(f.g, k >= F.lab ? 'stone' : 'wood_deep', k >= F.lab ? 'stone_light' : 'wood_mid');
    if (k < NF - 1) { const [a, b] = STAIR_MATS[k]; spiralStair(f.g, a, b); }
  });

  buildQuarters(floors[F.quarters].g, floors[F.quarters].fg, anim);
  const library = buildLibrary(floors[F.library].g, floors[F.library].fg, anim);
  const laboratory = buildLaboratory(floors[F.lab].g, floors[F.lab].fg, anim);
  const observatory = buildObservatory(floors[F.observatory].g, floors[F.observatory].fg, anim);
  const sanctum = buildSanctum(floors[F.sanctum].g, floors[F.sanctum].fg, anim);
  const kitchen = buildKitchen(floors[F.kitchen].g, floors[F.kitchen].fg, anim);
  const bathhouse = buildBathhouse(floors[F.bath].g, floors[F.bath].fg, anim);

  const { wizard, handL, staffOrb } = buildWizardMesh();
  model.add(wizard);
  const wizardLight = new THREE.PointLight(0x8fd8ff, 6, 4.5, 2);
  wizardLight.name = 'wizard_light';
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
  let routineTimer = 6, wizBusy = false;

  /* Place the model at the origin. Vertically it is pinned by the *ground*
     storey, not by the model's lowest point: the bath cellar hangs below that,
     and measuring from the bottom of the model would push the whole tower up
     out of the ground by a full storey. */
  const box3 = new THREE.Box3().setFromObject(model);
  const c0 = box3.getCenter(new THREE.Vector3());
  const groundBox = new THREE.Box3().setFromObject(floors[GROUND].g);
  model.position.set(-c0.x, -groundBox.min.y, -c0.z);
  fx.position.copy(model.position);
  scene.add(model);
  scene.add(fx);

  // Installed only once the model/fx groups are fully built — it snapshots
  // the light rig (set up in createStage, above) as the "no world" baseline
  // and patches every existing mesh's material for the teleport clip effect,
  // so meshes added afterward wouldn't get patched.
  // the shell is built from the storeys above ground only
  const worlds = installWorlds({ scene, camera, model, fx, dims: { R, FH, NF: NF_ABOVE, WH, ROT, GROUND }, nightFor: clampNight });

  // Every candle, brazier and hearth the floor builders placed, so the
  // day/night wash can bring them up as the outside goes dark...
  registerInteriorLights(fx);
  // ...and a light for every flame that had none. Done after the sweep above
  // so it can see which ones were already spoken for.
  addFlameLights(floors, [M.flame]);
  // the shell's own window panes answer to the same sky as the interior ones
  registerShellPane(worlds.shellPaneMaterial());

  const TOP = floorY(NF - 1) + 2.5;
  const dust = makePoints(fx, 260, 0xffd9a8, 0.05, () => {
    const a = Math.random() * Math.PI * 2, r = Math.random() * (R - 0.6);
    return { x: Math.sin(a) * r, y: Math.random() * TOP, z: Math.cos(a) * r, v: 0.06 + Math.random() * 0.16 };
  });
  dust.m.material.opacity = 0.4;
  let dustLo = 0, dustHi = TOP;
  const cauldronWorld = CAULDRON_LOCAL.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), RAD(F.lab * ROT));
  cauldronWorld.y = floorY(F.lab) + 1.1;
  const bubbles = makePoints(fx, 110, 0x8dfba6, 0.1, () => ({
    x: cauldronWorld.x + (Math.random() - 0.5) * 0.7,
    y: cauldronWorld.y + Math.random() * 1.8,
    z: cauldronWorld.z + (Math.random() - 0.5) * 0.7,
    v: 0.4 + Math.random() * 0.5,
  }));

  /* Wisps. Small, slow, warm lights that drift up through the tower after
     dark and are gone by morning — the one piece of this place that is purely
     atmosphere and answers to nothing. They rise on a lazy helix rather than
     straight up, because straight up reads as an effect and a helix reads as
     something alive. Faded right out in daylight, so they cost nothing to
     look at when they would only be clutter. */
  const WISPS = 40;
  const wisps = makePoints(fx, WISPS, 0xffd08a, 0.13, () => {
    const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * (R - 1.4);
    return { x: Math.sin(a) * r, y: Math.random() * TOP, z: Math.cos(a) * r, v: 0.12 + Math.random() * 0.3 };
  });
  wisps.m.material.opacity = 0;
  const wispPhase = new Float32Array(WISPS);
  const wispRad = new Float32Array(WISPS);
  for (let i = 0; i < WISPS; i++) {
    wispPhase[i] = Math.random() * 6.283;
    wispRad[i] = Math.hypot(wisps.pos[i * 3], wisps.pos[i * 3 + 2]);
  }

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
    if (bathhouse.lever) {
      interactions.interact(bathhouse.lever, 'Throw the lever — change the view', () => { setVista('toggle'); });
    }
    if (sanctum.trap) {
      /* Through the host, not straight to the camera. The cellar has its own
         route now, and moving the camera behind the router's back leaves the
         URL claiming you are still where you were — which is what made Home
         do nothing at all once you were down here. */
      interactions.interact(sanctum.trap, 'Down to the bath cellar', () => { opts.onNavigateFloor(F.bath); });
    }
    if (bathhouse.drain) {
      /* Pulling the plug empties the tower as well as the bath: it is the one
         object in the building that undoes things, so it is the honest place
         to put a reset. Confirmed first — it discards saved preferences. */
      interactions.interact(bathhouse.drain, 'Pull the plug — wash everything clean', () => {
        onResetRequest?.();
      });
    }
    if (bathhouse.tapG) {
      interactions.interact(bathhouse.tapG, 'Run the bath', () => {
        if (anim.bath) anim.bath.filling = Math.max(anim.bath.filling, 6);
      });
    }

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
    /* The grimoire is the one book in the tower that is not a publication,
       and it is the book about the tower — so it holds the colophon. It used
       to lift, turn and say nothing at all, which is a poor thing for an
       object whose hover text is "Read the grimoire". */
    const lect = lib.getObjectByName('lectern');
    if (lect) interactions.interact(lect, 'Read the grimoire — how this was built', () => {
      grimoireLift = 3.0;
      onColophonRequest?.();
    }, (_e, t, dt) => {
      // The system decays its own entry timers; this one is ours, because the
      // panel raises it as well as the click does.
      if (grimoireLift > 0) grimoireLift = Math.max(0, grimoireLift - dt);
      const gr = lect.getObjectByName('grimoire')!;
      gr.position.y = 1.4 + (grimoireLift > 0 ? 0.5 + Math.sin(t * 3) * 0.06 : 0);
      gr.rotation.y += (grimoireLift > 0 ? 1.2 : 0) * 0.016;
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
    for (let i = 0, n = dust.active * 3; i < n; i += 3) {
      dp[i + 1] += dust.vel[i / 3] * dt * 0.5;
      dp[i] += Math.sin(t * 0.4 + i) * dt * 0.06;
      dp[i + 2] += Math.cos(t * 0.33 + i) * dt * 0.06;
      if (dp[i + 1] > dustHi) dp[i + 1] = dustLo;
      else if (dp[i + 1] < dustLo) dp[i + 1] = dustLo;
    }
    dust.m.geometry.attributes.position.needsUpdate = true;
    /* Dust only shows where there is light to show it. In daylight the shafts
       through the windows are full of it; at night there is almost nothing to
       catch, and a room full of glittering motes under a dead sky is the sort
       of detail that quietly makes a scene look wrong. */
    dust.m.material.opacity = (0.12 + (1 - nightNow) * 0.34) * sim.dust;
    dust.m.visible = sim.dust > 0.02;

    const bp = bubbles.pos;
    for (let i = 0, n = bubbles.active * 3; i < n; i += 3) {
      bp[i + 1] += bubbles.vel[i / 3] * dt * (bubbles.boost || 1);
      bp[i] += Math.sin(t * 2 + i) * dt * 0.1;
      if (bp[i + 1] > cauldronWorld.y + 2.4) {
        bp[i + 1] = cauldronWorld.y;
        bp[i] = cauldronWorld.x + (Math.random() - 0.5) * 0.6;
        bp[i + 2] = cauldronWorld.z + (Math.random() - 0.5) * 0.6;
      }
    }
    bubbles.m.geometry.attributes.position.needsUpdate = true;

    /* His routine is a routine, not a starting position. It used to be read
       once at load and never again — so whatever hour you arrived at, that is
       where he stayed. Now the clock is consulted as it turns and he walks
       there, which is the whole point of having given him a day. */
    routineTimer -= dt;
    if (routineTimer <= 0) {
      routineTimer = 20;
      const want = stationForHour(towerHour());
      if (want !== wiz.wizTarget && !wizBusy) {
        wizBusy = true;
        void wiz.sendWizard({ to: want, hold: 1200 }).finally(() => { wizBusy = false; });
      }
    }
    const wstep = wiz.update(dt, () => {});
    const p = wiz.pathPoint(wiz.wizAt, _wp, _wt);
    /* Walking, he bobs on the step; standing, he breathes. The bob used to run
       whether or not he was going anywhere, which is the uncanny thing about a
       figure that is perfectly still except for a twitch. */
    const bob = wstep.moving
      ? Math.abs(Math.sin(t * 6)) * 0.045
      : Math.sin(t * 1.15) * 0.016;
    wizard.position.set(p.x, p.y + bob, p.z);
    if (!wstep.moving) {
      // a slow shift of weight, so he is never quite at rest
      wizard.rotation.z = Math.sin(t * 0.62) * 0.012;
    } else wizard.rotation.z = 0;
    if (_wt.lengthSq() > 1e-6) {
      const want = Math.atan2(_wt.x, _wt.z);
      let dd = want - wizard.rotation.y;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      wizard.rotation.y += dd * Math.min(dt * 5, 1);
    }
    const wizFloor = Math.max(0, Math.min(NF - 1, Math.round(p.y / FH) + GROUND));
    wizard.visible = floors[wizFloor].g.visible;
    wizardLight.visible = wizard.visible;
    wizardLight.position.set(p.x, p.y + 2.1, p.z).add(model.position);
    wizardLight.intensity = (5 + Math.sin(t * 2.2) * 1.2) * interiorGain();
    /* After dark he is carrying the light rather than merely glowing near it,
       so it warms right down to candle colour. */
    wizardLight.color.copy(WIZ_LIGHT_DAY).lerp(WIZ_LIGHT_NIGHT, nightNow);
    setOccupiedFloor(wizFloor);
    // the staff's orb answers to him: brighter and larger while he walks
    staffOrb.scale.setScalar(1 + Math.sin(t * 1.9) * 0.07 + (wstep.moving ? 0.1 : 0));

    for (const it of anim.books) {
      const a = it.a0 + t * it.sp;
      it.o.position.set(it.c.x + Math.cos(a) * it.r, it.y + Math.sin(t * 1.3 + it.a0) * 0.22, it.c.z + Math.sin(a) * it.r);
      if (it.face) it.o.rotation.y = -a + Math.PI / 2;
      else if (it.tilt) it.o.rotation.set(Math.sin(t + it.a0) * 0.2, -a, Math.cos(t * 0.8 + it.a0) * 0.2);
      else it.o.rotation.set(Math.sin(t * 0.9 + it.a0) * 0.18, -a + Math.PI / 2, Math.sin(t * 1.4 + it.a0) * 0.12);
    }
    for (const it of anim.rings) {
      if (it.spin) {
        const ax = it.axis ?? 'z';
        it.o.rotation[ax] += it.spin * dt;
      }
      if (it.bob) it.o.position.y = 2.5 + Math.sin(t * 0.9) * it.bob;
      if (it.phase !== undefined) {
        const k = 0.55 + 0.45 * Math.sin(t * 2 + it.phase);
        it.o.scale.setScalar(0.8 + k * 0.4);
      }
    }
    if (anim.portal) {
      const p2 = anim.portal;
      /* Pinned: the gate is showing one particular destination because the
         visitor is hovering it in the list. Hold it, and let the cycle pick up
         where it left off once they look away. */
      if (p2.pin) {
        for (const w of p2.worlds) {
          const on = w.name === p2.pin;
          w.g.visible = on;
          if (on) w.g.scale.setScalar(1);
        }
        p2.at = 0;
      } else {
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
      }
      if (p2.flash && p2.flash > 0) {
        p2.flash = Math.max(0, p2.flash - dt * 1.6);
        const rim = floors[F.sanctum].g.getObjectByName('portal_rim') as any;
        const halo2 = floors[F.sanctum].g.getObjectByName('portal_halo') as any;
        if (rim) rim.material.emissiveIntensity = 1.1 + p2.flash * 4;
        if (halo2) halo2.material.opacity = 0.13 + p2.flash * 0.4;
      }
    }

    /* wisps: a slow rise on a drifting helix, wrapping at the roof */
    {
      const lit = Math.max(0, nightNow - 0.28) / 0.72;
      wisps.m.material.opacity = lit * 0.85 * sim.wisps;
      wisps.m.visible = lit > 0.01 && sim.wisps > 0.02;
      if (wisps.m.visible) {
        const wp2 = wisps.pos;
        for (let i = 0; i < wisps.active; i++) {
          const j = i * 3;
          wp2[j + 1] += wisps.vel[i] * dt;
          // the same band the dust is held to, so focusing a storey does not
          // leave lights drifting through the floors above and below it
          if (wp2[j + 1] > dustHi) wp2[j + 1] = dustLo + 0.2;
          else if (wp2[j + 1] < dustLo) wp2[j + 1] = dustLo + 0.2;
          const a = wispPhase[i] + t * (0.25 + wisps.vel[i]);
          const r = wispRad[i] + Math.sin(t * 0.7 + wispPhase[i]) * 0.35;
          wp2[j] = Math.sin(a) * r;
          wp2[j + 2] = Math.cos(a) * r;
        }
        wisps.m.geometry.attributes.position.needsUpdate = true;
      }
    }

    if (anim.bath) {
      const b = anim.bath;
      b.uT.value = t;
      // the vista eases between views rather than cutting, so the lever reads
      // as opening onto somewhere else instead of switching a channel
      b.uVista.value += (vistaTarget - b.uVista.value) * Math.min(1, dt * 2.2);

      /* Filling and draining are a real level, not a flourish: the tap adds to
         it while it runs, the plug takes it away, and everything floating on
         the surface rides whatever it currently is. */
      if (b.filling > 0) { b.filling -= dt; b.fill = Math.min(1, b.fill + dt * 0.22); }
      const D = 1.15;                                   // the well's depth
      const surface = -D + b.fill * (D + 0.08);
      b.water.scale.y = Math.max(0.02, b.fill);
      b.water.position.y = -D + (b.fill * (D + 0.08)) / 2;
      b.water.rotation.z = Math.sin(t * 0.9) * 0.012 * b.fill;
      b.water.rotation.x = Math.sin(t * 0.67 + 1.1) * 0.009 * b.fill;
      // the surface skin rides on top of whatever the level currently is
      b.surface.position.y = surface + 0.01;
      b.surface.rotation.z = b.water.rotation.z;
      b.surface.rotation.x = b.water.rotation.x;
      b.surface.visible = b.fill > 0.05;
      b.surface.scale.set(1 + Math.sin(t * 1.7) * 0.004, 1, 1 + Math.sin(t * 1.3) * 0.004);

      // the tray floats on it, and tips a little as the water moves
      b.tray.position.y = surface + 0.03;
      b.tray.rotation.z = Math.sin(t * 0.9) * 0.03;
      b.tray.rotation.x = Math.sin(t * 0.67 + 1.1) * 0.024;
      b.tray.visible = b.fill > 0.12;

      // blossoms, each on its own slow circuit of the water
      for (const p of b.petals) {
        const u = p.userData as any;
        u.a += dt * u.sp;
        p.position.set(Math.cos(u.a) * u.r, surface + 0.02, Math.sin(u.a) * u.r);
        p.rotation.y = u.a * 0.6;
        p.rotation.z = Math.sin(t * 1.4 + u.a) * 0.12;
        p.visible = b.fill > 0.12;
      }

      // the tap only runs while it is running
      b.stream.visible = b.filling > 0;
      if (b.stream.visible) {
        b.stream.scale.set(0.8 + Math.sin(t * 23) * 0.2, 1, 0.8 + Math.sin(t * 19 + 2) * 0.2);
      }

      // steam, rising off the water and thinning as it goes
      const st = b.steam.pos;
      for (let i = 0; i < st.length; i += 3) {
        st[i + 1] += b.steam.vel[i / 3] * dt;
        st[i] += Math.sin(t * 0.5 + i) * dt * 0.16;
        st[i + 2] += Math.cos(t * 0.42 + i) * dt * 0.14;
        if (st[i + 1] > 3.4) st[i + 1] = surface + 0.2;
      }
      b.steam.m.geometry.attributes.position.needsUpdate = true;
      const sm = b.steam.m.material as THREE.PointsMaterial;
      sm.opacity = 0.13 * b.fill + (b.filling > 0 ? 0.06 : 0);

      b.lever.rotation.x = -0.5 + vistaTarget * 1.0;
      // the light off the view follows what the view is showing
      b.vistaLight.color.copy(VISTA_LIGHT_MEADOW).lerp(VISTA_LIGHT_COAST, b.uVista.value);
      b.vistaLight.intensity = 8 * (0.55 + 0.45 * (1 - nightNow));
    }

    if (anim.steam) {
      const sp3 = anim.steam.pos;
      for (let i = 0; i < sp3.length; i += 3) {
        sp3[i + 1] += anim.steam.vel[i / 3] * dt;
        sp3[i] += Math.sin(t * 1.4 + i) * dt * 0.09;      // it wanders as it cools
        sp3[i + 2] += Math.cos(t * 1.1 + i) * dt * 0.07;
        if (sp3[i + 1] > 2.4) {
          sp3[i + 1] = 1.1;
          sp3[i] = 0.5 + (Math.random() - 0.5) * 0.1;
          sp3[i + 2] = 0.2 + (Math.random() - 0.5) * 0.1;
        }
      }
      anim.steam.m.geometry.attributes.position.needsUpdate = true;
    }

    tickLamps(t);
    for (const sp of anim.specimens) {
      // the brew turns over slowly and the jar breathes with it
      const k = 0.72 + 0.28 * Math.sin(t * 1.3 + sp.phase) + 0.1 * Math.sin(t * 3.7 + sp.phase);
      sp.light.intensity = 3.4 * interiorGain() * k;
      sp.body.rotation.y = Math.sin(t * 0.4 + sp.phase) * 0.12;
      sp.body.scale.setScalar(1.15 + Math.sin(t * 2.1 + sp.phase) * 0.03);
    }

    if (anim.fire) {
      for (const lg of anim.fire) {
        const ph = (lg.userData as any).ph;
        lg.scale.set(1, 0.55 + Math.abs(Math.sin(t * 5.5 + ph)) * 0.9, 1);
        lg.rotation.z = Math.sin(t * 3.1 + ph) * 0.24;
        const m = lg.material as THREE.Material & { opacity: number };
        // the additive licks breathe; the solid tongues are left alone
        if (m.transparent) m.opacity = 0.35 + Math.abs(Math.sin(t * 4.2 + ph * 1.3)) * 0.5;
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
      // ...folding in the ambience gain, or the hearth would burn exactly as
      // bright at midnight as at noon and the wash would look broken.
      if (anim.fireLight) anim.fireLight.intensity = (13 + Math.sin(t * 7) * 2.5 + Math.sin(t * 13) * 1.2) * interiorGain();
    }

    /* fox AI */
    /* After dark the fox stops touring the tower and goes wherever the wizard
       is, then settles. A cat-sized animal asleep in the same room as the only
       other living thing in the building says more about the place than any
       amount of wandering does. */
    if (nightNow > 0.72 && foxState.mode !== 'travel' && foxState.target !== wiz.wizTarget) {
      foxState.target = wiz.wizTarget;
      foxState.mode = 'travel';
      foxState.timer = 30;
    }
    foxState.timer -= dt;
    if (foxState.mode === 'travel') {
      const fgoal = wiz.stations[foxState.target];
      const fstep = wiz.advance(foxState.at, fgoal, 2.6, dt);
      foxState.at = fstep.at;
      if (!fstep.moving) { foxDecide(foxState, NF, nightNow > 0.72 ? wiz.wizTarget : -1); }
    } else if (foxState.timer <= 0) foxDecide(foxState, NF, nightNow > 0.72 ? wiz.wizTarget : -1);

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
    const foxFloor = Math.max(0, Math.min(NF - 1, Math.round(fp.y / FH) + GROUND));
    fox.visible = floors[foxFloor].g.visible;
    foxLight.visible = fox.visible;
    // no temporary here: this runs every frame, and a Vector3 per frame is
    // pure garbage for the collector to sweep up
    foxLight.position.copy(fp).add(model.position);
    foxLight.position.y += 0.5;

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
  /* The two scales the distance rule picks between. A lower quality tier
     moves both up together, so the whole range gets coarser and cheaper
     without the close/far distinction being lost. */
  const autoScale = () => (pixelNear ? quality.profile().pixelNear : quality.profile().pixelFar);
  function autoPixel() {
    if (pixelOverride !== null) return;
    const dist = camera.position.distanceTo(controls.target);
    const wantNear = pixelNear ? dist < 27 : dist < 23;
    if (wantNear !== pixelNear) { pixelNear = wantNear; setPixel(autoScale()); }
  }
  function setPixelMode(scale: number | null) {
    pixelOverride = scale;
    if (scale === null) {
      const dist = camera.position.distanceTo(controls.target);
      pixelNear = dist < 25;
      setPixel(autoScale());
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
  /* The simulation runs on its own clock rather than the wall clock, so it can
     be slowed to a crawl or run fast without any animation having to know. It
     accumulates instead of scaling `now` directly — otherwise changing the
     rate would jump every sine in the building to a different phase. */
  let simT = 0;
  /* The shortlist is re-scored a few times a second rather than every frame.
     It only changes when the camera target moves or a storey is shown or
     hidden, and both of those are slow events; four times a second is already
     faster than either can happen. */
  let cullTimer = 0;
  function loop(now: number) {
    const raw = Math.min((now - t0) / 1000, 0.05); t0 = now;
    const dt = raw * sim.speed;
    simT += dt;
    tick(simT, dt);
    worlds.tick(simT, dt);
    autoPixel();
    controls.update();
    idleDrift(dt);
    cullTimer -= raw;
    /* Re-run unconditionally rather than only when the target has moved: a
       storey can be shown or hidden by something other than navigation — the
       opening reveal, a teleport — and a sort of forty-odd numbers four times
       a second is not worth being clever about. */
    if (cullTimer <= 0) { cullTimer = 0.25; setLightTarget(controls.target); cullLights(); }
    if (!contextLost) renderer.render(scene, camera);
    /* Wall time across the whole frame — update, culling, draw submission and
       whatever the browser did in between — because that is what the visitor
       experiences. renderer.info would only account for the draw. */
    const cost = performance.now() - now;
    sampleFrame(cost);
    quality.sample(cost);
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
  const WIZ_LIGHT_DAY = new THREE.Color(0x8fd8ff), WIZ_LIGHT_NIGHT = new THREE.Color(0xffb066);
  const VISTA_LIGHT_MEADOW = new THREE.Color(0xcfe8c8), VISTA_LIGHT_COAST = new THREE.Color(0xffc79a);
  let vistaTarget = 0;

  /* ------------------------- simulation parameters -------------------------
     The knobs the console can reach. Each one is a plain number with a range
     and a line of prose; `sim` in the console lists them, reads them and sets
     them, so adding a new one here is all it takes to expose it. Kept as one
     object so the whole state can be printed, reset, or eventually saved. */
  const SIM_DEFAULTS = {
    speed: 1,        // how fast the tower's own time runs
    wind: 1,         // how hard it blows in whatever world is loaded
    lamps: 1,        // multiplier on every lamp, candle and hearth indoors
    dust: 1,         // how much is drifting in the air
    wisps: 1,        // the night lights, and whether there are any
    clock: -1,       // pinned hour 0..24, or -1 to follow your own clock
    fov: 45,         // the camera's field of view
    lights: 10,      // how many interior lights may burn at once (see ambience)
  };
  const SIM_RANGE: Record<keyof typeof SIM_DEFAULTS, [number, number, string]> = {
    speed: [0, 8, 'how fast the tower\'s own time runs — 0 freezes it'],
    wind:  [0, 5, 'how hard it blows in the world outside'],
    lamps: [0, 4, 'every lamp, candle and hearth indoors'],
    dust:  [0, 3, 'motes drifting in the air'],
    wisps: [0, 3, 'the lights that come out after dark'],
    clock: [-1, 24, 'pin the hour, 0 to 24 — or -1 to follow your own clock'],
    fov:   [20, 90, 'the camera\'s field of view, in degrees'],
    lights: [2, 48, 'how many lamps may burn at once — the frame rate lives here'],
  };
  const sim = { ...SIM_DEFAULTS };

  /* Knobs the visitor has turned by hand. The quality tier drives some of the
     same numbers — `lights` above all — and an automatic demotion quietly
     undoing something that was just typed into the console is the sort of
     thing that reads as a bug. Once a knob is pinned here, the tier leaves it
     alone until `sim reset`. */
  const simPinned = new Set<string>();

  function simSet(key: string, value: number) {
    if (!(key in SIM_RANGE)) return null;
    const [lo, hi] = SIM_RANGE[key as keyof typeof SIM_DEFAULTS];
    const v = Math.max(lo, Math.min(hi, value));
    simPinned.add(key);
    (sim as any)[key] = v;
    if (key === 'wind') worlds.wind(v);
    if (key === 'fov') { camera.fov = v; camera.updateProjectionMatrix(); }
    if (key === 'lamps' || key === 'clock') applyDayNight();
    if (key === 'lights') setLightBudget(v);
    return v;
  }
  function simReset() {
    for (const k of Object.keys(SIM_DEFAULTS)) simSet(k, (SIM_DEFAULTS as any)[k]);
    simPinned.clear();
    applyQuality(quality.profile());
    return { ...sim };
  }
  function simList() {
    return (Object.keys(SIM_RANGE) as (keyof typeof SIM_DEFAULTS)[]).map((k) => ({
      key: k,
      value: sim[k],
      def: SIM_DEFAULTS[k],
      min: SIM_RANGE[k][0],
      max: SIM_RANGE[k][1],
      help: SIM_RANGE[k][2],
    }));
  }

  /* ---------------------------- quality tiers ----------------------------
     One place where a tier becomes actual settings. Everything it touches is
     something that can be moved at any moment on a live scene — no geometry
     is rebuilt and no material is recompiled, so a demotion mid-orbit costs
     one frame and is not visible as a hitch. What it reaches:

       pixels    the two automatic pixel-art scales, and the cap on device
                 pixel ratio for when the downscale is off entirely
       lights    the interior shortlist — the single biggest lever, because
                 every one is another loop in every lit fragment on screen
       particles dust, cauldron bubbles and wisps, thinned by draw range
       detail    the active world's scattered instances (see worlds.js)

     Antialiasing is the one thing it cannot reach: it is fixed when the GL
     context is created. */
  function applyQuality(p: Profile) {
    setMaxPixelRatio(p.maxPixelRatio);
    if (pixelOverride === null) setPixel(autoScale());
    if (!simPinned.has('lights')) { sim.lights = p.lights; setLightBudget(p.lights); }
    dust.setDensity(p.particles);
    bubbles.setDensity(p.particles);
    wisps.setDensity(p.particles);
    worlds.detail(p.detail);
  }

  /* An automatic change is announced rather than done silently: the scene
     visibly coarsens, and a visitor who is not told why reasonably concludes
     the site is broken rather than that it just made itself playable. The
     host listens for this and shows a note; `quality` in the console says the
     same thing on demand. */
  /* Nothing left to turn down. The host offers a lighter way in — the tower
     does not decide that for anybody, it just says so. */
  quality.onStruggle((fps) => {
    window.dispatchEvent(new CustomEvent('lair-struggling', { detail: { fps } }));
  });

  quality.onChange((p, reason) => {
    applyQuality(p);
    window.dispatchEvent(new CustomEvent('lair-quality', { detail: { tier: p.tier, reason, blurb: p.blurb } }));
  });

  function setQuality(tier: Tier | null) {
    return quality.set(tier);
  }
  function qualityState() {
    const p = quality.profile();
    const s = quality.stats();
    return { tier: p.tier, blurb: p.blurb, pinned: quality.pinned(), fps: s.fps, ms: s.ms, gpu: gpuSummary() };
  }
  /* The last night amount the wash computed, so the per-frame code can read it
     without recomputing the clock every frame. */
  let nightNow = 0;
  const HEMI_SKY_DAY = new THREE.Color(0x9fb0ff), HEMI_SKY_NIGHT = new THREE.Color(0x1a2040);
  const HEMI_GROUND_DAY = new THREE.Color(0x2a2038), HEMI_GROUND_NIGHT = new THREE.Color(0x0c0d1a);
  const KEY_DAY = new THREE.Color(0xffffff), KEY_NIGHT = new THREE.Color(0x8fa8ff);
  // 'auto' follows the clock; the console can pin it either way.
  let lightMode: 'auto' | 'day' | 'night' = 'auto';

  /** How far into the night it is, 0..1. Keep the pins here in step with
   *  towerHour() below — they are two views of the same clock. */
  function nightAmount() {
    if (lightMode === 'day') return 0;
    if (lightMode === 'night') return 1;
    // `sim clock` pins the hour outright, which is the only way to watch a
    // sunset happen rather than waiting for one
    let hour: number;
    if (sim.clock >= 0) hour = sim.clock;
    else { const now = new Date(); hour = now.getHours() + now.getMinutes() / 60; }
    return 0.5 - 0.5 * Math.cos(((hour - 13 + 24) % 24) / 24 * Math.PI * 2);
  }

  /** The hour the tower currently believes it is.
   *
   *  This has to agree with nightAmount(), or the two halves of the wash
   *  contradict each other: pinning `light night` set the night amount to 1
   *  while this went on reporting the real wall-clock hour, so anything
   *  driven by the hour — the town's sky, most obviously — carried on drawing
   *  two in the afternoon underneath a midnight rig. The pins are the same
   *  pins, and 13:00 and 01:00 are the peak and trough of the curve below. */
  function towerHour() {
    if (lightMode === 'day') return 13;
    if (lightMode === 'night') return 1;
    if (sim.clock >= 0) return sim.clock;
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  }

  /* The wash now runs everywhere, not only at home. Two halves:
     · the world's own rig — handed to worlds.js, which lerps between that
       world's day and night light configs and moves its sun/moon about;
     · the tower's own interior — ambience.ts, which decides how much light
       gets in through the glass and how hard the candles have to work.
     Worlds with no choice about the hour (the city's eternal night, deep
     space) clamp the amount on their way through. */
  function applyDayNight() {
    const world = worlds.current();
    const night = clampNight(world, nightAmount());
    nightNow = night;

    // The world system always gets the raw hour, even at home: it clamps per
    // world itself, so a teleport mid-flight already knows what time it is
    // when it swaps the destination in.
    worlds.setNight(nightAmount(), towerHour());
    // the tower's own ground has no business inside somebody else's world
    suppressBackdrop(!!world);
    if (!world) {
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
    applyAmbience(world, night, sim.lamps);
  }

  function setLightMode(mode: 'auto' | 'day' | 'night') {
    lightMode = mode;
    applyDayNight();
    return lightMode;
  }

  /** Arm a one-shot pick: the next click reports what is actually under the
   *  cursor, nearest first, with each hit's world position and how it is
   *  drawn. For chasing down "what *is* that thing" — a stray mesh reads very
   *  differently from a shader artifact, and the two are impossible to tell
   *  apart from a screenshot. */
  let probeOff: (() => void) | null = null;
  function probe(report: (line: string) => void, enable = true) {
    probeOff?.();
    probeOff = null;
    if (!enable) return 'probe: off.';
    const ray = new THREE.Raycaster();
    const pt = new THREE.Vector2();
    const once = (ev: PointerEvent) => {
      // a probe click is a probe click: it must not also orbit the camera or
      // navigate to whatever floor happens to be under it
      ev.stopImmediatePropagation();
      const r = renderer.domElement.getBoundingClientRect();
      pt.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(pt, camera);
      // three's raycaster does NOT skip hidden objects, and it is an ancestor
      // that gets hidden here, not the mesh — so the visibility test has to
      // walk the whole chain or the report is full of things nobody can see.
      const shown = (o: THREE.Object3D | null) => {
        for (let p = o; p && p !== scene; p = p.parent) if (!p.visible) return false;
        return true;
      };
      const all = ray.intersectObjects(scene.children, true);
      const hits = all.filter((h) => shown(h.object));
      if (!hits.length) {
        report(`probe: nothing visible there (${all.length} hidden object(s) on the ray).`);
        report('  So the black area is the sky dome itself, or the page behind the canvas.');
        return;
      }
      report(`probe: ${hits.length} visible hit(s) of ${all.length}, nearest first —`);
      for (const h of hits.slice(0, 6)) {
        const o = h.object as THREE.Mesh;
        const m: any = Array.isArray(o.material) ? o.material[0] : o.material;
        const path: string[] = [];
        for (let p: THREE.Object3D | null = o; p && p !== scene; p = p.parent) path.unshift(p.name || p.type);
        report(`  ${h.distance.toFixed(1)}m  ${path.join(' / ')}  order=${o.renderOrder}`);
        if (m) {
          report(`      ${m.type}${m.name ? ' "' + m.name + '"' : ''}`
            + ` colour #${m.color ? m.color.getHexString() : '—'}`
            + ` transparent=${!!m.transparent} opacity=${m.opacity}`
            + ` depthWrite=${m.depthWrite} fog=${m.fog} side=${m.side}`);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', once, true);
    probeOff = () => renderer.domElement.removeEventListener('pointerdown', once, true);
    return 'probe: armed — click anything to identify it. "probe off" when done.';
  }

  /** Everything hanging off the scene root, with its visibility and size.
   *  No clicking: this answers "is something rendering that should not be"
   *  outright, which a screenshot cannot. */
  function scan(report: (line: string) => void) {
    report(`scan: ${scene.children.length} objects at the scene root —`);
    for (const o of scene.children) {
      let meshes = 0;
      o.traverse((c) => { if ((c as any).isMesh || (c as any).isInstancedMesh || (c as any).isPoints || (c as any).isSprite) meshes++; });
      report(`  ${o.visible ? 'ON ' : 'off'}  ${o.name || o.type}  (${meshes} drawable)`);
    }
    return `scan: world is "${worlds.current() || 'none'}", backdrop "${document.body.dataset.backdrop}".`;
  }

  /* ---------------------------- the frame budget ---------------------------
     Guessing at what is slow in a scene like this is how you spend an
     afternoon optimising something that never cost anything. Every number
     here is one the renderer already keeps; the only thing measured on
     purpose is the frame time, sampled over the last two seconds so a single
     hitch does not read as the steady state.

     The two that actually matter are `lights` and `calls`. A point light is
     not a cost paid once — it is a loop iteration in *every* lit fragment on
     screen, so a world's full-screen ground pays for every candle burning six
     storeys up in the tower. */
  let frames = 0, frameAccum = 0, frameWorst = 0, frameFps = 0, frameMs = 0;
  function sampleFrame(ms: number) {
    frames++; frameAccum += ms;
    if (ms > frameWorst) frameWorst = ms;
    if (frameAccum >= 2000) {
      frameFps = (frames * 1000) / frameAccum;
      frameMs = frameAccum / frames;
      frames = 0; frameAccum = 0; frameWorst = frameWorst * 0.5;
    }
  }
  function perf(report: (line: string) => void) {
    const info = renderer.info;
    let point = 0, spot = 0, dir = 0, hidden = 0;
    scene.traverse((o: any) => {
      if (!o.isLight) return;
      // a light under a hidden parent is never uploaded, so it costs nothing
      let vis = true;
      for (let p: any = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis) { hidden++; return; }
      if (o.isPointLight) point++;
      else if (o.isSpotLight) spot++;
      else if (o.isDirectionalLight) dir++;
    });
    report(`  frame     ${frameMs.toFixed(1)} ms  (${frameFps.toFixed(0)} fps, worst ${frameWorst.toFixed(0)} ms)`);
    report(`  draws     ${info.render.calls} calls, ${(info.render.triangles / 1000).toFixed(0)}k triangles`);
    report(`  lights    ${point} point, ${spot} spot, ${dir} directional  (${hidden} switched off)`);
    report(`  memory    ${info.memory.geometries} geometries, ${info.memory.textures} textures, ${info.programs?.length ?? 0} shaders`);
    report(`  pixels    1/${pixelOverride ?? autoScale()} resolution, budget ${lightBudget()} lights`);
    const g = gpuInfo();
    const p = quality.profile();
    report(`  quality   ${p.tier}${quality.pinned() ? ' (pinned)' : ' (automatic)'} — ${p.blurb}`);
    report(`  gpu       ${gpuSummary()}`);
    if (g.software) report('            (a software rasteriser — the CPU is drawing this, and it will be slow)');
    return `perf: world "${worlds.current() || 'none'}".`;
  }

  /* ---------------- and the shelves hold the actual projects --------------
     The same idea as the library, in the room where the work happens: each
     project becomes a lit specimen on the alchemy shelves, with a tag on the
     jar. There are far fewer of these than there are publications, which
     suits them — one glowing jar among forty dull ones reads as *the* thing
     being worked on, which is exactly what a current project is. */
  let boundProjects = 0;
  function bindProjects(list: { name: string; status?: string }[], onOpen: (name: string) => void) {
    if (boundProjects || !list.length) return boundProjects;
    const slots = laboratory.slots;
    // spread them along the shelves rather than clumping at one end
    const free = slots.filter((sl) => !sl.taken);
    const stride = Math.max(1, Math.floor(free.length / Math.max(1, list.length)));
    list.forEach((proj, i) => {
      const sl = free[Math.min(free.length - 1, i * stride + (stride >> 1))];
      if (!sl || sl.taken) return;
      sl.taken = true;
      sl.body.material = M.specimen;
      sl.body.scale.set(1.15, 1.15, 1.15);
      // a paper tag tied round the neck, angled to face the room
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.02), M.specimen_tag);
      tag.name = 'specimen_tag';
      tag.position.copy(polar(sl.angle, R - 0.78, sl.y - 0.02));
      tag.rotation.y = RAD(sl.angle);
      tag.rotation.z = 0.22;
      floors[F.lab].g.add(tag);
      // its own light, so a bound jar actually lifts the shelf around it
      const jl = new THREE.PointLight(0x5fe0b0, 0, 2.6, 2);
      jl.name = 'specimen_light';
      jl.position.copy(polar(sl.angle, R - 1.0, sl.y + 0.1));
      floors[F.lab].fg.add(jl);
      registerLamp(jl, 3.4, true);   // the specimen loop drives this one itself
      anim.specimens.push({ body: sl.body, light: jl, phase: i * 1.9 });
      const label = proj.status === 'current' ? `${proj.name} — in progress` : proj.name;
      interactions.interact(sl.group, label, () => onOpen(proj.name), undefined, { marker: false });
      boundProjects++;
    });
    return boundProjects;
  }

  /* ------------- the remaining rooms hold their own sections -------------
     Publications are the books and projects are the specimens; these three
     have prose rather than a list, so each gets the one object in the room
     that plainly *is* that section — the journal by the bed, the slate by the
     hearth, the correspondence rack under the telescope. The contact tokens
     go further and do the thing itself, so writing to the keeper means
     picking up the sealed letter rather than finding a link. */
  /* How long the grimoire stays up off the lectern. Held here rather than in
     the interaction's own state because the panel raises it too — opening the
     colophon from the console, or from a #colophon link, should lift the book
     exactly as clicking it does. */
  let grimoireLift = 0;
  let onColophonRequest: (() => void) | undefined;
  /** Lift the grimoire, from wherever the colophon was actually opened. */
  function readGrimoire() { grimoireLift = 3.0; }

  function bindRooms(cfg: {
    onAbout: () => void;
    onNow: () => void;
    onContact: () => void;
    /** the grimoire on the library lectern — the colophon */
    onColophon?: () => void;
    /** in rack order: letter, scroll, sigil, disc */
    channels: { label: string; open: () => void }[];
  }) {
    onColophonRequest = cfg.onColophon;

    const journal = floors[F.quarters].g.getObjectByName('journal');
    if (journal) interactions.interact(journal, 'Read the keeper\'s journal', cfg.onAbout);

    if (kitchen.slate) interactions.interact(kitchen.slate, 'Read the slate — what he is up to', cfg.onNow);

    if (observatory.rack) {
      interactions.interact(observatory.rack, 'The correspondence rack', cfg.onContact);
      // each token overrides the rack it sits in, since interact() takes the
      // deepest match on the ray and the tokens are children of the rack
      observatory.contactTokens.forEach((tk, i) => {
        const ch = cfg.channels[i];
        if (!ch) return;
        interactions.interact(tk, ch.label, ch.open, undefined, { marker: false });
      });
    }
  }

  /* Looking at a storey below ground means the world's own ground is in the
     way. Sink a shaft through it while we are down there, and fill it back in
     on the way up — and hold back the tower's blueprint grid for the same
     reason, since it lies at ground level too. */
  function focusFloor(k: number | null) {
    const under = k !== null && k < GROUND;
    worlds.cutaway(under ? 26 : 0);
    suppressBackdrop(under || !!worlds.current());
    const r = focus.focusFloor(k);
    // showing or hiding a storey changes which lights are even candidates
    cullLights();
    return r;
  }

  /** Take the visitor down to the cellar. */
  // Same reasoning as the trapdoor above: the router owns where you are.
  function goBath() { opts.onNavigateFloor(F.bath); }
  /** Start the tap. */
  function runBath() { if (anim.bath) anim.bath.filling = Math.max(anim.bath.filling, 6); }
  /** Empty the bath. Called by the host as part of its own reset. */
  function drainBath() { if (anim.bath) { anim.bath.fill = 0; anim.bath.filling = 0; } }

  /** Which view the bathhouse casement is showing. Lerped, not switched. */
  function setVista(v: Vista | 'toggle') {
    const want = v === 'toggle' ? (vistaTarget > 0.5 ? 'meadow' : 'coast') : v;
    vistaTarget = want === 'coast' ? 1 : 0;
    return want;
  }
  function vista(): Vista { return vistaTarget > 0.5 ? 'coast' : 'meadow'; }

  /** Hold a destination in the portal ring, or null to resume the idle tour.
   *  The gate is the one object in the tower that is explicitly about going
   *  somewhere, so it should show you where before you commit. */
  function previewWorld(kind: string | null) {
    if (anim.portal) anim.portal.pin = kind;
  }

  /** Whether the current world answers to the clock at all — the console
   *  uses this to say so rather than silently doing nothing. */
  function lightModeAvailable() {
    const w = worlds.current();
    return !w || !NO_DAYNIGHT.has(w);
  }

  /* Arriving at a world without the teleport (the ?world= URL, say) skips the
     'done' event, so the wash would stay on the world we never actually left. */
  const rawSetWorld = worlds.set;
  worlds.set = (kind: any, quiet?: boolean) => {
    const r = rawSetWorld(kind, quiet);
    applyDayNight();
    return r;
  };

  // Coming home from a world: the world system has just restored the
  // baseline, and the clock may have moved on considerably since it was
  // taken. Re-derive it from the current hour.
  window.addEventListener('lair-teleport', (e: any) => {
    if (e.detail?.phase === 'done') applyDayNight();
  });

  function start() {
    try {
      const savedBackdrop = localStorage.getItem('lair-backdrop') as any;
      setBackdropFx(scene, savedBackdrop || 'blueprint');
    } catch { setBackdropFx(scene, 'blueprint'); }
    // The tier's own opening settings, including which pixel scale to start on.
    applyQuality(quality.profile());
    /* Nothing measured during the rise means anything: every material in the
       tower compiles its shader on its first frame, every buffer uploads, and
       the intro animates all seven storeys at once. Judging the machine on
       that would demote a perfectly capable one before it drew a real frame. */
    quality.settle(7000);
    setPixel(pixelOverride ?? autoScale());
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

  /* ---------------- the shelves hold the actual publications --------------
     Until now the library was scenery and the record lived in a side panel:
     the panel could point at the tower (pluckBook, focusShelf) but the tower
     could not point back. Binding closes that loop — every HAL record takes a
     real spine on a real shelf, so the books can be read, hovered and opened
     where they stand. The rest of the shelf stays anonymous, which is what
     makes the bound ones feel like the collection rather than the wallpaper. */
  let boundDocs = 0;
  function bindPublications(
    docs: { id: string; title: string; year: number }[],
    shelfFor: (id: string) => { band: number; angle: number; row: number },
    onOpen: (id: string) => void,
  ) {
    if (boundDocs || !docs.length) return boundDocs;   // once per page life
    const slots = library.slots;
    // the run of years actually on the shelf, so the gradient always spans it
    let YEAR_MIN = Infinity, YEAR_MAX = -Infinity;
    for (const d of docs) {
      if (!d.year) continue;
      if (d.year < YEAR_MIN) YEAR_MIN = d.year;
      if (d.year > YEAR_MAX) YEAR_MAX = d.year;
    }
    if (!isFinite(YEAR_MIN)) { YEAR_MIN = 2015; YEAR_MAX = 2026; }
    for (const doc of docs) {
      const want = shelfFor(doc.id);
      // its own slot if free, else the nearest free one on the same shelf,
      // else anywhere — a record never fails to get a spine
      let best: typeof slots[number] | null = null, bestScore = Infinity;
      for (const sl of slots) {
        if (sl.taken) continue;
        const sameShelf = sl.band === want.band && sl.row === want.row;
        const score = (sameShelf ? 0 : 1000) + Math.abs(sl.angle - want.angle);
        if (score < bestScore) { bestScore = score; best = sl; }
      }
      if (!best) break;
      best.taken = true;
      /* Spine colour by year, oldest to newest, so the shelf reads as a
         timeline once you know to look — and the bound books stand a little
         proud of the anonymous ones, the way a row that gets handled does. */
      const span = Math.max(1, YEAR_MAX - YEAR_MIN);
      const t01 = Math.min(1, Math.max(0, (doc.year - YEAR_MIN) / span));
      best.mesh.material = M['spine_' + Math.round(t01 * (SPINE_STEPS - 1))];
      best.mesh.scale.z = 1.22;
      best.mesh.name = 'publication';
      const label = doc.title.length > 74 ? doc.title.slice(0, 72) + '…' : doc.title;
      interactions.interact(
        best.mesh,
        `${label}${doc.year ? '  (' + doc.year + ')' : ''}`,
        () => onOpen(doc.id),
        undefined,
        { marker: false },
      );
      boundDocs++;
    }
    return boundDocs;
  }

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

  /* Pulling a record off the shelf. The book slides out of its slot spine
     first, turns to face you, opens, and hangs in the middle of the room for
     as long as the record is open — then closes and files itself back. It is
     the one moment where the shelf and the panel are plainly the same thing,
     so it is worth the twenty lines. */
  let openBook: THREE.Group | null = null;
  function shelveBook() {
    const b = openBook;
    if (!b) return;
    openBook = null;
    const at = anim.books.findIndex((x) => x.o === b);
    if (at >= 0) anim.books.splice(at, 1);
    if (reducedMotion()) { b.parent?.remove(b); return; }
    anime({
      targets: b.position, y: (b.userData as any).homeY, x: (b.userData as any).homeX, z: (b.userData as any).homeZ,
      duration: 520, easing: 'easeInQuad',
    });
    anime({ targets: b.scale, x: 0.01, y: 0.01, z: 0.01, duration: 520, easing: 'easeInQuad',
      complete: () => b.parent?.remove(b) });
  }

  async function pluckBook(shelf: { band: number; angle: number; row: number } | undefined) {
    shelveBook();
    if (!shelf) return;
    const lib = floors[F.library].g;
    const y = SHELF_ROW_Y[shelf.row] ?? 1.62;
    const start = polar(shelf.angle, R - 0.56, y + 0.2);

    /* An open book, hinged at the spine like the flying ones. Built here
       rather than cloned so it can be opened by animating the leaves. */
    const b = new THREE.Group();
    b.name = 'plucked_book';
    addBox('book_spine', 'cloth_red_dark', 0.09, 0.06, 0.4, 0, 0, 0, 0, b);
    const leaves: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group();
      addBox('cover', 'cloth_red_dark', 0.26, 0.04, 0.4, side * 0.16, 0, 0, 0, leaf);
      addBox('pages', 'paper', 0.24, 0.035, 0.37, side * 0.155, 0.036, 0, 0, leaf);
      leaf.rotation.z = side * 0.02;              // shut, to begin with
      b.add(leaf);
      leaves.push(leaf);
    }
    b.position.copy(start);
    b.rotation.y = RAD(shelf.angle);
    (b.userData as any) = { homeX: start.x, homeY: start.y, homeZ: start.z };
    lib.add(b);
    openBook = b;

    if (reducedMotion()) return;

    // 1 · out of the slot, spine first
    const out = polar(shelf.angle, R - 1.5, y + 0.25);
    // 2 · and round to the middle of the room, at reading height
    const front = polar(shelf.angle - 30, 1.9, 2.35);
    await new Promise<void>((resolve) => {
      anime({
        targets: b.position,
        keyframes: [
          { x: out.x, y: out.y, z: out.z, duration: 320, easing: 'easeOutQuad' },
          { x: front.x, y: front.y, z: front.z, duration: 620, easing: 'easeInOutQuad' },
        ],
        complete: () => resolve(),
      });
      anime({ targets: b.rotation, y: RAD(shelf.angle - 30) + Math.PI, duration: 940, easing: 'easeInOutQuad' });
      // it opens as it travels
      anime({ targets: leaves[0].rotation, z: -0.62, delay: 340, duration: 600, easing: 'easeOutQuad' });
      anime({ targets: leaves[1].rotation, z: 0.62, delay: 340, duration: 600, easing: 'easeOutQuad' });
    });
    // and then it simply hangs there, turning slowly, until it is put back
    if (openBook === b) anim.books.push({
      o: b, r: 0, a0: 0, y: front.y, sp: 0,
      c: new THREE.Vector3(front.x, front.y, front.z), tilt: true,
    });
  }

  return {
    renderer, scene, camera, controls,
    floors, floorNames: floors.map((f) => f.name),
    worlds,
    focusFloor,
    perf,
    setPanelOpen: focus.setPanelOpen,
    reframe: focus.reframe,
    sendWizard: wiz.sendWizard,
    stepWizard: wiz.stepWizard,
    setBackdrop: (kind: any) => setBackdropFx(scene, kind),
    setPixel,
    setPixelMode,
    setLightMode,
    lightMode: () => lightMode,
    lightModeAvailable,
    probe,
    scan,
    setAutoRotate: (on: boolean) => { controls.autoRotate = on; return on; },
    autoRotate: () => controls.autoRotate as boolean,
    pluckBook,
    shelveBook,
    focusShelf,
    bindPublications,
    bindProjects,
    bindRooms,
    readGrimoire,
    previewWorld,
    goBath,
    runBath,
    drainBath,
    setVista,
    vista,
    VISTAS,
    simSet,
    simReset,
    simList,
    setQuality,
    qualityState,
    pixelMode: () => pixelOverride,
    gpu: gpuInfo,
    playIntro,
    F, NF,
    start, stop,
  };
}
