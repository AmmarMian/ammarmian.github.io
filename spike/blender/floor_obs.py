"""The observatory: the tower's open roof under a night sky. A stone parapet, a brass refractor on a stone pier, an orrery
and an armillary that turn, a chart table with a typeset planisphere, a brazier, a bell, a sundial, a rack of letters.
There is no window and no sun: the light is the moon, a brazier and a handful of lamps."""
from lib import *
import lib

material("obsfloor", "dark_planks", tile=1.6, tint=(0.55, 0.57, 0.62))
material("obswall", "old_stone_wall", rot=True, tile=1.2, tint=(0.62, 0.64, 0.7))
material("obsstone", "monastery_stone_floor", tile=2.0, tint=(0.62, 0.64, 0.7))
material("obsslab", "marble_01", tile=1.2, tint=(0.7, 0.72, 0.78))
material("glass", None, tint=(0.8, 0.92, 0.95), rough=0.05, metal=0.0, alpha=0.16, blend="alpha")
material("liquid", None, tint=(1, 1, 1), rough=0.25, metal=0.0, emissive=0.3)
material("ember", None, tint=(1.0, 0.45, 0.12), rough=1.0, metal=0.0, emissive=1.0)
material("starchart", gen="starchart", rough=0.9, metal=0.0, size=1024)
material("obsplaque", gen="obsplaque", size=1024)
material("comet", None, tint=(0.6, 0.9, 1.0), rough=0.3, metal=0.0, emissive=0.55)
material("cometTail", None, tint=(0.6, 0.45, 1.0), rough=0.3, metal=0.0, emissive=0.3)
material("lens", None, tint=(0.9, 0.95, 1.0), rough=0.04, metal=0.0, alpha=0.25, blend="alpha")
material("sun", None, tint=(1.0, 0.8, 0.35), rough=0.4, metal=0.0, emissive=0.9)

WALL_GAP = (336.0, 366.0)
LIGHTS = []
MOON = (3.0, 14.0, -4.0)


def floor_and_platform():
    z = -R
    while z < R:
        half = math.sqrt(max(R * R - (z + 0.1) ** 2, 0))
        if half > 0.3:
            x = -half
            while x < half - 0.05:
                run = min(half - x, 1.3 + rnd() * 2.0)
                if half - (x + run) < 0.5:
                    run = half - x
                k = 0.7 + rnd() * 0.26
                box(run - 0.004, 0.2, 0.196, (x + run / 2, -0.1, z + 0.1), mat="obsfloor", bevel=0.008, L=0.3, top_only=True, tint=(k, k, k))
                x += run
        z += 0.2
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="obsstone", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="obswall", L=1.0)
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, "obsstone", step=4.0)


def parapet():
    """A battlemented stone wall round the roof, open where the stair arrives."""
    a = 100.0
    while a <= 452.0:
        if not (WALL_GAP[0] < a < WALL_GAP[1]):
            arcbox(0.36, 1.15, 0.36, a, R - 0.2, 0.6, mat="obswall", bevel=0.02, segs=2, tint=(0.9 + 0.1 * rnd(),) * 3)
            if round(a) % 22 == 0:
                arcbox(0.34, 0.5, 0.38, a, R - 0.2, 1.55, mat="obswall", bevel=0.025, segs=2)
        a += 4.4
    for (a0, a1) in ((100.0, WALL_GAP[0] - 2), (WALL_GAP[1] + 2, 450.0)):
        sweep_arc([(-0.24, 0), (0.22, 0), (0.24, 0.1), (0.2, 0.14), (-0.2, 0.14), (-0.26, 0.1)], a0, a1, R - 0.2, 1.17, "obsstone", step=2.0)
        sweep_arc([(-0.2, 0), (0.2, 0), (0.2, 0.16), (-0.2, 0.16)], a0, a1, R - 0.2, 0.0, "obsstone", step=3.0)
    # a stone newel on either side of the stair
    for a in (WALL_GAP[0] - 1.2, WALL_GAP[1] + 1.2):
        arcbox(0.46, 1.5, 0.46, a, R - 0.2, 0.75, mat="obsstone", bevel=0.03, segs=2)
        arcbox(0.54, 0.12, 0.54, a, R - 0.2, 1.54, mat="obsstone", bevel=0.02)
        lathe([(0, 0), (0.11, 0), (0.1, 0.1), (0.04, 0.2), (0, 0.22)], 14, ((R - 0.2) * math.sin(RAD(a)), 1.6, (R - 0.2) * math.cos(RAD(a))), mat="obsstone", bevel=0.005)


