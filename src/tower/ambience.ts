import * as THREE from 'three';
import { M, shaftMat } from './materials';

/* ambience.ts — what the inside of the tower looks like given what is outside.
 *
 * The windows used to be lamps: an opaque emissive disc plus a fixed warm
 * shaft, which reads correctly only in the default sunlit backdrop. Teleport
 * the tower to the seafloor or into deep space and six little suns were still
 * burning in the walls. Here the glass is glass — it takes its tint and its
 * light from wherever the tower currently stands — and the interior lamps come
 * up to meet it as the outside goes dark, so there is always something to see
 * by. One profile per world, in a day and a night flavour; everything else is
 * a lerp between the two. */

export type Ambience = {
  /** colour of the light outside, and of the glass carrying it */
  sky: number;
  /** how much of it gets past the glass — drives halo, shaft and spot */
  through: number;
  /** how brightly the pane itself reads, 0 = clear */
  pane: number;
  /** multiplier on every lamp, candle and hearth inside */
  interior: number;
  /** the "someone lit the place" fill, one soft point light per storey */
  fill: number;
};

type Pair = { day: Ambience; night: Ambience };

const P = (sky: number, through: number, pane: number, interior: number, fill: number): Ambience =>
  ({ sky, through, pane, interior, fill });

/* 'home' is the tower standing in its own backdrop, no world loaded. */
export const PROFILES: Record<string, Pair> = {
  home: {
    day:   P(0xffe9c0, 1.00, 0.55, 0.75, 0.30),
    night: P(0x9fb6ff, 0.22, 0.16, 2.20, 1.05),
  },
  moon: {
    // airless: the sun is brutal, the night is lit only by the gas giant
    day:   P(0xfff0dc, 1.05, 0.55, 0.75, 0.30),
    night: P(0xb9c6ff, 0.28, 0.18, 2.20, 1.05),
  },
  seafloor: {
    // even at noon this is filtered light; at night only the moon reaches down
    day:   P(0xa8ecff, 0.60, 0.30, 1.30, 0.70),
    night: P(0x4f86b8, 0.15, 0.09, 2.40, 1.20),
  },
  forest: {
    day:   P(0xffe6b0, 0.85, 0.45, 0.95, 0.42),
    night: P(0x8fb0ff, 0.20, 0.11, 2.30, 1.10),
  },
  beach: {
    day:   P(0xfff4de, 1.15, 0.60, 0.60, 0.24),
    night: P(0xc8d8ff, 0.26, 0.16, 2.20, 1.05),
  },
  city: {
    // eternal night; the "day" entry is never reached, but keep it sane
    day:   P(0xffa64a, 0.32, 0.20, 2.30, 1.15),
    night: P(0xffa64a, 0.30, 0.19, 2.40, 1.20),
  },
  rain: {
    // an overcast day is still daylight, but flat, cold and grey — and the
    // wizard keeps more candles going than he would under a clear sky
    day:   P(0xbcc8dc, 0.55, 0.28, 1.25, 0.62),
    night: P(0x6f82a8, 0.13, 0.08, 2.45, 1.20),
  },
  space: {
    // no sun, no clock — starlight and whatever the wizard lit himself
    day:   P(0x9fc0ff, 0.16, 0.10, 2.60, 1.35),
    night: P(0x9fc0ff, 0.16, 0.10, 2.60, 1.35),
  },
};

/** Worlds that do not get a choice about the hour. */
export const FIXED_NIGHT: Record<string, number> = {
  city: 1,      // plunged in eternal night
  space: 1,     // there is no day out there
};
/** Worlds where the day/night wash means nothing at all. */
export const NO_DAYNIGHT = new Set(['space']);

/** The night amount a given world actually experiences. */
export function clampNight(world: string | null, night: number): number {
  const fixed = FIXED_NIGHT[world || ''];
  return fixed === undefined ? night : fixed;
}

