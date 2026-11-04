import './style.css';
import { SidePanel } from './ui/SidePanel';
import { fetchHalPublications, shelfFor } from './data/hal';
import projects from './data/projects.json';
import { CONTACT } from './data/profile';
import { createHelpButton } from './ui/HelpModal';
import { createTerminal } from './ui/Terminal';
import { createDestinationModal } from './ui/DestinationModal';
import { renderTextPage } from './ui/TextPage';
import { offerLighter, preferredView, honourViewOverride } from './ui/lighter';
import { gpuInfo, guessTier } from './tower/quality';
import { renderAsciiConsole } from './ui/AsciiConsole';
import { createViewMenu } from './ui/ViewMenu';
import { createSettingsButton } from './ui/SettingsPanel';
import { createFpsMeter } from './ui/FpsMeter';
import { setRouteMeta } from './ui/meta';
import { announce } from './ui/io';
import { themePref, cycleTheme, THEME_ICON, THEME_LABEL } from './ui/theme';
import {
  FLOORS, routeForSlug, routeForIndex, currentSlug, navigate, onRouteChange, BASE,
  worldFromUrl, setWorldInUrl,
} from './router';

const app = document.getElementById('app')!;

// Three ways in, all showing the same content:
//   /text     — plain semantic HTML, for screen readers, crawlers and skimming
//   /console  — an ASCII tower driven by typing or tapping, good on a phone
//   /         — the 3D tower
const entry = currentSlug();
/* `?view=3d` on the way in means a visitor has come back for the tower; it
   clears any standing preference before the preference is read. */
honourViewOverride();

/* Two reasons to never reach the tower at all. One is a choice already made
   on this device; the other is a machine that cannot draw it — asking a
   browser with no WebGL context to spend 250KB finding that out for itself
   is the one case where guessing is better than measuring. */
const stuck = !gpuInfo().ok;
const chosen = preferredView();

if (entry === 'text') {
  renderTextPage(app);
} else if (entry === 'console') {
  renderAsciiConsole(app);
} else if (stuck || chosen === 'text') {
  renderTextPage(app);
} else if (chosen === 'console') {
  renderAsciiConsole(app);
} else {
  void bootTower();
}

/* Phones used to be met with a five-second countdown that defaulted to plain
   text — a guess made from the user agent, before a single frame had been
   drawn, at a time when the scene had one setting of effort and that setting
   was "all of it". Neither half of that holds now: there is a low tier most
   phones carry comfortably, and the 3D code is a lazy chunk, so arriving here
   costs 31KB until the tower is actually wanted.
   So everyone gets the tower, and the thing that decides whether it is
   working is the frame clock rather than a regular expression. If the lowest
   tier still cannot hold a rate, `lair-struggling` fires and the offer below
   appears — by then it is a measurement, not a prophecy. */

