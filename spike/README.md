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
  leaves mid-turn, wall sconces with candles.
- **Poly Haven scans** decimated to a triangle budget: armchair, gothic chair, console, drawers, stool, clock,
  bust, vases, oil lamp, candelabra, lantern, chest, encyclopedia set, two plants.
- **Books**: four unit meshes (folio, quarto, thick, slim), each with a rounded leather spine, boards, a chamfered
  page block, headbands, raised hubs, gilt tooling and a label. The ~600 on the shelves are instances in a 28 KB
  buffer (position, lean, scale, cover colour, baked AO), so each can be addressed, tinted or opened.
- **Baked ambient occlusion** on every static vertex by ray casting, and per instance for the books.

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
