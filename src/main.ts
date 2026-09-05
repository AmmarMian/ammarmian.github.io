import './style.css';
import { createTowerScene } from './tower/scene';
import { SidePanel } from './ui/SidePanel';
import { fetchHalPublications, shelfFor } from './data/hal';
import projects from './data/projects.json';
import { CONTACT } from './data/profile';
import { createHelpButton } from './ui/HelpModal';
import { createTerminal } from './ui/Terminal';
import { createDestinationModal } from './ui/DestinationModal';
import { renderTextPage } from './ui/TextPage';
import { renderAsciiConsole } from './ui/AsciiConsole';
import { createViewMenu } from './ui/ViewMenu';
import { setRouteMeta } from './ui/meta';
import { announce } from './ui/io';
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
if (entry === 'text') {
  renderTextPage(app);
} else if (entry === 'console') {
  renderAsciiConsole(app);
} else if (isMobileDevice()) {
  promptForMode();
} else {
  bootTower();
}

/** Coarse pointer + narrow viewport reads as "phone-shaped" — the 3D tower
 *  is heavy on mobile GPUs/CPUs and often unwelcome on metered data, so
 *  those visitors get asked instead of dropped straight into it. */
function isMobileDevice(): boolean {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth <= 820;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return uaMobile || (coarse && narrow);
}

/** A five-second choice between the three views. No answer in time still
 *  defaults to text — the safest, lightest option on a phone. */
