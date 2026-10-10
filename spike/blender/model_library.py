"""
Models the tower's library floor in Blender and exports it for the vgpu renderer.

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python spike/blender/model_library.py -- <out dir> [--blend <file>]

The layout is the one in src/tower/floors/library.ts (same polar placement, same seeded
sequence of choices), but every prop is a bevelled solid instead of a bare box, the wall has
a real window opening, and ambient occlusion is baked into the vertices by ray casting, so
the renderer needs no shadow or AO pass for the static room.

Built Y-up, in the three.js frame the site already uses (x = r sin a, z = r cos a), so the
numbers in the manifest are the same numbers the rest of the site speaks. Blender does not
care which axis is up while building; open the .blend with that in mind.

Vertex layout (20 bytes):
  p  unorm16x4   position inside the manifest's `quant` box: xyz = min + p * size (0.2 mm steps), w unused
  n  snorm8x4    normal, smoothed across angles under 40 degrees
  c  unorm8x4    rgb sRGB albedo, a = emissive amount
  d  unorm8x4    x = baked ambient occlusion, y = hinge side (0 none, 0 / 127 / 255 = -1 / 0 / +1
                 -> decoded as (y - 127) / 127), z = specular strength, w = tint tag (255: this
                 vertex takes the per-instance tint)

Output: library.bin (vertices then uint32 indices), library.json (mesh ranges, lights, window,
animated props, book slots).
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

R, WH = 5.4, 5.3
rng = random.Random(20260902)
rnd = rng.random
pick = lambda a: a[int(rnd() * len(a)) % len(a)]
RAD = math.radians


def polar(ang, rad, y=0.0):
    return (rad * math.sin(RAD(ang)), y, rad * math.cos(RAD(ang)))


# Site palette (src/tower/materials.ts), sRGB.
PAL = {k: v for k, v in {
    "plank_oak": "#a5712f", "plank_oak_dark": "#8a5b26", "wood_mid": "#8a5a2f", "wood_dark": "#6b4325",
    "wood_deep": "#472b17", "wood_ebony": "#33200f", "stone": "#4a4340", "stone_light": "#6b625c",
    "stone_warm": "#6d5f50", "cloth_red": "#b5352a", "cloth_red_dark": "#8b2419", "cloth_purple": "#63398c",
    "linen": "#c9b899", "paper": "#e0d4b4", "leaf_dark": "#20492a", "glass_blue": "#2f7fbf",
    "glass_green": "#2f9f6a", "glass_amber": "#c98a2f", "iron": "#4f4a46", "candle": "#efe6cf",
    "flame": "#ffc857", "brass": "#b8912f", "plant_pot": "#a8593a", "plant_pot_pale": "#c8a07a",
    "plant_soil": "#3a2a1e", "plant_leaf": "#3f8446", "plant_leaf_dark": "#2c5c30", "plant_leaf_pale": "#6faa55",
    "rune_glow": "#6fd0e8",
}.items()}


def rgb(name_or_hex):
    h = PAL.get(name_or_hex, name_or_hex).lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ----------------------------------------------------------------------------- batches
class Batch:
    """One output mesh: a list of per-primitive vertex blocks, merged and deduplicated at the end."""

    def __init__(self, name, ao=True):
        self.name, self.ao = name, ao
        self.P, self.N, self.C, self.D, self.I = [], [], [], [], []
        self.n = 0


BATCHES = {}


def batch(name, ao=True):
    if name not in BATCHES:
        BATCHES[name] = Batch(name, ao)
    return BATCHES[name]


STACK = [Matrix.Identity(4)]
CUR = ["static"]


class at:
    """Push a local frame (translate, then yaw, pitch, roll) for the primitives built inside it."""

    def __init__(self, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0):
        self.m = frame(pos, ry, rx, rz)

    def __enter__(self):
        STACK.append(STACK[-1] @ self.m)

    def __exit__(self, *a):
        STACK.pop()


class into:
    def __init__(self, name, ao=True):
        self.name, self.ao = name, ao

    def __enter__(self):
        batch(self.name, self.ao)
        CUR.append(self.name)

    def __exit__(self, *a):
        CUR.pop()


def frame(pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0):
    return (Matrix.Translation(Vector(pos)) @ Matrix.Rotation(ry, 4, "Y")
            @ Matrix.Rotation(rx, 4, "X") @ Matrix.Rotation(rz, 4, "Z"))


def emit(bm, M, color, emissive=0.0, spec=0.0, side=0, tag=0, smooth=40.0, flip=False):
    """Triangulate a primitive and append it, with per-corner normals smoothed under `smooth` degrees."""
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()
    cosA = math.cos(RAD(smooth))
    Mn = M.to_3x3()
    b = BATCHES[CUR[-1]]
    pos, nrm, idx = [], [], []
    for f in bm.faces:
        fn = f.normal
        for lp in f.loops:
            v = lp.vert
            acc = Vector((0, 0, 0))
            for f2 in v.link_faces:
                if f2.normal.dot(fn) >= cosA:
                    acc += f2.normal * f2.calc_area()
            if acc.length < 1e-12:
                acc = fn.copy()
            acc.normalize()
            pos.append(M @ v.co)
            nrm.append((Mn @ acc).normalized())
        k = len(pos)
        idx.append((k - 3, k - 2, k - 1))
    P = np.array([tuple(p) for p in pos], np.float32)
    N = np.array([tuple(n) for n in nrm], np.float32)
    I = np.array(idx, np.int64)
    if flip:
        N = -N
        I = I[:, ::-1]
    r, g, bl = rgb(color) if isinstance(color, str) else color
    C = np.tile(np.array([r, g, bl, int(emissive * 255)], np.uint8), (len(P), 1))
    D = np.tile(np.array([255, 127 + int(side * 127), int(spec * 255), tag], np.uint8), (len(P), 1))
    b.P.append(P); b.N.append(N); b.C.append(C); b.D.append(D); b.I.append(I + b.n)
    b.n += len(P)
    bm.free()


def split_long(bm, L, rounds=5, top_only=False):
    """Cut long edges so baked AO has vertices to land on. `top_only` leaves the sides alone: a floor
    plank only needs resolution on the face you walk on."""
    bm.faces.ensure_lookup_table()
    for _ in range(rounds):
        es = [e for e in bm.edges if e.calc_length() > L and (not top_only or any(f.normal.y > 0.9 for f in e.link_faces))]
        if not es:
            return
        bmesh.ops.subdivide_edges(bm, edges=es, cuts=1, use_grid_fill=True)


def box(w, h, d, pos=(0, 0, 0), ry=0.0, color="wood_dark", bevel=0.012, segs=1, rx=0.0, rz=0.0, L=0.45, top_only=False, **kw):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
    b = min(bevel, min(w, h, d) * 0.4)
    if b > 1e-4:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=b, offset_type="OFFSET", segments=segs, profile=0.5, affect="EDGES")
    split_long(bm, L, top_only=top_only)
    emit(bm, STACK[-1] @ frame(pos, ry, rx, rz), color, **kw)


def arcbox(w, h, d, ang, rad, y, ry_extra=0.0, **kw):
    """A box on the ring: local +z points out of the tower, as in util.ts arcBox."""
    a = RAD(ang)
    box(w, h, d, (rad * math.sin(a), y, rad * math.cos(a)), a + ry_extra, **kw)


def quad(w, h, pos, color, **kw):
    """A flat label facing local -z: gilt bands and spine labels, two triangles each."""
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in ((-w / 2, -h / 2, 0), (-w / 2, h / 2, 0), (w / 2, h / 2, 0), (w / 2, -h / 2, 0))]
    bm.faces.new(vs)
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.z > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    emit(bm, STACK[-1] @ frame(pos), color, **kw)


def lathe(profile, seg, pos=(0, 0, 0), ry=0.0, rx=0.0, rz=0.0, color="wood_dark", bevel=0.0, segs=1, L=0.5, **kw):
    """Surface of revolution about local +Y from (r, y) pairs, bottom to top; capped where r > 0."""
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
    emit(bm, STACK[-1] @ frame(pos, ry, rx, rz), color, **kw)


def cyl(rt, rb, h, seg, pos=(0, 0, 0), color="wood_dark", bevel=0.01, **kw):
    lathe([(0, -h / 2), (rb, -h / 2), (rt, h / 2), (0, h / 2)], seg, pos=pos, color=color, bevel=bevel, **kw)


def sphere(r, pos=(0, 0, 0), color="glass_blue", usegs=16, vsegs=10, paint=None, **kw):
    """UV sphere with poles on local Y. `paint(p) -> rgb` colours it per vertex (used by the globe)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=usegs, v_segments=vsegs, radius=r)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 3, "X"), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if paint:
        emit_painted(bm, STACK[-1] @ frame(pos), paint, **kw)
    else:
        emit(bm, STACK[-1] @ frame(pos), color, **kw)


