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

const KINDS: Record<string, string> = {
  ART: 'Journal', COMM: 'Conference', UNDEFINED: 'Preprint', OTHER: 'Other',
  COUV: 'Chapter', THESE: 'Thesis', HDR: 'HDR', POSTER: 'Poster', REPORT: 'Report', OUV: 'Book',
};

/** Live-fetched from HAL — the same open archive query the reference site
 *  uses (idHAL ammar-mian) — so the shelf never drifts from the real record.
 *  The site is static, so there is no build-time snapshot to fall back on;
 *  instead the result is memoised for the page's lifetime and mirrored into
 *  sessionStorage, so a floor revisit (or the console) is instant and a
 *  transient HAL outage mid-session doesn't blank the shelves. */
const CACHE_KEY = 'lair-hal-v2';
let inflight: Promise<HalDoc[]> | null = null;
let memo: HalDoc[] | null = null;

export function cachedHalPublications(): HalDoc[] | null {
  if (memo) return memo;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) { memo = JSON.parse(raw) as HalDoc[]; return memo; }
  } catch {}
  return null;
}

export async function fetchHalPublications(): Promise<HalDoc[]> {
  if (memo) return memo;
  const cached = cachedHalPublications();
  if (cached) return cached;
  if (inflight) return inflight;

  const fl = [
    'title_s', 'authFullName_s', 'producedDateY_i', 'journalTitle_s', 'conferenceTitle_s',
    'bookTitle_s', 'docType_s', 'uri_s', 'doiId_s', 'fileMain_s', 'volume_s', 'issue_s', 'page_s',
  ].join(',');
  const url = `https://api.archives-ouvertes.fr/search/?q=authIdHal_s:ammar-mian&fl=${fl}&rows=500&sort=producedDateY_i%20desc&wt=json`;

  inflight = (async () => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const raw = ((j.response && j.response.docs) || []) as any[];
      const docs: HalDoc[] = raw.map((d, i) => {
        const authorList: string[] = d.authFullName_s || [];
        return {
          id: d.uri_s || String(i),
          title: Array.isArray(d.title_s) ? d.title_s[0] : (d.title_s || 'Untitled'),
          authors: authorList.join(', '),
          authorList,
          year: d.producedDateY_i || 0,
          venue: d.journalTitle_s || d.conferenceTitle_s || d.bookTitle_s || (d.doiId_s ? 'doi:' + d.doiId_s : 'HAL'),
          kind: KINDS[d.docType_s] || d.docType_s || 'Other',
          uri: d.uri_s || '#',
          doi: d.doiId_s || '',
          pdf: d.fileMain_s || '',
          volume: d.volume_s || '',
          issue: d.issue_s || '',
          pages: d.page_s || '',
        };
      });
      memo = docs;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(docs)); } catch {}
      return docs;
    } finally {
      clearTimeout(to);
      inflight = null;
    }
  })();
  return inflight;
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
