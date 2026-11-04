"""
The sea floor's kit, modelled in Blender from code and exported as one glTF.

    python tools/blender/seafloor.py public/worlds/seafloor.glb   # with the `bpy` module
    blender -b --factory-startup --python tools/blender/seafloor.py -- public/worlds/seafloor.glb

Same conventions as forest.py (deterministic, vertex colour and baked
occlusion, no textures, quantized output). What it makes:

    kelp            a giant-kelp stalk ~14 m tall, its blades held up by
                    float bulbs along it; sways with height at runtime
    seagrass        a tuft of long ribbon blades
    staghorn        branching coral, pale tips on warm ochre
    fan             a sea fan: a flat lattice of fine branches
    brain           a domed brain coral, grooved
    tube_sponge     a cluster of hollow sponge tubes
    whale_body      a humpback: lofted body, ventral grooves, long pectorals
    whale_tail      its peduncle and flukes, pivoting at the origin so the
                    page can beat the tail without skinning
"""
import math, os, random, sys

import bpy  # first: it makes bmesh and mathutils importable when run as a module
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import mix, scale, Part, tube, blob, finish, write_glb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[0] if argv else "public/worlds/seafloor.glb")

KELP_STALK = (0.36, 0.30, 0.12)
KELP_BLADE_LOW = (0.30, 0.26, 0.08)
KELP_BLADE_TOP = (0.62, 0.55, 0.18)     # backlit kelp goes golden near the light
SEAGRASS_LOW = (0.14, 0.30, 0.16)
SEAGRASS_TOP = (0.40, 0.58, 0.28)
STAG_BASE = (0.78, 0.40, 0.22)
STAG_TIP = (1.0, 0.86, 0.62)
FAN = (0.72, 0.16, 0.40)
FAN_TIP = (0.98, 0.46, 0.56)
BRAIN = (0.80, 0.66, 0.30)
BRAIN_GROOVE = (0.40, 0.46, 0.20)
SPONGE = (0.62, 0.36, 0.78)
SPONGE_IN = (0.30, 0.12, 0.26)
WHALE_TOP = (0.20, 0.25, 0.32)
WHALE_BELLY = (0.78, 0.80, 0.80)
WHALE_GROOVE = (0.56, 0.58, 0.60)


def ribbon(part, pts, widths, normal, painter):
    """A flat strip through `pts`, `widths` across, facing roughly `normal`."""
    bm = part.bm
    prev = None
    faces = []
    for i, (p, w) in enumerate(zip(pts, widths)):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        side = d.cross(Vector(normal)).normalized() * (w * 0.5)
        a, b = bm.verts.new(p + side), bm.verts.new(p - side)
        if prev:
            faces.append(bm.faces.new((prev[0], a, b, prev[1])))
        prev = (a, b)
    part.add_faces(faces, painter)


# --------------------------------------------------------------------- kelp
def kelp(name, seed=5, height=14.0):
    rnd = random.Random(seed)
    part = Part()
    # the stalk wanders a little as it rises
    pts = [Vector((0.25 * math.sin(i * 0.9), 0.2 * math.cos(i * 0.7), height * i / 9)) for i in range(10)]
    tube(part, pts, [0.10] * 9 + [0.05], 4, lambda c, n: KELP_STALK)
    # holdfast: a knot of short roots
    for k in range(5):
        a = k * 1.26
        d = Vector((math.cos(a), math.sin(a), 0))
        tube(part, [Vector((0, 0, 0.3)), d * 0.5 + Vector((0, 0, 0.05)), d * 0.8 - Vector((0, 0, 0.1))], [0.08, 0.06, 0.03], 4,
             lambda c, n: scale(KELP_STALK, 0.7))

    def blade_paint(c, n):
        return mix(KELP_BLADE_LOW, KELP_BLADE_TOP, c.z / height)
    for i in range(22):
        t = 0.08 + 0.9 * i / 22
        base = pts[0].lerp(pts[-1], t)
        a = i * 2.4 + rnd.uniform(-0.3, 0.3)
        out = Vector((math.cos(a), math.sin(a), 0))
        L = rnd.uniform(1.6, 2.6) * (1.0 - 0.35 * t)
        # a float bulb at the blade's root
        blob(part, base + out * 0.18, (0.12, 0.12, 0.16), lambda c, n: KELP_BLADE_LOW, subdiv=1, rough=0.0)
        # the blade arcs out and upward, wide in the middle, ruffled
        bp = [base + out * (0.2 + L * f) + Vector((0, 0, L * 0.55 * f + 0.12 * math.sin(f * 9 + i)))
              for f in [k / 5 for k in range(6)]]
        ribbon(part, bp, [0.06, 0.42, 0.52, 0.46, 0.3, 0.04], out.cross(Vector((0, 0, 1))).cross(out) * -1 + out * 0.1,
               blade_paint)
    return finish(part, name, ao_strength=0.4)