async function bootTower() {
/* ---------- loading screen (shown while the scene builds, with a welcome once it's ready) ---------- */
const loading = document.createElement('div');
loading.className = 'loading-veil';
loading.innerHTML = `
  <div class="loading-mark">
    <svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" /></svg>
  </div>
  <div class="loading-text">raising the tower&hellip;</div>
`;
document.body.appendChild(loading);

const towerHost = document.createElement('div');
towerHost.id = 'tower-host';
app.appendChild(towerHost);

// The veil is up before this line, so the download happens under "raising the
// tower…" rather than in front of a blank page.
const { createTowerScene } = await import('./tower/scene');

const tower = createTowerScene(towerHost, {
  onNavigateFloor: (i) => {
    const route = routeForIndex(i);
    // Every storey has a route now, the bath cellar included. The fallback is
    // kept as a guard: a floor the router does not know about must still be
    // enterable, it just cannot be linked to.
    if (route) navigate(route.slug); else tower.focusFloor(i);
  },
  onOpenDestinations: () => destModal.open(),
  onReset: () => resetEverything(),
});

/* Pulling the plug in the bath cellar. Everything this site remembers about
   you lives in localStorage and sessionStorage — the chosen backdrop, the
   cached archive, display preferences — so "clean" means all of it, and then
   a reload so the tower comes back exactly as a stranger would find it.
   Confirmed first: it is destructive and there is no undo. */
function resetEverything() {
  const ok = window.confirm(
    'Pull the plug?\n\nThis empties everything the tower remembers — your chosen '
    + 'backdrop, display settings and the cached publication list — and reloads it '
    + 'as a stranger would find it.',
  );
  if (!ok) return;
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  tower.drainBath();
  window.location.href = BASE + '/';
}

const destModal = createDestinationModal(app, tower.worlds, tower.previewWorld);

/* ---------- outer shell policy ----------
   Automatic: a ghost outline only from the whole-tower view, and only once
   a backdrop world is active — the ordinary tower needs no shell at all,
   and a single floor in focus needs an unobstructed view. The terminal's
   `shell` command can override this with a forced mode (or `auto` to
   hand control back). */
let shellOverride: 'off' | 'ghost' | 'solid' | null = null;
let floorFocused = false;
function syncShell() {
  if (shellOverride) {
    tower.worlds.shellFocus(false);
    tower.worlds.shell(shellOverride);
    return;
  }
  tower.worlds.shellFocus(floorFocused);
  tower.worlds.shell(tower.worlds.current() ? 'ghost' : 'off');
}
function setShellOverride(mode: 'off' | 'ghost' | 'solid' | null) {
  shellOverride = mode;
  syncShell();
}
window.addEventListener('lair-teleport', (e: any) => { if (e.detail?.phase === 'done') syncShell(); });

/* ---------- the active world lives in the URL ----------
   ?world=space makes a view shareable, and makes the telescope shortcut
   something you can link to. Written with replaceState — arriving at a
   world is not a navigation, so Back shouldn't have to undo it. */
window.addEventListener('lair-teleport', (e: any) => {
  if (e.detail?.phase === 'done') setWorldInUrl(tower.worlds.current());
});
const initialWorld = worldFromUrl();
if (initialWorld && tower.worlds.kinds.includes(initialWorld)) {
  // Set directly rather than teleported: the visitor asked to arrive there,
  // not to watch the transition into it.
  tower.worlds.set(initialWorld);
  syncShell();
} else if (initialWorld) {
  setWorldInUrl(null);   // an unknown world in the URL is just noise
}

const help = createHelpButton(app);
const destBtn = document.createElement('button');
destBtn.type = 'button';
destBtn.className = 'dest-btn';
destBtn.textContent = '◉';
destBtn.setAttribute('aria-label', 'Choose a destination world');
destBtn.setAttribute('aria-haspopup', 'dialog');
destBtn.addEventListener('click', () => destModal.open());
app.appendChild(destBtn);

/* The counter is what makes the detail settings legible: turn the tier down
   and the scene visibly coarsens, but whether that bought any frames is not
   something you can see. Created before the panel, which offers the toggle. */
const fpsMeter = createFpsMeter(app, tower);

// The same dials the console's display commands turn, for visitors who are
// never going to open a console.
const settings = createSettingsButton(app, {
  ...tower,
  showFps: (on: boolean) => fpsMeter.set(on),
  fpsShown: fpsMeter.on,
});

// The console takes the right-hand column, so the tower steps aside for it
// exactly as it does for a floor callout — otherwise the two overlap and
// the text sits on the busiest part of the scene.
function syncConsoleFraming() {
  const open = terminal.isOpen();
  const route = routeForSlug(currentSlug());
  if (open) tower.setPanelOpen(true, 'right');
  else if (route) tower.setPanelOpen(true, route.side);
  else tower.setPanelOpen(false);
  void tower.reframe();
}

const terminal = createTerminal(app, {
  worlds: tower.worlds,
  setShellOverride,
  onToggle: () => {
    syncConsoleFraming();
    termBtn.setAttribute('aria-pressed', String(terminal.isOpen()));
    termBtn.classList.toggle('nav-util-on', terminal.isOpen());
  },
  scene: {
    setPixelMode: tower.setPixelMode,
    setLightMode: tower.setLightMode,
    lightModeAvailable: tower.lightModeAvailable,
    probe: tower.probe,
    scan: tower.scan,
    perf: tower.perf,
    openColophon: () => panel.openColophon(),
    setQuality: tower.setQuality,
    qualityState: tower.qualityState,
    pixelMode: tower.pixelMode,
    gpu: tower.gpu,
    showFps: (on: boolean) => fpsMeter.set(on),
    fpsShown: fpsMeter.on,
    setVista: tower.setVista,
    goBath: tower.goBath,
    runBath: tower.runBath,
    drainBath: tower.drainBath,
    vista: tower.vista,
    VISTAS: tower.VISTAS,
    simSet: tower.simSet,
    simReset: tower.simReset,
    simList: tower.simList,
    setAutoRotate: tower.setAutoRotate,
    autoRotate: tower.autoRotate,
  },
});

/* ---------- the header ----------
   One bar across the top on a wide screen: the name on the left as the
   site's signature, the sections in the middle in reading order, and the
   tools on the right as a row of quiet icons — the gate to other worlds,
   the console, light or dark, other views, display settings, help. The
   round buttons that used to sit bottom right are gone from desktop; the
   same things are here, where a header keeps them.

   Listed in reading order, not tower order: the work first, then the two
   rooms that are about the site itself, set apart after a rule. */
const NAV_PRIMARY = ['about', 'publications', 'projects', 'now', 'contact'];
const NAV_MACHINERY = ['elsewhere', 'settings'];
const NAV_ORDER = [...NAV_PRIMARY, ...NAV_MACHINERY]
  .map((slug) => FLOORS.find((f) => f.slug === slug)!)
  .filter(Boolean);

const navRail = document.createElement('header');
navRail.className = 'nav-rail';
const links: HTMLAnchorElement[] = [];

const wholeTowerLink = document.createElement('a');
wholeTowerLink.className = 'nav-whole';
wholeTowerLink.href = BASE + '/';
wholeTowerLink.setAttribute('aria-label', 'Home — the whole tower');
wholeTowerLink.innerHTML = `<span class="nav-sig" aria-hidden="true">Ammar Mian</span><span class="nav-role" aria-hidden="true">LISTIC · Université Savoie Mont-Blanc</span>`;
wholeTowerLink.addEventListener('click', (e) => { e.preventDefault(); navigate(null); });
navRail.appendChild(wholeTowerLink);

function floorLink(f: (typeof FLOORS)[number], extra = '') {
  const a = document.createElement('a');
  a.className = 'nav-item' + extra;
  a.href = BASE + '/' + f.slug;
  a.textContent = f.label;
  a.addEventListener('click', (e) => { e.preventDefault(); navigate(f.slug); });
  links.push(a);
  return a;
}
const navSections = document.createElement('nav');
navSections.className = 'nav-sections';
navSections.setAttribute('aria-label', 'Sections');
for (const f of NAV_ORDER.filter((f) => NAV_PRIMARY.includes(f.slug))) navSections.appendChild(floorLink(f));
const navRule = document.createElement('span');
navRule.className = 'nav-rule';
navRule.setAttribute('aria-hidden', 'true');
navSections.appendChild(navRule);
for (const f of NAV_ORDER.filter((f) => NAV_MACHINERY.includes(f.slug))) navSections.appendChild(floorLink(f, ' nav-item-quiet'));
navRail.appendChild(navSections);

const ICON = {
  gate: '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="10" rx="5.2" ry="7.5"/><ellipse cx="10" cy="10" rx="2.2" ry="4"/></svg>',
  console: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6l4 4-4 4M10 14.5h6"/></svg>',
  // display settings: sliders, so it never reads as the theme's sun
  gear: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6h13M3.5 14h13"/><circle cx="7.5" cy="6" r="1.9" fill="var(--bg)"/><circle cx="12.5" cy="14" r="1.9" fill="var(--bg)"/></svg>',
  help: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M7.8 7.8a2.3 2.3 0 1 1 3.2 2.1c-.6.3-1 .8-1 1.5v.6"/><circle cx="10" cy="14.4" r=".5" fill="currentColor"/></svg>',
};
const navTools = document.createElement('div');
navTools.className = 'nav-tools';
function toolBtn(icon: string, label: string, run: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nav-tool';
  b.innerHTML = icon + `<span class="nav-tip">${label}</span>`;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', run);
  navTools.appendChild(b);
  return b;
}
toolBtn(ICON.gate, 'Other worlds (G)', () => destModal.open());
const termBtn = toolBtn(ICON.console, 'Console (/)', () => terminal.toggle());
termBtn.setAttribute('aria-pressed', 'false');
termBtn.classList.add('nav-term');
const themeBtn = toolBtn(THEME_ICON[themePref()], 'Theme', () => cycleTheme());
function syncThemeBtn() {
  const p = themePref();
  themeBtn.innerHTML = THEME_ICON[p] + `<span class="nav-tip">Theme: ${THEME_LABEL[p]}</span>`;
  themeBtn.setAttribute('aria-label', `Theme: ${THEME_LABEL[p]}. Change`);
}
syncThemeBtn();
window.addEventListener('lair-theme', syncThemeBtn);
const viewMenu = createViewMenu('3d');
navTools.appendChild(viewMenu.el);
toolBtn(ICON.gear, 'Display (S)', () => settings.toggle());
toolBtn(ICON.help, 'Help (?)', () => help.toggle());
navRail.appendChild(navTools);
document.body.appendChild(navRail);

/* ---------- on a phone: a bar at the bottom, where the thumb is ----------
   The row of dots across the top you had to slide a finger along is gone.
   In its place, the plainest thing a phone offers: previous and next either
   side of the section's name, and the name itself opens a sheet listing
   every section and every tool. Nothing to discover, nothing to learn. */
const stops: { slug: string | null; label: string; room: string }[] = [
  { slug: null, label: 'Home', room: 'The whole tower' },
  ...NAV_ORDER.map((f) => ({ slug: f.slug, label: f.label, room: f.title })),
];
const curStop = () => Math.max(0, stops.findIndex((s) => s.slug === currentSlug()));

const mbar = document.createElement('nav');
mbar.className = 'mbar';
mbar.setAttribute('aria-label', 'Sections');
mbar.innerHTML = `
  <button type="button" class="mbar-step mbar-prev" aria-label="Previous section"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg></button>
  <button type="button" class="mbar-title" aria-haspopup="dialog" aria-expanded="false">
    <span class="mbar-kicker"></span><span class="mbar-name"></span>
    <svg class="mbar-caret" viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 12.5L10 8l4.5 4.5"/></svg>
  </button>
  <button type="button" class="mbar-step mbar-next" aria-label="Next section"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5"/></svg></button>`;
app.appendChild(mbar);   // inside #app, so it stacks with the help and display sheets
const mPrev = mbar.querySelector('.mbar-prev') as HTMLButtonElement;
const mNext = mbar.querySelector('.mbar-next') as HTMLButtonElement;
const mTitle = mbar.querySelector('.mbar-title') as HTMLButtonElement;
mPrev.addEventListener('click', () => { const i = curStop(); if (i > 0) navigate(stops[i - 1].slug); });
mNext.addEventListener('click', () => { const i = curStop(); if (i < stops.length - 1) navigate(stops[i + 1].slug); });

const sheet = document.createElement('div');
sheet.className = 'msheet';
sheet.hidden = true;
sheet.innerHTML = `
  <div class="msheet-card" role="dialog" aria-modal="true" aria-label="Sections and tools">
    <div class="msheet-grip" aria-hidden="true"></div>
    <div class="msheet-head"><span class="nav-sig">Ammar Mian</span><button type="button" class="msheet-close" aria-label="Close">&times;</button></div>
    <ol class="msheet-list"></ol>
    <div class="msheet-tools"></div>
  </div>`;
app.appendChild(sheet);
const sheetList = sheet.querySelector('.msheet-list') as HTMLElement;
const sheetTools = sheet.querySelector('.msheet-tools') as HTMLElement;
stops.forEach((st, i) => {
  const li = document.createElement('li');
  if (i === 6) li.className = 'msheet-gap';            // the two rooms about the site, set apart
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'msheet-item';
  b.dataset.slug = st.slug ?? '';
  b.innerHTML = `<span class="msheet-label">${st.label}</span><span class="msheet-room">${st.room}</span>`;
  b.addEventListener('click', () => { setSheet(false); navigate(st.slug); });
  li.appendChild(b);
  sheetList.appendChild(li);
});
function sheetTool(icon: string, label: string, run: () => void, keepOpen = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'msheet-tool';
  b.innerHTML = icon + `<span>${label}</span>`;
  b.addEventListener('click', () => { if (!keepOpen) setSheet(false); run(); });
  sheetTools.appendChild(b);
  return b;
}
const SHORT = { auto: 'Auto', paper: 'Light', night: 'Dark' } as const;
const themeShort = () => THEME_ICON[themePref()] + `<span>Theme: ${SHORT[themePref()]}</span>`;
sheetTool(ICON.gate, 'Worlds', () => destModal.open());
// the theme stays in the sheet, so the change can be seen happening
const mTheme = sheetTool('', '', () => cycleTheme(), true);
mTheme.innerHTML = themeShort();
window.addEventListener('lair-theme', () => { mTheme.innerHTML = themeShort(); });
sheetTool(ICON.console, 'Console', () => { window.location.href = BASE + '/console'; });
sheetTool('<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4.5h10M5 8.5h10M5 12.5h10M5 16.5h6"/></svg>', 'Text page', () => { window.location.href = BASE + '/text'; });
sheetTool(ICON.gear, 'Display', () => settings.toggle());
sheetTool(ICON.help, 'Help', () => help.toggle());

function setSheet(open: boolean) {
  if (open) {
    sheet.hidden = false;
    for (const b of sheetList.querySelectorAll<HTMLButtonElement>('.msheet-item')) {
      b.toggleAttribute('aria-current', (b.dataset.slug || null) === currentSlug());
    }
    requestAnimationFrame(() => sheet.classList.add('msheet-open'));
  } else {
    sheet.classList.remove('msheet-open');
    window.setTimeout(() => { sheet.hidden = true; }, 220);
  }
  mTitle.setAttribute('aria-expanded', String(open));
}
mTitle.addEventListener('click', () => setSheet(sheet.hidden));
sheet.addEventListener('click', (e) => { if (e.target === sheet) setSheet(false); });
sheet.querySelector('.msheet-close')!.addEventListener('click', () => setSheet(false));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) setSheet(false); });

