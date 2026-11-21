import { PROFILE, CONTACT } from '../data/profile';
import { routeForSlug, currentSlug, navigate, onRouteChange, BASE, type FloorRoute } from '../router';
import { FloorContent } from './FloorContent';
import { runCommand, JUMP_TARGETS, columnsOf, type Ctx } from './commands';
import { attachLineEditor } from './lineEditor';
import { setRouteMeta } from './meta';
import { announce } from './io';
import './pixel.css';

/* ============================ the pixel tower ============================
 * The same tower and the same content as the 3D view, drawn as pixel art:
 * light enough for any phone, and a view in its own right rather than a
 * fallback. Home is the whole tower; a floor opens by zooming into its room,
 * with the floors above and below still there at the edges, lights out.
 *
 * The art is made by tools/pixel (node export.js → public/pixel): one still
 * per room, its loop as per-frame deltas, and the overview with each floor
 * lit in turn. Everything is drawn at its native size and scaled by a whole
 * number of device pixels, so a pixel is always a clean square.
 *
 * Wide screens: the picture on the left, the text plain on the right.
 * Phones: the picture on top, the text below it in a pixel frame, and the
 * stairs (down, the floor's name, up) along the bottom where the thumb is. */

interface Meta {
  room: { w: number; h: number };
  overview: { w: number; h: number; x0: number; x1: number; cx: number; floors: [number, number][] };
  rooms: { slug: string; floor: number }[];
}
interface Anim { T: number; delay: number; frames: number[][] }
interface Spot { x: number; y: number; w: number; h: number; label: string; run?: () => void }

