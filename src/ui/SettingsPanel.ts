/* ============================== the gear ================================
 * Everything the console's display commands can reach, for visitors who are
 * never going to type `quality low` — the same dials, named in words, with
 * the machine's own answer printed underneath so the choice is informed
 * rather than guessed at.
 *
 * Chromeless, like every other panel here: no card, no drop shadow, no
 * titlebar. It floats in the scene over a soft scrim that only exists so the
 * type stays readable against a bright sky, and it is built out of the same
 * kickers, hairline rules and monospace the rest of the tower uses.
 */

export interface SettingsHost {
  setQuality: (tier: 'low' | 'medium' | 'high' | null) => string;
  qualityState: () => {
    tier: string; blurb: string; pinned: string | null;
    fps: number; ms: number; gpu: string;
  };
  gpu: () => { ok: boolean; software: boolean; masked: boolean; webgl2: boolean };
  setPixelMode: (scale: number | null) => number | null;
  pixelMode: () => number | null;
  setLightMode: (mode: 'auto' | 'day' | 'night') => string;
  lightModeAvailable: () => boolean;
  setAutoRotate: (on: boolean) => boolean;
  autoRotate: () => boolean;
  showFps: (on: boolean) => boolean;
  fpsShown: () => boolean;
}

type Choice<T> = { value: T; label: string; hint?: string };

const DETAIL: Choice<string>[] = [
  { value: 'auto', label: 'Auto', hint: 'watches the frame rate and adjusts' },
  { value: 'high', label: 'High', hint: 'everything, at full resolution' },
  { value: 'medium', label: 'Medium', hint: 'fewer lights, a thinner world' },
  { value: 'low', label: 'Low', hint: 'chunky pixels and half the scenery' },
];

const RESOLUTION: Choice<string>[] = [
  { value: 'auto', label: 'Auto', hint: 'by how close the camera is' },
  { value: '0', label: 'Full', hint: 'no pixel-art downscale — the most expensive' },
  { value: '2', label: 'Fine', hint: 'half resolution' },
  { value: '4', label: 'Coarse', hint: 'quarter resolution' },
  { value: '6', label: 'Chunky', hint: 'cheapest, and the most pixel-art' },
];

const LIGHTING: Choice<string>[] = [
  { value: 'auto', label: 'Auto', hint: 'follows your own clock' },
  { value: 'day', label: 'Day', hint: 'pinned to noon' },
  { value: 'night', label: 'Night', hint: 'pinned to the small hours' },
];

const MOTION: Choice<string>[] = [
  { value: 'on', label: 'Drifting', hint: 'the tower turns slowly on its own' },
  { value: 'off', label: 'Still', hint: 'it only moves when you move it' },
];

const COUNTER: Choice<string>[] = [
  { value: 'off', label: 'Hidden', hint: '' },
  { value: 'on', label: 'Shown', hint: 'frame rate, frame time and the tier in force' },
];