def emit_painted(bm, M, paint, emissive=0.0, spec=0.0, smooth=89.0):
    emit_ = BATCHES[CUR[-1]]
    # reuse emit for the geometry, then recolour each vertex from its position on the sphere
    emit(bm, M, "#ffffff", emissive=emissive, spec=spec, smooth=smooth)
    P = emit_.P[-1]
    C = emit_.C[-1]
    inv = M.inverted()
    for i, p in enumerate(P):
        q = (inv @ Vector(p)).normalized()
        C[i, :3] = paint(q)


def torus(Rr, rr, pos=(0, 0, 0), ry=0.0, rx=0.0, seg=28, tseg=6, color="brass", **kw):
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
    emit(bm, STACK[-1] @ frame(pos, ry, rx), color, **kw)


def blade(base, direction, length, width, lift, droop, color, segs=5, **kw):
    """A curved leaf strip, double sided in the renderer. `direction` is horizontal."""
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
    # make sure the strip faces up
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.y < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    emit(bm, STACK[-1], color, **kw)


# ----------------------------------------------------------------------------- the room
BOOK_SKINS = ["cloth_red_dark", "glass_blue", "leaf_dark", "cloth_purple", "linen", "glass_green", "cloth_red", "glass_amber"]
BOOK_SKINS_FLOOR = ["cloth_red_dark", "glass_blue", "leaf_dark", "cloth_purple", "glass_amber"]
WIN_ANG, WIN_Y, WIN_R = 175.0, 3.4, 0.82
HOLE_R = WIN_R - 0.13
slots = []


