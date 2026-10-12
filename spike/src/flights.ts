/* A book leaves its shelf, flies out into the room, hovers and turns its pages, then comes back and slides into
 * the gap it left. Everything here is pure maths on a clock: it says where one book is at time t, and whether
 * the copy on the shelf is out of its slot. The renderer hides the shelf instance and draws the open-book mesh
 * in its place for as long as the book is away, so the same object is never in two places.
 *
 * The open-book mesh is modelled flat with its spine along local z and the leaves out along +-x, hinged by
 * `open` (0 flat, pi/2 shut). Standing shut with its pages up the mesh's y, a shelf book is that mesh turned a
 * quarter about x, so pitch = pi/2 and open = pi/2 is the book on the shelf. */

export type V3 = [number, number, number];

export interface Slot { pos: V3; yaw: number; tint: V3; depth: number; inst: number }
export interface Orbit { r: number; a0: number; sp: number; y: number }
export interface Pose { pos: V3; yaw: number; pitch: number; roll: number; open: number; flap: number; away: boolean }

export const CYCLE = 18;
const T = { pull: 1.5, depart: 3.0, hover: 8.0, ret: 2.6, slide: 1.3 };
const SHUT = Math.PI / 2;
const OPEN = 0.5;

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
const bez = (p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [0, 1, 2].map((k) => a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k]) as V3;
};
const turn = (from: number, to: number, t: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
};

export function orbitPoint(o: Orbit, c: V3, time: number): { pos: V3; yaw: number; roll: number; pitch: number } {
  const a = o.a0 + time * o.sp;
  return {
    pos: [c[0] + Math.cos(a) * o.r, o.y + Math.sin(time * 1.3 + o.a0) * 0.18, c[2] + Math.sin(a) * o.r],
    yaw: -a + Math.PI / 2,
    pitch: Math.sin(time * 0.9 + o.a0) * 0.16,
    roll: Math.sin(time * 1.4 + o.a0) * 0.1,
  };
}

/** Where the book is `u` seconds into its cycle. `time` is the absolute clock, which the hover orbit follows. */
export function flightPose(slot: Slot, o: Orbit, c: V3, u: number, time: number): Pose {
  const out: V3 = [Math.sin(slot.yaw), 0, Math.cos(slot.yaw)];       // toward the wall
  const inn: V3 = [-out[0], 0, -out[2]];
  const spine = add(slot.pos, inn, slot.depth / 2);                    // the spine hinge, on the shelf front
  const pulled = add(spine, inn, 0.34);                                // slid out of its slot
  const tDepart = T.pull, tHover = T.pull + T.depart, tRet = tHover + T.hover, tSlide = tRet + T.ret, tEnd = tSlide + T.slide;
  const shut = { pitch: SHUT, roll: 0, open: SHUT, flap: 0 };

  if (u < tDepart) {
    const s = smooth(u / T.pull);
    return { pos: add(spine, inn, 0.34 * s), yaw: slot.yaw, ...shut, away: true };
  }
  if (u < tHover) {
    const s = smooth((u - tDepart) / T.depart);
    const end = orbitPoint(o, c, time + (tHover - u));                 // where the orbit will be on arrival
    const pos = bez(pulled, add(add(pulled, inn, 1.3), [0, 0.7, 0]), add(add(end.pos, [end.pos[0] - c[0], 0, end.pos[2] - c[2]], 0.5), [0, 0.5, 0]), end.pos, s);
    const unfold = smooth((s - 0.25) / 0.75);
    return { pos, yaw: turn(slot.yaw, end.yaw, s), pitch: mix(SHUT, end.pitch, s), roll: mix(0, end.roll, s), open: mix(SHUT, OPEN, unfold), flap: unfold, away: true };
  }
  if (u < tRet) {
    const p = orbitPoint(o, c, time);
    return { pos: p.pos, yaw: p.yaw, pitch: p.pitch, roll: p.roll, open: OPEN, flap: 1, away: true };
  }
  if (u < tSlide) {
    const s = smooth((u - tRet) / T.ret);
    const start = orbitPoint(o, c, time - (u - tRet));
    const pos = bez(start.pos, add(add(start.pos, [start.pos[0] - c[0], 0, start.pos[2] - c[2]], 0.4), [0, 0.5, 0]), add(add(pulled, inn, 1.3), [0, 0.7, 0]), pulled, s);
    const fold = smooth(s / 0.7);
    return { pos, yaw: turn(start.yaw, slot.yaw, s), pitch: mix(start.pitch, SHUT, s), roll: mix(start.roll, 0, s), open: mix(OPEN, SHUT, fold), flap: 1 - fold, away: true };
  }
  if (u < tEnd) {
    const s = smooth((u - tSlide) / T.slide);
    return { pos: add(pulled, inn, -0.34 * s), yaw: slot.yaw, ...shut, away: u < tEnd - 0.02 };
  }
  return { pos: spine, yaw: slot.yaw, ...shut, away: false };
}
