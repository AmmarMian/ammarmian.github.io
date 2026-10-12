import { draw, effect, geometry, sampler, storage, target, uniforms } from 'vgpu';
import type { Draw, Effect, Frame, Gpu, SharedUniforms, Surface, Target, Texture } from 'vgpu';
import type { ShaderSource } from '@vgpu/wgsl';
import { mat4 } from 'wgpu-matrix';
import { makeTexture, solid, type Img } from './textures.ts';
import { CYCLE, flightPose, type Orbit, type Slot } from './flights.ts';

/* The library floor, rendered with vgpu from the mesh and textures model_library.py and pack-assets.py made.
 *
 * Nothing here knows about the browser: the page and the headless render script both hand it a Gpu, the
 * shader sources, the two asset files and an image loader, so a screenshot taken by one is the picture
 * the other shows.
 *
 * One frame is: a sun shadow map; the room (PBR, 4x MSAA, HDR); a volumetric pass that marches the same
 * shadow map for the beam through the window; a bloom chain; and a composite that tone maps. */

type V3 = [number, number, number];
export interface MeshRange { group: string; material: string; firstIndex: number; indexCount: number; triangles: number; vertices: number }
export interface MaterialSpec {
  name: string; tint: V3; rough: number | null; metal: number | null; nscale: number; emissive: number; alpha: number; blend?: 'alpha' | 'additive' | 'portal' | 'fire' | 'water' | 'steam' | null;
  textures: { diff: string | null; nor: string | null; arm: string | null };
}
export interface Manifest {
  vertexBytes: number; stride: number; indexCount: number;
  quant: { min: V3; size: V3 };
  meshes: MeshRange[];
  materials: MaterialSpec[];
  lights: { name: string; pos: V3; color: V3; intensity: number; range: number; flicker: number; shadow: number }[];
  window: { center: V3; normal: V3; right: V3; radius: number; towardSun: V3 };
  globe?: { pos: V3; spin: number; tilt: number };
  flyingCount?: number;
  flyingBooks?: { r: number; a0: number; y: number; sp: number; spread: number; tint: V3 }[];
  flyingCenter?: V3;
  spineAtlas?: { cols: number; rows: number; cell: [number, number]; size: number };
  shelfBooks?: { file: string; count: number; variants: { group: string; first: number; count: number }[] };
  title?: string;
  /** Light and sky for this floor: the library is lit by afternoon sun, the observatory by the moon. All optional. */
  atmosphere?: { sunColor?: V3; sunStrength?: number; skyTop?: V3; skyHorizon?: V3; ambient?: V3; ambientScale?: number; ground?: V3; stars?: number; exposure?: number; bloom?: number; rays?: number };
  /** Props that spin and bob on their own: a group of meshes, a pivot, a rate. */
  spinners?: { group: string; pos: V3; axis: 'x' | 'y' | 'z'; rate: number; bob?: number; phase?: number }[];
  /** Things circling a point: reagent flasks round a cauldron. */
  orbiters?: { center: V3; count: number; r: number; y: number; speed: number; scale?: number; tints: V3[] };
  slots?: { band: number; angle: number; row: number; height: number; pos: V3; yaw: number; tint: V3; depth: number; inst: number }[];
  camera: { pos: V3; target: V3 };
}
export interface View { pos: V3; target: V3; fov?: number }
type Src = string | ShaderSource;
export interface Sources { pbr: Src; godrays: Src; composite: Src; down: Src; up: Src }
export interface Loaders { image: (url: string) => Promise<Img>; bytes: (url: string) => Promise<ArrayBuffer> }
export interface Options { flights?: boolean; debug?: number; scale?: number; shadowSize?: number; bloom?: number; rays?: number; exposure?: number }

