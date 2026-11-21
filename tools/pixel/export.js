/* Export the pixel tower for the site: public/pixel/.
 *
 *   <slug>.png        the room, still (flames and the like drawn on top in the page)
 *   <slug>.anim.json  its loop as deltas: per frame, only the pixels that differ from the still
 *   overview.png      the whole tower, every floor lit
 *   overview-<k>.png  the same with only floor k lit
 *   meta.json         sizes, where each floor sits in the overview, loop timing
 *
 *   node export.js
 */
const fs = require("fs");
const P = require("./core/pixel.js");
const ov = require("./overview.js");
const T = require("./tower.js");

const ROOMS = [                                   // bottom up, as the stairs go
  ["settings", "bathhouse"], ["elsewhere", "sanctum"], ["about", "quarters"], ["publications", "library"],
  ["projects", "laboratory"], ["now", "kitchen"], ["contact", "observatory"],
];
const out = __dirname + "/../../public/pixel";
fs.mkdirSync(out, { recursive: true });

const meta = { room: { w: 192, h: 160 }, overview: { w: ov.W, h: ov.H, x0: ov.OX + 18, x1: ov.OX + 77, floors: [] }, rooms: [] };
let bytes = 0;
const write = (name, data) => { fs.writeFileSync(`${out}/${name}`, data); bytes += data.length; };

ROOMS.forEach(([slug, file], k) => {
  const room = require(`./${file}.js`);
  const base = room.out;
  write(`${slug}.png`, P.png(base));
  const frames = [];
  for (let t = 0; t < room.T; t++) {
    const f = room.frame(t), d = [];
    for (let i = 0; i < f.px.length; i++) if (f.px[i] !== base.px[i]) {
      const c = f.px[i];
      d.push(i, ((c & 255) << 16) | (((c >>> 8) & 255) << 8) | ((c >>> 16) & 255));
    }
    frames.push(d);
  }
  write(`${slug}.anim.json`, Buffer.from(JSON.stringify({ T: room.T, delay: room.DELAY, frames })));
  meta.rooms.push({ slug, floor: k });
  const [y0, y1] = T.F[k];
  meta.overview.floors.push([y0 + ov.OY, y1 + ov.OY]);
});
write("overview.png", P.png(ov.overview(-1)));
const { WORLDS, DAYS, homeTall, eye, EXT, LOOP } = require("./worlds.js");
/* A world's loop, stored as tiles: frame 0 is the still (backdrop-<name>.png);
   for every other frame, only the 8×8 tiles that differ from it, each kept
   once in an atlas however many frames use it. The page lays a frame's tiles
   over the still. */
