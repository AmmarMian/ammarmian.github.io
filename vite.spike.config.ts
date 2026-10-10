import { defineConfig } from 'vite';
import { wgslVitePlugin } from '@vgpu/wgsl/loader-vite';

/* The vgpu spike builds on its own, beside the site and never into it: nothing in the real build
   imports it, so the tower is untouched until the spike earns a place. */
export default defineConfig({
  root: 'spike',
  base: './',
  publicDir: 'public',
  plugins: [wgslVitePlugin()],
  build: { outDir: '../dist-spike', emptyOutDir: true, target: 'es2022' },
});
