/* ============================ the plain version ==========================
 * The text page as a string, built without touching the DOM.
 *
 * It is a string rather than DOM calls so that exactly one description of
 * this markup exists and three things can share it: the page rendered in the
 * browser, the static /text/index.html emitted at build time, and the
 * <noscript> fallback inside index.html. Those last two used to be a
 * hand-maintained copy of the first, which is a duplicate of profile.ts by
 * another name — it would have drifted the first time a position changed.
 *
 * Nothing here may reference `document`, `window` or anything else that only
 * exists in a browser: vite.config.ts imports this module in Node to write
 * the static file.
 */
import { PROFILE, CONTACT } from '../data/profile';
import students from '../data/students.json';
import projects from '../data/projects.json';
import snapshot from '../data/hal-snapshot.json';
import { COLOPHON_TITLE, COLOPHON_BLOCK, COLOPHON_NOTE } from '../data/colophon';

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

export const TEXT_TITLE = `${PROFILE.name} — text version`;
export const TEXT_DESCRIPTION = `${PROFILE.role}, ${PROFILE.affiliation}. ${PROFILE.bio}`;

const ext = (href: string, label: string) =>
  `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

/** The whole page, `<main>` included. `base` is '' in production; it exists
 *  so the link home is correct wherever the site is mounted.
 *
 *  Set as a Paper & Night technical page: a sheet on the desk with a running
 *  head, the name and a dek, an outline strip in the manner of the system's
 *  outline slide, a row of key figures, then numbered sections in a 680px
 *  column with notes in the margin beside them. Still one static document
 *  with no script — the design is all in the stylesheet. */
export function textPageHtml(base = ''): string {
  const docs = snapshot as { title: string; authors: string; venue: string; year: number; kind: string; uri: string }[];
  const studs = students as { name: string; topic: string; note?: string; kind: string; period: string; status: string }[];
  const projs = projects as { name: string; description: string; url: string }[];

  const cv = (rows: readonly { role: string; org: string; year: string }[]) => rows.map((r) => `
      <li><span class="tp-when">${esc(r.year)}</span><div><strong>${esc(r.role)}</strong><span>${esc(r.org)}</span></div></li>`).join('');

  // Publications, newest first, grouped under their year.
  const years = Array.from(new Set(docs.map((d) => d.year || 0))).sort((x, y) => y - x);
  const me = (authors: string) => esc(authors).replace(/(Ammar Mian|A\. Mian)/g, '<span class="tp-me">$1</span>');
  const pubs = years.map((y) => {
    const rows = docs.filter((d) => (d.year || 0) === y);
    return `
      <h3><span>${y || 'n.d.'}</span>${rows.length} record${rows.length === 1 ? '' : 's'}</h3>
      <ol class="tp-pubs">${rows.map((d) => `
        <li><strong>${esc(d.title)}</strong>
          <span class="tp-au">${me(d.authors)}</span>
          <span class="tp-meta"><i>${esc(d.venue)}</i> <b>${esc(d.kind)}</b>${d.uri && d.uri !== '#' ? ` ${ext(d.uri, 'HAL')}` : ''}</span></li>`).join('')}
      </ol>`;
  }).join('');

  const people = (status: string) => studs.filter((x) => x.status === status).map((x) => `
      <li><span class="tp-when">${esc(x.kind)} · ${esc(x.period)}</span><div><strong>${esc(x.name)}</strong><span>${esc(x.topic)}</span>${x.note ? `<span class="tp-note">${esc(x.note)}</span>` : ''}</div></li>`).join('');

  const tools = projs.map((x) => `
      <li><span class="tp-when">${ext(x.url, 'repository')}</span><div><strong>${esc(x.name)}</strong><span>${esc(x.description)}</span></div></li>`).join('');

  const colophon = COLOPHON_BLOCK.map((r) => (
    `<dt>${esc(r.field)}</dt><dd>${esc(r.value)}${r.note ? `<span>${esc(r.note)}</span>` : ''}</dd>`
  )).join('');
  const colophonNote = COLOPHON_NOTE.map((x) => `<p>${esc(x)}</p>`).join('');

  const journals = docs.filter((d) => d.kind === 'Journal').length;
  const current = studs.filter((x) => x.status === 'current').length;
  const research = PROFILE.bio.replace(/^In the world outside the tower:\s*/i, '');

  return `<main class="text-page">
  <article class="tp-sheet">
    <header class="tp-hdr">
      <div class="tp-run"><span><b>Curriculum</b> · LISTIC · Université Savoie Mont-Blanc</span><a href="${esc(base)}/?view=3d">The interactive tower &rarr;</a></div>
      <h1>Ammar Mian</h1>
      <p class="tp-dek">${esc(PROFILE.role)}, ${esc(PROFILE.affiliation)} — ${esc(research)}</p>
      <p class="tp-by"><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a><span>·</span>${ext(CONTACT.hal, 'HAL')}<span>·</span>${ext(CONTACT.github, 'GitHub')}</p>
      <div class="tp-orn" aria-hidden="true"><i></i></div>
    </header>

    <nav class="tp-outline" aria-label="Contents">
      <a href="#career"><span class="n">01</span><h4>Career</h4><p>Positions and education, since 2016.</p><span class="pg">${PROFILE.positions.length + PROFILE.education.length} entries</span></a>
      <a href="#publications"><span class="n">02</span><h4>Publications</h4><p>From the HAL open archive, newest first.</p><span class="pg">${docs.length} records</span></a>
      <a href="#students"><span class="n">03</span><h4>Students &amp; tools</h4><p>Doctoral and master's supervision, software.</p><span class="pg">${studs.length} students</span></a>
      <a href="#contact"><span class="n">04</span><h4>Contact</h4><p>Where to write, and where else to look.</p><span class="pg">Annecy</span></a>
    </nav>

    <dl class="tp-figs">
      <div><dt>Publications</dt><dd>${docs.length}</dd></div>
      <div><dt>Journal articles</dt><dd>${journals}</dd></div>
      <div><dt>Doctoral students now</dt><dd>${current}</dd></div>
      <div><dt>At LISTIC since</dt><dd>2020</dd></div>
    </dl>

    <div class="tp-row" id="career">
      <section class="tp-main">
        <h2><span>1</span>Career</h2>
        <h3>Positions</h3>
        <ul class="tp-cv">${cv(PROFILE.positions)}</ul>
        <h3>Education</h3>
        <ul class="tp-cv">${cv(PROFILE.education)}</ul>
      </section>
      <aside class="tp-aside">The same record stands in the sleeping quarters of <a href="${esc(base)}/about?view=3d">the tower</a>.</aside>
    </div>

    <div class="tp-row" id="publications">
      <section class="tp-main">
        <h2><span>2</span>Publications</h2>
        ${pubs}
      </section>
      <aside class="tp-aside">A snapshot taken at build time. The library in the tower reads HAL live, with search, filters and BibTeX export.</aside>
    </div>

    <div class="tp-row" id="students">
      <section class="tp-main">
        <h2><span>3</span>Students &amp; tools</h2>
        <h3>Supervising now</h3>
        <ul class="tp-cv">${people('current')}</ul>
        <h3>Past &amp; master's</h3>
        <ul class="tp-cv">${people('done')}</ul>
        <h3>Software</h3>
        <ul class="tp-cv">${tools}</ul>
      </section>
      <aside class="tp-aside">Co-supervisors are named with each thesis.</aside>
    </div>

    <div class="tp-row" id="contact">
      <section class="tp-main">
        <h2><span>4</span>Contact</h2>
        <dl class="tp-dl">
          <dt>Email</dt><dd><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></dd>
          <dt>Office</dt><dd>${esc(CONTACT.office)}</dd>
          <dt>HAL</dt><dd>${ext(CONTACT.hal, 'search results')}</dd>
          <dt>GitHub</dt><dd>${ext(CONTACT.github, CONTACT.github.replace(/^https:\/\//, ''))}</dd>
        </dl>
      </section>
    </div>

    <div class="tp-row">
      <section class="tp-main tp-colophon">
        <h2><span>§</span>${esc(COLOPHON_TITLE)}</h2>
        <dl class="tp-dl">${colophon}</dl>
        ${colophonNote}
      </section>
    </div>

    <footer class="tp-ft">
      <span class="tp-sig">Ammar Mian</span>
      <span class="tp-au-ft">Text version of <a href="${esc(base)}/?view=3d">ammarmian.fr</a><i>— the same content as the tower</i></span>
    </footer>
  </article>
</main>`;
}

/** The short version, for the <noscript> inside the 3D page. Someone reading
 *  this has JavaScript switched off and is looking at a blank tower; they
 *  need who this is and where the real content is, not a full CV. */
export function noscriptHtml(): string {
  return `<main class="text-page">
    <h1>${esc(PROFILE.name)}</h1>
    <p>${esc(PROFILE.role)} — ${esc(PROFILE.affiliation)}.</p>
    <p>${esc(PROFILE.bio)}</p>
    <p>This site is an interactive 3D scene and needs JavaScript. Everything it contains is also available as plain text:</p>
    <ul>
      <li><a href="/text">Text version — full CV, publications, projects and contact</a></li>
      <li>${ext(CONTACT.hal, 'Publications on HAL')}</li>
      <li>${ext(CONTACT.github, 'GitHub')}</li>
      <li><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></li>
    </ul>
  </main>`;
}
