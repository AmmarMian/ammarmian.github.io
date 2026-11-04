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
import { toBibTeX, shortVenue, citeTail, type HalDoc } from '../data/hal';
import snapshotMeta from '../data/hal-snapshot.meta.json';
import { studentGroups } from '../data/studentGroups';

/* One line glyph per kind of record, drawn like the rest of the site's
   line-work (the leader lines, the rules): 18px, a 1.2px stroke in the
   current colour, no fill. Defined once as symbols and used by reference. */
const KIND_GLYPHS: Record<string, string> = {
  journal: '<rect x="4" y="2" width="10" height="14" rx="1"/><path d="M6.5 2v14M9 6h3M9 8.5h3"/>',
  conference: '<path d="M3 6h12l-2 3H5z"/><path d="M9 9v6M6 15.5h6"/><circle cx="9" cy="3.5" r="1.3"/>',
  preprint: '<path d="M5 2h6l3 3v11H5z"/><path d="M11 2v3h3M7 9h5M7 11.5h5M7 14h3"/>',
  chapter: '<path d="M2 4.5c2.8-1 5-1 7 .8 2-1.8 4.2-1.8 7-.8v10c-2.8-1-5-1-7 .8-2-1.8-4.2-1.8-7-.8z"/><path d="M9 5.3v10"/>',
  software: '<path d="M6 5 2.5 9 6 13M12 5l3.5 4-3.5 4M10.2 3.5 7.8 14.5"/>',
  thesis: '<path d="M1.5 7 9 4l7.5 3L9 10z"/><path d="M5 8.6v3.6c2.2 1.6 5.8 1.6 8 0V8.6M16.5 7v4"/>',
};
const glyphFor = (kind: string) => (kind.toLowerCase() in KIND_GLYPHS ? kind.toLowerCase() : 'preprint');
const GLYPH_DEFS = `<svg class="tp-defs" aria-hidden="true" width="0" height="0"><defs>${
  Object.entries(KIND_GLYPHS).map(([k, d]) => `<symbol id="k-${k}" viewBox="0 0 18 18">${d}</symbol>`).join('')
}</defs></svg>`;

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

export const TEXT_TITLE = `${PROFILE.name} — text version`;
export const TEXT_DESCRIPTION = `${PROFILE.role}, ${PROFILE.affiliation}. ${PROFILE.summary}`;

