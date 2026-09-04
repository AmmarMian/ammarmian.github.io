import { F } from './tower/scene-constants';

// Served at ammarmian.fr/tower/ (see vite.config.ts), not the domain root —
// every path built or parsed here needs that prefix.
export const BASE = '/tower';

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
    if (opts.replace) window.history.replaceState({}, '', path);
    else window.history.pushState({}, '', path);
  }
  window.dispatchEvent(new CustomEvent('lair-route'));
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
