export interface HalDoc {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  kind: string;
  uri: string;
}

const KINDS: Record<string, string> = {
  ART: 'Journal', COMM: 'Conference', UNDEFINED: 'Preprint', OTHER: 'Other',
  COUV: 'Chapter', THESE: 'Thesis', HDR: 'HDR', POSTER: 'Poster', REPORT: 'Report', OUV: 'Book',
};

/** Live-fetched from HAL — the same open archive query the reference site
 *  uses (idHAL ammar-mian) — so the shelf never drifts from the real record. */
export async function fetchHalPublications(): Promise<HalDoc[]> {
  const fl = 'title_s,authFullName_s,producedDateY_i,journalTitle_s,conferenceTitle_s,bookTitle_s,docType_s,uri_s,doiId_s';
  const url = `https://api.archives-ouvertes.fr/search/?q=authIdHal_s:ammar-mian&fl=${fl}&rows=500&sort=producedDateY_i%20desc&wt=json`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const docs = ((j.response && j.response.docs) || []) as any[];
    return docs.map((d, i) => ({
      id: d.uri_s || String(i),
      title: Array.isArray(d.title_s) ? d.title_s[0] : (d.title_s || 'Untitled'),
      authors: (d.authFullName_s || []).join(', '),
      year: d.producedDateY_i || 0,
      venue: d.journalTitle_s || d.conferenceTitle_s || d.bookTitle_s || (d.doiId_s ? 'doi:' + d.doiId_s : 'HAL'),
      kind: KINDS[d.docType_s] || d.docType_s || 'Other',
      uri: d.uri_s || '#',
    }));
  } finally {
    clearTimeout(to);
  }
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
