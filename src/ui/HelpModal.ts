const ROWS: [string, string][] = [
  ['Look around', 'Drag — one finger on touch'],
  ['Zoom', 'Scroll — pinch on touch'],
  ['Pan', 'Right-click drag — two fingers on touch'],
  ['Visit a floor', 'Click it, or use the floors above / the dots below'],
  ['Whole tower', 'Turns slowly on its own until you take the wheel'],
];

export function createHelpButton(root: HTMLElement) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'help-btn';
  btn.textContent = '?';
  btn.setAttribute('aria-label', 'How to move the camera');
  btn.setAttribute('aria-haspopup', 'dialog');

  const overlay = document.createElement('div');
  overlay.className = 'help-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="help-card" role="dialog" aria-modal="true" aria-label="Camera controls">
      <div class="kicker">Camera</div>
      <h2>Finding your way around</h2>
      <dl class="help-rows"></dl>
      <button type="button" class="back-link help-close">&larr; close</button>
    </div>
  `;
  const rows = overlay.querySelector('.help-rows')!;
  for (const [term, desc] of ROWS) {
    const dt = document.createElement('dt'); dt.textContent = term;
    const dd = document.createElement('dd'); dd.textContent = desc;
    rows.appendChild(dt); rows.appendChild(dd);
  }

  let open = false;
  function setOpen(v: boolean) {
    open = v;
    overlay.hidden = !v;
    if (v) requestAnimationFrame(() => overlay.classList.add('help-overlay-visible'));
    else overlay.classList.remove('help-overlay-visible');
    btn.setAttribute('aria-expanded', String(v));
  }
  btn.addEventListener('click', () => setOpen(!open));
  overlay.querySelector('.help-close')!.addEventListener('click', () => setOpen(false));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) setOpen(false); });

  root.appendChild(btn);
  root.appendChild(overlay);
}
