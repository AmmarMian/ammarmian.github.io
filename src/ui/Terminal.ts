import { PROFILE } from '../data/profile';
import { runCommand, type Ctx, type ConsoleHost } from './commands';
import { attachLineEditor } from './lineEditor';

/** The console docks beside the tower rather than covering it: the two are
 *  meant to be used together — `jump forest` is far better watched than
 *  described — and a modal that hides the thing it drives was the wrong
 *  shape for that. Below 900px it takes the whole screen instead, where
 *  there isn't room to share. */
export function createTerminal(root: HTMLElement, host: ConsoleHost) {
  const panel = document.createElement('aside');
  panel.className = 'console';
  panel.hidden = true;
  // No window chrome: the console is a column of text standing in the
  // scene, built from the same parts as the floor callouts — a kicker, a
  // body, and a quiet way out. A titlebar and a boxed input made it read
  // as a separate application pasted on top of the tower.
  panel.innerHTML = `
    <div class="kicker">console</div>
    <div class="console-log" role="log" aria-label="Console output"></div>
    <form class="console-inputline" autocomplete="off">
      <label class="console-prompt" for="console-input" aria-label="Command">&gt;</label>
      <input class="console-input" id="console-input" type="text" autocomplete="off"
             autocapitalize="off" autocorrect="off" spellcheck="false"
             placeholder="help" aria-label="Console command">
    </form>
    <button type="button" class="back-link console-close">&larr; close the console</button>
  `;

  const log = panel.querySelector('.console-log') as HTMLElement;
  const input = panel.querySelector('.console-input') as HTMLInputElement;
  const form = panel.querySelector('.console-inputline') as HTMLFormElement;

  function print(line: string, cls = '') {
    const row = document.createElement('div');
    row.className = 'console-line' + (cls ? ' console-' + cls : '');
    row.textContent = line;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }
  function clear() { log.innerHTML = ''; }

  let open = false;
  const ctx: Ctx = { print, clear, close: () => setOpen(false), mode: 'tower', ...host };

  function setOpen(v: boolean) {
    if (v === open) return;
    open = v;
    panel.hidden = !v;
    // Drives the layout: the tower host, nav rail and callout all give way
    // to the console's column while it's open (see style.css).
    document.body.dataset.console = v ? 'on' : 'off';
    if (v) {
      requestAnimationFrame(() => panel.classList.add('console-visible'));
      if (!log.children.length) {
        print(`${PROFILE.name}'s tower — a console for the scene beside it.`, 'head');
        print('Type "help" for commands, or "hello" to meet the keeper.', 'dim');
        print('Tab completes, ↑/↓ walks history, any command takes --help.', 'dim');
        print('');
      }
      requestAnimationFrame(() => input.focus());
    } else {
      panel.classList.remove('console-visible');
    }
    host.onToggle?.();
  }

  async function run(line: string) {
    print('> ' + line, 'echo');
    try {
      await runCommand(line, ctx);
    } catch (err) {
      print(`error: ${err instanceof Error ? err.message : String(err)}`, 'err');
    }
    print('');
  }

  attachLineEditor({
    input, form, ctx, print,
    storageKey: 'lair-console-history',
    onSubmit: run,
    onClear: clear,
    onClose: () => setOpen(false),
  });

  // Clicking anywhere in the panel that isn't a text selection puts the
  // caret back in the input, the way a real terminal window behaves.
  panel.addEventListener('mouseup', () => {
    if (!window.getSelection()?.toString()) input.focus();
  });
  panel.querySelector('.console-close')!.addEventListener('click', () => setOpen(false));

  root.appendChild(panel);
  return {
    toggle: () => setOpen(!open),
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    print,
  };
}
