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
    birch, birch_far                a pale, slender tree for contrast
    bush_a, bush_b, stump, log      the understory, mossy where they face up
    fern                            a rosette of arched fronds
    bloom_stem, bloom_petals        a flower in two parts, so the runtime can
                                    tint the petals per instance
    daisy, bell, spike, bedleaf     the flower bed: three kinds of flower
                                    and the leafy cover they grow out of

Units are metres, Z up here (the exporter writes Y up). Trees are 26-34 m
tall at scale 1, with long bare trunks; the runtime scales them per ring.

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
# A cosy storybook forest: sunlit crowns that go warm yellow-green at the
# top and cool to a teal shadow underneath, mossy bark, soft colour rather
# than a saturated game green, so it sits under either theme of the page.
LEAF_TOP = (0.54, 0.66, 0.27)
LEAF_MID = (0.32, 0.50, 0.24)
LEAF_LOW = (0.11, 0.25, 0.20)
LEAF_B_TOP = (0.62, 0.64, 0.27)      # the second oak, more golden
LEAF_B_LOW = (0.20, 0.28, 0.16)
BIRCH_TOP = (0.74, 0.78, 0.38)       # birch: lighter, yellower leaves
BIRCH_LOW = (0.30, 0.42, 0.22)
BIRCH_BARK = (0.86, 0.84, 0.76)
NEEDLE_TOP = (0.27, 0.40, 0.25)
NEEDLE_LOW = (0.12, 0.21, 0.15)
BARK = (0.33, 0.25, 0.18)
BARK_DARK = (0.19, 0.14, 0.10)
MOSS = (0.30, 0.40, 0.17)
FERN_TIP = (0.45, 0.60, 0.26)
FERN_BASE = (0.20, 0.33, 0.14)
STEM = (0.25, 0.42, 0.18)
WHITE = (1.0, 1.0, 1.0)
DAISY = (0.97, 0.95, 0.88)
DAISY_EYE = (0.95, 0.74, 0.20)
BELL = (0.55, 0.45, 0.85)
SPIKE_LOW = (0.86, 0.45, 0.62)
SPIKE_TOP = (0.97, 0.82, 0.88)


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


# ------------------------------------------------------------- leaf cards
class Cards:
    """Foliage as cards: small alpha-cut quads with a leaf texture, grouped
    into clusters. Each card's normal is bent toward the outside of its
    crown, so the crown lights as one soft volume instead of as facets —
    the standard trick for stylized trees. Cards carry UVs into a 2x2 atlas
    the page draws at runtime, and a vertex colour (tint and shade)."""

    def __init__(self):
        self.co, self.nor, self.uv, self.col, self.faces = [], [], [], [], []

    def card(self, centre, size, crown, crown_r, colour, rnd, droop=0.0):
        c = Vector(centre)
        # a random orientation, mostly facing outward from the crown
        out = (c - crown).normalized() if (c - crown).length > 1e-3 else Vector((0, 0, 1))
        rand = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        n = (out * 0.6 + rand * 0.8).normalized()
        u = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.95 else Vector((1, 0, 0))).normalized()
        v = n.cross(u).normalized()
        # spin the card in its own plane
        ang = rnd.uniform(0, math.tau)
        u, v = u * math.cos(ang) + v * math.sin(ang), -u * math.sin(ang) + v * math.cos(ang)
        h = size * 0.5
        cell = rnd.randrange(4)
        cu, cv = (cell % 2) * 0.5, (cell // 2) * 0.5
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        base = len(self.co)
        for (x, y) in corners:
            p = c + u * (x * h) + v * (y * h)
            p.z -= droop * (y + 1) * 0.5 * size
            self.co.append(p)
            # the lighting normal: mostly the crown's sphere, a little the card
            sph = (p - crown) / max(crown_r, 1e-3)
            self.nor.append((sph.normalized() * 0.82 + n * 0.18).normalized())
            self.uv.append((cu + (x + 1) * 0.25, cv + (y + 1) * 0.25))
            # deeper inside the crown is darker: cheap occlusion
            depth = min(1.0, (p - crown).length / max(crown_r, 1e-3))
            self.col.append(scale(colour, 0.55 + 0.45 * depth))
        self.faces.append((base, base + 1, base + 2, base + 3))

    def cluster(self, centre, radii, count, size, crown, crown_r, paint, rnd, droop=0.0):
        """Cards spread through an ellipsoid, thicker near its skin."""
        c = Vector(centre)
        for _ in range(count):
            d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
            r = rnd.uniform(0.45, 1.0) ** 0.6
            p = c + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * r
            self.card(p, size * rnd.uniform(0.75, 1.2), crown, crown_r, paint(p), rnd, droop)

    def finish(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.co], [], self.faces)
        me.update()
        uvl = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                uvl.data[li].uv = self.uv[me.loops[li].vertex_index]
        attr = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
        for i, c in enumerate(self.col):
            attr.data[i].color = (*c, 1.0)
        me.color_attributes.active_color = attr
        me.normals_split_custom_set_from_vertices([tuple(n) for n in self.nor])
        obj = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(obj)
        print(f"  {name}: {len(self.faces)} cards")
        return obj