const ext = (href: string, label: string) =>
  `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

/** The whole page, `<main>` included. `base` is '' in production; it exists
 *  so the link home is correct wherever the site is mounted.
 *
 *  Set in Paper & Night type: one narrow centred column on the page — name,
 *  dek, numbered sections — with the contents pinned beside it on a wide
 *  screen and set above it on a narrow one. */
export function textPageHtml(base = ''): string {
  const docs = snapshot as HalDoc[];
    const projs = projects as { name: string; description: string; url: string; demo?: string }[];

  const cv = (rows: readonly { role: string; org: string; year: string }[]) => rows.map((r) => `
      <li><span class="tp-when">${esc(r.year)}</span><div><strong>${esc(r.role)}</strong><span>${esc(r.org)}</span></div></li>`).join('');

  // Publications, newest first, grouped under their year.
  const years = Array.from(new Set(docs.map((d) => d.year || 0))).sort((x, y) => y - x);
  const me = (authors: string) => esc(authors).replace(/(Ammar Mian|A\. Mian)/g, '<span class="tp-me">$1</span>');
  const pubs = years.map((y) => {
    const rows = docs.filter((d) => (d.year || 0) === y);
    return `
      <h3 id="y${y || 'nd'}"><span>${y || 'n.d.'}</span>${rows.length} record${rows.length === 1 ? '' : 's'}</h3>
      <ol class="tp-pubs">${rows.map((d) => {
        // A preprint's "venue" is often just its DOI or the archive's name —
        // already a button below, so it is not repeated as a venue.
        const v = shortVenue(d.venue), tail = citeTail(d);
        const venue = v || tail ? `<span>${v ? `<i>${esc(v)}</i>` : ''}${v && tail ? (/^\d/.test(tail) ? ' ' : ', ') : ''}${esc(tail)}</span>` : '';
        const btn = (href: string, label: string) =>
          `<a class="tp-chip" href="${esc(href)}" target="_blank" rel="noopener">${label}<span aria-hidden="true">&#8599;</span></a>`;
        return `
        <li>
          <svg class="tp-kind" aria-hidden="true"><use href="#k-${glyphFor(d.kind)}"/></svg>
          <div>
            <strong>${esc(d.title)}</strong>
            <span class="tp-au">${me(d.authors)}</span>
            <span class="tp-meta">${venue}<b>${esc(d.kind)}</b></span>
            <span class="tp-acts">${[
              d.uri && d.uri !== '#' ? btn(d.uri, 'HAL') : '',
              d.pdf ? btn(d.pdf, 'PDF') : '',
              d.doi ? btn(`https://doi.org/${d.doi}`, 'DOI') : '',
              `<button class="tp-chip" type="button" hidden data-bib="${esc(toBibTeX(d))}">BibTeX</button>`,
            ].join('')}</span>
          </div>
        </li>`;
      }).join('')}
      </ol>`;
  }).join('');

  const groups = studentGroups();
  const people = (rows: typeof groups[number]['rows']) => rows.map((x) => `
      <li><span class="tp-when">${esc(x.kind)} · ${esc(x.period)}</span><div><strong>${esc(x.name)}</strong><span>${esc(x.topic)}</span>${x.note ? `<span class="tp-note">${esc(x.note)}</span>` : ''}</div></li>`).join('');
  const studentSections = groups.map((g) => `
        <h3 id="${g.id}">${esc(g.label)}</h3>
        <ul class="tp-cv">${people(g.rows)}</ul>`).join('');
  const studentToc = groups.map((g) => `<li><a href="#${g.id}">${esc(g.label)}</a></li>`).join('');

  const tools = projs.map((x) => `
      <li><span class="tp-when">Software</span><div><strong>${esc(x.name)}</strong><span>${esc(x.description)}</span>
        <span class="tp-acts">${x.demo ? `<a class="tp-chip" href="${esc(x.demo)}" target="_blank" rel="noopener">Live demo<span aria-hidden="true">&#8599;</span></a>` : ''}<a class="tp-chip" href="${esc(x.url)}" target="_blank" rel="noopener">Repository<span aria-hidden="true">&#8599;</span></a></span></div></li>`).join('');

  const colophon = COLOPHON_BLOCK.map((r) => (
    `<dt>${esc(r.field)}</dt><dd>${esc(r.value)}${r.note ? `<span>${esc(r.note)}</span>` : ''}</dd>`
  )).join('');
  const colophonNote = COLOPHON_NOTE.map((x) => `<p>${esc(x)}</p>`).join('');

  // The day the publication list was last fetched from HAL (scripts/fetch-hal.mjs).
  const asOf = new Date(`${snapshotMeta.fetchedAt}T12:00:00Z`)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const yearLinks = years.map((y) => `<a href="#y${y || 'nd'}">${y || 'n.d.'}</a>`).join('');

  return `<main class="text-page">${GLYPH_DEFS}
  <div class="tp-layout">
    <nav class="tp-toc" aria-label="Contents">
      <a class="tp-toc-home" href="${esc(base)}/?view=3d">&larr; The interactive tower</a>
      <p class="tp-toc-h">Contents</p>
      <ol>
        <li><a href="#career"><span>1</span>Career</a>
          <ol><li><a href="#positions">Positions</a></li><li><a href="#education">Education</a></li></ol></li>
        <li><a href="#publications"><span>2</span>Publications</a>
          <div class="tp-toc-years">${yearLinks}</div></li>
        <li><a href="#students"><span>3</span>Students &amp; tools</a>
          <ol>${studentToc}<li><a href="#software">Software</a></li></ol></li>
        <li><a href="#contact"><span>4</span>Contact</a></li>
        <li><a href="#colophon"><span>§</span>Colophon</a></li>
      </ol>
    </nav>

    <article class="tp-col">
      <header class="tp-hdr" id="top">
        <p class="tp-run"><b>Curriculum</b> · LISTIC · Université Savoie Mont-Blanc</p>
        <h1>Ammar Mian</h1>
        <p class="tp-dek">${esc(PROFILE.role)} at ${esc(PROFILE.affiliation)}, working on ${esc(PROFILE.research)}.</p>
        <p class="tp-now"><b>This year</b>${esc(PROFILE.currently)}</p>
        <p class="tp-by"><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a><span>·</span>${ext(CONTACT.hal, 'HAL')}<span>·</span>${ext(CONTACT.github, 'GitHub')}</p>
      </header>

      <section id="career">
        <h2><span>1</span>Career</h2>
        <h3 id="positions">Positions</h3>
        <ul class="tp-cv">${cv(PROFILE.positions)}</ul>
        <h3 id="education">Education</h3>
        <ul class="tp-cv">${cv(PROFILE.education)}</ul>
      </section>

      <section id="publications">
        <h2><span>2</span>Publications</h2>
        <p class="tp-aside">From the HAL open archive, as of ${esc(asOf)}. The library in the tower has the same list with search, filters and BibTeX export.</p>
        ${pubs}
      </section>

      <section id="students">
        <h2><span>3</span>Students &amp; tools</h2>
${studentSections}
        <h3 id="software">Software</h3>
        <ul class="tp-cv">${tools}</ul>
      </section>

      <section id="contact">
        <h2><span>4</span>Contact</h2>
        <dl class="tp-dl">
          <dt>Email</dt><dd><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></dd>
          <dt>Office</dt><dd>${esc(CONTACT.office)}</dd>
          <dt>HAL</dt><dd>${ext(CONTACT.hal, 'search results')}</dd>
          <dt>GitHub</dt><dd>${ext(CONTACT.github, CONTACT.github.replace(/^https:\/\//, ''))}</dd>
        </dl>
      </section>

      <section id="colophon" class="tp-colophon">
        <h2><span>§</span>${esc(COLOPHON_TITLE)}</h2>
        <dl class="tp-dl">${colophon}</dl>
        ${colophonNote}
      </section>

      <footer class="tp-ft">
        <span class="tp-sig">Ammar Mian</span>
        <span>Publications updated ${esc(asOf)}</span>
        <a href="#top">Back to the top &uarr;</a>
      </footer>
    </article>
  </div>
</main>`;
}

