import { PROFILE, CONTACT } from '../data/profile';
import students from '../data/students.json';
import projects from '../data/projects.json';
import { fetchHalPublications } from '../data/hal';
import { BASE } from '../router';

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

/** A plain, semantic, screen-reader- and crawler-friendly version of the
 *  site's content — everything the 3D tower holds, without needing a
 *  camera, WebGL, or spatial navigation to reach it. */
export function renderTextPage(root: HTMLElement) {
  document.title = `${PROFILE.name} — text version`;
  setMeta('description', `${PROFILE.role}, ${PROFILE.affiliation}. ${PROFILE.bio}`);

  const page = document.createElement('main');
  page.className = 'text-page';
  page.innerHTML = `
    <p><a class="text-page-back" href="${BASE}/">&larr; view the interactive tower</a></p>
    <h1>${esc(PROFILE.name)}</h1>
    <p class="text-lede">${esc(PROFILE.role)} — ${esc(PROFILE.affiliation)}</p>
    <p>${esc(PROFILE.bio)}</p>

    <h2>Positions</h2>
    <ul class="text-list"></ul>

    <h2>Education</h2>
    <ul class="text-list-edu"></ul>

    <h2>Publications</h2>
    <p class="text-status">Loading from HAL&hellip;</p>
    <ul class="text-list-pubs"></ul>

    <h2>Projects &amp; tools</h2>
    <ul class="text-list-proj"></ul>

    <h2>Students supervised</h2>
    <ul class="text-list-students"></ul>

    <h2>Contact</h2>
    <ul class="text-list-contact">
      <li>Email: <a href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a></li>
      <li>Office: ${esc(CONTACT.office)}</li>
      <li>HAL: <a href="${esc(CONTACT.hal)}" target="_blank" rel="noopener">search results</a></li>
      <li>GitHub: <a href="${esc(CONTACT.github)}" target="_blank" rel="noopener">${esc(CONTACT.github)}</a></li>
    </ul>
  `;
  root.appendChild(page);

  const posList = page.querySelector('.text-list')!;
  for (const p of PROFILE.positions) {
    const li = document.createElement('li');
    li.textContent = `${p.year} — ${p.role}, ${p.org}`;
    posList.appendChild(li);
  }
  const eduList = page.querySelector('.text-list-edu')!;
  for (const e of PROFILE.education) {
    const li = document.createElement('li');
    li.textContent = `${e.year} — ${e.role}, ${e.org}`;
    eduList.appendChild(li);
  }
  const projList = page.querySelector('.text-list-proj')!;
  for (const p of projects as any[]) {
    const li = document.createElement('li');
    li.innerHTML = `${esc(p.name)} — ${esc(p.description)} (<a href="${esc(p.url)}" target="_blank" rel="noopener">repository</a>)`;
    projList.appendChild(li);
  }
  const studList = page.querySelector('.text-list-students')!;
  for (const s of students as any[]) {
    const li = document.createElement('li');
    li.textContent = `${s.name} — ${s.topic} (${s.kind}, ${s.period}${s.status === 'current' ? ', current' : ''})`;
    studList.appendChild(li);
  }

  const pubStatus = page.querySelector('.text-status') as HTMLElement;
  const pubList = page.querySelector('.text-list-pubs')!;
  fetchHalPublications()
    .then((docs) => {
      pubStatus.remove();
      for (const d of docs) {
        const li = document.createElement('li');
        li.innerHTML = `${esc(d.title)} — ${esc(d.authors)}. ${esc(d.venue)}, ${d.year || 'n.d.'} (${esc(d.kind)}). <a href="${esc(d.uri)}" target="_blank" rel="noopener">HAL</a>`;
        pubList.appendChild(li);
      }
    })
    .catch(() => { pubStatus.textContent = 'HAL did not answer — see the link above.'; });
}

function esc(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
