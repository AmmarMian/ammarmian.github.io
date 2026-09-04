import { PROFILE, CONTACT } from '../data/profile';
import { fetchHalPublications } from '../data/hal';
import students from '../data/students.json';
import projects from '../data/projects.json';
import { FLOORS, navigate } from '../router';

interface WorldsApi {
  kinds: string[];
  current: () => string | null;
  teleport: (kind: string | null, onSwap?: () => void) => boolean;
}

interface Host {
  worlds: WorldsApi;
  setShellOverride: (mode: 'off' | 'ghost' | 'solid' | null) => void;
}

interface Ctx extends Host {
  print: (line: string) => void;
  clear: () => void;
  close: () => void;
}

const GOTO_TARGETS: Record<string, string | null> = { home: null, tower: null };
for (const f of FLOORS) GOTO_TARGETS[f.slug] = f.slug;

const JUMP_TARGETS = ['none', 'seafloor', 'moon', 'forest', 'beach', 'city'];
const SHELL_TARGETS = ['off', 'ghost', 'solid', 'auto'];

const COMMANDS: Record<string, (args: string[], ctx: Ctx) => void | Promise<void>> = {
  help(_args, { print }) {
    print('Commands:');
    print('  help                 this list');
    print('  whoami               who lives here');
    print('  cat cv.txt           bio, positions, education');
    print('  cat contact.txt      how to reach me');
    print('  ls                   tools and projects');
    print('  ls publications      recent HAL records');
    print(`  goto <floor>         ${Object.keys(GOTO_TARGETS).join(', ')}`);
    print(`  jump <world>         ${JUMP_TARGETS.join(', ')} — teleport the backdrop`);
    print(`  shell <mode>         ${SHELL_TARGETS.join(', ')} — force the outer shell, or hand control back`);
    print('  clear                clear the screen');
    print('  exit                 close this terminal');
  },
  whoami(_args, { print }) {
    print(`${PROFILE.name} — ${PROFILE.role}`);
    print(PROFILE.affiliation);
  },
  async cat(args, { print }) {
    const file = args[0];
    if (file === 'cv.txt') {
      print(`${PROFILE.role} — ${PROFILE.affiliation}`);
      print(PROFILE.bio);
      print('');
      print('positions:');
      for (const p of PROFILE.positions) print(`  ${p.year.padEnd(11)} ${p.role} — ${p.org}`);
      print('education:');
      for (const e of PROFILE.education) print(`  ${e.year.padEnd(11)} ${e.role} — ${e.org}`);
    } else if (file === 'contact.txt') {
      print(`email    ${CONTACT.email}`);
      print(`office   ${CONTACT.office}`);
      print(`github   ${CONTACT.github}`);
      print(`hal      ${CONTACT.hal}`);
    } else {
      print(`cat: ${file || 'missing operand'}: no such file — try cv.txt or contact.txt`);
    }
  },
  async ls(args, { print }) {
    if (args[0] === 'publications') {
      print('querying HAL…');
      try {
        const docs = await fetchHalPublications();
        docs.slice(0, 14).forEach((d) => print(`  ${String(d.year || 'n.d.').padEnd(6)} ${d.title}`));
        print(`… ${docs.length} records total — see /publications`);
      } catch {
        print('HAL did not answer.');
      }
      return;
    }
    for (const p of projects as any[]) print(`  ${p.name.padEnd(10)} ${p.description}`);
    const current = (students as any[]).filter((s) => s.status === 'current');
    if (current.length) {
      print('');
      print('currently supervising:');
      for (const s of current) print(`  ${s.name.padEnd(20)} ${s.topic}`);
    }
  },
  goto(args, { print, close }) {
    const target = args[0];
    if (target && target in GOTO_TARGETS) { navigate(GOTO_TARGETS[target]); close(); }
    else print(`goto: unknown floor '${target || ''}' — try: ${Object.keys(GOTO_TARGETS).join(', ')}`);
  },
  jump(args, { print, worlds }) {
    const target = args[0];
    if (!target || !JUMP_TARGETS.includes(target)) {
      print(`jump: unknown world '${target || ''}' — try: ${JUMP_TARGETS.join(', ')}`);
      return;
    }
    const kind = target === 'none' ? null : target;
    if (kind === worlds.current()) { print(`already there.`); return; }
    worlds.teleport(kind);
    print(`stepping through the gate to ${target}…`);
  },
  shell(args, { print, setShellOverride }) {
    const mode = args[0];
    if (!mode || !SHELL_TARGETS.includes(mode)) {
      print(`shell: unknown mode '${mode || ''}' — try: ${SHELL_TARGETS.join(', ')}`);
      return;
    }
    setShellOverride(mode === 'auto' ? null : (mode as 'off' | 'ghost' | 'solid'));
    print(mode === 'auto' ? 'shell: back to automatic.' : `shell: forced ${mode}, even up close.`);
  },
  clear(_args, { clear }) { clear(); },
  exit(_args, { close }) { close(); },
};

export function createTerminal(root: HTMLElement, host: Host) {
  const overlay = document.createElement('div');
  overlay.className = 'term-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="term-card" role="dialog" aria-modal="true" aria-label="Terminal">
      <div class="term-titlebar">
        <span>tower &mdash; zsh</span>
        <button type="button" class="term-close" aria-label="Close terminal">&times;</button>
      </div>
      <div class="term-log"></div>
      <div class="term-inputline">
        <span class="term-prompt">&gt;</span>
        <input class="term-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Terminal command">
      </div>
    </div>
  `;
  const log = overlay.querySelector('.term-log') as HTMLElement;
  const input = overlay.querySelector('.term-input') as HTMLInputElement;

  function print(line: string) {
    const row = document.createElement('div');
    row.className = 'term-line';
    row.textContent = line;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  function clear() { log.innerHTML = ''; }

  let open = false;
  function setOpen(v: boolean) {
    open = v;
    overlay.hidden = !v;
    if (v) {
      requestAnimationFrame(() => overlay.classList.add('term-overlay-visible'));
      if (!log.children.length) {
        print(`${PROFILE.name}'s tower — type "help" to get started.`);
      }
      input.value = '';
      requestAnimationFrame(() => input.focus());
    } else {
      overlay.classList.remove('term-overlay-visible');
    }
  }

  const ctx: Ctx = { print, clear, close: () => setOpen(false), ...host };

  async function run(raw: string) {
    const line = raw.trim();
    if (!line) return;
    print('> ' + line);
    const [cmd, ...args] = line.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    if (!fn) { print(`command not found: ${cmd} — type "help"`); return; }
    await fn(args, ctx);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = input.value; input.value = ''; void run(v); }
  });
  overlay.querySelector('.term-close')!.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

  root.appendChild(overlay);
  return { toggle: () => setOpen(!open), open: () => setOpen(true), close: () => setOpen(false) };
}