function syncMobileBar() {
  const i = curStop();
  const st = stops[i];
  (mbar.querySelector('.mbar-name') as HTMLElement).textContent = st.label;
  const route = routeForSlug(st.slug);
  (mbar.querySelector('.mbar-kicker') as HTMLElement).textContent =
    route ? `${String(route.index).padStart(2, '0')} · ${route.title}` : `${stops.length - 1} rooms · tap for all`;
  mPrev.disabled = i === 0;
  mNext.disabled = i === stops.length - 1;
}
syncMobileBar();

/* ---------- and when turning it down was not enough ----------
   Fired once, from the bottom of the quality scale. Deliberately not a modal:
   the tower is still there behind it and may be perfectly usable to look at
   even at fifteen frames a second — this is an offer, not an eviction. */
window.addEventListener('lair-struggling', (e: any) => {
  const fps = Math.round(e.detail?.fps ?? 0);
  offerLighter(
    `The tower is drawing at about ${fps} frames a second here, and it is already as simple as it goes. `
    + 'The same content reads well without the 3D.',
    `This device is drawing about ${fps} frames a second. A lighter text version is available.`,
  );
});

/* The first sign, rather than the last. By the time `lair-struggling` fires
   the governor has already spent its whole scale and several more seconds
   measuring — on the machines this matters for, that is half a minute of a
   slide show before anyone mentions there is another way to read the page. */