# ----------------------------------------------------------------------------- the refractor
def telescope():
    with at(polar(120, 2.0), ry=RAD(302)):
        # a stone pier, stepped
        box(1.15, 0.22, 1.15, (0, 0.11, 0), mat="obsstone", bevel=0.02, segs=2)
        box(0.9, 0.16, 0.9, (0, 0.3, 0), mat="obsstone", bevel=0.02, segs=2)
        lathe([(0, 0.38), (0.34, 0.38), (0.3, 0.44), (0.27, 0.5), (0.27, 1.38), (0.3, 1.42), (0.36, 1.46), (0.0, 1.48)], 20, mat="obswall", bevel=0.005)
        box(0.8, 0.12, 0.8, (0, 1.52, 0), mat="obsstone", bevel=0.02, segs=2)
        lathe([(0, 0), (0.26, 0), (0.28, 0.04), (0.24, 0.18), (0.0, 0.18)], 28, (0, 1.58, 0), mat="brass", bevel=0.004)
        lathe([(0.12, 0), (0.16, 0), (0.16, 0.2), (0.12, 0.2)], 24, (0, 1.76, 0), mat="brass", bevel=0.004)
        # the fork: two arms rising from a yoke, with brass setting circles
        box(0.9, 0.14, 0.22, (0, 1.86, 0), mat="iron", bevel=0.02, segs=2)
        for dx in (-0.37, 0.37):
            box(0.12, 0.62, 0.2, (dx, 2.2, 0), mat="iron", bevel=0.02, segs=2)
            lathe([(0, 0), (0.13, 0), (0.13, 0.07), (0, 0.07)], 24, (dx + (0.07 if dx > 0 else -0.07), 2.52, 0), mat="brass", bevel=0.006, rz=math.pi / 2)
            torus(0.19, 0.012, (dx + (0.08 if dx > 0 else -0.08), 2.52, 0), ry=math.pi / 2, mat="brass", seg=40, tseg=6)
        # the tube, tilted at the sky
        with at((0, 2.52, 0), rx=-0.62):
            body = [(0, -1.0), (0.2, -1.0), (0.24, -0.96), (0.24, -0.2), (0.26, -0.15), (0.26, 0.6), (0.25, 0.66), (0.25, 1.1), (0.31, 1.14), (0.31, 1.6), (0.29, 1.62), (0.29, 1.58), (0.25, 1.1)]
            lathe(body[:-3], 40, mat="brass", bevel=0.003)
            lathe([(0.3, 1.1), (0.33, 1.1), (0.33, 1.6), (0.3, 1.6)], 40, mat="iron", bevel=0.005)
            for y in (-0.2, 0.62, 1.1):
                torus(0.27 if y < 1 else 0.32, 0.018, (0, y, 0), rx=math.pi / 2, mat="gilt", seg=48, tseg=6)
            # leather grip, focuser, eyepiece and a finder scope
            lathe([(0.255, -0.1), (0.272, -0.1), (0.272, 0.5), (0.255, 0.5)], 40, mat="leather", bevel=0.003, tint=(0.25, 0.14, 0.08), tint_mode=0.9)
            box(0.22, 0.2, 0.26, (0, -0.85, 0.24), mat="iron", bevel=0.02)
            lathe([(0, 0), (0.07, 0), (0.09, 0.2), (0.11, 0.34), (0.0, 0.34)], 24, (0, -0.86, 0.5), rx=math.pi / 2, mat="brass", bevel=0.004)
            lathe([(0, 0), (0.05, 0), (0.05, 0.1), (0, 0.1)], 14, (0.26, -0.85, 0.18), rz=math.pi / 2, mat="brass", bevel=0.003)
            lathe([(0, -0.3), (0.05, -0.3), (0.07, 0.0), (0.07, 0.48), (0.09, 0.52), (0.0, 0.52)], 20, (0.3, 0.1, 0.1), mat="brass", bevel=0.003)
            for yy in (-0.2, 0.3):
                box(0.08, 0.06, 0.26, (0.3, yy, 0.0), mat="iron", bevel=0.01)
            # the counterweight on its rod
            tube([(0, -1.0, 0), (0, -1.5, 0)], 0.035, 8, "iron")
            lathe([(0, 0), (0.18, 0), (0.2, 0.04), (0.2, 0.2), (0.18, 0.24), (0, 0.24)], 24, (0, -1.74, 0), mat="iron", bevel=0.005)
        # a nameplate on the pier
        quad_uv(0.46, 0.115, (0, 1.0, -0.3), "obsplaque")