/* ---------------- the rig ----------------
 * Every light in this file is authored where it belongs — a candle inside its
 * own storey's group, a window's spot beside its window — and none of them is
 * ever drawn. What is drawn is a fixed pool of anonymous lights sitting at the
 * scene root, which copy whichever authored lights currently matter.
 *
 * The reason is the one thing about three.js that makes a scene stutter in a
 * way no amount of culling fixes: the light *counts* are compiled into every
 * lit material. Change the number of point, spot or directional lights the
 * renderer can see and every program in the scene is rebuilt — which is
 * exactly what hiding a storey used to do, because hiding a storey hides the
 * lights inside it. Walking into a room therefore relinked forty-odd shaders
 * and dropped several hundred milliseconds on the floor, once per room, and
 * again whenever the shortlist happened to land on a count never seen before.
 *
 * With the pool the count is a constant: it is the size of the pool. A storey
 * going dark means some slots carry nothing (intensity 0) and no program is
 * touched. The pool is resized only when the quality tier moves, which is a
 * rare, announced event.
 *
 * The authored lights are parked on a layer the camera does not look at, so
 * `visible` stays free to mean what the rest of the scene already uses it for
 * — the wizard's lamp going out with the wizard, a window going dark with its
 * storey — and this file reads it as intent rather than as instruction.
 */
const OFFSTAGE = 31;

const rig = new THREE.Group();
rig.name = 'light_rig';
/** Hang the rig at the scene root. Called once, before anything registers. */
export function installLightRig(scene: THREE.Scene) {
  scene.add(rig);
  resizePools();
}

type Emitter = {
  src: THREE.Light;
  base: number;
  phase: number;
  steady?: boolean;
  /** what the wash wants of it — the budget below has the final say */
  want?: boolean;
  /** never a candidate for being culled */
  pin?: boolean;
  /** driven by the sky rather than by the interior wash — a window halo */
  sky?: boolean;
  score: number;
};

/** Park an authored light off-stage and return it as an emitter. */
function emitter(src: THREE.Light, base: number, steady = false): Emitter {
  src.layers.set(OFFSTAGE);
  return { src, base, phase: Math.random() * 6.283, steady, score: -1 };
}

type WindowRig = {
  halo: THREE.PointLight;
  spot: THREE.SpotLight;
  shaft: THREE.Mesh;
  baseHalo: number;
  baseSpot: number;
  haloEm: Emitter;
  spotEm: Emitter;
};
/* Which storey the wizard is on. The room he is in is brighter than the rest
   — from outside, the lit window moves up and down the tower as his day goes
   by, which is the cheapest possible way of saying somebody lives here. */
let occupied = -1;
let lastFill = 0;
export function setOccupiedFloor(i: number) {
  if (i === occupied) return;
  occupied = i;
  applyFills();
}
function applyFills() {
  const lit = lastFill > 0.04;
  fills.forEach((f, i) => {
    f.src.intensity = 2.6 * lastFill * (i === occupied ? 2.0 : 0.7);
    f.want = lit;
    // whichever storey he is on is never a candidate for being culled
    f.pin = lit && i === occupied;
  });
  cullLights();
}

const windows: WindowRig[] = [];
/** Candles, braziers, hearths, the wizard's lamp — everything that competes
 *  for a point slot. The window halos are in here too, so the budget covers
 *  the whole room rather than the half of it that is not daylight. */
const lamps: Emitter[] = [];
const fills: Emitter[] = [];
/** The window spots, which have a pool of their own: a spot is the most
 *  expensive light there is, and there are exactly four of them. */
const spots: Emitter[] = [];
/** Directional lights authored inside a storey — the observatory's moons.
 *  There is no shortlist for these: they are few, they are cheap, and they
 *  light the whole scene rather than a room, so each one keeps a slot of its
 *  own and simply goes to zero when its storey is out of view. */
const dirs: { pool: THREE.DirectionalLight; src: THREE.DirectionalLight; base: number }[] = [];
/* The outer shell's window panes. Same idea as the interior oculi — glass,
   not lamps — but the shell lives in worlds.js, which hands its material over
   once it has been built. */
let shellPane: THREE.MeshStandardMaterial | null = null;
export function registerShellPane(m: THREE.MeshStandardMaterial) { shellPane = m; }