def leaf_tint(top, mid, low, zlo, zhi, rnd):
    """Colour by height in the crown, with a little variation per card."""
    def p(co):
        h = max(0.0, min(1.0, (co.z - zlo) / max(0.001, zhi - zlo)))
        c = mix(low, mid, h * 1.7) if h < 0.6 else mix(mid, top, (h - 0.6) / 0.4)
        return scale(c, rnd.uniform(0.9, 1.1))
    return p


# ------------------------------------------------------------------- trees
def branches(part, rnd, start, direction, length, radius, depth, tips, painter, sides=5):
    """A limb that forks: each level shorter and thinner, bending upward.
    The ends are where the foliage clusters go."""
    d = Vector(direction).normalized()
    p0 = Vector(start)
    mid = p0 + d * length * 0.5 + Vector((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), length * 0.08))
    p1 = p0 + d * length + Vector((0, 0, length * 0.12))
    tube(part, [p0, mid, p1], [radius, radius * 0.8, radius * 0.6], sides, painter)
    if depth == 0:
        tips.append((p1, length))
        return
    for k in range(rnd.choice((2, 3))):
        a = rnd.uniform(-0.9, 0.9)
        nd = (d + Vector((math.cos(a + k * 2.1), math.sin(a + k * 2.1), rnd.uniform(0.2, 0.6))) * 0.7).normalized()
        branches(part, rnd, p1, nd, length * rnd.uniform(0.55, 0.7), radius * 0.6, depth - 1, tips, painter, max(4, sides - 1))
    tips.append((p1, length * 0.8))


def broadleaf(name, seed, height=31.0, far=False, top=LEAF_TOP, low=LEAF_LOW):
    """A broad old tree: a long trunk that splits into limbs, the limbs
    forking twice, and leaf clusters at every fork and tip — so the crown is
    broad and broken, with sky through it, not a ball."""
    rnd = random.Random(seed)
    wood = Part()
    bark = bark_painter(top)
    trunk_h = height * 0.62
    lean = Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), 0))
    pts = [Vector((0, 0, -0.4)) + lean * (i / 6) ** 1.5 + Vector((0, 0, trunk_h * i / 6)) for i in range(7)]
    radii = [1.6 * (1 - 0.5 * i / 6) + (1.2 if i == 0 else 0.4 if i == 1 else 0.0) for i in range(7)]
    tube(wood, pts, radii, 5 if far else 8, bark)
    for k in range(4):                                     # roots
        a = (k / 4) * math.tau + rnd.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        tube(wood, [Vector((0, 0, 1.6)), d * 1.5 + Vector((0, 0, 0.4)), d * 2.8 + Vector((0, 0, -0.2))],
             [0.6, 0.38, 0.12], 5, bark)
    tips = []
    top_p = pts[-1]
    nl = 4 if far else 5
    for k in range(nl):
        a = (k / nl) * math.tau + rnd.uniform(-0.4, 0.4)
        d = Vector((math.cos(a), math.sin(a), rnd.uniform(0.6, 1.1)))
        start = pts[rnd.randint(4, 6)]
        branches(wood, rnd, start, d, height * rnd.uniform(0.16, 0.22), radii[-1] * 0.7, 1 if far else 2, tips, bark)
    w = wood
    wobj = finish(w, name + ("_far" if far else "") + "_wood", ao_strength=0.5)

    crown = top_p + Vector((0, 0, height * 0.18))
    crown_r = height * 0.32
    cards = Cards()
    tint = leaf_tint(top, mix(low, top, 0.5), low, crown.z - crown_r, crown.z + crown_r, rnd)
    for (tp, ln) in tips:
        r = ln * (0.75 if far else 0.62)
        cards.cluster(tp + Vector((0, 0, r * 0.25)), (r, r, r * 0.7), 5 if far else 11,
                      height * (0.2 if far else 0.145), crown, crown_r, tint, rnd)
    cards.finish(name + ("_far" if far else "") + "_leaf")
    return wobj


