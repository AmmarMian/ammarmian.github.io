/* Storey order, bottom to top. The bathhouse sits between the sleeping
   quarters and the kitchen: the private half of the tower is the lower half,
   and it wants to be reached from the bedroom rather than from the library.
   Everything else refers to these by name, so inserting here is safe as long
   as all four lists stay in step. */
export const F = { sanctum: 0, quarters: 1, bath: 2, kitchen: 3, library: 4, lab: 5, observatory: 6 };
export const NF = 7;
export const FLOOR_IDS = ['floor_sanctum', 'floor_sleeping', 'floor_bath', 'floor_kitchen', 'floor_library', 'floor_laboratory', 'floor_observatory'];
export const FLOOR_NAMES = ['Portal sanctum', 'Sleeping quarters', 'Bathhouse', 'Kitchen', 'Library', 'Laboratory', 'Observatory'];
