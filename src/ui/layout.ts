/* How much of the screen a side panel takes, in px — the one number the
   camera framing (tower/focus.ts) and the figure caption both need to agree
   with the CSS on. Keep in step with .callout and .console in style.css. */
export const NARROW_QUERY = '(max-width: 900px)';

export function panelColumn(W: number): number {
  return Math.min(760, Math.max(380, 0.42 * W));
}

export function panelTaken(W: number, consoleOpen: boolean): number {
  return consoleOpen
    ? 0.05 * W + Math.min(Math.max(400, 0.46 * W), 820)
    : 0.04 * W + panelColumn(W) + 24;
}

/** Top and bottom bands kept clear of the figure on a wide screen: the nav
 *  rail above, the figure caption below. */
export const FIGURE_TOP_PX = 80;
export const FIGURE_BOTTOM_PX = 64;
