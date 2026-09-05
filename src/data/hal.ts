export interface HalDoc {
  id: string;
  title: string;
  authors: string;
  authorList: string[];
  year: number;
  venue: string;
  kind: string;
  uri: string;
  doi: string;
  pdf: string;
  volume: string;
  issue: string;
  pages: string;
}

/* The publication list is fetched from HAL once, at build time, by
 * scripts/fetch-hal.mjs, and imported here as data.
 *
 * It used to be fetched from the browser on every visit. That put a request to
 * a service this site does not control on the critical path of every first
 * paint, for a list that changes a few times a year — and left the shelves
 * standing anonymous whenever HAL was slow. Worse, it made the records
 * invisible to anything that does not run JavaScript, which is most of what
 * indexes an academic page.
 *
 * CI re-runs the query before every deploy and on a weekly schedule, so the
 * list is never more than a few days behind the archive, and the snapshot is
 * committed so a clone builds correctly with no network at all. Nothing here
 * touches the network any more, and nothing needs caching: the records are in
 * the bundle, already parsed.
 *
 * The two functions keep their old shapes — one async, one sync — so every
 * caller is unchanged, and so a live path could be restored here alone if the
 * publication list ever needed to be fresher than a deploy.
 */
import snapshot from './hal-snapshot.json';

const DOCS = snapshot as HalDoc[];

/** The records, synchronously. Never null now; the signature is kept so the
 *  console's "have we got them yet" branch still reads correctly. */
export function cachedHalPublications(): HalDoc[] | null {
  return DOCS;
}

/** Kept async: every caller already awaits it, and an await on a resolved
 *  value costs a microtask. */
export async function fetchHalPublications(): Promise<HalDoc[]> {
  return DOCS;
}

export function filterHalDocs(docs: HalDoc[], query: string): HalDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  const terms = q.split(/\s+/);
  return docs.filter((d) => {
    const hay = `${d.title} ${d.authors} ${d.venue} ${d.kind} ${d.year}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

/** A deterministic shelf slot from the record's own id — always the same
 *  book for the same paper, without hand-curating hundreds of HAL entries. */
export function shelfFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const bands: [number, number][] = [[104, 158], [194, 248]];
  const band = h % 2;
  const [a0, a1] = bands[band];
  const angle = a0 + (Math.floor(h / 7) % (a1 - a0));
  const row = Math.floor(h / 97) % 6;
  return { band, angle, row };
}

/** A short, URL-safe, human-legible id for a record — HAL's own URIs
 *  already end in one (e.g. .../hal-01234567), so deep links stay short
 *  without needing a lookup table. */
export function docSlugFor(id: string): string {
  return id.split('/').filter(Boolean).pop() || id;
}

/* ------------------------------ citations ------------------------------ */

const BIB_TYPE: Record<string, string> = {
  Journal: 'article', Conference: 'inproceedings', Chapter: 'incollection', Book: 'book',
  Thesis: 'phdthesis', HDR: 'phdthesis', Report: 'techreport', Poster: 'misc',
  Preprint: 'unpublished', Other: 'misc',
};

/** HAL gives "Firstname Lastname"; BibTeX wants "Lastname, Firstname" so
 *  reference managers don't guess the split wrongly on compound names. */
function bibAuthor(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim();
  const last = parts.pop()!;
  return `${last}, ${parts.join(' ')}`;
}

function bibKey(doc: HalDoc): string {
  const last = (doc.authorList[0] || 'anon').trim().split(/\s+/).pop() || 'anon';
  const word = doc.title.replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/)
    .find((w) => w.length > 3) || 'untitled';
  return `${last}${doc.year || 'nd'}${word}`.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function toBibTeX(doc: HalDoc): string {
  const type = BIB_TYPE[doc.kind] || 'misc';
  const venueField = type === 'inproceedings' ? 'booktitle' : type === 'incollection' ? 'booktitle' : 'journal';
  const rows: [string, string][] = [
    ['title', doc.title],
    ['author', doc.authorList.map(bibAuthor).join(' and ')],
  ];
  if (doc.venue && doc.venue !== 'HAL' && !doc.venue.startsWith('doi:')) rows.push([venueField, doc.venue]);
  if (doc.year) rows.push(['year', String(doc.year)]);
  if (doc.volume) rows.push(['volume', doc.volume]);
  if (doc.issue) rows.push(['number', doc.issue]);
  if (doc.pages) rows.push(['pages', doc.pages]);
  if (doc.doi) rows.push(['doi', doc.doi]);
  if (doc.uri && doc.uri !== '#') rows.push(['url', doc.uri]);
  const body = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${String(v).replace(/[{}]/g, '')}}`)
    .join(',\n');
  return `@${type}{${bibKey(doc)},\n${body}\n}`;
}

export function toBibTeXAll(docs: HalDoc[]): string {
  return docs.map(toBibTeX).join('\n\n') + '\n';
}

const CSV_COLUMNS: [string, (d: HalDoc) => string | number][] = [
  ['title', (d) => d.title],
  ['authors', (d) => d.authors],
  ['year', (d) => d.year || ''],
  ['venue', (d) => d.venue],
  ['type', (d) => d.kind],
  ['doi', (d) => d.doi],
  ['hal', (d) => d.uri],
  ['pdf', (d) => d.pdf],
];

export function toCSV(docs: HalDoc[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = CSV_COLUMNS.map(([k]) => k).join(',');
  const rows = docs.map((d) => CSV_COLUMNS.map(([, get]) => esc(get(d))).join(','));
  return [head, ...rows].join('\n') + '\n';
}

/** A plain-text reference, the shape you'd paste into an email. */
export function toPlainCitation(doc: HalDoc): string {
  const bits = [doc.authors, doc.title, doc.venue, doc.year ? String(doc.year) : ''].filter(Boolean);
  return bits.join('. ') + (doc.doi ? `. doi:${doc.doi}` : '') + '.';
}