def tone(color, k):
    r, g, b = rgb(color)
    return (max(0, min(255, int(r * k))), max(0, min(255, int(g * k))), max(0, min(255, int(b * k))))


def floor_and_platform():
    for z in np.arange(-R, R + 1e-6, 0.45):
        half = math.sqrt(max(R * R - z * z, 0))
        if half < 0.3:
            continue
        col = tone("plank_oak" if rnd() < 0.55 else "plank_oak_dark", 0.92 + rnd() * 0.16)
        box(half * 2, 0.2, 0.45, (0, -0.1, z), color=col, bevel=0.02, L=0.35, top_only=True)
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 30, color="wood_deep", L=2.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 26, color="stone", L=2.0)


def wall():
    # Panels around the arc, with the window cut through them: a panel that crosses the opening is
    # two boxes, one below and one above, instead of a slab with a picture frame stuck over it.
    for a in np.arange(100, 236 + 1e-6, 4.4):
        col = tone(pick(["wood_deep", "wood_ebony", "wood_deep"]), 0.95 + rnd() * 0.1)
        dx = (R - 0.2) * math.sin(RAD(a - WIN_ANG))
        if abs(dx) < HOLE_R:
            hh = math.sqrt(HOLE_R ** 2 - dx ** 2)
            lo, hi = WIN_Y - hh, WIN_Y + hh
            arcbox(0.35, lo, 0.3, a, R - 0.18, lo / 2, color=col, L=0.8)
            arcbox(0.35, WH - hi, 0.3, a, R - 0.18, hi + (WH - hi) / 2, color=col, L=0.8)
        else:
            arcbox(0.35, WH, 0.3, a, R - 0.18, WH / 2, color=col, L=0.8)
        arcbox(0.35, 0.8, 0.34, a, R - 0.2, WH - 0.4, color="wood_ebony")
        arcbox(0.35, 0.2, 0.38, a, R - 0.2, 0.12, color="wood_ebony")


def railing():
    for a in np.arange(356, 448 + 1e-6, 6.2):
        arcbox(0.14, 0.9, 0.14, a, R - 0.26, 0.44, color="wood_deep", bevel=0.02)
        arcbox(0.62, 0.14, 0.22, a, R - 0.26, 0.94, color="wood_dark", bevel=0.03)
        arcbox(0.62, 0.08, 0.12, a, R - 0.26, 0.48, color="wood_ebony", bevel=0.015)
    for a in (354, 450):
        arcbox(0.26, 1.3, 0.26, a, R - 0.26, 0.65, color="wood_deep", bevel=0.03)


