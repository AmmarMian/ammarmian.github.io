/* ============================== the readout ==============================
 * A frame counter earns its place here for one reason: the quality tiers are
 * invisible unless you can see what they bought. Turn the detail down and the
 * scene coarsens — but whether that actually moved the frame rate, and by how
 * much, is not something you can tell by looking at it. So the meter shows
 * the rate, the frame time, and which tier is currently in force, together.
 *
 * Deliberately not a graph. A number that updates four times a second is
 * readable while you are dragging the camera around, which is exactly when
 * you want it; a sixty-sample sparkline is not.
 */

export interface FpsSource {
  qualityState: () => { tier: string; pinned: string | null; fps: number; ms: number };
}

const STORE_KEY = 'lair-fps';

export function createFpsMeter(root: HTMLElement, source: FpsSource) {
  const el = document.createElement('div');
  el.className = 'fps-meter';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'off');   // it changes constantly; announcing it would be torture
  el.hidden = true;

  const rate = document.createElement('span');
  rate.className = 'fps-rate';
  const ms = document.createElement('span');
  ms.className = 'fps-ms';
  const tier = document.createElement('span');
  tier.className = 'fps-tier';
  el.append(rate, ms, tier);
  root.appendChild(el);

  let timer = 0;
  function paint() {
    const q = source.qualityState();
    rate.textContent = q.fps ? `${q.fps.toFixed(0)} fps` : '— fps';
    ms.textContent = q.ms ? `${q.ms.toFixed(1)} ms` : '';
    tier.textContent = q.pinned ? q.tier : `${q.tier} · auto`;
    /* Green above 50, amber through the forties, red below thirty — the
       thresholds the tier governor itself works to, so the colour and the
       automatic behaviour tell the same story. */
    el.dataset.band = !q.fps ? 'idle' : q.fps >= 50 ? 'good' : q.fps >= 30 ? 'fair' : 'poor';
  }

  let on = false;
  function set(v: boolean) {
    if (v === on) return on;
    on = v;
    el.hidden = !v;
    window.clearInterval(timer);
    if (v) { paint(); timer = window.setInterval(paint, 250); }
    try {
      if (v) localStorage.setItem(STORE_KEY, '1'); else localStorage.removeItem(STORE_KEY);
    } catch {}
    return on;
  }

  try { if (localStorage.getItem(STORE_KEY) === '1') set(true); } catch {}

  return { set, on: () => on, toggle: () => set(!on) };
}
