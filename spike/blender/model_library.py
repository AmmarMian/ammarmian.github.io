"""
Assembles the tower's library floor in Blender for the vgpu renderer.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python spike/blender/model_library.py -- <out dir> [--blend <file>]

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
BLEND = argv[argv.index("--blend") + 1] if "--blend" in argv else None
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
             emissive=0.0, size=1024, gen=None, alpha=0.0, smooth=40.0):
    """A material the renderer will bind. `tex` names a folder in assets-src/textures (diff/nor/arm);
    `gen` names a texture pack-assets.py paints itself; `rough` / `metal` override the map when set."""
    MATS[name] = dict(name=name, tex=tex, tile=tile, rot=rot, tint=list(tint), rough=rough, metal=metal,
                      nscale=nscale, emissive=emissive, size=size, gen=gen, alpha=alpha, smooth=smooth, files={})
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
         matof=None):
    """Triangulate and append a primitive. `tint` (rgb 0..1) multiplies the texture, or replaces its colour
    in proportion to `tint_mode`. Imported scans pass `uvlayer` and `matof` (face -> material name)."""
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
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
        D = np.tile(np.array([255, 127 + int(side * 127), 0, int(tint_mode * 255)], np.uint8), (len(P), 1))
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


def page_stack(width, depth, t_edge, t_spine, side, mat="paper", nx=14, nz=6, **kw):
    """The pages of one half of an open book: a block whose top surface dips toward the spine and rounds over
    toward the fore-edge. `side` -1 / +1 puts it left / right of the spine at x = 0."""
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
    emit(bm, STACK[-1], mat, smooth=50.0, **kw)


def leaf(width, depth, lift, mat="paper", nx=10, nz=3, **kw):
    """One turning page, curling up and over: a thin curved sheet standing from the spine."""
    bm = bmesh.new()
    g = [[None] * (nz + 1) for _ in range(nx + 1)]
    for i in range(nx + 1):
        u = i / nx
        ang = lift * (1 - 0.5 * u)
        x = width * u * math.cos(ang) * (1 - 0.25 * u)
        y = width * u * math.sin(ang) + 0.012 * math.sin(u * math.pi)
        for k in range(nz + 1):
            g[i][k] = bm.verts.new((x, y, (k / nz - 0.5) * depth))
    for i in range(nx):
        for k in range(nz):
            bm.faces.new((g[i][k], g[i + 1][k], g[i + 1][k + 1], g[i][k + 1]))
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.y < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    emit(bm, STACK[-1], mat, smooth=60.0, **kw)


def open_book(pos, ry, w, d, tint):
    """An open tome: two boards, two curved page stacks, two or three leaves mid-turn, a ribbon."""
    with at(pos, ry=ry):
        box(w * 2 + 0.03, 0.012, d + 0.03, (0, 0.006, 0), mat="leather", tint=tint, tint_mode=0.9, bevel=0.004)
        with at((0, 0.012, 0)):
            page_stack(w, d - 0.02, 0.014, 0.034, -1)
            page_stack(w, d - 0.02, 0.014, 0.034, 1)
            for lift, s_ in ((0.5, 1), (0.95, 1), (0.35, -1)):
                with at((0, 0.032, 0), ry=0 if s_ > 0 else math.pi):
                    leaf(w * 0.96, d - 0.03, lift)
            box(0.006, 0.002, 0.18, (0.02, 0.036, d / 2 + 0.07), mat="paper", tint=(0.7, 0.1, 0.12), bevel=0.0, rx=0.0)


# ----------------------------------------------------------------------------- the room
WIN_ANG, WIN_Y, WIN_R = 175.0, 3.4, 0.82
HOLE_R = WIN_R - 0.13
slots = []
BAND = [(104.0, 158.0), (194.0, 248.0)]
ROWS = [0.95, 1.62, 2.29, 2.96, 3.63, 4.3]
WALL_A = (100.0, 236.0)

OGEE = [(0, 0), (0.03, 0), (0.03, 0.012), (0.05, 0.03), (0.05, 0.05), (0.035, 0.06), (0.035, 0.07), (0, 0.07)]


def floor_and_platform():
    z = -R
    while z < R:
        half = math.sqrt(max(R * R - (z + 0.1) ** 2, 0))
        if half > 0.3:
            x = -half
            while x < half - 0.05:
                run = min(half - x, 1.1 + rnd() * 2.2)
                if half - (x + run) < 0.5:
                    run = half - x
                k = 0.76 + rnd() * 0.24
                box(run - 0.004, 0.2, 0.196, (x + run / 2, -0.1, z + 0.1), mat="floor", bevel=0.008, L=0.3, top_only=True, tint=(k, k, k))
                # nail heads at the board ends
                for ex in (x + 0.05, x + run - 0.05):
                    cyl(0.006, 0.006, 0.004, 6, (ex, 0.002, z + 0.05), mat="iron", bevel=0.0)
                x += run
        z += 0.2
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="stone", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="stonewall", L=1.0)
    # the platform's stone edge: a rolled moulding all the way round
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, "stone", step=4.0)


def pilaster(a, y0, y1, rad=R - 0.4, w=0.22):
    arcbox(w, y1 - y0, 0.1, a, rad, (y0 + y1) / 2, mat="ebony", bevel=0.008)
    for off in (-0.06, 0.0, 0.06):                                                  # flutes
        arcbox(0.025, y1 - y0 - 0.5, 0.012, a + off / (rad * RAD(1)) , rad - 0.052, (y0 + y1) / 2, mat="shelf", bevel=0.004)
    arcbox(w + 0.1, 0.34, 0.15, a, rad, y0 + 0.17, mat="ebony", bevel=0.02, segs=2)
    arcbox(w + 0.1, 0.22, 0.15, a, rad, y1 - 0.11, mat="ebony", bevel=0.02, segs=2)
    arcbox(w + 0.15, 0.06, 0.18, a, rad, y1 - 0.25, mat="shelf", bevel=0.015)


def wall():
    # the wall core, in narrow columns so the curve is smooth, with the round window cut clean through
    for a in np.arange(WALL_A[0], WALL_A[1] + 1e-6, 2.2):
        dx = (R - 0.2) * math.sin(RAD(a - WIN_ANG))
        if abs(dx) < HOLE_R:
            hh = math.sqrt(HOLE_R ** 2 - dx ** 2)
            lo, hi = WIN_Y - hh, WIN_Y + hh
            arcbox(0.2, lo, 0.3, a, R - 0.18, lo / 2, mat="wall", L=0.3, bevel=0.004)
            arcbox(0.2, WH - hi, 0.3, a, R - 0.18, hi + (WH - hi) / 2, mat="wall", L=0.3, bevel=0.004)
        else:
            arcbox(0.2, WH, 0.3, a, R - 0.18, WH / 2, mat="wall", L=0.3, bevel=0.004)
    # mouldings: skirting, chair rail, frieze and crown
    sweep_arc([(0, 0), (0.05, 0), (0.05, 0.03), (0.07, 0.05), (0.07, 0.2), (0.04, 0.22), (0.04, 0.24), (0, 0.24)], *WALL_A, R - 0.35, 0.0, "ebony")
    sweep_arc(OGEE, *WALL_A, R - 0.35, 1.12, "ebony")
    sweep_arc([(0, 0), (0.04, 0), (0.04, 0.3), (0, 0.3)], *WALL_A, R - 0.35, WH - 0.95, "shelf")
    sweep_arc([(0, 0), (0.04, 0), (0.1, 0.1), (0.2, 0.16), (0.24, 0.2), (0.24, 0.3), (0.12, 0.3), (0.06, 0.26), (0, 0.24)], *WALL_A, R - 0.38, WH - 0.4, "ebony")
    sweep_arc([(0, 0), (0.07, 0), (0.07, 0.1), (0, 0.1)], *WALL_A, R - 0.35, WH - 0.65, "ebony")
    # wainscot: raised panels between pilasters
    k = WALL_A[0]
    while k < WALL_A[1] - 1:
        pilaster(k, 0.0, WH - 0.55)
        nxt = min(k + 11.0, WALL_A[1])
        mid = (k + nxt) / 2
        if nxt - k > 6:
            arcbox(0.7, 0.72, 0.05, mid, R - 0.36, 0.66, mat="wall", bevel=0.02, segs=2)
            arcbox(0.5, 0.52, 0.02, mid, R - 0.385, 0.66, mat="ebony", bevel=0.012, segs=2)
        k = nxt
    pilaster(WALL_A[1], 0.0, WH - 0.55)


def railing():
    for a in np.arange(358, 446 + 1e-6, 4.4):
        x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
        lathe([(0, 0), (0.035, 0), (0.03, 0.06), (0.02, 0.12), (0.034, 0.26), (0.02, 0.4), (0.028, 0.5), (0.024, 0.8), (0.0, 0.84)], 12, (x, 0.0, z),
              mat="ebony", bevel=0.002)
    sweep_arc([(-0.07, 0.84), (0.07, 0.84), (0.09, 0.88), (0.08, 0.95), (-0.08, 0.95), (-0.09, 0.88)], 356, 448, R - 0.26, 0.0, "shelf", step=2.0)
    sweep_arc([(-0.05, 0.0), (0.05, 0.0), (0.05, 0.1), (-0.05, 0.1)], 356, 448, R - 0.26, 0.0, "ebony", step=2.0)
    newel(354)
    newel(450)


def newel(a):
    x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
    lathe([(0, 0), (0.11, 0), (0.1, 0.12), (0.07, 0.18), (0.07, 1.1), (0.1, 1.14), (0.1, 1.28), (0.06, 1.34), (0.0, 1.38)], 14, (x, 0, z),
          mat="ebony", bevel=0.005)


def window():
    with at(polar(WIN_ANG, R - 0.4, WIN_Y), ry=RAD(WIN_ANG)):
        # a deep stone reveal, an outer rolled moulding, a keystone and a carved sill
        lathe([(HOLE_R, -0.17), (WIN_R, -0.17), (WIN_R, 0.17), (HOLE_R, 0.17), (HOLE_R, -0.17)], 56, rx=math.pi / 2, mat="stonewall", bevel=0.02, L=0.3)
        lathe([(WIN_R, 0.12), (WIN_R + 0.05, 0.12), (WIN_R + 0.14, 0.16), (WIN_R + 0.17, 0.2), (WIN_R + 0.14, 0.24), (WIN_R, 0.24), (WIN_R, 0.12)], 56,
              rx=math.pi / 2, mat="stonewall", bevel=0.01, L=0.3)
        box(0.3, 0.34, 0.3, (0, WIN_R + 0.1, 0.12), mat="stonewall", bevel=0.03, segs=2)
        for s_ in (-1, 1):
            box(0.2, 0.22, 0.26, (s_ * (WIN_R + 0.1), 0, 0.12), mat="stonewall", bevel=0.03, segs=2)
        span = HOLE_R * 2
        # the casement: a wooden ring, a cross, and lead lines in a lozenge lattice
        lathe([(HOLE_R - 0.05, -0.04), (HOLE_R, -0.04), (HOLE_R, 0.04), (HOLE_R - 0.05, 0.04), (HOLE_R - 0.05, -0.04)], 48, rx=math.pi / 2, mat="ebony", bevel=0.006)
        box(0.07, span, 0.08, (0, 0, 0), mat="ebony", bevel=0.012)
        box(span, 0.07, 0.08, (0, 0, 0), mat="ebony", bevel=0.012)
        for ang in (math.pi / 4, -math.pi / 4):
            for off in (-0.28, 0.28):
                box(0.012, span * 0.78, 0.018, (off * math.cos(ang), off * math.sin(ang), 0), mat="iron", rz=ang, bevel=0.002)
        box(span + 0.5, 0.1, 0.52, (0, -WIN_R - 0.08, 0.1), mat="stonewall", bevel=0.03, segs=2)


def reserved_ranges():
    return [(0, 2, 118, 126), (0, 4, 136, 144), (1, 1, 210, 218), (1, 3, 226, 234), (1, 4, 202, 206), (0, 1, 130, 135)]


BOOK_INST = []
VARIANTS = [
    dict(name="folio", w=0.08, h=0.40, d=0.30, bands=5, label=True, weight=0.14),
    dict(name="quarto", w=0.06, h=0.34, d=0.26, bands=4, label=True, weight=0.34),
    dict(name="thick", w=0.10, h=0.30, d=0.24, bands=3, label=True, weight=0.22),
    dict(name="slim", w=0.035, h=0.26, d=0.20, bands=0, label=False, weight=0.30),
]


def pick_variant():
    r = rnd() * sum(v["weight"] for v in VARIANTS)
    for i, v in enumerate(VARIANTS):
        r -= v["weight"]
        if r <= 0:
            return i
    return 1


def book(a, sy, w_m, lean, tint, variant, rad=R - 0.56):
    """A shelf book is an instance of one of four unit meshes (book_units), scaled to its width and tinted: position,
    yaw, lean, scale and cover colour sit in a small buffer the renderer reads, so every book on the shelves can be
    moved, tinted or opened on its own, and the mesh file carries four books instead of seven hundred."""
    v = VARIANTS[variant]
    ang = RAD(a)
    h = v["h"] * (0.9 + rnd() * 0.2)
    tilt = (0.22 if rnd() < 0.5 else -0.22) if lean else 0.0
    pos = (rad * math.sin(ang), sy + 0.05 + h / 2 + (0.02 if lean else 0), rad * math.cos(ang))
    BOOK_INST.append(dict(pos=pos, yaw=ang, tilt=tilt, sx=w_m / v["w"], sy=h / v["h"], tint=tint, w=w_m, h=h, variant=variant, d=v["d"]))
    return h


def book_units():
    """Four unit books. Each has a rounded leather spine (a thin arc shell), two boards, a chamfered page block with
    headbands, raised hubs with gilt tooling, and a paper label."""
    for vi, v in enumerate(VARIANTS):
        w, h, d = v["w"], v["h"], v["d"]
        cover = dict(tint=(1, 1, 1), tint_mode=0.85)
        with group(f"shelfbook{vi}"):
            # rounded spine: an arc across the width, thick shell, standing h tall
            bm = bmesh.new()
            n = 9
            rr = w * 0.62
            for t0, t1, dz0 in ((0, 1, 0),):
                pass
            outer_b, outer_t, inner_b, inner_t = [], [], [], []
            for i in range(n + 1):
                th = (i / n - 0.5) * 2.3
                x = rr * math.sin(th)
                z = -d / 2 + rr * (1 - math.cos(th)) * 0.5 - 0.002
                outer_b.append(bm.verts.new((x, -h / 2, z))); outer_t.append(bm.verts.new((x, h / 2, z)))
                inner_b.append(bm.verts.new((x * 0.97, -h / 2 + 0.0, z + 0.006))); inner_t.append(bm.verts.new((x * 0.97, h / 2, z + 0.006)))
            for i in range(n):
                bm.faces.new((outer_b[i], outer_b[i + 1], outer_t[i + 1], outer_t[i]))
                bm.faces.new((inner_b[i + 1], inner_b[i], inner_t[i], inner_t[i + 1]))
                bm.faces.new((outer_t[i], outer_t[i + 1], inner_t[i + 1], inner_t[i]))
                bm.faces.new((inner_b[i], inner_b[i + 1], outer_b[i + 1], outer_b[i]))
            bm.faces.new((outer_b[0], outer_t[0], inner_t[0], inner_b[0]))
            bm.faces.new((inner_b[n], inner_t[n], outer_t[n], outer_b[n]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            emit(bm, STACK[-1], "leather", smooth=75.0, **cover)
            for s_ in (-1, 1):                                                              # boards
                box(0.006, h + 0.006, d - 0.012, (s_ * (w / 2 - 0.003 * 1.0), 0, 0.006), mat="leather", bevel=0.0016, **cover)
            box(w - 0.016, h - 0.014, d - 0.026, (0, 0, 0.011), mat="paper", bevel=0.0012)          # page block
            for yy in (-1, 1):                                                              # headbands
                cyl(0.0045, 0.0045, w - 0.018, 6, (0, yy * (h / 2 - 0.007), -d / 2 + 0.014), mat="paper", bevel=0.0, rz=math.pi / 2, tint=(0.75, 0.18, 0.15))
            nb = v["bands"]
            hubs = [(i + 1) / (nb + 1) for i in range(nb)]
            for fy in hubs:                                                                # raised hubs, tooled in gilt
                box(w * 0.98, 0.011, 0.014, (0, (fy - 0.5) * h, -d / 2 - 0.004), mat="leather", bevel=0.003, **cover)
                quad(w * 0.96, 0.003, (0, (fy - 0.5) * h + 0.007, -d / 2 - 0.0125), "gilt")
                quad(w * 0.96, 0.003, (0, (fy - 0.5) * h - 0.007, -d / 2 - 0.0125), "gilt")
            if v["label"] and nb >= 3:
                fy = (hubs[0] + hubs[1]) / 2
                quad(w * 0.6, h * 0.14, (0, (fy - 0.5) * h, -d / 2 - 0.0135), "paper", tint=(0.7, 0.6, 0.45))
                fy = (hubs[1] + hubs[2]) / 2
                quad(w * 0.5, h * 0.05, (0, (fy - 0.5) * h, -d / 2 - 0.0135), "gilt")
            elif nb == 0:                                                                   # a plain cloth book: title in gilt
                quad(w * 0.5, h * 0.4, (0, h * 0.1, -d / 2 - 0.0095), "gilt")


def shelf_rows(bi, a0, a1):
    rad = R - 0.54
    for ri, sy in enumerate(ROWS):
        # the shelf board with a rounded nosing, one sweep per row
        sweep_arc([(-0.33, -0.05), (0.33, -0.05), (0.33, 0.05), (-0.31, 0.05), (-0.34, 0.03), (-0.34, -0.03)], a0, a1, rad, sy, "shelf", step=2.0)
        sweep_arc([(-0.345, -0.08), (-0.30, -0.08), (-0.30, -0.05), (-0.345, -0.05)], a0, a1, rad, sy, "ebony", step=3.0)


def shelves():
    res = reserved_ranges()
    for bi, (a0, a1) in enumerate(BAND):
        rad = R - 0.54
        shelf_rows(bi, a0, a1)
        deg_per_m = 180 / math.pi / (R - 0.56)
        for ri, sy in enumerate(ROWS):
            a = a0 + 0.8
            while a < a1 - 1.2:
                vi = pick_variant()
                v = VARIANTS[vi]
                w = v["w"] * (0.85 + rnd() * 0.3)
                gap = 0.0 if rnd() > 0.08 else 0.06 + rnd() * 0.1
                step = (w + 0.004) * deg_per_m
                blocked = any(b == bi and r == ri and a0r - 0.5 <= a <= a1r + 0.5 for b, r, a0r, a1r in res)
                if blocked:
                    a += step
                    continue
                if rnd() < 0.9:
                    lean = rnd() < 0.05
                    h = book(a + step / 2, sy, w, lean, pick(BOOK_TINTS), vi)
                    BOOK_INST[-1]["slot"] = len(slots)
                    slots.append({"band": bi, "angle": float(a + step / 2), "row": ri, "height": h, "width": w, "variant": vi,
                                  "pos": list(BOOK_INST[-1]["pos"]), "yaw": BOOK_INST[-1]["yaw"], "tint": list(BOOK_INST[-1]["tint"]),
                                  "depth": VARIANTS[vi]["d"]})
                a += step + gap * deg_per_m
        # vertical dividers every ~13.5 degrees, finished with a moulded edge
        nb = 4
        for k in range(nb + 1):
            ang = a0 + (a1 - a0) * k / nb
            arcbox(0.05, 4.85, 0.66, ang, rad, 2.55, mat="shelf", bevel=0.008)
        sweep_arc([(-0.34, 0), (0.34, 0), (0.34, 0.12), (-0.34, 0.12)], a0, a1, rad, 0.0, "ebony", step=3.0)            # plinth
        for a in np.arange(a0, a1 + 1e-6, 2.2):
            arcbox(0.2, 4.75, 0.06, a, R - 0.3, 2.55, mat="ebony", bevel=0.0, L=0.8)                                      # back
        # cabinet doors in the lowest bay
        for k in range(nb):
            for s_ in (0.25, 0.75):
                ang = a0 + (a1 - a0) * (k + s_) / nb
                arcbox(0.5, 0.74, 0.035, ang, rad - 0.34, 0.5, mat="shelf", bevel=0.01, segs=2)
                arcbox(0.34, 0.54, 0.02, ang, rad - 0.358, 0.5, mat="wall", bevel=0.012, segs=2)
                ox = 0.2 * (1 if s_ < 0.5 else -1)
                x, z = (rad - 0.37) * math.sin(RAD(ang)), (rad - 0.37) * math.cos(RAD(ang))
                sp = ox / ((rad - 0.37) * RAD(1))
                xk, zk = (rad - 0.375) * math.sin(RAD(ang + sp)), (rad - 0.375) * math.cos(RAD(ang + sp))
                sphere_uv(0.016, (xk, 0.5, zk), "brass")
        # cornice and a frieze above the top shelf
        sweep_arc([(-0.36, 0), (0.34, 0), (0.34, 0.14), (-0.36, 0.14)], a0 - 1, a1 + 1, rad, 4.95, "shelf", step=3.0)
        sweep_arc([(-0.44, 0.14), (0.34, 0.14), (0.34, 0.36), (-0.4, 0.36), (-0.44, 0.3)], a0 - 1, a1 + 1, rad, 4.95, "ebony", step=3.0)
        for a in (a0 - 1.2, a1 + 1.2):
            pilaster(a, 0.0, 5.1, rad=R - 0.5, w=0.2)


def tome(pos, ry, tint):
    open_book(pos, ry, 0.23, 0.32, tint)


def desk():
    with at(polar(176, 2.6), ry=RAD(176)):
        top_y = 0.9
        # top: a thick slab with a rolled edge, over a moulded apron
        box(2.3, 0.07, 1.05, (0, top_y + 0.035, 0), mat="desk", bevel=0.03, segs=3, L=0.25)
        extrude_x([(0.52, 0), (0.54, 0.02), (0.54, 0.05), (0.5, 0.07), (0.46, 0.07), (0.46, 0)], 2.26, (0, top_y - 0.07, 0), "ebony")
        # leather writing surface with a gilt border
        box(1.62, 0.006, 0.7, (0, top_y + 0.0745, -0.06), mat="leather", tint=(0.28, 0.1, 0.09), tint_mode=0.92, bevel=0.002)
        for (w_, d_, z_, x_) in ((1.58, 0.008, -0.06 + 0.33, 0), (1.58, 0.008, -0.06 - 0.33, 0), (0.008, 0.66, -0.06, 0.79), (0.008, 0.66, -0.06, -0.79)):
            box(w_, 0.002, d_, (x_, top_y + 0.0785, z_), mat="gilt", bevel=0.0)
        # two pedestals of drawers, a kneehole between, a modesty panel behind it
        for sx in (-1, 1):
            cx = sx * 0.78
            box(0.62, 0.82, 0.88, (cx, 0.41, 0), mat="ebony", bevel=0.012)
            for k, (y0, hh) in enumerate(((0.62, 0.17), (0.4, 0.2), (0.14, 0.24))):
                box(0.54, hh - 0.015, 0.03, (cx, y0 + hh / 2, -0.455), mat="desk", bevel=0.01, segs=2)
                box(0.44, hh - 0.06, 0.012, (cx, y0 + hh / 2, -0.472), mat="ebony", bevel=0.006)
                cyl(0.014, 0.014, 0.02, 10, (cx, y0 + hh / 2, -0.48), mat="brass", bevel=0.004, rx=math.pi / 2)
                torus(0.022, 0.004, (cx, y0 + hh / 2 - 0.012, -0.492), mat="brass", seg=16, tseg=6, rx=0.0)
        box(0.86, 0.6, 0.03, (0, 0.5, 0.42), mat="ebony", bevel=0.01)
        # turned bun feet and a plinth
        for sx in (-1, 1):
            for sz in (-1, 1):
                lathe([(0, 0), (0.055, 0), (0.06, 0.02), (0.05, 0.05), (0.03, 0.07), (0.0, 0.07)], 14, (sx * 1.0, 0, sz * 0.38), mat="ebony", bevel=0.004)
        # hutch: pigeonholes and tiny drawers along the back edge
        hz = 0.36
        box(1.9, 0.34, 0.26, (0, top_y + 0.07 + 0.17, hz), mat="ebony", bevel=0.01)
        for i in range(8):
            x = -0.84 + i * 0.24
            box(0.2, 0.15, 0.02, (x, top_y + 0.07 + 0.09, hz - 0.13), mat="shelf", bevel=0.004)
            if i % 2 == 0:
                box(0.2, 0.12, 0.012, (x, top_y + 0.07 + 0.27, hz - 0.135), mat="desk", bevel=0.004)
                cyl(0.008, 0.008, 0.012, 8, (x, top_y + 0.07 + 0.27, hz - 0.145), mat="brass", bevel=0.002, rx=math.pi / 2)
        for i in range(9):
            box(0.012, 0.18, 0.26, (-0.96 + i * 0.24, top_y + 0.07 + 0.16, hz), mat="ebony", bevel=0.002)
        # on the desk
        tome((-0.28, top_y + 0.0775, -0.1), 0.1, (0.45, 0.1, 0.1))
        for i, (tn, ry_, w_, d_) in enumerate(((BOOK_TINTS[2], 0.45, 0.42, 0.32), (BOOK_TINTS[1], 0.12, 0.38, 0.3), (BOOK_TINTS[3], 0.3, 0.34, 0.26))):
            box(w_, 0.04, d_, (0.74, top_y + 0.0775 + 0.02 + i * 0.045, -0.2), ry_, mat="leather", tint=tn, tint_mode=0.9, bevel=0.007, segs=2)
            box(w_ - 0.03, 0.028, d_ - 0.02, (0.742, top_y + 0.0775 + 0.02 + i * 0.045, -0.2), ry_, mat="paper", bevel=0.0)
        lathe([(0, 0), (0.075, 0), (0.08, 0.05), (0.06, 0.1), (0.035, 0.14), (0.04, 0.17), (0.0, 0.17)], 24, (0.44, top_y + 0.0775, 0.05), mat="ink", bevel=0.003)
        cyl(0.042, 0.042, 0.014, 18, (0.44, top_y + 0.0775 + 0.18, 0.05), mat="brass", bevel=0.003)
        with at((0.46, top_y + 0.0775 + 0.2, 0.05), rx=0.35, rz=-0.35):                 # quill in the well
            cyl(0.0035, 0.0045, 0.34, 6, (0, 0.17, 0), mat="paper", bevel=0.0)
            blade((0, 0.2, 0), (0, 0, 1), 0.22, 0.05, 0.12, 0.2, "paper", (0.94, 0.9, 0.82))
        with at((0.1, top_y + 0.0775 + 0.012, 0.15), ry=0.7):                            # a magnifier
            torus(0.045, 0.004, (0, 0.0, 0), rx=math.pi / 2, mat="brass", seg=24, tseg=6)
            tube([(0, 0, 0.045), (0, 0, 0.09), (0, 0, 0.18)], [0.006, 0.008, 0.009], 8, "ebony")
        for k in range(3):                                                                # loose letters and a seal
            box(0.21, 0.002, 0.15, (-0.78 + k * 0.03, top_y + 0.0775 + 0.002 + k * 0.002, -0.2 + k * 0.02), 0.2 * k, mat="paper", bevel=0.0)
        cyl(0.018, 0.018, 0.004, 14, (-0.74, top_y + 0.0775 + 0.009, -0.19), mat="wax", bevel=0.001)


def rug():
    with at(polar(176, 2.0)):
        lathe([(0, 0.0), (2.5, 0.0), (2.5, 0.016), (0, 0.016)], 72, mat="rug", bevel=0.004, L=0.5)


LADDER_TILT = 0.2
LADDER_LEN = 4.72 / math.cos(LADDER_TILT)       # the top ends level with the brass rail
RAIL_R = R - 0.54 - 0.34                        # the rail runs along the shelf nosings


def ladder():
    """A rolling library ladder: it leans against the bookcase and hooks over the brass rail at the top."""
    base_r = RAIL_R - 0.06 - LADDER_LEN * math.sin(LADDER_TILT)
    with at(polar(214, base_r), ry=RAD(214), rx=LADDER_TILT):
        for dx in (-0.29, 0.29):
            box(0.055, LADDER_LEN, 0.075, (dx, LADDER_LEN / 2, 0), mat="shelf", bevel=0.01, segs=2)
            box(0.06, 0.1, 0.1, (dx, LADDER_LEN + 0.02, 0.03), mat="brass", bevel=0.012)
            # the hook: up over the rail and back down on its far side
            box(0.03, 0.05, 0.18, (dx, LADDER_LEN + 0.07, 0.09), mat="brass", bevel=0.008)
            box(0.03, 0.14, 0.03, (dx, LADDER_LEN - 0.0, 0.17), mat="brass", bevel=0.008)
            cyl(0.055, 0.055, 0.04, 16, (dx, 0.05, 0.02), mat="iron", bevel=0.005, rz=math.pi / 2)
        n = 12
        for i in range(n):
            box(0.6, 0.03, 0.1, (0, 0.4 + i * (LADDER_LEN - 0.6) / (n - 1), 0.0), mat="shelf", bevel=0.008, segs=2)


def ladder_rail():
    for (a0, a1) in BAND:
        r_ = []
        for i in range(8):
            t = i / 7 * math.tau
            r_.append((0.018 * math.cos(t), 0.018 * math.sin(t)))
        sweep_arc(r_, a0 - 1, a1 + 1, RAIL_R, 4.72, "brass", step=3.0)
        for a in np.arange(a0, a1 + 1e-6, 6.0):
            arcbox(0.03, 0.03, 0.12, a, RAIL_R + 0.06, 4.72, mat="brass", bevel=0.005)


def floor_litter():
    for _ in range(5):
        x, _, z = polar(rnd() * 360, 1.0 + rnd() * 2.8)
        n = 2 + int(rnd() * 4)
        for j in range(n):
            tnt = pick(BOOK_TINTS)
            w = 0.44 - j * 0.02
            with at((x + (rnd() - 0.5) * 0.1, 0.07 + j * 0.075, z + (rnd() - 0.5) * 0.1), ry=rnd() * math.pi):
                box(w, 0.012, 0.32, (0, -0.03, 0), mat="leather", tint=tnt, tint_mode=0.88, bevel=0.005, segs=2)
                box(w, 0.012, 0.32, (0, 0.03, 0), mat="leather", tint=tnt, tint_mode=0.88, bevel=0.005, segs=2)
                box(0.02, 0.072, 0.32, (-w / 2 + 0.01, 0, 0), mat="leather", tint=tnt, tint_mode=0.88, bevel=0.007, segs=2)
                box(w - 0.03, 0.05, 0.305, (0.006, 0, 0.004), mat="paper", bevel=0.0)
    for _ in range(18):
        x, _, z = polar(rnd() * 360, 0.8 + rnd() * 3.6)
        box(0.3 + rnd() * 0.12, 0.004, 0.22 + rnd() * 0.1, (x, 0.012, z), rnd() * math.pi, mat="paper", bevel=0.002)
    # a few rolled scrolls on the floor by the desk
    for k in range(3):
        x, _, z = polar(190 + k * 6, 1.6 + k * 0.1)
        cyl(0.022, 0.022, 0.5, 10, (x, 0.03, z), mat="paper", bevel=0.002, rz=math.pi / 2, ry=0.4 * k)


def lectern():
    with at(polar(320, 2.6), ry=RAD(320)):
        # octagonal stepped plinth
        lathe([(0, 0), (0.34, 0), (0.34, 0.05), (0.3, 0.07), (0.26, 0.14), (0.0, 0.14)], 8, mat="ebony", bevel=0.008)
        # a turned column with bead and reel work
        lathe([(0, 0.14), (0.16, 0.14), (0.15, 0.2), (0.1, 0.24), (0.1, 0.3), (0.13, 0.34), (0.1, 0.38), (0.075, 0.46), (0.075, 0.74), (0.1, 0.78), (0.095, 0.84),
               (0.12, 0.88), (0.1, 0.92), (0.15, 1.0), (0.17, 1.06), (0.0, 1.06)], 20, mat="shelf", bevel=0.003)
        # reading board with a lip and a brass edge
        with at((0, 1.18, 0.02), rx=-0.5):
            box(0.84, 0.05, 0.62, mat="desk", bevel=0.012, segs=2)
            box(0.86, 0.03, 0.04, (0, -0.005, 0.33), mat="brass", bevel=0.008)
            box(0.84, 0.05, 0.05, (0, 0.035, -0.31), mat="shelf", bevel=0.01)
        with at((0, 1.27, 0.03), rx=-0.5):                                                # the grimoire
            box(0.7, 0.11, 0.5, mat="leather", tint=(0.22, 0.1, 0.4), tint_mode=0.92, bevel=0.016, segs=2)
            box(0.64, 0.085, 0.455, (0.012, 0, 0.012), mat="paper", bevel=0.0)
            for (cx, cz) in ((-0.345, -0.245), (0.345, -0.245), (-0.345, 0.245), (0.345, 0.245)):
                box(0.06, 0.12, 0.06, (cx, 0, cz), mat="gilt", bevel=0.008)
            box(0.04, 0.115, 0.5, (-0.34, 0, 0), mat="gilt", bevel=0.006)
            box(0.7, 0.115, 0.03, (0, 0, 0.0), mat="leather", tint=(0.22, 0.1, 0.4), tint_mode=0.9, bevel=0.01)
            torus(0.085, 0.009, (0.0, 0.0615, 0.0), rx=math.pi / 2, mat="gilt", seg=32, tseg=6)
            cyl(0.06, 0.06, 0.012, 18, (0.0, 0.06, 0.0), mat="rune", bevel=0.0, emissive=1.0)
            box(0.05, 0.003, 0.18, (0.35, 0.056, 0.0), mat="gilt", bevel=0.0)                 # clasp strap


GLOBE_TILT = RAD(23.5)
GLOBE_C = polar(300, 3.4, 1.2)


def globe_stand():
    with at(polar(300, 3.4)):
        # three curved legs rising from bun feet to a turned collar
        for k in range(3):
            a = k * 2 * math.pi / 3 + 0.4
            p0 = (0.34 * math.cos(a), 0.02, 0.34 * math.sin(a))
            p1 = (0.38 * math.cos(a), 0.2, 0.38 * math.sin(a))
            p2 = (0.16 * math.cos(a), 0.55, 0.16 * math.sin(a))
            p3 = (0.045 * math.cos(a), 0.8, 0.045 * math.sin(a))
            tube(bezier(p0, p1, p2, p3, 14), [0.026 - 0.012 * i / 14 for i in range(15)], 10, "ebony")
            lathe([(0, 0), (0.035, 0), (0.03, 0.03), (0.0, 0.03)], 12, (p0[0], 0, p0[2]), mat="brass", bevel=0.004)
        lathe([(0, 0.78), (0.07, 0.78), (0.09, 0.82), (0.06, 0.86), (0.045, 0.9), (0.0, 0.9)], 18, mat="ebony", bevel=0.003)
        lathe([(0, 0.88), (0.025, 0.88), (0.022, 1.0), (0.0, 1.0)], 10, mat="brass", bevel=0.002)
        # the horizon ring and the tilted brass meridian
        lathe([(0.47, 0.88), (0.52, 0.88), (0.52, 0.92), (0.47, 0.92), (0.47, 0.88)], 64, mat="ebony", bevel=0.004, L=0.4)
        torus(0.5, 0.008, (0, 0.905, 0), rx=math.pi / 2, mat="brass", seg=64, tseg=6)
    with at(GLOBE_C, rz=GLOBE_TILT):
        torus(0.43, 0.017, (0, 0, 0), ry=0.0, mat="brass", seg=72, tseg=10)
        for sy in (-1, 1):
            lathe([(0, 0), (0.03, 0), (0.016, 0.06), (0.0, 0.06)], 12, (0, sy * 0.4 if sy > 0 else -0.4, 0), mat="brass", bevel=0.002, rx=0 if sy > 0 else math.pi)


def armillary(pos, scale=1.0):
    with at(pos, scale=scale):
        lathe([(0, 0), (0.08, 0), (0.07, 0.03), (0.035, 0.06), (0.03, 0.15), (0.05, 0.19), (0.0, 0.2)], 20, mat="brass", bevel=0.002)
        with at((0, 0.36, 0), rz=GLOBE_TILT):
            for a in (0.0, math.pi / 3, 2 * math.pi / 3):
                torus(0.15, 0.005, (0, 0, 0), ry=a, mat="brass", seg=48, tseg=6)
            torus(0.15, 0.005, (0, 0, 0), rx=math.pi / 2, mat="brass", seg=48, tseg=6)
            torus(0.11, 0.004, (0, 0.0, 0), rx=math.pi / 2, mat="brass", seg=48, tseg=6)
            sphere_uv(0.04, (0, 0, 0), "globe", usegs=24, vsegs=16)
            tube([(0, -0.19, 0), (0, 0.19, 0)], 0.004, 6, "brass")


def sconces():
    """Two brass wall sconces on the shelf pilasters, each holding a candle: they are real light sources."""
    out = []
    for a, side in ((162.4, -1), (187.6, 1)):
        a_r = RAD(a)
        rr = R - 0.36
        base = Vector((rr * math.sin(a_r), 2.1, rr * math.cos(a_r)))
        inward = -Vector((math.sin(a_r), 0, math.cos(a_r)))
        tang = Vector((math.cos(a_r), 0, -math.sin(a_r))) * side
        plate = base
        p0 = tuple(plate)
        p1 = tuple(plate + inward * 0.12 + Vector((0, 0.06, 0)))
        p2 = tuple(plate + inward * 0.2 + tang * 0.12 + Vector((0, -0.04, 0)))
        p3 = tuple(plate + inward * 0.2 + tang * 0.2 + Vector((0, 0.08, 0)))
        tube(bezier(p0, p1, p2, p3, 14), [0.012] * 15, 8, "brass")
        cup = plate + inward * 0.2 + tang * 0.2 + Vector((0, 0.08, 0))
        lathe([(0, 0), (0.035, 0), (0.05, 0.03), (0.035, 0.04), (0.0, 0.04)], 16, tuple(cup), mat="brass", bevel=0.002)
        cyl(0.017, 0.017, 0.15, 12, tuple(cup + Vector((0, 0.115, 0))), mat="candle", bevel=0.002)
        lathe([(0, 0), (0.014, 0.02), (0.011, 0.06), (0.0, 0.11)], 10, tuple(cup + Vector((0, 0.19, 0))), mat="flame", bevel=0.0)
        arcbox(0.08, 0.16, 0.025, a, R - 0.35, 2.1, mat="brass", bevel=0.008)
        out.append(dict(name=f"sconce{side}", pos=list(cup + Vector((0, 0.22, 0))), color=[1.0, 0.62, 0.3], intensity=1.8, range=4.2, flicker=1, shadow=0))
    return out


SCONCE_LIGHTS = []


# ----------------------------------------------------------------------------- scans
def catalogue():
    recs = import_model("vintage_wooden_drawer_01", 9000)
    with at(polar(268, 4.15), ry=RAD(268)):
        place(recs, scale=1.7, ry=math.pi)
    # an armillary and a stack of atlases on top
    top = 0.55 * 1.7
    armillary((polar(268, 4.15)[0] + 0.1, top, polar(268, 4.15)[2]), 0.9)


def console_set():
    recs = import_model("ClassicConsole_01", 12000)
    a = WIN_ANG
    with at(polar(a, 4.72), ry=RAD(a) + math.pi):
        place(recs)
    top = 0.95
    with at(polar(a, 4.72, top), ry=RAD(a)):
        place(import_model("marble_bust_01", 11000), pos=(-0.5, 0, 0), ry=math.pi + 0.3)
        place(import_model("mantel_clock_01", 9000), pos=(0.45, 0, 0), ry=math.pi, scale=1.15)
        place(import_model("vintage_oil_lamp", 12000), pos=(0.05, 0, 0.0), ry=math.pi, scale=0.8)


def armchair():
    x, _, z = polar(340, 2.0)
    with at((x, 0, z), ry=RAD(340) + math.pi + 0.3):
        place(import_model("ArmChair_01", 12000), scale=1.25)
    x, _, z = polar(176, 1.4)
    with at((x, 0, z), ry=RAD(176) + 0.15):
        place(import_model("WoodenChair_01", 14000), scale=0.95)


def grandfather():
    x, _, z = polar(161.5, 4.75)
    with at((x, 0, z), ry=RAD(161.5) + math.pi):
        place(import_model("vintage_grandfather_clock_01", 18000), scale=0.95)


def stool():
    x, _, z = polar(222, 3.2)
    with at((x, 0, z), ry=0.6):
        place(import_model("wooden_stool_01", 8000), scale=1.4)


def plants():
    with at(polar(193, 4.15), ry=0.5):
        place(import_model("potted_plant_02", 16000), scale=1.45)
        cyl(0.2, 0.2, 0.02, 14, (0, 0.46, 0), mat="soil", bevel=0.0)
    with at(polar(286, 4.25), ry=1.2):
        place(import_model("potted_plant_01", 16000, keep=("stem", "pot", "leaves")), scale=1.0)


def chest():
    with at(polar(35, 4.2), ry=RAD(35) + math.pi):
        place(import_model("treasure_chest", 10000), scale=1.15)


def candelabra():
    recs = import_model("brass_candleholders", 15000, keep=("candleholder_03",))
    with at(polar(176, 2.6, 0.9 + 0.0775), ry=RAD(176)):
        with at((0.88, 0, 0.06)):
            place(recs, per_object_base=True)


def shelf_scans():
    rows = ROWS
    rad = R - 0.56

    def spot(band, row, a):
        return polar(a, rad, rows[row] + 0.05), RAD(a)
    p, ry = spot(0, 2, 122)
    with at(p, ry=ry + math.pi):
        place(import_model("book_encyclopedia_set_01", 9000), scale=1.0)
    p, ry = spot(1, 3, 230)
    with at(p, ry=ry + math.pi):
        place(import_model("book_encyclopedia_set_01", 6000), scale=1.0)
    p, ry = spot(0, 4, 140)
    with at(p, ry=ry + math.pi + 0.25):
        place(import_model("antique_ceramic_vase_01", 9000), scale=1.25)
    p, ry = spot(1, 1, 214)
    with at(p, ry=ry + math.pi):
        place(import_model("ceramic_vase_01", 8000), scale=1.2)
    p, ry = spot(1, 4, 204)
    with at(p, ry=ry + math.pi):
        place(import_model("brass_vase_01", 10000), scale=0.8)
    p, ry = spot(0, 1, 132)
    with at(p, ry=ry + math.pi):
        place(import_model("Lantern_01", 9000), scale=1.4)


# ----------------------------------------------------------------------------- animated parts
def flying_book_model():
    """One open book hinged at its spine on the origin; the renderer opens the leaves."""
    with group("book"):
        box(0.06, 0.045, 0.35, mat="leather", tint_mode=1.0, tint=(1, 1, 1), bevel=0.01, segs=2)
        for side in (-1, 1):
            box(0.23, 0.014, 0.35, (side * 0.145, -0.016, 0), mat="leather", tint_mode=1.0, tint=(1, 1, 1), bevel=0.006, side=side)
            box(0.21, 0.03, 0.32, (side * 0.14, 0.008, 0), mat="paper", bevel=0.004, side=side)
            box(0.205, 0.004, 0.31, (side * 0.14, 0.028, 0), mat="paper", bevel=0.0, side=side)


def globe_model():
    with group("globe"):
        sphere_uv(0.38, (0, 0, 0), "globe")


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


# ----------------------------------------------------------------------------- build
def build():
    def stage(fn, *a):
        t0 = sum(b.n for b in BATCHES.values())
        fn(*a)
        print(f"[library]   {fn.__name__}: {sum(b.n for b in BATCHES.values()) - t0} corners", flush=True)

    for fn in (floor_and_platform, wall, railing, window, shelves, ladder_rail, desk, rug, ladder, floor_litter, lectern, globe_stand,
               catalogue, console_set, armchair, stool, plants, chest, candelabra, shelf_scans):
        stage(fn)
    SCONCE_LIGHTS.extend(sconces())
    book_units(); flying_book_model(); globe_model()
    win_c = polar(WIN_ANG, R - 0.5, WIN_Y)
    floor_pt = polar(WIN_ANG - 18, 1.1, 0.06)
    shaft_model(win_c, floor_pt, 0.68, 0.68 * 2.4)


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


def finish():
    items = sorted(BATCHES.items(), key=lambda kv: (kv[0][0] != "static", kv[0][0], kv[0][1]))
    # Static geometry shares one AO tree, so build it from every static batch.
    sP, sI, base = [], [], 0
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
    # AO tree over all static triangles in one vertex pool
    pool, tris, off = [], [], 0
    for (g, m), (u, I) in uniq.items():
        if g != "static":
            continue
        pool.append(np.ascontiguousarray(u[:, 0:3]).view(np.float32))
        tris.append(I + off)
        off += len(u)
    allP = np.concatenate(pool)
    allI = np.concatenate(tris)
    print(f"[library] AO tree: {len(allP)} verts, {len(allI)} tris", flush=True)
    tree = BVHTree.FromPolygons([tuple(map(float, p)) for p in allP], [tuple(map(int, t)) for t in allI], all_triangles=True)

    out_meshes, vparts, iparts, vbase = [], [], [], 0
    bounds_all = []
    packed_tmp = []
    for (g, m), (u, I) in uniq.items():
        Pu = np.ascontiguousarray(u[:, 0:3]).view(np.float32)
        Nu = np.ascontiguousarray(u[:, 3:6]).view(np.float32)
        Tu = np.ascontiguousarray(u[:, 6:8]).view(np.float32)
        Cu = np.ascontiguousarray(u[:, 8:9]).view(np.uint8).reshape(-1, 4)
        Du = np.ascontiguousarray(u[:, 9:10]).view(np.uint8).reshape(-1, 4).copy()
        if BATCHES[(g, m)].ao:
            ao = ao_bake(Pu, Nu, tree)
            Du[:, 0] = np.clip(np.clip(ao, 0, 1) ** 1.2 * 255, 0, 255).astype(np.uint8)
            print(f"[library] AO {g}/{m}: {len(Pu)} verts, mean {ao.mean():.2f}", flush=True)
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
        print(f"[library] {g}/{m}: {len(Pu)} verts, {len(idx) // 3} tris", flush=True)
        first += len(idx)
        vbase += len(Pu)
    vbytes = np.concatenate(vparts).tobytes()
    ibytes = np.concatenate(iparts).astype("<u4").tobytes()
    with open(os.path.join(OUT, "library.bin"), "wb") as fh:
        fh.write(vbytes + ibytes)

    # shelf books: sorted by variant, with per-instance ambient occlusion sampled on the spine, foot and head
    BOOK_INST.sort(key=lambda it: it["variant"])
    pts, nrm = [], []
    for it in BOOK_INST:
        m = frame(it["pos"], it["yaw"], 0.0, it["tilt"])
        for fy in (-0.42, 0.42):
            pts.append(tuple(m @ Vector((0, fy * it["h"], -it["d"] / 2 - 0.02))))
            nrm.append(tuple((m.to_3x3() @ Vector((0, 0, -1))).normalized()))
    aoI = ao_bake(np.array(pts, np.float32), np.array(nrm, np.float32), tree, nrays=48) if pts else np.array([])
    inst = np.zeros((len(BOOK_INST), 12), np.float32)
    variants = []
    for i, it in enumerate(BOOK_INST):
        a0, a1 = float(np.clip(aoI[2 * i], 0, 1) ** 1.2), float(np.clip(aoI[2 * i + 1], 0, 1) ** 1.2)
        inst[i] = [*it["pos"], it["yaw"], it["sx"], it["sy"], it["tilt"], a0, *it["tint"], a1]
    for vi in range(len(VARIANTS)):
        idx = [i for i, it in enumerate(BOOK_INST) if it["variant"] == vi]
        variants.append({"group": f"shelfbook{vi}", "first": idx[0] if idx else 0, "count": len(idx)})
    for i, it in enumerate(BOOK_INST):
        slots[it["slot"]]["inst"] = i
    inst.tofile(os.path.join(OUT, "library.books.bin"))
    print(f"[library] shelf books: {len(BOOK_INST)} instances", [v["count"] for v in variants], flush=True)

    sun_from = polar(WIN_ANG, R - 0.5, WIN_Y)
    sun_to = polar(WIN_ANG - 18, 1.1, 0.06)
    wn = Vector(polar(WIN_ANG, 1.0))
    wright = Vector((math.cos(RAD(WIN_ANG)), 0, -math.sin(RAD(WIN_ANG))))
    # the candelabra's light sits in the middle of its flames
    fl = uniq[("static", "flame")][0]
    fp = np.ascontiguousarray(fl[:, 0:3]).view(np.float32)
    dx, dz = polar(176, 2.6)[0], polar(176, 2.6)[2]
    near = (np.hypot(fp[:, 0] - dx, fp[:, 2] - dz) < 1.6) & (fp[:, 1] > 0.9)       # the desk's flames, not the sconces'
    fp = fp[near]
    cand_pos = [float(fp[:, 0].mean()), float(fp[:, 1].mean()) + 0.05, float(fp[:, 2].mean())]
    print("[library] candle light at", [round(v, 2) for v in cand_pos], flush=True)
    manifest = {
        "vertexBytes": len(vbytes), "stride": 28, "indexCount": int(first),
        "quant": {"min": qmin.tolist(), "size": qsize.tolist()},
        "meshes": out_meshes,
        "materials": [m for m in MATS.values() if any(mm["material"] == m["name"] for mm in out_meshes)],
        "lights": [
            {"name": "candelabra", "pos": cand_pos,
             "color": [1.0, 0.62, 0.3], "intensity": 7.0, "range": 7.5, "flicker": 1, "shadow": 1},
            {"name": "lectern", "pos": polar(320, 2.6, 1.7), "color": [0.5, 0.88, 1.0], "intensity": 2.4, "range": 3.6, "flicker": 0, "shadow": 0},
            {"name": "books", "pos": polar(176, 2.2, 3.1), "color": [0.55, 0.9, 1.0], "intensity": 1.5, "range": 4.5, "flicker": 0, "shadow": 0},
        ] + SCONCE_LIGHTS,
        "window": {"center": polar(WIN_ANG, R - 0.4, WIN_Y), "normal": list(wn), "right": list(wright), "radius": HOLE_R,
                   "towardSun": list((Vector(sun_from) - Vector(sun_to)).normalized()), "shaftFrom": sun_from, "shaftTo": sun_to},
        "globe": {"pos": list(GLOBE_C), "spin": 0.25, "tilt": GLOBE_TILT},
        "flyingCount": 4,
        "flyingBooks": [{"r": 1.5 + (i % 3) * 0.55, "a0": i / 7 * 2 * math.pi, "y": 2.5 + (i % 4) * 0.4, "sp": 0.35 + (i % 3) * 0.12,
                         "spread": 0.38 + (i * 0.037 % 0.16), "tint": list(BOOK_TINTS[i % len(BOOK_TINTS)])} for i in range(7)],
        "flyingCenter": polar(176, 2.2),
        "shelfBooks": {"file": "library.books.bin", "count": len(BOOK_INST), "variants": variants},
        "slots": slots,
        "camera": {"pos": polar(332, 4.6, 2.3), "target": polar(165, 2.4, 1.7)},
    }
    with open(os.path.join(OUT, "library.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)


bpy.ops.wm.read_factory_settings(use_empty=True)
build()
finish()
print("[library] done", flush=True)
