import { PROFILE, CONTACT } from '../data/profile';
import { routeForSlug, currentSlug, navigate, onRouteChange, worldFromUrl, setWorldInUrl, textPageHref, BASE, type FloorRoute } from '../router';
import { FloorContent } from './FloorContent';
import { fetchHalPublications, type HalDoc } from '../data/hal';
import { runCommand, JUMP_TARGETS, columnsOf, type Ctx } from './commands';
import { attachLineEditor } from './lineEditor';
import { WORLD_LABELS } from '../data/worlds';
import { VIEWS } from './ViewMenu';
import { effectiveTheme, themePref, setAutoTheme, cycleTheme, THEME_ICON, THEME_LABEL } from './theme';
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
 * lit in turn, the tower alone, and the land it stands in: home, or one of
 * the worlds beyond the sanctum's gate. Everything is drawn at its native size and scaled by a whole
 * number of device pixels, so a pixel is always a clean square.
 *
 * Wide screens: the picture on the left, the text plain on the right.
 * Phones: the picture on top, the text below it in a pixel frame, and the
 * stairs (down, the floor's name, up) along the bottom where the thumb is. */

type RGB = [number, number, number];
interface World { top: RGB; bottom: RGB; rain?: boolean; eye?: boolean }
interface Loop { T: number; delay: number; tile: number; cols: number; frames: number[][] }
interface Meta {
  room: { w: number; h: number };
  overview: { w: number; h: number; x0: number; x1: number; cx: number; floors: [number, number][]; tower: [number, number]; ext: number };
  worlds: Record<string, World>;
  days: Record<string, World>;
  eye: { size: number; T: number };
  portholes: { size: number; order: string[] };
  rooms: { slug: string; floor: number }[];
  books: [number, number, number, number][];
  open: number;
}
interface Anim { T: number; delay: number; frames: number[][] }
interface Spot { x: number; y: number; w: number; h: number; label: string; run?: () => void; tag?: string }

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
      <button type="button" class="px-tool px-theme-btn"></button>
      <button type="button" class="px-tool px-keeper-btn" aria-label="Talk to the keeper (console, /)">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14v9H9l-4 3v-3H3z"/><path d="M6.5 8.5h7"/></svg>
      </button>
      <div class="px-views">
        <button type="button" class="px-views-btn" aria-haspopup="true" aria-expanded="false" aria-label="Choose a view (now: the pixel tower)">2D<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 8l4.5 4.5L14.5 8"/></svg></button>
        <div class="px-views-menu px-frame" role="menu" aria-label="Choose a view" hidden>
          ${VIEWS.map((v) => `<a class="px-views-item" role="menuitem" data-kind="${v.kind}" href="${BASE}${v.href}"${v.kind === '2d' ? ' aria-current="true"' : ''}><strong>${esc(v.label)}</strong><span>${esc(v.blurb)}</span></a>`).join('')}
        </div>
      </div>
    </header>
    <section class="px-stage" aria-label="The tower">
      <div class="px-picture">
        <canvas class="px-world" aria-hidden="true"></canvas>
        <canvas class="px-canvas" role="img"></canvas>
        <p class="px-sky-title" hidden>${esc(PROFILE.role)}<span>${esc(PROFILE.affiliation)}</span></p>
        <div class="px-books"></div>
        <div class="px-spots"></div>
      </div>
      <div class="px-gates" role="group" aria-label="The gate: other worlds"></div>
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
  const booksEl = $<HTMLElement>('.px-books');
  const skyTitle = $<HTMLElement>('.px-sky-title');
  const contentEl = $<HTMLElement>('.px-content');
  const gatesEl = $<HTMLElement>('.px-gates');
  const g = canvas.getContext('2d')!;
  // the world lives on its own layer behind the tower, so it can move without redrawing the rooms
  const worldCanvas = $<HTMLCanvasElement>('.px-world');
  const wg = worldCanvas.getContext('2d')!;

  /* ------------------------------ the art ------------------------------ */
  const meta: Meta = await (await fetch(`${ART}/meta.json`)).json();
  const RW = meta.room.w, RH = meta.room.h;
  const slugOfFloor = (k: number) => meta.rooms.find((r) => r.floor === k)!.slug;
  const floorOfSlug = (s: string | null) => meta.rooms.find((r) => r.slug === s)?.floor ?? -1;
  const rooms = new Map<number, HTMLImageElement>();
  const getRoom = async (k: number) => rooms.get(k) ?? rooms.set(k, await loadImage(`${ART}/${slugOfFloor(k)}.png`)).get(k)!;
  // everything is small: fetch every room up front so the stairs never wait
  void Promise.all(meta.rooms.map((r) => getRoom(r.floor)));

  /* The world the tower stands in: home, or one beyond the gate. It lives in
     the URL (?world=space) like the 3D tower's, so a view is a link, and the
     two views agree when you switch. */
  const WORLD_KINDS = JUMP_TARGETS.filter((k) => k !== 'none' && meta.worlds[k]);
  const validWorld = (w: string | null) => (w && WORLD_KINDS.includes(w) ? w : null);
  let world = validWorld(worldFromUrl());

  /* Day or night follows the site's theme: Paper is day, Night is night.
     Left on "auto", the 2D view takes it from the clock (day from 7 to 19).
     Only the worlds whose light changes have a day picture; the moon,
     space, the sea floor and the forest are the same at any hour. */
  const byClock = () => { const h = new Date().getHours(); setAutoTheme(h >= 7 && h < 19 ? 'paper' : 'night'); };
  if (themePref() === 'auto') byClock();
  let day = effectiveTheme() === 'paper';
  /* the switch in the header: Auto (by the clock) → Day → Night, as in the 3D tower */
  const themeBtn = $<HTMLButtonElement>('.px-theme-btn');
  const showTheme = () => {
    const p = themePref();
    themeBtn.innerHTML = THEME_ICON[p];
    themeBtn.setAttribute('aria-label', `Day or night: ${THEME_LABEL[p]}${p === 'auto' ? (day ? ' — day now' : ' — night now') : ''}. Change`);
    themeBtn.title = THEME_LABEL[p];
  };
  themeBtn.addEventListener('click', () => { if (cycleTheme() === 'auto') byClock(); showTheme(); });
  showTheme();
  const byDay = () => day && !!meta.days[world ?? 'home'];
  const worldInfo = () => (byDay() ? meta.days : meta.worlds)[world ?? 'home'];
  /** The file name of the world's picture, by day or night. */
  const worldFile = (w: string | null, d: boolean) => `backdrop${w ? '-' + w : ''}${d ? '-day' : ''}`;
  const css = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const backdrops = new Map<string, Promise<HTMLImageElement>>();
  const getBackdrop = (w: string | null, d = byDay()) => {
    const name = worldFile(w, d);
    if (!backdrops.has(name)) backdrops.set(name, loadImage(`${ART}/${name}.png`));
    return backdrops.get(name)!;
  };
  const towerImage = loadImage(`${ART}/tower.png`);
  // the observatory with its night cut out: away from home, the sky over it is the world's own
  const openObservatory = loadImage(`${ART}/contact-open.png`);

  /* ------------------------------ the world ------------------------------
     The land is drawn on its own layer behind the tower, at its native size
     into a small canvas, then enlarged onto the layer. Its loop (made by
     tools/pixel, frame 0 being the still) lays a few 8×8 tiles over the
     still each frame; the rain world's rain is drawn falling here, live. */
  const loops = new Map<string, Promise<{ loop: Loop; atlas: HTMLImageElement } | null>>();
  const getLoop = (w: string | null, d = byDay()) => {
    const key = worldFile(w, d), name = key;
    if (!loops.has(key)) loops.set(key, Promise.all([fetch(`${ART}/${name}.loop.json`).then((r) => r.json() as Promise<Loop>), loadImage(`${ART}/${name}.tiles.png`)])
      .then(([loop, atlas]) => ({ loop, atlas })).catch(() => null));
    return loops.get(key)!;
  };
  const land = document.createElement('canvas');
  const lg = land.getContext('2d')!;
  const sky = {
    img: null as HTMLImageElement | null, loop: null as { loop: Loop; atlas: HTMLImageElement } | null,
    x: 0, y: 0, z: 1, frame: 0, last: 0, lastFrame: 0, rain: false, eye: false, hold: false,
  };
  const hash = (i: number, k: number) => {
    let h = Math.imul(i, 374761393) + Math.imul(k, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  /** Rain, slanting a pixel across for every three down, falling at its own speed per drop. */
  function drawRain(now: number) {
    const ground = meta.overview.floors[1][1] + 3 + meta.overview.ext, span = land.width + 40;
    const ink = byDay() ? '84, 98, 116' : '154, 170, 196';         // pale streaks at night, darker against a day sky
    for (let i = 0; i < 700; i++) {
      const speed = 220 + hash(i, 3) * 120, len = 3 + Math.floor(hash(i, 4) * 3);
      const y = Math.floor((hash(i, 2) * ground + (now / 1000) * speed) % ground);
      const x = Math.floor(((hash(i, 1) * span + y / 3) % span)) - 20;
      lg.fillStyle = `rgba(${ink}, 0.3)`;
      lg.fillRect(x, y, 1, len - 1);
      lg.fillStyle = `rgba(${ink}, 0.5)`;
      lg.fillRect(x + Math.floor((y + len - 1) / 3) - Math.floor(y / 3), y + len - 1, 1, 1);
    }
  }
  /* The city's watcher flies a slow loop round the tower, forty seconds a
     turn: the far half of it higher up, as a circle seen from a little
     above. It always looks at the tower. Behind the tower it simply passes
     behind; the world is the layer at the back. */
  let eyeSheet: HTMLImageElement | null = null, eyeAsked = false;
  function drawEye(now: number) {
    if (!eyeSheet) {
      if (!eyeAsked) { eyeAsked = true; void loadImage(`${ART}/eye.png`).then((im) => { eyeSheet = im; paintWorld(reduceMotion() ? 0 : performance.now()); }).catch(() => {}); }
      return;
    }
    const S = meta.eye.size, a = reduceMotion() ? 0.35 : (now / 40000) * Math.PI * 2;
    const x = meta.overview.cx + 112 * Math.cos(a), y = 62 + 20 * Math.sin(a) + meta.overview.ext;
    const row = x > meta.overview.cx ? 0 : 1;                       // to the right of the tower it looks left, and the other way
    lg.drawImage(eyeSheet, (sky.frame % meta.eye.T) * S, row * S, S, S, Math.round(x - S / 2), Math.round(y - S / 2), S, S);
  }

  /** Paint the world layer: the still, this frame's tiles, the rain, enlarged into place. */
  function paintWorld(now = 0) {
    const im = sky.img;
    if (!im) return;
    if (land.width !== im.width || land.height !== im.height) { land.width = im.width; land.height = im.height; }
    lg.drawImage(im, 0, 0);
    const L = sky.loop;
    if (L && sky.frame > 0) {
      const S = L.loop.tile, tw = im.width / S, f = L.loop.frames[sky.frame] ?? [];
      for (let i = 0; i < f.length; i += 2) {
        const ti = f[i], ai = f[i + 1];
        lg.drawImage(L.atlas, (ai % L.loop.cols) * S, Math.floor(ai / L.loop.cols) * S, S, S, (ti % tw) * S, Math.floor(ti / tw) * S, S, S);
      }
    }
    if (sky.rain) drawRain(now);
    if (sky.eye) drawEye(now);
    const wi = worldInfo(), Wd = worldCanvas.width, Hd = worldCanvas.height;
    wg.fillStyle = css(wi.top); wg.fillRect(0, 0, Wd, Hd);
    wg.drawImage(land, sky.x, sky.y, land.width * sky.z, land.height * sky.z);
    const end = sky.y + land.height * sky.z;
    if (end < Hd) { wg.fillStyle = css(wi.bottom); wg.fillRect(0, end, Wd, Hd - end); }
  }
  /** Set the world layer up for a view: which picture, where, how large. */
  async function placeWorld(x: number, y: number, z: number) {
    const [im, loop] = await Promise.all([getBackdrop(world), getLoop(world)]);
    Object.assign(sky, { img: im, loop, x, y, z, rain: !!worldInfo().rain, eye: !!worldInfo().eye });
    if (sky.frame >= (loop?.loop.T ?? 1)) sky.frame = 0;
    paintWorld(reduceMotion() ? 0 : performance.now());           // still rain stays still
  }

  /* ----------------------------- the content ---------------------------- */
  const content = new FloorContent({
    worlds: {
      kinds: JUMP_TARGETS.filter((k) => k !== 'none'),
      current: () => world,
      teleport: (kind) => { void teleport(kind); return true; },
    },
    hoverDoc: (id) => shelf.hover(id, 'list'),
    selectDoc: (id) => shelf.select(id),
    showDocs: (ids) => shelf.show(ids),
  }, { view: '2d', onReset: pullThePlug });

  /* ------------------------------ the shelves ----------------------------
     Every publication is a book on the library's back shelves, as in the 3D
     tower: spread evenly over the spines, newest on the top shelf. Point at
     a book and its record lights in the list; point at a record and its book
     lights; open one and its book comes a little way off the shelf. */
  const shelf = (() => {
    let docs: HalDoc[] = [];
    const slot = new Map<string, number>();
    let hovered: string | null = null, selected: string | null = null, shown: Set<string> | null = null;
    void fetchHalPublications().then((d) => {
      docs = d;
      d.forEach((doc, i) => slot.set(doc.id, Math.floor((i * meta.books.length) / d.length)));
      if (floor === 3) place();
    }).catch(() => {});
    const btnOf = (id: string | null) => (id ? booksEl.querySelector<HTMLElement>(`[data-doc="${CSS.escape(id)}"]`) : null);
    const listItem = (id: string | null) => (id ? contentEl.querySelector<HTMLElement>(`.pub-item[data-doc="${CSS.escape(id)}"]`) : null);
    function paint() {
      for (const b of booksEl.querySelectorAll<HTMLElement>('.px-book')) {
        const id = b.dataset.doc!;
        b.classList.toggle('is-hover', id === hovered);
        b.classList.toggle('is-open', id === selected);
        b.classList.toggle('is-dim', !!shown && !shown.has(id));
      }
    }
    function place() {
      booksEl.innerHTML = '';
      if (floor !== 3 || !docs.length) return;
      const sc = layout.scale;
      for (const doc of docs) {
        const [x, y, w, h] = meta.books[slot.get(doc.id)!];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-book';
        b.dataset.doc = doc.id;
        b.style.left = `${(x + layout.ox) * sc}px`; b.style.top = `${(y + layout.oy) * sc}px`;
        b.style.width = `${w * sc}px`; b.style.height = `${h * sc}px`;
        b.setAttribute('aria-label', `${doc.title}${doc.year ? ', ' + doc.year : ''}`);
        b.innerHTML = `<span class="px-spot-tip">${esc(doc.title.length > 70 ? doc.title.slice(0, 68) + '…' : doc.title)}</span>`;
        b.addEventListener('mouseenter', () => hover(doc.id, 'book'));
        b.addEventListener('mouseleave', () => hover(null, 'book'));
        b.addEventListener('focus', () => hover(doc.id, 'book'));
        b.addEventListener('blur', () => hover(null, 'book'));
        b.addEventListener('click', () => void content.openDoc(doc.id));
        booksEl.appendChild(b);
      }
      paint();
    }
    function hover(id: string | null, from: 'book' | 'list') {
      if (from === 'book') {
        listItem(hovered)?.classList.remove('is-lit');
        listItem(id)?.classList.add('is-lit');
      }
      hovered = id;
      paint();
    }
    function select(id: string | null) {
      selected = id;
      paint();
      btnOf(id)?.scrollIntoView?.({ block: 'nearest' });
    }
    function show(ids: string[] | null) { shown = ids ? new Set(ids) : null; paint(); }
    return { place, hover, select, show };
  })();

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
  const shadeCanvas = document.createElement('canvas');
  shadeCanvas.width = RW; shadeCanvas.height = RH;
  const sg = shadeCanvas.getContext('2d')!;

  /* The canvas always covers the whole picture pane: the land runs to every
     edge, at a whole number of device pixels per art pixel. `need` is what
     must be seen whole (the tower, or a room with a strip of the floors
     either side); the rest of the pane is filled with more of the world. */
  function size(needW: number, needH: number, phone: { h: number; max?: number; box?: number }) {
    const dpr = window.devicePixelRatio || 1;
    const wide = isWide();
    const boxW = stage.getBoundingClientRect().width;
    // a phone: either a fixed box (the home: the screen between header and stairs), or at most
    // `max` of the screen's height; the land fills whatever is left at the sides
    const availH = wide ? window.innerHeight : phone.box ?? (phone.max ?? 1) * window.innerHeight;
    const k = Math.max(1, Math.floor(Math.min((boxW * dpr) / needW, (availH * dpr) / (wide ? needH : phone.h))));
    const s = k / dpr;
    const boxH = wide ? window.innerHeight : phone.box ?? Math.round(phone.h * s);
    const W = Math.ceil(boxW / s), H = Math.ceil(boxH / s);
    canvas.width = W; canvas.height = H;
    canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
    worldCanvas.width = W; worldCanvas.height = H;
    worldCanvas.style.width = canvas.style.width; worldCanvas.style.height = canvas.style.height;
    wg.imageSmoothingEnabled = false;
    picture.style.width = `${boxW}px`; picture.style.height = `${boxH}px`;
    stage.style.height = wide ? '' : `${boxH}px`;               // the phone's fixed box must not outlive the phone layout
    g.imageSmoothingEnabled = false;
    return { W, H, s };
  }

  async function drawHome() {
    const [bd, tw] = await Promise.all([getBackdrop(world), towerImage]);
    if (floor !== -1) return;
    const wide = isWide();
    // a phone: the tower is the whole page, between the header and the stairs, its floors labelled beside it
    const headH = $<HTMLElement>('.px-head').getBoundingClientRect().height;
    const { W, H, s } = size(wide ? 192 : 150, meta.overview.h, { h: meta.overview.h, box: Math.round(window.innerHeight - headH - 64) });
    // the ground stays put (more sky if the pane is tall); on a phone the tower steps left to leave its labels room
    const ox = Math.round(W / 2 - meta.overview.cx - (wide ? 0 : 46 / s)), oy = H - meta.overview.h;
    layout = { W, H, ox, oy, scale: s };
    void bd;
    await placeWorld(ox, oy - meta.overview.ext, 1);              // the world goes on above the frame
    g.clearRect(0, 0, W, H);
    g.drawImage(tw, ox + meta.overview.tower[0], oy + meta.overview.tower[1]);
    booksEl.innerHTML = '';
    canvas.setAttribute('aria-label', 'The whole tower, every floor lit');
    spots(meta.overview.floors.map(([y0, y1], k) => {
      const r = routeForSlug(slugOfFloor(k))!;
      return { x: meta.overview.x0 + ox, y: y0 + oy, w: meta.overview.x1 - meta.overview.x0, h: y1 - y0 + 1, label: `${r.label} — ${r.title}`, run: () => go(r.slug),
        tag: wide ? undefined : `<span class="px-floor-tag"><span>${String(k).padStart(2, '0')}</span>${esc(r.label)}</span>` };
    }), true);
    skyTitle.hidden = wide;
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
    const { W, H, s } = size(RW + (wide ? 16 : 8), RH + (wide ? 48 : 0), { h: RH + 28, max: 0.42 });
    skyTitle.hidden = true;
    const PITCH = RH - 6;                                          // a room's ceiling slab sits on the floor of the one above
    const need: number[] = [k];
    for (let j = k + 1, y = (H - RH) / 2 - PITCH; j <= 6 && y > -RH; j++, y -= PITCH) need.push(j);
    for (let j = k - 1, y = (H - RH) / 2 + PITCH; j >= 0 && y < H; j--, y += PITCH) need.push(j);
    const [bd, obsOpen, ...ims] = await Promise.all([getBackdrop(world), openObservatory, ...need.map(getRoom)]);
    if (floor !== k) return;
    const imOf = (j: number) => (j === 6 && (world || byDay()) ? obsOpen : ims[need.indexOf(j)]);   // open to whatever sky is over it
    const rx = Math.round((W - RW) / 2), ry = Math.round((H - RH) / 2);
    layout = { W, H, ox: rx, oy: ry, scale: s };

    // outside: the land, ×3, with this floor of the tower where this room is
    const Z = 3, [fy0, fy1] = meta.overview.floors[k];
    const bx = Math.round(rx + RW / 2 - meta.overview.cx * Z), by = Math.round(ry + RH / 2 - ((fy0 + fy1) / 2) * Z);
    void bd;
    await placeWorld(bx, by - meta.overview.ext * Z, Z);         // the backdrop starts this far above the overview's frame
    if (floor !== k) return;
    g.clearRect(0, 0, W, H);

    // at home, above the observatory its night goes on, with stars, right across
    // (away from home the room is open and the world's own sky shows through)
    if (need.includes(6) && !world && !byDay()) {
      const top = ry + (k - 6) * PITCH;
      const NIGHT = [[18, 20, 46], [24, 27, 60], [32, 34, 74], [42, 42, 88], [56, 50, 100]];
      const dim = k === 6 ? 1 : 0.34;                              // a neighbour's sky has its lights out too
      for (let y = Math.min(top + meta.open, H) - 1; y >= 0; y--) {
        const band = y < top ? 0 : Math.min(4, Math.floor(Math.pow((y - top) / 104, 1.4) * 5));
        g.fillStyle = `rgb(${NIGHT[band].map((c) => Math.round(c * (0.55 + 0.45 * dim)))})`;
        if (y < top) g.fillRect(0, y, W, 1); else { g.fillRect(0, y, rx, 1); g.fillRect(rx + RW, y, W - rx - RW, 1); }
      }
      g.fillStyle = `rgba(226, 226, 246, ${0.35 + 0.6 * dim})`;
      for (let i = 0; i < 90; i++) {
        const x = Math.floor((Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W);
        const y = Math.floor((Math.sin(i * 78.233) * 12543.123 % 1 + 1) % 1 * (top + meta.open * 0.7));
        if ((y < top || x < rx || x >= rx + RW) && y >= 0) g.fillRect(x, y, 1, 1);
      }
    }

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
    shelf.place();
    collapse.set(ry, s);
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
    for (let i = 0; i < delta.length; i += 2) {
      const p = delta[i] * 4, c = delta[i + 1];
      if (baseData[p + 3] === 0) continue;                          // the observatory's twinkling stars, when its night is cut out
      d[p] = c >> 16; d[p + 1] = (c >> 8) & 255; d[p + 2] = c & 255; d[p + 3] = 255;
    }
    prevDelta = delta;
    rg.putImageData(roomData, 0, 0);
    g.putImageData(under, layout.ox, layout.oy);                    // the sky behind an open room, then the room
    g.drawImage(roomCanvas, layout.ox, layout.oy);
  }

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    // the world: its loop at its own pace; the rain needs a quicker beat to fall
    if (!sky.hold && sky.img && (sky.loop || sky.rain || sky.eye)) {
      const step = sky.loop?.loop.delay ?? 120;
      const next = !!sky.loop && now - sky.lastFrame >= step;
      if (next) { sky.frame = (sky.frame + 1) % sky.loop!.loop.T; sky.lastFrame = now; }
      if (next || ((sky.rain || sky.eye) && now - sky.last >= 50)) { sky.last = now; paintWorld(now); }
    }
    if (!anim || floor < 0) return;
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
      b.innerHTML = `<span class="px-spot-tip">${esc(sp.label)}</span>${sp.tag ?? ''}`;
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

  /* The gate: the tower stays where it is and the world around it changes,
     the new one showing through the old in a fine ordered dither, cell by
     cell, as if the picture were being re-drawn — the way a pixel world
     would teleport. Only the land changes; the rooms are the same rooms. */
  let teleporting: Promise<void> = Promise.resolve();
  function teleport(kind: string | null) {
    teleporting = teleporting.then(() => jump(validWorld(kind)));
    return teleporting;
  }
  async function jump(kind: string | null) {
    if (kind === world) return;
    const fire = (phase: string) => window.dispatchEvent(new CustomEvent('lair-teleport', { detail: { kind, phase } }));
    fire('out');
    await getBackdrop(kind).catch(() => null);
    const motion = !reduceMotion();
    const w0 = canvas.width, h0 = canvas.height;
    // the picture as seen: the world layer with the tower over it
    const seen = () => {
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
      const x = c.getContext('2d')!; x.drawImage(worldCanvas, 0, 0); x.drawImage(canvas, 0, 0);
      return x.getImageData(0, 0, c.width, c.height);
    };
    const before = seen();
    // out: the light gathers round the tower until it is all you see
    if (motion) await play(520, (u) => light.draw(ease(u), ease(u), true, u));
    world = kind;
    setWorldInUrl(kind);
    fire('in');
    if (floor >= 0) await drawRoom(floor); else await drawHome();
    // in: under the light's peak the new world shows through, cell by cell, and the light lets go
    if (motion && canvas.width === w0 && canvas.height === h0) {
      // the new picture is laid, opaque, on the tower's layer while the world layer holds still beneath
      const tower = g.getImageData(0, 0, w0, h0), after = seen(), out = g.createImageData(w0, h0);
      sky.hold = true;
      const a = after.data, bf = before.data, o = out.data;
      const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];       // 4×4 ordered: an even pattern, not noise
      let lim = -1;
      await play(760, (u) => {
        const l = Math.min(17, Math.floor((u / 0.55) * 17));
        if (l !== lim) {
          lim = l;
          for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
            const i = (y * w0 + x) * 4, src = BAYER[((y & 3) << 2) | (x & 3)] < l ? a : bf;
            o[i] = src[i]; o[i + 1] = src[i + 1]; o[i + 2] = src[i + 2]; o[i + 3] = 255;
          }
          g.putImageData(lim >= 17 ? after : out, 0, 0);
        }
        light.draw(1 - ease(u), 1 - ease(u), false, u);
      });
      g.putImageData(tower, 0, 0);                                  // the tower alone again, the world moving behind it
      sky.hold = false;
    }
    light.clear();
    gates.render();
    announce(kind ? `The tower stands in another world: ${WORLD_LABELS[kind] ?? kind}` : 'The tower is home again');
    fire('done');
  }
  const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const play = (dur: number, fn: (u: number) => void) => new Promise<void>((done) => {
    const t0 = performance.now();
    const f = (now: number) => { const u = Math.min(1, (now - t0) / dur); fn(u); if (u < 1) requestAnimationFrame(f); else done(); };
    requestAnimationFrame(f);
  });

  /* The gate's light, as the 3D tower has it: a column of warm light round
     the tower with rays in it, a disc and a ring of light on the ground that
     spreads as the light gathers, sparks rising, and a flash at the peak.
     Drawn at the art's own pixel size on a layer over the picture, in a few
     flat strengths rather than smooth gradients. */
  const light = (() => {
    const fx = document.createElement('canvas');
    fx.className = 'px-fx';
    fx.setAttribute('aria-hidden', 'true');
    canvas.after(fx);
    const c = fx.getContext('2d')!;
    const lvl = (v: number) => Math.round(v * 4) / 4;                           // a few flat steps, never a smooth ramp
    function where() {
      if (floor < 0) {
        const [, groundY] = meta.overview.floors[1];
        return { x0: layout.ox + meta.overview.x0, x1: layout.ox + meta.overview.x1, ground: layout.oy + groundY + 3 };
      }
      return { x0: layout.ox + 6, x1: layout.ox + RW - 6, ground: layout.oy + RH - 13 };
    }
    function size() {
      if (fx.width !== canvas.width || fx.height !== canvas.height) { fx.width = canvas.width; fx.height = canvas.height; }
      fx.style.width = canvas.style.width; fx.style.height = canvas.style.height;
    }
    function ring(cx: number, cy: number, rx: number, col: string) {
      c.fillStyle = col;
      const n = Math.ceil(rx * 7);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; c.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * rx * 0.2), 1, 1); }
    }
    function draw(I: number, k: number, out: boolean, u: number) {
      size();
      c.clearRect(0, 0, fx.width, fx.height);
      const { x0, x1, ground } = where(), w = x1 - x0, cx = (x0 + x1) / 2;
      const glow = out ? Math.sin(u * Math.PI * 0.5) : I;
      // the column, wider at the foot, in three flat strengths
      for (let y = 0; y < ground; y++) {
        const spread = 2 + ((y / ground) * 0.16 + 0.04) * w;
        const a0 = x0 - spread, a1 = x1 + spread;
        c.fillStyle = `rgba(255, 233, 184, ${lvl(0.22 * glow) || 0})`;
        c.fillRect(Math.round(a0), y, Math.round(a1 - a0), 1);
        c.fillStyle = `rgba(255, 244, 214, ${lvl(0.36 * glow)})`;
        c.fillRect(Math.round(x0 + w * 0.12), y, Math.round(w * 0.76), 1);
      }
      // rays: thin streaks of brighter light running up the column
      c.fillStyle = `rgba(255, 250, 230, ${lvl(0.5 * glow)})`;
      for (let i = 0; i < 14; i++) {
        const x = Math.round(x0 - 4 + ((i * 0.618 * 97) % 1) * (w + 8)), len = ground * (0.3 + ((i * 0.37) % 1) * 0.6);
        const y = ((i * 53 + u * ground * 0.8) % ground);
        c.fillRect(x, Math.round(Math.max(0, ground - y - len)), 1, Math.round(Math.min(len, ground - y)));
      }
      // the disc of light underfoot, and the ring spreading out from it
      c.fillStyle = `rgba(255, 251, 232, ${lvl(0.6 * glow)})`;
      for (let dy = -2; dy <= 2; dy++) { const half = (w / 2 + 6) * (1 + k * 0.4) * Math.sqrt(1 - (dy / 2.6) ** 2); c.fillRect(Math.round(cx - half), ground + dy, Math.round(half * 2), 1); }
      ring(cx, ground, (w / 2) * (0.4 + k * 2.6), `rgba(255, 240, 200, ${lvl((out ? Math.sin(u * Math.PI) : 1 - u) * 0.9)})`);
      ring(cx, ground, (w / 2) * (0.4 + k * 4.6), `rgba(255, 224, 160, ${lvl((out ? Math.sin(u * Math.PI) : 1 - u) * 0.4)})`);
      // sparks rising through it
      c.fillStyle = `rgba(255, 240, 192, ${lvl(0.85 * glow)})`;
      for (let i = 0; i < 46; i++) {
        const sx = x0 - 6 + ((i * 0.7548) % 1) * (w + 12), sp = 0.4 + ((i * 0.5698) % 1);
        const sy = ground - ((((i * 0.31) % 1) * ground + u * sp * ground * 0.9) % ground);
        c.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
      // and the flash, at the peak, over everything
      const flash = out ? Math.max(0, (u - 0.7) / 0.3) : Math.max(0, 1 - u / 0.35);
      if (flash > 0) { c.fillStyle = `rgba(255, 246, 222, ${lvl(0.5 * flash)})`; c.fillRect(0, 0, fx.width, fx.height); }
    }
    return { draw, clear() { c.clearRect(0, 0, fx.width, fx.height); } };
  })();

  /* The gate, floating in the picture: a porthole onto every world, so the
     tower can be carried anywhere from wherever you are. On the whole tower
     they hang in a column beside it; in a room only the porthole of the
     world you are in shows, in the corner, and opens into the full row. */
  const gates = (() => {
    const order = meta.portholes.order, S = meta.portholes.size;
    let open = false;
    function render() {
      const home = floor < 0;
      const dpr = window.devicePixelRatio || 1, k = Math.max(1, Math.round(2 * dpr)), px = k / dpr;   // whole device pixels per art pixel
      gatesEl.style.setProperty('--gate', `${S * px}px`);
      gatesEl.style.setProperty('--gate-sheet', `${S * px * order.length}px ${S * px * 2}px`);
      gatesEl.classList.toggle('px-gates-home', home);
      gatesEl.classList.toggle('is-open', home || open);
      gatesEl.innerHTML = '';
      const here = world ?? 'home';
      // the current world first in a room, so the corner shows where you are
      const list = home ? order : [here, ...order.filter((w) => w !== here)];
      for (const name of list) {
        const i = order.indexOf(name), current = name === here;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-gate' + (current ? ' is-current' : '');
        b.style.backgroundPosition = `${-i * S * px}px ${current ? -S * px : 0}px`;
        b.style.backgroundImage = `url(${ART}/portholes.png)`;
        const label = name === 'home' ? 'Home — the tower\'s own hills' : WORLD_LABELS[name] ?? name;
        b.setAttribute('aria-label', current && !home ? `${label} — the gate: choose another world` : `${label}${current ? ' (here now)' : ''}`);
        if (current) b.setAttribute('aria-current', 'true');
        b.innerHTML = `<span class="px-spot-tip">${esc(label)}</span>`;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!home && current) { open = !open; render(); return; }
          open = false;
          if (current) return;
          void teleport(name === 'home' ? null : name);
          render();
        });
        gatesEl.appendChild(b);
      }
    }
    document.addEventListener('click', (e) => { if (open && !gatesEl.contains(e.target as Node)) { open = false; render(); } });
    window.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { open = false; render(); } });
    return { render, close() { open = false; } };
  })();

  /** The zoom: the overview grows toward the floor, then the room fades in. */
  async function zoomInto(k: number) {
    if (reduceMotion() || floor !== -1) return;
    const [y0, y1] = meta.overview.floors[k];
    const oy = ((layout.oy + (y0 + y1) / 2) / layout.H) * 100;
    const zoom = (el: HTMLElement) => el.animate(
      [{ transform: 'scale(1)', transformOrigin: `50% ${oy}%` }, { transform: 'scale(2.6)', transformOrigin: `50% ${oy}%`, opacity: 0.2 }],
      { duration: 240, easing: 'cubic-bezier(.5,0,.8,.4)' },
    ).finished.catch(() => {});
    await Promise.all([zoom(canvas), zoom(worldCanvas)]);       // the world and the tower together
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
    else { animFloor = -2; anim = null; await drawHome(); renderHomeText(); collapse.apply(); }
    if (was !== k) { view.scrollTop = 0; gates.close(); }
    gates.render();
    if (was !== k && !reduceMotion()) for (const el of [canvas, worldCanvas]) el.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 180 });
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
  /* The view menu: 2D, 3D or the plain text page. Going to 3D keeps the
     floor you are on and the world the tower stands in. */
  {
    const btn = $<HTMLButtonElement>('.px-views-btn'), menu = $<HTMLElement>('.px-views-menu');
    const items = [...menu.querySelectorAll<HTMLAnchorElement>('.px-views-item')];
    const setOpen = (v: boolean, focus = false) => {
      menu.hidden = !v;
      btn.setAttribute('aria-expanded', String(v));
      if (v && focus) items[0].focus();
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true, true); } });
    menu.addEventListener('keydown', (e) => {
      const at = items.indexOf(document.activeElement as HTMLAnchorElement);
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btn.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length].focus(); }
    });
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !view.querySelector('.px-views')!.contains(e.target as Node)) setOpen(false); });
    for (const a of items) a.addEventListener('click', (e) => {
      const kind = a.dataset.kind;
      if (kind === '2d') { e.preventDefault(); setOpen(false); return; }
      if (kind === 'text') { e.preventDefault(); window.location.href = textPageHref('2d'); return; }
      if (kind === '3d') {
        e.preventDefault();
        const route = routeForSlug(currentSlug());
        window.location.href = `${BASE}/${route ? route.slug : ''}?view=3d${world ? '&world=' + world : ''}${window.location.hash}`;
      }
    });
  }

  /* Resizing: redraw at the new size. Crossing between the phone and wide
     layouts also rebuilds the text (framed on a phone, plain when wide),
     drops what the phone's folding strip left on the picture, and starts the
     page from the top, since the two layouts scroll differently. */
  // the theme changed (here, in the keeper, or on another view's tab): day or night, redraw
  window.addEventListener('lair-theme', () => {
    const d = effectiveTheme() === 'paper';
    if (d === day) { showTheme(); return; }
    day = d;
    showTheme();
    if (floor >= 0) void drawRoom(floor); else void drawHome();
  });

  let resizeTimer = 0, wasWide = isWide();
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const wide = isWide();
      if (wide !== wasWide) {
        wasWide = wide;
        stage.style.top = ''; picture.style.transform = '';
        view.scrollTop = 0;
        if (floor >= 0) renderRoomText(routeForSlug(slugOfFloor(floor))!); else renderHomeText();
      }
      if (floor >= 0) void drawRoom(floor); else void drawHome();
      gates.render();
    }, 120);
  });

  /* On a phone, reading a room: the picture starts large and, as the text
     scrolls, folds up into a strip at the top that keeps the room's middle in
     view — a sticky header that is the room itself. */
  const collapse = (() => {
    let roomMid = 0, strip = 76;
    function apply() {
      if (isWide() || floor < 0) { stage.style.top = ''; picture.style.transform = ''; return; }
      const head = $<HTMLElement>('.px-head').getBoundingClientRect().height;
      const full = stage.getBoundingClientRect().height;
      const travel = Math.max(0, full - strip);
      stage.style.top = `${head - travel}px`;
      const p = Math.min(1, view.scrollTop / Math.max(1, travel));
      picture.style.transform = `translateY(${Math.round(p * (full - strip / 2 - roomMid))}px)`;
    }
    view.addEventListener('scroll', () => requestAnimationFrame(apply), { passive: true });
    return {
      set(ry: number, s: number) { roomMid = (ry + RH / 2) * s; apply(); },
      apply,
    };
  })();

  /* ------------------------------ the keeper ----------------------------- */
  const keeper = mountKeeper(view, () => floor, { kinds: WORLD_KINDS, current: () => world, teleport });
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
function mountKeeper(view: HTMLElement, currentFloor: () => number,
  gate: { kinds: string[]; current: () => string | null; teleport: (kind: string | null) => void }) {
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
    worlds: { kinds: gate.kinds, current: gate.current, teleport: (k: string | null) => { gate.teleport(k); return true; }, reflections: () => false, reflectionsOn: () => false },
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

