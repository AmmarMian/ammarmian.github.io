#!/usr/bin/env node
/* Fetch the publication list from HAL once, at build time, and write it into
 * the bundle.
 *
 * The site used to ask HAL on every visit. That is a request on the critical
 * path of every first paint, to a service this site does not control, for data
 * that changes a few times a year — and when it was slow or down, the shelves
 * in the library stood anonymous. It is also invisible to anything that does
 * not run JavaScript, which is most of what indexes an academic page.
 *
 * So the query runs here instead. CI runs it before every build and on a
 * schedule, so a deploy carries a fresh list; the result is committed as well,
 * so a clone builds correctly offline and the file is never missing.
 *
 * This must not fail a build. HAL being unreachable is exactly the situation
 * the snapshot exists for — the script says so and leaves the existing file
 * alone.
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'hal-snapshot.json');

/* Kept in step with KINDS in src/data/hal.ts by hand. There are ten of them
   and they have not changed since HAL defined them; a shared module would
   have to be importable from both a browser bundle and a bare Node script. */
const KINDS = {
  ART: 'Journal', COMM: 'Conference', UNDEFINED: 'Preprint', OTHER: 'Other',
  COUV: 'Chapter', THESE: 'Thesis', HDR: 'HDR', POSTER: 'Poster', REPORT: 'Report', OUV: 'Book',
};

const FIELDS = [
  'title_s', 'authFullName_s', 'producedDateY_i', 'journalTitle_s', 'conferenceTitle_s',
  'bookTitle_s', 'docType_s', 'uri_s', 'doiId_s', 'fileMain_s', 'volume_s', 'issue_s', 'page_s',
].join(',');

const URL_ = `https://api.archives-ouvertes.fr/search/?q=authIdHal_s:ammar-mian`
  + `&fl=${FIELDS}&rows=500&sort=producedDateY_i%20desc&wt=json`;

/** The same normalisation the browser used to do, so HalDoc is unchanged. */
function normalise(raw) {
  return raw.map((d, i) => {
    const authorList = d.authFullName_s || [];
    return {
      id: d.uri_s || String(i),
      title: Array.isArray(d.title_s) ? d.title_s[0] : (d.title_s || 'Untitled'),
      authors: authorList.join(', '),
      authorList,
      year: d.producedDateY_i || 0,
      venue: d.journalTitle_s || d.conferenceTitle_s || d.bookTitle_s
        || (d.doiId_s ? 'doi:' + d.doiId_s : 'HAL'),
      kind: KINDS[d.docType_s] || d.docType_s || 'Other',
      uri: d.uri_s || '#',
      doi: d.doiId_s || '',
      pdf: d.fileMain_s || '',
      volume: d.volume_s || '',
      issue: d.issue_s || '',
      pages: d.page_s || '',
    };
  });
}

async function existingCount() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8')).length;
  } catch {
    return null;
  }
}

const held = await existingCount();

try {
  const res = await fetch(URL_, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HAL answered ${res.status}`);
  const json = await res.json();
  const docs = normalise(json?.response?.docs ?? []);

  /* An empty answer is not a valid snapshot. HAL returns 200 with zero rows
     for a malformed query or a renamed idHal, and overwriting a good list
     with nothing would empty the library on the next deploy. */
  if (!docs.length) throw new Error('HAL returned no records');

  await writeFile(OUT, JSON.stringify(docs, null, 2) + '\n');
  console.log(`hal: ${docs.length} records written${held === null ? '' : ` (was ${held})`}`);
} catch (err) {
  console.warn(`hal: ${err.message}`);
  if (held === null) {
    console.error('hal: and there is no snapshot to fall back on — the library will be empty.');
    process.exit(1);
  }
  console.warn(`hal: keeping the committed snapshot of ${held} records.`);
}
