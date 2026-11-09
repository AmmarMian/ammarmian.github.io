/* Light and dark.

   By default the page follows the scene: Paper while the tower stands in
   daylight, Night after dark (scene.ts reports which through setAutoTheme).
   A visitor can pin either one; the choice is remembered in this browser.
   Whatever wins is written to <html data-theme>, which every colour in the
   stylesheet reads, and announced as a `lair-theme` event so the scene can
   re-ink its floor grid. */

export type ThemePref = 'auto' | 'paper' | 'night';
export type Theme = 'paper' | 'night';

const KEY = 'lair-theme';
const ORDER: ThemePref[] = ['auto', 'paper', 'night'];

let pref: ThemePref = 'auto';
try {
  const v = localStorage.getItem(KEY) as ThemePref | null;
  if (v && ORDER.includes(v)) pref = v;
} catch {}
let auto: Theme = 'night';

export type LightMode = 'auto' | 'day' | 'night';
const LIGHT_OF: Record<ThemePref, LightMode> = { auto: 'auto', paper: 'day', night: 'night' };
const PREF_OF: Record<LightMode, ThemePref> = { auto: 'auto', day: 'paper', night: 'night' };

/* Where there is a scene, the theme and the scene's light are one setting.
   They used to be two, and pinning Paper while the tower stood at night (or
   in the city, which is always night) put light glass over a dark world,
   unreadable. Now choosing light makes it day, choosing dark makes it night,
   and the page always takes its theme from the light actually falling —
   including in the worlds that refuse to change the hour. */
let light: ((mode: LightMode) => void) | null = null;

export function themePref(): ThemePref { return pref; }
export function effectiveTheme(): Theme { return light || pref === 'auto' ? auto : pref; }

/** Called once by the scene: from here on, a theme choice is a light choice. */
export function linkThemeToLight(setLight: (mode: LightMode) => void) {
  light = setLight;
  setLight(LIGHT_OF[pref]);
  apply();
}

/** The light was pinned from somewhere else (the console, the Display
 *  panel): the theme choice follows it, without calling back. */
export function themeFollowsLight(mode: LightMode) {
  pref = PREF_OF[mode];
  try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch {}
  apply();
}

function apply() {
  const t = effectiveTheme();
  if (document.documentElement.dataset.theme !== t) document.documentElement.dataset.theme = t;
  window.dispatchEvent(new CustomEvent('lair-theme', { detail: { theme: t, pref } }));
}

/** What the scene's own light says, for when the visitor has not chosen. */
export function setAutoTheme(t: Theme) {
  auto = t;
  apply();
}

export function setThemePref(p: ThemePref) {
  pref = p;
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch {}
  light?.(LIGHT_OF[p]);
  apply();
}

/** Auto → Paper → Night → Auto. */
export function cycleTheme(): ThemePref {
  setThemePref(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]);
  return pref;
}

export const THEME_LABEL: Record<ThemePref, string> = {
  auto: 'Follows the hour',
  paper: 'Day (light)',
  night: 'Night (dark)',
};

/** One icon per state: a half-lit disc for auto, a sun, a moon. */
export const THEME_ICON: Record<ThemePref, string> = {
  auto: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" stroke="none"/></svg>',
  paper: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6"/><path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.6 1.6M14.1 14.1l1.6 1.6M4.3 15.7l1.6-1.6M14.1 5.9l1.6-1.6"/></svg>',
  night: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5 6.5 6.5 0 1 0 15.5 12.6z"/></svg>',
};

apply();
