"""The laboratory floor: a stone room around a cast-iron cauldron under a slowly turning spell circle, with flasks
orbiting it, a brass still, a counter of glassware, and a hundred apothecary jars on the walls (instanced and
labelled, as the library's books are)."""
from lib import *
import lib

# ----------------------------------------------------------------------------- materials
material("labfloor", "dark_planks", tile=1.6, tint=(0.62, 0.6, 0.6))
material("labwall", "old_stone_wall", rot=True, tile=1.3, tint=(0.55, 0.56, 0.6))
material("labstone", "monastery_stone_floor", tile=2.2, tint=(0.7, 0.7, 0.72))
material("slab", "marble_01", tile=1.2, tint=(0.8, 0.82, 0.84))
material("castiron", "rusty_metal_02", tile=0.7, tint=(0.5, 0.56, 0.54), rough=0.62, metal=0.9)
material("sand", None, tint=(0.8, 0.62, 0.34), rough=0.9, metal=0.0)
material("brew", gen="brew", rough=0.15, metal=0.0, emissive=0.85, size=512)
material("spell1", gen="spell1", blend="additive", emissive=1.0, tint=(0.5, 0.86, 1.0), size=1024)
material("spell2", gen="spell2", blend="additive", emissive=1.0, tint=(0.72, 0.56, 0.95), size=1024)
material("spell3", gen="spell3", blend="additive", emissive=1.0, tint=(0.5, 0.86, 1.0), size=1024)
material("coal", None, tint=(0.08, 0.06, 0.05), rough=1.0, metal=0.0, emissive=0.0)
material("ember", None, tint=(1.0, 0.45, 0.12), rough=1.0, metal=0.0, emissive=1.0)
material("herb", None, tint=(0.24, 0.36, 0.14), rough=0.9, metal=0.0)
material("cloth", "velour_velvet", tile=0.5, tint=(0.38, 0.22, 0.56), size=512)

WIN_ANG, WIN_Y, WIN_R = 178.0, 3.5, 0.88
HOLE_R = WIN_R - 0.13
CAULD = (0.3, -0.5)
BAND = [(112.0, 150.0), (206.0, 244.0)]
ROWS = [1.05, 1.78, 2.51, 3.24, 3.97]
WALL_A = (100.0, 236.0)
LIGHTS = []

import jars
from jars import ERLEN, BEAKER, RETORT, TUBE, round_flask, vessel, crop, JAR_TINTS


# ----------------------------------------------------------------------------- the room
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
                k = 0.72 + rnd() * 0.26
                box(run - 0.004, 0.2, 0.196, (x + run / 2, -0.1, z + 0.1), mat="labfloor", bevel=0.008, L=0.3, top_only=True, tint=(k, k, k))
                x += run
        z += 0.2
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="labstone", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="labwall", L=1.0)
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, "labstone", step=4.0)


def buttress(a, y1=WH - 0.5):
    arcbox(0.42, y1, 0.3, a, R - 0.5, y1 / 2, mat="labwall", bevel=0.02, segs=2)
    arcbox(0.5, 0.3, 0.38, a, R - 0.5, 0.15, mat="labstone", bevel=0.03, segs=2)
    arcbox(0.5, 0.2, 0.38, a, R - 0.5, y1 - 0.1, mat="labstone", bevel=0.03, segs=2)
    for y in (1.2, 2.6, 3.9):
        arcbox(0.46, 0.05, 0.33, a, R - 0.5, y, mat="iron", bevel=0.01)