def window():
    with at(polar(WIN_ANG, R - 0.4, WIN_Y), ry=RAD(WIN_ANG)):
        # A stone ring round the opening: real depth, the hole is open to the sky.
        lathe([(HOLE_R, -0.15), (WIN_R, -0.15), (WIN_R, 0.15), (HOLE_R, 0.15), (HOLE_R, -0.15)], 28, rx=math.pi / 2,
              color="stone_light", bevel=0.02, L=0.4)
        span = HOLE_R * 2
        box(0.1, span, 0.12, (0, 0, 0), color="wood_ebony", bevel=0.015)
        box(span, 0.1, 0.12, (0, 0, 0), color="wood_ebony", bevel=0.015)
        box(span + 0.3, 0.16, 0.5, (0, -WIN_R - 0.05, 0.1), color="stone_light", bevel=0.03)


def shelves():
    rows = [0.95, 1.62, 2.29, 2.96, 3.63, 4.3]
    for bi, (a0, a1) in enumerate([(104, 158), (194, 248)]):
        for ri, sy in enumerate(rows):
            for a in np.arange(a0, a1 + 1e-6, 4.4):
                arcbox(0.4, 0.12, 0.66, a, R - 0.54, sy, color="wood_dark", bevel=0.02)
            for a in np.arange(a0 + 1, a1 - 1 + 1e-6, 2.0):
                if rnd() < 0.2:
                    continue
                h = 0.3 + rnd() * 0.18
                lean = rnd() < 0.12
                book(a, sy, h, lean)
                slots.append({"band": bi, "angle": float(a), "row": ri, "height": h})
        for a in (a0 - 1, a1 + 1):
            arcbox(0.24, 4.7, 0.7, a, R - 0.54, 2.6, color="wood_ebony", bevel=0.02)
        for a in np.arange(a0, a1 + 1e-6, 4.4):
            arcbox(0.4, 4.7, 0.1, a, R - 0.24, 2.6, color="wood_ebony", bevel=0.0, L=1.2)


def book(a, sy, h, lean):
    """A shelf book: bevelled cloth cover, a paper block showing at the top and bottom, and the
    gilt bands and label on the spine that make a row read as books and not as crates."""
    skin = pick(BOOK_SKINS)
    col = tone(skin, 0.88 + rnd() * 0.24)
    ang = RAD(a)
    rad = R - 0.56
    tilt = (0.28 if rnd() < 0.5 else -0.28) if lean else 0.0
    w, d = 0.16, 0.3
    base = (rad * math.sin(ang), sy + 0.06 + h / 2 + (0.03 if lean else 0), rad * math.cos(ang))
    with at(base, ry=ang, rz=tilt):
        box(w, h, d, color=col, bevel=0.012, spec=0.1)
        for fy in (0.33, 0.67):
            quad(w + 0.004, 0.012, (0, (fy - 0.5) * h, -d / 2 - 0.0015), "brass", spec=0.6)
        if h > 0.38:
            quad(w * 0.72, h * 0.2, (0, 0.0, -d / 2 - 0.0025), "paper")


def desk():
    with at(polar(176, 2.6), ry=RAD(176)):
        box(2.3, 0.16, 1.0, (0, 0.94, 0), color="wood_dark", bevel=0.03)
        box(2.2, 0.4, 0.85, (0, 0.68, 0), color="wood_deep", bevel=0.02)
        for dx in (-0.95, 0.95):
            box(0.18, 0.86, 0.7, (dx, 0.43, 0), color="wood_ebony", bevel=0.025)
        # open tome
        with at((-0.25, 1.06, 0.05), ry=0.15):
            box(0.9, 0.06, 0.62, color="cloth_red_dark", bevel=0.02)
            for s in (-1, 1):
                with at((s * 0.2, 0.05, 0), rz=-s * 0.05):
                    box(0.38, 0.05, 0.54, color="paper", bevel=0.008, segs=1)
        box(0.42, 0.13, 0.32, (0.62, 1.08, -0.1), 0.4, color="glass_blue", bevel=0.015)
        box(0.4, 0.12, 0.3, (0.62, 1.2, -0.1), 0.15, color="leaf_dark", bevel=0.015)
        cyl(0.065, 0.075, 0.4, 12, (0.9, 1.22, 0.25), color="candle", bevel=0.01)
        with into("flame", ao=False):
            lathe([(0, 0), (0.04, 0.03), (0.035, 0.09), (0.0, 0.2)], 8, pos=(0.9, 1.43, 0.25), color="flame", emissive=1.0)
        cyl(0.1, 0.11, 0.18, 12, (0.3, 1.11, 0.35), color="iron", bevel=0.01, spec=0.5)