/** The one piece of script the plain page carries: it marks the section
 *  being read in the contents. Everything works without it — the contents
 *  are ordinary anchor links — so it is an enhancement, never a dependency.
 *  Self-contained on purpose: vite.config.ts inlines its source into the
 *  static /text/index.html, and TextPage.ts calls it in the SPA. */
export function textPageEnhance(): void {
  const toc = document.querySelector('.tp-toc');
  const scroller = document.querySelector('.text-page');
  if (!toc || !scroller) return;
  const links: Record<string, HTMLAnchorElement> = {};
  toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => { links[a.hash.slice(1)] = a; });
  const targets = Object.keys(links)
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el)
    .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  let queued = false;
  const mark = () => {
    queued = false;
    // The section being read is the last one whose heading has passed the
    // top third of the screen.
    const line = scroller.getBoundingClientRect().top + window.innerHeight * 0.3;
    let current: HTMLElement | undefined;
    for (const t of targets) { if (t.getBoundingClientRect().top <= line) current = t; else break; }
    Object.values(links).forEach((a) => a.removeAttribute('aria-current'));
    if (!current) return;
    const a = links[current.id];
    a.setAttribute('aria-current', 'location');
    // and the part it belongs to, so a year lights "Publications" too
    const top = a.closest('.tp-toc > ol > li')?.querySelector(':scope > a');
    if (top && top !== a) top.setAttribute('aria-current', 'true');
  };
  // BibTeX buttons: hidden without script, since copying needs it.
  scroller.querySelectorAll<HTMLButtonElement>('button[data-bib]').forEach((b) => {
    b.hidden = false;
    b.addEventListener('click', async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(b.dataset.bib || ''); ok = true; } catch {}
      const was = 'BibTeX';
      b.textContent = ok ? 'Copied ✓' : 'Copy failed';
      window.setTimeout(() => { b.textContent = was; }, 1400);
    });
  });
  scroller.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(mark); }
  }, { passive: true });
  mark();
}

/** The short version, for the <noscript> inside the 3D page. Someone reading
 *  this has JavaScript switched off and is looking at a blank tower; they
 *  need who this is and where the real content is, not a full CV. */
export function noscriptHtml(): string {
  return `<main class="text-page">
    <h1>${esc(PROFILE.name)}</h1>
    <p>${esc(PROFILE.role)} — ${esc(PROFILE.affiliation)}.</p>
    <p>${esc(PROFILE.summary)}</p>
    <p>This site is an interactive 3D scene and needs JavaScript. Everything it contains is also available as plain text:</p>
    <ul>
      <li><a href="/text">Text version — full CV, publications, projects and contact</a></li>
      <li>${ext(CONTACT.hal, 'Publications on HAL')}</li>
      <li>${ext(CONTACT.github, 'GitHub')}</li>
      <li><a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></li>
    </ul>
  </main>`;
}