# ----------------------------------------------------------------------------- instruments that turn
def orrery_static():
    with at(polar(210, 2.6)):
        lathe([(0, 0), (0.34, 0), (0.34, 0.1), (0.26, 0.14), (0.0, 0.14)], 28, mat="ebony", bevel=0.01)
        lathe([(0, 0.14), (0.16, 0.14), (0.14, 0.3), (0.1, 0.4), (0.09, 0.8), (0.12, 0.88), (0.1, 1.0), (0.0, 1.02)], 20, mat="shelf", bevel=0.004)


def orrery_moving():
    """Rings, planets and a sun: one spinning group, its pivot on the pole of the armature."""
    with group("spin0"):
        for r, tilt, col in ((0.62, 0.5, "brass"), (0.9, -0.35, "brass"), (1.15, 0.2, "brass")):
            torus(r, 0.03, (0, 1.1, 0), rx=math.pi / 2 + tilt, mat=col, seg=64, tseg=8)
        for k, (r, tilt) in enumerate(((0.62, 0.5), (0.9, -0.35), (1.15, 0.2))):
            a = k * 2.0
            sphere_uv(0.09, (math.cos(a) * r, 1.1 + math.sin(tilt) * r * 0.3, math.sin(a) * r), "globe", usegs=24, vsegs=16)
            tube([(0, 1.1, 0), (math.cos(a) * r, 1.1 + math.sin(tilt) * r * 0.3, math.sin(a) * r)], 0.006, 6, "brass")
        sphere_uv(0.17, (0, 1.1, 0), "sun", usegs=24, vsegs=16)


def armillary_static():
    x, _, z = polar(74, 3.5)
    with at((x, 0, z)):
        lathe([(0, 0), (0.3, 0), (0.3, 0.07), (0.2, 0.12), (0.0, 0.12)], 28, mat="ebony", bevel=0.008)
        lathe([(0, 0.12), (0.11, 0.12), (0.08, 0.3), (0.08, 0.9), (0.12, 1.0), (0.0, 1.04)], 20, mat="shelf", bevel=0.004)


def armillary_moving():
    with group("spin1"):
        for r, a, b in ((0.7, 0.0, 0.0), (0.7, 1.2, 0.5), (0.7, 2.4, 1.1), (0.52, 0.5, 1.57)):
            torus(r, 0.028, (0, 0, 0), ry=a, rx=b, mat="brass", seg=64, tseg=8)
        sphere_uv(0.13, (0, 0, 0), "rune", usegs=20, vsegs=14)
        tube([(0, -0.82, 0), (0, 0.82, 0)], 0.012, 8, "brass")