def stool():
    x, _, z = polar(166, 1.4)
    cyl(0.3, 0.34, 0.14, 12, (x, 0.62, z), color="wood_mid", bevel=0.02)
    for dx, dz in [(-0.2, -0.18), (0.2, -0.18), (0, 0.24)]:
        box(0.1, 0.6, 0.1, (x + dx, 0.3, z + dz), color="wood_deep", bevel=0.015, rz=dx * 0.2)


def ladder():
    with at(polar(214, 4.2), ry=RAD(214), rx=-0.16):
        for dx in (-0.28, 0.28):
            box(0.11, 4.6, 0.11, (dx, 2.3, 0), color="wood_mid", bevel=0.02)
        for i in range(11):
            box(0.6, 0.09, 0.11, (0, 0.35 + i * 0.42, 0), color="wood_dark", bevel=0.02)


def floor_litter():
    for _ in range(5):
        x, _, z = polar(rnd() * 360, 1.0 + rnd() * 2.8)
        n = 2 + int(rnd() * 4)
        for j in range(n):
            col = tone(pick(BOOK_SKINS_FLOOR), 0.9 + rnd() * 0.2)
            box(0.44 - j * 0.02, 0.13, 0.34, (x + (rnd() - 0.5) * 0.1, 0.07 + j * 0.13, z + (rnd() - 0.5) * 0.1),
                rnd() * math.pi, color=col, bevel=0.012, segs=1)
    for _ in range(16):
        x, _, z = polar(rnd() * 360, 0.8 + rnd() * 3.6)
        box(0.34 + rnd() * 0.16, 0.035, 0.26 + rnd() * 0.12, (x, 0.015, z), rnd() * math.pi, color="paper", bevel=0.006, segs=1)


def catalogue():
    with at(polar(268, 4.2), ry=RAD(268)):
        box(1.5, 1.5, 0.6, (0, 0.75, 0), color="wood_ebony", bevel=0.02)
        for r in range(5):
            for c in range(4):
                x, y = -0.55 + c * 0.36, 0.22 + r * 0.29
                box(0.33, 0.25, 0.06, (x, y, 0.32), color="wood_dark", bevel=0.012, segs=1)
                box(0.1, 0.05, 0.05, (x, y, 0.37), color="brass", bevel=0.01, segs=1, spec=0.6)
        box(1.6, 0.1, 0.68, (0, 1.55, 0), color="wood_deep", bevel=0.02)
        box(0.4, 0.1, 0.3, (0.35, 1.65, 0.05), 0.2, color="paper", bevel=0.01)


def lectern():
    with at(polar(320, 2.6), ry=RAD(320)):
        box(0.6, 0.14, 0.6, (0, 0.07, 0), color="wood_deep", bevel=0.025)
        cyl(0.12, 0.18, 1.15, 10, (0, 0.68, 0), color="wood_dark", bevel=0.015)
        with at((0, 1.3, 0), rx=-0.4):
            box(0.8, 0.08, 0.6, color="wood_dark", bevel=0.02)
        with at((0, 1.4, 0.03), rx=-0.4):
            box(0.66, 0.14, 0.48, color="cloth_purple", bevel=0.025, spec=0.2)
            box(0.6, 0.1, 0.44, (0, 0, 0.0), color="paper", bevel=0.0)
            box(0.64, 0.02, 0.46, (0, 0.075, 0), color="brass", bevel=0.0, spec=0.6)
        box(0.05, 0.7, 0.05, (0.3, 1.0, 0.1), color="iron", bevel=0.01, segs=1, spec=0.5)


def globe_stand():
    with at(polar(300, 3.4)):
        box(0.5, 0.12, 0.5, (0, 0.06, 0), color="wood_deep", bevel=0.025)
        cyl(0.09, 0.12, 0.7, 10, (0, 0.45, 0), color="wood_dark", bevel=0.01)
        torus(0.44, 0.03, (0, 1.2, 0), ry=0.4, color="brass", spec=0.7)


def chair():
    x, _, z = polar(340, 1.9)
    with at((x, 0, z), ry=RAD(340)):
        box(0.75, 0.2, 0.7, (0, 0.5, 0.0), color="cloth_red_dark", bevel=0.06, segs=3)
        box(0.75, 0.85, 0.18, (0, 0.95, 0.32), color="cloth_red_dark", bevel=0.06, segs=3)
        for sx in (-1, 1):
            for sz in (-1, 1):
                box(0.08, 0.4, 0.08, (sx * 0.31, 0.2, sz * 0.28), color="wood_deep", bevel=0.015, segs=1)
            box(0.1, 0.1, 0.62, (sx * 0.4, 0.72, 0.0), color="wood_deep", bevel=0.02)


