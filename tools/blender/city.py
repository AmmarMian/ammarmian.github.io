"""
The abandoned city's buildings, modelled in Blender from code, one glTF.

    python tools/blender/city.py public/worlds/city.glb   # with the `bpy` module

Four kinds of building, each a whole building at real scale (the page
places them with a uniform scale and a quarter-turn yaw, so ledges and
cornices keep their proportions). Concrete in vertex colour, with the city
being reclaimed: vines creeping up from the street and moss on every ledge
and roof. The page's shader draws the window grid on the walls.

    tower       ~72 m, two setbacks, a cornice every ten floors, a water
                tank and a bent mast on the roof
    midrise     ~34 m, a heavy cornice, rooftop sheds and a tank
    ruin        ~48 m with the top broken away: ragged columns, floor slabs
                showing at the break
    slab        ~20 m long low block over an arcade of columns
"""
import math, os, random, sys

import bpy  # first: it makes bmesh and mathutils importable when run as a module
import bmesh
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import mix, scale, Part, tube, finish, write_glb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[0] if argv else "public/worlds/city.glb")

CONCRETE = (0.50, 0.48, 0.44)
CONCRETE_DARK = (0.30, 0.29, 0.27)
LEDGE = (0.40, 0.38, 0.35)
ROOF = (0.26, 0.26, 0.25)
VINE = (0.20, 0.34, 0.14)
VINE_LIGHT = (0.34, 0.48, 0.20)
MOSS = (0.30, 0.40, 0.18)
RUST = (0.40, 0.24, 0.14)


def overgrown(base, seed):
    """Concrete, streaked with grime, with moss settling on whatever faces up."""
    off = Vector((seed * 3.1, seed * 1.7, 0))

    def p(c, n):
        streak = noise.noise(Vector((c.x * 0.3, c.y * 0.3, c.z * 0.05)) + off)
        col = mix(base, CONCRETE_DARK, 0.25 + 0.35 * max(0.0, streak))
        if n.z > 0.7:                                   # roofs and ledge tops
            return mix(col, MOSS, 0.55 + 0.3 * noise.noise(c * 0.4 + off))
        # (the vines are drawn by the page's shader: these walls are single
        # big faces, too coarse to carry them in vertex colour)
        return col
    return p


def box(part, x0, y0, z0, x1, y1, z1, painter):
    bm = part.bm
    v = [bm.verts.new(p) for p in (
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    f = [bm.faces.new(q) for q in (
        (v[0], v[3], v[2], v[1]), (v[4], v[5], v[6], v[7]), (v[0], v[1], v[5], v[4]),
        (v[1], v[2], v[6], v[5]), (v[2], v[3], v[7], v[6]), (v[3], v[0], v[4], v[7]))]
    part.add_faces(f, painter)


def tank(part, x, y, z, painter):
    tube(part, [Vector((x, y, z)), Vector((x, y, z + 4.0))], [1.8, 1.8], 8, lambda c, n: RUST)
    tube(part, [Vector((x, y, z + 4.0)), Vector((x, y, z + 5.2))], [1.9, 0.2], 8, lambda c, n: ROOF)
    for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        box(part, x + dx * 1.2 - 0.12, y + dy * 1.2 - 0.12, z - 2.4, x + dx * 1.2 + 0.12, y + dy * 1.2 + 0.12, z, painter)


def tower(seed=1):
    part = Part()
    paint = overgrown(CONCRETE, seed)
    led = overgrown(LEDGE, seed + 9)
    tiers = [(0.0, 40.0, 10.0), (40.0, 60.0, 8.0), (60.0, 72.0, 6.0)]   # z0, z1, half-width
    for (z0, z1, hw) in tiers:
        box(part, -hw, -hw, z0, hw, hw, z1, paint)
        # a cornice ledge every ten metres, and at each setback
        z = z0 + 10.0
        while z < z1:
            box(part, -hw - 0.5, -hw - 0.5, z, hw + 0.5, hw + 0.5, z + 0.6, led)
            z += 10.0
        box(part, -hw - 0.7, -hw - 0.7, z1 - 0.2, hw + 0.7, hw + 0.7, z1 + 0.8, led)
    tank(part, 2.5, 1.5, 74.6, paint)
    # a mast, bent over near the top
    tube(part, [Vector((-3, -2, 72.8)), Vector((-3, -2, 82)), Vector((-1.5, -1, 86))], [0.25, 0.18, 0.1], 4, lambda c, n: RUST)
    return finish(part, "tower", ao_ground=True, ao_strength=0.5)


def midrise(seed=2):
    part = Part()
    paint = overgrown(CONCRETE, seed)
    led = overgrown(LEDGE, seed + 9)
    box(part, -13, -8, 0, 13, 8, 34, paint)
    for z in (4.0, 34.0 - 1.0):
        box(part, -13.8, -8.8, z, 13.8, 8.8, z + 1.4, led)
    box(part, -14.2, -9.2, 34.2, 14.2, 9.2, 35.2, led)                    # the cornice
    box(part, -10, -5, 35.2, -4, 0, 38.4, paint)                           # stair house
    box(part, 3, 1, 35.2, 9, 6, 37.4, paint)                               # lift room
    tank(part, 8.0, -4.0, 37.6, paint)
    return finish(part, "midrise", ao_ground=True, ao_strength=0.5)


def ruin(seed=3):
    """The top has come away: the walls end in a ragged line of columns,
    with floor slabs sticking out at the break."""
    rnd = random.Random(seed)
    part = Part()
    paint = overgrown(CONCRETE_DARK, seed)
    led = overgrown(LEDGE, seed + 9)
    hw = 10.0
    base_top = 30.0
    box(part, -hw, -hw, 0, hw, hw, base_top, paint)
    # columns standing up out of the break, at different heights
    for i in range(6):
        for j in range(6):
            if 0 < i < 5 and 0 < j < 5:
                continue                                  # only the perimeter
            x = -hw + i * (2 * hw / 5)
            y = -hw + j * (2 * hw / 5)
            h = base_top + rnd.uniform(0, 1) ** 1.5 * 18.0
            box(part, x - 0.6, y - 0.6, base_top, x + 0.6, y + 0.6, h, paint)
    # floor slabs at the break, some cantilevered out and sagging
    for k, z in enumerate((base_top, base_top + 4.0, base_top + 8.0)):
        w = hw * (1.0 - 0.18 * k)
        box(part, -w, -w * rnd.uniform(0.4, 1.0), z, w * rnd.uniform(0.3, 1.0), w, z + 0.4, led)
    for z in (10.0, 20.0):
        box(part, -hw - 0.4, -hw - 0.4, z, hw + 0.4, hw + 0.4, z + 0.5, led)
    return finish(part, "ruin", ao_ground=True, ao_strength=0.5)


def slab(seed=4):
    part = Part()
    paint = overgrown(CONCRETE, seed)
    led = overgrown(LEDGE, seed + 9)
    box(part, -15, -7, 4.5, 15, 7, 20, paint)                             # the block, raised
    box(part, -15, -7, 0, 15, 2, 4.5, overgrown(CONCRETE_DARK, seed + 2))  # the shop fronts, set back
    for i in range(7):                                                     # the arcade's columns
        x = -15 + i * 5.0
        box(part, x - 0.5, 5.6, 0, x + 0.5, 6.6, 4.5, paint)
    box(part, -15.6, -7.6, 20, 15.6, 7.6, 21, led)
    return finish(part, "slab", ao_ground=True, ao_strength=0.5)


bpy.ops.wm.read_factory_settings(use_empty=True)
print("city kit:")
tower()
midrise()
ruin()
slab()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_glb(OUT)
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB")