const TILE = 8, ATLAS_COLS = 32;
function worldLoop(name, draw) {
  const base = draw(0), tw = base.w / TILE, th = base.h / TILE;
  write(`${name}.png`, P.png(base));
  const seen = new Map(), tiles = [], frames = [];
  for (let t = 0; t < LOOP; t++) {
    const f = t === 0 ? base : draw(t), list = [];
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      let same = true;
      const px = [];
      for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
        const k = (ty * TILE + j) * base.w + tx * TILE + i;
        px.push(f.px[k]);
        if (f.px[k] !== base.px[k]) same = false;
      }
      if (same) continue;
      const key = px.join(",");
      if (!seen.has(key)) { seen.set(key, tiles.length); tiles.push(px); }
      list.push(ty * tw + tx, seen.get(key));
    }
    frames.push(list);
  }
  const atlas = new P.Buf(ATLAS_COLS * TILE, Math.max(1, Math.ceil(tiles.length / ATLAS_COLS)) * TILE);
  tiles.forEach((px, n) => px.forEach((c, k) => { atlas.px[(Math.floor(n / ATLAS_COLS) * TILE + Math.floor(k / TILE)) * atlas.w + (n % ATLAS_COLS) * TILE + (k % TILE)] = c; }));
  write(`${name}.tiles.png`, P.png(atlas));
  write(`${name}.loop.json`, Buffer.from(JSON.stringify({ T: LOOP, delay: 120, tile: TILE, cols: ATLAS_COLS, frames })));
  console.log(`  ${name}: ${tiles.length} tiles`);
  return base;
}
worldLoop("backdrop", homeTall);                               // the land alone, carried on upward: drawn behind the tower and enlarged behind a room
meta.overview.ext = EXT;                                      // every backdrop starts EXT rows above the overview's frame
write("tower.png", P.png(T.render(-1)));                      // the tower alone, every floor lit: drawn over whichever world it stands in
meta.overview.tower = [ov.OX, ov.OY];
/* The worlds beyond the gate: the same frame as the home landscape, so the
   tower drops into any of them. For each, the colours the page needs where
   the picture runs out, above it and below it. */
{
  const mode = (buf, y) => {
    const n = new Map();
    for (let x = 0; x < buf.w; x++) { const c = buf.px[y * buf.w + x]; n.set(c, (n.get(c) || 0) + 1); }
    return P.unpack([...n].sort((a, b) => b[1] - a[1])[0][0]);
  };
  const info = (buf) => ({ top: mode(buf, 0), bottom: mode(buf, buf.h - 1) });
  meta.worlds = { home: info(homeTall()) };
  for (const [name, draw] of Object.entries(WORLDS)) {
    const buf = worldLoop(`backdrop-${name}`, draw);
    meta.worlds[name] = info(buf);
  }
  meta.worlds.rain.rain = true;                                  // its rain is drawn falling by the page
  meta.worlds.city.eye = true;                                   // and the city's watcher flies round the tower
  // by day (the light theme): the worlds whose light changes with the hour
  meta.days = {};
  for (const [name, draw] of Object.entries(DAYS)) {
    const buf = worldLoop(name === "home" ? "backdrop-day" : `backdrop-${name}-day`, draw);
    meta.days[name] = { ...info(buf), rain: name === "rain" || undefined };
  }
  /* the watcher: its loop, looking left (top row) and right (bottom row) */
  {
    const S = 64, sheet = new P.Buf(S * LOOP, S * 2);
    for (let t = 0; t < LOOP; t++) for (const [row, dir] of [[0, -1], [1, 1]]) {
      const e = eye(t, dir);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) sheet.px[(row * S + y) * sheet.w + t * S + x] = e.px[y * S + x];
    }
    write("eye.png", P.png(sheet));
    meta.eye = { size: S, T: LOOP };
  }
  /* The portholes: one little round window onto each world, for the gate
     that floats in the picture. Each is the world's most telling corner,
     shrunk, behind a brass rim lit from the top left; the second row is the
     same set with the rim lit, for the world the tower stands in now. */
  {
    const S = 18, C = (S - 1) / 2, FOCUS = {
      home: [96, 196, 60], seafloor: [66, 66, 64], moon: [66, 92, 96], forest: [60, 130, 70],
      beach: [64, 178, 54], city: [258, 60, 46], space: [266, 74, 62], rain: [52, 128, 56],
    };
    const order = ["home", ...Object.keys(WORLDS)];
    const sheet = new P.Buf(S * order.length, S * 2);
    const BRASS = [[28, 22, 28], [62, 52, 56], [98, 86, 84], [140, 126, 116]];     // dark iron: any other world
    const HOT = [[92, 50, 18], [196, 128, 46], [244, 190, 96], [255, 236, 184]];    // burning brass: the world you are in
    order.forEach((name, i) => {
      const bg = name === "home" ? homeTall() : (DAYS[name] && name !== "rain" && name !== "beach" ? DAYS[name] : WORLDS[name])();   // the sea and the forest show their day
      const [fx, fy, fs] = FOCUS[name];
      const view = P.resize(P.crop(bg, fx - fs / 2, fy + EXT - fs / 2, fs, fs), S - 4, S - 4);
      for (const row of [0, 1]) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - C, y - C), X = i * S + x, Y = row * S + y;
        if (d <= C - 2.1) sheet.pset(X, Y, view.get(x - 2, y - 2) || 0);
        else if (d <= C + 0.4) {
          const lit = (C - x) + (C - y) > 3 ? 3 : (C - x) + (C - y) > -3 ? 2 : 1;      // the rim, lit from the top left
          const ramp = row ? HOT : BRASS;
          sheet.pset(X, Y, d > C - 0.7 ? ramp[0] : ramp[lit]);
        }
      }
      // a glint on the glass
      sheet.pset(i * S + 5, 5, [255, 255, 255]); sheet.pset(i * S + 5, S + 5, [255, 255, 255]);
    });
    write("portholes.png", P.png(sheet));
    meta.portholes = { size: S, order };
    P.save(P.sheet([{ buf: sheet, scale: 6 }]), __dirname + "/preview/portholes.png");
  }
  // the observatory with its night cut out, for when the sky above it is another world's
  const obs = require("./observatory.js"), open = new P.Buf(obs.out.w, obs.out.h);
  open.px.set(obs.out.px);
  for (const i of obs.SKY) open.px[i] = 0;
  write("contact-open.png", P.png(open));
}
meta.overview.cx = ov.OX + 48;                                // the tower's centre line
// the library's spines, top shelf first, left to right: where the papers go
meta.books = require("./library.js").BOOKS.slice().sort((a, b) => a.y + a.h - (b.y + b.h) || a.x - b.x).map((b) => [b.x, b.y, b.w, b.h]);
meta.open = require("./observatory.js").OPEN;                // above this row the observatory is open sky
for (let k = 0; k < 7; k++) write(`overview-${k}.png`, P.png(ov.overview(k)));
/* The keeper's portrait for the console box: 24×24, a few pixels, as codixel
   says characters drawn without a reference should be. A pointed hat, a
   white beard, spectacles catching the candle. */
{
  const K = require("./room-kit.js").RAMPS, b = new P.Buf(24, 24);
  b.clear([36, 24, 34]);
  const art = [
    "...........hh...........",
    "..........hHh...........",
    ".........hHHh...........",
    "........hHHHhh..........",
    ".......hHHHHHh..........",
    "......hHHHsHHHh.........",
    ".....hHHHHHHHHHh........",
    "...hhhhhhhhhhhhhhh......",
    "..hHHHHHHHHHHHHHHHh.....",
    "....ffffffffffff........",
    "....fFFFFFFFFFFf........",
    "....fooFFFFFooFf........",
    "....fogFFFFFgoFf........",
    "....fFFFFnnFFFFf........",
    "....wfFFFFFFFFfw........",
    "...wWWfFFFFFFfWWw.......",
    "...wWWWWWWWWWWWWw.......",
    "....wWWWWWWWWWWw........",
    ".....wWWWWWWWWw.........",
    "..rrrwWWWWWWWWwrrr......",
    ".rRRRRwWWWWWWwRRRRr.....",
    "rRRRRRRwWWWWwRRRRRRr....",
    "RRRRRRRRwWWwRRRRRRRRr...",
    "RRRRRRRRRwwRRRRRRRRRRr..",
  ];
  const C = { h: K.slate[1], H: K.slate[2], s: K.brass[5], f: K.clay[2], F: K.clay[3], o: K.brass[3], g: [255, 246, 214], n: K.clay[1],
    w: K.linen[3], W: K.linen[5], r: K.blood[1], R: K.blood[2] };
  art.forEach((row, y) => [...row].forEach((ch, x) => { if (C[ch]) b.pset(x + 2, y, C[ch]); }));
  write("keeper.png", P.png(b));
  P.save(P.sheet([{ buf: b, scale: 8 }]), __dirname + "/preview/keeper.png");
}
// the first question's three pictures: 3D, the pixel tower, the plain page
{
  const C = require("./chooser.js");
  write("choose-3d.png", P.png(C.solid()));
  write("choose-2d.png", P.png(C.pixel()));
  write("choose-text.png", P.png(C.book()));
}
write("meta.json", Buffer.from(JSON.stringify(meta)));
console.log(`public/pixel: ${(bytes / 1024).toFixed(0)} KB in all`);