def wall():
    for a in np.arange(WALL_A[0], WALL_A[1] + 1e-6, 2.2):
        dx = (R - 0.2) * math.sin(RAD(a - WIN_ANG))
        if abs(dx) < HOLE_R:
            hh = math.sqrt(HOLE_R ** 2 - dx ** 2)
            lo, hi = WIN_Y - hh, WIN_Y + hh
            arcbox(0.2, lo, 0.3, a, R - 0.18, lo / 2, mat="labwall", L=0.3, bevel=0.006)
            arcbox(0.2, WH - hi, 0.3, a, R - 0.18, hi + (WH - hi) / 2, mat="labwall", L=0.3, bevel=0.006)
        else:
            arcbox(0.2, WH, 0.3, a, R - 0.18, WH / 2, mat="labwall", L=0.3, bevel=0.006)
    sweep_arc([(0, 0), (0.06, 0), (0.06, 0.2), (0.03, 0.24), (0, 0.24)], *WALL_A, R - 0.35, 0.0, "labstone")
    sweep_arc([(0, 0), (0.05, 0), (0.12, 0.1), (0.22, 0.15), (0.26, 0.2), (0.26, 0.34), (0.1, 0.34), (0.05, 0.28), (0, 0.26)], *WALL_A, R - 0.38, WH - 0.4, "labstone")
    sweep_arc([(0, 0), (0.06, 0), (0.06, 0.12), (0, 0.12)], *WALL_A, R - 0.35, WH - 0.62, "ebony")        # a timber wall plate
    k = WALL_A[0]
    while k <= WALL_A[1]:
        if abs(k - WIN_ANG) > 9.5:
            buttress(k)
        k += 12.0
    # oak ceiling beams stubbing out of the wall above the shelves
    for a in np.arange(WALL_A[0] + 6, WALL_A[1], 12.0):
        arcbox(0.18, 0.2, 0.9, a, R - 0.75, WH - 0.9, mat="ebony", bevel=0.02)


def railing():
    for a in np.arange(358, 446 + 1e-6, 4.4):
        x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
        box(0.05, 0.84, 0.05, (x, 0.42, z), ry=RAD(a), mat="iron", bevel=0.006)
    sweep_arc([(-0.05, 0.84), (0.05, 0.84), (0.06, 0.9), (0.0, 0.94), (-0.06, 0.9)], 356, 448, R - 0.26, 0.0, "ebony", step=2.0)
    for a in (354, 450):
        x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
        box(0.16, 1.2, 0.16, (x, 0.6, z), ry=RAD(a), mat="ebony", bevel=0.02, segs=2)


def window():
    with at(polar(WIN_ANG, R - 0.4, WIN_Y), ry=RAD(WIN_ANG)):
        lathe([(HOLE_R, -0.18), (WIN_R, -0.18), (WIN_R, 0.18), (HOLE_R, 0.18), (HOLE_R, -0.18)], 56, rx=math.pi / 2, mat="labstone", bevel=0.02, L=0.3)
        lathe([(WIN_R, 0.1), (WIN_R + 0.06, 0.1), (WIN_R + 0.15, 0.15), (WIN_R + 0.18, 0.2), (WIN_R + 0.15, 0.25), (WIN_R, 0.25), (WIN_R, 0.1)], 56,
              rx=math.pi / 2, mat="labstone", bevel=0.01, L=0.3)
        span = HOLE_R * 2
        box(0.05, span, 0.07, (0, 0, 0), mat="iron", bevel=0.008)
        box(span, 0.05, 0.07, (0, 0, 0), mat="iron", bevel=0.008)
        for r_ in (0.28, 0.52):
            torus(r_, 0.008, (0, 0, 0), rx=0.0, mat="iron", seg=48, tseg=6)
        box(span + 0.5, 0.1, 0.5, (0, -WIN_R - 0.08, 0.1), mat="labstone", bevel=0.03, segs=2)


def plaque():
    with at(polar(WIN_ANG, R - 0.355, 1.7), ry=RAD(WIN_ANG)):
        box(0.72, 0.2, 0.014, (0, 0, 0.0), mat="brass", bevel=0.006)
        quad_uv(0.68, 0.17, (0, 0, -0.0085), "labplaque")


material("labplaque", gen="labplaque", size=1024)


def shelf_rows(bi, a0, a1):
    rad = R - 0.56
    for sy in ROWS:
        sweep_arc([(-0.35, -0.05), (0.33, -0.05), (0.33, 0.05), (-0.33, 0.05), (-0.36, 0.03), (-0.36, -0.03)], a0, a1, rad, sy, "shelf", step=2.0)
    # a plank back and two oak posts at each end
    for a in np.arange(a0, a1 + 1e-6, 2.2):
        arcbox(0.2, 4.4, 0.06, a, R - 0.3, 2.45, mat="ebony", bevel=0.0, L=0.8)
    for a in (a0 - 1, a1 + 1):
        arcbox(0.2, 4.6, 0.7, a, rad, 2.4, mat="ebony", bevel=0.03, segs=2)
    # brackets under every board
    for sy in ROWS:
        for a in np.arange(a0 + 3, a1, 8.0):
            arcbox(0.06, 0.2, 0.4, a, rad - 0.1, sy - 0.15, mat="ebony", bevel=0.01)