const HDR: GPUTextureFormat = 'rgba16float';
const BLOOM_LEVELS = 5;
const lin = (c: number[]) => c.map((v) => v ** 2.2) as V3;
const scaled = (s: readonly [number, number], k: number): [number, number] => [Math.max(1, Math.floor(s[0] * k)), Math.max(1, Math.floor(s[1] * k))];

export class LibraryScene {
  readonly scene: Target;
  private readonly G: SharedUniforms;
  private readonly manifest: Manifest;
  private readonly shadow: Target;
  private readonly sky: Draw;
  private readonly opaque: Draw[] = [];
  private readonly transparent: Draw[] = [];
  private readonly spinDraws: Draw[] = [];
  private readonly spinShadowSet: Draw[] = [];
  private readonly spinMats: Float32Array[] = Array.from({ length: 6 }, () => new Float32Array(16));
  private readonly motes: Draw;
  private readonly shadowDraws: Draw[] = [];
  private readonly globeDraws: Draw[] = [];
  private readonly bookDraws: Draw[] = [];
  private readonly globeModel = new Float32Array(16);
  private readonly bookData: number[][] = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
  private readonly sunVP: Float32Array;
  private readonly candleMatrices: Float32Array[];
  private readonly candle: Target[] = [];
  private candleDirty = true;
  private cubeSet: Record<string, Target> = {};
  private shelfVariants: { group: string; first: number; count: number }[] = [];
  private readonly candlePasses: Draw[][] = [];
  private readonly rays: Target;
  private readonly raysFx: Effect;
  private readonly down: Target[] = [];
  private readonly up: Target[] = [];
  private readonly downFx: Effect[] = [];
  private readonly upFx: Effect[] = [];
  private readonly composite: Effect;
  private params: { exposure: number; bloom: number; vignette: number; time: number; rays: number; pad0: number; pad1: number; pad2: number };
  private scale: number;
  private out: Surface | Target;
  private shelfBuf!: ReturnType<typeof storage>;
  private shelfData!: Float32Array<ArrayBuffer>;
  private shelfLive!: Float32Array<ArrayBuffer>;
  private readonly hidden = new Set<number>();
  private readonly orbits: Orbit[] = [];
  private flightsOn = true;
  private readonly flightSlot: number[] = [];
  private readonly flightCycle: number[] = [];

  static async create(gpu: Gpu, manifest: Manifest, bin: ArrayBuffer, src: Sources, load: Loaders, out: Surface | Target, opts: Options = {}) {
    // textures: each file once; a missing map gets a neutral 1x1
    const files = new Map<string, Img>();
    const need = new Set<string>();
    for (const m of manifest.materials) for (const f of Object.values(m.textures)) if (f) need.add(f);
    await Promise.all([...need].map(async (f) => files.set(f, await load.image(`tex/${f}`))));
    const shelfBooks = manifest.shelfBooks ? await load.bytes(manifest.shelfBooks.file) : new ArrayBuffer(48);
    return new LibraryScene(gpu, manifest, bin, src, files, shelfBooks, out, opts);
  }

