// Downloads the CC0 Poly Haven models and PBR texture sets the library uses into spike/assets-src.
//   node spike/tools/fetch-assets.mjs
// Sources are not committed (hundreds of MB); this list is what makes the spike reproducible.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MODELS = [
  'ArmChair_01', 'vintage_wooden_drawer_01', 'wooden_stool_01', 'brass_candleholders', 'wooden_candlestick',
  'mantel_clock_01', 'marble_bust_01', 'potted_plant_01', 'potted_plant_02', 'ceramic_vase_01',
  'antique_ceramic_vase_01', 'treasure_chest', 'Lantern_01', 'GothicCabinet_01', 'ClassicConsole_01',
  'book_encyclopedia_set_01', 'decorative_book_set_01', 'brass_vase_01', 'WoodenTable_01', 'WoodenTable_02', 'WoodenChair_01', 'vintage_oil_lamp', 'brass_goblets',
];
const TEXTURES = [
  'wood_cabinet_worn_long', 'dark_paneled_wood', 'dark_wood', 'lacquered_cherry_wood', 'wood_table_worn',
  'brown_leather', 'velour_velvet', 'monastery_stone_floor', 'old_stone_wall',
];
const RES = '1k';
const H = { 'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const get = async (u) => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(`${r.status} ${u}`); return Buffer.from(await r.arrayBuffer()); };
const exists = (p) => access(p).then(() => true, () => false);
async function save(url, dest) {
  if (await exists(dest)) return;
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, await get(url));
}

for (const id of MODELS) {
  const files = JSON.parse(await get(`https://api.polyhaven.com/files/${id}`));
  const e = files.gltf?.[RES]?.gltf;
  if (!e) { console.log('no gltf', id); continue; }
  const dir = join('spike/assets-src/models', id);
  await save(e.url, join(dir, `${id}.gltf`));
  for (const [p, v] of Object.entries(e.include ?? {})) await save(v.url, join(dir, p));
  console.log('model', id);
}
for (const id of TEXTURES) {
  const files = JSON.parse(await get(`https://api.polyhaven.com/files/${id}`));
  for (const [key, name] of [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']]) {
    const e = files[key]?.[RES]?.jpg;
    if (e) await save(e.url, join('spike/assets-src/textures', id, `${name}.jpg`));
    else console.log('missing', key, id);
  }
  console.log('texture', id);
}