def conifer(name, seed, height=34.0, far=False):
    """A spruce: whorls of branches with drooping sprays of needles, the
    tiers shrinking toward a spire."""
    rnd = random.Random(seed)
    wood = Part()
    bark = bark_painter(NEEDLE_TOP)
    tube(wood, [(0, 0, -0.4), (0, 0, height * 0.5), (0, 0, height * 0.97)], [0.95, 0.5, 0.1], 5 if far else 7, bark)
    finish(wood, name + ("_far" if far else "") + "_wood", ao_strength=0.4)
    cards = Cards()
    crown = Vector((0, 0, height * 0.55))
    tint = leaf_tint(NEEDLE_TOP, mix(NEEDLE_LOW, NEEDLE_TOP, 0.5), NEEDLE_LOW, height * 0.15, height, rnd)
    tiers = 6 if far else 10
    for i in range(tiers):
        t = i / (tiers - 1)
        z = height * (0.18 + 0.78 * t)
        reach = height * (0.26 * (1 - t) + 0.03)
        arms = 5 if far else 7
        for k in range(arms):
            a = (k / arms) * math.tau + i * 0.9
            d = Vector((math.cos(a), math.sin(a), 0))
            n = 1 if far else 2
            for j in range(n):
                f = (j + 1) / n
                p = Vector((0, 0, z)) + d * reach * f - Vector((0, 0, reach * 0.25 * f * f))
                cards.card(p, height * (0.15 if far else 0.11) * (1.2 - 0.4 * t), crown + Vector((0, 0, z - crown.z)) * 0.6,
                           height * 0.3, tint(p), rnd, droop=0.35)
    cards.finish(name + ("_far" if far else "") + "_leaf")


def canopy_clump(name):
    """A free-floating cluster of foliage for the leaf ceiling."""
    rnd = random.Random(11)
    cards = Cards()
    tint = leaf_tint(LEAF_TOP, LEAF_MID, LEAF_LOW, -3.0, 3.0, rnd)
    c = Vector((0, 0, 0))
    for off, r in (((0, 0, 0), 4.2), ((3.0, 1.2, 0.4), 2.8), ((-2.6, -1.0, 0.3), 2.6)):
        cards.cluster(Vector(off), (r, r * 0.9, r * 0.6), 16, 3.6, c, 5.0, tint, rnd)
    cards.finish(name + "_leaf")


