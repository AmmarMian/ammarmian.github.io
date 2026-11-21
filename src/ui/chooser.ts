import { BASE } from '../router';
import { PROFILE } from '../data/profile';
import { setPreferredView } from './lighter';
import './chooser.css';

/* ============================ the first question ===========================
 * Asked at the start of every visit: three ways to see the same site, each
 * shown by its own pixel picture, on the site's own paper. The one that
 * suits this device is marked, not chosen for you. The answer holds for the
 * visit (the browser session); ticking "always open this way" makes it the
 * default and the question is not asked again. A link that already says
 * which view (/2d, /text, ?view=…) answers it for that visit. */

export type View = '3d' | '2d' | 'text';
const DEFAULT = 'lair-view-default';   // localStorage: a default was set, never ask
const CHOSEN = 'lair-view-chosen';     // sessionStorage: answered for this visit

export function shouldAsk(): boolean {
  try { return !localStorage.getItem(DEFAULT) && !sessionStorage.getItem(CHOSEN); } catch { return false; }
}
export function markAsked() {
  try { sessionStorage.setItem(CHOSEN, '1'); } catch {}
}

const OPTIONS: { v: View; name: string; blurb: string; img: string; alt: string }[] = [
  { v: '3d', name: 'The 3D tower', blurb: 'Walk round it, turn it, step through the gate. The richest, and the heaviest — best with a real graphics card.', img: 'choose-3d.png', alt: 'A round stone tower with a ring turning round it' },
  { v: '2d', name: 'The pixel tower', blurb: 'Every room hand-drawn in pixels, worlds and all. Light and quick on any phone.', img: 'choose-2d.png', alt: 'The top floors of the tower, drawn in pixels' },
  { v: 'text', name: 'The plain page', blurb: 'Everything on one page of text. For reading, printing, screen readers and slow connections.', img: 'choose-text.png', alt: 'An open book by a candle' },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Resolves with the view chosen (the plain page is navigated to directly). */
export function askView(root: HTMLElement, suggest: View): Promise<'3d' | '2d'> {
  return new Promise((done) => {
    const el = document.createElement('main');
    el.className = 'chooser';
    el.innerHTML = `
      <section class="ch-panel" aria-labelledby="ch-title">
        <p class="ch-sig">${esc(PROFILE.name)}</p>
        <p class="ch-kicker">welcome · three ways in</p>
        <h1 class="ch-title" id="ch-title">How would you like to see the tower?</h1>
        <p class="ch-lede">The same rooms and the same words, three ways. You can switch at any time from the view menu at the top.</p>
        <div class="ch-options">
          ${OPTIONS.map((o) => `
            <button type="button" class="ch-option${o.v === suggest ? ' is-suggested' : ''}" data-v="${o.v}">
              <img src="${BASE}/pixel/${o.img}" alt="${esc(o.alt)}" width="96" height="120">
              <span class="ch-text">
                <span class="ch-name">${esc(o.name)}</span>
                ${o.v === suggest ? '<span class="ch-tag">suits this device</span>' : ''}
                <span class="ch-blurb">${esc(o.blurb)}</span>
              </span>
            </button>`).join('')}
        </div>
        <label class="ch-default">
          <input type="checkbox">
          <span class="ch-box" aria-hidden="true"></span>
          <span>Always open this way, and don't ask me again</span>
        </label>
      </section>`;
    root.appendChild(el);

    el.querySelector<HTMLButtonElement>(`.ch-option[data-v="${suggest}"]`)?.focus({ preventScroll: true });
    el.querySelectorAll<HTMLButtonElement>('.ch-option').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.v as View;
      markAsked();
      setPreferredView(v === '3d' ? null : v);
      if (el.querySelector<HTMLInputElement>('.ch-default input')!.checked) { try { localStorage.setItem(DEFAULT, v); } catch {} }
      // the plain page's way back leads here, to choose again
      if (v === 'text') { window.location.href = `${BASE}/text?from=choose&back=${encodeURIComponent(`${BASE}/?choose`)}`; return; }
      el.remove();
      done(v);
    }));
  });
}