const g = gpuInfo();
if (g.software) {
  // Not a prediction: the browser has named a CPU rasteriser as the renderer.
  offerLighter(
    'This browser is drawing the tower on the processor rather than a graphics card, '
    + 'which it will do slowly however much detail is turned off. Everything here is also one plain page.',
    'No GPU is in use on this device. A lighter text version is available.',
  );
} else if (guessTier() === 'low') {
  // Deliberately after the opening, so the tower gets to make its case first.
  setTimeout(() => offerLighter(
    'This looks like a modest machine for a scene this size, so the tower is running at its lowest detail. '
    + 'If it feels heavy, the same content is one plain page.',
    'The tower is running at its lowest detail. A lighter text version is available.',
  ), 9000);
}
window.addEventListener('lair-quality', (e: any) => {
  if (e.detail?.reason === 'demoted' && e.detail?.tier === 'low') {
    offerLighter(
      'The tower has turned itself down as far as it goes to keep moving. '
      + 'If it still feels heavy, the same content reads well as one plain page.',
      'The tower is now at its lowest detail. A lighter text version is available.',
    );
  }
});

/* ---------- when the tower quietly turns itself down ----------
   The frame clock can drop the scene a tier mid-visit. It is a visible
   change — coarser pixels, fewer lights, thinner scenery — and a visitor who
   is not told why reasonably concludes the site has broken rather than that
   it has just made itself playable. So it says so, once, in the same floating
   voice the rest of the tower uses, and tells them how to overrule it. Only
   automatic changes announce themselves: a tier the visitor pinned needs no
   explanation. */
