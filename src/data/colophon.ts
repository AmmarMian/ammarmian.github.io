/* ================================ colophon ==============================
 * A colophon is the note at the end of a book naming who made it and with
 * what. This one lives on the lectern in the library, which is the only book
 * in the tower that is not a publication — and it is the same content the
 * text page and both consoles print, so there is one copy of it and no way
 * for the three to drift apart.
 *
 * The block is written as a drawing's title block on purpose. A technical
 * drawing has always carried separate DESIGN and DRAWN fields — the person
 * who decided what the thing is, and the hand that produced the sheet — and
 * that is exactly the distinction this site needs to make. It is a real
 * convention rather than a hedge, and the tower already stands on a blueprint.
 */

export interface ColophonRow {
  field: string;
  value: string;
  /** The quiet second line, where the field needs one. */
  note?: string;
}

export const COLOPHON_TITLE = 'On the building of this tower';

export const COLOPHON_BLOCK: ColophonRow[] = [
  { field: 'Design', value: 'Ammar Mian' },
  { field: 'Drawn', value: 'Claude Opus 5', note: 'in Claude Code' },
  { field: 'Stack', value: 'three.js 0.184 · TypeScript 5.6', note: 'Vite 5.4 · anime.js 3.2' },
  { field: 'Type', value: 'Space Grotesk · JetBrains Mono' },
  { field: 'Source', value: 'HAL open archive', note: 'the shelves are fetched live, never a snapshot' },
  { field: 'Build', value: 'GitHub Actions → Pages', note: 'a static site; there is no server' },
];

/** The note under the block, in the keeper's own voice. */
export const COLOPHON_NOTE: string[] = [
  'Every room, every material and every tool here was chosen and specified by me. The code that builds them was written in conversation with Claude Opus 5.',
  'There are no models and no textures anywhere in this site. Every shape in the tower is built from boxes and cylinders in code — the grain in the floorboards, the bark on the trees and the rust on the cars are all noise functions written into the shaders.',
];