  private constructor(gpu: Gpu, manifest: Manifest, bin: ArrayBuffer, src: Sources, files: Map<string, Img>, shelfBooks: ArrayBuffer, out: Surface | Target, opts: Options) {
    this.manifest = manifest;
    this.out = out;
    this.scale = opts.scale ?? 1;
    const w = manifest.window;

    // ---- global uniforms
    const lights: number[][] = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
    manifest.lights.forEach((l, i) => {
      lights[i * 2] = [...l.pos, l.range];
      lights[i * 2 + 1] = [l.color[0] * l.intensity, l.color[1] * l.intensity, l.color[2] * l.intensity, l.flicker];
    });
    const shadowSize = opts.shadowSize ?? 2048;
    const at = manifest.atmosphere ?? {};
    this.sunVP = this.makeSunVP(w.towardSun);
    this.candleMatrices = this.makeCandleVPs(manifest.lights[0].pos, manifest.lights[0].range);
    this.G = uniforms(gpu, {
      viewProj: new Float32Array(16),
      invViewProj: new Float32Array(16),
      sunVP: this.sunVP,
      cam: [0, 0, 0, 0],
      lights,
      sun: [...w.towardSun, at.sunStrength ?? 9.0],
      sunCol: [...(at.sunColor ?? lin([1.0, 0.82, 0.58])), 0],
      skyTop: [...(at.skyTop ?? lin([0.22, 0.42, 0.78])), at.stars ?? 0],
      skyHorizon: [...(at.skyHorizon ?? lin([0.78, 0.76, 0.72])), 0],
      ambient: [...(at.ambient ?? [0.70, 0.82, 1.05]), at.ambientScale ?? 1.0],
      ground: [...(at.ground ?? [0.34, 0.24, 0.16]), 0],
      qMin: [...manifest.quant.min, 0],
      qSize: [...manifest.quant.size, 0],
      shadow: [shadowSize, 0.0006, 0.03, opts.debug ?? 0],
      winC: [...w.center, w.radius],
      winN: [...w.normal, 0],
      winR: [...w.right, 0.05],
      candleVP: this.candleMatrices.map((m) => m),
    });

    // ---- textures
    const texCache = new Map<string, Texture>();
    const tex = (f: string | null, srgb: boolean, dflt: Img): Texture => {
      const key = `${f ?? 'default'}:${srgb}:${dflt.data[0]}${dflt.data[1]}${dflt.data[2]}`;
      let t = texCache.get(key);
      if (!t) {
        const img = f ? files.get(f)! : dflt;
        t = makeTexture(gpu, img, srgb, key);
        texCache.set(key, t);
      }
      return t;
    };
    const lin8 = (img: Img) => img;
    void lin8;
    const matBindings = (spec: MaterialSpec) => ({
      M: { tint: [...spec.tint, spec.blend === 'portal' ? -2 : spec.blend === 'fire' ? -3 : spec.blend === 'water' ? -4 : spec.blend === 'steam' ? -5 : spec.blend === 'additive' ? -1 : (spec.alpha > 0 ? spec.alpha : 0)], p: [spec.rough ?? -1, spec.metal ?? -1, spec.nscale, spec.emissive] },
      diffTex: tex(spec.textures.diff, true, solid(255, 255, 255)),
      norTex: tex(spec.textures.nor, false, solid(128, 128, 255)),
      armTex: tex(spec.textures.arm, false, solid(255, 255, 0)),
    });

    // ---- geometry
    const geo = geometry(gpu, {
      label: 'library',
      buffers: [{
        data: new Uint8Array(bin, 0, manifest.vertexBytes),
        attributes: { pq: 'unorm16x4', nq: 'snorm8x4', uv: 'float32x2', c: 'unorm8x4', d: 'unorm8x4' },
      }],
      indices: new Uint32Array(bin, manifest.vertexBytes, manifest.indexCount),
    });
    const range = (m: MeshRange) => geo.slice({ firstIndex: m.firstIndex, indexCount: m.indexCount });

    // ---- targets and shared samplers
    const linear = sampler(gpu, { minFilter: 'linear', magFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
    const clamp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.shadow = target(gpu, { size: [shadowSize, shadowSize], format: 'rgba8unorm', depth: 'depth32float', label: 'sun-shadow' });
    const sceneSize = scaled(out.size, this.scale);
    this.scene = target(gpu, { size: sceneSize, format: HDR, depth: 'depth32float', msaa: true, label: 'library-scene' });

    const shelfBuf = storage(gpu, Math.max(48, shelfBooks.byteLength), 'read');
    this.shelfData = new Float32Array(shelfBooks.slice(0));
    this.shelfLive = new Float32Array(shelfBooks.slice(0));
    shelfBuf.write(this.shelfLive);
    this.shelfBuf = shelfBuf;
    this.flightsOn = opts.flights ?? true;
    const nFly = manifest.slots?.length ? (manifest.flyingCount ?? 0) : 0;
    for (let i = 0; i < nFly; i++) {
      this.orbits.push({ r: 1.3 + (i % 3) * 0.45, a0: (i / nFly) * Math.PI * 2, sp: 0.32 + (i % 2) * 0.08, y: 2.3 + (i % 3) * 0.35 });
      this.flightSlot.push(-1); this.flightCycle.push(-1);
    }
    const base = { G: this.G, samp: linear, sunShadow: this.shadow, globeModel: this.globeModel, books: this.bookData };
    const globals = { G: this.G };

    this.sky = draw(gpu, { label: 'sky', shader: src.pbr, entry: { vertex: 'vs_sky', fragment: 'fs_sky' }, vertices: 3, depth: { compare: 'always', write: false }, set: globals });

    const statics = manifest.meshes.filter((m) => m.group === 'static');
    const specs = new Map(manifest.materials.map((m) => [m.name, m]));
    const blendOf = (spec: MaterialSpec) => spec.blend === 'portal' ? undefined : (spec.blend === 'additive' || spec.blend === 'fire' || spec.blend === 'steam')
      ? { color: { src: 'one' as const, dst: 'one' as const }, alpha: { src: 'zero' as const, dst: 'one' as const } }
      : (spec.blend === 'alpha' || spec.blend === 'water' || spec.alpha > 0)
        ? { color: { src: 'src-alpha' as const, dst: 'one-minus-src-alpha' as const }, alpha: { src: 'zero' as const, dst: 'one' as const } }
        : undefined;
    const cullOf = (spec: MaterialSpec) => (blendOf(spec) || /leaves|paper|rug|spinelabel|pages|letter|plaque|cards|grimoire|portalview|chalk|fire|steam|water/.test(spec.name)) ? 'none' as const : 'back' as const;
    /** One draw of a mesh range in its material: opaque ones into the opaque list, blended ones into the transparent list. */
    const meshDraw = (m: MeshRange, vertex: string, extra: Record<string, unknown> = {}, set: Record<string, unknown> = {}): Draw => {
      const spec = specs.get(m.material)!;
      const bl = blendOf(spec);
      const d = draw(gpu, {
        label: `${m.group}-${m.material}`, shader: src.pbr, entry: { vertex, fragment: 'fs_pbr' }, geometry: range(m), cull: cullOf(spec),
        depth: { compare: 'less', write: !bl }, ...(bl ? { blend: bl } : {}), ...extra,
        set: { ...base, ...matBindings(spec), ...set },
      });
      (bl ? this.transparent : this.opaque).push(d);
      return d;
    };
    for (const m of statics) meshDraw(m, 'vs_static');
    for (const m of manifest.meshes.filter((x) => x.group === 'globe')) {
      const d = draw(gpu, {
        label: 'globe', shader: src.pbr, entry: { vertex: 'vs_globe', fragment: 'fs_pbr' }, geometry: range(m), cull: 'back',
        depth: { compare: 'less', write: true }, set: { ...base, ...matBindings(specs.get(m.material)!) },
      });
      this.globeDraws.push(d); this.opaque.push(d);
    }
    for (const m of manifest.meshes.filter((x) => x.group === 'book')) {
      const d = draw(gpu, {
        label: `books-${m.material}`, shader: src.pbr, entry: { vertex: 'vs_book', fragment: 'fs_pbr' }, geometry: range(m), cull: 'none',
        instances: Math.max(1, nFly), depth: { compare: 'less', write: true }, set: { ...base, ...matBindings(specs.get(m.material)!) },
      });
      this.bookDraws.push(d); this.opaque.push(d);
    }
    (manifest.spinners ?? []).forEach((sp, k) => {
      for (const m of manifest.meshes.filter((x) => x.group === sp.group)) this.spinDraws.push(meshDraw(m, 'vs_spin', {}, { inst: [k, 0, 0, 0], spinM: this.spinMats }));
    });
    const nOrbit = manifest.orbiters?.count ?? 0;
    for (const m of manifest.meshes.filter((x) => x.group === 'orbit')) this.bookDraws.push(meshDraw(m, 'vs_orbit', { instances: Math.max(1, nOrbit) }));
    this.shelfVariants = (manifest.shelfBooks?.variants ?? []).filter((v) => v.count > 0);
    const atlas = manifest.spineAtlas ?? { cols: 1, rows: 1, cell: [1, 1] as [number, number], size: 1 };
    for (const v of this.shelfVariants) {
      for (const m of manifest.meshes.filter((x) => x.group === v.group)) {
        this.opaque.push(draw(gpu, {
          label: `${v.group}-${m.material}`, shader: src.pbr, entry: { vertex: 'vs_shelf', fragment: 'fs_pbr' }, geometry: range(m),
          cull: ['paper', 'gilt', 'spinelabel'].includes(m.material) ? 'none' : 'back', instances: v.count, depth: { compare: 'less', write: true },
          set: { ...base, shelf: shelfBuf, inst: [v.first, atlas.cols, atlas.cell[0] / atlas.size, atlas.cell[1] / atlas.size], ...matBindings(specs.get(m.material)!) },
        }));
      }
    }
    this.motes = draw(gpu, {
      label: 'motes', shader: src.pbr, entry: { vertex: 'vs_mote', fragment: 'fs_mote' }, vertices: 6, instances: 900, blend: 'additive',
      depth: { compare: 'less', write: false }, set: { G: this.G, sunShadow: this.shadow },
    });

    // shadow casters: the room in one draw, the shelf books in one, then the animated bits. Built once per
    // light/face, because each carries the matrix it projects with.
    const solidMeshes = statics.filter((m) => !blendOf(specs.get(m.material)!));       // the build orders blended materials last
    const sFirst = solidMeshes[0].firstIndex;
    const sCount = solidMeshes.reduce((n, m) => n + m.indexCount, 0);
    const casters = (vp: Float32Array, animated: boolean): Draw[] => {
      const out: Draw[] = [];
      const base = { shader: src.pbr, cull: 'none' as const, depth: { compare: 'less' as const, write: true } };
      out.push(draw(gpu, { label: 'shadow-room', ...base, entry: { vertex: 'vs_shadow', fragment: 'fs_shadow' }, geometry: geo.slice({ firstIndex: sFirst, indexCount: sCount }), set: { ...globals, casterVP: vp } }));
      for (const v of this.shelfVariants) {
        const ms = manifest.meshes.filter((x) => x.group === v.group);
        const slice = geo.slice({ firstIndex: Math.min(...ms.map((m) => m.firstIndex)), indexCount: ms.reduce((n, m) => n + m.indexCount, 0) });
        out.push(draw(gpu, { label: `shadow-${v.group}`, ...base, entry: { vertex: 'vs_shadow_shelf', fragment: 'fs_shadow' }, geometry: slice, instances: v.count, set: { ...globals, shelf: shelfBuf, casterVP: vp, inst: [v.first, 0, 0, 0] } }));
      }
      if (animated) {
        (manifest.spinners ?? []).forEach((sp, k) => {
          for (const m of manifest.meshes.filter((x) => x.group === sp.group && !blendOf(specs.get(x.material)!)))
            { const d = draw(gpu, { label: 'shadow-spin', ...base, entry: { vertex: 'vs_shadow_spin', fragment: 'fs_shadow' }, geometry: range(m), set: { ...globals, spinM: this.spinMats, casterVP: vp, inst: [k, 0, 0, 0] } }); out.push(d); this.spinShadowSet.push(d); }
        });
        for (const m of manifest.meshes.filter((x) => x.group === 'orbit' && !blendOf(specs.get(x.material)!)))
          out.push(draw(gpu, { label: 'shadow-orbit', ...base, entry: { vertex: 'vs_shadow_orbit', fragment: 'fs_shadow' }, geometry: range(m), instances: Math.max(1, nOrbit), set: { ...globals, books: this.bookData, casterVP: vp } }));
        for (const m of manifest.meshes.filter((x) => x.group === 'globe'))
          out.push(draw(gpu, { label: 'shadow-globe', ...base, entry: { vertex: 'vs_shadow_globe', fragment: 'fs_shadow' }, geometry: range(m), set: { ...globals, globeModel: this.globeModel, casterVP: vp } }));
        for (const m of manifest.meshes.filter((x) => x.group === 'book'))
          out.push(draw(gpu, { label: 'shadow-books', ...base, entry: { vertex: 'vs_shadow_book', fragment: 'fs_shadow' }, geometry: range(m), instances: Math.max(1, nFly), set: { ...globals, books: this.bookData, casterVP: vp } }));
      }
      return out;
    };
    this.shadowDraws.push(...casters(this.sunVP, true));
    for (let f = 0; f < 6; f++) {
      this.candle.push(target(gpu, { size: [1024, 1024], format: 'r8unorm', depth: 'depth32float', label: `candle-${f}` }));
      this.candlePasses.push(casters(this.candleMatrices[f], false));
    }
    const cubeSet: Record<string, Target> = {};
    this.candle.forEach((t, f) => { cubeSet[`cf${f}`] = t; });
    for (const d of [...this.opaque, ...this.transparent]) d.set(cubeSet);
    this.cubeSet = cubeSet;

    // ---- volumetric beam, bloom, composite
    this.rays = target(gpu, { size: scaled(sceneSize, 0.5), format: HDR, label: 'rays' });
    this.raysFx = effect(gpu, src.godrays, { label: 'godrays', set: { G: this.G, scene: this.scene, samp: clamp, sunShadow: this.shadow } });
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      this.down.push(target(gpu, { size: scaled(sceneSize, 1 / 2 ** (i + 1)), format: HDR, label: `bloom-down-${i}` }));
      const s = i === 0 ? this.scene : this.down[i - 1];
      this.downFx.push(effect(gpu, src.down, { label: `down-${i}`, set: { src: s, samp: clamp, params: { texel: s.texelSize, threshold: i === 0 ? 1.0 : 0, knee: 0.6 } } }));
    }
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) this.up.push(target(gpu, { size: this.down[i].size, format: HDR, label: `bloom-up-${i}` }));
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) {
      const coarse = i === BLOOM_LEVELS - 2 ? this.down[BLOOM_LEVELS - 1] : this.up[i + 1];
      this.upFx.push(effect(gpu, src.up, { label: `up-${i}`, set: { coarse, fine: this.down[i], samp: clamp, params: { texel: coarse.texelSize, radius: 1.0, pad: 0 } } }));
    }
    this.params = { exposure: opts.exposure ?? at.exposure ?? 1.35, bloom: opts.bloom ?? at.bloom ?? 0.12, vignette: 0.5, time: 0, rays: opts.rays ?? at.rays ?? 1.0, pad0: 0, pad1: 0, pad2: 0 };
    this.composite = effect(gpu, src.composite, { label: 'composite', set: { scene: this.scene, bloomTex: this.up[0], rays: this.rays, samp: clamp, params: this.params } });
  }

  /** Six 90 degree views out of the light, +x -x +y -y +z -z, matching cubeLoad's face numbering. */
  private makeCandleVPs(pos: V3, range: number): Float32Array[] {
    const dirs: [V3, V3][] = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]]];
    const proj = mat4.perspective(Math.PI / 2, 1, 0.05, range * 1.2);
    return dirs.map(([d, up]) => new Float32Array(mat4.multiply(proj, mat4.lookAt(pos, [pos[0] + d[0], pos[1] + d[1], pos[2] + d[2]], up))));
  }

  /** Orthographic view down the sun's rays over the whole room. */
  private makeSunVP(toSun: V3): Float32Array {
    const c: V3 = [0, 2.2, 0];
    const eye: V3 = [c[0] + toSun[0] * 24, c[1] + toSun[1] * 24, c[2] + toSun[2] * 24];
    const view = mat4.lookAt(eye, c, [0, 1, 0]);
    const proj = mat4.ortho(-7.2, 7.2, -7.2, 7.2, 4, 46);
    return new Float32Array(mat4.multiply(proj, view));
  }

  /** Spinning props and circling flasks: pure functions of the clock. */
  private updateProps(time: number): void {
    (this.manifest.spinners ?? []).forEach((sp, k) => {
      const m = mat4.translation([sp.pos[0], sp.pos[1] + (sp.bob ?? 0) * Math.sin(time * 0.9 + (sp.phase ?? 0)), sp.pos[2]]);
      const a = time * sp.rate;
      if (sp.axis === 'y') mat4.rotateY(m, a, m); else if (sp.axis === 'x') mat4.rotateX(m, a, m); else mat4.rotateZ(m, a, m);
      this.spinMats[k].set(m);
    });
    for (const d of this.spinDraws) d.set({ spinM: this.spinMats });
    for (const d of this.spinShadowSet) d.set({ spinM: this.spinMats });
    const o = this.manifest.orbiters;
    if (o) {
      for (let i = 0; i < o.count; i++) {
        const a = (i / o.count) * Math.PI * 2 + time * o.speed;
        const t = o.tints[i % o.tints.length];
        this.bookData[i * 3] = [o.center[0] + Math.cos(a) * o.r, o.y + Math.sin(time * 1.3 + i) * 0.14, o.center[2] + Math.sin(a) * o.r, 0];
        this.bookData[i * 3 + 1] = [-a + Math.PI / 2, Math.sin(time * 0.9 + i) * 0.4, Math.cos(time * 0.8 + i) * 0.4, 0];
        this.bookData[i * 3 + 2] = [t[0], t[1], t[2], o.scale ?? 1];
      }
      for (const d of this.bookDraws) d.set({ books: this.bookData });
    }
  }

  /** Slot for flight `i` in cycle `k`: a book from somewhere on the shelves, never one already away. */
  private chooseSlot(i: number, k: number): number {
    const slots = this.manifest.slots!;
    let idx = Math.floor((Math.sin(i * 91.7 + k * 13.37 + 1.7) * 43758.5453 % 1 + 1) % 1 * slots.length);
    for (let tries = 0; tries < slots.length; tries++) {
      if (!this.flightSlot.includes(idx) && slots[idx].row > 0) return idx;
      idx = (idx + 1) % slots.length;
    }
    return idx;
  }

  private setShelfVisible(inst: number, visible: boolean): void {
    if (visible !== this.hidden.has(inst)) return;
    const o = inst * 16;
    if (visible) { this.hidden.delete(inst); this.shelfLive[o + 4] = this.shelfData[o + 4]; this.shelfLive[o + 5] = this.shelfData[o + 5]; }
    else { this.hidden.add(inst); this.shelfLive[o + 4] = 0; this.shelfLive[o + 5] = 0; }
    this.shelfBuf.write(this.shelfLive);            // 28 KB, and only when a book leaves or returns
  }

  /** Move every flying book along its cycle; hide the shelf copy while it is away and put it back on return. */
  private updateFlights(time: number): void {
    const c = this.manifest.flyingCenter!;
    const slots = this.manifest.slots!;
    this.orbits.forEach((o, i) => {
      const start = i * (CYCLE / this.orbits.length) * 0.9;
      const row = this.bookData;
      if (!this.flightsOn || time < start) { row[i * 3 + 2] = [0, 0, 0, 0]; return; }
      const k = Math.floor((time - start) / CYCLE);
      const u = (time - start) - k * CYCLE;
      if (this.flightCycle[i] !== k) {
        if (this.flightSlot[i] >= 0) this.setShelfVisible(slots[this.flightSlot[i]].inst, true);
        this.flightSlot[i] = -1;
        this.flightSlot[i] = this.chooseSlot(i, k);
        this.flightCycle[i] = k;
      }
      const slot = slots[this.flightSlot[i]] as Slot;
      const p = flightPose(slot, o, c, u, time);
      this.setShelfVisible(slot.inst, !p.away);
      row[i * 3] = [p.pos[0], p.pos[1], p.pos[2], p.open];
      row[i * 3 + 1] = [p.yaw, p.pitch, p.roll, p.flap];
      row[i * 3 + 2] = [slot.tint[0], slot.tint[1], slot.tint[2], p.away ? 1 : 0];
    });
  }

  /** Re-fit every size-dependent target to a new output, or a new internal scale. */
  resize(out: Surface | Target, scale = this.scale): void {
    this.out = out; this.scale = scale;
    const s = scaled(out.size, scale);
    this.scene.resize(s);
    this.rays.resize(scaled(s, 0.5));
    for (let i = 0; i < BLOOM_LEVELS; i++) this.down[i].resize(scaled(s, 1 / 2 ** (i + 1)));
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) this.up[i].resize(this.down[i].size);
    // the old textures were destroyed: rebind everything that reads them
    this.raysFx.set({ scene: this.scene });
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const src = i === 0 ? this.scene : this.down[i - 1];
      this.downFx[i].set({ src, params: { texel: src.texelSize } });
    }
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) {
      const coarse = i === BLOOM_LEVELS - 2 ? this.down[BLOOM_LEVELS - 1] : this.up[i + 1];
      this.upFx[i].set({ coarse, fine: this.down[i], params: { texel: coarse.texelSize } });
    }
    this.composite.set({ scene: this.scene, bloomTex: this.up[0], rays: this.rays });
  }

  render(frame: Frame, out: Surface | Target, view: View, time: number): void {
    const [sw, sh] = this.scene.size;
    const proj = mat4.perspective(((view.fov ?? 62) * Math.PI) / 180, sw / sh, 0.05, 80);
    const vp = mat4.multiply(proj, mat4.lookAt(view.pos, view.target, [0, 1, 0]));
    this.G.set({ viewProj: vp, invViewProj: mat4.invert(vp), cam: [...view.pos, time] });

    const g = this.manifest.globe;
    if (g) mat4.rotateY(mat4.rotateZ(mat4.translation(g.pos), g.tilt), time * g.spin, this.globeModel);
    this.updateFlights(time);
    this.updateProps(time);
    for (const d of this.globeDraws) d.set({ globeModel: this.globeModel });
    for (const d of this.bookDraws) d.set({ books: this.bookData });
    this.params.time = time;
    this.composite.set({ params: this.params });

    if (this.candleDirty) {
      // the candelabra and the room around it do not move, so its shadow cube is drawn once
      for (let f = 0; f < 6; f++) frame.pass({ target: this.candle[f], clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => { for (const d of this.candlePasses[f]) pass.draw(d); });
      this.candleDirty = false;
    }
    frame.pass({ target: this.shadow, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => { for (const d of this.shadowDraws) pass.draw(d); });
    frame.pass({ target: this.scene, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
      pass.draw(this.sky);
      for (const d of this.opaque) pass.draw(d);
      for (const d of this.transparent) pass.draw(d);
      pass.draw(this.motes);
    });
    frame.pass(this.rays, this.raysFx);
    for (let i = 0; i < BLOOM_LEVELS; i++) frame.pass(this.down[i], this.downFx[i]);
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) frame.pass(this.up[i], this.upFx[i]);
    frame.pass(out, this.composite);
  }
}
