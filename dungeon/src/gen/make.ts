import { buildFloor, packFloor } from './floor.ts';
import type { FloorData } from './types.ts';

export function makeFloor(index: number): FloorData {
  const f = buildFloor(index);
  const { vox, table } = packFloor(f);
  return {
    index, name: f.name, bounds: f.bounds, vox, table,
    rooms: f.rooms.map(({ grid: _g, bricks: _b, ...meta }) => meta),
  };
}
