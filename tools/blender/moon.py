"""
The moon world's flora, modelled in Blender from code and exported as one glTF.

    python tools/blender/moon.py public/worlds/moon.glb   # with the `bpy` module

An alien meadow under a ringed gas giant, so not Earth's trees: the same
conventions as forest.py (deterministic, vertex colour and baked
occlusion, quantized). Pieces that glow at night are separate meshes so the
page can give them their own emissive material:

    umbrella_wood, umbrella_cap,    a tall, leaning tree with stacked disc
    umbrella_pods                   canopies, pods hanging under each (glow)
    spire                           a slender twisted cone-tree, banded
    crystal                         a cluster of hexagonal crystals (glow)
    puff_stem, puff_head            a stalk with a round seed head (glow)
    fern_alien                      a rosette of coiled fronds
"""
import math, os, random, sys

import bpy  # first: it makes bmesh and mathutils importable when run as a module
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import mix, scale, Part, tube, blob, finish, write_glb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[0] if argv else "public/worlds/moon.glb")

TRUNK = (0.46, 0.36, 0.42)          # violet-grey bark
TRUNK_DARK = (0.24, 0.18, 0.24)
CAP_TOP = (0.28, 0.52, 0.46)        # teal canopy, lighter on top
CAP_UNDER = (0.10, 0.20, 0.24)
POD = (1.0, 0.82, 0.46)             # warm glowing pods
SPIRE_A = (0.34, 0.50, 0.30)
SPIRE_B = (0.56, 0.66, 0.36)
CRYSTAL = (0.62, 0.84, 1.0)
CRYSTAL_DEEP = (0.42, 0.40, 0.86)
PUFF_STEM = (0.40, 0.52, 0.34)
PUFF = (0.86, 0.96, 0.78)
FROND = (0.30, 0.52, 0.40)
FROND_TIP = (0.66, 0.80, 0.52)


def disc(part, centre, radius, thick, sides, painter, droop=0.25):
    """A canopy disc: a shallow dome on top, a dished underside, a soft rim."""
    bm = part.bm
    c = Vector(centre)
    top = bm.verts.new(c + Vector((0, 0, thick)))
    bot = bm.verts.new(c - Vector((0, 0, thick * 0.2)))
    rim_hi, rim_lo = [], []
    for k in range(sides):
        a = 2 * math.pi * k / sides
        r = radius * (1.0 + 0.08 * math.sin(a * 3 + c.x))
        d = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        rim_hi.append(bm.verts.new(c + d - Vector((0, 0, radius * droop * 0.5))))
        rim_lo.append(bm.verts.new(c + d * 0.97 - Vector((0, 0, radius * droop * 0.5 + thick * 0.4))))
    faces = []
    for k in range(sides):
        n = (k + 1) % sides
        faces.append(bm.faces.new((top, rim_hi[k], rim_hi[n])))
        faces.append(bm.faces.new((rim_hi[k], rim_lo[k], rim_lo[n], rim_hi[n])))
        faces.append(bm.faces.new((bot, rim_lo[n], rim_lo[k])))
    part.add_faces(faces, painter)


def umbrella(seed=3, height=26.0):
    rnd = random.Random(seed)
    wood = Part()

    def bark(c, n):
        return mix(TRUNK_DARK, TRUNK, 0.5 + 0.5 * noise.noise(c * Vector((2.5, 2.5, 0.5))))
    lean = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized() * 2.4
    pts = [lean * (i / 7) ** 2 + Vector((0, 0, height * 0.86 * i / 7)) for i in range(8)]
    tube(wood, pts, [1.1, 0.8, 0.62, 0.5, 0.42, 0.36, 0.3, 0.22], 7, bark)
    for k in range(4):                              # buttress roots
        a = k * 1.57 + rnd.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        tube(wood, [Vector((0, 0, 2.0)), d * 1.6 + Vector((0, 0, 0.5)), d * 2.8 - Vector((0, 0, 0.2))], [0.5, 0.32, 0.1], 5, bark)
    caps = Part()
    pods = Part()
    tiers = [(1.0, 0.24), (0.78, 0.18), (0.58, 0.12)]
    for i, (t, rr) in enumerate(tiers):
        p = pts[0].lerp(pts[-1], t) if t < 1 else pts[-1]
        r = height * rr
        # a short limb out to each lower tier, so the discs are held, not floating
        if i > 0:
            a = i * 2.3
            d = Vector((math.cos(a), math.sin(a), 0)) * r * 0.35
            tube(wood, [p, p + d * 0.6 + Vector((0, 0, 0.6)), p + d + Vector((0, 0, 1.0))], [0.3, 0.22, 0.16], 5, bark)
            p = p + d + Vector((0, 0, 1.0))

        def paint(c, n, z0=p.z, rad=r):
            under = max(0.0, -n.z)
            return mix(mix(CAP_UNDER, CAP_TOP, 0.4 + 0.6 * max(0.0, n.z)), CAP_UNDER, under * 0.8)
        disc(caps, p, r, r * 0.16, 14, paint)
        for k in range(9):                          # pods hang under the rim
            a = 2 * math.pi * k / 9 + rnd.uniform(-0.2, 0.2)
            q = p + Vector((math.cos(a), math.sin(a), 0)) * r * rnd.uniform(0.55, 0.85) - Vector((0, 0, r * 0.2))
            tube(pods, [q, q - Vector((0, 0, 0.9))], [0.04, 0.03], 3, lambda c, n: scale(POD, 0.6))
            blob(pods, q - Vector((0, 0, 1.15)), (0.22, 0.22, 0.32), lambda c, n: POD, subdiv=1, rough=0.0)
    finish(wood, "umbrella_wood", ao_strength=0.5)
    finish(caps, "umbrella_cap", ao_ground=False, ao_strength=0.5)
    finish(pods, "umbrella_pods", ao_ground=False, ao_strength=0.0)


