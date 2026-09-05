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

/* ---------------- registries ---------------- */

type WindowRig = {
  halo: THREE.PointLight;
  spot: THREE.SpotLight;
  shaft: THREE.Mesh;
  baseHalo: number;
  baseSpot: number;
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
    f.intensity = 2.6 * lastFill * (i === occupied ? 2.0 : 0.7);
    f.userData.want = lit;
    // whichever storey he is on is never a candidate for being culled
    f.userData.pin = lit && i === occupied;
  });
  cullLights();
}

type Lamp = {
  light: THREE.Light;
  base: number;
  phase: number;
  steady?: boolean;
  /** what the wash wants of it — the budget below has the final say */
  want?: boolean;
  /** on this frame's shortlist */
  lit?: boolean;
};
const windows: WindowRig[] = [];
const lamps: Lamp[] = [];
const fills: THREE.PointLight[] = [];
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
  lamps.push({ light, base, phase: Math.random() * 6.283, steady });
}

export function registerWindow(rig: Omit<WindowRig, 'baseHalo' | 'baseSpot'>) {
  windows.push({ ...rig, baseHalo: rig.halo.intensity, baseSpot: rig.spot.intensity });
}

/** Every point light already placed by a floor builder — candles, braziers,
 *  the hearth, the cauldron — swept up in one pass once the tower is built.
 *  Window halos are skipped: they answer to the sky, not to the wizard. */
export function registerInteriorLights(root: THREE.Object3D) {
  root.traverse((o) => {
    if (!(o as any).isPointLight) return;
    if (o.name === 'window_halo' || o.name === 'floor_fill') return;   // both driven separately, below
    lamps.push({
      light: o as THREE.Light,
      base: (o as THREE.PointLight).intensity,
      phase: Math.random() * 6.283,
      // these two are already animated by hand every frame
      steady: o.name === 'wizard_light' || o.name === 'hearth_fire_light',
    });
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
  fills.push(l);
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
      lamps.push({ light: l, base: power, phase: Math.random() * 6.283 });
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
 * So only the ones that are actually doing something get to be on. The score
 * is a light's own falloff evaluated at the point the camera is looking at:
 * a light contributes what it contributes there, and the brightest handful
 * win. Nothing here changes what a lit room looks like when you are in it —
 * the storey you are looking at keeps its lights, because they are the ones
 * nearest the target.
 *
 * The count is what must stay stable, not the membership: three only rebuilds
 * the lighting uniforms (and re-keys the programs) when the *number* of lights
 * changes, so swapping which ten are on is free, while going from ten to nine
 * is not. Hence the shortlist is always filled right up to the budget, even
 * with lights that are contributing almost nothing, and it is only rebuilt
 * when the camera target actually moves.
 */
let BUDGET = 10;
export function setLightBudget(n: number) {
  BUDGET = Math.max(0, Math.round(n));
  cullLights();
  return BUDGET;
}
export const lightBudget = () => BUDGET;

const _target = new THREE.Vector3();
const _lp = new THREE.Vector3();
/** Where the camera is looking. Scores are taken here rather than at the
 *  camera, so an orbit does not reshuffle the shortlist under you. */
export function setLightTarget(v: THREE.Vector3) { _target.copy(v); }

function ancestorsVisible(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

type Cand = { light: THREE.Light; score: number };
const _cands: Cand[] = [];
export function cullLights() {
  _cands.length = 0;
  const consider = (light: THREE.Light, base: number, want: boolean, pin = false) => {
    if (!want) { light.visible = false; return; }
    /* A light under a hidden storey is never uploaded at all, so it neither
       costs anything nor deserves a place on the shortlist. Its own `visible`
       is left alone — putting it back is the storey's business, not ours. */
    if (!ancestorsVisible(light.parent!)) { light.visible = true; return; }
    light.getWorldPosition(_lp);
    const d2 = _lp.distanceToSquared(_target);
    const r = (light as THREE.PointLight).distance || 8;
    // the light's own inverse-square falloff, evaluated where we are looking
    _cands.push({ light, score: pin ? Infinity : base * (r * r) / (r * r + d2 * 4) });
  };
  for (const l of lamps) consider(l.light, l.base, l.want !== false);
  for (const f of fills) consider(f, f.intensity, !!f.userData.want, !!f.userData.pin);
  _cands.sort((a, b) => b.score - a.score);
  for (let i = 0; i < _cands.length; i++) _cands[i].light.visible = i < BUDGET;
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
    l.light.intensity = l.base * flickerGain * f;
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

  /* Lights that contribute nothing are switched off rather than left at a
     token intensity: three only uploads and loops over *visible* lights, and
     with six storeys of candles, four window rigs and a fill per floor this
     scene carries enough of them for that to matter in every lit fragment.
     The count only changes when the sky crosses a threshold — once at dusk,
     once at dawn, on a teleport — so the recompile it costs is rare. */
  const skyLit = a.through > 0.06;
  for (const w of windows) {
    w.halo.color.copy(sky);
    w.halo.intensity = w.baseHalo * a.through;
    w.spot.color.copy(sky);
    w.spot.intensity = w.baseSpot * a.through;
    w.halo.visible = skyLit;
    w.spot.visible = skyLit;
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
    l.light.intensity = l.base * a.interior;
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
