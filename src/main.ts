import './style.css';
import { createTowerScene } from './tower/scene';
import { SidePanel } from './ui/SidePanel';
import { createHelpButton } from './ui/HelpModal';
import { createTerminal } from './ui/Terminal';
import { createDestinationModal } from './ui/DestinationModal';
import { renderTextPage } from './ui/TextPage';
import { FLOORS, routeForSlug, routeForIndex, currentSlug, navigate, onRouteChange, BASE } from './router';

const app = document.getElementById('app')!;

// The plain-text route skips the 3D scene entirely — a full CV's worth of
// content for anyone who can't or doesn't want to drive a spatial camera
// (screen readers, low-power devices, search crawlers, a quick skim).
if (currentSlug() === 'text') {
  renderTextPage(app);
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

/** A five-second choice: ride the 3D tower, or jump to the text version.
 *  No answer in time defaults to text — the safer, lighter option. */
function promptForMode() {
  const overlay = document.createElement('div');
  overlay.className = 'mode-prompt';
  overlay.innerHTML = `
    <div class="mode-prompt-card">
      <div class="kicker">choose a view</div>
      <p>This site is an interactive 3D tower. On a phone it can be slow to load and awkward to navigate — you can view a plain text version instead.</p>
      <div class="mode-prompt-actions">
        <button type="button" class="mode-btn mode-btn-primary" data-choice="3d">Load 3D scene</button>
        <button type="button" class="mode-btn" data-choice="text">Text version</button>
      </div>
      <div class="mode-prompt-timer">Text version in <span class="mode-prompt-count">5</span>s&hellip;</div>
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
  function settle(choice: '3d' | 'text') {
    if (settled) return;
    settled = true;
    window.clearInterval(tick);
    overlay.remove();
    if (choice === 'text') {
      navigate('text', { replace: true });
      renderTextPage(app);
    } else {
      bootTower();
    }
  }

  overlay.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => settle(btn.dataset.choice as '3d' | 'text'));
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
    if (route) navigate(route.slug);
  },
  onOpenDestinations: () => destModal.open(),
});

const destModal = createDestinationModal(app, tower.worlds);

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

createHelpButton(app);
const destBtn = document.createElement('button');
destBtn.type = 'button';
destBtn.className = 'dest-btn';
destBtn.textContent = '◉';
destBtn.setAttribute('aria-label', 'Choose a destination world');
destBtn.setAttribute('aria-haspopup', 'dialog');
destBtn.addEventListener('click', () => destModal.open());
app.appendChild(destBtn);

const terminal = createTerminal(app, { worlds: tower.worlds, setShellOverride });

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
const textLink = document.createElement('a');
textLink.className = 'nav-item nav-util nav-util-first';
textLink.href = BASE + '/text';
textLink.innerHTML = `<span class="nav-label">Text version</span>`;
navRail.appendChild(textLink);

const termBtn = document.createElement('button');
termBtn.type = 'button';
termBtn.className = 'nav-item nav-term';
termBtn.innerHTML = `<span class="nav-label">&gt;_ Terminal</span>`;
termBtn.addEventListener('click', () => terminal.toggle());
navRail.appendChild(termBtn);
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
});

/* ---------- panel + router ---------- */
const panel = new SidePanel(app, tower);

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
  links.forEach((a) => {
    const isCurrent = route && a.getAttribute('href') === BASE + '/' + route.slug;
    if (isCurrent) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  wholeTowerLink.toggleAttribute('aria-current', !route);
  dots.forEach((d, i) => d.classList.toggle('dot-active', dotStops[i].slug === slug));

  // Hide any current panel content while the camera is still moving —
  // the record only appears once the tower has settled on the floor.
  panel.close();

  if (route) {
    tower.setPanelOpen(true, route.side);
    await tower.focusFloor(route.index);
    if (gen !== navGen) return;
    panel.open(route);
  } else {
    tower.setPanelOpen(false);
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
  await applyRoute(currentSlug());

  const welcome = document.createElement('div');
  welcome.className = 'welcome-note';
  welcome.innerHTML = `
    <div class="kicker">welcome</div>
    <p>A tower, spiralling upward. Drag to look around, click a floor — or the door itself — to visit.</p>
  `;
  document.body.appendChild(welcome);
  requestAnimationFrame(() => welcome.classList.add('welcome-in'));
  const dismiss = () => {
    welcome.classList.remove('welcome-in');
    setTimeout(() => welcome.remove(), 500);
  };
  setTimeout(dismiss, 6000);
  welcome.addEventListener('click', dismiss);
})();
}