def shelves():
    for bi, (a0, a1) in enumerate(BAND):
        shelf_rows(bi, a0, a1)
        for ri, sy in enumerate(ROWS):
            jars.fill_row(bi, ri, a0 + 1.4, a1 - 1.6, sy, R - 0.6)
        # herb bundles hanging from the top boards
        for a in np.arange(a0 + 2, a1 - 2, 6.0):
            n = 2 + int(rnd() * 3)
            x, z = (R - 0.7) * math.sin(RAD(a)), (R - 0.7) * math.cos(RAD(a))
            for i in range(n):
                with at((x, 4.45 + 0.12, z), ry=RAD(a) + i):
                    tube([(0, 0, 0), (0, -0.1, 0)], 0.004, 6, "cork")
                    for k in range(7):
                        blade((0, -0.1, 0), (math.cos(k), 0, math.sin(k)), 0.28 + rnd() * 0.1, 0.05, -0.2, 0.5, "herb", (0.9, 0.9, 0.9))


def shelf_cards():
    rad = R - 0.6 - 0.34
    k = 0
    for bi, (a0, a1) in enumerate(BAND):
        for bay in range(3):
            ang = a0 + (a1 - a0) * (bay + 0.5) / 3
            x, z = rad * math.sin(RAD(ang)), rad * math.cos(RAD(ang))
            with at((x, ROWS[0], z), ry=RAD(ang)):
                box(0.23, 0.058, 0.01, mat="brass", bevel=0.004)
                quad_uv(0.21, 0.046, (0, 0, -0.0065), "labcards", uv=(0.0, k / 6, 1.0, (k + 1) / 6))
            k += 1


material("labcards", gen="labcards", rough=0.7, metal=0.0, size=1024, tint=(0.9, 0.87, 0.8))


# ----------------------------------------------------------------------------- the cauldron
def cauldron():
    cx, cz = CAULD
    with at((cx, 0, cz)):
        body = [(0, 0.34), (0.3, 0.34), (0.46, 0.4), (0.58, 0.55), (0.64, 0.74), (0.64, 0.95), (0.6, 1.07), (0.62, 1.1), (0.66, 1.12), (0.66, 1.16), (0.6, 1.17), (0.56, 1.1),
                (0.56, 1.0), (0.58, 0.74), (0.52, 0.56), (0.4, 0.46), (0, 0.44)]
        lathe(body, 40, mat="castiron", bevel=0.004, L=0.4)
        for y in (0.7, 0.98):                                         # riveted bands
            torus(0.645 if y < 0.9 else 0.6, 0.014, (0, y, 0), rx=math.pi / 2, mat="castiron", seg=64, tseg=6)
            for k in range(24):
                a = k / 24 * math.tau
                sphere_uv(0.012, ((0.655 if y < 0.9 else 0.61) * math.cos(a), y, (0.655 if y < 0.9 else 0.61) * math.sin(a)), "castiron", usegs=8, vsegs=6)
        for k in range(3):                                            # three splayed legs
            a = k * math.tau / 3 + 0.5
            c, s_ = math.cos(a), math.sin(a)
            tube(bezier((0.4 * c, 0.52, 0.4 * s_), (0.5 * c, 0.4, 0.5 * s_), (0.55 * c, 0.2, 0.55 * s_), (0.5 * c, 0.02, 0.5 * s_), 10), [0.075 - 0.02 * i / 10 for i in range(11)], 10, "castiron")
            lathe([(0, 0), (0.1, 0), (0.09, 0.05), (0.0, 0.05)], 12, (0.5 * c, 0.0, 0.5 * s_), mat="castiron", bevel=0.004)
        for s_ in (-1, 1):                                            # loop handles
            torus(0.14, 0.022, (s_ * 0.67, 0.95, 0), ry=math.pi / 2, rx=0.0, mat="castiron", seg=24, tseg=8)
        # the brew
        lathe([(0, 1.02), (0.55, 1.02), (0.55, 1.03), (0, 1.03)], 48, mat="brew", L=0.3)
        for k in range(7):                                            # a few bubbles breaking the surface
            a = k * 2.399
            rr = 0.1 + 0.4 * ((k * 0.37) % 1)
            sphere_uv(0.025 + 0.02 * ((k * 0.61) % 1), (rr * math.cos(a), 1.04, rr * math.sin(a)), "brew", usegs=10, vsegs=8)
        # the fire under it
        for k in range(9):
            a = k * 0.7
            rr = 0.1 + 0.22 * ((k * 0.53) % 1)
            box(0.16, 0.1, 0.14, (rr * math.cos(a), 0.06 + 0.05 * (k % 3), rr * math.sin(a)), ry=a, mat="ember", bevel=0.03, segs=2)
        for k in range(6):
            a = k * 1.05
            lathe([(0, 0), (0.07, 0.02), (0.05, 0.14), (0.0, 0.3 + 0.1 * (k % 3))], 8, (0.18 * math.cos(a), 0.14, 0.18 * math.sin(a)), mat="flame", bevel=0.0)
        # a stirring rod leaning on the rim
        tube([(0.12, 1.0, 0.06), (0.32, 1.5, 0.0), (0.5, 2.0, -0.08)], [0.03, 0.026, 0.02], 8, "shelf")


