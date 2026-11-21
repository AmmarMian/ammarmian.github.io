import { createSearchInput } from './SearchBox';
import {
  fetchHalPublications, filterHalDocs, shelfFor, docSlugFor, venueLine,
  toBibTeX, toBibTeXAll, toCSV, toPlainCitation, type HalDoc,
} from '../data/hal';
import { copyText, downloadText, flashLabel, announce } from './io';
import { setRecordMeta, setRouteMeta } from './meta';
import { routeForSlug, navigate, textPageHref, BASE } from '../router';
import { WORLD_LABELS, WORLD_BLURBS } from '../data/worlds';
import { createYearRangeSlider } from './YearRange';
import { PROFILE, CONTACT } from '../data/profile';
import { COLOPHON_TITLE, COLOPHON_BLOCK, COLOPHON_NOTE } from '../data/colophon';
import { studentGroups } from '../data/studentGroups';
import projects from '../data/projects.json';

/* What each floor says, written once. The 3D tower's callout and the pixel
   tower's frames both put this inside their own chrome, so the two can never
   drift apart: one record browser, one contact list, one plug.

   The content only ever reaches into the picture through PanelScene — the
   flourishes a 3D scene adds (a book drifting off the shelf, the camera
   gliding in) are optional, and a view with no scene to move just leaves
   them out. */

type Shelf = { band: number; angle: number; row: number } | undefined;
export interface PanelScene {
  F?: { library: number };
  focusFloor?(k: number | null): unknown;
  pluckBook?(shelf: Shelf): unknown;
  focusShelf?(shelf: Shelf): unknown;
  readGrimoire?(): unknown;
  shelveBook?(): unknown;
  worlds: { kinds: string[]; current: () => string | null; teleport: (kind: string | null) => boolean | void };
  qualityState?(): { tier: string; pinned: unknown; fps?: number | null };
  gpu?(): { ok: boolean; software?: boolean };
  /** The pixel tower's shelves: which paper the reader is pointing at, which
   *  one is open, and which ones the current search leaves showing (null: all). */
  hoverDoc?(id: string | null): void;
  selectDoc?(id: string | null): void;
  showDocs?(ids: string[] | null): void;
}

/** The things the content needs that live outside it: emptying the site's
 *  storage (destructive, and the host owns the confirmation and the reload),
 *  opening the 3D gear panel, and which view it is being shown in. */
export interface PanelActions {
  onReset?: () => void;
  openSettings?: () => void;
  view?: '3d' | '2d';
}

export class FloorContent {
  private bodyEl!: HTMLElement;
  private detailPopHandler: (() => void) | null = null;
  private halCache: HalDoc[] | null = null;
  // Consumed once per floor visit — only the *first* publications render
  // should honor a #doc-... deep link. Without this, clicking "back to
  // the shelves" (which re-renders the list) can race history.back()'s
  // async hash update and immediately reopen the same detail.
  private pendingDeepLink = false;
  private openSlug: string | null = null;

  constructor(private scene: PanelScene, private actions: PanelActions = {}) {}

  /** Fill `body` with what floor `slug` says. */
  mount(slug: string, body: HTMLElement) {
    this.clearDetailHandler();
    this.bodyEl = body;
    this.pendingDeepLink = true;
    this.openSlug = slug;
    switch (slug) {
      case 'about': this.renderAbout(); break;
      case 'publications': this.renderPublications(); break;
      case 'projects': this.renderProjects(); break;
      case 'contact': this.renderContact(); break;
      case 'elsewhere': this.renderElsewhere(); break;
      case 'now': this.renderNow(); break;
      case 'settings': this.renderSettings(); break;
    }
  }

