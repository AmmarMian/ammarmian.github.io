# Sunken Tower

Isometric pixel-art dungeon rooms, ray-marched live in WebGPU with [vgpu](https://github.com/vercel-labs/vgpu).

- `src/room.ts` builds a room as a voxel grid (one byte per voxel), plus its windows and lights.
- `src/scene.wgsl` walks that grid per art pixel at low resolution: sun shadows, water, light shafts, mist, particles.
- `src/post.wgsl` upscales with hard pixels, adds outlines, bloom, colour grade and dithering.

```bash
npm install
npm run dev                # http://localhost:5173 (needs a WebGPU browser); ?t=12 freezes time, ?px=4 forces pixel size
node --experimental-strip-types dev/render.ts out.png 6   # headless still (npx vgpu install-software-renderer once)
```