def spell_circle():
    """Three additive discs of runes, turning at their own speeds: the renderer gives each its own matrix."""
    cx, cz = CAULD
    for k, r_ in enumerate((1.55, 1.2, 0.8)):
        with group(f"spin{k}"):
            lathe([(0, 0), (r_, 0), (r_, 0.002), (0, 0.002)], 64, mat=f"spell{k + 1}", L=1.0)
    LIGHTS.append(dict(name="spell", pos=[cx, 2.5, cz], color=[0.42, 0.85, 1.0], intensity=3.2, range=5.0, flicker=0, shadow=0))


def orbit_model():
    """One flask in flight: glass, its liquid and a cork, as a unit the renderer instances round the cauldron."""
    with group("orbit"):
        vessel(ERLEN, (0, -0.14, 0), fill=0.55, liquid=(1, 1, 1), cork=0.05)


# ----------------------------------------------------------------------------- benches and instruments
def counter():
    with at(polar(158, 3.5), ry=RAD(158)):
        box(2.7, 0.08, 0.95, (0, 0.96, 0), mat="slab", bevel=0.015, segs=2, L=0.3)
        box(2.62, 0.1, 0.87, (0, 0.88, 0), mat="ebony", bevel=0.01)
        for sx in (-1, 1):
            box(0.7, 0.84, 0.8, (sx * 0.95, 0.42, 0), mat="ebony", bevel=0.012)
            for k in range(3):
                box(0.62, 0.22, 0.03, (sx * 0.95, 0.15 + k * 0.26, -0.405), mat="desk", bevel=0.008)
                cyl(0.014, 0.014, 0.02, 10, (sx * 0.95, 0.15 + k * 0.26, -0.425), mat="brass", bevel=0.003, rx=math.pi / 2)
        box(0.96, 0.7, 0.04, (0, 0.5, 0.38), mat="ebony", bevel=0.01)
        # glassware along the top
        spots = [(-1.15, ERLEN, (0.3, 0.8, 0.45)), (-0.85, BEAKER, (0.9, 0.62, 0.2)), (-0.55, RETORT, (0.4, 0.55, 0.95)), (0.55, round_flask(0.075), (0.7, 0.35, 0.9)),
                 (0.9, BEAKER, (0.25, 0.8, 0.8)), (1.15, ERLEN, (0.9, 0.3, 0.25))]
        for x, prof, col in spots:
            vessel(prof, (x, 1.0, -0.1 + (rnd() - 0.5) * 0.2), fill=0.55, liquid=col, cork=0.04 if prof is ERLEN else 0.0)
        for k in range(5):                                              # a rack of test tubes
            vessel(TUBE, (-0.05 + k * 0.05, 1.07, 0.18), fill=0.6, seg=14, liquid=pick(JAR_TINTS))
        box(0.3, 0.02, 0.1, (0.05, 1.04, 0.18), mat="shelf", bevel=0.004)
        box(0.3, 0.02, 0.1, (0.05, 1.12, 0.18), mat="shelf", bevel=0.004)
        # mortar and pestle
        lathe([(0, 0), (0.1, 0), (0.15, 0.03), (0.17, 0.14), (0.16, 0.15), (0.12, 0.14), (0.1, 0.05), (0, 0.04)], 28, (0.3, 1.0, 0.3), mat="slab", bevel=0.004)
        tube([(0.3, 1.08, 0.3), (0.34, 1.2, 0.3), (0.42, 1.32, 0.3)], [0.026, 0.02, 0.018], 10, "slab")
        # an open book, a candle, a coil of tubing
        box(0.5, 0.05, 0.36, (-0.15, 1.02, 0.3), 0.2, mat="leather", tint=(0.2, 0.3, 0.2), tint_mode=0.9, bevel=0.01)
        cyl(0.02, 0.02, 0.18, 10, (0.95, 1.09, 0.28), mat="candle", bevel=0.002)
        lathe([(0, 0), (0.014, 0.02), (0.01, 0.06), (0.0, 0.11)], 8, (0.95, 1.18, 0.28), mat="flame")
    LIGHTS.append(dict(name="counter-candle", pos=list(polar(158, 3.5, 1.5)), color=[1.0, 0.64, 0.3], intensity=1.3, range=3.5, flicker=1, shadow=0))