window.addEventListener('lair-quality', (e: any) => {
  const { tier, reason, blurb } = e.detail || {};
  if (reason !== 'demoted' && reason !== 'promoted') return;
  /* The same demotion may have just raised the offer of a lighter version,
     which says all of this and then some. Two floating notes explaining one
     event is one too many. */
  if (document.querySelector('.perf-offer')) return;
  const note = document.createElement('div');
  note.className = 'quality-note';
  note.setAttribute('role', 'status');
  note.innerHTML = `
    <div class="kicker">${reason === 'demoted' ? 'easing off' : 'more room'}</div>
    <p>Detail set to <strong>${tier}</strong> — ${blurb} — to keep the tower moving smoothly.</p>
    <p class="quality-note-keys">Type <kbd>quality high</kbd> in the console to overrule it.</p>
  `;
  document.body.appendChild(note);
  requestAnimationFrame(() => note.classList.add('quality-note-in'));
  const dismiss = () => {
    note.classList.remove('quality-note-in');
    setTimeout(() => note.remove(), 500);
  };
  setTimeout(dismiss, 6500);
  note.addEventListener('click', dismiss);
  announce(`Detail set to ${tier} to keep the frame rate up.`);
});

/* ---------- hover/act hint ---------- */
const hint = document.createElement('div');
hint.id = 'hint';
document.body.appendChild(hint);
let actUntil = 0;
window.addEventListener('lair-hover', (e: any) => {
  if (Date.now() < actUntil) return;
  hint.textContent = e.detail || '';
  hint.dataset.on = e.detail ? '1' : '0';
});
window.addEventListener('lair-act', (e: any) => {
  hint.textContent = e.detail;
  hint.dataset.on = '1';
  actUntil = Date.now() + 1200;
  // The props are the most rewarding part of the scene and were previously
  // pointer-and-eyesight only; at least say what just happened.
  announce(e.detail);
});