def book_tower():
    for i in range(9):
        col = tone(pick(BOOK_SKINS_FLOOR), 0.9 + rnd() * 0.2)
        box(0.46 - (i % 3) * 0.03, 0.13, 0.34, (1.55, 0.07 + i * 0.13, -1.6), rnd() * 0.5, color=col, bevel=0.012, segs=1)


def plant(ang, rad, scale=1.0, kind=0, pot="plant_pot"):
    x, _, z = polar(ang, rad)
    yaw = RAD(ang) + rnd() * 0.8
    with at((x, 0, z), ry=yaw):
        s = scale
        pr = (0.34 if kind == 1 else 0.26) * s
        lathe([(0, 0), (pr * 0.78, 0), (pr, 0.34 * s), (pr + 0.04 * s, 0.36 * s), (pr + 0.02 * s, 0.4 * s), (pr - 0.04 * s, 0.39 * s),
               (pr - 0.05 * s, 0.35 * s), (0, 0.35 * s)], 12, color=pot, bevel=0.008, spec=0.1)
        greens = ["plant_leaf", "plant_leaf_dark", "plant_leaf_pale"]
        n = {0: 9, 1: 14, 2: 9}[kind]
        for i in range(n):
            a = i / n * 2 * math.pi + rnd() * 0.5
            dirv = (math.sin(a), 0, math.cos(a))
            ln = (0.5 + rnd() * 0.45) * s if kind == 0 else (0.38 + rnd() * 0.22) * s
            lift = (1.3 + rnd() * 0.6) if kind == 0 else (0.7 + rnd() * 0.5)
            droop = (0.9 + rnd() * 0.5) if kind == 0 else (0.5 + rnd() * 0.4)
            if kind == 2:
                lift, droop = 0.3, 1.3
            wd = (0.16 + rnd() * 0.06) * s
            col = tone(pick(greens), 0.9 + rnd() * 0.2)
            blade((math.sin(a) * 0.04 * s, 0.37 * s, math.cos(a) * 0.04 * s), dirv, ln, wd, lift, droop, col, spec=0.1)
        if kind == 1 and rnd() < 0.9:
            for i in range(3):
                a = rnd() * 2 * math.pi
                sphere(0.045 * s, (math.sin(a) * 0.16 * s, (0.62 + rnd() * 0.2) * s, math.cos(a) * 0.16 * s), color="#e8748f", usegs=8, vsegs=6)


# ----------------------------------------------------------------------------- animated parts
def flying_book_model():
    """One open book, hinged at its spine on the origin and lying flat; the renderer opens the leaves."""
    with into("book", ao=False):
        box(0.08, 0.055, 0.35, color="#ffffff", bevel=0.01, segs=1, tag=255)
        for side in (-1, 1):
            box(0.23, 0.035, 0.35, (side * 0.145, 0, 0), color="#ffffff", bevel=0.01, segs=1, side=side, tag=255)
            box(0.21, 0.03, 0.32, (side * 0.14, 0.032, 0), color="paper", bevel=0.005, segs=1, side=side)
            box(0.2, 0.012, 0.31, (side * 0.14, 0.052, 0), color="paper", bevel=0.0, side=side)


def globe_model():
    def paint(p):
        n = noise.fractal(Vector((p.x * 2.2 + 3.1, p.y * 2.2, p.z * 2.2)), 0.5, 2.0, 4)
        if n > 0.02:
            land = 0.35 + 0.5 * min(1.0, (n - 0.02) * 5)
            return (int(60 + 120 * land), int(120 + 70 * land), int(60 + 20 * land))
        return (int(36 + 20 * (n + 0.3)), int(100 + 40 * (n + 0.3)), 180)
    with into("globe", ao=False):
        sphere(0.38, color="#ffffff", usegs=28, vsegs=18, paint=paint, emissive=0.18, spec=0.5)