def birch(name, seed, height=26.0, far=False):
    """A pale, slender tree with a light, loose crown: the contrast that
    keeps a dense wood from reading as one green mass."""
    rnd = random.Random(seed)
    wood = Part()

    def bark(co, n):
        mark = noise.noise(Vector((co.x * 3, co.y * 3, co.z * 2.2))) > 0.35
        c = scale(BIRCH_BARK, 0.35) if mark else BIRCH_BARK
        return mix(c, MOSS, max(0.0, 1.0 - co.z / 1.5))
    lean = Vector((rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), 0))
    pts = [Vector((0, 0, -0.3)) + lean * (i / 5) ** 2 + Vector((0, 0, height * 0.82 * i / 5)) for i in range(6)]
    tube(wood, pts, [0.6, 0.48, 0.4, 0.3, 0.22, 0.12], 4 if far else 6, bark)
    tips = []
    for k in range(3 if far else 6):
        a = (k / 6) * math.tau + rnd.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), rnd.uniform(0.9, 1.6)))
        branches(wood, rnd, pts[rnd.randint(3, 5)], d, height * rnd.uniform(0.12, 0.17), 0.18, 0 if far else 1, tips, bark, 4)
    finish(wood, name + ("_far" if far else "") + "_wood", ao_strength=0.4)
    crown = pts[-1] - Vector((0, 0, height * 0.12))
    cards = Cards()
    tint = leaf_tint(BIRCH_TOP, mix(BIRCH_LOW, BIRCH_TOP, 0.5), BIRCH_LOW, crown.z - height * 0.3, crown.z + height * 0.25, rnd)
    for (tp, ln) in tips:
        r = ln * 0.7
        cards.cluster(tp, (r, r, r * 1.1), 5 if far else 8, height * (0.14 if far else 0.1), crown, height * 0.3, tint, rnd, droop=0.15)
    cards.finish(name + ("_far" if far else "") + "_leaf")


def bush(name, seed, size=2.4):
    """Understory: a low mound of leaf cards."""
    rnd = random.Random(seed)
    cards = Cards()
    tint = leaf_tint(mix(LEAF_TOP, LEAF_MID, 0.3), LEAF_MID, LEAF_LOW, 0.0, size * 1.4, rnd)
    crown = Vector((0, 0, size * 0.2))
    for i in range(4):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(0, size * 0.5)
        c = Vector((math.cos(a) * r, math.sin(a) * r, size * rnd.uniform(0.4, 0.7)))
        s_ = size * rnd.uniform(0.5, 0.7)
        cards.cluster(c, (s_, s_, s_ * 0.75), 9, size * 0.7, crown, size, tint, rnd)
    cards.finish(name + "_leaf")


def stump(name):
    part = Part()

    def paint(co, n):
        if n.z > 0.8 and co.z > 0.9:
            return (0.62, 0.48, 0.32)                     # the cut face, pale wood
        return mix(bark_painter(None)(co, n), MOSS, max(0.0, n.z) * 0.8)
    tube(part, [(0, 0, -0.2), (0, 0, 0.5), (0.05, 0, 1.1)], [1.3, 0.95, 0.85], 9, paint, cap_end=True)
    for k in range(3):
        a = k * 2.1 + 0.4
        d = Vector((math.cos(a), math.sin(a), 0))
        tube(part, [d * 0.7 + Vector((0, 0, 0.6)), d * 1.7 + Vector((0, 0, 0.1)), d * 2.3 + Vector((0, 0, -0.2))],
             [0.4, 0.25, 0.1], 5, paint)
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


def daisy(name):
    """White petals round a golden eye, on a thin stem: the bed's light."""
    part = Part()
    bm = part.bm
    tube(part, [(0, 0, 0), (0.04, 0, 0.45), (0, 0.02, 0.85)], [0.035, 0.03, 0.025], 4, lambda c, n: STEM)
    eye = [bm.verts.new((math.cos(k * 1.2566) * 0.08, math.sin(k * 1.2566) * 0.08, 0.9)) for k in range(5)]
    top = bm.verts.new((0, 0, 0.94))
    part.add_faces([bm.faces.new((top, eye[k], eye[(k + 1) % 5])) for k in range(5)], lambda c, n: DAISY_EYE)
    faces = []
    for k in range(9):
        a0 = 2 * math.pi * k / 9
        p0 = bm.verts.new((math.cos(a0 - 0.15) * 0.08, math.sin(a0 - 0.15) * 0.08, 0.89))
        p1 = bm.verts.new((math.cos(a0 + 0.15) * 0.08, math.sin(a0 + 0.15) * 0.08, 0.89))
        tip = bm.verts.new((math.cos(a0) * 0.32, math.sin(a0) * 0.32, 0.86))
        faces.append(bm.faces.new((p0, tip, p1)))
    part.add_faces(faces, lambda c, n: DAISY)
    return finish(part, name, ao_ground=False, ao_strength=0.2)


