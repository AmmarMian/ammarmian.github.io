/* ============================ how hard to try ============================
 * The tower is a lot of scene: seven storeys of hand-placed props, a world
 * hanging behind them, three point clouds and a shortlist of interior lights
 * that every lit fragment on screen pays for. On a desktop with a real GPU
 * that is fine. On a five-year-old phone, an integrated laptop chip, or a
 * browser that has quietly fallen back to a software rasteriser, it is not.
 *
 * So the scene has three settings of effort, and it picks one for you:
 *
 *   high    — everything, full resolution, ten lights burning
 *   medium  — coarser pixels, fewer lights, thinner scatter
 *   low     — chunky pixels, a handful of lights, half the world's objects
 *
 * The first guess comes from what the machine admits to (below). After that
 * the frame clock has the final say: a tier that cannot hold a playable
 * frame rate is dropped, and a tier that is coasting is raised — but only
 * back up to a tier that has not already failed, so the two rules cannot
 * argue with each other forever.
 *
 * Everything here is advisory. `quality high` in the console pins a tier and
 * switches the automatic side off; nothing overrides a visitor who has said
 * what they want.
 */

export type Tier = 'low' | 'medium' | 'high';
export const TIERS: Tier[] = ['low', 'medium', 'high'];

export interface Profile {
  tier: Tier;
  label: string;
  blurb: string;
  /** Ceiling on devicePixelRatio when the pixel-art downscale is off. */
  maxPixelRatio: number;
  /** MSAA. Chosen at context creation and fixed for the page's life. */
  antialias: boolean;
  /** How many interior lights may burn at once — see ambience.ts. */
  lights: number;
  /** Fraction of the motes, bubbles and wisps that actually draw. */
  particles: number;
  /** Fraction of a world's scattered instances — grass, trees, rubble, cars. */
  detail: number;
  /** The two automatic pixel-art scales: close up, and from across the room. */
  pixelNear: number;
  pixelFar: number;
}

export const PROFILES: Record<Tier, Profile> = {
  high: {
    tier: 'high', label: 'high', blurb: 'everything, at full resolution',
    maxPixelRatio: 2, antialias: true,
    lights: 10, particles: 1, detail: 1,
    pixelNear: 4, pixelFar: 2,
  },
  medium: {
    tier: 'medium', label: 'medium', blurb: 'fewer lights, coarser pixels, a thinner world',
    maxPixelRatio: 1.5, antialias: true,
    lights: 6, particles: 0.6, detail: 0.7,
    pixelNear: 5, pixelFar: 3,
  },
  low: {
    tier: 'low', label: 'low', blurb: 'chunky pixels, a handful of lights, half the scenery',
    maxPixelRatio: 1, antialias: false,
    lights: 4, particles: 0.3, detail: 0.45,
    pixelNear: 6, pixelFar: 4,
  },
};

/* ------------------------------ the machine ------------------------------
 * WEBGL_debug_renderer_info is the only honest answer a browser gives about
 * what is actually drawing. Safari and Firefox may withhold it (privacy
 * budget), so every field here is optional and nothing depends on it — it
 * sharpens the first guess and it answers "is the GPU being used at all",
 * which is a real question: a machine with no working driver does not fail,
 * it silently renders through SwiftShader or llvmpipe on the CPU at a tenth
 * of the speed, and nothing on screen says so.
 */
export interface GpuInfo {
  /** false only if WebGL could not be created at all. */
  ok: boolean;
  webgl2: boolean;
  vendor: string;
  renderer: string;
  /** true when the renderer string names a known CPU rasteriser. */
  software: boolean;
  /** true when the browser refused to name the adapter. */
  masked: boolean;
  maxTextureSize: number;
  /** What the context actually granted, which need not be what we asked for. */
  antialias: boolean;
  cores: number;
  /** GB, where the browser will say. */
  memory: number;
}

/* SwiftShader is Chrome's fallback, llvmpipe/softpipe is Mesa's, and
   "Microsoft Basic Render Driver" is Windows' when no driver is installed.
   ANGLE wraps the real adapter's name, so the test is on the whole string. */
