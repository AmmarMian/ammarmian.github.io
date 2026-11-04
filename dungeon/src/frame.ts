/* Everything the scene shader needs for one frame, shared by the browser
 * loop and the headless renderer. */
import { type View, BASE_ZOOM, basis } from './camera.ts';
import type { Particles } from './particles.ts';
import type { FloorData } from './gen/types.ts';

export function frameParams(floor: FloorData, view: View, res: [number, number], time: number, particles: Particles, focus: number, focusAmt: number) {
  const b = basis(view.yaw);
  const zoom = BASE_ZOOM * view.zoom;
  const nParticles = particles.update(time, b, view.target, res, zoom, focus, focusAmt);
  return {
    center: view.target, time, zoom, res,
    camR: b.R, camU: b.U, camD: b.D,
    cut: b.cut,
    nRooms: floor.rooms.length,
    nParticles,
    focus, focusAmt,
  };
}