/* Flames, runes and brews are emissive rather than lit, so they need their own
   handle: a candle that reads well at noon is invisible at midnight unless it
   is allowed to burn harder. */
const GLOWS = ['flame', 'candle', 'brew', 'glow_pane', 'rune_glow', 'rune_violet', 'orb', 'marker', 'portal_rim', 'specimen'];
const glowBase: Record<string, number> = {};

/** The multiplier lamps are currently running at. Anything animating a light's
 *  intensity per frame must fold this in, or it will simply undo the wash. */
let gain = 1;
export const interiorGain = () => gain;

/** Add a single light to the wash after the initial sweep — anything built
 *  later than scene construction, such as a project's specimen jar. */
export function registerLamp(light: THREE.Light, base: number, steady = false) {
  lamps.push(emitter(light, base, steady));
}

export function registerWindow(w: Omit<WindowRig, 'baseHalo' | 'baseSpot' | 'haloEm' | 'spotEm'>) {
  const haloEm = emitter(w.halo, w.halo.intensity);
  const spotEm = emitter(w.spot, w.spot.intensity);
  haloEm.sky = true;
  spotEm.sky = true;
  lamps.push(haloEm);
  spots.push(spotEm);
  windows.push({
    ...w, baseHalo: w.halo.intensity, baseSpot: w.spot.intensity, haloEm, spotEm,
  });
}

/** The directional lights a floor builder placed — the observatory's moons.
 *  Swept up like the point lights, but each keeps a permanent slot: a mirror
 *  at the scene root pointed the same way, so the count never moves while the
 *  storey comes and goes. */
export function registerDirectionals(root: THREE.Object3D) {
  const _w = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o as any).isDirectionalLight) return;
    const src = o as THREE.DirectionalLight;
    src.layers.set(OFFSTAGE);
    const pool = new THREE.DirectionalLight(src.color.getHex(), 0);
    /* A directional light is a direction, not a place, and the direction is
       the one from its position to its target. Baked once from the authored
       layout: a storey rising an inch during the opening does not change
       where the moon is. */
    pool.position.copy(src.getWorldPosition(_w));
    pool.name = 'dir_slot';
    rig.add(pool);
    dirs.push({ pool, src, base: src.intensity });
  });
  return dirs.length;
}

/** Every point light already placed by a floor builder — candles, braziers,
 *  the hearth, the cauldron — swept up in one pass once the tower is built.
 *  Window halos are skipped: they answer to the sky, not to the wizard. */
export function registerInteriorLights(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o as any).isPointLight) return;
    if (o.name === 'window_halo' || o.name === 'floor_fill') return;   // both driven separately, below
    lamps.push(emitter(
      o as THREE.Light,
      (o as THREE.PointLight).intensity,
      // these two are already animated by hand every frame
      o.name === 'wizard_light' || o.name === 'hearth_fire_light',
    ));
  });
}

/** A soft warm fill at the heart of each storey. Without it the interior goes
 *  genuinely black the moment the tower leaves a sunlit world, and the point
 *  of the place is that you can see into it. */
export function addFloorFill(fg: THREE.Object3D, y = 2.4) {
  const l = new THREE.PointLight(0xffdcae, 0, 9, 2);
  l.name = 'floor_fill';
  l.position.set(0, y, 0);
  fg.add(l);
  fills.push(emitter(l, 0));
  return l;
}

/** Every flame in the tower gets its own small warm light, unless one is
 *  already burning within `minGap` of it. The hearth and the brazier were lit
 *  by hand; the two dozen candles, sconces and burners were not, and a room
 *  lit only by an emissive quad reads as painted-on rather than lit.
 *
 *  Each light goes into its own storey's fx group, at the flame's position
 *  relative to that storey — so it travels, hides and lights with the floor,
 *  exactly like the lights the builders placed. Capped, because a point light
 *  is a real cost in every lit material's shader. */
