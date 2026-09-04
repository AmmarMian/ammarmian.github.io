import { PROFILE } from '../data/profile';
import type { FloorRoute } from '../router';

const SITE = 'https://ammarmian.fr';
const NAME = PROFILE.name;

/** Per-route title and description. The tower is a single-page app, so
 *  without this every route reports the same "Sorcerer's Tower" — bad for
 *  a bookmark, worse for a shared link, and worthless to a crawler that
 *  did follow the 404 bounce. */
const DESCRIPTIONS: Record<string, string> = {
  about: `${NAME} — positions, education and background. ${PROFILE.role} at LISTIC, Université Savoie Mont-Blanc.`,
  publications: `Peer-reviewed articles, conference papers and preprints by ${NAME}, live from the HAL open archive. Searchable, with BibTeX export.`,
  projects: `Open-source tools and research code by ${NAME} — signal processing, Riemannian geometry and remote sensing.`,
  contact: `How to reach ${NAME} — email, office at LISTIC, Polytech Annecy-Chambéry, and profiles elsewhere.`,
  elsewhere: `The portal sanctum in ${NAME}'s tower — step the whole building through the gate into another world.`,
  now: `What ${NAME} is working on right now — students currently under supervision and ongoing topics.`,
  text: `${PROFILE.role}, ${PROFILE.affiliation}. ${PROFILE.bio}`,
  console: `A text console for ${NAME}'s homepage — browse the tower, search publications and export citations without the 3D scene.`,
};

const HOME_TITLE = `${NAME} — ${PROFILE.role}, LISTIC, Université Savoie Mont-Blanc`;
const HOME_DESC = `${NAME}, ${PROFILE.role} at LISTIC (Polytech Annecy-Chambéry, Université Savoie Mont-Blanc). Statistical signal processing and Riemannian-geometry methods for robust and remote-sensing problems. Publications, projects, teaching and contact.`;

function setTag(selector: string, attr: 'name' | 'property' | 'rel', key: string, value: string) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(attr === 'rel' ? 'link' : 'meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(attr === 'rel' ? 'href' : 'content', value);
}

function apply(title: string, description: string, path: string) {
  document.title = title;
  const url = SITE + path;
  setTag('meta[name="description"]', 'name', 'description', description);
  setTag('meta[property="og:title"]', 'property', 'og:title', title);
  setTag('meta[property="og:description"]', 'property', 'og:description', description);
  setTag('meta[property="og:url"]', 'property', 'og:url', url);
  setTag('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  setTag('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  setTag('link[rel="canonical"]', 'rel', 'canonical', url);
}

/** Called on every route change, including the initial one. */
export function setRouteMeta(route: FloorRoute | null, slug: string | null) {
  if (route) {
    apply(`${route.label} — ${NAME}`, DESCRIPTIONS[route.slug] ?? HOME_DESC, `/${route.slug}`);
  } else if (slug && DESCRIPTIONS[slug]) {
    const label = slug === 'text' ? 'Text version' : slug[0].toUpperCase() + slug.slice(1);
    apply(`${label} — ${NAME}`, DESCRIPTIONS[slug], `/${slug}`);
  } else {
    apply(HOME_TITLE, HOME_DESC, '/');
  }
}

/** A record's own detail view is a genuinely distinct, linkable thing —
 *  give it a title people can recognise in a tab or a pasted link. */
export function setRecordMeta(title: string, authors: string, year: number, slug: string) {
  apply(
    `${title} — ${NAME}`,
    `${title}${authors ? ` — ${authors}` : ''}${year ? `, ${year}` : ''}. From the publication record of ${NAME}.`,
    `/publications#doc-${slug}`,
  );
}
