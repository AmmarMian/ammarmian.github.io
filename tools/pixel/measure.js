const P = require("./core/pixel.js");
const ref = P.load(process.argv[2]);
const hex = c => "#" + [c >> 16 & 255, c >> 8 & 255, c & 255].map(v => v.toString(16).padStart(2, "0")).join("");
const parts = {
  backWood: [480, 110, 28, 220], shelfWood: [80, 290, 160, 20], floor: [880, 560, 260, 120],
  rug: [380, 520, 120, 40], books: [660, 140, 300, 40], window: [522, 196, 60, 60],
  shaft: [560, 330, 40, 80], sky: [1100, 40, 160, 120], cabinets: [700, 410, 250, 60],
};
for (const [k, [x, y, w, h]] of Object.entries(parts)) {
  const q = P.quantize(P.crop(ref, x, y, w, h), 5);
  const cols = q.palette.map(c => typeof c === "number" ? c : (c[0] << 16 | c[1] << 8 | c[2]));
  console.log(k.padEnd(10), cols.map(c => hex(c) + " " + P.toHsl(P.rgb(c>>16&255,c>>8&255,c&255)).map(v => +v.toFixed(2)).join("/")).join("  "));
}