export function addFlameLights(
  floors: { g: THREE.Object3D; fg: THREE.Object3D }[],
  materials: THREE.Material[],
  { max = 8, minGap = 1.7, colour = 0xffa54a, power = 6 } = {},
) {
  let added = 0;
  const _w = new THREE.Vector3();
  for (const f of floors) {
    f.g.updateMatrixWorld(true);
    // what is already lit on this storey, in the storey's own frame
    const taken: THREE.Vector3[] = [];
    f.fg.traverse((o) => {
      if ((o as any).isPointLight) taken.push(o.position.clone());
    });
    const flames: THREE.Vector3[] = [];
    f.g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m || Array.isArray(m) || !materials.includes(m)) return;
      if (o.name.includes('eye')) return;      // the cat's eyes are not a light source
      flames.push(f.g.worldToLocal(o.getWorldPosition(_w)).clone());
    });
    for (const p of flames) {
      if (added >= max) return added;
      if (taken.some((q) => q.distanceTo(p) < minGap)) continue;
      taken.push(p);
      const l = new THREE.PointLight(colour, 0, 4.2, 2);
      l.name = 'flame_light';
      l.position.copy(p).setY(p.y + 0.3);
      f.fg.add(l);
      lamps.push(emitter(l, power));
      added++;
    }
  }
  return added;
}

/* ------------------------------ the budget -------------------------------
 * A point light is not a cost you pay once. three compiles the count into
 * every lit material, so each one is another iteration of the lighting loop
 * in *every* fragment on screen — and the fragment that hurts is not a candle
 * flame two rooms away, it is the world's ground plane filling the window.
 * Seven storeys of candles, sconces, braziers, hearths, flame lights and floor
 * fills came to well over forty, which the town's paving shader was paying for
 * on every pixel of every frame.
 *
 * So only the ones that are actually doing something get a slot in the pool.
 * The score is a light's own falloff evaluated at the point the camera is
 * looking at: a light contributes what it contributes there, and the brightest
 * handful win. Nothing here changes what a lit room looks like when you are in
 * it — the storey you are looking at keeps its lights, because they are the
 * ones nearest the target.
 *
 * What the pool adds is that losing is now free. Membership changes as often
 * as it likes; the count the shaders were compiled against is the pool's size
 * and nothing else.
 */
let BUDGET = 12;
let SPOT_BUDGET = 2;

const pointPool: THREE.PointLight[] = [];
const spotPool: THREE.SpotLight[] = [];
const pointAt: (Emitter | null)[] = [];
const spotAt: (Emitter | null)[] = [];

/* Resizing the pool is the one thing here that does relink the shaders, so it
   happens only where a visitor is already being told the scene is changing:
   a quality tier moving, or `sim lights` typed into the console. */
function resizePools() {
  while (pointPool.length > BUDGET) rig.remove(pointPool.pop()!);
  while (pointPool.length < BUDGET) {
    const l = new THREE.PointLight(0xffffff, 0, 8, 2);
    l.name = 'point_slot';
    rig.add(l);
    pointPool.push(l);
  }
  while (spotPool.length > SPOT_BUDGET) {
    const l = spotPool.pop()!;
    rig.remove(l.target);
    rig.remove(l);
  }
  while (spotPool.length < SPOT_BUDGET) {
    const l = new THREE.SpotLight(0xffffff, 0, 18, 0.6, 0.7, 2);
    l.name = 'spot_slot';
    rig.add(l, l.target);
    spotPool.push(l);
  }
  pointAt.length = pointPool.length;
  spotAt.length = spotPool.length;
  pointAt.fill(null);
  spotAt.fill(null);
  cullLights();
}

export function setLightBudget(n: number) {
  const want = Math.max(0, Math.round(n));
  if (want === BUDGET) return BUDGET;
  BUDGET = want;
  resizePools();
  return BUDGET;
}
export const lightBudget = () => BUDGET;

/** How many window spots may be cast at once. A spot is the dearest light
 *  there is, and on a weak machine one is plenty. */
export function setSpotBudget(n: number) {
  const want = Math.max(0, Math.round(n));
  if (want === SPOT_BUDGET) return SPOT_BUDGET;
  SPOT_BUDGET = want;
  resizePools();
  return SPOT_BUDGET;
}
export const spotBudget = () => SPOT_BUDGET;

