import type { Emitter, Light, V3, Window } from './core.ts';
import type { Biome } from './biomes.ts';

/* What the main thread keeps of a room once its voxels are on the GPU. */
export interface RoomMeta {
  name: string;
  theme: string;
  kind: 'room' | 'corridor';
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  windows: Window[];
  lights: Light[];
  emitters: Emitter[];
  sky: boolean;
  amb: V3;
  stairsUp: boolean;
  stairsDown: boolean;
  liquid: number;
}

export interface FloorData {
  index: number;
  name: string;
  biome: Biome;
  rooms: RoomMeta[];
  bounds: [number, number, number, number];
  vox: Uint32Array<ArrayBuffer>;
  table: Float32Array<ArrayBuffer>;
}