def distillery():
    with at(polar(268, 3.6), ry=RAD(268)):
        box(1.6, 0.08, 0.76, (0, 0.96, 0), mat="slab", bevel=0.015, segs=2)
        box(1.5, 0.84, 0.66, (0, 0.46, 0), mat="ebony", bevel=0.015)
        # boiler, a helmet, a swan neck into a worm of coiled pipe, a receiver
        lathe([(0, 0), (0.28, 0), (0.36, 0.1), (0.38, 0.28), (0.3, 0.46), (0.16, 0.56), (0.12, 0.62), (0, 0.64)], 32, (-0.5, 1.0, 0), mat="copper", bevel=0.003)
        lathe([(0.1, 0), (0.12, 0.0), (0.15, 0.06), (0.1, 0.22), (0.07, 0.3), (0, 0.32)], 24, (-0.5, 1.6, 0), mat="copper", bevel=0.003)
        tube(bezier((-0.5, 1.88, 0), (-0.3, 2.05, 0), (-0.05, 2.02, 0), (0.12, 1.9, 0), 14), [0.03] * 15, 10, "copper")
        coil = [(0.28 + 0.13 * math.cos(t / 6 * math.tau), 1.86 - t * 0.016, 0.13 * math.sin(t / 6 * math.tau)) for t in range(0, 60)]
        tube(coil, [0.018] * len(coil), 8, "copper", closed_ends=True)
        lathe([(0, 0), (0.12, 0), (0.15, 0.02), (0.15, 0.55), (0.12, 0.6), (0, 0.6)], 24, (0.28, 1.0, 0), mat="copper", bevel=0.003)   # the condenser jacket
        vessel(ERLEN, (0.7, 1.0, 0), fill=0.4, liquid=(0.25, 0.85, 0.4), cork=0.05)
        tube([(0.28, 1.0, 0.0), (0.4, 1.12, 0.0), (0.7, 1.26, 0.0)], [0.016] * 3, 8, "copper")
        lathe([(0, 0), (0.1, 0), (0.12, 0.04), (0.0, 0.05)], 20, (-0.5, 0.96, 0), mat="iron", bevel=0.003)                                # the burner
        lathe([(0, 0), (0.06, 0.02), (0.045, 0.1), (0, 0.2)], 10, (-0.5, 0.98, 0), mat="flame")
    LIGHTS.append(dict(name="still", pos=list(polar(268, 3.4, 1.7)), color=[0.4, 0.95, 0.5], intensity=1.6, range=3.8, flicker=1, shadow=0))


material("copper", None, tint=(0.82, 0.46, 0.28), rough=0.32, metal=1.0)