const _target = new THREE.Vector3();
const _lp = new THREE.Vector3();
/** Where the camera is looking. Scores are taken here rather than at the
 *  camera, so an orbit does not reshuffle the shortlist under you. */
export function setLightTarget(v: THREE.Vector3) { _target.copy(v); }

/** A light wants to burn if the wash says so and nothing it hangs from has
 *  been put away — a candle under a hidden storey, the wizard's lamp with the
 *  wizard off-screen, the whole fx group during a teleport. `visible` is read
 *  rather than written: these lights are never drawn, so it is the scene
 *  telling us what it means, not us telling the renderer what to do. */
function wanted(e: Emitter) {
  if (e.want === false) return false;
  for (let p: THREE.Object3D | null = e.src; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/** Fill `slots` with the best-scoring emitters from `pool`. */
function shortlist(cands: Emitter[], slots: (Emitter | null)[]) {
  if (!slots.length) return;
  _ranked.length = 0;
  for (const e of cands) {
    if (!wanted(e)) { e.score = -1; continue; }
    e.src.getWorldPosition(_lp);
    const d2 = _lp.distanceToSquared(_target);
    const r = (e.src as THREE.PointLight).distance || 8;
    // the light's own inverse-square falloff, evaluated where we are looking
    e.score = e.pin ? Infinity : e.base * (r * r) / (r * r + d2 * 4);
    _ranked.push(e);
  }
  _ranked.sort((a, b) => b.score - a.score);
  for (let i = 0; i < slots.length; i++) slots[i] = _ranked[i] ?? null;
}
const _ranked: Emitter[] = [];
const _pointCands: Emitter[] = [];

export function cullLights() {
  _pointCands.length = 0;
  for (const e of lamps) _pointCands.push(e);
  for (const e of fills) _pointCands.push(e);
  shortlist(_pointCands, pointAt);
  shortlist(spots, spotAt);
  syncLights();
}

/* ---------------------------- the copy ----------------------------
 * Every frame, because what a slot is copying moves and flickers: the
 * shortlist is re-scored a few times a second, but a candle's wobble and the
 * wizard's lamp walking up the stairs are per-frame facts. It is a couple of
 * dozen field copies over at most fourteen lights, and it is what keeps the
 * authored lights authoritative — intensity written anywhere else in the
 * scene arrives here without that code knowing the pool exists.
 */
const _v = new THREE.Vector3();
export function syncLights() {
  for (let i = 0; i < pointPool.length; i++) {
    const slot = pointPool[i];
    const e = pointAt[i];
    if (!e) { slot.intensity = 0; continue; }
    const src = e.src as THREE.PointLight;
    src.updateWorldMatrix(true, false);
    slot.position.setFromMatrixPosition(src.matrixWorld);
    slot.color.copy(src.color);
    slot.intensity = src.intensity;
    slot.distance = src.distance;
    slot.decay = src.decay;
  }
  for (let i = 0; i < spotPool.length; i++) {
    const slot = spotPool[i];
    const e = spotAt[i];
    if (!e) { slot.intensity = 0; continue; }
    const src = e.src as THREE.SpotLight;
    src.updateWorldMatrix(true, false);
    slot.position.setFromMatrixPosition(src.matrixWorld);
    src.target.updateWorldMatrix(true, false);
    slot.target.position.setFromMatrixPosition(src.target.matrixWorld);
    slot.color.copy(src.color);
    slot.intensity = src.intensity;
    slot.distance = src.distance;
    slot.decay = src.decay;
    slot.angle = src.angle;
    slot.penumbra = src.penumbra;
  }
  for (const d of dirs) {
    d.pool.color.copy(d.src.color);
    // no shortlist, just presence: lit when its storey is in view
    let vis = true;
    for (let p: THREE.Object3D | null = d.src; p; p = p.parent) if (!p.visible) { vis = false; break; }
    d.pool.intensity = vis ? d.src.intensity : 0;
  }
  void _v;
}

/** What the renderer is actually carrying, for `perf`. The pool sizes are the
 *  numbers compiled into every shader; `live` is how many are doing anything.
 */
export function lightStats() {
  let live = 0;
  for (const l of pointPool) if (l.intensity > 0) live++;
  for (const l of spotPool) if (l.intensity > 0) live++;
  for (const d of dirs) if (d.pool.intensity > 0) live++;
  return {
    point: pointPool.length,
    spot: spotPool.length,
    dir: dirs.length,
    live,
    sources: lamps.length + fills.length + spots.length + dirs.length,
  };
}

/* A candle is never steady. Every lamp gets its own phase and two
   incommensurate wobbles, so a room full of them shimmers rather than
   pulsing in unison — this is most of what separates a lit room from a room
   with lights in it. Called every frame; it is a handful of sines over a few
   dozen lights, and it is the cheapest life in the building. */
let flickerGain = 1;
export function tickLamps(t: number) {
  for (const l of lamps) {
    if (l.steady) continue;
    const f = 0.86 + 0.1 * Math.sin(t * 6.1 + l.phase) + 0.06 * Math.sin(t * 13.7 + l.phase * 2.3);
    l.src.intensity = l.base * flickerGain * f;
  }
}

/* ---------------- application ---------------- */

const _a = new THREE.Color(), _b = new THREE.Color();
const mix = (day: number, night: number, n: number) => _a.set(day).lerp(_b.set(night), n);
const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

/** Blend a world's day and night profiles and push the result everywhere. */
export function applyAmbience(world: string | null, night: number, lampGain = 1) {
  const pair = PROFILES[world || 'home'] || PROFILES.home;
  const n = clampNight(world, night);
  const sky = mix(pair.day.sky, pair.night.sky, n);
  const a: Ambience = {
    sky: sky.getHex(),
    through: lerp(pair.day.through, pair.night.through, n),
    pane: lerp(pair.day.pane, pair.night.pane, n),
    interior: lerp(pair.day.interior, pair.night.interior, n) * lampGain,
    fill: lerp(pair.day.fill, pair.night.fill, n),
  };

  const glass = M.window_glass;
  glass.color.copy(sky);
  glass.emissive.copy(sky);
  // A pane is never fully opaque now; it just carries more of the outside
  // when the outside is bright.
  glass.emissiveIntensity = a.pane * 1.9;
  glass.opacity = 0.14 + a.pane * 0.22;

  shaftMat.color.copy(sky);
  shaftMat.opacity = 0.035 + a.through * 0.14;

  /* Lights that contribute nothing lose their slot rather than being left at
     a token intensity, and a slot with nothing in it costs one multiply by
     zero. Crossing dusk therefore reshuffles the pool and recompiles nothing,
     which is the whole point of it. */
  const skyLit = a.through > 0.06;
  for (const w of windows) {
    w.halo.color.copy(sky);
    w.halo.intensity = w.baseHalo * a.through;
    w.spot.color.copy(sky);
    w.spot.intensity = w.baseSpot * a.through;
    w.haloEm.want = skyLit;
    w.spotEm.want = skyLit;
    w.shaft.visible = skyLit;
  }
  if (shellPane) {
    shellPane.color.copy(sky);
    shellPane.emissive.copy(sky);
    shellPane.emissiveIntensity = a.pane * 0.9;
    shellPane.opacity = 0.12 + a.pane * 0.2;
  }

  flickerGain = a.interior;
  for (const l of lamps) {
    // the window halos are in this list for the budget's sake only — what
    // they carry is the sky, set in the window loop above
    if (l.sky) continue;
    l.src.intensity = l.base * a.interior;
    l.want = a.interior > 0.05;
  }
  lastFill = a.fill;
  applyFills();          // ends in cullLights(), which decides what is on
  gain = a.interior;

  // Emissive props burn harder after dark. Captured once, on first use, so the
  // authored value in materials.ts stays the daylight reference.
  const glowMul = 0.85 + (a.interior - 0.7) * 0.55;
  for (const name of GLOWS) {
    const m = M[name];
    if (!m) continue;
    if (glowBase[name] === undefined) glowBase[name] = m.emissiveIntensity;
    m.emissiveIntensity = glowBase[name] * glowMul;
  }

  return a;
}
