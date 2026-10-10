# vgpu spike: the library floor

One floor of the tower, rebuilt on vgpu with a Blender-baked mesh, to find out what the rewrite
would cost and what it would buy. It builds beside the site (`vite.spike.config.ts`) and nothing in
the real build imports it.

    npm run spike:model     # Blender -> spike/public/library.{bin,json}  (about 7 s)
    npm run spike:render -- spike/out/shot.png [--cam x,y,z --look x,y,z --time t]
    node spike/tools/bench.mjs
    npm run spike:build     # typecheck + bundle into dist-spike/

`spike:render` and `bench.mjs` drive vgpu's Node adapter straight onto the GPU: no browser, no dev
server. They import the same `src/library.ts` the page does.

## What is here

- `blender/model_library.py` reads like `src/tower/floors/library.ts` (same polar layout, same
  seeded choices) but builds bevelled solids, a real window opening in the wall, books with gilt
  bands and labels, and bakes ambient occlusion into the vertices by ray casting.
- `src/shaders/library.wgsl`: four point lamps, hemisphere ambient times baked AO, and the sun
  through the round window as an analytic test (ray from the fragment toward the sun, does it
  cross the window plane inside the glass and clear of the mullions?). That gives the crossed
  pool of light on the floor with no shadow map. Also the orbiting books (hinged leaves),
  the spinning globe, the sunbeam and the sky.
- `src/shaders/post.wgsl` and `LibraryScene`: scene drawn at 1/N resolution in HDR, nearest
  upscale, ACES. This is the site's pixel-art look.

## Numbers (M4 Pro, headless, submit to GPU idle)

| | |
|---|---|
| 1920x1080 canvas, scene at 640x360 | 0.43 ms median, 0.58 ms p95 |
| 1920x1080, scene at full resolution | 0.68 ms median |
| room mesh | 90k vertices, 53k triangles |
| mesh file | 2.5 MB raw, 0.87 MB gzip (20-byte vertices) |
| JS for the page | 228 KB, 73 KB gzip (vgpu included); the tower ships three 552 KB + scene 211 KB |

## What it does not have yet

- Shadows from the room's own objects. The sun and the lamps ignore the desk and shelves; the AO
  covers contact darkening only. A single shadow map for the sun is the next thing to add.
- Picking. Hover and click on books, globe and lectern need either a CPU ray against the bounding
  boxes the manifest could carry, or an ID buffer.
- Bloom, glass pane, other floors, worlds, teleport, quality tiers, the wizard and fox.
- WebGPU only: no `navigator.gpu` shows the link to `/text`.
