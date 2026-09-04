import { PROFILE, CONTACT } from '../data/profile';
import { runCommand, describeFloor, asciiTower, JUMP_TARGETS, type Ctx } from './commands';
import { attachLineEditor } from './lineEditor';
import { FLOORS, currentSlug, onRouteChange } from '../router';
import { FLOOR_NAMES } from '../tower/scene-constants';
import { setRouteMeta } from './meta';

/** A third way in: the same tower, drawn in monospace and driven by typing
 *  or tapping. Built for phones — where a 3D scene is heavy and orbit
 *  controls are fiddly — but it's a real mode, not a consolation prize:
 *  every command the docked console has, minus the ones that need a camera.
 *
 *  It shares the command table with the 3D console, so the two can't drift. */
export function renderAsciiConsole(root: HTMLElement) {
  setRouteMeta(null, 'console');

  const view = document.createElement('main');
  view.className = 'ascii-view';
  view.innerHTML = `
    <header class="ascii-masthead">
      <div class="ascii-name">${PROFILE.name}</div>
      <div class="ascii-role">${PROFILE.role} — LISTIC, Université Savoie Mont-Blanc</div>
      <nav class="ascii-modes" aria-label="Other views">
        <a href="/">3D tower</a><span aria-hidden="true">·</span><a href="/text">Text version</a>
      </nav>
      <button class="ascii-tower-toggle" type="button" aria-controls="ascii-tower" aria-expanded="false">
        <span aria-hidden="true">⌂</span> Tower
      </button>
    </header>
    <div class="ascii-body">
      <pre class="ascii-tower" id="ascii-tower" aria-label="The tower, in text. Each storey is a link."></pre>
      <div class="ascii-log" role="log" aria-label="Console output"></div>
    </div>
    <form class="ascii-inputline" autocomplete="off">
      <label class="ascii-prompt" for="ascii-input">&gt;</label>
      <input class="ascii-input" id="ascii-input" type="text" autocomplete="off"
             autocapitalize="off" autocorrect="off" spellcheck="false"
             placeholder="type a command, or tap a storey" aria-label="Console command">
    </form>
    <div class="ascii-keys" role="group" aria-label="Common commands"></div>
  `;
  root.appendChild(view);

  const towerEl = view.querySelector('.ascii-tower') as HTMLPreElement;
  const log = view.querySelector('.ascii-log') as HTMLElement;
  const input = view.querySelector('.ascii-input') as HTMLInputElement;
  const form = view.querySelector('.ascii-inputline') as HTMLFormElement;
  const keys = view.querySelector('.ascii-keys') as HTMLElement;
  const towerToggle = view.querySelector('.ascii-tower-toggle') as HTMLButtonElement;

  function setTowerOpen(open: boolean) {
    towerEl.classList.toggle('ascii-tower-open', open);
    towerToggle.setAttribute('aria-expanded', String(open));
    towerToggle.innerHTML = open
      ? '<span aria-hidden="true">×</span> Close tower'
      : '<span aria-hidden="true">⌂</span> Tower';
    if (!open) input.focus();
  }

  towerToggle.addEventListener('click', () => {
    setTowerOpen(!towerEl.classList.contains('ascii-tower-open'));
  });

  function print(line: string, cls = '') {
    const row = document.createElement('div');
    row.className = 'ascii-line' + (cls ? ' ascii-' + cls : '');
    row.textContent = line;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  function clear() { log.innerHTML = ''; }

  /* -------------------------- the tower drawing ------------------------- */

  function draw(active: number | null = null) {
    const { text, rows } = asciiTower(active);
    towerEl.innerHTML = '';
    text.split('\n').forEach((line, i) => {
      const floor = rows[i];
      if (floor === null || floor === undefined) {
        const span = document.createElement('span');
        span.className = 'ascii-row';
        span.textContent = line + '\n';
        towerEl.appendChild(span);
        return;
      }
      // Each storey's three rows are one button between them, so tapping
      // anywhere on the box works — including the wall, not just the label.
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ascii-row ascii-row-floor' + (floor === active ? ' ascii-row-active' : '');
      btn.textContent = line + '\n';
      const route = FLOORS.find((f) => f.index === floor);
      btn.setAttribute('aria-label', `${FLOOR_NAMES[floor]}${route ? ` — ${route.label}` : ''}`);
      if (floor === active) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', () => {
        if (route) {
          setTowerOpen(false);
          void submit(`goto ${route.slug}`);
        }
      });
      towerEl.appendChild(btn);
    });
  }

  /* ------------------------------ the shell ----------------------------- */

  const ctx: Ctx = {
    print, clear, draw,
    close: () => { window.location.href = '/'; },
    isCompact: () => window.matchMedia('(max-width: 900px)').matches,
    mode: 'ascii',
    scene: null,
    // No 3D scene here, so nothing can hold a world; `jump` says so plainly
    // rather than pretending to work.
    worlds: {
      kinds: JUMP_TARGETS.filter((k) => k !== 'none'),
      current: () => null,
      teleport: () => false,
    },
    setShellOverride: () => {},
  };

  async function submit(line: string) {
    print('> ' + line, 'echo');
    try {
      await runCommand(line, ctx);
    } catch (err) {
      print(`error: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
    print('');
    input.focus();
  }

  attachLineEditor({
    input, form, ctx, print,
    storageKey: 'lair-console-history',
    onSubmit: submit,
    onClear: clear,
  });

  /* ----------------------------- quick keys ----------------------------- */

  const QUICK: [string, string][] = [
    ['hello', 'hello'],
    ['help', 'help'],
    ['cv', 'cat cv.txt'],
    ['papers', 'pubs'],
    ['projects', 'ls'],
    ['contact', 'cat contact.txt'],
    ['3D tower', 'view 3d'],
  ];
  for (const [label, cmd] of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ascii-key';
    b.textContent = label;
    b.addEventListener('click', () => void submit(cmd));
    keys.appendChild(b);
  }

  /* ------------------------------- routing ------------------------------ */

  // The URL still names a floor, so /publications reached from a bookmark
  // lands here on the right storey with its content already printed.
  function syncFromUrl(initial: boolean) {
    const slug = currentSlug();
    const route = FLOORS.find((f) => f.slug === slug);
    draw(route ? route.index : null);
    setRouteMeta(route ?? null, route ? route.slug : 'console');
    if (route) void describeFloor(route.slug, ctx).then(() => print(''));
    else if (initial) {
      print(`${PROFILE.name} — ${PROFILE.role}`, 'head');
      print(PROFILE.affiliation, 'dim');
      print('');
      print(PROFILE.bio);
      print('');
      print('Tap a storey above, or type a command — "help" lists them all,', 'dim');
      print('and "hello" introduces the keeper.', 'dim');
      print(`Reach me at ${CONTACT.email}.`, 'dim');
      print('');
    }
  }

  onRouteChange(() => syncFromUrl(false));
  syncFromUrl(true);

  // Typing should just work: any printable key focuses the input, so the
  // console never feels like it's ignoring you.
  window.addEventListener('keydown', (e) => {
    if (e.target === input || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length === 1) input.focus();
  });
}
