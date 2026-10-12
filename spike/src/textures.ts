import { texture } from 'vgpu';
import type { Gpu, Texture } from 'vgpu';

export interface Img { width: number; height: number; data: Uint8Array | Uint8ClampedArray }

/** Decoded pixels in, mipmapped GPU texture out. Mips are a box filter on the CPU, so the browser and the
 *  headless renderer take exactly the same path from RGBA bytes to texels. */
export function makeTexture(gpu: Gpu, img: Img, srgb: boolean, label: string): Texture {
  const levels = Math.floor(Math.log2(Math.max(img.width, img.height))) + 1;
  const tex = texture(gpu, {
    kind: '2d', size: [img.width, img.height], format: srgb ? 'rgba8unorm-srgb' : 'rgba8unorm',
    usage: ['texture_binding', 'copy_dst'], mipLevelCount: levels, label,
  });
  const q = gpu.device.gpu.queue;
  let w = img.width, h = img.height;
  let cur: Uint8Array | Uint8ClampedArray = img.data;
  for (let level = 0; level < levels; level++) {
    q.writeTexture({ texture: tex.gpu, mipLevel: level }, cur as BufferSource, { bytesPerRow: w * 4, rowsPerImage: h }, [w, h]);
    if (level === levels - 1) break;
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const next = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.min(h - 1, y * 2), y1 = Math.min(h - 1, y * 2 + 1);
      for (let x = 0; x < nw; x++) {
        const x0 = Math.min(w - 1, x * 2), x1 = Math.min(w - 1, x * 2 + 1);
        const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
        const o = (y * nw + x) * 4;
        for (let k = 0; k < 4; k++) next[o + k] = (cur[a + k] + cur[b + k] + cur[c + k] + cur[d + k] + 2) >> 2;
      }
    }
    cur = next; w = nw; h = nh;
  }
  return tex;
}

export const solid = (r: number, g: number, b: number): Img => ({ width: 1, height: 1, data: new Uint8Array([r, g, b, 255]) });