def comet_model():
    with group("orbit"):
        sphere_uv(0.15, (0, 0, 0), "comet", usegs=20, vsegs=14)
        for i in range(7):
            sphere_uv(0.13 - i * 0.015, (-0.2 - i * 0.18, 0, 0), "cometTail", usegs=10, vsegs=8)


# ----------------------------------------------------------------------------- furniture and fixtures
def chart_table():
    with at(polar(30, 3.1), ry=RAD(30)):
        box(1.8, 0.09, 1.1, (0, 0.92, 0), mat="desk", bevel=0.02, segs=2, L=0.3)
        box(1.7, 0.2, 1.0, (0, 0.8, 0), mat="ebony", bevel=0.015)
        for sx in (-0.78, 0.78):
            for sz in (-0.42, 0.42):
                lathe([(0, 0), (0.055, 0), (0.05, 0.1), (0.07, 0.2), (0.05, 0.5), (0.065, 0.62), (0.06, 0.72), (0.0, 0.74)], 14, (sx, 0, sz), mat="ebony", bevel=0.004)
        box(1.5, 0.02, 0.1, (0, 0.2, 0.42), mat="ebony", bevel=0.005)
        quad_uv(1.0, 1.0, (-0.1, 0.9715 + 0.0, 0.0), "starchart", up=True, ry=0.06)                 # the planisphere on the table
        box(1.04, 0.006, 1.04, (-0.1, 0.9715 - 0.0035, 0.0), 0.06, mat="paper", bevel=0.002)
        # a rolled chart, dividers, and a lantern
        cyl(0.05, 0.05, 0.8, 12, (0.3, 1.04, 0.43), mat="paper", bevel=0.002, rz=math.pi / 2, ry=0.1)
        with at((0.32, 0.9715, -0.35), ry=0.5):
            tube([(0, 0, 0), (0.1, 0.0, 0.0), (0.2, 0.0, 0.0)], 0.004, 6, "brass")
            tube([(0, 0, 0), (0.1, 0.0, 0.07), (0.2, 0.0, 0.0)], 0.004, 6, "brass")
        with at((0.74, 0.97, 0.15)):
            lathe([(0, 0), (0.1, 0), (0.1, 0.02), (0.0, 0.02)], 14, mat="iron", bevel=0.002)
            for k in range(4):
                a = k * math.pi / 2 + math.pi / 4
                tube([(0.08 * math.cos(a), 0.02, 0.08 * math.sin(a)), (0.08 * math.cos(a), 0.3, 0.08 * math.sin(a))], 0.006, 6, "iron")
            lathe([(0, 0.02), (0.08, 0.02), (0.08, 0.3), (0, 0.3)], 4, mat="glass", tint=(1, 0.9, 0.7), tint_mode=0.0, rz=0.0)
            cyl(0.018, 0.018, 0.14, 10, (0, 0.09, 0), mat="candle", bevel=0.002)
            lathe([(0, 0), (0.014, 0.02), (0.01, 0.06), (0.0, 0.11)], 8, (0, 0.16, 0), mat="flame")
            lathe([(0, 0.3), (0.12, 0.3), (0.06, 0.38), (0.0, 0.4)], 14, mat="iron", bevel=0.003)
    LIGHTS.append(dict(name="lantern", pos=list(polar(30, 3.1, 1.5)), color=[1.0, 0.82, 0.58], intensity=3.0, range=5.0, flicker=1, shadow=0))