  /** Leaving the floor: the plucked book goes back, the detail stops listening. */
  unmount() {
    this.openSlug = null;
    this.scene.shelveBook?.();
    this.scene.hoverDoc?.(null);
    this.scene.selectDoc?.(null);
    this.scene.showDocs?.(null);
    this.clearDetailHandler();
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

  /* The grimoire on the library lectern. Reached the same way a book on the
     shelf is: if we are not on that floor yet, put the hash in place and let
     the router take us there — renderPublications picks the deep link up on
     arrival. The colophon is a detail view *of the library*, not a room of
     its own; it is a book, and it sits behind the shelves exactly as a
     publication record does. */
  openColophon() {
    if (this.openSlug !== 'publications') {
      window.history.replaceState({}, '', `${BASE}/publications#colophon`);
      navigate('publications');
      return;
    }
    window.history.replaceState({}, '', `${BASE}/publications#colophon`);
    this.renderColophon(false);
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

    // The one place the blackletter is allowed: a signature, small, once.
    const sig = document.createElement('div');
    sig.className = 'signature';
    sig.textContent = PROFILE.name;
    this.bodyEl.appendChild(sig);
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
        btn.dataset.doc = doc.id;
        const point = (on: boolean) => this.scene.hoverDoc?.(on ? doc.id : null);
        btn.addEventListener('mouseenter', () => point(true));
        btn.addEventListener('mouseleave', () => point(false));
        btn.addEventListener('focus', () => point(true));
        btn.addEventListener('blur', () => point(false));
        btn.innerHTML = `<strong>${escapeHtml(doc.title)}</strong><span>${[venueLine(doc), doc.year || 'n.d.', doc.kind].filter(Boolean).map((x) => escapeHtml(String(x))).join(' &middot; ')}</span>`;
        btn.addEventListener('click', () => this.openPublication(doc));
        li.appendChild(btn);
        list.appendChild(li);
      }
      this.scene.showDocs?.(results.length === docs.length ? null : results.map((d) => d.id));
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
      if (window.location.hash === '#colophon') { this.renderColophon(false); return; }
      const hashMatch = /^#doc-(.+)$/.exec(window.location.hash);
      if (hashMatch) {
        const target = docs.find((d) => docSlugFor(d.id) === decodeURIComponent(hashMatch[1]));
        if (target) this.openPublication(target, false);
      }
    }
  }

  private openPublication(doc: HalDoc, pushHistory = true) {
    this.scene.hoverDoc?.(null);
    this.scene.selectDoc?.(doc.id);
    this.scene.focusFloor?.(this.scene.F?.library ?? null);
    const shelf = shelfFor(doc.id);
    // Fire-and-forget flourishes — the record opens immediately, the book
    // drifts off the shelf and the camera glides in behind it.
    void this.scene.pluckBook?.(shelf);
    void this.scene.focusShelf?.(shelf);

    const slug = docSlugFor(doc.id);
    const permalink = `${window.location.origin}/publications#doc-${encodeURIComponent(slug)}`;

    this.bodyEl.innerHTML = `
      <button class="back-link" type="button">&larr; back to the shelves</button>
      <h2>${escapeHtml(doc.title)}</h2>
      <p class="pub-meta">${escapeHtml(doc.authors)}</p>
      <p class="pub-meta">${[venueLine(doc), doc.year || 'n.d.', doc.kind].filter(Boolean).map((x) => escapeHtml(String(x))).join(' &middot; ')}</p>
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

  /* The grimoire, opened. Built as a detail view of the library so it shares
     the record's whole apparatus — the back link, the popstate handler, the
     hash that makes it linkable — and so closing it lands you back on the
     shelves rather than somewhere the router has to guess at. */
  private renderColophon(pushHistory = true) {
    void this.scene.focusFloor?.(this.scene.F?.library ?? null);
    void this.scene.readGrimoire?.();

    this.bodyEl.innerHTML = `
      <button class="back-link" type="button">&larr; back to the shelves</button>
      <h2>${escapeHtml(COLOPHON_TITLE)}</h2>
      <dl class="colophon-block"></dl>
    `;
    this.bodyEl.querySelector('.back-link')!.addEventListener('click', () => this.closeDetail());

    /* A title block, so it is read as one: the field names in the small caps
       the rest of the site uses for labels, the values against them, and the
       quiet second line where a field needs one. */
    const dl = this.bodyEl.querySelector('.colophon-block') as HTMLElement;
    for (const row of COLOPHON_BLOCK) {
      const dt = document.createElement('dt');
      dt.textContent = row.field;
      const dd = document.createElement('dd');
      dd.textContent = row.value;
      if (row.note) {
        const note = document.createElement('span');
        note.className = 'colophon-note';
        note.textContent = row.note;
        dd.appendChild(note);
      }
      dl.append(dt, dd);
    }

    for (const para of COLOPHON_NOTE) {
      const p = document.createElement('p');
      p.textContent = para;
      this.bodyEl.appendChild(p);
    }

    const src = document.createElement('p');
    src.className = 'pub-links';
    src.innerHTML = `<a class="read-link" href="${escapeAttr(CONTACT.github)}/ammarmian.github.io" target="_blank" rel="noopener">The source, in full &rarr;</a>`;
    this.bodyEl.appendChild(src);

    setRouteMeta(routeForSlug('publications'), 'publications');
    document.title = `${COLOPHON_TITLE} — ${PROFILE.name}`;

    this.clearDetailHandler();
    if (pushHistory && window.location.hash !== '#colophon') {
      window.history.pushState({}, '', window.location.pathname + '#colophon');
    }
    this.detailPopHandler = () => { if (window.location.hash !== '#colophon') this.closeDetail(false); };
    window.addEventListener('popstate', this.detailPopHandler);
  }

  /** The plucked book has to go back on the shelf when the record is closed,
   *  or the library slowly fills with them. */
  private closeDetail(popHash = true) {
    this.clearDetailHandler();
    // The record replaced the page title and canonical URL; the list is the
    // publications floor again.
    setRouteMeta(routeForSlug('publications'), 'publications');
    if (popHash && /^(#doc-|#colophon$)/.test(window.location.hash)) window.history.back();
    this.bodyEl.innerHTML = '';
    this.scene.shelveBook?.();
    this.scene.selectDoc?.(null);
    // Pull the camera back out from the shelf close-up to the general
    // library view instead of leaving it parked in on the book.
    void this.scene.focusFloor?.(this.scene.F?.library ?? null);
    if (this.halCache) this.renderPubBrowser(this.halCache); else this.renderPublications();
  }

  private renderProjects() {
    const list = document.createElement('ul');
    list.className = 'proj-list';
    for (const p of projects as any[]) {
      const li = document.createElement('li');
      li.innerHTML = `<h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p>${p.demo ? `<a class="read-link" href="${escapeAttr(p.demo)}" target="_blank" rel="noopener">Live demo &rarr;</a>` : ''}<a class="read-link" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">View on GitHub &rarr;</a>`;
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
      <li><span class="contact-label">GitHub</span><a href="${CONTACT.github}" target="_blank" rel="noopener">${CONTACT.github.replace(/^https:\/\//, '')}</a></li>
    `;
    this.bodyEl.appendChild(ul);
  }

  /** The sanctum is the gate room, so its panel is the gate: the same
   *  destinations the dial offers, reachable from here. It used to be a
   *  single paragraph promising content that didn't exist. */
  private renderElsewhere() {
    const worlds = this.scene.worlds;
    const p = document.createElement('p');
    p.textContent = this.actions.view === '2d'
      ? 'The portal here genuinely opens. Pick a world and the whole tower is carried through it: the land outside changes, the rooms stay as they are.'
      : 'The portal here genuinely opens. Step the tower through it and the world outside the windows changes — the light, the fog and the glass all follow.';
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

  /* ------------------------------ the cellar ------------------------------
     The bath is the only room in the tower that is not about the work, which
     makes it the right place for the machinery: how hard the scene is trying,
     the other two ways into the same content, everything the site has written
     down about this visitor, and the plug that washes all of it away.

     Deliberately not a second copy of the gear panel. The gear is for
     adjusting the scene while you are looking at it; this is the room where
     you find out what the state actually *is* and reset it. */
  private renderSettings() {
    const p = document.createElement('p');
    p.textContent = 'The one room down here that is not about the work. It is where the tower keeps its plumbing: how hard it is trying to draw itself, and everything it has written down about your visit.';
    this.bodyEl.appendChild(p);

    /* What the machine settled on, in prose — only where a 3D scene is being
       drawn. The numbers matter less than the one fact a slow visit hinges
       on: whether a GPU is drawing any of it. */
    if (this.scene.qualityState && this.scene.gpu) {
      const q = this.scene.qualityState();
      const gpu = this.scene.gpu();
      const state = document.createElement('p');
      state.className = 'pub-meta';
      state.textContent = [
        `Drawing at ${q.tier} detail${q.pinned ? ', pinned by you' : ', chosen automatically'}`,
        q.fps ? `${q.fps.toFixed(0)} frames a second` : null,
        gpu.ok ? (gpu.software ? 'on the CPU — no GPU in use' : 'on the graphics card') : 'not at all — no WebGL',
      ].filter(Boolean).join(' · ') + '.';
      this.bodyEl.appendChild(state);
    }

    this.groupLabel('Display');
    const is2d = this.actions.view === '2d';
    this.actionList([
      ...(is2d ? [] : [{
        label: 'Detail, resolution and the frame counter',
        blurb: 'The gear, bottom right — or press S from anywhere',
        run: () => this.actions.openSettings?.(),
      }]),
      is2d
        ? { label: 'The 3D tower', blurb: 'Walk round the whole thing — heavier, and best on a real graphics card', run: () => { window.location.href = BASE + '/?view=3d'; } }
        : { label: 'The pixel tower', blurb: 'The same rooms, hand-drawn in pixels — light on any machine', run: () => { window.location.href = BASE + '/2d'; } },
      {
        label: 'Text version',
        blurb: 'One plain page, everything on it, no pictures at all',
        run: () => { window.location.href = textPageHref(is2d ? '2d' : '3d'); },
      },
    ]);

    /* Everything the site has written into this browser, named in plain words
       rather than by storage key. Rendered from what is actually there, so an
       empty list is the honest answer for a first visit. */
    this.groupLabel('What the tower remembers');
    const REMEMBERED: [string, string][] = [
      ['lair-quality', 'the detail level you pinned'],
      ['lair-view', 'which way in you chose'],
      ['lair-fps', 'the frame counter being shown'],
      ['lair-backdrop', 'the ground the tower stands on'],
      ['lair-console-history', 'the commands you have typed'],
    ];
    const held: string[] = [];
    for (const [key, what] of REMEMBERED) {
      let v: string | null = null;
      try { v = localStorage.getItem(key); } catch {}
      if (v !== null) held.push(what);
    }
    const mem = document.createElement('p');
    mem.className = 'pub-meta';
    mem.textContent = held.length
      ? `In this browser only, never sent anywhere: ${held.join('; ')}.`
      : 'Nothing yet. Everything this site remembers stays in this browser and is never sent anywhere.';
    this.bodyEl.appendChild(mem);

    this.groupLabel('Start again');
    this.actionList([
      {
        label: 'Pull the plug',
        blurb: 'Empties all of the above and reloads the tower as a stranger would find it',
        danger: true,
        run: () => this.actions.onReset?.(),
      },
    ]);

    const note = document.createElement('p');
    note.className = 'pub-meta';
    note.textContent = 'The drain in the floor of this room does the same thing.';
    this.bodyEl.appendChild(note);
  }

  private groupLabel(text: string) {
    const el = document.createElement('div');
    el.className = 'group-label';
    el.textContent = text;
    this.bodyEl.appendChild(el);
  }

  /** The same row the destination list and the correspondence rack use — a
   *  bold label over a line of explanation, the whole row a button. */
  private actionList(rows: { label: string; blurb: string; danger?: boolean; run: () => void }[]) {
    const list = document.createElement('ul');
    list.className = 'pub-list';
    for (const r of rows) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pub-item' + (r.danger ? ' pub-item-danger' : '');
      btn.innerHTML = `<strong>${escapeHtml(r.label)}</strong><span>${escapeHtml(r.blurb)}</span>`;
      btn.addEventListener('click', r.run);
      li.appendChild(btn);
      list.appendChild(li);
    }
    this.bodyEl.appendChild(list);
  }

  private renderNow() {
    const p = document.createElement('p');
    p.textContent = PROFILE.currently;
    this.bodyEl.appendChild(p);
    const p2 = document.createElement('p');
    p2.textContent = 'What is simmering in the kitchen: the doctoral students and master’s interns I supervise, theses in progress first.';
    this.bodyEl.appendChild(p2);

    for (const { label, rows } of studentGroups()) {
      const h3 = document.createElement('div');
      h3.className = 'group-label';
      h3.textContent = label;
      this.bodyEl.appendChild(h3);
      const list = document.createElement('ul');
      list.className = 'proj-list';
      for (const s of rows) {
        const li = document.createElement('li');
        li.innerHTML = `<h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.topic)}</p>${s.note ? `<p class="tl-org">${escapeHtml(s.note)}</p>` : ''}<span class="status status-${s.status === 'current' ? 'current' : 'done'}">${escapeHtml(s.kind)} &middot; ${escapeHtml(s.period)}</span>`;
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

