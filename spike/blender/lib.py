"""
Shared machinery for assembling a tower floor in Blender for the vgpu renderer: materials, batches, primitives
(bevelled boxes, lathes, sweeps, tubes, typeset quads), Poly Haven imports, baked ambient occlusion and the
binary writer. A floor is a module `floor_<name>.py` with build() and write(ctx); model.py runs one.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python spike/blender/model.py -- <out dir> --floor library

Needs spike/assets-src (node spike/tools/fetch-assets.mjs). Afterwards run
spike/tools/pack-assets.py, which turns the texture sources named in the manifest into WebP.

What it builds
  * the architecture (plank floor, panelled wall with a real window opening, shelving, desk, ladder,
    lectern, rug, globe) from bevelled solids, box-projected UVs and Poly Haven PBR texture sets;
  * about six hundred books, each a spine board, two covers, a paper block, raised bands and a label,
    in a handful of leathers and cloths;
  * Poly Haven scans (armchair, console, clock, bust, vases, candelabra, plant, chest, stool, card
    drawers, an encyclopedia set), decimated to a triangle budget;
  * baked ambient occlusion on every static vertex, by ray casting.

Built Y-up in the frame the site already uses (x = r sin a, z = r cos a); Blender does not mind.

Vertex layout, 28 bytes:
  p  unorm16x4  position inside manifest.quant
  n  snorm8x4   normal, smoothed across angles under the material's limit
  t  float32x2  uv
  c  unorm8x4   rgb tint, a = emissive amount
  d  unorm8x4   x = baked ambient occlusion, y = hinge side (127 + 127 * side), z unused,
                w = how much of the tint replaces the texture colour (0 none, 255 all)
"""
import json, math, os, random, sys
import bpy, bmesh
import numpy as np
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
FLOOR = argv[argv.index("--floor") + 1] if "--floor" in argv else "library"
os.makedirs(OUT, exist_ok=True)
SRC = os.path.abspath("spike/assets-src")

R, WH = 5.4, 5.3
rng = random.Random(20260902)          # layout choices, as in library.ts
urng = random.Random(7)                # texture offsets: never disturbs the layout above
rnd = rng.random
pick = lambda a: a[int(rnd() * len(a)) % len(a)]
RAD = math.radians


def polar(ang, rad, y=0.0):
    return (rad * math.sin(RAD(ang)), y, rad * math.cos(RAD(ang)))


# ----------------------------------------------------------------------------- materials
MATS = {}


def material(name, tex=None, tile=1.5, rot=False, tint=(1, 1, 1), rough=None, metal=None, nscale=1.0,
             emissive=0.0, size=1024, gen=None, alpha=0.0, smooth=40.0, blend=None, centered=False):
    """A material the renderer will bind. `tex` names a folder in assets-src/textures (diff/nor/arm);
    `gen` names a texture pack-assets.py paints itself; `rough` / `metal` override the map when set."""
    MATS[name] = dict(name=name, tex=tex, tile=tile, rot=rot, tint=list(tint), rough=rough, metal=metal,
                      nscale=nscale, emissive=emissive, size=size, gen=gen, alpha=alpha, smooth=smooth, blend=blend, centered=centered, files={})
    return MATS[name]


material("floor", "wood_cabinet_worn_long", tile=1.4, rot=True, tint=(0.82, 0.74, 0.66))
material("wall", "dark_paneled_wood", tile=1.1, tint=(0.9, 0.85, 0.8))
material("shelf", "dark_wood", tile=1.6, tint=(0.9, 0.8, 0.75))
material("ebony", "lacquered_cherry_wood", tile=1.8, tint=(0.9, 0.9, 0.9))
material("desk", "wood_table_worn", tile=1.6)
material("stone", "monastery_stone_floor", tile=2.4, tint=(0.8, 0.78, 0.76))
material("stonewall", "old_stone_wall", tile=1.4, tint=(0.85, 0.82, 0.78))
material("leather", "brown_leather", tile=0.5, rough=None, size=512)
material("velvet", "velour_velvet", tile=0.6, tint=(0.9, 0.9, 0.9), size=512)
material("paper", gen="paper", tile=0.3, rough=0.85, metal=0.0, size=512)
material("spinelabel", gen="spinelabel", rough=0.8, metal=0.0, size=4096, tint=(0.66, 0.61, 0.52))
material("pages", gen="pages", rough=0.85, metal=0.0, size=2048)
material("letter", gen="letter", rough=0.88, metal=0.0, size=1024)
material("plaque", gen="plaque", size=1024)
material("cards", gen="cards", rough=0.7, metal=0.0, size=1024, tint=(0.9, 0.87, 0.8))
material("grimoire", gen="grimoire", size=1024)
material("glass", None, tint=(0.8, 0.92, 0.95), rough=0.05, metal=0.0, alpha=0.16, blend="alpha")
material("liquid", None, tint=(1, 1, 1), rough=0.25, metal=0.0, emissive=0.32)
material("cork", None, tint=(0.5, 0.36, 0.22), rough=0.92, metal=0.0)
material("rug", gen="rug", tile=5.0, rough=0.95, metal=0.0, size=1024)["centered"] = True
material("globe", gen="globe", tile=1.0, rough=0.35, metal=0.0, size=1024)
material("gilt", None, tint=(0.78, 0.58, 0.24), rough=0.42, metal=1.0)
material("brass", None, tint=(0.82, 0.62, 0.26), rough=0.38, metal=1.0)
material("iron", None, tint=(0.18, 0.17, 0.17), rough=0.55, metal=0.9)
material("candle", None, tint=(0.93, 0.88, 0.76), rough=0.7, metal=0.0)
material("flame", None, tint=(1.0, 0.72, 0.28), emissive=1.0, rough=1.0, metal=0.0)
material("wax", None, tint=(0.5, 0.04, 0.05), rough=0.35, metal=0.0)
material("ink", None, tint=(0.03, 0.03, 0.04), rough=0.15, metal=0.0)
material("rune", None, tint=(0.5, 0.9, 1.0), emissive=1.0, rough=1.0, metal=0.0)
material("soil", None, tint=(0.09, 0.06, 0.04), rough=1.0, metal=0.0)
material("shaft", None, tint=(1, 0.86, 0.65), rough=1, metal=0)