def brazier():
    x, _, z = polar(160, 4.0)
    with at((x, 0, z)):
        lathe([(0, 0), (0.22, 0), (0.2, 0.05), (0.06, 0.1), (0.1, 0.5), (0.07, 0.7), (0.0, 0.72)], 20, mat="iron", bevel=0.004)
        lathe([(0, 0.7), (0.16, 0.7), (0.3, 0.82), (0.43, 1.0), (0.45, 1.05), (0.42, 1.04), (0.28, 0.9), (0.0, 0.84)], 28, mat="iron", bevel=0.004)
        for k in range(3):
            a = k * math.tau / 3
            tube(bezier((0.06 * math.cos(a), 0.12, 0.06 * math.sin(a)), (0.3 * math.cos(a), 0.14, 0.3 * math.sin(a)), (0.3 * math.cos(a), 0.06, 0.3 * math.sin(a)), (0.3 * math.cos(a), 0.0, 0.3 * math.sin(a)), 8), [0.02] * 9, 8, "iron")
        for k in range(10):
            a = k * 0.9
            rr = 0.05 + 0.2 * ((k * 0.43) % 1)
            box(0.14, 0.09, 0.12, (rr * math.cos(a), 0.99 + 0.04 * (k % 3), rr * math.sin(a)), ry=a, mat="ember", bevel=0.03, segs=2)
        for k in range(7):
            a = k * 0.9
            lathe([(0, 0), (0.07, 0.02), (0.05, 0.16), (0.0, 0.34 + 0.12 * (k % 3))], 8, (0.14 * math.cos(a), 1.04, 0.14 * math.sin(a)), mat="flame")
    LIGHTS.insert(0, dict(name="brazier", pos=[x, 1.5, z], color=[1.0, 0.55, 0.25], intensity=9.0, range=8.5, flicker=1, shadow=1))


def crate_and_charts():
    x, _, z = polar(268, 4.0)
    with at((x, 0, z), ry=RAD(268)):
        box(0.8, 0.58, 0.8, (0, 0.29, 0), mat="shelf", bevel=0.01)
        for dy in (0.15, 0.43):
            box(0.84, 0.05, 0.84, (0, dy, 0), mat="ebony", bevel=0.01)
        box(0.84, 0.07, 0.84, (0, 0.62, 0), mat="ebony", bevel=0.01)
        for i in range(3):
            cyl(0.055, 0.055, 0.78, 12, (0.1 * i - 0.1, 0.76, 0.0), mat="paper", bevel=0.002, rz=math.pi / 2, ry=0.14 * i)
    for _ in range(8):
        px, _, pz = polar(rnd() * 360, 1.0 + rnd() * 3.2)
        quad_uv(0.21, 0.297, (px, 0.012 + 0.0008 * _, pz), "letter", up=True, ry=rnd() * math.pi)


def sundial():
    x, _, z = polar(340, 2.9)
    with at((x, 0, z)):
        lathe([(0, 0), (0.42, 0), (0.42, 0.08), (0.34, 0.14), (0.3, 0.18), (0.28, 0.8), (0.34, 0.86), (0.36, 0.9), (0.0, 0.9)], 20, mat="obsstone", bevel=0.01)
        lathe([(0, 0.9), (0.5, 0.9), (0.5, 0.97), (0.0, 0.97)], 48, mat="brass", bevel=0.004)
        for k in range(24):
            a = k / 24 * math.tau
            box(0.015, 0.004, 0.05 if k % 2 == 0 else 0.03, (0.43 * math.cos(a), 0.972, 0.43 * math.sin(a)), ry=-a, mat="iron", bevel=0.0)
        with at((0, 0.97, 0), rx=0.0):
            tube([(0, 0, 0), (0.0, 0.34, -0.2)], [0.03, 0.01], 8, "brass")


