interface WorldsApi {
  kinds: string[];
  current: () => string | null;
  teleport: (kind: string | null, onSwap?: () => void) => boolean;
}

const LABELS: Record<string, string> = {
  seafloor: 'Sea floor',
  moon: 'The moon',
  forest: 'Deep forest',
  beach: 'Beach',
  city: 'Abandoned city',
  space: 'Deep space',
};

const BLURBS: Record<string, string> = {
  seafloor: 'Caustics, whales, fish schools, kelp',
  moon: 'A ringed gas giant low over the horizon',
  forest: 'Instanced trunks, ferns, light shafts',
  beach: 'Shoaling waves, sun glitter, a surf line',
  city: 'Lit windows, stopped cars, a patrolling eye',
  space: 'Starfield, nebulae, a ringed giant adrift',
};

export function createDestinationModal(root: HTMLElement, worlds: WorldsApi) {
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

  function row(label: string, blurb: string, active: boolean, onClick: () => void) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pub-item dest-item';
    btn.innerHTML = `<strong>${label}</strong><span>${blurb}</span>`;
    if (active) btn.setAttribute('aria-current', 'true');
    btn.addEventListener('click', onClick);
    li.appendChild(btn);
    list.appendChild(li);
  }

  function render() {
    list.innerHTML = '';
    const cur = worlds.current();
    row('Back to the tower', 'No world — the ordinary sky', cur === null, () => {
      worlds.teleport(null);
      setOpen(false);
    });
    for (const kind of worlds.kinds) {
      row(LABELS[kind] ?? kind, BLURBS[kind] ?? '', cur === kind, () => {
        worlds.teleport(kind);
        setOpen(false);
      });
    }
  }

  let open = false;
  function setOpen(v: boolean) {
    open = v;
    if (v) render();
    overlay.hidden = !v;
    if (v) requestAnimationFrame(() => overlay.classList.add('help-overlay-visible'));
    else overlay.classList.remove('help-overlay-visible');
  }
  overlay.querySelector('.dest-close')!.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

  root.appendChild(overlay);
  return { open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open) };
}