function promptForMode() {
  const overlay = document.createElement('div');
  overlay.className = 'mode-prompt';
  overlay.innerHTML = `
    <div class="mode-prompt-card">
      <div class="kicker">choose a view</div>
      <p>This site is an interactive 3D tower. On a phone it can be slow to load and awkward to navigate — there's a text console that walks the same tower, or a plain text page.</p>
      <div class="mode-prompt-actions">
        <button type="button" class="mode-btn mode-btn-primary" data-choice="3d">Load 3D scene</button>
        <button type="button" class="mode-btn" data-choice="console">Text console</button>
        <button type="button" class="mode-btn" data-choice="text">Plain text</button>
      </div>
      <div class="mode-prompt-timer">Plain text in <span class="mode-prompt-count">5</span>s&hellip;</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const countEl = overlay.querySelector('.mode-prompt-count')!;
  let remaining = 5;
  const tick = window.setInterval(() => {
    remaining -= 1;
    countEl.textContent = String(Math.max(remaining, 0));
    if (remaining <= 0) settle('text');
  }, 1000);

  let settled = false;
  function settle(choice: '3d' | 'text' | 'console') {
    if (settled) return;
    settled = true;
    window.clearInterval(tick);
    overlay.remove();
    if (choice === 'text') {
      navigate('text', { replace: true });
      renderTextPage(app);
    } else if (choice === 'console') {
      navigate('console', { replace: true });
      renderAsciiConsole(app);
    } else {
      bootTower();
    }
  }

  overlay.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => settle(btn.dataset.choice as '3d' | 'text' | 'console'));
  });
}

function bootTower() {
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

const tower = createTowerScene(towerHost, {
  onNavigateFloor: (i) => {
    const route = routeForIndex(i);
    // The bathhouse carries no section — it is the one room in the tower that
    // is not about the work. Clicking it still takes you in; there is simply
    // nothing to read when you get there.
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

/* ---------- nav rail: a horizontal spine across the top, out of the callout's way ---------- */
const navRail = document.createElement('nav');
navRail.className = 'nav-rail';
navRail.setAttribute('aria-label', 'Tower floors');
const links: HTMLAnchorElement[] = [];

const wholeTowerLink = document.createElement('a');
wholeTowerLink.className = 'nav-item nav-whole';
wholeTowerLink.href = BASE + '/';
wholeTowerLink.innerHTML = `<span class="nav-label">Home</span>`;
wholeTowerLink.addEventListener('click', (e) => { e.preventDefault(); navigate(null); });
navRail.appendChild(wholeTowerLink);

// Displayed in physical tower order (bottom to top), not declaration order.
const FLOORS_BY_LEVEL = [...FLOORS].sort((a, b) => a.index - b.index);

for (const f of FLOORS_BY_LEVEL) {
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.href = BASE + '/' + f.slug;
  a.innerHTML = `<span class="nav-num">${String(f.index + 1).padStart(2, '0')}</span><span class="nav-label">${f.label}</span>`;
  a.addEventListener('click', (e) => { e.preventDefault(); navigate(f.slug); });
  navRail.appendChild(a);
  links.push(a);
}
// Utilities live in their own group after a rule: the floors are where you
// go, these are how you look at them. Three separate presentation links
// used to sit inline with the floors, which made a nine-item row of things
// that aren't remotely the same kind of thing.
const navUtils = document.createElement('div');
navUtils.className = 'nav-utils';

const termBtn = document.createElement('button');
termBtn.type = 'button';
termBtn.className = 'nav-item nav-util nav-term';
termBtn.setAttribute('aria-pressed', 'false');
termBtn.innerHTML = `<span class="nav-label">&gt;_ Console</span>`;
termBtn.addEventListener('click', () => terminal.toggle());
navUtils.appendChild(termBtn);

const viewMenu = createViewMenu('3d');
navUtils.appendChild(viewMenu.el);

navRail.appendChild(navUtils);
document.body.appendChild(navRail);

/* ---------- mobile nav: a row of dots, tap for a name, slide to move ---------- */
const dotNav = document.createElement('nav');
dotNav.className = 'dot-nav';
dotNav.setAttribute('aria-label', 'Tower floors');
const dotLabel = document.createElement('div');
dotLabel.className = 'dot-label';
dotNav.appendChild(dotLabel);
const dotRow = document.createElement('div');
dotRow.className = 'dot-row';
dotNav.appendChild(dotRow);
document.body.appendChild(dotNav);

const dotStops: { slug: string | null; label: string }[] = [
  { slug: null, label: 'Home' },
  ...FLOORS_BY_LEVEL.map((f) => ({ slug: f.slug, label: f.label })),
];
const dots: HTMLButtonElement[] = dotStops.map((s) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dot';
  b.setAttribute('aria-label', s.label);
  dotRow.appendChild(b);
  return b;
});

let dotLabelTimer: number | undefined;
function showDotLabel(text: string) {
  dotLabel.textContent = text;
  dotLabel.classList.add('dot-label-on');
  window.clearTimeout(dotLabelTimer);
  dotLabelTimer = window.setTimeout(() => dotLabel.classList.remove('dot-label-on'), 1600);
}

// Press anywhere on the row, drag toward the stop you want — a preview
// ring tracks the candidate under your finger the whole way, and letting
// go commits to wherever it's sitting. A tap (no real movement) just
// jumps straight to the dot under the finger.
const DOT_STEP = 44;
let dragStartX = 0, dragStartIdx = 0, previewIdx = -1, dragging = false;

function curDotIdx() {
  const i = dotStops.findIndex((s) => s.slug === currentSlug());
  return i < 0 ? 0 : i;
}
function setPreview(idx: number) {
  if (idx === previewIdx) return;
  previewIdx = idx;
  dots.forEach((d, i) => d.classList.toggle('dot-preview', i === idx));
  showDotLabel(dotStops[idx].label);
}
function clearPreview() {
  previewIdx = -1;
  dots.forEach((d) => d.classList.remove('dot-preview'));
}

dotRow.addEventListener('pointerdown', (e) => {
  dragStartX = e.clientX;
  dragStartIdx = curDotIdx();
  dragging = false;
  dotRow.setPointerCapture(e.pointerId);
});
dotRow.addEventListener('pointermove', (e) => {
  if (!e.buttons) return;
  const dx = e.clientX - dragStartX;
  if (Math.abs(dx) > 6) dragging = true;
  if (!dragging) return;
  const steps = Math.round(dx / DOT_STEP);
  setPreview(Math.max(0, Math.min(dotStops.length - 1, dragStartIdx + steps)));
});
dotRow.addEventListener('pointerup', (e) => {
  if (dragging) {
    const idx = previewIdx === -1 ? dragStartIdx : previewIdx;
    clearPreview();
    showDotLabel(dotStops[idx].label);
    navigate(dotStops[idx].slug);
    return;
  }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const btn = el instanceof Element ? el.closest('.dot') : null;
  const idx = btn ? dots.indexOf(btn as HTMLButtonElement) : -1;
  if (idx >= 0) { showDotLabel(dotStops[idx].label); navigate(dotStops[idx].slug); }
});
dotRow.addEventListener('pointercancel', () => { clearPreview(); dragging = false; });

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
   keys walk the storeys in physical order, digits jump, and the single
   letters mirror the three buttons. Anything typed into a field is left
   well alone. */
const FLOOR_ORDER = FLOORS_BY_LEVEL.map((f) => f.slug);

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
    // '/' — the search-and-command key everything else uses. preventDefault
    // matters here: Firefox's quick-find would otherwise steal it.
    case '/': e.preventDefault(); terminal.toggle(); break;
    case '?': e.preventDefault(); help.toggle(); break;
    default:
      if (/^[1-6]$/.test(e.key)) {
        e.preventDefault();
        navigate(FLOOR_ORDER[Number(e.key) - 1]);
      }
  }
});

/* ---------- panel + router ---------- */
const panel = new SidePanel(app, tower);

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
  dots.forEach((d, i) => d.classList.toggle('dot-active', dotStops[i].slug === slug));

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
