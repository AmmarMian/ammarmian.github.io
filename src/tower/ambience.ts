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
const windows: WindowRig[] = [];
const lamps: { light: THREE.Light; base: number }[] = [];
const fills: THREE.PointLight[] = [];
/* The outer shell's window panes. Same idea as the interior oculi — glass,
   not lamps — but the shell lives in worlds.js, which hands its material over
   once it has been built. */
let shellPane: THREE.MeshStandardMaterial | null = null;
export function registerShellPane(m: THREE.MeshStandardMaterial) { shellPane = m; }

/* Flames, runes and brews are emissive rather than lit, so they need their own
   handle: a candle that reads well at noon is invisible at midnight unless it
   is allowed to burn harder. */
const GLOWS = ['flame', 'candle', 'brew', 'glow_pane', 'rune_glow', 'rune_violet', 'orb', 'marker', 'portal_rim'];
const glowBase: Record<string, number> = {};

/** The multiplier lamps are currently running at. Anything animating a light's
 *  intensity per frame must fold this in, or it will simply undo the wash. */
let gain = 1;
export const interiorGain = () => gain;

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
    lamps.push({ light: o as THREE.Light, base: (o as THREE.PointLight).intensity });
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
      lamps.push({ light: l, base: power });
      added++;
    }
  }
  return added;
}

/* ---------------- application ---------------- */

const _a = new THREE.Color(), _b = new THREE.Color();
const mix = (day: number, night: number, n: number) => _a.set(day).lerp(_b.set(night), n);
const lerp = (a: number, b: number, n: number) => a + (b - a) * n;

/** Blend a world's day and night profiles and push the result everywhere. */
export function applyAmbience(world: string | null, night: number) {
  const pair = PROFILES[world || 'home'] || PROFILES.home;
  const n = clampNight(world, night);
  const sky = mix(pair.day.sky, pair.night.sky, n);
  const a: Ambience = {
    sky: sky.getHex(),
    through: lerp(pair.day.through, pair.night.through, n),
    pane: lerp(pair.day.pane, pair.night.pane, n),
    interior: lerp(pair.day.interior, pair.night.interior, n),
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

  for (const w of windows) {
    w.halo.color.copy(sky);
    w.halo.intensity = w.baseHalo * a.through;
    w.spot.color.copy(sky);
    w.spot.intensity = w.baseSpot * a.through;
    w.shaft.visible = a.through > 0.05;
  }
  if (shellPane) {
    shellPane.color.copy(sky);
    shellPane.emissive.copy(sky);
    shellPane.emissiveIntensity = a.pane * 0.9;
    shellPane.opacity = 0.12 + a.pane * 0.2;
  }

  for (const l of lamps) l.light.intensity = l.base * a.interior;
  for (const f of fills) f.intensity = 2.6 * a.fill;
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
