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

const li = (inner: string) => `<li>${inner}</li>`;
const ext = (href: string, label: string) =>
  `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;

/** The whole page, `<main>` included. `base` is '' in production; it exists
 *  so the link home is correct wherever the site is mounted. */
export function textPageHtml(base = ''): string {
  const docs = snapshot as { title: string; authors: string; venue: string; year: number; kind: string; uri: string }[];

  const positions = PROFILE.positions.map((p) => li(esc(`${p.year} — ${p.role}, ${p.org}`))).join('');
  const education = PROFILE.education.map((e) => li(esc(`${e.year} — ${e.role}, ${e.org}`))).join('');
  const pubs = docs.map((d) => li(
    `${esc(d.title)} — ${esc(d.authors)}. ${esc(d.venue)}, ${d.year || 'n.d.'} (${esc(d.kind)}). ${ext(d.uri, 'HAL')}`,
  )).join('');
  const projs = (projects as any[]).map((p) => li(
    `${esc(p.name)} — ${esc(p.description)} (${ext(p.url, 'repository')})`,
  )).join('');
  const studs = (students as any[]).map((s) => li(
    esc(`${s.name} — ${s.topic} (${s.kind}, ${s.period}${s.status === 'current' ? ', current' : ''})`),
  )).join('');
  const colophon = COLOPHON_BLOCK.map((r) => (
    `<dt>${esc(r.field)}</dt><dd>${esc(r.note ? `${r.value} — ${r.note}` : r.value)}</dd>`
  )).join('');
  const colophonNote = COLOPHON_NOTE.map((p) => `<p>${esc(p)}</p>`).join('');

  return `<main class="text-page">
    <p><a class="text-page-back" href="${esc(base)}/">&larr; view the interactive tower</a></p>
    <h1>${esc(PROFILE.name)}</h1>
    <p class="text-lede">${esc(PROFILE.role)} — ${esc(PROFILE.affiliation)}</p>
    <p>${esc(PROFILE.bio)}</p>

    <h2>Positions</h2>
    <ul class="text-list">${positions}</ul>

    <h2>Education</h2>
    <ul class="text-list-edu">${education}</ul>

    <h2>Publications</h2>
    <ul class="text-list-pubs">${pubs}</ul>

    <h2>Projects &amp; tools</h2>
    <ul class="text-list-proj">${projs}</ul>

    <h2>Students supervised</h2>
    <ul class="text-list-students">${studs}</ul>

    <h2>Contact</h2>
    <ul class="text-list-contact">
      <li>Email: <a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></li>
      <li>Office: ${esc(CONTACT.office)}</li>
      <li>HAL: ${ext(CONTACT.hal, 'search results')}</li>
      <li>GitHub: ${ext(CONTACT.github, CONTACT.github)}</li>
    </ul>

    <h2>${esc(COLOPHON_TITLE)}</h2>
    <dl class="text-colophon">${colophon}</dl>
    ${colophonNote}
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
