import type { TowerScene } from '../tower/scene';
import { createSearchInput } from './SearchBox';
import {
  fetchHalPublications, filterHalDocs, shelfFor, docSlugFor,
  toBibTeX, toBibTeXAll, toCSV, toPlainCitation, type HalDoc,
} from '../data/hal';
import { copyText, downloadText, flashLabel, announce } from './io';
import { setRecordMeta, setRouteMeta } from './meta';
import { routeForSlug, navigate, BASE } from '../router';
import { WORLD_LABELS, WORLD_BLURBS } from '../data/worlds';
import { createYearRangeSlider } from './YearRange';
import type { FloorRoute } from '../router';
import { PROFILE, CONTACT } from '../data/profile';
import students from '../data/students.json';
import projects from '../data/projects.json';

// A horizontal run sits right above the title, bends to a true 45° and
// drops away toward the tower, ending in a small ring — like a leader
// line calling out a detail on a technical drawing.
const LEADER_SVG = `
  <svg class="leader" viewBox="0 0 220 220" aria-hidden="true">
    <path d="M210 10 L140 10 L10 140" />
    <circle cx="10" cy="140" r="4" />
  </svg>`;

export class SidePanel {
  el: HTMLElement;
  private tower: TowerScene;
  private bodyEl!: HTMLElement;
  private detailPopHandler: (() => void) | null = null;
  private halCache: HalDoc[] | null = null;
  // Consumed once per floor visit — only the *first* publications render
  // should honor a #doc-... deep link. Without this, clicking "back to
  // the shelves" (which re-renders the list) can race history.back()'s
  // async hash update and immediately reopen the same detail.
  private pendingDeepLink = false;
  private openSlug: string | null = null;

  constructor(root: HTMLElement, tower: TowerScene) {
    this.el = document.createElement('aside');
    this.el.className = 'callout';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.tower = tower;
  }

  /** Open one record by its HAL id, from wherever the visitor happens to be.
   *  This is what a click on a book in the library calls — the shelf is the
   *  index, so the tower has to be able to drive the panel and not only the
   *  other way round. */
  async openDoc(id: string) {
    const slug = docSlugFor(id);
    const hash = `#doc-${encodeURIComponent(slug)}`;
    if (this.openSlug !== 'publications') {
      // put the deep link in place first, then navigate: open() arms
      // pendingDeepLink and renderPublications reads the hash on arrival
      window.history.replaceState({}, '', `${BASE}/publications${hash}`);
      navigate('publications');
      return;
    }
    // already on the shelves — go straight there, since the router would
    // treat a same-slug navigation as a no-op
    window.history.replaceState({}, '', `${BASE}/publications${hash}`);
    const docs = await fetchHalPublications();
    const doc = docs.find((d) => d.id === id);
    if (doc) this.openPublication(doc, false);
  }

  close() {
    this.openSlug = null;
    this.tower.shelveBook();
    this.clearDetailHandler();
    this.el.classList.remove('callout-visible');
    window.setTimeout(() => { this.el.hidden = true; }, 280);
  }

  open(route: FloorRoute) {
    this.clearDetailHandler();
    this.el.hidden = false;
    this.el.className = 'callout callout-' + route.side;
    this.el.innerHTML = `
      <div class="leader-wrap">${LEADER_SVG}</div>
      <div class="callout-inner">
        <div class="kicker">${String(route.index).padStart(2, '0')} &middot; ${escapeHtml(route.title.toUpperCase())}</div>
        <h1>${escapeHtml(route.label)}</h1>
        <div class="callout-body"></div>
      </div>
    `;
    this.bodyEl = this.el.querySelector('.callout-body')!;
    requestAnimationFrame(() => this.el.classList.add('callout-visible'));
    this.pendingDeepLink = true;
    this.openSlug = route.slug;

    switch (route.slug) {
      case 'about': this.renderAbout(); break;
      case 'publications': this.renderPublications(); break;
      case 'projects': this.renderProjects(); break;
      case 'contact': this.renderContact(); break;
      case 'elsewhere': this.renderElsewhere(); break;
      case 'now': this.renderNow(); break;
    }
  }

  private clearDetailHandler() {
    if (this.detailPopHandler) { window.removeEventListener('popstate', this.detailPopHandler); this.detailPopHandler = null; }
  }