const ART = `${BASE}/pixel`;
const READING = ['about', 'publications', 'projects', 'now', 'contact', 'elsewhere', 'settings'];

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const im = new Image();
  im.onload = () => ok(im);
  im.onerror = fail;
  im.src = src;
});
const isWide = () => window.matchMedia('(min-width: 900px)').matches;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export async function renderPixelTower(root: HTMLElement) {
  const view = document.createElement('main');
  view.className = 'px-view';
  view.innerHTML = `
    <header class="px-head">
      <a class="px-sig" href="${BASE}/">${esc(PROFILE.name)}</a>
      <button type="button" class="px-tool px-keeper-btn" aria-label="Talk to the keeper (console, /)">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14v9H9l-4 3v-3H3z"/><path d="M6.5 8.5h7"/></svg>
      </button>
      <a class="px-switch" href="${BASE}/?view=3d" aria-label="Switch to the 3D tower"><span class="px-switch-on">2D</span><span>3D</span></a>
    </header>
    <section class="px-stage" aria-label="The tower">
      <div class="px-picture">
        <canvas class="px-canvas" role="img"></canvas>
        <div class="px-spots"></div>
      </div>
    </section>
    <section class="px-text">
      <div class="px-content"></div>
    </section>
    <nav class="px-stairs" aria-label="Stairs">
      <button type="button" class="px-step px-down"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 7.5L10 13l5.5-5.5"/></svg></button>
      <button type="button" class="px-stairs-name"><span class="px-stairs-kicker"></span><span class="px-stairs-label"></span></button>
      <button type="button" class="px-step px-up"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 12.5L10 7l5.5 5.5"/></svg></button>
    </nav>
  `;
  root.appendChild(view);
  const $ = <T extends Element>(sel: string) => view.querySelector(sel) as T;
  const canvas = $<HTMLCanvasElement>('.px-canvas');
  const picture = $<HTMLElement>('.px-picture');
  const stage = $<HTMLElement>('.px-stage');
  const spotsEl = $<HTMLElement>('.px-spots');
  const contentEl = $<HTMLElement>('.px-content');
  const g = canvas.getContext('2d')!;

  /* ------------------------------ the art ------------------------------ */
  const meta: Meta = await (await fetch(`${ART}/meta.json`)).json();
  const RW = meta.room.w, RH = meta.room.h;
  const slugOfFloor = (k: number) => meta.rooms.find((r) => r.floor === k)!.slug;
  const floorOfSlug = (s: string | null) => meta.rooms.find((r) => r.slug === s)?.floor ?? -1;
  const rooms = new Map<number, HTMLImageElement>();
  const overviews = new Map<number, HTMLImageElement>();
  const getRoom = async (k: number) => rooms.get(k) ?? rooms.set(k, await loadImage(`${ART}/${slugOfFloor(k)}.png`)).get(k)!;
  const getOverview = async (k: number) => overviews.get(k) ?? overviews.set(k, await loadImage(`${ART}/overview${k < 0 ? '' : '-' + k}.png`)).get(k)!;
  // everything is small: fetch every room up front so the stairs never wait
  void Promise.all(meta.rooms.map((r) => getRoom(r.floor)));

  /* ----------------------------- the content ---------------------------- */
  const content = new FloorContent({
    worlds: {
      kinds: JUMP_TARGETS.filter((k) => k !== 'none'),
      current: () => null,
      // the gate opens in the 3D tower: go there, already standing in that world
      teleport: (kind) => { window.location.href = `${BASE}/elsewhere?view=3d${kind ? '&world=' + kind : ''}`; return true; },
    },
  }, { view: '2d', onReset: pullThePlug });

  function pullThePlug() {
    if (!window.confirm('Pull the plug? Everything this site remembers in this browser is emptied, and the tower reloads as a stranger would find it.')) return;
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('lair-')) localStorage.removeItem(k);
      sessionStorage.clear();
    } catch {}
    window.location.href = BASE + '/2d';
  }

  /* ------------------------------ drawing ------------------------------ */
  let floor = -1;                       // -1: the whole tower
  let anim: Anim | null = null, animFloor = -2, frameNo = 0, lastTick = 0, raf = 0;
  let roomData: ImageData | null = null, baseData: Uint8ClampedArray | null = null, prevDelta: number[] = [];
  const roomCanvas = document.createElement('canvas');
  roomCanvas.width = RW; roomCanvas.height = RH;
  const rg = roomCanvas.getContext('2d')!;
  let layout = { W: 0, H: 0, ox: 0, oy: 0, scale: 1 };
  let under: ImageData | null = null;           // what lies behind the room, for redrawing its loop
  const backdrop = loadImage(`${ART}/backdrop.png`);
  const shadeCanvas = document.createElement('canvas');
  shadeCanvas.width = RW; shadeCanvas.height = RH;
  const sg = shadeCanvas.getContext('2d')!;

  /* The canvas always covers the whole picture pane: the land runs to every
     edge, at a whole number of device pixels per art pixel. `need` is what
     must be seen whole (the tower, or a room with a strip of the floors
     either side); the rest of the pane is filled with more of the world. */
  function size(needW: number, needH: number, phoneH: number, phoneMax: number) {
    const dpr = window.devicePixelRatio || 1;
    const wide = isWide();
    const boxW = stage.getBoundingClientRect().width;
    // on a phone the picture may not take more than phoneMax of the screen's height: the land fills the sides
    const k = Math.max(1, Math.floor(wide
      ? Math.min((boxW * dpr) / needW, (window.innerHeight * dpr) / needH)
      : Math.min((boxW * dpr) / needW, (phoneMax * window.innerHeight * dpr) / phoneH)));
    const s = k / dpr;
    const boxH = wide ? window.innerHeight : Math.round(phoneH * s);
    const W = Math.ceil(boxW / s), H = Math.ceil(boxH / s);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
    picture.style.width = `${boxW}px`; picture.style.height = `${boxH}px`;
    if (!wide) stage.style.height = `${boxH}px`;
    g.imageSmoothingEnabled = false;
    return { W, H, s };
  }

  async function drawHome() {
    const im = await getOverview(-1);
    const { W, H, s } = size(192, meta.overview.h, meta.overview.h, 0.72);
    const ox = Math.round(W / 2 - meta.overview.cx), oy = H - meta.overview.h;   // the ground stays put; more sky if the pane is tall
    layout = { W, H, ox, oy, scale: s };
    g.fillStyle = 'rgb(25, 26, 54)'; g.fillRect(0, 0, W, H);
    g.drawImage(im, ox, oy);
    canvas.setAttribute('aria-label', 'The whole tower, every floor lit');
    spots(meta.overview.floors.map(([y0, y1], k) => {
      const r = routeForSlug(slugOfFloor(k))!;
      return { x: meta.overview.x0 + ox, y: y0 + oy, w: meta.overview.x1 - meta.overview.x0, h: y1 - y0 + 1, label: `${r.label} — ${r.title}`, run: () => go(r.slug) };
    }), true);
  }

  /** A neighbouring room with its lights out: darken what is drawn, not the air around it. */
  function drawDark(im: HTMLImageElement, x: number, y: number) {
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, RW, RH);
    sg.drawImage(im, 0, 0);
    sg.globalCompositeOperation = 'source-atop';
    sg.fillStyle = 'rgba(12, 8, 18, 0.66)';
    sg.fillRect(0, 0, RW, RH);
    g.drawImage(shadeCanvas, x, y);
  }

  /* A floor: the room as large as the pane allows, the rest of the tower
     stacked above and below it with the lights out, and the same land
     outside, enlarged to the room's scale and lined up on this floor. */
  async function drawRoom(k: number) {
    const wide = isWide();
    const { W, H, s } = size(RW + (wide ? 16 : 8), RH + (wide ? 48 : 0), RH + 28, 0.42);
    const PITCH = RH - 6;                                          // a room's ceiling slab sits on the floor of the one above
    const need: number[] = [k];
    for (let j = k + 1, y = (H - RH) / 2 - PITCH; j <= 6 && y > -RH; j++, y -= PITCH) need.push(j);
    for (let j = k - 1, y = (H - RH) / 2 + PITCH; j >= 0 && y < H; j--, y += PITCH) need.push(j);
    const [bd, ...ims] = await Promise.all([backdrop, ...need.map(getRoom)]);
    if (floor !== k) return;
    const imOf = (j: number) => ims[need.indexOf(j)];
    const rx = Math.round((W - RW) / 2), ry = Math.round((H - RH) / 2);
    layout = { W, H, ox: rx, oy: ry, scale: s };

    // outside: the land, ×3, with this floor of the tower where this room is
    const Z = 3, [fy0, fy1] = meta.overview.floors[k];
    const bx = Math.round(rx + RW / 2 - meta.overview.cx * Z), by = Math.round(ry + RH / 2 - ((fy0 + fy1) / 2) * Z);
    g.fillStyle = 'rgb(25, 26, 54)'; g.fillRect(0, 0, W, H);
    g.drawImage(bd, bx, by, bd.width * Z, bd.height * Z);
    if (by + bd.height * Z < H) { g.fillStyle = 'rgb(42, 29, 22)'; g.fillRect(0, by + bd.height * Z, W, H); }

    // the rest of the tower, lights out
    for (const j of need) if (j !== k) drawDark(imOf(j), rx, ry + (k - j) * PITCH);
    under = g.getImageData(rx, ry, RW, RH);

    // and this room, lit
    rg.clearRect(0, 0, RW, RH);
    rg.drawImage(imOf(k), 0, 0);
    roomData = rg.getImageData(0, 0, RW, RH);
    baseData = new Uint8ClampedArray(roomData.data);
    prevDelta = [];
    g.drawImage(roomCanvas, rx, ry);

    const route = routeForSlug(slugOfFloor(k))!;
    canvas.setAttribute('aria-label', `${route.title}, drawn in pixels`);
    const sp: Spot[] = (SPOTS[route.slug] ?? []).map((p) => ({ ...p, x: p.x + rx, y: p.y + ry }));
    if (k < 6) sp.push({ x: rx, y: 0, w: RW, h: ry, label: `Up the stairs — ${routeForSlug(slugOfFloor(k + 1))!.title}`, run: () => step(1) });
    if (k > 0) sp.push({ x: rx, y: ry + RH, w: RW, h: H - ry - RH, label: `Down the stairs — ${routeForSlug(slugOfFloor(k - 1))!.title}`, run: () => step(-1) });
    spots(sp, false);
    void loadAnim(k);
  }

  async function loadAnim(k: number) {
    if (animFloor === k) return;
    animFloor = k; anim = null;
    try {
      const a: Anim = await (await fetch(`${ART}/${slugOfFloor(k)}.anim.json`)).json();
      if (animFloor === k) { anim = a; frameNo = 0; applyFrame(0); }
    } catch {}
  }

  /** Put one frame of the loop into the room: undo the last delta, lay the next. */
  function applyFrame(t: number) {
    if (!anim || !roomData || !baseData || !under || floor < 0) return;
    const d = roomData.data;
    for (let i = 0; i < prevDelta.length; i += 2) { const p = prevDelta[i] * 4; d[p] = baseData[p]; d[p + 1] = baseData[p + 1]; d[p + 2] = baseData[p + 2]; d[p + 3] = baseData[p + 3]; }
    const delta = anim.frames[t];
    for (let i = 0; i < delta.length; i += 2) { const p = delta[i] * 4, c = delta[i + 1]; d[p] = c >> 16; d[p + 1] = (c >> 8) & 255; d[p + 2] = c & 255; d[p + 3] = 255; }
    prevDelta = delta;
    rg.putImageData(roomData, 0, 0);
    g.putImageData(under, layout.ox, layout.oy);                    // the sky behind an open room, then the room
    g.drawImage(roomCanvas, layout.ox, layout.oy);
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    if (!anim || floor < 0 || document.hidden) return;
    if (now - lastTick < anim.delay) return;
    lastTick = now;
    frameNo = (frameNo + 1) % anim.T;
    applyFrame(frameNo);
  }
  if (!reduceMotion()) raf = requestAnimationFrame(tick);

  /* The things in a room you can touch: real buttons laid over the picture,
     so the keyboard and a screen reader reach them as easily as a finger. */
  function spots(list: Spot[], tower: boolean) {
    spotsEl.innerHTML = '';
    spotsEl.classList.toggle('px-spots-tower', tower);
    const s = layout.scale;
    for (const sp of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'px-spot';
      b.style.left = `${sp.x * s}px`; b.style.top = `${sp.y * s}px`;
      b.style.width = `${sp.w * s}px`; b.style.height = `${sp.h * s}px`;
      b.setAttribute('aria-label', sp.label);
      b.innerHTML = `<span class="px-spot-tip">${esc(sp.label)}</span>`;
      b.addEventListener('click', () => { sp.run ? sp.run() : showContent(sp.label); });
      spotsEl.appendChild(b);
    }
    if (!tower && !reduceMotion()) {                    // a brief glint, once, on arriving
      spotsEl.classList.remove('px-spots-hello');
      void spotsEl.offsetWidth;
      spotsEl.classList.add('px-spots-hello');
    }
  }
  function showContent(label: string) {
    announce(label);
    (isWide() ? contentEl : $<HTMLElement>('.px-text')).scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  /* What can be touched in each room, in the room's own 192×160 pixels. */
  const SPOTS: Record<string, Spot[]> = {
    settings: [
      { x: 58, y: 116, w: 76, h: 26, label: 'The tub — what the tower remembers' },
      { x: 110, y: 114, w: 18, h: 14, label: 'The plug — forget everything', run: pullThePlug },
    ],
    elsewhere: [
      { x: 70, y: 40, w: 52, h: 52, label: 'The gate — other worlds' },
      { x: 30, y: 88, w: 26, h: 22, label: 'The book of destinations' },
    ],
    about: [
      { x: 12, y: 96, w: 56, h: 44, label: 'The bed — who sleeps here' },
      { x: 116, y: 32, w: 31, h: 29, label: 'A painting of the tower' },
      { x: 50, y: 132, w: 20, h: 10, label: 'The cat, asleep' },
    ],
    publications: [
      { x: 37, y: 24, w: 36, h: 62, label: 'The shelves — every paper' },
      { x: 119, y: 24, w: 36, h: 62, label: 'More shelves — search them all' },
      { x: 94, y: 98, w: 20, h: 10, label: 'The open book — how this site was made', run: () => content.openColophon() },
      { x: 12, y: 105, w: 26, h: 30, label: 'The globe — other worlds', run: () => go('elsewhere') },
    ],
    projects: [
      { x: 38, y: 34, w: 46, h: 40, label: 'The jars — one for each project' },
      { x: 84, y: 108, w: 30, h: 22, label: 'The cauldron — what is brewing' },
    ],
    now: [
      { x: 80, y: 34, w: 25, h: 21, label: 'The chalkboard — this month' },
      { x: 116, y: 46, w: 35, h: 72, label: 'The hearth — who is being taught' },
    ],
    contact: [
      { x: 44, y: 92, w: 22, h: 16, label: 'The letter rack — write to me' },
      { x: 112, y: 70, w: 44, h: 50, label: 'The telescope — where to find me' },
    ],
  };

  /* --------------------------- the text column -------------------------- */
  const bodyEl = () => contentEl.querySelector('.px-body') as HTMLElement;
  function renderHomeText() {
    content.unmount();
    contentEl.innerHTML = `
      <div class="px-home ${isWide() ? '' : 'px-frame'}">
        <p class="px-kicker">${esc(PROFILE.affiliation)}</p>
        <h1 class="px-title">${esc(PROFILE.role)}</h1>
        <p>${esc(PROFILE.bio)}</p>
        <nav class="px-sections" aria-label="Sections"></nav>
        <p class="px-hint">${isWide() ? 'Click a floor to go in. ↑ ↓ take the stairs · 1–7 the sections · / the keeper' : 'Tap a floor to go in.'}</p>
      </div>`;
    const nav = contentEl.querySelector('.px-sections')!;
    for (const slug of READING) {
      const r = routeForSlug(slug)!;
      const a = document.createElement('a');
      a.href = `${BASE}/${slug}`;
      a.innerHTML = `<span class="px-sec-label">${esc(r.label)}</span><span class="px-sec-room">${String(r.index).padStart(2, '0')} · ${esc(r.title)}</span>`;
      a.addEventListener('click', (e) => { e.preventDefault(); go(slug); });
      nav.appendChild(a);
    }
  }
  function renderRoomText(route: FloorRoute) {
    contentEl.innerHTML = `
      <article class="px-room ${isWide() ? '' : 'px-frame'}">
        <a class="back-link px-back" href="${BASE}/">&larr; the whole tower</a>
        <p class="px-kicker">${String(route.index).padStart(2, '0')} · ${esc(route.title)}</p>
        <h1 class="px-title">${esc(route.label)}</h1>
        <div class="px-body"></div>
      </article>`;
    contentEl.querySelector('.px-back')!.addEventListener('click', (e) => { e.preventDefault(); go(null); });
    content.mount(route.slug, bodyEl());
  }

  /* ------------------------------ moving about --------------------------- */
  const go = (slug: string | null) => navigate(slug);
  function step(delta: number) {
    if (floor < 0) { go(slugOfFloor(delta > 0 ? 0 : 6)); return; }
    const k = floor + delta;
    if (k >= 0 && k <= 6) go(slugOfFloor(k));
  }

  /** The zoom: the overview grows toward the floor, then the room fades in. */
  async function zoomInto(k: number) {
    if (reduceMotion() || floor !== -1) return;
    const [y0, y1] = meta.overview.floors[k];
    const oy = ((layout.oy + (y0 + y1) / 2) / layout.H) * 100;
    await canvas.animate(
      [{ transform: 'scale(1)', transformOrigin: `50% ${oy}%` }, { transform: 'scale(2.6)', transformOrigin: `50% ${oy}%`, opacity: 0.2 }],
      { duration: 240, easing: 'cubic-bezier(.5,0,.8,.4)' },
    ).finished.catch(() => {});
  }

  const stairsName = $<HTMLButtonElement>('.px-stairs-name');
  async function sync() {
    const slug = currentSlug();
    const route = routeForSlug(slug === '2d' || slug === 'console' ? null : slug);
    const k = route ? floorOfSlug(route.slug) : -1;
    setRouteMeta(route, route ? route.slug : '2d');
    if (k >= 0 && floor === -1) await zoomInto(k);
    const was = floor;
    floor = k;
    view.classList.toggle('px-in-room', k >= 0);
    if (k >= 0) { await drawRoom(k); if (was !== k) renderRoomText(route!); }
    else { animFloor = -2; anim = null; await drawHome(); renderHomeText(); }
    if (was !== k && !reduceMotion()) canvas.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 180 });
    // the stairs bar
    $<HTMLElement>('.px-stairs-kicker').textContent = route ? `${String(route.index).padStart(2, '0')} · ${route.title}` : '7 floors · tap one';
    $<HTMLElement>('.px-stairs-label').textContent = route ? route.label : 'The whole tower';
    $<HTMLButtonElement>('.px-down').disabled = k === 0;
    $<HTMLButtonElement>('.px-up').disabled = k === 6;
    $<HTMLButtonElement>('.px-down').setAttribute('aria-label', k > 0 ? `Down the stairs to the ${routeForSlug(slugOfFloor(k - 1))!.title}` : k === 0 ? 'Bottom of the tower' : 'Start at the bottom');
    $<HTMLButtonElement>('.px-up').setAttribute('aria-label', k >= 0 && k < 6 ? `Up the stairs to the ${routeForSlug(slugOfFloor(k + 1))!.title}` : k === 6 ? 'Top of the tower' : 'Start at the top');
    if (was !== k) announce(route ? `${route.label} — ${route.title}` : 'The whole tower');
  }
  $<HTMLButtonElement>('.px-down').addEventListener('click', () => step(-1));
  $<HTMLButtonElement>('.px-up').addEventListener('click', () => step(1));
  stairsName.addEventListener('click', () => go(null));
  $<HTMLAnchorElement>('.px-sig').addEventListener('click', (e) => { e.preventDefault(); go(null); });
  // switching to 3D keeps the floor you are on
  $<HTMLAnchorElement>('.px-switch').addEventListener('click', (e) => {
    e.preventDefault();
    const route = routeForSlug(currentSlug());
    window.location.href = `${BASE}/${route ? route.slug : ''}?view=3d${window.location.hash}`;
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { if (floor >= 0) void drawRoom(floor); else void drawHome(); }, 120);
  });

  /* ------------------------------ the keeper ----------------------------- */
  const keeper = mountKeeper(view, () => floor);
  $<HTMLButtonElement>('.px-keeper-btn').addEventListener('click', () => keeper.toggle());

  /* ------------------------------ keyboard ------------------------------- */
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
    else if (e.key === 'h' || e.key === 'H' || e.key === 'Home') { e.preventDefault(); go(null); }
    else if (e.key === '/') { e.preventDefault(); keeper.open(); }
    else if (/^[1-7]$/.test(e.key)) { e.preventDefault(); go(READING[Number(e.key) - 1]); }
  });

  onRouteChange(() => void sync());
  await sync();
  void raf;
}