/* ---------- keyboard navigation ----------
   The tower was mouse-only: nothing in the canvas takes focus, so without
   this there is no way to reach a floor from the keyboard at all. Arrow
   keys walk the storeys in physical order, digits jump in the nav's order, and the single
   letters mirror the three buttons. Anything typed into a field is left
   well alone. */
const FLOOR_ORDER = [...FLOORS].sort((a, b) => a.index - b.index).map((f) => f.slug);

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function stepFloor(delta: number) {
  const slug = currentSlug();
  const at = FLOOR_ORDER.indexOf(slug ?? '');
  // From the whole-tower view, down enters at the bottom and up at the top.
  const next = at === -1
    ? (delta > 0 ? 0 : FLOOR_ORDER.length - 1)
    : at + delta;
  if (next < 0) { navigate(null); return; }
  if (next >= FLOOR_ORDER.length) return;
  navigate(FLOOR_ORDER[next]);
}

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); stepFloor(1); break;
    case 'ArrowDown': e.preventDefault(); stepFloor(-1); break;
    case 'Home': case 'h': case 'H': e.preventDefault(); navigate(null); break;
    case 'g': case 'G': e.preventDefault(); destModal.open(); break;
    case 's': case 'S': e.preventDefault(); settings.toggle(); break;
    // '/' — the search-and-command key everything else uses. preventDefault
    // matters here: Firefox's quick-find would otherwise steal it.
    case '/': e.preventDefault(); terminal.toggle(); break;
    case '?': e.preventDefault(); help.toggle(); break;
    default:
      if (/^[1-7]$/.test(e.key)) {
        e.preventDefault();
        // Digits follow the nav's reading order (1 = About), arrows the stairs.
        navigate(NAV_ORDER[Number(e.key) - 1].slug);
      }
  }
});

/* ---------- panel + router ---------- */
const panel = new SidePanel(app, tower, {
  onReset: () => resetEverything(),
  openSettings: () => settings.toggle(),
});

/* The shelves are the index. Once HAL answers, every record takes a real
   spine in the library — hover one to read its title, click it to open the
   record — so the collection lives in the tower rather than only beside it.
   Deliberately not awaited: the tower is usable long before the archive
   replies, and a slow or failed fetch just leaves the shelf anonymous. */
void fetchHalPublications()
  .then((docs) => tower.bindPublications(docs, shelfFor, (id) => void panel.openDoc(id)))
  .catch(() => {});