def shaft_model(frm, to, r1, r2, seg=14):
    """The visible sunbeam: an open cone from the window to the floor. d.x holds the position along it."""
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
    with into("shaft", ao=False):
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        b = BATCHES["shaft"]
        P, I = [], []
        for f_ in bm.faces:
            for v_ in f_.verts:
                P.append(tuple(v_.co))
            k = len(P)
            I.append((k - 3, k - 2, k - 1))
        P = np.array(P, np.float32)
        # position along the beam, and the outward radial direction (used to fade the beam's edge)
        tpar = np.clip(((P - np.array(frm, np.float32)) @ np.array(tuple(ax), np.float32)) / ln, 0, 1)
        on_axis = np.array(frm, np.float32) + np.outer(tpar * ln, np.array(tuple(ax), np.float32))
        rad = P - on_axis
        rad /= np.maximum(np.linalg.norm(rad, axis=1, keepdims=True), 1e-6)
        C = np.tile(np.array([255, 220, 166, 0], np.uint8), (len(P), 1))
        D = np.zeros((len(P), 4), np.uint8)
        D[:, 0] = (tpar * 255).astype(np.uint8)
        b.P.append(P); b.N.append(rad.astype(np.float32)); b.C.append(C); b.D.append(D)
        b.I.append(np.array(I, np.int64) + b.n)
        b.n += len(P)
        bm.free()


# ----------------------------------------------------------------------------- build
def build():
    batch("static")
    CUR[:] = ["static"]
    def stage(name, fn, *a):
        t0 = BATCHES["static"].n
        fn(*a)
        print(f"[library]   {name}: {BATCHES['static'].n - t0} verts", flush=True)
    for fn in (floor_and_platform, wall, railing, window, shelves, desk, stool, ladder, floor_litter,
               catalogue, lectern, globe_stand, chair, book_tower):
        stage(fn.__name__, fn)
    stage("plant", plant, 190, 4.5, 1.15, 0)
    stage("plant", plant, 284, 4.3, 0.85, 2, "plant_pot_pale")
    CUR[:] = ["static"]
    flying_book_model(); globe_model()
    win_c = polar(WIN_ANG, R - 0.5, WIN_Y)
    floor_pt = polar(WIN_ANG - 18, 1.1, 0.06)
    shaft_model(win_c, floor_pt, 0.68, 0.68 * 2.4)


def ao_bake(P, N, tree, nrays=28, maxd=1.7):
    # fixed stratified cosine-weighted hemisphere
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
        o = Vector(P[i]) + n * 0.02
        occ = 0.0
        for dx, dy, dz in dirs:
            d = t * dx + b * dy + n * dz
            hit = tree.ray_cast(o, d, maxd)
            if hit[0] is not None:
                occ += 1.0 - (hit[3] / maxd) ** 0.7 * 0.6
        out[i] = 1.0 - occ / nrays
    return out