# Leathers and cloths for the books: the leather texture supplies the grain, the tint the colour.
BOOK_TINTS = [(0.50, 0.12, 0.10), (0.12, 0.30, 0.18), (0.10, 0.17, 0.36), (0.55, 0.38, 0.12), (0.30, 0.17, 0.09),
              (0.08, 0.08, 0.09), (0.42, 0.10, 0.28), (0.78, 0.70, 0.52), (0.17, 0.34, 0.36), (0.40, 0.22, 0.12)]


# ----------------------------------------------------------------------------- batches
class Batch:
    def __init__(self, group, mat, ao):
        self.group, self.mat, self.ao = group, mat, ao
        self.P, self.N, self.T, self.C, self.D, self.I = [], [], [], [], [], []
        self.n = 0


BATCHES = {}
STACK = [Matrix.Identity(4)]
GROUP = ["static"]


def batch(mat, ao=None):
    g = GROUP[-1]
    if (g, mat) not in BATCHES:
        BATCHES[(g, mat)] = Batch(g, mat, g == "static" if ao is None else ao)
    return BATCHES[(g, mat)]


def frame(pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, scale=1.0):
    return (Matrix.Translation(Vector(pos)) @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X")
            @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Scale(scale, 4))


class at:
    def __init__(self, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, scale=1.0):
        self.m = frame(pos, ry, rx, rz, scale)

    def __enter__(self):
        STACK.append(STACK[-1] @ self.m)

    def __exit__(self, *a):
        STACK.pop()


class group:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        GROUP.append(self.name)

    def __exit__(self, *a):
        GROUP.pop()


def corner_normals(bm, cosA):
    """Per-corner normals: area-weighted average of the faces around a vertex within `cosA` of this one."""
    out = {}
    for f in bm.faces:
        fn = f.normal
        for lp in f.loops:
            acc = Vector((0, 0, 0))
            for f2 in lp.vert.link_faces:
                if f2.normal.dot(fn) >= cosA:
                    acc += f2.normal * f2.calc_area()
            if acc.length < 1e-12:
                acc = fn.copy()
            out[lp.index] = acc.normalized()
    return out


def box_uv(co, n, ext, spec, off):
    """Box projection in the primitive's own frame, with u along its longest side so a plank's grain
    runs along the plank."""
    ax = max(range(3), key=lambda i: abs(n[i]))
    others = [i for i in range(3) if i != ax]
    others.sort(key=lambda i: -ext[i])
    u, v = co[others[0]], co[others[1]]
    if spec["rot"]:
        u, v = v, u
    t = spec["tile"]
    if spec.get("centered"):
        return (u / t + 0.5, v / t + 0.5)
    return (u / t + off[0], v / t + off[1])


