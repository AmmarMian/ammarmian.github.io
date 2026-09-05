import * as THREE from 'three';

export interface BookItem {
  o: THREE.Object3D; r: number; a0: number; y: number; sp: number; c: THREE.Vector3;
  face?: boolean; tilt?: boolean;
}
export interface RingItem {
  o: THREE.Object3D;
  spin?: number;
  /** Which axis `spin` turns about. Defaults to z, which is right for a flat
   *  ring lying in the XY plane and catastrophically wrong for anything that
   *  stands on a base — a Z spin topples it over sideways. */
  axis?: 'x' | 'y' | 'z';
  bob?: number;
  phase?: number;
}

export interface Anim {
  books: BookItem[];
  rings: RingItem[];
  candles: any[];
  portal: null | {
    view: THREE.Group; worlds: { name: string; g: THREE.Group }[]; i: number; at: number; flash?: number;
    /** a destination to hold in the ring instead of cycling — the gate's
     *  preview, set while a row is hovered in the destination list */
    pin?: string | null;
  };
  dial?: { wheel: THREE.Group; lever: THREE.Group };
  spirit?: { g: THREE.Group; tongues: THREE.Mesh[]; core: THREE.Mesh; mouth: THREE.Mesh };
  fireLight?: THREE.PointLight;
  /** flame tongues that lick: scaled and swayed on their own phase */
  fire?: THREE.Mesh[];
  /** the bathhouse: rocking water, a running tap, and the view out */
  bath?: {
    water: THREE.Mesh; surface: THREE.Mesh; stream: THREE.Mesh; tap: THREE.Group; lever: THREE.Mesh;
    tray: THREE.Group; petals: THREE.Mesh[];
    steam: { m: THREE.Points; pos: Float32Array; vel: Float32Array };
    uVista: { value: number }; uT: { value: number }; vistaLight: THREE.PointLight;
    /** 0 = empty, 1 = brim-full. `filling` is seconds of tap left to run. */
    fill: number; filling: number;
  };
  /** the kettle's steam, parented to the hearth */
  steam?: { m: THREE.Points; pos: Float32Array; vel: Float32Array };
  /** bound project jars: the brew turns over and the glass breathes */
  specimens: { body: THREE.Mesh; light: THREE.PointLight; phase: number }[];
  chores?: any[];
}

export function createAnim(): Anim {
  return { books: [], rings: [], candles: [], specimens: [], portal: null };
}