def scales_and_hourglass():
    with at((-2.4, 0, -1.9), ry=0.4):
        box(1.1, 0.08, 0.7, (0, 0.88, 0), mat="desk", bevel=0.012, segs=2)
        for sx in (-0.4, 0.4):
            box(0.1, 0.84, 0.5, (sx, 0.42, 0), mat="ebony", bevel=0.01)
        lathe([(0, 0), (0.14, 0), (0.12, 0.04), (0.05, 0.08), (0.03, 0.5), (0.05, 0.54), (0.0, 0.56)], 20, (0, 0.92, 0), mat="brass", bevel=0.003)
        box(0.84, 0.03, 0.04, (0, 1.46, 0), rz=0.03, mat="brass", bevel=0.006)
        for s_ in (-1, 1):
            for k in range(3):
                tube([(s_ * 0.4, 1.45, 0), (s_ * 0.4 + 0.07 * (k - 1), 1.1, 0.07 * (k % 2))], [0.002, 0.002], 4, "brass", closed_ends=False)
            lathe([(0, 0), (0.15, 0.01), (0.15, 0.03), (0, 0.035)], 24, (s_ * 0.4, 1.08, 0), mat="brass", bevel=0.002)
        # an hourglass
        with at((0.42, 0.92, 0.1)):
            lathe([(0, 0), (0.1, 0), (0.1, 0.03), (0, 0.03)], 20, (0, 0, 0), mat="shelf", bevel=0.004)
            lathe([(0, 0.03), (0.1, 0.03), (0.1, 0.06), (0, 0.06)], 20, (0, 0.2, 0), mat="shelf", bevel=0.004)
            lathe([(0, 0.06), (0.08, 0.06), (0.08, 0.08), (0.04, 0.12), (0.012, 0.16), (0.04, 0.2), (0.08, 0.24), (0.08, 0.26), (0, 0.26)], 24, (0, 0, 0), mat="glass", tint=(1, 1, 1), tint_mode=0.0)
            lathe([(0, 0.07), (0.06, 0.07), (0.05, 0.11), (0.012, 0.15), (0, 0.15)], 20, (0, 0.0, 0), mat="sand")
            for x, z in ((-0.085, 0), (0.085, 0), (0, 0.085), (0, -0.085)):
                tube([(x, 0.03, z), (x, 0.26, z)], 0.005, 6, "shelf")


def crystal_ball():
    with at((2.05, 0, -1.2)):
        lathe([(0, 0), (0.3, 0), (0.3, 0.05), (0.24, 0.08), (0.2, 0.7), (0.26, 0.74), (0.26, 0.8), (0, 0.8)], 8, mat="labstone", bevel=0.01)
        # a brass claw stand
        for k in range(3):
            a = k * math.tau / 3
            c, s_ = math.cos(a), math.sin(a)
            tube(bezier((0.16 * c, 0.8, 0.16 * s_), (0.2 * c, 0.9, 0.2 * s_), (0.2 * c, 0.98, 0.2 * s_), (0.1 * c, 1.02, 0.1 * s_), 8), [0.014] * 9, 8, "brass")
        # the ball: glass over a faint inner glow
        sphere_uv(0.165, (0, 1.0, 0), "glass", usegs=40, vsegs=26)
        sphere_uv(0.09, (0, 1.0, 0), "brew", usegs=20, vsegs=14)


def specimen_shelf():
    with at(polar(334, 4.1), ry=RAD(334)):
        box(2.4, 0.09, 0.62, (0, 0.92, 0), mat="desk", bevel=0.015, segs=2)
        for sx in (-1.0, 1.0):
            box(0.12, 0.88, 0.5, (sx, 0.44, 0), mat="ebony", bevel=0.01)
        box(2.1, 0.06, 0.4, (0, 0.4, 0), mat="shelf", bevel=0.01)
        for i in range(5):
            x = -0.9 + i * 0.45
            vessel([(0, 0), (0.12, 0), (0.13, 0.02), (0.13, 0.28), (0.1, 0.32), (0.1, 0.36), (0.11, 0.37)], (x, 0.965, 0.0), fill=0.78, liquid=(0.5, 0.75, 0.9), cork=0.0)
            lathe([(0, 0), (0.1, 0), (0.105, 0.015), (0, 0.02)], 20, (x, 1.31, 0.0), mat="brass", bevel=0.002)
            sphere_uv(0.05, (x + 0.01, 1.08, 0.0), "herb" if i % 2 else "leather", usegs=12, vsegs=8)