def emit(bm, M, mat, emissive=0.0, tint=None, tint_mode=0, side=0, scale_uv=True, smooth=None, faces=None, uvlayer=None,
         matof=None, flag=0):
    """Triangulate and append a primitive. `tint` (rgb 0..1) multiplies the texture, or replaces its colour
    in proportion to `tint_mode`. Imported scans pass `uvlayer` and `matof` (face -> material name)."""
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()                        # a reversed face keeps its old normal until told otherwise
    bm.faces.ensure_lookup_table()
    bm.verts.index_update()
    spec0 = MATS[mat] if mat else None
    cosA = math.cos(RAD(smooth if smooth is not None else (spec0["smooth"] if spec0 else 40.0)))
    Mn = M.to_3x3()
    ext = [max(v.co[i] for v in bm.verts) - min(v.co[i] for v in bm.verts) for i in range(3)] if bm.verts else [1, 1, 1]
    off = (urng.random() * 7.0, urng.random() * 7.0)
    cache = {}

    def cn(f):
        # normals of this face's three corners
        res = []
        for lp in f.loops:
            acc = Vector((0, 0, 0))
            for f2 in lp.vert.link_faces:
                if f2.normal.dot(f.normal) >= cosA:
                    acc += f2.normal * f2.calc_area()
            if acc.length < 1e-12:
                acc = f.normal.copy()
            res.append(acc.normalized())
        return res

    per = {}
    for f in bm.faces:
        name = matof(f) if matof else mat
        if name is None:
            continue
        spec = MATS[name]
        ns = cn(f)
        rec = per.setdefault(name, ([], [], [], []))
        for lp, n in zip(f.loops, ns):
            co = lp.vert.co
            rec[0].append(tuple(M @ co))
            rec[1].append(tuple((Mn @ n).normalized()))
            if uvlayer is not None:
                u = lp[uvlayer].uv
                rec[2].append((u.x, 1.0 - u.y))
            else:
                rec[2].append(box_uv(co, f.normal, ext, spec, off))
        rec[3].append(None)
    for name, (P, N, T, cnt) in per.items():
        b = batch(name)
        k = len(P) // 3
        I = np.arange(len(P), dtype=np.int64).reshape(k, 3) + b.n
        spec = MATS[name]
        tnt = tint if tint is not None else (1, 1, 1)
        em = emissive if emissive else spec["emissive"]
        C = np.tile(np.array([int(min(1, tnt[0]) * 255), int(min(1, tnt[1]) * 255), int(min(1, tnt[2]) * 255), int(min(1, em) * 255)], np.uint8), (len(P), 1))
        D = np.tile(np.array([255, 127 + int(side * 127), flag, int(tint_mode * 255)], np.uint8), (len(P), 1))
        b.P.append(np.array(P, np.float32)); b.N.append(np.array(N, np.float32)); b.T.append(np.array(T, np.float32))
        b.C.append(C); b.D.append(D); b.I.append(I)
        b.n += len(P)
    bm.free()


def split_long(bm, L, rounds=5, top_only=False):
    bm.faces.ensure_lookup_table()
    for _ in range(rounds):
        es = [e for e in bm.edges if e.calc_length() > L and (not top_only or any(f.normal.y > 0.9 for f in e.link_faces))]
        if not es:
            return
        bmesh.ops.subdivide_edges(bm, edges=es, cuts=1, use_grid_fill=True)


def box(w, h, d, pos=(0, 0, 0), ry=0.0, mat="shelf", bevel=0.012, segs=1, rx=0.0, rz=0.0, L=0.45, top_only=False, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
    b = min(bevel, min(w, h, d) * 0.4)
    if b > 1e-4:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=b, offset_type="OFFSET", segments=segs, profile=0.5, affect="EDGES")
    split_long(bm, L, top_only=top_only)
    emit(bm, STACK[-1] @ frame(pos, ry, rx, rz), mat, **kw)


def arcbox(w, h, d, ang, rad, y, ry_extra=0.0, **kw):
    a = RAD(ang)
    box(w, h, d, (rad * math.sin(a), y, rad * math.cos(a)), a + ry_extra, **kw)


def quad_uv(w, h, pos, mat, uv=(0.0, 0.0, 1.0, 1.0), up=False, flag=0, ry=0.0, cell=0.25, **kw):
    """A flat sheet that carries type. Standing (default) it faces local -z, as a spine or a plaque does toward the room;
    `up` lays it facing +y, as a letter on a desk does. `uv` is the rectangle of the texture it shows, in image
    coordinates, laid out for a reader looking at it: u runs to the reader's right, v down the page. Sheets bigger than
    `cell` are cut into a grid so baked occlusion has vertices to land on."""
    bm = bmesh.new()
    nx, ny = max(1, math.ceil(w / cell)), max(1, math.ceil(h / cell))
    verts = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x, y = -w / 2 + w * i / nx, -h / 2 + h * j / ny
            row.append(bm.verts.new((x, 0, y) if up else (x, y, 0)))
        verts.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    f0 = bm.faces[0]
    if (up and f0.normal.y < 0) or (not up and f0.normal.z > 0):
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    uvl = bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = uv
    for f in bm.faces:
        for lp in f.loops:
            c = lp.vert.co
            u = u0 + (0.5 - c.x / w) * (u1 - u0)
            v = v0 + (0.5 - (c.z if up else c.y) / h) * (v1 - v0)
            lp[uvl].uv = (u, 1.0 - v)
    emit(bm, STACK[-1] @ frame(pos, ry), mat, uvlayer=uvl, flag=flag, smooth=89.0, **kw)