const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software|basic render|generic renderer|apple paravirtual/i;

let _gpu: GpuInfo | null = null;

/** Probed once, on a throwaway context that is dropped immediately after —
 *  the renderer's own context does not exist yet when the first guess is
 *  needed, and browsers cap how many live contexts a page may hold. */
export function gpuInfo(): GpuInfo {
  if (_gpu) return _gpu;
  const cores = navigator.hardwareConcurrency || 0;
  const memory = (navigator as any).deviceMemory || 0;
  const cvs = document.createElement('canvas');
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let webgl2 = false;
  try {
    gl = cvs.getContext('webgl2') as WebGL2RenderingContext | null;
    webgl2 = !!gl;
    if (!gl) gl = cvs.getContext('webgl') as WebGLRenderingContext | null;
  } catch { gl = null; }
  if (!gl) {
    _gpu = { ok: false, webgl2: false, vendor: '', renderer: '', software: false,
             masked: true, maxTextureSize: 0, antialias: false, cores, memory };
    return _gpu;
  }
  let vendor = '', renderer = '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '');
    renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
  }
  _gpu = {
    ok: true, webgl2, vendor, renderer,
    software: SOFTWARE_RE.test(renderer),
    masked: !renderer,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0,
    antialias: !!gl.getContextAttributes()?.antialias,
    cores, memory,
  };
  // Hand the context straight back; we only came for the nameplate.
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return _gpu;
}

/** One line for the console, and the honest answer to "is the GPU in use". */
export function gpuSummary(): string {
  const g = gpuInfo();
  if (!g.ok) return 'no WebGL context — nothing is being drawn';
  if (g.software) return `${g.renderer} — software rasteriser, the CPU is drawing this`;
  if (g.masked) return `${webglName(g)}, adapter withheld by the browser`;
  return `${g.renderer}${g.vendor ? ` (${g.vendor})` : ''}`;
}

const webglName = (g: GpuInfo) => (g.webgl2 ? 'WebGL 2' : 'WebGL 1');

/** The opening bid, before a single frame has been timed. */
export function guessTier(): Tier {
  const g = gpuInfo();
  if (!g.ok || g.software) return 'low';
  const coarse = matchMedia('(pointer: coarse)').matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (coarse && innerWidth <= 820);
  let score = 0;
  if (!mobile) score += 2;
  if (g.webgl2) score += 1;
  if (g.cores >= 8) score += 1; else if (g.cores && g.cores <= 4) score -= 1;
  if (g.memory >= 8) score += 1; else if (g.memory && g.memory <= 4) score -= 1;
  if (g.maxTextureSize >= 16384) score += 1;
  // Integrated parts and phone GPUs are named plainly enough to spot.
  if (/intel|uhd graphics|hd graphics|mali|adreno|powervr|videocore/i.test(g.renderer)) score -= 1;
  if (/nvidia|geforce|radeon|rtx|apple m[1-9]/i.test(g.renderer)) score += 1;
  if (score >= 4) return 'high';
  if (score >= 1) return 'medium';
  return 'low';
}

/* ------------------------------ the governor -----------------------------
 * Frame times arrive one at a time and are useless one at a time — a garbage
 * collection, a texture upload or the visitor dragging a window across the
 * screen all produce a hitch that means nothing. So they are averaged over
 * one-second windows, and only a run of bad windows moves anything.
 *
 * The ratchet: a tier that has once failed is never climbed back to. Without
 * it a machine sitting exactly on the boundary oscillates between two tiers
 * forever, which is far more noticeable than simply being one tier low.
 */
const STORE_KEY = 'lair-quality';
const WINDOW_MS = 1000;
const SETTLE_MS = 2500;    // after a change, let the new tier bed in
const BAD_MS = 22;         // ~45 fps — below this it reads as a struggle
const GOOD_MS = 13;        // ~77 fps — above this there is room to spare
const BAD_RUN = 3;         // consecutive bad windows before dropping
const GOOD_RUN = 10;       // consecutive good ones before climbing