def finish():
    metas = {}
    all_v, all_i = [], []
    base = 0
    for name, b in BATCHES.items():
        P = np.concatenate(b.P); N = np.concatenate(b.N); C = np.concatenate(b.C); D = np.concatenate(b.D)
        I = np.concatenate(b.I)
        # deduplicate identical corners
        rec = np.concatenate([P.view(np.uint32), N.view(np.uint32), C.view(np.uint32), D.view(np.uint32)], axis=1)
        uniq, inv = np.unique(rec, axis=0, return_inverse=True)
        inv = inv.reshape(-1)
        Pu = np.ascontiguousarray(uniq[:, 0:3]).view(np.float32)
        Nu = np.ascontiguousarray(uniq[:, 3:6]).view(np.float32)
        Cu = np.ascontiguousarray(uniq[:, 6:7]).view(np.uint8).reshape(-1, 4)
        Du = np.ascontiguousarray(uniq[:, 7:8]).view(np.uint8).reshape(-1, 4).copy()
        I = inv[I]
        keep = (I[:, 0] != I[:, 1]) & (I[:, 1] != I[:, 2]) & (I[:, 0] != I[:, 2])
        I = I[keep]
        if b.ao:
            tree = BVHTree.FromPolygons([tuple(map(float, p)) for p in Pu], [tuple(map(int, t)) for t in I], all_triangles=True)
            ao = ao_bake(Pu, Nu, tree)
            # AO is a gentle multiplier: crush the range so open surfaces stay at 1
            ao = np.clip(ao, 0, 1) ** 1.25
            Du[:, 0] = np.clip(ao * 255, 0, 255).astype(np.uint8)
        all_v.append((Pu, Nu, Cu, Du))
        all_i.append((I + base).astype(np.uint32).reshape(-1))
        metas[name] = {"firstVertex": base, "vertexCount": len(Pu), "triangles": int(len(I)),
                       "bounds": [Pu.min(axis=0).tolist(), Pu.max(axis=0).tolist()]}
        base += len(Pu)
        print(f"[library] {name}: {len(Pu)} verts, {len(I)} tris", flush=True)
    # One quantisation box for every mesh, so a single pair of constants decodes them all.
    allP = np.concatenate([v[0] for v in all_v])
    qmin = allP.min(axis=0) - 0.01
    qsize = (allP.max(axis=0) - qmin) + 0.01
    packed = []
    for Pu, Nu, Cu, Du in all_v:
        verts = np.zeros(len(Pu), dtype=[("p", "<u2", 4), ("n", "i1", 4), ("c", "u1", 4), ("d", "u1", 4)])
        verts["p"][:, :3] = np.round((Pu - qmin) / qsize * 65535).astype(np.uint16)
        verts["n"][:, :3] = np.round(np.clip(Nu, -1, 1) * 127).astype(np.int8)
        verts["c"], verts["d"] = Cu, Du
        packed.append(verts)
    vbytes = np.concatenate(packed).tobytes()
    first = 0
    for (name, m), ii in zip(metas.items(), all_i):
        m["firstIndex"], m["indexCount"] = first, len(ii)
        first += len(ii)
    ibytes = np.concatenate(all_i).astype("<u4").tobytes()
    with open(os.path.join(OUT, "library.bin"), "wb") as fh:
        fh.write(vbytes + ibytes)

    sun_from = polar(WIN_ANG, R - 0.5, WIN_Y)
    sun_to = polar(WIN_ANG - 18, 1.1, 0.06)
    wn = Vector(polar(WIN_ANG, 1.0))          # outward normal of the window plane
    wright = Vector((math.cos(RAD(WIN_ANG)), 0, -math.sin(RAD(WIN_ANG))))
    manifest = {
        "vertexBytes": len(vbytes), "stride": 20, "quant": {"min": qmin.tolist(), "size": qsize.tolist()}, "indexCount": int(first), "meshes": metas,
        "lights": [
            {"name": "desk", "pos": polar(176, 2.5, 1.8), "color": [1.0, 0.69, 0.4], "intensity": 9, "range": 6, "flicker": 1},
            {"name": "lectern", "pos": polar(320, 2.6, 2.0), "color": [0.66, 0.95, 1.0], "intensity": 5, "range": 3.5, "flicker": 0},
            {"name": "books", "pos": polar(176, 2.2, 3.1), "color": [0.66, 0.95, 1.0], "intensity": 3, "range": 4.5, "flicker": 0},
            {"name": "halo", "pos": polar(WIN_ANG, R - 1.0, WIN_Y), "color": [1.0, 0.89, 0.69], "intensity": 14, "range": 5, "flicker": 0},
        ],
        "window": {
            "center": polar(WIN_ANG, R - 0.4, WIN_Y), "normal": list(wn), "right": list(wright), "radius": HOLE_R,
            "mullion": 0.05, "towardSun": list((Vector(sun_from) - Vector(sun_to)).normalized()),
            "shaftFrom": sun_from, "shaftTo": sun_to,
        },
        "globe": {"pos": polar(300, 3.4, 1.2), "spin": 0.25},
        "flyingBooks": [{"r": 1.5 + (i % 3) * 0.55, "a0": i / 7 * 2 * math.pi, "y": 2.5 + (i % 4) * 0.4, "sp": 0.35 + (i % 3) * 0.12,
                         "spread": 0.38 + (i * 0.037 % 0.16), "skin": rgb(BOOK_SKINS_FLOOR[i % 5])} for i in range(7)],
        "flyingCenter": polar(176, 2.2),
        "slots": slots,
        "camera": {"pos": polar(332, 4.6, 2.3), "target": polar(165, 2.4, 1.7)},
    }
    with open(os.path.join(OUT, "library.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)


bpy.ops.wm.read_factory_settings(use_empty=True)
build()
finish()
if BLEND:
    # Hand-editable copy: one object per batch, rebuilt from the baked data.
    for name, b in BATCHES.items():
        P = np.concatenate(b.P); I = np.concatenate(b.I)
        me = bpy.data.meshes.new(name)
        me.from_pydata(P.tolist(), [], I.tolist())
        me.update()
        bpy.context.scene.collection.objects.link(bpy.data.objects.new(name, me))
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("[library] done", flush=True)