/* =============================== the keeper ===============================
 * The console, as the keeper's dialogue box: his portrait, what he has said,
 * a few things to ask, and a line to type on. The same command table as the
 * 3D console — `goto`, `pubs`, `ask`, all of it — minus what needs a camera. */
function mountKeeper(view: HTMLElement, currentFloor: () => number) {
  const box = document.createElement('div');
  box.className = 'px-keeper';
  box.hidden = true;
  box.innerHTML = `
    <section class="px-keeper-box px-frame" role="dialog" aria-label="The keeper">
      <div class="px-keeper-top">
        <img class="px-keeper-face" src="${ART}/keeper.png" alt="" width="24" height="24">
        <div>
          <p class="px-keeper-name">The keeper</p>
          <p class="px-keeper-say">Ask me about the work, or type a command — <kbd>help</kbd> lists them.</p>
        </div>
        <button type="button" class="px-keeper-close" aria-label="Close the console">&times;</button>
      </div>
      <div class="px-keeper-log" role="log" aria-label="Console output"></div>
      <div class="px-keeper-chips" role="group" aria-label="Things to ask"></div>
      <form class="px-keeper-line" autocomplete="off">
        <label for="px-keeper-input">&gt;</label>
        <input id="px-keeper-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="ask or type a command">
      </form>
    </section>`;
  view.appendChild(box);
  const log = box.querySelector('.px-keeper-log') as HTMLElement;
  const input = box.querySelector('input') as HTMLInputElement;
  const form = box.querySelector('form') as HTMLFormElement;

  function print(line: string, cls = '') {
    const row = document.createElement('div');
    row.className = 'px-line' + (cls ? ' px-line-' + cls : '');
    row.textContent = line;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }
  const ctx: Ctx = {
    print,
    clear: () => { log.innerHTML = ''; },
    close: () => setOpen(false),
    isCompact: () => true,
    columns: () => columnsOf(log),
    mode: '2d',
    scene: null,
    worlds: { kinds: JUMP_TARGETS.filter((k) => k !== 'none'), current: () => null, teleport: () => false, reflections: () => false, reflectionsOn: () => false },
    setShellOverride: () => {},
  };
  async function submit(line: string) {
    print('> ' + line, 'echo');
    try { await runCommand(line, ctx); } catch (err) { print(`error: ${err instanceof Error ? err.message : String(err)}`, 'err'); }
    input.focus();
  }
  attachLineEditor({ input, form, ctx, print, storageKey: 'lair-console-history', onSubmit: submit, onClear: ctx.clear });
  const chips = box.querySelector('.px-keeper-chips')!;
  for (const [label, cmd] of [['hello', 'hello'], ['what now?', 'now'], ['papers', 'pubs'], ['students', 'students'], ['help', 'help']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-chip';
    b.textContent = label;
    b.addEventListener('click', () => void submit(cmd));
    chips.appendChild(b);
  }
  function setOpen(open: boolean) {
    box.hidden = !open;
    view.classList.toggle('px-keeper-open', open);
    if (open) {
      if (!log.childElementCount) print(currentFloor() >= 0 ? 'The keeper looks up from his book.' : `Welcome to the tower. Write to me at ${CONTACT.email}, or ask here.`, 'dim');
      input.focus();
    }
  }
  box.querySelector('.px-keeper-close')!.addEventListener('click', () => setOpen(false));
  box.addEventListener('click', (e) => { if (e.target === box) setOpen(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) setOpen(false); });
  return { open: () => setOpen(true), toggle: () => setOpen(box.hidden) };
}

