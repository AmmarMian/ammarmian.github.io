import { BASE } from '../router';

type ViewKind = '3d' | 'console' | 'text';

const VIEWS: { kind: ViewKind; href: string; label: string; blurb: string }[] = [
  { kind: '3d', href: '/', label: '3D tower', blurb: 'The full scene — six storeys and the gate' },
  { kind: 'console', href: '/console', label: 'ASCII console', blurb: 'The same tower in text, driven by typing' },
  { kind: 'text', href: '/text', label: 'Text version', blurb: 'One plain page, everything on it' },
];

/** The rail used to carry three separate presentation links strung in
 *  alongside the six floors, which put destinations and mode-switches on
 *  the same footing and made the whole row read as a list of nine equal
 *  things. They collapse to one item here: the floors are where you go,
 *  this is how you look at them. */
export function createViewMenu(current: ViewKind) {
  const wrap = document.createElement('div');
  wrap.className = 'nav-views-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-item nav-util nav-views';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="nav-label">View</span><span class="nav-caret" aria-hidden="true">▾</span>`;

  const menu = document.createElement('div');
  menu.className = 'nav-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Choose a view');
  menu.hidden = true;

  const items: HTMLAnchorElement[] = VIEWS.map((v) => {
    const a = document.createElement('a');
    a.className = 'nav-menu-item';
    a.href = BASE + v.href;
    a.setAttribute('role', 'menuitem');
    a.innerHTML = `<strong>${v.label}</strong><span>${v.blurb}</span>`;
    if (v.kind === current) a.setAttribute('aria-current', 'true');
    menu.appendChild(a);
    return a;
  });

  let open = false;
  function setOpen(v: boolean, focusFirst = false) {
    if (v === open) return;
    open = v;
    menu.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    wrap.classList.toggle('nav-views-open', v);
    if (v && focusFirst) items[0]?.focus();
    if (!v) btn.focus();
  }

  btn.addEventListener('click', () => setOpen(!open));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true, true);
    }
  });

  // Roving arrow keys inside the menu, Escape back to the button — the
  // behaviour a menu is expected to have once it claims role="menu".
  menu.addEventListener('keydown', (e) => {
    const at = items.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
  });

  document.addEventListener('pointerdown', (e) => {
    if (open && !wrap.contains(e.target as Node)) setOpen(false);
  });

  wrap.append(btn, menu);
  return { el: wrap, close: () => setOpen(false) };
}
