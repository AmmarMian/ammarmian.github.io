# vgpu spike: the library floor

One floor of the tower rebuilt on vgpu with Blender-built assets, to find out what a rewrite costs and what it
buys. It builds beside the site (`vite.spike.config.ts`); nothing in the real build imports it.

    npm run spike:fetch     # CC0 Poly Haven scans + PBR sets -> spike/assets-src   (not committed, ~70 MB)
    npm run spike:model     # Blender assembles the room -> spike/public, then pack-assets.py writes the WebP
    npm run spike:render -- spike/out/shot.png [--cam x,y,z --look x,y,z --fov 62 --exposure 1.4]
    node spike/tools/bench.mjs
    npm run spike:build && npm run spike:browser   # build, then load it in the cached Chrome and screenshot

The generated files in `spike/public` are gitignored; the three commands above recreate them.
`spike:render` and `bench.mjs` drive vgpu's Node adapter straight onto the GPU, with no browser and no dev server,
through the same `src/library.ts` the page imports. `spike:browser` serves the build from a throwaway static
server and loads it in real Chrome with WebGPU, to check the browser path itself.

## What is in the room

`blender/model_library.py` builds it, in the site's own coordinates (x = r sin a, z = r cos a):

- **Architecture from swept mouldings**: skirting, chair rail, frieze and crown running round the wall; fluted
  pilasters; raised wainscot panels; a deep stone window reveal with an outer moulding, keystone, casement and lead
  lattice; bookcases with rounded nosings, dividers, cabinet doors with brass knobs, plinth and cornice; a
  rolling library ladder on a brass rail; a rolled stone platform edge; turned balusters and newels.
- **Furniture modelled by hand**: a writing desk (rolled-edge top, leather inlay with gilt border, two drawer
  pedestals, hutch of pigeonholes, turned feet), a turned lectern with a clasped grimoire, a globe on three
  cabriole legs with horizon ring and tilted brass meridian, an armillary, an open tome with curved page stacks and
  leaves mid-turn, wall sconces with candles on the plain wall either side of the window, clear of the shelves.
- **Poly Haven scans** decimated to a triangle budget: armchair, gothic chair, console, drawers, stool, clock,
  bust, vases, oil lamp, candelabra, lantern, chest, encyclopedia set, two plants.
- **Books**: four unit meshes (folio, quarto, thick, slim), each with a rounded leather spine, boards, a chamfered
  page block, headbands, raised hubs, gilt tooling and a label. The ~600 on the shelves are instances in a 28 KB
  buffer (position, lean, scale, cover colour, baked AO), so each can be addressed, tinted or opened.
- **Books that really leave the shelves** (`src/flights.ts`): four books at a time, staggered, each on an 18 s
  cycle: it slides out of its slot, lifts off still shut, flies a curve into an orbit round the desk and opens
  while it goes, hovers turning its pages in the sunbeam, then folds, flies back and slides into the gap it left.
  The shelf copy is hidden while it is away (one write to the 28 KB instance buffer), and the open-book mesh takes
  its place, so the same book is never in two spots. The slot comes from the manifest, so a publication bound to a
  slot can be the one that flies.
- **Baked ambient occlusion** on every static vertex by ray casting, and per instance for the books.

## Typography (the Paper & Night system)

The room carries type set in the "Paper & Night" design system (Cormorant Garamond for display, Cormorant SC for small
caps, Newsreader for text, JetBrains Mono for tracked capitals, Pirata One for the single blackletter signature; paper
`#efece4`, ink `#1f1e1b`, one vermilion accent `#b03915`). `tools/typeset.py` sets it with PIL from the fonts in
`assets-src/fonts` (Google Fonts, OFL; fetched with the other sources) and `pack-assets.py` bakes it into textures:

- **Spines**: every shelf book has a paper label from a 4096x4096 atlas (one 56x288 cell each): accent index, hairline,
  title in small caps, author in italic, year in mono. The first 37 are the site's real publications from
  `src/data/hal-snapshot.json`, oldest on the lowest shelves; the rest are bound classics. The manifest's `slots`
  carry each book's `label` (title, author, year, HAL id), so a click can open the right record. The atlas cell
  comes from the instance buffer, so the four book meshes serve all 585 labels.
- **Pages**: the open tome on the desk and the flying books carry a typeset spread (running head, kicker with accent
  index, display title with the short vermilion bar, drop cap, ruled algorithm plate, folio). A typed letter lies on
  the desk.
- **Plaque, cards, cover**: an engraved brass plate under the window, a brass card holder on each bay with its
  category in tracked mono capitals, and the lectern grimoire in gilt on violet cloth, signed in blackletter.

## How it is lit and drawn (`src/library.ts`, `src/shaders/`)

- PBR (GGX, Smith, Schlick), tangent-space normal maps, ARM maps; cotangent frame from screen derivatives.
- A shadow-mapped sun (2048², 5x5 PCF) that comes through the real window opening, so the pool of light on the
  floor, the mullion shadows and the beam are physical, not painted.
- The candelabra casts a six-face cube shadow, drawn once because nothing near it moves.
- A volumetric pass marches the sun's shadow map for the beam (64 steps, forward-scattering phase), boosted where
  the ray passes through the glass; dust motes shine only where the sun reaches them.
- 4x MSAA in HDR, a five-level bloom, ACES, grade, vignette and grain. Full resolution; `?scale=0.5` on the page
  trades sharpness for speed.

## Numbers (M4 Pro, headless, submit to GPU idle)

| | |
|---|---|
| 1920x1080, 4x MSAA, shadows, beam, bloom | 4.3 ms median, 4.9 ms p95 |
| room mesh | 422k vertices, 412k triangles, 41 materials |
| mesh file | 10 MB raw, 6.5 MB gzip |
| textures | 8.1 MB WebP (1k for hero pieces, 512 for small props) |
| page JS | 254 KB, 80 KB gzip, vgpu included (the tower ships three 552 KB + scene 211 KB) |

One floor at this fidelity is about 15 MB over the wire, so seven would be too many as-is. The levers, in order of
effect: meshopt-compress the vertex stream (typically 3-5x over gzip), KTX2/Basis textures instead of WebP, 512 px
for everything that is not a hero, lower decimation budgets on the scans, and streaming floors on demand.

## Not done yet

- Picking (a CPU ray against per-book boxes, or an ID buffer) for hover and click on books, globe and lectern.
- Lamp shadows beyond the candelabra; screen-space AO for contact detail on the scans.
- Glass in the window, other floors, the worlds and teleport, quality tiers, wizard and fox.
- WebGPU only: without `navigator.gpu` the page shows a link to `/text`.
