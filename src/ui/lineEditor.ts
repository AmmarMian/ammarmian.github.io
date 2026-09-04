import { complete, type Ctx } from './commands';

const HISTORY_MAX = 60;

/** Shell-style line editing — persistent history on ↑/↓, Tab completion,
 *  Ctrl-L to clear — shared by the docked console and the ASCII view so
 *  the two behave identically. */
export function attachLineEditor(opts: {
  input: HTMLInputElement;
  form: HTMLFormElement;
  ctx: Ctx;
  storageKey: string;
  onSubmit: (line: string) => void | Promise<void>;
  onClear: () => void;
  onClose?: () => void;
  print: (line: string, cls?: string) => void;
}) {
  const { input, form, ctx, storageKey, onSubmit, onClear, onClose, print } = opts;

  let history: string[] = [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) history = (JSON.parse(raw) as string[]).slice(0, HISTORY_MAX);
  } catch {}

  // -1 means "at the live line". Walking up moves into history; the
  // half-typed line is stashed so walking back down returns it intact.
  let histIdx = -1;
  let draft = '';

  function remember(line: string) {
    if (history[0] === line) return;
    history.unshift(line);
    history = history.slice(0, HISTORY_MAX);
    try { localStorage.setItem(storageKey, JSON.stringify(history)); } catch {}
  }

  function walk(delta: number) {
    if (!history.length) return;
    if (histIdx === -1 && delta > 0) draft = input.value;
    histIdx = Math.min(history.length - 1, Math.max(-1, histIdx + delta));
    input.value = histIdx === -1 ? draft : history[histIdx];
    requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const line = input.value.trim();
    input.value = '';
    if (!line) return;
    remember(line);
    histIdx = -1;
    draft = '';
    void onSubmit(line);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); walk(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); walk(-1); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const { candidates, completed } = complete(input.value, ctx);
      if (!candidates.length) return;
      // A second Tab on an already-maximal prefix lists the options, the
      // way bash does, rather than doing nothing and looking broken.
      if (candidates.length > 1 && completed === input.value) {
        print('> ' + input.value, 'echo');
        print('  ' + candidates.join('   '), 'dim');
      }
      input.value = completed;
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); onClear(); }
    else if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); }
  });

  return { history: () => history.slice() };
}
