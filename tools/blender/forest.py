"""
The forest world's kit, modelled in Blender from code and exported as one glTF.

    blender -b --factory-startup --python tools/blender/forest.py -- public/worlds/forest.glb
    python tools/blender/forest.py public/worlds/forest.glb      # with the `bpy` module installed

Deterministic (fixed seeds), no textures, no UVs. Everything is low-poly and
flat-shaded to sit with the tower, which is boxes and cylinders drawn at a
chunky pixel scale; the detail comes from silhouette, vertex colour and baked
ambient occlusion, not from texture. What it makes, one mesh object each:

    oak_a, oak_b, conifer           near trees: trunk with a root flare,
                                    branches as tapered tubes, foliage clumps
                                    grown on the branch tips (not floating)
    oak_a_far, oak_b_far,
    conifer_far                     the same silhouettes at a fraction of the
                                    triangles, for the trees past ~75 m
    clump                           a loose canopy clump, for the leaf ceiling
                                    over the tower
    rock_a, rock_b, log             ground cover, mossy where they face up
    fern                            a rosette of arched fronds
    bloom_stem, bloom_petals        a flower in two parts, so the runtime can
                                    tint the petals per instance

Units are metres, Z up here (the exporter writes Y up). Trees are about 24 m
tall at scale 1; the runtime scales instances 0.8-1.5 uniformly.

Vertex colour carries the paint and the occlusion: each vertex's colour is
its material colour (graded by height and a little noise) times an AO term
from rays cast against the whole object and the ground. Normals are not
exported; the runtime shades flat from screen derivatives, which is what
the rest of the scene does.
"""
import math, os, random, sys

import bpy  # first: it makes bmesh and mathutils importable when run as a module
import bmesh
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[0] if argv else "public/worlds/forest.glb")
AO_RAYS = 40            # rays per vertex for the baked occlusion
AO_REACH = 6.0          # metres a ray looks for an occluder

# ------------------------------------------------------------------ palette
# Desaturated, a little warm: a forest at the edge of evening rather than a
# saturated game green, so it sits under either theme of the page.
LEAF_TOP = (0.47, 0.58, 0.25)
LEAF_MID = (0.31, 0.44, 0.19)
LEAF_LOW = (0.17, 0.27, 0.13)
LEAF_B_TOP = (0.58, 0.58, 0.24)      # the second oak, more olive
LEAF_B_LOW = (0.24, 0.29, 0.12)
NEEDLE_TOP = (0.27, 0.40, 0.25)
NEEDLE_LOW = (0.12, 0.21, 0.15)
BARK = (0.33, 0.25, 0.18)
BARK_DARK = (0.19, 0.14, 0.10)
MOSS = (0.30, 0.40, 0.17)
ROCK = (0.38, 0.37, 0.33)
ROCK_DARK = (0.22, 0.22, 0.20)
FERN_TIP = (0.45, 0.60, 0.26)
FERN_BASE = (0.20, 0.33, 0.14)
STEM = (0.25, 0.42, 0.18)
WHITE = (1.0, 1.0, 1.0)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scale(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in c)


# ------------------------------------------------------------ mesh helpers
class Part:
    """Geometry being assembled for one object, with a paint function per
    batch of faces: paint(co, normal) -> rgb."""

    def __init__(self):
        self.bm = bmesh.new()
        self.paint = {}      # face index -> painter

    def add_faces(self, faces, painter):
        for f in faces:
            self.paint[f] = painter


def tube(part, pts, radii, sides, painter, cap_end=False, twist=0.0):
    """A tapered tube through `pts`, one ring per point."""
    bm = part.bm
    rings = []
    for i, (p, r) in enumerate(zip(pts, radii)):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        # a frame perpendicular to the path
        up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
        u = d.cross(up).normalized()
        v = d.cross(u).normalized()
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides + twist * i
            # bark is not round: a little noise in the radius
            rr = r * (1.0 + 0.12 * noise.noise(p * 0.9 + Vector((k, 0, 0))))
            ring.append(bm.verts.new(p + (u * math.cos(a) + v * math.sin(a)) * rr))
        rings.append(ring)
    faces = []
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            faces.append(bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])))
    if cap_end:
        faces.append(bm.faces.new(list(reversed(rings[-1]))))
    part.add_faces(faces, painter)
    return rings


