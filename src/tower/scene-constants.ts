/* Storey order, bottom to top. The bathhouse is a *cellar*: it sits below the
   sanctum, under the ground the tower stands on, and is the only storey you
   cannot see from outside. Reach it through the trapdoor in the sanctum floor
   or with `bath` in the console.

   Everything refers to these by name, so the order can change as long as all
   four lists stay in step — and as long as GROUND moves with them. */
export const F = { bath: 0, sanctum: 1, quarters: 2, kitchen: 3, library: 4, lab: 5, observatory: 6 };
export const NF = 7;
export const FLOOR_IDS = ['floor_bath', 'floor_sanctum', 'floor_sleeping', 'floor_kitchen', 'floor_library', 'floor_laboratory', 'floor_observatory'];
export const FLOOR_NAMES = ['Bath cellar', 'Portal sanctum', 'Sleeping quarters', 'Kitchen', 'Library', 'Laboratory', 'Observatory'];

/** The storey that stands at ground level. Anything below it is underground. */
export const GROUND = F.sanctum;
/** How many storeys are above ground — what the outer shell is built from. */
export const NF_ABOVE = NF - GROUND;
/** Local Y of a storey's floor. Ground level is 0, so cellars are negative. */
export const floorY = (k: number) => (k - GROUND) * FH_;
const FH_ = 6.2;   // kept local; util.ts owns the exported FH and imports nothing