def bell_frame():
    x, _, z = polar(258, 3.9)
    with at((x, 0, z), ry=RAD(258)):
        for sx in (-1, 1):
            box(0.14, 1.7, 0.14, (sx * 0.38, 0.85, 0), mat="shelf", bevel=0.015)
            box(0.14, 0.14, 0.7, (sx * 0.38, 0.07, 0), mat="shelf", bevel=0.015)
        box(1.0, 0.14, 0.16, (0, 1.74, 0), mat="ebony", bevel=0.02)
        lathe([(0.0, 0.0), (0.07, 0.0), (0.12, -0.04), (0.2, -0.22), (0.28, -0.42), (0.33, -0.5), (0.34, -0.52), (0.28, -0.5), (0.2, -0.4), (0.12, -0.2), (0.06, -0.08), (0.0, -0.05)], 28, (0, 1.65, 0), mat="brass", bevel=0.004)
        tube([(0, 1.1, 0), (0, 1.22, 0)], 0.016, 6, "iron")
        sphere_uv(0.04, (0, 1.1, 0), "iron", usegs=10, vsegs=8)


def lens_stands():
    for i in range(4):
        x, _, z = polar(140 + i * 7, 4.0)
        with at((x, 0, z)):
            lathe([(0, 0), (0.1, 0), (0.09, 0.04), (0.04, 0.08), (0.03, 0.46), (0.0, 0.48)], 14, mat="ebony", bevel=0.003)
            torus(0.14, 0.012, (0, 0.62, 0), rx=math.pi / 2, mat="brass", seg=32, tseg=6)
            lathe([(0, -0.012), (0.138, -0.012), (0.138, 0.012), (0, 0.012)], 32, (0, 0.62, 0), rx=math.pi / 2, mat="lens", bevel=0.0)
            tube([(0, 0.48, 0), (0, 0.55, 0), (0.0, 0.62 - 0.14, 0)], 0.01, 6, "brass")


def rack():
    """The correspondence rack: four pigeonholes with a token apiece (a sealed letter, a ribboned offprint, a sigil stone, a scrying disc)."""
    with at(polar(305, 3.5), ry=RAD(305 + 180)):
        box(0.78, 0.12, 0.56, (0, 0.06, 0), mat="ebony", bevel=0.015, segs=2)
        lathe([(0, 0.12), (0.12, 0.12), (0.1, 0.4), (0.08, 0.9), (0.14, 1.0), (0, 1.0)], 14, mat="shelf", bevel=0.004)
        box(1.62, 0.07, 0.38, (0, 1.0, 0), mat="desk", bevel=0.01, segs=2)
        box(1.62, 0.62, 0.05, (0, 1.32, -0.17), mat="ebony", bevel=0.008)
        box(1.68, 0.08, 0.4, (0, 1.66, 0), mat="ebony", bevel=0.012, segs=2)
        for dx in (-0.79, -0.4, 0, 0.4, 0.79):
            box(0.05, 0.58, 0.34, (dx, 1.33, 0), mat="shelf", bevel=0.006)
        sx = [-0.6, -0.2, 0.2, 0.6]
        with at((sx[0], 1.18, 0.04), rz=0.06):                                                   # a sealed letter
            quad_uv(0.26, 0.36, (0, 0.1, 0.0), "letter", up=False, ry=math.pi)
            cyl(0.04, 0.04, 0.02, 14, (0, 0.04, 0.012), mat="wax", bevel=0.002, rx=math.pi / 2)
        with at((sx[1], 1.18, 0.04), rz=-0.06):                                                  # a rolled offprint with a ribbon
            cyl(0.08, 0.08, 0.4, 14, (0, 0.2, 0), mat="paper", bevel=0.002)
            cyl(0.085, 0.085, 0.06, 14, (0, 0.22, 0), mat="velvet", bevel=0.002, tint=(0.4, 0.2, 0.6), tint_mode=0.9)
        with at((sx[2], 1.18, 0.04), rz=0.06):                                                   # a sigil stone
            box(0.22, 0.32, 0.08, (0, 0.16, 0), mat="obsstone", bevel=0.02, segs=2)
            box(0.1, 0.1, 0.02, (0, 0.18, -0.045), ry=0.0, rz=0.78, mat="brass", bevel=0.004)
        with at((sx[3], 1.18, 0.04), rz=-0.06):                                                  # a scrying disc
            torus(0.13, 0.016, (0, 0.17, 0), rx=0.0, ry=0.0, mat="brass", seg=32, tseg=8)
            lathe([(0, -0.01), (0.12, -0.01), (0.12, 0.01), (0, 0.01)], 28, (0, 0.17, 0), rx=math.pi / 2, mat="glass", tint=(0.6, 0.9, 1.0), tint_mode=0.0)
            lathe([(0, -0.004), (0.1, -0.004), (0.1, 0.004), (0, 0.004)], 28, (0, 0.17, 0), rx=math.pi / 2, mat="rune", emissive=0.6)
    LIGHTS.append(dict(name="rack", pos=list(polar(305, 3.0, 1.9)), color=[1.0, 0.82, 0.62], intensity=2.2, range=3.6, flicker=0, shadow=0))