export interface Quality {
  tier: () => Tier;
  profile: () => Profile;
  /** null when the tier is being chosen automatically. */
  pinned: () => Tier | null;
  /** Pin a tier, or pass null to hand the choice back to the frame clock. */
  set: (tier: Tier | null) => Tier;
  /** Every frame, in milliseconds. */
  sample: (ms: number) => void;
  /** Ignore the next `ms` of frames. The opening is not representative of
   *  anything — shaders are still compiling, geometry is still uploading and
   *  the whole tower is animating itself out of the ground. */
  settle: (ms: number) => void;
  /** Called on every change with the new profile and why it changed. */
  onChange: (fn: (p: Profile, reason: 'initial' | 'pinned' | 'demoted' | 'promoted') => void) => void;
  /** Rolling frame time and rate, for `perf`. */
  stats: () => { ms: number; fps: number };
}

export function createQuality(): Quality {
  let stored: string | null = null;
  try { stored = localStorage.getItem(STORE_KEY); } catch {}
  let pin: Tier | null = stored && (TIERS as string[]).includes(stored) ? stored as Tier : null;

  let tier: Tier = pin ?? guessTier();
  /* Tiers that have already proved too slow. The initial guess is trusted,
     not blamed: if it guessed low we are allowed to try medium once. */
  const failed = new Set<Tier>();
  const listeners: ((p: Profile, reason: 'initial' | 'pinned' | 'demoted' | 'promoted') => void)[] = [];

  let winStart = performance.now(), winFrames = 0, winMs = 0;
  let badRun = 0, goodRun = 0, settleUntil = performance.now() + SETTLE_MS;
  let avgMs = 0, avgFps = 0;

  function emit(reason: 'initial' | 'pinned' | 'demoted' | 'promoted') {
    badRun = goodRun = 0;
    settleUntil = performance.now() + SETTLE_MS;
    for (const fn of listeners) fn(PROFILES[tier], reason);
  }

  function step(dir: -1 | 1, reason: 'demoted' | 'promoted') {
    const at = TIERS.indexOf(tier);
    const next = TIERS[at + dir];
    if (!next) return false;
    if (dir === 1 && failed.has(next)) return false;
    if (dir === -1) failed.add(tier);
    tier = next;
    emit(reason);
    return true;
  }

  function sample(ms: number) {
    winFrames++; winMs += ms;
    const now = performance.now();
    if (now - winStart < WINDOW_MS) return;
    avgMs = winMs / Math.max(1, winFrames);
    avgFps = (winFrames * 1000) / (now - winStart);
    winStart = now; winFrames = 0; winMs = 0;
    if (pin || now < settleUntil) return;
    /* A backgrounded or throttled tab reports enormous frame times that say
       nothing about the GPU. rAF is paused while hidden, but the frame
       either side of a visibility change still straddles the gap. */
    if (avgMs > 200) return;
    if (avgMs > BAD_MS) { badRun++; goodRun = 0; }
    else if (avgMs < GOOD_MS) { goodRun++; badRun = 0; }
    else { badRun = goodRun = 0; }
    if (badRun >= BAD_RUN) step(-1, 'demoted');
    else if (goodRun >= GOOD_RUN) step(1, 'promoted');
  }

  function set(next: Tier | null) {
    pin = next;
    try {
      if (next) localStorage.setItem(STORE_KEY, next);
      else localStorage.removeItem(STORE_KEY);
    } catch {}
    if (next) { tier = next; failed.clear(); emit('pinned'); }
    else { tier = guessTier(); failed.clear(); emit('pinned'); }
    return tier;
  }

  return {
    tier: () => tier,
    profile: () => PROFILES[tier],
    pinned: () => pin,
    set,
    sample,
    settle(ms: number) {
      settleUntil = Math.max(settleUntil, performance.now() + ms);
      winStart = performance.now(); winFrames = 0; winMs = 0;
      badRun = goodRun = 0;
    },
    onChange: (fn) => { listeners.push(fn); },
    stats: () => ({ ms: avgMs, fps: avgFps }),
  };
}