def blob(part, center, size, painter, subdiv=2, rough=0.22, seed=0.0, flatten=0.8):
    """A displaced icosphere: the unit of foliage and of stone. bmesh counts
    subdivisions from 1 = the bare icosahedron (20 faces); 2 is 80 faces."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0)
    c = Vector(center)
    sx, sy, sz = size
    verts = {}
    for v in tmp.verts:
        n = v.co.normalized()
        d = 1.0 + rough * noise.noise(n * 1.7 + Vector((seed, seed * 0.7, seed * 1.3)))
        p = Vector((n.x * sx * d, n.y * sy * d, n.z * sz * d))
        if p.z < 0:
            p.z *= flatten          # clumps sag flatter underneath
        verts[v] = part.bm.verts.new(c + p)
    faces = [part.bm.faces.new([verts[v] for v in f.verts]) for f in tmp.faces]
    tmp.free()
    part.add_faces(faces, painter)
    return faces


def finish(part, name, ao_ground=True, ao_strength=0.7):
    """Paint every vertex (average of its faces' painters, times baked AO)
    and turn the bmesh into an object."""
    bm = part.bm
    bm.verts.index_update()
    bm.faces.index_update()
    bm.normal_update()
    # painter per vertex: the first face that claims it (parts don't share verts)
    painter_of = {}
    for f, p in part.paint.items():
        for v in f.verts:
            painter_of.setdefault(v.index, p)

    # occlusion: rays against the object itself, and the ground plane
    tree = BVHTree.FromBMesh(bm)
    rnd = random.Random(7)
    dirs = []
    for _ in range(AO_RAYS):      # cosine-weighted hemisphere around +Z
        u, w = rnd.random(), rnd.random()
        r, a = math.sqrt(u), 2 * math.pi * w
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))

    cols = {}
    for v in bm.verts:
        n = v.normal if v.normal.length > 0 else Vector((0, 0, 1))
        # rotate the hemisphere onto the normal
        q = Vector((0, 0, 1)).rotation_difference(n)
        o = v.co + n * 0.03
        hit = 0
        for d in dirs:
            dd = q @ d
            if tree.ray_cast(o, dd, AO_REACH)[0] is not None:
                hit += 1
            elif ao_ground and dd.z < 0 and o.z > 0:
                # the ground at z = 0 stops a downward ray within reach
                t = -o.z / dd.z
                if t < AO_REACH:
                    hit += 1
        ao = 1.0 - ao_strength * (hit / len(dirs))
        base = painter_of.get(v.index, lambda co, nn: WHITE)(v.co, n)
        cols[v.index] = scale(base, ao)

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    for i, c in cols.items():
        attr.data[i].color = (*c, 1.0)
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    print(f"  {name}: {len(me.polygons)} faces, {len(me.vertices)} verts")
    return obj


# ---------------------------------------------------------------- painters
def bark_painter(top):
    def p(co, n):
        # darker in the cracks (noise), moss creeping up the shaded side
        c = mix(BARK_DARK, BARK, 0.55 + 0.45 * noise.noise(co * Vector((2.0, 2.0, 0.4))))
        moss = max(0.0, 1.0 - co.z / 3.2) * (0.55 + 0.45 * max(0.0, -n.y))
        return mix(c, MOSS, moss)
    return p


def leaf_painter(top, mid, low, zlo, zhi):
    def p(co, n):
        h = (co.z - zlo) / max(0.001, zhi - zlo)
        c = mix(low, mid, h * 1.6) if h < 0.6 else mix(mid, top, (h - 0.6) / 0.4)
        # sunlit tops and patchy variation, so clumps read as clumps
        c = mix(c, top, 0.35 * max(0.0, n.z))
        return scale(c, 0.9 + 0.2 * noise.noise(co * 0.6))
    return p


# ------------------------------------------------------------------- trees
def broadleaf(name, seed, height=24.0, far=False, top=LEAF_TOP, low=LEAF_LOW):
    rnd = random.Random(seed)
    part = Part()
    sides = 5 if far else 8
    # the trunk leans and wanders a little; a root flare at the base
    pts, radii = [], []
    n = 6 if far else 9
    lean = Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), 0))
    for i in range(n):
        t = i / (n - 1)
        z = -0.4 + t * height * 0.62
        wob = Vector((noise.noise(Vector((t * 3, seed, 0))), noise.noise(Vector((0, t * 3, seed))), 0)) * 0.5
        pts.append(Vector((0, 0, z)) + lean * t + wob)
        radii.append(1.35 * (1 - 0.6 * t) + (1.1 * (1 - t / 0.2) if t < 0.2 else 0.0))
    tube(part, pts, radii, sides, bark_painter(top))

    # branches: from the upper trunk, out and up, each ending in a clump
    zlo, zhi = height * 0.42, height * 1.02
    paint = leaf_painter(top, LEAF_MID if top == LEAF_TOP else mix(LEAF_MID, top, 0.4), low, zlo, zhi)
    nb = 4 if far else 6
    crown_top = pts[-1]
    # One mass of foliage, not balls on sticks: the clumps overlap. A big
    # one caps the trunk, the branches end in clumps that reach back into
    # it, and a ring of fillers closes the crown from below.
    clumps = [(crown_top + Vector((0, 0, height * 0.12)), height * 0.21)]
    for b in range(nb):
        a = (b / nb) * 2 * math.pi + rnd.uniform(-0.35, 0.35)
        t0 = rnd.uniform(0.6, 0.9)
        base = pts[int(t0 * (len(pts) - 1))]
        reach = height * rnd.uniform(0.13, 0.20)
        rise = height * rnd.uniform(0.10, 0.18)
        d = Vector((math.cos(a), math.sin(a), 0))
        bp = [base, base + d * reach * 0.45 + Vector((0, 0, rise * 0.5)), base + d * reach + Vector((0, 0, rise))]
        if not far:
            tube(part, bp, [radii[int(t0 * (len(pts) - 1))] * 0.6, 0.4, 0.2], 5, bark_painter(top))
        clumps.append((bp[-1] + Vector((0, 0, height * 0.03)), height * rnd.uniform(0.15, 0.19)))
    if not far:
        for k in range(4):
            a = (k / 4) * 2 * math.pi + 0.6
            d = Vector((math.cos(a), math.sin(a), 0))
            clumps.append((crown_top + d * height * 0.12 - Vector((0, 0, height * 0.02)),
                           height * rnd.uniform(0.11, 0.14)))
    for i, (c, s) in enumerate(clumps):
        blob(part, c, (s, s * rnd.uniform(0.85, 1.1), s * 0.78), paint,
             subdiv=1 if far else 2, rough=0.28, seed=seed * 3.1 + i)
    return finish(part, name + ("_far" if far else ""))


def conifer(name, seed, height=26.0, far=False):
    rnd = random.Random(seed)
    part = Part()
    tube(part, [(0, 0, -0.4), (0, 0, height * 0.5), (0, 0, height * 0.92)],
         [0.8, 0.45, 0.12], 5 if far else 7, bark_painter(NEEDLE_TOP))
    tiers = 4 if far else 7
    sides = 7 if far else 9
    bm = part.bm
    paint = leaf_painter(NEEDLE_TOP, mix(NEEDLE_LOW, NEEDLE_TOP, 0.5), NEEDLE_LOW, height * 0.2, height)
    for i in range(tiers):
        t = i / (tiers - 1)
        z0 = height * (0.22 + 0.68 * t)
        r = height * (0.24 * (1 - t) + 0.05)
        h = height * (0.30 - 0.12 * t)
        # a cone with a ragged, drooping rim: alternate long and short points
        apex = bm.verts.new((0, 0, z0 + h))
        rim = []
        for k in range(sides * 2):
            a = math.pi * k / sides + i * 0.37
            rr = r * (1.0 if k % 2 == 0 else 0.72) * rnd.uniform(0.9, 1.08)
            rim.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z0 - (0.6 if k % 2 == 0 else 0.1))))
        inner = bm.verts.new((0, 0, z0 + h * 0.12))
        faces = []
        for k in range(len(rim)):
            faces.append(bm.faces.new((apex, rim[k], rim[(k + 1) % len(rim)])))
            faces.append(bm.faces.new((inner, rim[(k + 1) % len(rim)], rim[k])))
        part.add_faces(faces, paint)
    return finish(part, name + ("_far" if far else ""))


def canopy_clump(name):
    part = Part()
    paint = leaf_painter(LEAF_TOP, LEAF_MID, LEAF_LOW, -3.0, 3.0)
    blob(part, (0, 0, 0), (4.2, 3.6, 2.6), paint, subdiv=2, rough=0.3, seed=11)
    blob(part, (2.6, 1.0, 0.6), (2.6, 2.4, 1.9), paint, subdiv=2, rough=0.3, seed=12)
    blob(part, (-2.2, -1.2, 0.4), (2.4, 2.2, 1.8), paint, subdiv=2, rough=0.3, seed=13)
    return finish(part, name, ao_ground=False, ao_strength=0.6)


# -------------------------------------------------------------- ground cover
def rock(name, seed, size):
    part = Part()

    def paint(co, n):
        c = mix(ROCK_DARK, ROCK, 0.5 + 0.5 * noise.noise(co * 1.3))
        return mix(c, MOSS, max(0.0, (n.z - 0.55) / 0.45) * 0.85)
    blob(part, (0, 0, size[2] * 0.35), size, paint, subdiv=2, rough=0.33, seed=seed, flatten=0.5)
    return finish(part, name)


def log(name):
    part = Part()
    pts = [(-4.0, 0, 0.55), (-1.3, 0.15, 0.62), (1.4, -0.1, 0.58), (4.2, 0.1, 0.5)]

    def paint(co, n):
        c = bark_painter(None)(Vector((co.x, co.y, 5.0)), n)   # no base moss
        return mix(c, MOSS, max(0.0, n.z - 0.3) * 1.1)
    tube(part, pts, [0.62, 0.6, 0.56, 0.5], 8, paint, cap_end=True)
    # the broken stump of a branch
    tube(part, [(1.0, 0.2, 0.9), (1.4, 0.6, 1.8), (1.5, 0.7, 2.4)], [0.22, 0.14, 0.06], 5, paint)
    return finish(part, name)


def fern(name):
    part = Part()
    bm = part.bm
    rnd = random.Random(5)

    def paint(co, n):
        return mix(FERN_BASE, FERN_TIP, co.length / 1.6)
    faces = []
    for f in range(7):
        a = 2 * math.pi * f / 7 + rnd.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-d.y, d.x, 0))
        L = rnd.uniform(1.3, 1.7)
        steps = 6
        prev = None
        for s in range(steps + 1):
            t = s / steps
            # arching frond: up, then over
            c = d * (L * t) + Vector((0, 0, math.sin(t * math.pi * 0.85) * 0.9))
            w = 0.32 * math.sin(math.pi * min(1.0, t * 1.15)) + 0.02
            l, r = bm.verts.new(c + side * w), bm.verts.new(c - side * w)
            m = bm.verts.new(c + Vector((0, 0, 0.05)))
            if prev:
                pl, pm, pr = prev
                faces.append(bm.faces.new((pl, l, m, pm)))
                faces.append(bm.faces.new((pm, m, r, pr)))
            prev = (l, m, r)
    part.add_faces(faces, paint)
    return finish(part, name, ao_strength=0.5)


def bloom():
    stem = Part()
    tube(stem, [(0, 0, 0), (0.03, 0.0, 0.5), (0.0, 0.02, 1.0)], [0.04, 0.035, 0.03], 4, lambda c, n: STEM)
    leaf = stem.bm
    a, b, c = leaf.verts.new((0, 0, 0.3)), leaf.verts.new((0.32, 0.06, 0.42)), leaf.verts.new((0.18, -0.08, 0.36))
    stem.add_faces([leaf.faces.new((a, b, c))], lambda c_, n: STEM)
    s = finish(stem, "bloom_stem", ao_ground=False, ao_strength=0.3)

    pet = Part()
    bm = pet.bm
    centre = bm.verts.new((0, 0, 1.06))
    faces = []
    for k in range(5):
        a0 = 2 * math.pi * k / 5
        a1 = a0 + 0.55
        tip = bm.verts.new((math.cos(a0 + 0.27) * 0.42, math.sin(a0 + 0.27) * 0.42, 1.12))
        e0 = bm.verts.new((math.cos(a0) * 0.17, math.sin(a0) * 0.17, 1.04))
        e1 = bm.verts.new((math.cos(a1) * 0.17, math.sin(a1) * 0.17, 1.04))
        faces.append(bm.faces.new((centre, e0, tip)))
        faces.append(bm.faces.new((centre, tip, e1)))
    pet.add_faces(faces, lambda c, n: WHITE)   # tinted per instance at runtime
    p = finish(pet, "bloom_petals", ao_ground=False, ao_strength=0.0)
    return s, p


# -------------------------------------------------------------------- build
bpy.ops.wm.read_factory_settings(use_empty=True)
print("forest kit:")
broadleaf("oak_a", 1)
broadleaf("oak_a", 1, far=True)
broadleaf("oak_b", 2, height=21.0, top=LEAF_B_TOP, low=LEAF_B_LOW)
broadleaf("oak_b", 2, height=21.0, far=True, top=LEAF_B_TOP, low=LEAF_B_LOW)
conifer("conifer", 3)
conifer("conifer", 3, far=True)
canopy_clump("clump")
rock("rock_a", 21, (1.6, 1.3, 1.1))
rock("rock_b", 22, (2.6, 1.9, 1.3))
log("log")
fern("fern")
bloom()

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format="GLB",
    export_normals=False, export_texcoords=False, export_materials="NONE",
    export_vertex_color="ACTIVE", export_all_vertex_colors=False,
    export_yup=True, export_apply=True,
)
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB")