def bell(name):
    """An arching stem with three violet bells hanging from it."""
    part = Part()
    bm = part.bm
    pts = [(0, 0, 0), (0.05, 0, 0.6), (0.25, 0, 1.0), (0.55, 0, 1.05)]
    tube(part, pts, [0.04, 0.035, 0.03, 0.02], 4, lambda c, n: STEM)
    for i, (x, z) in enumerate(((0.18, 0.88), (0.38, 1.0), (0.55, 0.98))):
        top = bm.verts.new((x, 0, z - 0.04))
        rim = [bm.verts.new((x + math.cos(k * 1.257) * 0.09, math.sin(k * 1.257) * 0.09, z - 0.22)) for k in range(5)]
        part.add_faces([bm.faces.new((top, rim[k], rim[(k + 1) % 5])) for k in range(5)],
                       lambda c, n: mix(scale(BELL, 0.75), BELL, (c.z - 0.6) * 2))
    return finish(part, name, ao_ground=False, ao_strength=0.3)


def spike(name):
    """A tall spike of small blossoms, deep at the base and pale at the tip."""
    part = Part()
    bm = part.bm
    tube(part, [(0, 0, 0), (0, 0.03, 0.8), (0.02, 0, 1.6)], [0.045, 0.035, 0.02], 4, lambda c, n: STEM)
    faces = []
    for i in range(14):
        z = 0.75 + i * 0.06
        a = i * 2.4
        r = 0.17 * (1 - i / 16)
        c = Vector((math.cos(a) * r, math.sin(a) * r, z))
        v0, v1, v2 = bm.verts.new(c), bm.verts.new(c * 0.3 + Vector((0, 0, z * 0.7 + 0.05))), bm.verts.new(c + Vector((0.04, 0.04, 0.1)))
        faces.append(bm.faces.new((v0, v1, v2)))
    part.add_faces(faces, lambda c, n: mix(SPIKE_LOW, SPIKE_TOP, (c.z - 0.75) / 0.85))
    return finish(part, name, ao_ground=False, ao_strength=0.2)


def bedleaf(name):
    """Low leafy cover for the flower bed, so it reads as planted, not sown."""
    part = Part()
    paint = leaf_painter(mix(LEAF_TOP, STEM, 0.4), STEM, LEAF_LOW, 0.0, 0.7)
    blob(part, (0, 0, 0.25), (0.7, 0.6, 0.45), paint, subdiv=2, rough=0.35, seed=31, flatten=0.3)
    blob(part, (0.45, 0.2, 0.18), (0.45, 0.45, 0.32), paint, subdiv=1, rough=0.35, seed=32, flatten=0.3)
    return finish(part, name, ao_strength=0.5)


# -------------------------------------------------------------------- build
bpy.ops.wm.read_factory_settings(use_empty=True)
print("forest kit:")
broadleaf("oak_a", 1)
broadleaf("oak_a", 1, far=True)
broadleaf("oak_b", 7, height=28.0, top=LEAF_B_TOP, low=LEAF_B_LOW)
broadleaf("oak_b", 7, height=28.0, far=True, top=LEAF_B_TOP, low=LEAF_B_LOW)
conifer("conifer", 3)
conifer("conifer", 3, far=True)
canopy_clump("clump")
birch("birch", 4)
birch("birch", 4, far=True)
bush("bush_a", 41, 2.4)
bush("bush_b", 42, 3.4)
stump("stump")
log("log")
fern("fern")
bloom()
daisy("daisy")
bell("bell")
spike("spike")
bedleaf("bedleaf")

