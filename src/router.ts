import { F } from './tower/scene-constants';

// Served at the domain root (see vite.config.ts).
export const BASE = '';

export interface FloorRoute {
  index: number;
  slug: string;
  label: string;
  title: string;
  side: 'left' | 'right';
}

export const FLOORS: FloorRoute[] = [
  { index: F.quarters, slug: 'about', label: 'About', title: 'Sleeping quarters', side: 'left' },
  { index: F.library, slug: 'publications', label: 'Publications', title: 'Library', side: 'left' },
  { index: F.lab, slug: 'projects', label: 'Projects', title: 'Laboratory', side: 'left' },
  { index: F.observatory, slug: 'contact', label: 'Contact', title: 'Observatory', side: 'right' },
  { index: F.sanctum, slug: 'elsewhere', label: 'Elsewhere', title: 'Portal sanctum', side: 'left' },
  { index: F.kitchen, slug: 'now', label: 'Now', title: 'Kitchen', side: 'right' },
];

export function routeForSlug(slug: string | null): FloorRoute | null {
  if (!slug) return null;
  return FLOORS.find((f) => f.slug === slug) ?? null;
}

export function routeForIndex(index: number): FloorRoute | null {
  return FLOORS.find((f) => f.index === index) ?? null;
}

export function currentSlug(): string | null {
  let p = window.location.pathname;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');
  return p.length ? p : null;
}

export function navigate(slug: string | null, opts: { replace?: boolean } = {}) {
  const path = slug ? `${BASE}/${slug}` : `${BASE}/`;
  if (window.location.pathname !== path) {
    // The query string carries the active backdrop world (?world=space), so
    // it has to survive floor navigation — the two are independent axes.
    const url = path + window.location.search;
    if (opts.replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
  }
  window.dispatchEvent(new CustomEvent('lair-route'));
}

/** The active backdrop world lives in the query string so a view is
 *  shareable — "look at the tower on the seafloor" is a link, not a
 *  sequence of instructions. Written with replaceState: teleporting is not
 *  a navigation, and shouldn't need a Back press to undo. */
export function worldFromUrl(): string | null {
  const w = new URLSearchParams(window.location.search).get('world');
  return w && w !== 'none' ? w : null;
}

export function setWorldInUrl(kind: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (kind) params.set('world', kind); else params.delete('world');
  const qs = params.toString();
  const url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  if (url !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState({}, '', url);
  }
}

export function onRouteChange(cb: (slug: string | null) => void) {
  const handler = () => cb(currentSlug());
  window.addEventListener('popstate', handler);
  window.addEventListener('lair-route', handler);
  return () => {
    window.removeEventListener('popstate', handler);
    window.removeEventListener('lair-route', handler);
  };
}
