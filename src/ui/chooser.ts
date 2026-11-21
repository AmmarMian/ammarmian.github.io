import { BASE } from '../router';
import { setPreferredView } from './lighter';

/* ============================ the first question ===========================
 * Asked once, on a phone or a machine the opening guess puts on the lowest
 * tier — the places where the 3D tower might be a strain — and never on a
 * capable desktop. Both answers are first-class: plenty of phones carry the
 * 3D tower happily, and the pixel tower is not a consolation prize. The
 * answer is remembered; the 2D·3D switch at the top of either changes it. */

const ASKED = 'lair-asked';

export function shouldAsk(lowTier: boolean): boolean {
  try { if (localStorage.getItem(ASKED)) return false; } catch { return false; }
  const phone = window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  return phone || lowTier;
}

/** Resolves with the view chosen. */
export function askView(root: HTMLElement): Promise<'3d' | '2d'> {
  return new Promise((done) => {
    const el = document.createElement('main');
    el.className = 'chooser';
    el.innerHTML = `
      <p class="chooser-kicker">a first visit · asked once</p>
      <h1 class="chooser-title">How would you like to see the tower?</h1>
      <p class="chooser-lede">The same rooms and the same content either way. You can switch at any time from the top of the page.</p>
      <div class="chooser-options">
        <button type="button" class="chooser-option" data-v="3d">
          <span class="chooser-name">The 3D tower</span>
          <span class="chooser-blurb">Walk round it, turn it, step through the gate. Richer, and heavier on the battery.</span>
        </button>
        <button type="button" class="chooser-option" data-v="2d">
          <img src="${BASE}/pixel/overview.png" alt="" width="192" height="300">
          <span class="chooser-name">The pixel tower</span>
          <span class="chooser-blurb">Every room hand-drawn in pixels. Light and quick on any phone.</span>
        </button>
      </div>`;
    root.appendChild(el);
    el.querySelectorAll<HTMLButtonElement>('.chooser-option').forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.v as '3d' | '2d';
      try { localStorage.setItem(ASKED, '1'); } catch {}
      setPreferredView(v === '2d' ? '2d' : null);
      el.remove();
      done(v);
    }));
  });
}