/* And the same for the laboratory: each project becomes a lit specimen on the
   alchemy shelves. This list is local, so it can be bound immediately. */
tower.bindProjects(projects as { name: string; status?: string }[], () => navigate('projects'));

/* The three prose rooms. Each gets the one object that plainly is its section
   — and the correspondence rack's four tokens do the thing itself, so writing
   to the keeper means picking up the sealed letter off the shelf. */
tower.bindRooms({
  onAbout: () => navigate('about'),
  onNow: () => navigate('now'),
  onContact: () => navigate('contact'),
  onColophon: () => panel.openColophon(),
  channels: [
    { label: `Write to the keeper — ${CONTACT.email}`, open: () => { window.location.href = `mailto:${CONTACT.email}`; } },
    { label: 'The open archive — everything on HAL', open: () => window.open(CONTACT.hal, '_blank', 'noopener') },
    { label: 'The workshop — code on GitHub', open: () => window.open(CONTACT.github, '_blank', 'noopener') },
    { label: 'Where he is found — the tower itself', open: () => navigate('contact') },
  ],
});

let navGen = 0;
let appliedSlug: string | null | undefined;
async function applyRoute(slug: string | null) {
  // A popstate can fire for a hash-only change (the "#record" bookmark a
  // publication detail pushes) without the floor route actually changing —
  // re-running the whole close/fly/reopen dance in that case is what made
  // the publication list flash open then shut right after "back to the
  // shelves". Only do the work when the resolved floor route is new.
  if (slug === appliedSlug) return;
  appliedSlug = slug;

  const gen = ++navGen;
  const route = routeForSlug(slug);
  // Floor navigation never touches the backdrop world — only the dial's
  // destination modal and the terminal's `jump` command do that.
  floorFocused = !!route;
  syncShell();
  setRouteMeta(route, slug);
  announce(route ? `${route.label} — ${route.title}` : 'The whole tower');
  links.forEach((a) => {
    const isCurrent = route && a.getAttribute('href') === BASE + '/' + route.slug;
    if (isCurrent) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  wholeTowerLink.toggleAttribute('aria-current', !route);
  syncMobileBar();

  // Hide any current panel content while the camera is still moving —
  // the record only appears once the tower has settled on the floor.
  panel.close();

  // An open console always owns the right-hand column, so it decides which
  // way the tower leans regardless of which side this floor's callout uses.
  if (route) {
    tower.setPanelOpen(true, terminal.isOpen() ? 'right' : route.side);
    await tower.focusFloor(route.index);
    if (gen !== navGen) return;
    panel.open(route);
  } else {
    tower.setPanelOpen(terminal.isOpen(), 'right');
    await tower.focusFloor(null);
  }
}

onRouteChange(applyRoute);

tower.start();

/* ---------- intro: fade the loading veil early so the rise is actually
   visible, let the tower build itself floor by floor, then hand off to
   routing to fly the camera wherever the URL points ---------- */
(async () => {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  loading.classList.add('loading-hidden');
  setTimeout(() => loading.remove(), 700);

  await tower.playIntro();

  // Shown the moment the tower finishes rising, not after the camera has
  // also flown to a floor — it used to appear some eight seconds in, and on
  // a deep link it arrived over an already-focused storey telling the
  // visitor to click a floor. A deep link means they know where they're
  // going, so it stays away entirely.
  const deepLink = currentSlug() !== null;
  if (!deepLink) showWelcome();

  await applyRoute(currentSlug());
})();

function showWelcome() {
  const welcome = document.createElement('div');
  welcome.className = 'welcome-note';
  welcome.innerHTML = `
    <div class="kicker">welcome</div>
    <p>A tower, spiralling upward. Drag to look around, click a floor — or the door itself — to visit.</p>
    <p class="welcome-keys">Arrow keys walk the storeys &middot; <kbd>G</kbd> the gate &middot; <kbd>/</kbd> the console &middot; <kbd>?</kbd> help</p>
  `;
  document.body.appendChild(welcome);
  requestAnimationFrame(() => welcome.classList.add('welcome-in'));
  const dismiss = () => {
    welcome.classList.remove('welcome-in');
    setTimeout(() => welcome.remove(), 500);
  };
  setTimeout(dismiss, 7000);
  welcome.addEventListener('click', dismiss);
  // Any real interaction means they've started exploring — get out of the way.
  window.addEventListener('pointerdown', dismiss, { once: true });
}
}
