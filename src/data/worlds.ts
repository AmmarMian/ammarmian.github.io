/** Names for the backdrop worlds, shared by the destination gate and the
 *  sanctum floor's panel so the two can't describe the same place
 *  differently. */
export const WORLD_LABELS: Record<string, string> = {
  seafloor: 'Sea floor',
  moon: 'The moon',
  forest: 'Deep forest',
  beach: 'Beach',
  city: 'Abandoned city',
  space: 'Deep space',
  rain: 'Endless rain',
};

export const WORLD_BLURBS: Record<string, string> = {
  seafloor: 'Caustics, whales, fish schools, kelp',
  moon: 'A ringed gas giant low over the horizon',
  forest: 'Instanced trunks, ferns, light shafts',
  beach: 'Shoaling waves, sun glitter, a surf line',
  city: 'Lit windows, stopped cars, a patrolling eye',
  space: 'Nebulae, a red sun, an ocean world adrift',
  rain: 'A drowned moor, dead trees, a sky that never clears',
};
