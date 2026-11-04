import * as THREE from 'three';

/* A reader for the glTF binaries tools/blender writes, and nothing more:
   named meshes, one primitive each, with POSITION and optional NORMAL,
   TEXCOORD_0 and COLOR_0, plain or quantized (KHR_mesh_quantization: the
   node's scale and translation place the positions), and indices — no
   materials, textures or skins. Anything else in a file is ignored rather than guessed at.
   Returns the meshes by name, with plain BufferGeometry the caller instances. */

const COMPONENT: Record<number, { array: any; bytes: number; max: number }> = {
  5120: { array: Int8Array, bytes: 1, max: 127 },
  5121: { array: Uint8Array, bytes: 1, max: 255 },
  5122: { array: Int16Array, bytes: 2, max: 32767 },
  5123: { array: Uint16Array, bytes: 2, max: 65535 },
  5125: { array: Uint32Array, bytes: 4, max: 1 },
  5126: { array: Float32Array, bytes: 4, max: 1 },
};
const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export async function loadGlb(url: string): Promise<Record<string, THREE.Mesh>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`${url} is not a glb`);
  let json: any = null;
  let bin: ArrayBuffer | null = null;
  for (let o = 12; o < buf.byteLength;) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    const body = buf.slice(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    o += 8 + len;
  }
  if (!json || !bin) throw new Error(`${url}: missing chunks`);

  const accessor = (i: number) => {
    const a = json.accessors[i];
    const v = json.bufferViews[a.bufferView];
    const c = COMPONENT[a.componentType];
    const n = SIZE[a.type];
    const stride = v.byteStride || c.bytes * n;
    const start = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (stride === c.bytes * n) {
      return { data: new c.array(bin!, start, a.count * n), n, c, normalized: !!a.normalized };
    }
    // interleaved: copy it out tightly
    const out = new c.array(a.count * n);
    const src = new DataView(bin!);
    const get = { 1: 'getUint8', 2: 'getUint16', 4: a.componentType === 5126 ? 'getFloat32' : 'getUint32' }[c.bytes] as 'getUint8';
    for (let k = 0; k < a.count; k++) for (let j = 0; j < n; j++) out[k * n + j] = (src as any)[get](start + k * stride + j * c.bytes, true);
    return { data: out, n, c, normalized: !!a.normalized };
  };

  // Any attribute as plain floats, dequantized if it was stored normalized.
  const floats = (i: number) => {
    const a = accessor(i);
    if (a.data instanceof Float32Array) return a;
    const out = new Float32Array(a.data.length);
    const k = a.normalized ? 1 / a.c.max : 1;
    for (let j = 0; j < out.length; j++) out[j] = Math.max(-1, a.data[j] * k);
    return { ...a, data: out };
  };

  const meshes: Record<string, THREE.Mesh> = {};
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) continue;
    const prim = json.meshes[node.mesh].primitives[0];
    const geo = new THREE.BufferGeometry();
    /* Positions may be quantized (KHR_mesh_quantization): stored as
       normalized 16-bit and placed by the node's scale and translation. */
    const pos = floats(prim.attributes.POSITION).data as Float32Array;
    const sc = node.scale || [1, 1, 1], tr = node.translation || [0, 0, 0];
    for (let j = 0; j < pos.length; j += 3) {
      pos[j] = pos[j] * sc[0] + tr[0]; pos[j + 1] = pos[j + 1] * sc[1] + tr[1]; pos[j + 2] = pos[j + 2] * sc[2] + tr[2];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (prim.attributes.NORMAL !== undefined) {
      geo.setAttribute('normal', new THREE.BufferAttribute(floats(prim.attributes.NORMAL).data, 3));
    }
    if (prim.attributes.TEXCOORD_0 !== undefined) {
      geo.setAttribute('uv', new THREE.BufferAttribute(floats(prim.attributes.TEXCOORD_0).data, 2));
    }
    if (prim.attributes.COLOR_0 !== undefined) {
      const col = floats(prim.attributes.COLOR_0);
      // keep RGB only; three wants itemSize 3 unless asked for alpha
      const rgb = new Float32Array((col.data.length / col.n) * 3);
      for (let v = 0, w = 0; v < col.data.length; v += col.n, w += 3) {
        rgb[w] = col.data[v]; rgb[w + 1] = col.data[v + 1]; rgb[w + 2] = col.data[v + 2];
      }
      geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    }
    if (prim.indices !== undefined) {
      const idx = accessor(prim.indices);
      geo.setIndex(new THREE.BufferAttribute(idx.data, 1));
    }
    const mesh = new THREE.Mesh(geo);
    mesh.name = node.name || json.meshes[node.mesh].name;
    meshes[mesh.name] = mesh;
  }
  return meshes;
}
