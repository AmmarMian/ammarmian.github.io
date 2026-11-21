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
write("backdrop.png", P.png(ov.backdrop(1)));                 // the land alone: drawn enlarged behind a room
meta.overview.cx = ov.OX + 48;                                // the tower's centre line
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
write("meta.json", Buffer.from(JSON.stringify(meta)));
console.log(`public/pixel: ${(bytes / 1024).toFixed(0)} KB in all`);
