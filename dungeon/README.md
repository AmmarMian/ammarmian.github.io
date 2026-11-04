# Sunken Tower

A six-floor isometric pixel-art tower of connected rooms, ray-marched live in WebGPU with [vgpu](https://github.com/vercel-labs/vgpu).

- `src/gen/` builds floors: `themes.ts` furnishes rooms (flooded hall, library, alchemist's workshop, amethyst grotto,
  blossom courtyard, forge, shrine) from the shared builders in `build.ts`; `floor.ts` lays rooms out on a grid, joins
  them with passages and rope bridges, places the stairs, and packs every grid for the GPU. Floors are built in a Web Worker.
- `src/scene.wgsl` traces each art pixel through the rooms it crosses (two-level DDA per room grid): sun shadows, water,
  light shafts, mist, swaying plants, wall cutaway, focus dimming, and CPU-placed particles binned into screen tiles.
- `src/post.wgsl` upscales with hard pixels and adds outlines, bloom, colour grade, dithering and the floor fade.

```bash
npm install
npm run dev     # needs a WebGPU browser; ?floor=3 starts on floor 3, ?t=12 freezes time, ?px=4 forces pixel size
node --experimental-strip-types dev/render.ts out.png 6 540 360 2 45 fit 0 -1   # headless still: floor 0, overview
```
