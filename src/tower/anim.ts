import * as THREE from 'three';

export interface BookItem {
  o: THREE.Object3D; r: number; a0: number; y: number; sp: number; c: THREE.Vector3;
  face?: boolean; tilt?: boolean;
}
export interface RingItem {
  o: THREE.Object3D; spin?: number; bob?: number; phase?: number;
}

export interface Anim {
  books: BookItem[];
  rings: RingItem[];
  candles: any[];
  portal: null | { view: THREE.Group; worlds: { name: string; g: THREE.Group }[]; i: number; at: number; flash?: number };
  dial?: { wheel: THREE.Group; lever: THREE.Group };
  spirit?: { g: THREE.Group; tongues: THREE.Mesh[]; core: THREE.Mesh; mouth: THREE.Mesh };
  fireLight?: THREE.PointLight;
  /** flame tongues that lick: scaled and swayed on their own phase */
  fire?: THREE.Mesh[];
  /** the kettle's steam, parented to the hearth */
  steam?: { m: THREE.Points; pos: Float32Array; vel: Float32Array };
  /** bound project jars: the brew turns over and the glass breathes */
  specimens: { body: THREE.Mesh; light: THREE.PointLight; phase: number }[];
  chores?: any[];
}

export function createAnim(): Anim {
  return { books: [], rings: [], candles: [], specimens: [], portal: null };
}