def seagrass(name, seed=9):
    rnd = random.Random(seed)
    part = Part()
    for i in range(9):
        a = rnd.uniform(0, math.tau)
        d = Vector((math.cos(a), math.sin(a), 0))
        L = rnd.uniform(1.4, 2.4)
        bend = rnd.uniform(0.2, 0.6)
        pts = [d * rnd.uniform(0, 0.25) + d * (bend * f * f * L) + Vector((0, 0, L * f)) for f in [k / 5 for k in range(6)]]
        ribbon(part, pts, [0.10, 0.10, 0.09, 0.08, 0.06, 0.02], d,
               lambda c, n: mix(SEAGRASS_LOW, SEAGRASS_TOP, c.z / 2.2))
    return finish(part, name, ao_strength=0.4)


# -------------------------------------------------------------------- coral
def staghorn(name, seed=21):
    rnd = random.Random(seed)
    part = Part()

    def paint(c, n):
        return mix(STAG_BASE, STAG_TIP, c.z / 2.4)

    def grow(p0, d, length, r, depth):
        mid = p0 + d * length * 0.5 + Vector((rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), 0.05))
        p1 = p0 + d * length
        tube(part, [p0, mid, p1], [r, r * 0.85, r * 0.7], 5, paint)
        if depth == 0:
            blob(part, p1, (r * 0.75, r * 0.75, r * 0.9), paint, subdiv=1, rough=0.0)
            return
        for k in range(2):
            a = rnd.uniform(0, math.tau)
            nd = (d + Vector((math.cos(a), math.sin(a), 0)) * 0.55 + Vector((0, 0, 0.25))).normalized()
            grow(p1, nd, length * rnd.uniform(0.6, 0.8), r * 0.75, depth - 1)
    for k in range(6):
        a = k * 1.05 + rnd.uniform(-0.2, 0.2)
        d = Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 0.8)).normalized()
        grow(Vector((0, 0, 0)), d, rnd.uniform(0.8, 1.1), 0.14, 2)
    return finish(part, name, ao_strength=0.6)


def fan(name, seed=31):
    """A sea fan: branches forking in one plane, a lattice of fine stems."""
    rnd = random.Random(seed)
    part = Part()

    def paint(c, n):
        return mix(FAN, FAN_TIP, c.z / 2.6)

    def grow(p0, a, length, r, depth):
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        p1 = p0 + d * length + Vector((0, rnd.uniform(-0.04, 0.04), 0))
        tube(part, [p0, p1], [r, r * 0.8], 4, paint)
        if depth == 0:
            return
        for s in (-1, 1):
            grow(p1, a + s * rnd.uniform(0.25, 0.5), length * rnd.uniform(0.7, 0.85), r * 0.78, depth - 1)
    grow(Vector((0, 0, 0)), math.pi / 2, 0.55, 0.07, 5)
    return finish(part, name, ao_strength=0.4)


def brain(name, seed=41):
    rnd = random.Random(seed)
    part = Part()

    def paint(c, n):
        # meandering grooves: bands of a warped noise field
        g = abs(math.sin(noise.noise(c * 1.6) * 9.0 + c.x * 3.0))
        return mix(BRAIN_GROOVE, BRAIN, min(1.0, g * 1.6))
    blob(part, (0, 0, 0.35), (1.1, 1.0, 0.75), paint, subdiv=3, rough=0.12, seed=seed, flatten=0.3)
    return finish(part, name, ao_strength=0.5)


def tube_sponge(name, seed=51):
    rnd = random.Random(seed)
    part = Part()
    for k in range(5):
        a = k * 1.25 + rnd.uniform(-0.2, 0.2)
        r0 = rnd.uniform(0.0, 0.35)
        base = Vector((math.cos(a) * r0, math.sin(a) * r0, 0))
        h = rnd.uniform(0.9, 1.8)
        lean = Vector((math.cos(a), math.sin(a), 0)) * rnd.uniform(0.05, 0.25)
        pts = [base + lean * f + Vector((0, 0, h * f)) for f in (0, 0.5, 1.0)]
        rr = rnd.uniform(0.16, 0.24)
        tube(part, pts, [rr, rr * 1.05, rr * 1.15], 7, lambda c, n: mix(SPONGE, SPONGE, 0))
        # the dark open mouth
        tube(part, [pts[-1] + Vector((0, 0, 0.01)), pts[-1] - Vector((0, 0, 0.25))], [rr * 1.0, rr * 0.6], 7,
             lambda c, n: SPONGE_IN)
    return finish(part, name, ao_strength=0.6)