# ------------------------------------------------------------------ export
def write_glb(path):
    """Write every mesh as a quantized glTF (KHR_mesh_quantization): 16-bit
    positions dequantized by the node's scale and translation, 8-bit
    normals, UVs and colours, 16-bit indices. About a quarter of what the
    stock exporter writes in 32-bit floats, and still a plain glTF that
    Blender and any viewer open — no decoder needed at runtime.
    Blender is Z up, glTF Y up: (x, y, z) -> (x, z, -y)."""
    import json, struct
    bin_, views, accessors, meshes, nodes = bytearray(), [], [], [], []

    def view(data, stride=None, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        v = {"buffer": 0, "byteOffset": len(bin_), "byteLength": len(data)}
        if stride:
            v["byteStride"] = stride
        if target:
            v["target"] = target
        bin_.extend(data)
        views.append(v)
        return len(views) - 1

    def accessor(vi, ctype, count, typ, normalized=False, mn=None, mx=None):
        a = {"bufferView": vi, "componentType": ctype, "count": count, "type": typ}
        if normalized:
            a["normalized"] = True
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accessors.append(a)
        return len(accessors) - 1

    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        me = obj.data
        me.calc_loop_triangles()
        n = len(me.vertices)
        P = [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]
        lo = [min(p[i] for p in P) for i in range(3)]
        hi = [max(p[i] for p in P) for i in range(3)]
        sc = [max((hi[i] - lo[i]) / 2, 1e-6) for i in range(3)]
        mid = [(hi[i] + lo[i]) / 2 for i in range(3)]
        q = bytearray()
        for p in P:
            q += struct.pack("<hhhh", *[round((p[i] - mid[i]) / sc[i] * 32767) for i in range(3)], 0)
        attrs = {"POSITION": accessor(view(q, 8, 34962), 5122, n, "VEC3", True, [-1, -1, -1], [1, 1, 1])}

        if me.has_custom_normals:
            acc = [[0.0, 0.0, 0.0] for _ in range(n)]
            for li, l in enumerate(me.loops):
                cn = me.corner_normals[li].vector
                a_ = acc[l.vertex_index]
                a_[0] += cn.x; a_[1] += cn.z; a_[2] -= cn.y
            nb = bytearray()
            for a_ in acc:
                ln = math.sqrt(sum(c * c for c in a_)) or 1.0
                nb += struct.pack("<bbbb", *[round(c / ln * 127) for c in a_], 0)
            attrs["NORMAL"] = accessor(view(nb, 4, 34962), 5120, n, "VEC3", True)

        if me.uv_layers:
            uv = [(0.0, 0.0)] * n
            for li, l in enumerate(me.loops):
                u = me.uv_layers[0].data[li].uv
                uv[l.vertex_index] = (u.x, 1.0 - u.y)
            ub = bytearray()
            for u in uv:
                ub += struct.pack("<BBBB", round(u[0] * 255), round(u[1] * 255), 0, 0)
            attrs["TEXCOORD_0"] = accessor(view(ub, 4, 34962), 5121, n, "VEC2", True)

        if me.color_attributes:
            ca = me.color_attributes.active_color or me.color_attributes[0]
            cb = bytearray()
            for i in range(n):
                c = ca.data[i].color
                cb += struct.pack("<BBBB", *[round(max(0, min(1, x)) * 255) for x in c[:3]], 255)
            attrs["COLOR_0"] = accessor(view(cb, 4, 34962), 5121, n, "VEC4", True)

        ib = bytearray()
        for t in me.loop_triangles:
            ib += struct.pack("<HHH", *t.vertices)
        idx = accessor(view(ib, None, 34963), 5123, len(me.loop_triangles) * 3, "SCALAR")
        meshes.append({"name": obj.name, "primitives": [{"attributes": attrs, "indices": idx}]})
        nodes.append({"name": obj.name, "mesh": len(meshes) - 1, "translation": mid, "scale": sc})

    gltf = {
        "asset": {"version": "2.0", "generator": "tools/blender/forest.py"},
        "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(bin_)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    while len(bin_) % 4:
        bin_.append(0)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942) + bytes(bin_))


os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_glb(OUT)
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB")