def clutter():
    # a crate, a spilled jar, a discarded robe, loose pages
    x, _, z = polar(330, 4.1)
    with at((x, 0, z), ry=RAD(330)):
        box(0.8, 0.62, 0.8, (0, 0.31, 0), mat="shelf", bevel=0.01)
        for dy in (0.2, 0.46):
            box(0.84, 0.05, 0.84, (0, dy, 0), mat="ebony", bevel=0.01)
        box(0.84, 0.06, 0.84, (0, 0.65, 0), mat="ebony", bevel=0.01)
        vessel(ERLEN, (0.1, 0.68, 0.0), fill=0.5, liquid=(0.62, 0.3, 0.85), cork=0.05)
    with at((1.6, 0.0, 0.5), ry=0.4):
        vessel([(0, 0), (0.1, 0), (0.11, 0.015), (0.11, 0.16), (0.08, 0.2), (0.08, 0.24), (0.09, 0.245)], (0, 0.11, 0.0), fill=0.3, liquid=(0.2, 0.75, 0.38), rx=1.45)
    subsurf_box(1.25, 0.1, 0.85, (-1.35, 0.06, 0.5), "cloth", ry=0.7, bevel=0.03, tint=(0.9, 0.9, 0.9))
    subsurf_box(0.62, 0.1, 0.46, (-1.6, 0.17, 0.66), "cloth", ry=0.3, bevel=0.03, tint=(0.85, 0.85, 0.85))
    for _ in range(14):
        px, _, pz = polar(rnd() * 360, 0.9 + rnd() * 3.5)
        quad_uv(0.21, 0.297, (px, 0.012 + 0.0008 * _, pz), "letter", up=True, ry=rnd() * math.pi)


def plants():
    with at(polar(268, 4.5), ry=0.5):
        place(import_model("potted_plant_02", 16000), scale=1.4)
    with at(polar(324, 4.4), ry=1.0):
        place(import_model("potted_plant_01", 16000, keep=("stem", "pot", "leaves")), scale=1.0)
    with at(polar(190, 4.5), ry=2.0):
        place(import_model("potted_plant_02", 12000), scale=1.1)


def scans():
    with at((0, 0, 0)):
        with at(polar(158, 3.5, 1.0), ry=RAD(158)):
            place(import_model("antique_ceramic_vase_01", 7000), pos=(-0.15, 0, 0.2), scale=0.75)
            place(import_model("brass_goblets", 12000), pos=(0.25, 0, -0.25), scale=0.9)
    with at(polar(300, 3.6), ry=RAD(300)):
        place(import_model("treasure_chest", 10000), scale=1.0)


# ----------------------------------------------------------------------------- build / write
def build():
    def stage(fn, *a):
        t0 = sum(b.n for b in BATCHES.values())
        fn(*a)
        print(f"[lab]   {fn.__name__}: {sum(b.n for b in BATCHES.values()) - t0} corners", flush=True)

    for fn in (floor_and_platform, wall, railing, window, plaque, shelves, shelf_cards, cauldron, counter, distillery, scales_and_hourglass, crystal_ball,
               specimen_shelf, clutter, plants, scans):
        stage(fn)
    spell_circle(); jars.jar_units(); orbit_model()
    shaft_model(polar(WIN_ANG, R - 0.5, WIN_Y), polar(WIN_ANG - 18, 1.1, 0.06), 0.72, 0.72 * 2.4)


def write(ctx):
    name = "lab"
    tree = ctx["tree"]
    shelf = jars.write_instances(tree, name)

    cx, cz = CAULD
    lights = [dict(name="cauldron", pos=[cx, 1.5, cz], color=[0.39, 0.88, 0.5], intensity=7.5, range=7.5, flicker=1, shadow=1)] + LIGHTS
    manifest = base_manifest(
        ctx,
        labelSet="jars",
        lights=lights,
        window=window_manifest(WIN_ANG, WIN_Y, HOLE_R),
        spinners=[
            {"group": "spin0", "pos": [cx, 2.5, cz], "axis": "y", "rate": 0.32, "bob": 0.14, "phase": 0.0},
            {"group": "spin1", "pos": [cx, 2.52, cz], "axis": "y", "rate": -0.5, "bob": 0.14, "phase": 0.0},
            {"group": "spin2", "pos": [cx, 2.54, cz], "axis": "y", "rate": 0.85, "bob": 0.14, "phase": 0.0},
        ],
        orbiters={"center": [cx, 0, cz], "count": 5, "r": 1.05, "y": 2.9, "speed": -0.55, "scale": 1.0,
                  "tints": [[0.62, 0.32, 0.85], [0.9, 0.62, 0.15], [0.2, 0.75, 0.38], [0.25, 0.5, 0.9], [0.85, 0.22, 0.2]]},
        shelfBooks=shelf,
        slots=jars.SLOTS,
        camera={"pos": polar(332, 4.4, 2.2), "target": [cx, 1.4, cz]},
    )
    write_manifest(name, manifest)