def lathe(profile, seg, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, mat="shelf", bevel=0.0, segs=1, L=0.5, **kw):
    """Surface of revolution about local +Y from (r, y) pairs, bottom to top."""
    bm = bmesh.new()
    rings = []
    for r, y in profile:
        if r < 1e-5:
            rings.append([bm.verts.new((0, y, 0))])
        else:
            rings.append([bm.verts.new((r * math.sin(k / seg * 2 * math.pi), y, r * math.cos(k / seg * 2 * math.pi)))
                          for k in range(seg)])
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(seg):
            k2 = (k + 1) % seg
            if len(A) == 1:
                bm.faces.new((A[0], B[k2], B[k]))
            elif len(B) == 1:
                bm.faces.new((A[k], A[k2], B[0]))
            else:
                bm.faces.new((A[k], A[k2], B[k2], B[k]))
    closed_loop = tuple(profile[0]) == tuple(profile[-1])
    if not closed_loop:
        if len(rings[0]) > 1:
            bm.faces.new(rings[0][::-1])
        if len(rings[-1]) > 1:
            bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, offset_type="OFFSET", segments=segs, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    split_long(bm, L)
    emit(bm, STACK[-1] @ frame(pos, ry, rx, rz), mat, **kw)


def cyl(rt, rb, h, seg, pos=(0, 0, 0), mat="shelf", bevel=0.01, **kw):
    lathe([(0, -h / 2), (rb, -h / 2), (rt, h / 2), (0, h / 2)], seg, pos=pos, mat=mat, bevel=bevel, **kw)


def quad(w, h, pos, mat, **kw):
    """A flat label facing local -z."""
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-w / 2, -h / 2, 0), (-w / 2, h / 2, 0), (w / 2, h / 2, 0), (w / 2, -h / 2, 0))]
    bm.faces.new(vs)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.z > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    emit(bm, STACK[-1] @ frame(pos), mat, **kw)