def spire(seed=7, height=20.0):
    """A slender cone-tree twisting as it rises, in bands of two greens."""
    rnd = random.Random(seed)
    part = Part()
    tube(part, [(0, 0, -0.3), (0, 0, height * 0.2)], [0.5, 0.4], 6, lambda c, n: TRUNK)
    tiers = 9
    for i in range(tiers):
        t = i / tiers
        z = height * (0.15 + 0.82 * t)
        r = height * 0.17 * (1 - t) + 0.3
        tw = i * 0.5
        bm = part.bm
        apex = bm.verts.new((0, 0, z + height * 0.11))
        rim = [bm.verts.new((math.cos(k * 1.047 + tw) * r, math.sin(k * 1.047 + tw) * r, z - 0.2)) for k in range(6)]
        col = SPIRE_A if i % 2 == 0 else SPIRE_B
        faces = [bm.faces.new((apex, rim[k], rim[(k + 1) % 6])) for k in range(6)]
        faces.append(bm.faces.new(rim[::-1]))
        part.add_faces(faces, lambda c, n, col=col: scale(col, 0.8 + 0.25 * max(0.0, n.z)))
    return finish(part, "spire", ao_strength=0.5)


def crystal(seed=11):
    rnd = random.Random(seed)
    part = Part()
    for k in range(7):
        a = rnd.uniform(0, math.tau)
        tilt = rnd.uniform(0.0, 0.6) if k else 0.0
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        L = rnd.uniform(1.2, 2.6) * (1.3 if k == 0 else 1.0)
        r = rnd.uniform(0.18, 0.32)
        base = Vector((math.cos(a), math.sin(a), 0)) * rnd.uniform(0.0, 0.4)
        bm = part.bm
        u = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))).normalized()
        v = d.cross(u)
        ring_lo, ring_hi = [], []
        for j in range(6):
            q = (u * math.cos(j * 1.047) + v * math.sin(j * 1.047)) * r
            ring_lo.append(bm.verts.new(base + q))
            ring_hi.append(bm.verts.new(base + q + d * L))
        tip = bm.verts.new(base + d * (L + r * 1.6))
        faces = []
        for j in range(6):
            n = (j + 1) % 6
            faces.append(bm.faces.new((ring_lo[j], ring_lo[n], ring_hi[n], ring_hi[j])))
            faces.append(bm.faces.new((ring_hi[j], ring_hi[n], tip)))
        part.add_faces(faces, lambda c, n_: mix(CRYSTAL_DEEP, CRYSTAL, min(1.0, c.z / 2.6)))
    return finish(part, "crystal", ao_strength=0.3)


def puff(seed=13):
    part = Part()
    tube(part, [(0, 0, 0), (0.1, 0.05, 0.9), (0.0, 0.1, 1.8)], [0.06, 0.05, 0.04], 4, lambda c, n: PUFF_STEM)
    finish(part, "puff_stem", ao_ground=False, ao_strength=0.2)
    head = Part()
    blob(head, (0.0, 0.1, 2.05), (0.32, 0.32, 0.32), lambda c, n: PUFF, subdiv=2, rough=0.15, seed=seed)
    finish(head, "puff_head", ao_ground=False, ao_strength=0.0)


def fern_alien(seed=17):
    rnd = random.Random(seed)
    part = Part()
    for f in range(6):
        a = 2 * math.pi * f / 6 + rnd.uniform(-0.2, 0.2)
        d = Vector((math.cos(a), math.sin(a), 0))
        pts = []
        for s in range(9):
            t = s / 8
            # out and up, then curling back over at the tip
            curl = max(0.0, t - 0.6) / 0.4
            p = d * (1.4 * t - 0.5 * curl * curl) + Vector((0, 0, 1.1 * math.sin(t * math.pi * 0.7) + 0.4 * curl))
            pts.append(p)
        tube(part, pts, [0.06 * (1 - 0.7 * s / 8) for s in range(9)], 3, lambda c, n: mix(FROND, FROND_TIP, c.length / 1.5))
    return finish(part, "fern_alien", ao_strength=0.4)


bpy.ops.wm.read_factory_settings(use_empty=True)
print("moon kit:")
umbrella()
spire()
crystal()
puff()
fern_alien()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_glb(OUT)
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB")
