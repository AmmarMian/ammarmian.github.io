/* Everything the scene shader needs for one frame, shared by the browser
 * loop and the headless renderer. */
import { type View, BASE_ZOOM, basis, focus } from './camera.ts';
import type { Particles } from './particles.ts';
import { type Room, roomCenter, roomParams } from './room.ts';

export function frameParams(room: Room, view: View, res: [number, number], time: number, particles: Particles) {
  const b = basis(view.yaw);
  const center = focus(roomCenter(room), b, view.pan);
  const zoom = BASE_ZOOM * view.zoom;
  const nParticles = particles.update(time, b, center, res, zoom);
  return {
    ...roomParams(room),
    center, time, zoom, res,
    camR: b.R, camU: b.U, camD: b.D,
    cut: b.cut,
    nParticles,
    pad: [0, 0] as [number, number],
  };
}