def torus(Rr, rr, pos=(0, 0, 0), ry=0.0, rx=0.0, seg=40, tseg=10, mat="brass", **kw):
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = i / seg * 2 * math.pi
        ring = []
        for j in range(tseg):
            b = j / tseg * 2 * math.pi
            rad = Rr + rr * math.cos(b)
            ring.append(bm.verts.new((rad * math.cos(a), rad * math.sin(a), rr * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        for j in range(tseg):
            bm.faces.new((rings[i][j], rings[(i + 1) % seg][j], rings[(i + 1) % seg][(j + 1) % tseg], rings[i][(j + 1) % tseg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    emit(bm, STACK[-1] @ frame(pos, ry, rx), mat, **kw)


def sphere_uv(r, pos, mat, usegs=48, vsegs=32, **kw):
    """UV sphere, poles on local Y, equirectangular UVs so a map wraps it."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=usegs, v_segments=vsegs, radius=r)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, "X"), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            p = lp.vert.co
            lp[uvl].uv = (0.5 + math.atan2(p.x, p.z) / (2 * math.pi), 0.5 + math.asin(max(-1, min(1, p.y / r))) / math.pi)
    # a seam: faces that wrap get their u corrected
    for f in bm.faces:
        us = [lp[uvl].uv.x for lp in f.loops]
        if max(us) - min(us) > 0.5:
            for lp in f.loops:
                if lp[uvl].uv.x < 0.5:
                    lp[uvl].uv.x += 1.0
    emit(bm, STACK[-1] @ frame(pos), mat, uvlayer=uvl, smooth=89.0, **kw)


def blade(base, direction, length, width, lift, droop, mat, tint, segs=5, **kw):
    bm = bmesh.new()
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 1, 0))).normalized()
    cols = []
    for i in range(segs + 1):
        t = i / segs
        c = Vector(base) + d * (t * length) + Vector((0, 1, 0)) * (lift * length * t - droop * length * t * t)
        w = width * 0.5 * math.sin(math.pi * min(1.0, t ** 0.7 * 0.97 + 0.03))
        cols.append((bm.verts.new(c - side * w), bm.verts.new(c + side * w)))
    for i in range(segs):
        (a0, a1), (b0, b1) = cols[i], cols[i + 1]
        bm.faces.new((a0, a1, b1, b0))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.y < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    emit(bm, STACK[-1], mat, tint=tint, **kw)


# ----------------------------------------------------------------------------- imported scans
C_ZUP_TO_YUP = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
SKIP = ("glass", "pebbles")
IMPORTED = {}


def import_model(name, tris, keep=None, per_object=False, flame_light=False):
    """Import a Poly Haven glTF, drop what the room does not want, decimate to a budget and return one record per
    object: its bmesh in Y-up with the base centred on the origin, and a face -> material function."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "models", name, f"{name}.gltf"))
    obs = [o for o in bpy.context.scene.objects if o.type == "MESH" and not any(s in o.name for s in SKIP)
           and (keep is None or any(k in o.name for k in keep))]
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
    records = []
    for o in obs:
        ratio = min(1.0, tris / max(total, 1))
        if ratio < 0.999:
            m = o.modifiers.new("dec", "DECIMATE")
            m.ratio = max(0.005, ratio)
            m.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for o in obs:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.transform(bm, matrix=C_ZUP_TO_YUP @ o.matrix_world, verts=bm.verts)
        names = []
        for slot in o.material_slots:
            names.append(register_import(slot.material, name))
        records.append((o.name, bm, names))
        bpy.data.meshes.remove(me)
    return records


def register_import(bmat, model):
    """Turn a Blender material from a glTF into an entry in MATS, finding its texture files on disk."""
    if bmat is None:
        return "iron"
    n = bmat.name
    if "flame" in n:
        return "flame"
    if n in MATS:
        return n
    files = {}
    if bmat.use_nodes:
        for node in bmat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                fp = bpy.path.abspath(node.image.filepath)
                base = os.path.basename(fp)
                rel = os.path.relpath(fp, SRC)
                if "_diff" in base:
                    files["diff"] = rel
                elif "_nor_gl" in base:
                    files["nor"] = rel
                elif "_arm" in base:
                    files["arm"] = rel
                elif "_rough" in base:
                    files["rough"] = rel
    small = any(k in model for k in ("vase", "clock", "bust", "candle", "Lantern", "stool", "book", "plant"))
    spec = material(n, None, size=512 if small else 1024, smooth=55.0)
    spec["files"] = files
    return n


def place(records, pos=(0, 0, 0), ry=0.0, scale=1.0, per_object_base=False, tint=None, tint_mode=0, recenter=True,
          matmap=None):
    """Add imported objects to the scene: base centred (once for the whole set, or per object), then placed."""
    allv = [v.co.copy() for _, bm, _ in records for v in bm.verts]
    if not allv:
        return
    mn = Vector((min(v[i] for v in allv) for i in range(3)))
    mx = Vector((max(v[i] for v in allv) for i in range(3)))
    base = Vector(((mn.x + mx.x) / 2, mn.y, (mn.z + mx.z) / 2)) if recenter else Vector((0, 0, 0))
    for oname, bm, names in records:
        if per_object_base:
            vs = [v.co.copy() for v in bm.verts]
            lo = Vector((min(v[i] for v in vs) for i in range(3)))
            hi = Vector((max(v[i] for v in vs) for i in range(3)))
            b = Vector(((lo.x + hi.x) / 2, lo.y, (lo.z + hi.z) / 2))
        else:
            b = base
        bmesh.ops.translate(bm, vec=-b, verts=bm.verts)
        uvl = bm.loops.layers.uv.active
        if matmap:
            names = [matmap.get(n, n) for n in names]
        emit(bm, STACK[-1] @ frame(pos, ry, scale=scale), None, uvlayer=uvl,
             matof=lambda f, names=names: (names[f.material_index] if f.material_index < len(names) else names[0]),
             tint=tint, tint_mode=tint_mode, smooth=55.0)


# ----------------------------------------------------------------------------- shape helpers
def sweep_arc(profile, a0, a1, rad, y, mat, step=2.0, **kw):
    """A moulding: the closed (dr, dy) profile swept round the tower axis from a0 to a1 degrees at radius `rad`,
    base height `y`. This is what makes a cornice, a skirting, a shelf nosing or a brass rail."""
    steps = max(2, int(abs(a1 - a0) / step))
    bm = bmesh.new()
    rings = []
    for i in range(steps + 1):
        a = RAD(a0 + (a1 - a0) * i / steps)
        rings.append([bm.verts.new(((rad + dr) * math.sin(a), y + dy, (rad + dr) * math.cos(a))) for dr, dy in profile])
    n = len(profile)
    for i in range(steps):
        for j in range(n):
            j2 = (j + 1) % n
            bm.faces.new((rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]))
    if abs(a1 - a0) < 359:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    emit(bm, STACK[-1], mat, **kw)


def extrude_x(profile, length, pos, mat, ry=0.0, **kw):
    """A straight moulding along local x: the closed (z, y) profile extruded `length`, centred at `pos`."""
    bm = bmesh.new()
    a = [bm.verts.new((-length / 2, y, z)) for z, y in profile]
    b = [bm.verts.new((length / 2, y, z)) for z, y in profile]
    n = len(profile)
    for j in range(n):
        j2 = (j + 1) % n
        bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bm.faces.new(a[::-1]); bm.faces.new(b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    emit(bm, STACK[-1] @ frame(pos, ry), mat, **kw)


def tube(path, radii, seg=10, mat="brass", closed_ends=True, **kw):
    """A tube of varying radius along a polyline: cabriole legs, sconce arms, ring bars."""
    pts = [Vector(p) for p in path]
    bm = bmesh.new()
    rings = []
    up = Vector((0, 1, 0))
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = t.cross(up if abs(t.y) < 0.95 else Vector((1, 0, 0))).normalized()
        v = t.cross(u).normalized()
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        rings.append([bm.verts.new(p + (u * math.cos(k / seg * 2 * math.pi) + v * math.sin(k / seg * 2 * math.pi)) * r) for k in range(seg)])
    for i in range(len(pts) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    if closed_ends:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    emit(bm, STACK[-1], mat, smooth=60.0, **kw)


def bezier(p0, p1, p2, p3, n=12):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
        out.append(tuple(a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k] for k in range(3)))
    return out


def subsurf_box(w, h, d, pos, mat, levels=2, ry=0.0, rx=0.0, rz=0.0, bevel=0.03, **kw):
    """A pillow: a bevelled box put through Catmull-Clark: cushions, rolled arms, bolsters."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, offset_type="OFFSET", segments=1, profile=0.5, affect="EDGES")
    me = bpy.data.meshes.new("s")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("s", me)
    bpy.context.scene.collection.objects.link(ob)
    md = ob.modifiers.new("ss", "SUBSURF"); md.levels = levels; md.subdivision_type = "CATMULL_CLARK"
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me2 = bpy.data.meshes.new_from_object(ev)
    bm2 = bmesh.new(); bm2.from_mesh(me2)
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me2); bpy.data.meshes.remove(me)
    emit(bm2, STACK[-1] @ frame(pos, ry, rx, rz), mat, smooth=60.0, **kw)


def page_stack(width, depth, t_edge, t_spine, side, mat="pages", nx=14, nz=6, **kw):
    """The pages of one half of an open book: a block whose top dips toward the spine and rounds over toward the
    fore-edge, carrying a typeset page. `side` -1 / +1 puts it left / right of the spine at x = 0 (model space);
    a reader standing on the -z side sees +x on their left, so the +x half shows the left page of the spread."""
    bm = bmesh.new()
    top = [[None] * (nz + 1) for _ in range(nx + 1)]
    bot = [[None] * (nz + 1) for _ in range(nx + 1)]
    for i in range(nx + 1):
        u = i / nx                               # 0 at spine, 1 at fore-edge
        x = side * u * width
        h = t_edge + (t_spine - t_edge) * (1 - u) ** 2.2 + 0.004 * math.sin(u * math.pi)
        for k in range(nz + 1):
            z = (k / nz - 0.5) * depth
            top[i][k] = bm.verts.new((x, h * (0.96 + 0.04 * math.cos((k / nz - 0.5) * math.pi)), z))
            bot[i][k] = bm.verts.new((x, 0.0, z))
    for i in range(nx):
        for k in range(nz):
            bm.faces.new((top[i][k], top[i + 1][k], top[i + 1][k + 1], top[i][k + 1]))
            bm.faces.new((bot[i][k + 1], bot[i + 1][k + 1], bot[i + 1][k], bot[i][k]))
    for i in range(nx):
        bm.faces.new((top[i][0], bot[i][0], bot[i + 1][0], top[i + 1][0]))
        bm.faces.new((top[i + 1][nz], bot[i + 1][nz], bot[i][nz], top[i][nz]))
    for k in range(nz):
        bm.faces.new((top[nx][k], bot[nx][k], bot[nx][k + 1], top[nx][k + 1]))
        bm.faces.new((top[0][k + 1], bot[0][k + 1], bot[0][k], top[0][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            c = lp.vert.co
            us = abs(c.x) / width
            u = 0.5 - 0.5 * us if side > 0 else 0.5 + 0.5 * us
            lp[uvl].uv = (u, 1.0 - (0.5 - c.z / depth))
    emit(bm, STACK[-1], mat, uvlayer=uvl, smooth=50.0, **kw)


def leaf(width, depth, lift, side=1, mat="pages", nx=10, nz=3, **kw):
    """One turning page, curling up and over from the spine, carrying the same typeset sheet."""
    bm = bmesh.new()
    g = [[None] * (nz + 1) for _ in range(nx + 1)]
    uvs = {}
    for i in range(nx + 1):
        u = i / nx
        ang = lift * (1 - 0.5 * u)
        x = side * width * u * math.cos(ang) * (1 - 0.25 * u)
        y = width * u * math.sin(ang) + 0.012 * math.sin(u * math.pi)
        for k in range(nz + 1):
            g[i][k] = bm.verts.new((x, y, (k / nz - 0.5) * depth))
            uvs[g[i][k]] = ((0.5 - 0.5 * u) if side > 0 else (0.5 + 0.5 * u), 0.5 - ((k / nz - 0.5) * depth) / depth)
    for i in range(nx):
        for k in range(nz):
            bm.faces.new((g[i][k], g[i + 1][k], g[i + 1][k + 1], g[i][k + 1]))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.y < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            u, v = uvs[lp.vert]
            lp[uvl].uv = (u, 1.0 - v)
    emit(bm, STACK[-1], mat, uvlayer=uvl, smooth=60.0, **kw)


def open_book(pos, ry, w, d, tint):
    """An open tome: two boards, two curved page stacks, two or three leaves mid-turn, a ribbon."""
    with at(pos, ry=ry):
        box(w * 2 + 0.03, 0.012, d + 0.03, (0, 0.006, 0), mat="leather", tint=tint, tint_mode=0.9, bevel=0.004)
        with at((0, 0.012, 0)):
            page_stack(w, d - 0.02, 0.014, 0.034, -1)
            page_stack(w, d - 0.02, 0.014, 0.034, 1)
            for lift, s_ in ((0.5, 1), (0.95, 1), (0.35, -1)):
                with at((0, 0.032, 0)):
                    leaf(w * 0.96, d - 0.03, lift, side=s_)
            box(0.006, 0.002, 0.18, (0.02, 0.036, d / 2 + 0.07), mat="paper", tint=(0.7, 0.1, 0.12), bevel=0.0, rx=0.0)



def shaft_model(frm, to, r1, r2, seg=16):
    f, t = Vector(frm), Vector(to)
    ax = t - f
    ln = ax.length
    ax.normalize()
    u = ax.cross(Vector((0, 1, 0))).normalized()
    v = ax.cross(u).normalized()
    bm = bmesh.new()
    rings = []
    for i in range(2):
        r = (r1, r2)[i]
        c = f + ax * (ln * i)
        rings.append([bm.verts.new(c + (u * math.cos(k / seg * 2 * math.pi) + v * math.sin(k / seg * 2 * math.pi)) * r) for k in range(seg)])
    for k in range(seg):
        bm.faces.new((rings[0][k], rings[0][(k + 1) % seg], rings[1][(k + 1) % seg], rings[1][k]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    with group("shaft"):
        b = batch("shaft", ao=False)
        P, I = [], []
        for f_ in bm.faces:
            for v_ in f_.verts:
                P.append(tuple(v_.co))
            k = len(P)
            I.append((k - 3, k - 2, k - 1))
        P = np.array(P, np.float32)
        tpar = np.clip(((P - np.array(frm, np.float32)) @ np.array(tuple(ax), np.float32)) / ln, 0, 1)
        on_axis = np.array(frm, np.float32) + np.outer(tpar * ln, np.array(tuple(ax), np.float32))
        rad = P - on_axis
        rad /= np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
        b.P.append(P); b.N.append(rad.astype(np.float32)); b.T.append(np.zeros((len(P), 2), np.float32))
        b.C.append(np.tile(np.array([255, 220, 166, 0], np.uint8), (len(P), 1)))
        D = np.zeros((len(P), 4), np.uint8)
        D[:, 0] = (tpar * 255).astype(np.uint8)
        b.D.append(D)
        b.I.append(np.array(I, np.int64) + b.n)
        b.n += len(P)
    bm.free()



def ao_bake(P, N, tree, nrays=32, maxd=1.2):
    dirs = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(nrays):
        t = (i + 0.5) / nrays
        r = math.sqrt(t)
        a = i * ga
        dirs.append((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - t))))
    out = np.ones(len(P), np.float32)
    for i in range(len(P)):
        n = Vector(N[i])
        up = Vector((0, 1, 0)) if abs(n.y) < 0.95 else Vector((1, 0, 0))
        t = n.cross(up).normalized()
        b = n.cross(t)
        o = Vector(P[i]) + n * 0.01
        occ = 0.0
        for dx, dy, dz in dirs:
            d = t * dx + b * dy + n * dz
            hit = tree.ray_cast(o, d, maxd)
            if hit[0] is not None:
                occ += 1.0 - hit[3] / maxd
        out[i] = 1.0 - occ / nrays
    return out




def finish_meshes(name):
    """Deduplicate every batch, bake ambient occlusion over the static geometry, pack the vertices and write
    <name>.bin. Returns what a floor needs for its manifest: the AO tree, the deduplicated batches, the mesh
    ranges and the quantisation box."""
    items = sorted(BATCHES.items(), key=lambda kv: (kv[0][0] != "static", kv[0][0], bool(MATS[kv[0][1]].get("blend") or MATS[kv[0][1]].get("alpha")), kv[0][1]))
    uniq = {}
    for (g, m), b in items:
        P = np.concatenate(b.P); N = np.concatenate(b.N); T = np.concatenate(b.T)
        C = np.concatenate(b.C); D = np.concatenate(b.D); I = np.concatenate(b.I)
        rec = np.concatenate([P.view(np.uint32), N.view(np.uint32), T.view(np.uint32), C.view(np.uint32), D.view(np.uint32)], axis=1)
        u, inv = np.unique(rec, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        I = inv[I]
        keep = (I[:, 0] != I[:, 1]) & (I[:, 1] != I[:, 2]) & (I[:, 0] != I[:, 2])
        uniq[(g, m)] = (u, I[keep])
    pool, tris, off = [], [], 0
    for (g, m), (u, I) in uniq.items():
        if g != "static":
            continue
        pool.append(np.ascontiguousarray(u[:, 0:3]).view(np.float32))
        tris.append(I + off)
        off += len(u)
    allP = np.concatenate(pool)
    allI = np.concatenate(tris)
    print(f"[{name}] AO tree: {len(allP)} verts, {len(allI)} tris", flush=True)
    tree = BVHTree.FromPolygons([tuple(map(float, p)) for p in allP], [tuple(map(int, t)) for t in allI], all_triangles=True)

    out_meshes, vparts, iparts, vbase = [], [], [], 0
    bounds_all, packed_tmp = [], []
    for (g, m), (u, I) in uniq.items():
        Pu = np.ascontiguousarray(u[:, 0:3]).view(np.float32)
        Nu = np.ascontiguousarray(u[:, 3:6]).view(np.float32)
        Tu = np.ascontiguousarray(u[:, 6:8]).view(np.float32)
        Cu = np.ascontiguousarray(u[:, 8:9]).view(np.uint8).reshape(-1, 4)
        Du = np.ascontiguousarray(u[:, 9:10]).view(np.uint8).reshape(-1, 4).copy()
        if BATCHES[(g, m)].ao:
            ao = ao_bake(Pu, Nu, tree)
            Du[:, 0] = np.clip(np.clip(ao, 0, 1) ** 1.2 * 255, 0, 255).astype(np.uint8)
            print(f"[{name}] AO {g}/{m}: {len(Pu)} verts, mean {ao.mean():.2f}", flush=True)
        packed_tmp.append(((g, m), Pu, Nu, Tu, Cu, Du, I))
        bounds_all.append(Pu)
    allB = np.concatenate(bounds_all)
    qmin = allB.min(axis=0) - 0.01
    qsize = (allB.max(axis=0) - qmin) + 0.01
    first = 0
    for (g, m), Pu, Nu, Tu, Cu, Du, I in packed_tmp:
        v = np.zeros(len(Pu), dtype=[("p", "<u2", 4), ("n", "i1", 4), ("t", "<f4", 2), ("c", "u1", 4), ("d", "u1", 4)])
        v["p"][:, :3] = np.round((Pu - qmin) / qsize * 65535).astype(np.uint16)
        v["n"][:, :3] = np.round(np.clip(Nu, -1, 1) * 127).astype(np.int8)
        v["t"] = Tu; v["c"] = Cu; v["d"] = Du
        vparts.append(v)
        idx = (I + vbase).astype(np.uint32).reshape(-1)
        iparts.append(idx)
        out_meshes.append({"group": g, "material": m, "firstIndex": first, "indexCount": int(len(idx)),
                           "triangles": int(len(idx) // 3), "vertices": int(len(Pu))})
        print(f"[{name}] {g}/{m}: {len(Pu)} verts, {len(idx) // 3} tris", flush=True)
        first += len(idx)
        vbase += len(Pu)
    vbytes = np.concatenate(vparts).tobytes()
    ibytes = np.concatenate(iparts).astype("<u4").tobytes()
    with open(os.path.join(OUT, f"{name}.bin"), "wb") as fh:
        fh.write(vbytes + ibytes)
    return dict(tree=tree, uniq=uniq, meshes=out_meshes, qmin=qmin, qsize=qsize, vertexBytes=len(vbytes), indexCount=int(first))


def base_manifest(ctx, **extra):
    """The parts of a manifest every floor shares; the floor adds its lights, window, camera and props."""
    m = {
        "vertexBytes": ctx["vertexBytes"], "stride": 28, "indexCount": ctx["indexCount"],
        "quant": {"min": ctx["qmin"].tolist(), "size": ctx["qsize"].tolist()},
        "meshes": ctx["meshes"],
        "materials": [x for x in MATS.values() if any(mm["material"] == x["name"] for mm in ctx["meshes"])],
    }
    m.update(extra)
    return m


def write_manifest(name, manifest):
    with open(os.path.join(OUT, f"{name}.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)


def window_manifest(win_ang, win_y, hole_r, sun_pitch_deg=None, floor_ang_off=18.0, floor_rad=1.1):
    """A round window in the arc wall at `win_ang`: where the sun comes in and how big the glass is."""
    sun_from = polar(win_ang, R - 0.5, win_y)
    sun_to = polar(win_ang - floor_ang_off, floor_rad, 0.06)
    wn = Vector(polar(win_ang, 1.0))
    wright = Vector((math.cos(RAD(win_ang)), 0, -math.sin(RAD(win_ang))))
    return {"center": polar(win_ang, R - 0.4, win_y), "normal": list(wn), "right": list(wright), "radius": hole_r,
            "towardSun": list((Vector(sun_from) - Vector(sun_to)).normalized()), "shaftFrom": sun_from, "shaftTo": sun_to}