# -------------------------------------------------------------------- whale
def whale():
    """A humpback, ~13 m: a lofted body wider than it is tall, a knobbly
    head, the long pale pectorals, a small dorsal hump; dark above and pale
    below with ventral grooves. The tail is its own mesh."""
    body = Part()

    def paint(c, n):
        belly = max(0.0, min(1.0, (-n.z + 0.15) * 1.6))
        col = mix(WHALE_TOP, WHALE_BELLY, belly)
        if belly > 0.5 and c.y > -1.0:                  # ventral grooves, head to navel
            if math.sin(c.x * 26.0) > 0.55:
                col = mix(col, WHALE_GROOVE, 0.6)
        return scale(col, 0.92 + 0.12 * noise.noise(c * 0.8))
    # profile along the body (y is head -> tail here): half-width, half-height
    prof = [(6.6, 0.25, 0.20), (6.0, 1.00, 0.70), (4.8, 1.55, 1.15), (3.0, 1.85, 1.45), (1.0, 1.95, 1.55),
            (-1.0, 1.80, 1.45), (-3.0, 1.40, 1.15), (-4.6, 0.85, 0.80), (-5.6, 0.50, 0.55)]
    sides = 12
    bm = body.bm
    rings = []
    for (y, hw, hh) in prof:
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            x, z = math.cos(a) * hw, math.sin(a) * hh
            # a flatter belly and knobs (tubercles) on top of the head
            if z < 0:
                z *= 0.85
            if y > 4.0 and z > 0:
                z += 0.08 * max(0.0, noise.noise(Vector((x * 3, y * 3, 0))))
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    faces = []
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            faces.append(bm.faces.new((r0[k], r1[k], r1[(k + 1) % sides], r0[(k + 1) % sides])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[-1]))
    body.add_faces(faces, paint)
    # long pectoral fins, pale with a scalloped leading edge
    for s in (-1, 1):
        pts = [Vector((s * 1.6, 3.4, -0.7)), Vector((s * 3.4, 2.8, -1.3)), Vector((s * 5.0, 1.9, -1.7))]
        tube(body, pts, [0.45, 0.32, 0.12], 6, lambda c, n: mix(WHALE_BELLY, WHALE_TOP, 0.25))
    # the dorsal hump
    tube(body, [Vector((0, -2.6, 1.3)), Vector((0, -3.1, 1.75)), Vector((0, -3.5, 1.5))], [0.32, 0.22, 0.05], 5, paint)
    # eyes
    for s in (-1, 1):
        blob(body, (s * 1.32, 4.7, 0.1), (0.1, 0.1, 0.1), lambda c, n: (0.05, 0.05, 0.06), subdiv=1, rough=0.0)
    finish(body, "whale_body", ao_ground=False, ao_strength=0.5)

    tail = Part()
    # peduncle from the origin backwards, then the flukes: notched, swept
    tube(tail, [Vector((0, 0.2, 0)), Vector((0, -1.4, 0.05)), Vector((0, -2.8, 0.1))], [0.55, 0.38, 0.22], 8, paint)
    bm = tail.bm
    faces = []
    for s in (-1, 1):
        root = [bm.verts.new((0, -2.7, 0.12)), bm.verts.new((0, -3.3, 0.08))]
        tip = bm.verts.new((s * 2.9, -4.4, 0.12))
        notch = bm.verts.new((s * 0.1, -3.6, 0.1))
        trail = bm.verts.new((s * 1.6, -4.1, 0.1))
        top = [bm.verts.new((v.co.x, v.co.y, v.co.z + 0.12)) for v in (root[0], tip, trail, notch)]
        faces.append(bm.faces.new((root[0], tip, trail, notch)) if s > 0 else bm.faces.new((notch, trail, tip, root[0])))
        faces.append(bm.faces.new(top[::-1]) if s > 0 else bm.faces.new(top))
    tail.add_faces(faces, lambda c, n: mix(WHALE_TOP, WHALE_BELLY, max(0.0, -n.z)))
    finish(tail, "whale_tail", ao_ground=False, ao_strength=0.3)


# -------------------------------------------------------------------- build
bpy.ops.wm.read_factory_settings(use_empty=True)
print("seafloor kit:")
kelp("kelp")
seagrass("seagrass")
staghorn("staghorn")
fan("fan")
brain("brain")
tube_sponge("tube_sponge")
whale()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_glb(OUT)
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB")
