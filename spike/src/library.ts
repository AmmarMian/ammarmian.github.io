import { draw, effect, geometry, sampler, target, uniforms } from 'vgpu';
import type { Draw, Effect, Frame, Gpu, SharedUniforms, Surface, Target } from 'vgpu';
import type { ShaderSource } from '@vgpu/wgsl';
import { mat4 } from 'wgpu-matrix';

/* The library floor, rendered with vgpu from the mesh model_library.py baked.
 *
 * Nothing here knows about the browser: the page and the headless render script both hand it a Gpu,
 * the shader sources and the two asset files, so a screenshot taken by one is the picture the
 * other shows. */

export interface MeshRange { firstIndex: number; indexCount: number; vertexCount: number; triangles: number; bounds: number[][] }
type V3 = [number, number, number];
export interface Manifest {
  vertexBytes: number;
  stride: number;
  quant: { min: V3; size: V3 };
  indexCount: number;
  meshes: Record<'static' | 'flame' | 'book' | 'globe' | 'shaft', MeshRange>;
  lights: { name: string; pos: V3; color: V3; intensity: number; range: number; flicker: number }[];
  window: { center: V3; normal: V3; right: V3; radius: number; mullion: number; towardSun: V3; shaftFrom: V3; shaftTo: V3 };
  globe: { pos: V3; spin: number };
  flyingBooks: { r: number; a0: number; y: number; sp: number; spread: number; skin: V3 }[];
  flyingCenter: V3;
  slots: { band: number; angle: number; row: number; height: number }[];
  camera: { pos: V3; target: V3 };
}

export interface View { pos: V3; target: V3; fov?: number }

export interface Sources { library: string | ShaderSource; post: string | ShaderSource }

const HDR: GPUTextureFormat = 'rgba16float';
const lin = (c: number[]) => c.map((v) => v ** 2.2) as V3;

export class LibraryScene {
  readonly scene: Target;
  private readonly G: SharedUniforms;
  private readonly draws: { sky: Draw; opaque: Draw[]; shaft: Draw };
  private readonly post: Effect;
  private readonly bookData: number[][] = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
  private readonly globeDraw: Draw;
  private readonly bookDraw: Draw;
  private pixel: number;
  private readonly manifest: Manifest;