  private renderAbout() {
    const p = document.createElement('p');
    p.textContent = `${PROFILE.role} — ${PROFILE.affiliation}. ${PROFILE.bio}`;
    this.bodyEl.appendChild(p);

    const groups: [string, readonly { role: string; org: string; year: string }[]][] = [
      ['Positions', PROFILE.positions],
      ['Education', PROFILE.education],
    ];
    for (const [label, rows] of groups) {
      const h3 = document.createElement('div');
      h3.className = 'group-label';
      h3.textContent = label;
      this.bodyEl.appendChild(h3);
      const list = document.createElement('ul');
      list.className = 'tl-list';
      for (const row of rows) {
        const li = document.createElement('li');
        li.innerHTML = `<div class="tl-role">${escapeHtml(row.role)}</div><div class="tl-org">${escapeHtml(row.org)}</div><div class="tl-year">${escapeHtml(row.year)}</div>`;
        list.appendChild(li);
      }
      this.bodyEl.appendChild(list);
    }
  }

  private renderPublications() {
    const status = document.createElement('div');
    status.className = 'panel-status';
    status.textContent = 'Querying HAL…';
    this.bodyEl.appendChild(status);

    const finish = (docs: HalDoc[]) => {
      this.halCache = docs;
      status.remove();
      this.renderPubBrowser(docs);
    };

    if (this.halCache) { finish(this.halCache); return; }
    fetchHalPublications().then(finish).catch(() => {
      status.textContent = 'HAL did not answer.';
      const retry = document.createElement('button');
      retry.className = 'back-link';
      retry.type = 'button';
      retry.textContent = 'try again';
      retry.addEventListener('click', () => { status.remove(); retry.remove(); this.renderPublications(); });
      this.bodyEl.appendChild(retry);
    });
  }

  private renderPubBrowser(docs: HalDoc[]) {
    const status = document.createElement('div');
    status.className = 'panel-status';

    const list = document.createElement('ul');
    list.className = 'pub-list';

    // What the filters currently show — the set the export buttons act on.
    let shown: HalDoc[] = docs;

    const render = (results: HalDoc[]) => {
      shown = results;
      list.innerHTML = '';
      status.textContent = `${results.length} record${results.length === 1 ? '' : 's'} · idHAL ammar-mian`;
      for (const doc of results) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'pub-item';
        btn.innerHTML = `<strong>${escapeHtml(doc.title)}</strong><span>${escapeHtml(doc.venue)} &middot; ${doc.year || 'n.d.'} &middot; ${escapeHtml(doc.kind)}</span>`;
        btn.addEventListener('click', () => this.openPublication(doc));
        li.appendChild(btn);
        list.appendChild(li);
      }
    };

    let query = '';
    let kind = '';
    let yearFrom: number | null = null;
    let yearTo: number | null = null;
    const applyFilters = () => {
      let results = filterHalDocs(docs, query);
      if (kind) results = results.filter((d) => d.kind === kind);
      if (yearFrom !== null) results = results.filter((d) => d.year && d.year >= yearFrom!);
      if (yearTo !== null) results = results.filter((d) => d.year && d.year <= yearTo!);
      render(results);
    };

    const box = createSearchInput('Search title, author, venue, year…', (q) => { query = q; applyFilters(); });
    this.bodyEl.appendChild(box);

    const filters = document.createElement('div');
    filters.className = 'pub-filters';

    const kinds = Array.from(new Set(docs.map((d) => d.kind))).sort();
    const kindSelect = document.createElement('select');
    kindSelect.className = 'pub-filter-select';
    kindSelect.setAttribute('aria-label', 'Filter by type');
    kindSelect.innerHTML = `<option value="">All types</option>${kinds.map((k) => `<option value="${escapeAttr(k)}">${escapeHtml(k)}</option>`).join('')}`;
    kindSelect.addEventListener('change', () => { kind = kindSelect.value; applyFilters(); });

    filters.appendChild(kindSelect);
    this.bodyEl.appendChild(filters);

    const years = docs.map((d) => d.year).filter((y) => y);
    if (years.length) {
      const slider = createYearRangeSlider(Math.min(...years), Math.max(...years), (from, to) => {
        yearFrom = from; yearTo = to; applyFilters();
      });
      this.bodyEl.appendChild(slider);
    }

    // Export acts on whatever the filters currently show, not the whole
    // record — "the twelve SAR papers since 2020" is the set people
    // actually want, and they've just built it with the controls above.
    const actions = document.createElement('div');
    actions.className = 'pub-actions';
    const exportBtn = (label: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.textContent = label;
      b.addEventListener('click', run);
      actions.appendChild(b);
      return b;
    };
    const stamp = () => new Date().toISOString().slice(0, 10);
    exportBtn('.bib', () => {
      downloadText(`ammar-mian-${stamp()}.bib`, toBibTeXAll(shown), 'application/x-bibtex');
      announce(`Exported ${shown.length} records as BibTeX`);
    });
    exportBtn('.csv', () => {
      downloadText(`ammar-mian-${stamp()}.csv`, toCSV(shown), 'text/csv');
      announce(`Exported ${shown.length} records as CSV`);
    });
    const copyAll = exportBtn('copy BibTeX', async () => {
      const ok = await copyText(toBibTeXAll(shown));
      flashLabel(copyAll, ok ? 'copied ✓' : 'copy failed');
      announce(ok ? `${shown.length} BibTeX entries copied` : 'Copy failed');
    });

