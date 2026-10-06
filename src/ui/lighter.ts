/* ========================= the lighter way in ===========================
 * The same content exists three ways — the tower, the ASCII console and one
 * plain page — and until now the two cheap ones were only *offered* at the
 * very end of the scale: after the quality governor had dropped to its lowest
 * tier and then watched three more bad seconds go by. That is the right
 * moment to insist, and far too late to ask. A machine with no GPU driver, or
 * one the opening guess already puts on the bottom tier, has told us what it
 * is before a frame is drawn.
 *
 * So the offer is made at the first honest signal, whichever arrives first:
 *
 *   no WebGL at all   — the tower cannot be drawn; go straight to the text
 *   software renderer — the CPU is drawing this, and it will not get better
 *   the opening guess — this machine was put on the lowest tier on sight
 *   the first demotion to the bottom tier
 *   `lair-struggling` — the bottom tier still cannot hold a rate
 *
 * Once, per visit, and never as a modal: the tower stays live behind it and
 * staying is a first-class answer.
 *
 * And it is remembered. Someone who took the plain page because the tower was
 * unusable should not have to find it again on their next visit — the choice
 * sticks to the browser, and the plain page's own link home carries
 * `?view=3d`, which un-sticks it. That link is the only escape and it is at
 * the top of the page, so the preference can never trap anyone.
 */
import { BASE } from '../router';
import { announce } from './io';

export type LightView = 'text' | 'console';

const PREF_KEY = 'lair-view';
const OFFERED_KEY = 'lair-offered';

/** The view this browser asked to land on, if it ever asked. */
export function preferredView(): LightView | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'text' || v === 'console' ? v : null;
  } catch { return null; }
}

export function setPreferredView(v: LightView | null) {
  try {
    if (v) localStorage.setItem(PREF_KEY, v);
    else localStorage.removeItem(PREF_KEY);
  } catch {}
}

/** `?view=3d` is the plain page's way of saying "no, give me the tower" —
 *  it clears the preference and then takes itself out of the address bar,
 *  so the URL that gets shared or bookmarked is the ordinary one. */
export function honourViewOverride(): boolean {
  const p = new URLSearchParams(window.location.search);
  if (p.get('view') !== '3d') return false;
  setPreferredView(null);
  markOffered();   // they have just answered the question; don't ask again
  p.delete('view');
  const q = p.toString();
  history.replaceState(history.state, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
  return true;
}

function offered() {
  try { return sessionStorage.getItem(OFFERED_KEY) === '1'; } catch { return false; }
}
function markOffered() {
  try { sessionStorage.setItem(OFFERED_KEY, '1'); } catch {}
}

/** One floating note, at most once a visit. `body` is the reason in the
 *  tower's own voice; everything else is the same three answers. */
export function offerLighter(body: string, spoken = body) {
  if (offered()) return;
  markOffered();

  /* The welcome note sits in the same place and says "drag to look around",
     which is not the thing to be reading next to an offer to stop looking.
     Whichever of the two arrives second wins the corner. */
  document.querySelector('.welcome-note')?.remove();

  const offer = document.createElement('div');
  offer.className = 'perf-offer';
  offer.setAttribute('role', 'status');
  offer.innerHTML = `
    <div class="kicker">a lighter way</div>
    <p>${body}</p>
    <div class="perf-offer-actions">
      <button type="button" class="mode-btn mode-btn-primary" data-go="text">Plain text</button>
      <button type="button" class="mode-btn" data-go="console">Text console</button>
      <button type="button" class="mode-btn perf-offer-stay" data-go="stay">Stay here</button>
    </div>
    <p class="perf-offer-fine">Either one becomes your default here; the link home on that page brings the tower back.</p>
  `;
  document.body.appendChild(offer);
  requestAnimationFrame(() => offer.classList.add('perf-offer-in'));

  const dismiss = () => {
    offer.classList.remove('perf-offer-in');
    setTimeout(() => offer.remove(), 400);
  };
  offer.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const go = btn.dataset.go;
      if (go === 'stay') { dismiss(); return; }
      setPreferredView(go as LightView);
      window.location.href = BASE + '/' + go;
    });
  });
  announce(spoken);
}

/** Shown at the top of the plain page when it is where this browser lands by
 *  default — otherwise nobody would know why the tower stopped appearing. */
export function mountPreferenceNote(root: HTMLElement) {
  if (!preferredView()) return;
  const note = document.createElement('p');
  note.className = 'view-pref-note';
  note.innerHTML = `You chose the plain version on this device, so it is what loads here. `
    + `<a href="${BASE}/?view=3d">Go back to the 3D tower</a> to undo that.`;
  root.prepend(note);
}