  constructor(gpu: Gpu, manifest: Manifest, bin: ArrayBuffer, src: Sources, outSize: readonly [number, number], pixel = 3) {
    this.manifest = manifest;
    this.pixel = pixel;
    const w = manifest.window;
    // two vec4s per light: [position, range] and [colour * intensity, flicker]
    const lights: number[][] = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
    manifest.lights.forEach((l, i) => {
      lights[i * 2] = [...l.pos, l.range];
      // three's light units run hotter than this shader's: 0.3 puts the same lamps at the same warmth
      const k = l.intensity * 0.3;
      lights[i * 2 + 1] = [l.color[0] * k, l.color[1] * k, l.color[2] * k, l.flicker];
    });
    this.G = uniforms(gpu, {
      viewProj: new Float32Array(16),
      invViewProj: new Float32Array(16),
      cam: [0, 0, 0, 0],
      lights,
      winC: [...w.center, w.radius],
      winN: [...w.normal, w.mullion],
      winR: [...w.right, 0],
      sun: [...w.towardSun, 3.2],
      sunCol: [...lin([1.0, 0.86, 0.62]), 0],
      skyTop: [...lin([0.30, 0.52, 0.86]), 0],
      skyHorizon: [...lin([0.86, 0.80, 0.70]), 0],
      ambient: [...lin([0.50, 0.58, 0.72]), 0.42],
      ground: [...lin([0.46, 0.34, 0.24]), 0],
      qMin: [...manifest.quant.min, 0],
      qSize: [...manifest.quant.size, 0],
    });

    const geo = geometry(gpu, {
      label: 'library',
      buffers: [{
        data: new Uint8Array(bin, 0, manifest.vertexBytes),
        attributes: { pq: 'unorm16x4', nq: 'snorm8x4', c: 'unorm8x4', d: 'unorm8x4' },
      }],
      indices: new Uint32Array(bin, manifest.vertexBytes, manifest.indexCount),
    });
    const part = (m: MeshRange) => geo.slice({ firstIndex: m.firstIndex, indexCount: m.indexCount });
    const globeModel = new Float32Array(16);
    const mk = (label: string, vs: string, fs: string, mesh: MeshRange, extra: Record<string, unknown> = {}, set: Record<string, unknown> = {}) =>
      draw(gpu, {
        label, shader: src.library, entry: { vertex: vs, fragment: fs }, geometry: part(mesh),
        cull: 'none', depth: { compare: 'less', write: true }, set: { G: this.G, ...set }, ...extra,
      });

    const m = manifest.meshes;
    this.globeDraw = mk('globe', 'vs_globe', 'fs_main', m.globe, {}, { globeModel });
    this.bookDraw = mk('books', 'vs_book', 'fs_main', m.book, { instances: manifest.flyingBooks.length }, { books: this.bookData });
    this.draws = {
      sky: draw(gpu, { label: 'sky', shader: src.library, entry: { vertex: 'vs_sky', fragment: 'fs_sky' }, vertices: 3, depth: { compare: 'always', write: false }, set: { G: this.G } }),
      opaque: [
        mk('room', 'vs_static', 'fs_main', m.static),
        mk('flame', 'vs_static', 'fs_main', m.flame),
        this.globeDraw,
        this.bookDraw,
      ],
      shaft: mk('shaft', 'vs_static', 'fs_shaft', m.shaft, { blend: 'additive', depth: { compare: 'less', write: false } }),
    };
    this.globeModel = globeModel;

    this.scene = target(gpu, { size: this.sceneSize(outSize), format: HDR, depth: 'depth32float', label: 'library-scene' });
    this.postParams = { exposure: 1.0, vignette: 0.5, time: 0, pad: 0 };
    this.post = effect(gpu, src.post, {
      label: 'post',
      set: {
        scene: this.scene,
        samp: sampler(gpu, { minFilter: 'nearest', magFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
        params: this.postParams,
      },
    });
  }

  private readonly globeModel: Float32Array;
  private postParams: { exposure: number; vignette: number; time: number; pad: number };

  private sceneSize(out: readonly [number, number]): [number, number] {
    return [Math.max(1, Math.ceil(out[0] / this.pixel)), Math.max(1, Math.ceil(out[1] / this.pixel))];
  }

  /** Re-fit the low-resolution scene to a new output size or pixel scale. */
  resize(out: readonly [number, number], pixel = this.pixel): void {
    this.pixel = pixel;
    this.scene.resize(this.sceneSize(out));
    this.post.set({ scene: this.scene });
  }

  /** Encode one frame: the room into the small HDR target, then the nearest-neighbour present. */
  render(frame: Frame, out: Surface | Target, view: View, time: number): void {
    const [sw, sh] = this.scene.size;
    const proj = mat4.perspective(((view.fov ?? 62) * Math.PI) / 180, sw / sh, 0.1, 60);
    const viewM = mat4.lookAt(view.pos, view.target, [0, 1, 0]);
    const vp = mat4.multiply(proj, viewM);
    this.G.set({ viewProj: vp, invViewProj: mat4.invert(vp), cam: [...view.pos, time] });

    // the globe turns on its pole
    const g = this.manifest.globe;
    mat4.rotateY(mat4.translation(g.pos), time * g.spin, this.globeModel);
    this.globeDraw.set({ globeModel: this.globeModel });

    // the books orbit and bob, as anim.ts has them do
    const c = this.manifest.flyingCenter;
    this.manifest.flyingBooks.forEach((b, i) => {
      const a = b.a0 + time * b.sp;
      this.bookData[i * 3] = [c[0] + Math.cos(a) * b.r, b.y + Math.sin(time * 1.3 + b.a0) * 0.22, c[2] + Math.sin(a) * b.r, b.spread];
      this.bookData[i * 3 + 1] = [-a + Math.PI / 2, Math.sin(time * 0.9 + b.a0) * 0.18, Math.sin(time * 1.4 + b.a0) * 0.12, 1];
      this.bookData[i * 3 + 2] = [b.skin[0] / 255, b.skin[1] / 255, b.skin[2] / 255, 0];
    });
    this.bookDraw.set({ books: this.bookData });
    this.postParams.time = time;
    this.post.set({ params: this.postParams });

    frame.pass({ target: this.scene, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
      pass.draw(this.draws.sky);
      for (const d of this.draws.opaque) pass.draw(d);
      pass.draw(this.draws.shaft);
    });
    frame.pass(out, this.post);
  }
}
