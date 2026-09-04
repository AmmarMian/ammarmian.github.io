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
  chores?: any[];
}

export function createAnim(): Anim {
  return { books: [], rings: [], candles: [], portal: null };
}
