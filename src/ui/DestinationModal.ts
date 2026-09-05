import { createFocusTrap } from './dialog';
import { WORLD_LABELS as LABELS, WORLD_BLURBS as BLURBS } from '../data/worlds';

interface WorldsApi {
  kinds: string[];
  current: () => string | null;
  teleport: (kind: string | null, onSwap?: () => void) => boolean;
}

/** Shows a destination in the sanctum's portal ring while it is being
 *  considered. Optional, so the ASCII console can pass nothing. */
type Preview = (kind: string | null) => void;


export function createDestinationModal(root: HTMLElement, worlds: WorldsApi, preview?: Preview) {
  const overlay = document.createElement('div');
  overlay.className = 'help-overlay dest-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="help-card dest-card" role="dialog" aria-modal="true" aria-label="Choose a destination">
      <div class="kicker">The gate</div>
      <h2>Choose a destination</h2>
      <ul class="dest-list"></ul>
      <button type="button" class="back-link dest-close">&larr; close the gate</button>
    </div>
  `;
  const list = overlay.querySelector('.dest-list') as HTMLUListElement;

  function row(label: string, blurb: string, active: boolean, onClick: () => void, kind: string | null) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pub-item dest-item';
    btn.innerHTML = `<strong>${label}</strong><span>${blurb}</span>`;
    if (active) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', onClick);
    /* Considering a destination shows it in the gate. Keyboard included:
       focus is how the list is read without a mouse, and the preview is most
       of the point of the list. */
    const show = () => preview?.(kind);
    const hide = () => preview?.(null);
    btn.addEventListener('pointerenter', show);
    btn.addEventListener('focus', show);
    btn.addEventListener('pointerleave', hide);
    btn.addEventListener('blur', hide);
    li.appendChild(btn);
    list.appendChild(li);
  }

  function render() {
    list.innerHTML = '';
    const cur = worlds.current();
    row('Back to the tower', 'No world — the ordinary sky', cur === null, () => {
      worlds.teleport(null);
      setOpen(false);
    }, null);
    for (const kind of worlds.kinds) {
      row(LABELS[kind] ?? kind, BLURBS[kind] ?? '', cur === kind, () => {
        worlds.teleport(kind);
        setOpen(false);
      }, kind);
    }
  }

  const trap = createFocusTrap(overlay, {
    initial: () => overlay.querySelector('[aria-current="true"]') ?? overlay.querySelector('.dest-item'),
  });

  let open = false;
  function setOpen(v: boolean) {
    if (v === open) return;
    open = v;
    if (v) render();
    overlay.hidden = !v;
    if (v) {
      requestAnimationFrame(() => overlay.classList.add('help-overlay-visible'));
      trap.activate();
    } else {
      overlay.classList.remove('help-overlay-visible');
      trap.release();
      preview?.(null);
    }
  }
  overlay.querySelector('.dest-close')!.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

  root.appendChild(overlay);
  return { open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open) };
}