export function createSettingsButton(root: HTMLElement, host: SettingsHost) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gear-btn';
  btn.setAttribute('aria-label', 'Display and performance settings');
  btn.setAttribute('aria-expanded', 'false');
  // Drawn rather than typed: the gear glyph renders as an emoji on some
  // platforms and as a missing box on others, and neither belongs here.
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6v3M12 18.4v3M21.4 12h-3M5.6 12h-3M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1M18.6 18.6l-2.1-2.1M7.5 7.5L5.4 5.4" />
    </svg>`;

  const panel = document.createElement('div');
  panel.className = 'gear-panel';
  /* A popover, not a modal: the scene stays live behind it and the visitor
     can keep orbiting while they try a setting. So no focus trap and no
     scrim — Escape closes it, and so does a click anywhere else. */
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', 'Display and performance settings');
  panel.hidden = true;

  const head = document.createElement('div');
  head.className = 'kicker';
  head.textContent = 'Display';
  panel.appendChild(head);

  /* Each row is a label, a line of small buttons, and one line of prose that
     changes to describe whichever option is currently chosen — so the panel
     explains itself without needing a paragraph per setting sitting there
     permanently. */
  function row<T extends string>(
    title: string,
    choices: Choice<T>[],
    read: () => T,
    write: (v: T) => void,
  ) {
    const wrap = document.createElement('div');
    wrap.className = 'gear-row';

    const lbl = document.createElement('div');
    lbl.className = 'gear-row-label';
    lbl.id = 'gear-' + title.toLowerCase().replace(/\W+/g, '-');
    lbl.textContent = title;

    const opts = document.createElement('div');
    opts.className = 'gear-opts';
    opts.setAttribute('role', 'radiogroup');
    opts.setAttribute('aria-labelledby', lbl.id);

    const hint = document.createElement('div');
    hint.className = 'gear-hint';

    const buttons = choices.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gear-opt';
      b.setAttribute('role', 'radio');
      b.textContent = c.label;
      b.addEventListener('click', () => { write(c.value); refresh(); });
      opts.appendChild(b);
      return b;
    });

    wrap.append(lbl, opts, hint);
    panel.appendChild(wrap);

    return {
      el: wrap,
      sync() {
        const at = read();
        choices.forEach((c, i) => {
          const on = c.value === at;
          buttons[i].setAttribute('aria-checked', String(on));
          buttons[i].classList.toggle('gear-opt-on', on);
        });
        hint.textContent = choices.find((c) => c.value === at)?.hint ?? '';
      },
    };
  }

  /* Read back from the scene rather than remembered here, so `pixel 6` typed
     into the console and the Resolution row below can never disagree. */
  const pixelAt = () => { const v = host.pixelMode(); return v === null ? 'auto' : String(v); };
  let lightAt: 'auto' | 'day' | 'night' = 'auto';

  /* Built in the order they are appended, so this list *is* the panel's
     layout — heaviest lever first, then the two that change how it looks,
     then the instrument you use to judge them. */
  const detail = row('Detail', DETAIL,
    () => (host.qualityState().pinned ?? 'auto'),
    (v) => host.setQuality(v === 'auto' ? null : (v as 'low' | 'medium' | 'high')));
  const resolution = row('Resolution', RESOLUTION,
    pixelAt,
    (v) => host.setPixelMode(v === 'auto' ? null : Number(v)));
  const lighting = row('Lighting', LIGHTING,
    () => lightAt,
    (v) => { lightAt = v as 'auto' | 'day' | 'night'; host.setLightMode(lightAt); });
  const motion = row('Idle motion', MOTION,
    () => (host.autoRotate() ? 'on' : 'off'),
    (v) => host.setAutoRotate(v === 'on'));
  const counter = row('Frame counter', COUNTER,
    () => (host.fpsShown() ? 'on' : 'off'),
    (v) => host.showFps(v === 'on'));

  const rows = [detail, resolution, lighting, motion, counter];

  /* What the machine is actually doing, which is the whole reason the panel
     is worth opening: the tier it settled on, the rate it is holding, and
     whether a real GPU is drawing any of it. A software rasteriser is called
     out plainly — it is the single most useful thing this panel can tell
     someone whose visit is inexplicably slow. */
  const status = document.createElement('div');
  status.className = 'gear-status';
  panel.appendChild(status);

  function refresh() {
    for (const r of rows) r.sync();
    /* The ruined city is in eternal night and deep space has no day at all —
       in those the day/night pin does nothing, and a row of buttons that
       silently ignore you is worse than one that says why. */
    const canLight = host.lightModeAvailable();
    lighting.el.classList.toggle('gear-row-off', !canLight);
    lighting.el.querySelectorAll('button').forEach((b) => { b.disabled = !canLight; });
    if (!canLight) lighting.el.querySelector('.gear-hint')!.textContent = 'this world has only one time of day';
    const q = host.qualityState();
    const g = host.gpu();
    const rate = q.fps ? `${q.fps.toFixed(0)} fps · ` : '';
    const running = q.pinned ? q.tier : `${q.tier}, chosen for you`;
    status.innerHTML = '';
    const line1 = document.createElement('div');
    line1.textContent = `${rate}running at ${running}`;
    const line2 = document.createElement('div');
    line2.className = 'gear-status-gpu';
    line2.textContent = g.ok ? `drawn by ${q.gpu}` : 'no WebGL — nothing is being drawn';
    status.append(line1, line2);
    if (g.software) {
      const warn = document.createElement('div');
      warn.className = 'gear-status-warn';
      warn.textContent = 'No GPU in use — this machine is drawing every frame on the CPU.';
      status.appendChild(warn);
    }
  }

  // Idle motion is turned off by OrbitControls' own 'start' event the moment
  // the visitor takes the wheel, and the tier can move on its own — so an
  // open panel keeps itself honest rather than showing a stale answer.
  let poll = 0;

  let open = false;
  function setOpen(v: boolean) {
    if (v === open) return;
    open = v;
    panel.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    btn.classList.toggle('gear-btn-on', v);
    /* The panel already shows the tier and the frame rate, so the floating
       note announcing an automatic change would be saying it twice, on top
       of the panel. The stylesheet hides it while this is set. */
    if (v) document.body.dataset.gear = 'on'; else delete document.body.dataset.gear;
    if (v) {
      refresh();
      requestAnimationFrame(() => panel.classList.add('gear-panel-in'));
      poll = window.setInterval(refresh, 1000);
    } else {
      panel.classList.remove('gear-panel-in');
      window.clearInterval(poll);
      // Only if focus is still inside the panel we are closing — a visitor
      // who has already clicked out into the scene should keep it there.
      if (panel.contains(document.activeElement)) btn.focus();
    }
  }

  btn.addEventListener('click', () => setOpen(!open));
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (open && !panel.contains(t) && !btn.contains(t)) setOpen(false);
  });
  // An automatic demotion while the panel is open should move the highlight.
  window.addEventListener('lair-quality', () => { if (open) refresh(); });

  root.append(btn, panel);
  return { toggle: () => setOpen(!open), close: () => setOpen(false), refresh };
}