def plants():
    with at(polar(96, 4.4), ry=0.4):
        place(import_model("potted_plant_02", 16000), scale=1.4)
    with at(polar(236, 4.5), ry=1.4):
        place(import_model("potted_plant_01", 16000, keep=("stem", "pot", "leaves")), scale=1.0)
    with at(polar(190, 4.4), ry=2.6):
        place(import_model("brass_vase_01", 9000), scale=0.9)


def build():
    def stage(fn, *a):
        t0 = sum(b.n for b in BATCHES.values())
        fn(*a)
        print(f"[obs]   {fn.__name__}: {sum(b.n for b in BATCHES.values()) - t0} corners", flush=True)

    for fn in (floor_and_platform, parapet, telescope, orrery_static, armillary_static, chart_table, brazier, crate_and_charts, sundial, bell_frame,
               lens_stands, rack, plants):
        stage(fn)
    orrery_moving(); armillary_moving(); comet_model()
    LIGHTS.append(dict(name="deck", pos=[0.0, 2.6, 0.0], color=[0.82, 0.78, 1.0], intensity=1.4, range=9.0, flicker=0, shadow=0))
    LIGHTS.append(dict(name="orrery", pos=list(polar(210, 2.6, 1.5)), color=[1.0, 0.76, 0.42], intensity=2.0, range=4.0, flicker=0, shadow=0))
    LIGHTS.append(dict(name="comet", pos=[0.0, 3.4, 0.0], color=[0.6, 0.85, 1.0], intensity=2.2, range=5.0, flicker=0, shadow=0))


def write(ctx):
    name = "obs"
    m = Vector(MOON).normalized()
    ox, _, oz = polar(210, 2.6)
    ax, _, az = polar(74, 3.5)
    manifest = base_manifest(
        ctx,
        lights=LIGHTS,
        window={"center": [0, -50, 0], "normal": [0, 0, 1], "right": [1, 0, 0], "radius": 0.0, "towardSun": [m.x, m.y, m.z], "shaftFrom": [0, 0, 0], "shaftTo": [0, 0, 0]},
        atmosphere={"sunColor": [0.64, 0.74, 1.0], "sunStrength": 1.3, "skyTop": [0.004, 0.01, 0.04], "skyHorizon": [0.03, 0.045, 0.1], "ambient": [0.08, 0.11, 0.24],
                    "ambientScale": 1.0, "ground": [0.03, 0.035, 0.07], "stars": 1.0, "exposure": 1.9, "bloom": 0.22, "rays": 0.0},
        spinners=[{"group": "spin0", "pos": [ox, 0.0, oz], "axis": "y", "rate": 0.12, "bob": 0.0},
                  {"group": "spin1", "pos": [ax, 1.1, az], "axis": "y", "rate": 0.2, "bob": 0.03}],
        orbiters={"center": [0, 0, 0], "count": 1, "r": 2.2, "y": 3.2, "speed": 0.5, "scale": 1.0, "tints": [[0.6, 0.85, 1.0]]},
        camera={"pos": polar(336, 4.7, 2.0), "target": [0.0, 1.5, 0.0]},
    )
    write_manifest(name, manifest)
