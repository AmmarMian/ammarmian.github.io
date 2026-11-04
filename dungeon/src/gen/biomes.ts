/* Each floor of the tower is its own world: a biome sets the stone, the
 * liquid, the weather, the light and the rooms that can appear on it. */
import type { V3, EmitterKind } from './core.ts';
import type { BiomeStyle } from './build.ts';

export interface Biome {
  id: string;
  name: string;
  style: BiomeStyle;
  themes: string[]; // room themes, favourites first
  weather?: { kind: EmitterKind; perRoom: number };
  corridor: { wall: number; floor: BiomeStyle['floor'] };
  /* light and colour, read by the shaders */
  ambLo: V3; ambHi: V3; sun: V3;
  bgNear: V3; bgFar: V3;
  mist: V3; shaft: V3; haze: V3; outside: V3;
  tintLo: V3; tintHi: V3;
}

const brick = 3, sandstone = 54, ice = 57, basalt = 59, marble = 46, plank = 9;

export const BIOMES: Biome[] = [
  {
    id: 'sunken', name: 'The Drowned Ground',
    style: { wall: 'brick', floor: 'flag', liquid: 0, decor: 'vines', mossy: true },
    themes: ['flooded', 'garden', 'grotto', 'shrine', 'flooded'],
    corridor: { wall: brick, floor: 'flag' },
    ambLo: [0.19, 0.30, 0.33], ambHi: [0.44, 0.58, 0.50], sun: [1.55, 1.42, 0.92],
    bgNear: [0.05, 0.11, 0.11], bgFar: [0.015, 0.035, 0.04],
    mist: [0.42, 0.62, 0.56], shaft: [0.95, 0.98, 0.70], haze: [0.10, 0.22, 0.22], outside: [0.80, 0.93, 0.62],
    tintLo: [0.80, 1.0, 1.08], tintHi: [1.06, 1.04, 0.86],
  },
  {
    id: 'desert', name: 'The Sunscorched Halls',
    style: { wall: 'sandstone', floor: 'sandtile', liquid: 0, decor: 'none', mossy: false },
    themes: ['oasis', 'tomb', 'bazaar', 'dunehall', 'obelisk'],
    weather: { kind: 'sand', perRoom: 40 },
    corridor: { wall: sandstone, floor: 'sand' },
    ambLo: [0.34, 0.25, 0.20], ambHi: [0.72, 0.58, 0.43], sun: [1.75, 1.42, 0.92],
    bgNear: [0.17, 0.11, 0.07], bgFar: [0.05, 0.03, 0.025],
    mist: [0.86, 0.70, 0.50], shaft: [1.0, 0.88, 0.60], haze: [0.36, 0.23, 0.14], outside: [1.0, 0.86, 0.56],
    tintLo: [1.04, 0.93, 0.86], tintHi: [1.08, 1.0, 0.84],
  },
  {
    id: 'ice', name: 'The Frozen Spire',
    style: { wall: 'ice', floor: 'snow', liquid: 2, decor: 'icicles', mossy: false },
    themes: ['frozenlake', 'icecave', 'frostgarden', 'hearth', 'frozenlake'],
    weather: { kind: 'snow', perRoom: 70 },
    corridor: { wall: ice, floor: 'snow' },
    ambLo: [0.24, 0.32, 0.44], ambHi: [0.64, 0.76, 0.90], sun: [1.25, 1.32, 1.45],
    bgNear: [0.08, 0.12, 0.18], bgFar: [0.02, 0.03, 0.06],
    mist: [0.78, 0.88, 0.97], shaft: [0.85, 0.95, 1.0], haze: [0.30, 0.40, 0.52], outside: [0.86, 0.94, 1.0],
    tintLo: [0.88, 0.98, 1.12], tintHi: [1.0, 1.03, 1.08],
  },
  {
    id: 'archive', name: 'The Endless Archive',
    style: { wall: 'plaster', floor: 'plank', liquid: 0, decor: 'none', mossy: false },
    themes: ['readinghall', 'library', 'observatory', 'scriptorium', 'library'],
    weather: { kind: 'sparkle', perRoom: 20 },
    corridor: { wall: plank, floor: 'plank' },
    ambLo: [0.26, 0.20, 0.16], ambHi: [0.56, 0.45, 0.35], sun: [1.45, 1.28, 0.95],
    bgNear: [0.10, 0.07, 0.05], bgFar: [0.03, 0.02, 0.02],
    mist: [0.55, 0.46, 0.36], shaft: [1.0, 0.92, 0.72], haze: [0.18, 0.13, 0.09], outside: [0.92, 0.86, 0.70],
    tintLo: [1.0, 0.93, 0.9], tintHi: [1.08, 1.02, 0.86],
  },
  {
    id: 'volcanic', name: 'The Molten Works',
    style: { wall: 'basalt', floor: 'basalt', liquid: 1, decor: 'none', mossy: false },
    themes: ['lavahall', 'forge', 'foundry', 'lab', 'lavahall'],
    weather: { kind: 'ash', perRoom: 22 },
    corridor: { wall: basalt, floor: 'basalt' },
    ambLo: [0.32, 0.18, 0.15], ambHi: [0.66, 0.42, 0.32], sun: [1.6, 0.92, 0.52],
    bgNear: [0.13, 0.045, 0.03], bgFar: [0.03, 0.01, 0.01],
    mist: [0.50, 0.30, 0.24], shaft: [1.0, 0.62, 0.36], haze: [0.24, 0.09, 0.05], outside: [1.0, 0.56, 0.26],
    tintLo: [1.05, 0.86, 0.86], tintHi: [1.1, 0.98, 0.82],
  },
  {
    id: 'celestial', name: 'The Gilded Crown',
    style: { wall: 'marble', floor: 'marble', liquid: 0, decor: 'none', mossy: false },
    themes: ['throne', 'treasury', 'stargarden', 'shrine', 'observatory'],
    weather: { kind: 'star', perRoom: 30 },
    corridor: { wall: marble, floor: 'marble' },
    ambLo: [0.17, 0.17, 0.30], ambHi: [0.44, 0.44, 0.64], sun: [0.85, 0.95, 1.35],
    bgNear: [0.06, 0.06, 0.14], bgFar: [0.01, 0.01, 0.04],
    mist: [0.62, 0.62, 0.88], shaft: [0.76, 0.84, 1.0], haze: [0.12, 0.12, 0.26], outside: [0.34, 0.40, 0.78],
    tintLo: [0.9, 0.92, 1.12], tintHi: [1.08, 1.02, 0.88],
  },
];

/* The colours the scene shader reads, as vec4s, in this order. */
export const biomeHeader = (b: Biome) => [b.ambLo, b.ambHi, b.sun, b.bgNear, b.bgFar, b.mist, b.shaft, b.haze, b.outside];