    this.bodyEl.appendChild(actions);
    this.bodyEl.appendChild(status);
    this.bodyEl.appendChild(list);
    render(docs);

    // A deep link to a specific record (e.g. shared as .../publications#doc-hal-01234567)
    // opens straight to that record's detail instead of the plain list —
    // but only on the render that follows actually visiting this floor.
    if (this.pendingDeepLink) {
      this.pendingDeepLink = false;
      const hashMatch = /^#doc-(.+)$/.exec(window.location.hash);
      if (hashMatch) {
        const target = docs.find((d) => docSlugFor(d.id) === decodeURIComponent(hashMatch[1]));
        if (target) this.openPublication(target, false);
      }
    }
  }

  private openPublication(doc: HalDoc, pushHistory = true) {
    this.tower.focusFloor(this.tower.F.library);
    const shelf = shelfFor(doc.id);
    // Fire-and-forget flourishes — the record opens immediately, the book
    // drifts off the shelf and the camera glides in behind it.
    void this.tower.pluckBook(shelf);
    void this.tower.focusShelf(shelf);

    const slug = docSlugFor(doc.id);
    const permalink = `${window.location.origin}/publications#doc-${encodeURIComponent(slug)}`;

    this.bodyEl.innerHTML = `
      <button class="back-link" type="button">&larr; back to the shelves</button>
      <h2>${escapeHtml(doc.title)}</h2>
      <p class="pub-meta">${escapeHtml(doc.authors)}</p>
      <p class="pub-meta">${escapeHtml(doc.venue)} &middot; ${doc.year || 'n.d.'} &middot; ${escapeHtml(doc.kind)}</p>
      ${doc.doi ? `<p class="pub-meta">doi: <a href="https://doi.org/${escapeAttr(doc.doi)}" target="_blank" rel="noopener">${escapeHtml(doc.doi)}</a></p>` : ''}
      <p class="pub-links">
        <a class="read-link" href="${escapeAttr(doc.uri)}" target="_blank" rel="noopener">Read on HAL &rarr;</a>
        ${doc.pdf ? `<a class="read-link" href="${escapeAttr(doc.pdf)}" target="_blank" rel="noopener">PDF &rarr;</a>` : ''}
      </p>
      <div class="pub-actions pub-actions-detail"></div>
    `;
    this.bodyEl.querySelector('.back-link')!.addEventListener('click', () => this.closeDetail());

    // The things a reader of an academic page actually reaches for.
    const acts = this.bodyEl.querySelector('.pub-actions-detail') as HTMLElement;
    const act = (label: string, get: () => string, said: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip-btn';
      b.textContent = label;
      b.addEventListener('click', async () => {
        const ok = await copyText(get());
        flashLabel(b, ok ? 'copied ✓' : 'copy failed');
        announce(ok ? `${said} copied` : 'Copy failed');
      });
      acts.appendChild(b);
    };
    act('copy BibTeX', () => toBibTeX(doc), 'BibTeX');
    act('copy citation', () => toPlainCitation(doc), 'Citation');
    act('copy link', () => permalink, 'Link');
    const dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'chip-btn';
    dl.textContent = '.bib';
    dl.addEventListener('click', () => downloadText(`${slug}.bib`, toBibTeX(doc) + '\n', 'application/x-bibtex'));
    acts.appendChild(dl);

    setRecordMeta(doc.title, doc.authors, doc.year, slug);

    this.clearDetailHandler();
    const hash = '#doc-' + encodeURIComponent(slug);
    if (pushHistory && window.location.hash !== hash) window.history.pushState({}, '', window.location.pathname + hash);
    this.detailPopHandler = () => { if (window.location.hash !== hash) this.closeDetail(false); };
    window.addEventListener('popstate', this.detailPopHandler);
  }

  /** The plucked book has to go back on the shelf when the record is closed,
   *  or the library slowly fills with them. */
  private closeDetail(popHash = true) {
    this.clearDetailHandler();
    // The record replaced the page title and canonical URL; the list is the
    // publications floor again.
    setRouteMeta(routeForSlug('publications'), 'publications');
    if (popHash && /^#doc-/.test(window.location.hash)) window.history.back();
    this.bodyEl.innerHTML = '';
    this.tower.shelveBook();
    // Pull the camera back out from the shelf close-up to the general
    // library view instead of leaving it parked in on the book.
    void this.tower.focusFloor(this.tower.F.library);
    if (this.halCache) this.renderPubBrowser(this.halCache); else this.renderPublications();
  }

  private renderProjects() {
    const list = document.createElement('ul');
    list.className = 'proj-list';
    for (const p of projects as any[]) {
      const li = document.createElement('li');
      li.innerHTML = `<h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p><a class="read-link" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">View on GitHub &rarr;</a>`;
      list.appendChild(li);
    }
    this.bodyEl.appendChild(list);
  }

  private renderContact() {
    const p = document.createElement('p');
    p.textContent = `${PROFILE.role}, ${PROFILE.affiliation}.`;
    this.bodyEl.appendChild(p);
    const ul = document.createElement('ul');
    ul.className = 'contact-list';
    ul.innerHTML = `
      <li><span class="contact-label">Email</span><a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li>
      <li><span class="contact-label">Office</span><span>${escapeHtml(CONTACT.office)}</span></li>
      <li><span class="contact-label">HAL</span><a href="${CONTACT.hal}" target="_blank" rel="noopener">search results</a></li>
      <li><span class="contact-label">Elsewhere</span><a href="${CONTACT.github}" target="_blank" rel="noopener">GitHub</a> &middot; <a href="${CONTACT.website}" target="_blank" rel="noopener">website</a></li>
    `;
    this.bodyEl.appendChild(ul);
  }

  /** The sanctum is the gate room, so its panel is the gate: the same
   *  destinations the dial offers, reachable from here. It used to be a
   *  single paragraph promising content that didn't exist. */
  private renderElsewhere() {
    const worlds = this.tower.worlds;
    const p = document.createElement('p');
    p.textContent = 'The portal here genuinely opens. Step the tower through it and the world outside the windows changes — the light, the fog and the glass all follow.';
    this.bodyEl.appendChild(p);

    const list = document.createElement('ul');
    list.className = 'pub-list';
    const rows: { kind: string | null; label: string; blurb: string }[] = [
      { kind: null, label: 'Back to the tower', blurb: 'No world — the ordinary sky' },
      ...worlds.kinds.map((k: string) => ({
        kind: k,
        label: WORLD_LABELS[k] ?? k,
        blurb: WORLD_BLURBS[k] ?? '',
      })),
    ];
    for (const r of rows) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pub-item';
      btn.innerHTML = `<strong>${escapeHtml(r.label)}</strong><span>${escapeHtml(r.blurb)}</span>`;
      if (worlds.current() === r.kind) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', () => {
        worlds.teleport(r.kind);
        // The gate takes about two seconds; re-mark the active row once the
        // tower has come back down rather than guessing at it now.
        window.addEventListener('lair-teleport', function done(e: any) {
          if (e.detail?.phase !== 'done') return;
          window.removeEventListener('lair-teleport', done);
          for (const b of list.querySelectorAll('.pub-item')) b.removeAttribute('aria-current');
          if (worlds.current() === r.kind) btn.setAttribute('aria-current', 'true');
        });
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
    this.bodyEl.appendChild(list);

    const note = document.createElement('p');
    note.className = 'pub-meta';
    note.textContent = 'The dial in this room and the telescope in the observatory reach the same places.';
    this.bodyEl.appendChild(note);
  }

  private renderNow() {
    const p = document.createElement('p');
    p.textContent = 'What is simmering in the kitchen right now: students currently under supervision.';
    this.bodyEl.appendChild(p);

    const groups: [string, string][] = [['current', 'Current'], ['done', 'Past & master’s']];
    for (const [status, label] of groups) {
      const rows = (students as any[]).filter((s) => s.status === status);
      if (!rows.length) continue;
      const h3 = document.createElement('div');
      h3.className = 'group-label';
      h3.textContent = label;
      this.bodyEl.appendChild(h3);
      const list = document.createElement('ul');
      list.className = 'proj-list';
      for (const s of rows) {
        const li = document.createElement('li');
        li.innerHTML = `<h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.topic)}</p>${s.note ? `<p class="tl-org">${escapeHtml(s.note)}</p>` : ''}<span class="status status-${status}">${escapeHtml(s.kind)} &middot; ${escapeHtml(s.period)}</span>`;
        list.appendChild(li);
      }
      this.bodyEl.appendChild(list);
    }
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function escapeAttr(s: string) {
  return escapeHtml(s);
}
