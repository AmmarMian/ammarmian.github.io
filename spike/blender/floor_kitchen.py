"""The kitchen: a stone hearth with a real fire and a kettle that steams, a laden trestle table, a pantry dresser of labelled jars, a pot rack,
a sink where dishes wash themselves in the air, a slate chalked with what the keeper is up to, flour sacks and herbs on strings."""
from lib import *
import lib
import arch
import jars

material("kfloor", "wood_cabinet_worn_long", tile=1.4, rot=True, tint=(0.95, 0.78, 0.6))
material("kwall", "old_stone_wall", rot=True, tile=1.3, tint=(0.9, 0.82, 0.72))
material("khearth", "monastery_stone_floor", tile=1.6, tint=(0.62, 0.58, 0.56))
material("kslab", "marble_01", tile=1.2, tint=(0.82, 0.8, 0.76))
material("linen", gen="linen", rough=0.95, metal=0.0, size=512)
material("slate", gen="slate", rough=0.85, metal=0.0, size=1024)
material("fire", None, tint=(1, 1, 1), blend="fire", emissive=1.0, rough=1.0, metal=0.0)
material("steam", None, tint=(1, 1, 1), blend="steam", emissive=1.0, rough=1.0, metal=0.0)
material("water", None, tint=(0.3, 0.55, 0.62), blend="water", rough=0.06, metal=0.0)
material("soup", None, tint=(0.62, 0.34, 0.16), rough=0.3, metal=0.0, emissive=0.1)
material("terracotta", None, tint=(0.68, 0.32, 0.2), rough=0.85, metal=0.0)
material("copper", None, tint=(0.82, 0.46, 0.28), rough=0.32, metal=1.0)
material("ember", None, tint=(1.0, 0.45, 0.12), rough=1.0, metal=0.0, emissive=1.0)
material("crust", None, tint=(0.46, 0.25, 0.1), rough=0.8, metal=0.0)
material("cheese", None, tint=(0.9, 0.7, 0.28), rough=0.6, metal=0.0)
material("fruit", None, tint=(0.75, 0.15, 0.1), rough=0.4, metal=0.0)
material("apple", None, tint=(0.5, 0.65, 0.2), rough=0.4, metal=0.0)
material("eyeblack", None, tint=(0.03, 0.02, 0.02), rough=0.5, metal=0.0)

WIN_ANG, WIN_Y, WIN_R = 214.0, 3.2, 0.7
HOLE_R = WIN_R - 0.13
HEARTH = polar(150, R - 0.75)
LIGHTS = []
SPICE_TINTS = [(0.8, 0.5, 0.15), (0.55, 0.12, 0.08), (0.3, 0.5, 0.18), (0.45, 0.28, 0.12), (0.9, 0.82, 0.55), (0.62, 0.62, 0.55)]


def room():
    arch.plank_floor("kfloor", tint=(0.7, 0.96))
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="khearth", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="kwall", L=1.0)
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, "khearth", step=4.0)
    arch.core_wall("kwall", 100.0, 236.0, win=(WIN_ANG, WIN_Y, HOLE_R))
    arch.mouldings("ebony", "ebony", 100.0, 236.0, rail_mat="ebony", rail_y=1.0)
    for k in np.arange(100.0, 236.01, 12.0):
        if abs(k - WIN_ANG) > 8.0 and abs(k - 150) > 9.0:
            arch.buttress(k, "kwall", "khearth", band_mat=None)
    # ceiling beams stubbing in from the wall
    for a in np.arange(106.0, 236.0, 12.0):
        arcbox(0.2, 0.24, 1.0, a, R - 0.8, WH - 0.95, mat="ebony", bevel=0.02)
    arch.round_window(WIN_ANG, WIN_Y, WIN_R, "khearth", "ebony", lattice=True)
    arch.balustrade("ebony", "ebony", turned=True)


def hearth():
    """A big stone fireplace with a hood, built facing the room; fire, embers, a spirit's face, a kettle on an iron arm, steam."""
    with at((HEARTH[0], 0, HEARTH[2]), ry=RAD(330)):
        box(2.6, 3.2, 0.3, (0, 1.6, -0.25), mat="khearth", bevel=0.02, segs=2, L=0.3)
        for dx in (-1.1, 1.1):
            box(0.42, 2.0, 0.9, (dx, 1.0, 0.15), mat="khearth", bevel=0.03, segs=2, L=0.3)
        box(2.64, 0.36, 1.0, (0, 2.18, 0.15), mat="khearth", bevel=0.03, segs=2)
        box(2.9, 0.16, 1.15, (0, 2.46, 0.15), mat="desk", bevel=0.025, segs=2)
        extrude_x([(-0.4, 2.54), (0.5, 2.54), (0.5, 3.0), (0.3, 3.6), (-0.1, 3.6), (-0.4, 3.0)], 2.0, (0, 0, 0.0), "khearth")     # the hood
        box(2.2, 0.14, 1.1, (0, 0.07, 0.2), mat="khearth", bevel=0.02)
        # logs on iron dogs
        for k in range(5):
            cyl(0.07, 0.08, 0.92, 10, (-0.3 + (k % 2) * 0.2, 0.2 + k * 0.1, 0.1 + (k % 3) * 0.09), mat="shelf", bevel=0.01, rz=math.pi / 2, ry=RAD(6 + k * 9))
        for sx in (-0.5, 0.5):
            tube([(sx, 0.14, 0.1), (sx, 0.5, 0.12), (sx, 0.5, 0.35)], 0.03, 8, "iron")
        # the fire itself: four crossed sheets of flame, and a bed of embers
        for k in range(4):
            quad_uv(0.7 - 0.07 * k, 1.0 - 0.08 * k, (math.sin(k * 2.1) * 0.22, 0.62 + (0.5 - 0.04 * k), 0.12 + math.cos(k * 1.7) * 0.1), "fire", ry=RAD(k * 41), cell=2.0)
        for k in range(8):
            box(0.2, 0.08, 0.17, (-0.5 + k * 0.14, 0.34, 0.1 + math.sin(k * 1.4) * 0.12), ry=k, mat="ember", bevel=0.03, segs=2)
        # the spirit: a small flame with a face
        with at((0.66, 0.5, 0.26)):
            for k in range(3):
                quad_uv(0.46 - 0.06 * k, 0.66, (0, 0.33, 0), "fire", ry=RAD(k * 60), cell=2.0)
            quad_uv(0.07, 0.09, (-0.08, 0.34, -0.1), "eyeblack", ry=0.0)
            quad_uv(0.07, 0.09, (0.08, 0.34, -0.1), "eyeblack", ry=0.0)
            quad_uv(0.15, 0.05, (0.0, 0.22, -0.1), "eyeblack", ry=0.0)
        # the kettle on a swinging arm, with steam off its spout
        tube([(-1.0, 1.5, 0.2), (-0.4, 1.5, 0.2), (0.1, 1.5, 0.2)], 0.035, 8, "iron")
        tube([(0.1, 1.5, 0.2), (0.1, 1.2, 0.2)], 0.018, 6, "iron")
        lathe([(0, 0), (0.24, 0), (0.3, 0.1), (0.32, 0.28), (0.26, 0.4), (0.22, 0.42), (0.0, 0.44)], 28, (0.1, 0.85, 0.2), mat="iron", bevel=0.004)
        lathe([(0, 0), (0.2, 0), (0.18, 0.05), (0.0, 0.08)], 24, (0.1, 1.28, 0.2), mat="iron", bevel=0.003)
        tube(bezier((0.28, 1.0, 0.2), (0.4, 1.06, 0.2), (0.5, 1.14, 0.2), (0.56, 1.2, 0.2), 8), [0.04, 0.036, 0.03, 0.026, 0.024, 0.022, 0.02, 0.02, 0.02], 8, "iron")
        for k in range(3):
            quad_uv(0.34, 1.2, (0.58 + 0.02 * k, 1.8, 0.2 + 0.03 * k), "steam", ry=RAD(k * 60), cell=3.0)
    LIGHTS.insert(0, dict(name="hearth", pos=[HEARTH[0] - 0.5 * math.sin(RAD(150)) * 0.4, 1.0, HEARTH[2] - 0.5 * math.cos(RAD(150)) * 0.4], color=[1.0, 0.6, 0.28], intensity=11.0, range=9.0, flicker=1, shadow=1))


def table():
    with at(polar(310, 2.5), ry=RAD(310)):
        box(3.0, 0.1, 1.5, (0, 0.93, 0), mat="kfloor", bevel=0.02, segs=2, L=0.3)
        box(2.8, 0.18, 1.3, (0, 0.8, 0), mat="ebony", bevel=0.01)
        for dx in (-1.25, 1.25):
            box(0.22, 0.8, 1.1, (dx, 0.4, 0), mat="ebony", bevel=0.02, segs=2)
            box(0.34, 0.12, 1.3, (dx, 0.06, 0), mat="ebony", bevel=0.02, segs=2)
        box(2.2, 0.12, 0.14, (0, 0.34, 0), mat="ebony", bevel=0.015)
        for dz in (-1.05, 1.05):
            box(2.4, 0.1, 0.42, (0, 0.48, dz), mat="desk", bevel=0.015, segs=2)
            for dx in (-0.9, 0.9):
                box(0.14, 0.44, 0.36, (dx, 0.24, dz), mat="ebony", bevel=0.01)
        T = 0.98
        box(0.8, 0.04, 0.5, (-0.95, T + 0.02, 0.1), 0.1, mat="desk", bevel=0.008)                      # a board with bread
        for i in range(3):
            subsurf_box(0.36, 0.17, 0.22, (-1.1 + i * 0.23, T + 0.14, 0.1 + (i % 2) * 0.1), "crust", ry=RAD(8 * i), bevel=0.05, levels=2)
        subsurf_box(0.18, 0.04, 0.16, (-0.6, T + 0.025, 0.22), "linen", ry=0.4, bevel=0.015)
        lathe([(0, 0), (0.28, 0), (0.34, 0.1), (0.34, 0.26), (0.36, 0.3), (0.0, 0.01)], 28, (0.05, T, -0.3), mat="iron", bevel=0.003)           # soup pot
        lathe([(0, 0.0), (0.3, 0.0), (0.3, 0.002), (0, 0.002)], 24, (0.05, T + 0.27, -0.3), mat="soup", L=0.3)
        tube([(0.22, T + 0.4, -0.3), (0.34, T + 0.52, -0.3), (0.5, T + 0.5, -0.3)], 0.012, 6, "shelf")                                           # a ladle
        lathe([(0, 0), (0.36, 0), (0.42, 0.03), (0.0, 0.01)], 28, (0.85, T, 0.05), mat="paper", bevel=0.003)                                       # the roast on a platter
        subsurf_box(0.5, 0.2, 0.34, (0.85, T + 0.14, 0.05), "crust", ry=0.2, bevel=0.07, levels=2)
        lathe([(0, 0), (0.28, 0), (0.3, 0.06), (0.0, 0.07)], 24, (1.3, T, -0.4), mat="terracotta", bevel=0.003)                                    # a pie
        lathe([(0, 0.0), (0.24, 0.0), (0.26, 0.08), (0.0, 0.1)], 24, (1.3, T + 0.04, -0.4), mat="crust", bevel=0.004)
        lathe([(0, 0), (0.2, 0), (0.3, 0.12), (0.31, 0.15), (0.0, 0.02)], 24, (-0.35, T, 0.42), mat="desk", bevel=0.003)                            # a fruit bowl
        for i in range(6):
            sphere_uv(0.065, (-0.35 + math.cos(i * 1.1) * 0.12, T + 0.17 + (i % 2) * 0.03, 0.42 + math.sin(i * 1.1) * 0.12), "fruit" if i % 2 else "apple", usegs=14, vsegs=10)
        cyl(0.15, 0.15, 0.13, 20, (0.45, T + 0.065, 0.45), mat="cheese", bevel=0.01)
        box(0.2, 0.1, 0.12, (0.68, T + 0.05, 0.5), 0.7, mat="cheese", bevel=0.01)
        lathe([(0, 0), (0.12, 0), (0.17, 0.12), (0.12, 0.3), (0.06, 0.38), (0.08, 0.4), (0.0, 0.36)], 20, (-1.15, T, -0.42), mat="terracotta", bevel=0.003)     # a jug
        tube(bezier((-1.02, T + 0.3, -0.42), (-0.9, T + 0.34, -0.42), (-0.9, T + 0.16, -0.42), (-1.03, T + 0.1, -0.42), 8), [0.016] * 9, 6, "terracotta")
        for i in range(4):
            dx = -0.75 + i * 0.5
            dz = 0.52 if i % 2 else -0.52
            lathe([(0, 0), (0.17, 0), (0.2, 0.02), (0.0, 0.0)], 22, (dx, T, dz), mat="paper", bevel=0.002)
            lathe([(0, 0), (0.06, 0), (0.07, 0.14), (0.0, 0.01)], 14, (dx + 0.24, T, dz), mat="terracotta", bevel=0.002)
            tube([(dx - 0.3, T + 0.01, dz), (dx - 0.18, T + 0.01, dz + 0.02)], 0.008, 4, "brass")
        lathe([(0, 0), (0.06, 0), (0.07, 0.02), (0.04, 0.05), (0.04, 0.12), (0.0, 0.12)], 14, (0.35, T, -0.05), mat="brass", bevel=0.002)
        cyl(0.03, 0.035, 0.22, 12, (0.35, T + 0.23, -0.05), mat="candle", bevel=0.002)
        lathe([(0, 0), (0.016, 0.02), (0.012, 0.06), (0.0, 0.11)], 8, (0.35, T + 0.34, -0.05), mat="flame")
    LIGHTS.append(dict(name="table", pos=list(polar(310, 2.5, 1.5)), color=[1.0, 0.76, 0.46], intensity=3.0, range=6.0, flicker=1, shadow=0))


def sink():
    with at(polar(232, 3.8), ry=RAD(232)):
        box(2.0, 0.1, 0.8, (0, 0.95, 0), mat="kslab", bevel=0.015, segs=2, L=0.3)
        box(1.9, 0.78, 0.65, (0, 0.5, 0), mat="ebony", bevel=0.012)
        lathe([(0, 0), (0.36, 0), (0.4, 0.04), (0.4, 0.2), (0.0, 0.0)], 28, (-0.4, 0.8, 0), mat="khearth", bevel=0.003)
        lathe([(0, 0.0), (0.38, 0.0), (0.38, 0.002), (0, 0.002)], 24, (-0.4, 0.98, 0), mat="water", L=0.3)
        tube(bezier((-0.4, 1.0, 0.3), (-0.4, 1.4, 0.3), (-0.4, 1.5, 0.2), (-0.4, 1.4, 0.05), 10), [0.02] * 11, 8, "brass")
        box(0.9, 0.04, 0.5, (0.6, 1.02, 0), mat="desk", bevel=0.008)
        for i in range(3):
            lathe([(0, 0), (0.19, 0), (0.2, 0.02), (0, 0.0)], 22, (0.38 + i * 0.25, 1.24, 0.0), rz=math.pi / 2, mat="paper", bevel=0.002)


def chores():
    """What the sink washes while you are not looking: a plate with a cup and a scrap of suds, circling in the air."""
    with group("orbit"):
        lathe([(0, 0), (0.17, 0), (0.2, 0.02), (0.0, 0.0)], 22, (0, 0, 0), mat="paper", bevel=0.002, tint=(1, 1, 1), tint_mode=0.0)
        lathe([(0, 0), (0.05, 0), (0.06, 0.12), (0.0, 0.01)], 14, (0.06, 0.02, 0.02), mat="terracotta", bevel=0.002)
        for k, (x, z, r_) in enumerate(((-0.08, 0.05, 0.04), (0.0, -0.06, 0.03), (-0.12, -0.03, 0.025))):
            sphere_uv(r_, (x, 0.04 + 0.01 * k, z), "paper", usegs=10, vsegs=8)


def pantry():
    rad = R - 0.5
    for sy in (1.1, 1.75, 2.4):
        sweep_arc([(-0.3, -0.05), (0.3, -0.05), (0.3, 0.05), (-0.3, 0.05), (-0.33, 0.03), (-0.33, -0.03)], 262.0, 297.0, rad, sy, "desk", step=2.0)
    for a in (261.0, 297.0):
        arcbox(0.24, 2.9, 0.62, a, rad, 1.7, mat="ebony", bevel=0.02, segs=2)
    for a in np.arange(262.0, 297.0, 2.2):
        arcbox(0.2, 2.6, 0.05, a, R - 0.22, 1.5, mat="ebony", bevel=0.0, L=0.8)
    for ri, sy in enumerate((1.1, 1.75, 2.4)):
        jars.fill_row(0, ri, 263.0, 296.0, sy, R - 0.56, tints=SPICE_TINTS, chance=0.8)


def pot_rack():
    cx, _, cz = polar(310, 2.5)
    with at((cx, 0, cz), ry=RAD(310)):
        box(2.2, 0.08, 0.4, (0, 3.3, 0), mat="iron", bevel=0.01)
        for dx in (-0.9, 0.9):
            tube([(dx, 3.34, 0), (dx, 4.5, 0)], 0.018, 6, "iron")
        for i in range(5):
            x = -0.8 + i * 0.4
            m = "copper" if i % 2 else "iron"
            lathe([(0, 0), (0.18, 0), (0.22, 0.1), (0.22, 0.26), (0.24, 0.28), (0.0, 0.01)], 22, (x, 2.86, 0), mat=m, bevel=0.003)
            tube([(x, 3.12, 0), (x, 3.3, 0)], 0.01, 6, "iron")
            tube([(x + 0.22, 3.0, 0), (x + 0.4, 3.0, 0)], 0.014, 6, m)


def sacks_and_herbs():
    x, _, z = polar(74, 4.0)
    subsurf_box(0.6, 0.7, 0.5, (x, 0.35, z), "linen", ry=0.3, bevel=0.1, levels=2)
    subsurf_box(0.5, 0.55, 0.45, (x + 0.55, 0.28, z - 0.2), "linen", ry=0.8, bevel=0.09, levels=2)
    for a in np.arange(128.0, 176.0, 8.8):
        x0, _, z0 = polar(a, R - 0.7)
        with at((x0, 3.4, z0), ry=RAD(a)):
            tube([(-0.35, 0.0, 0.0), (0.35, 0.02, 0.0)], 0.008, 4, "shelf")
            for k in range(5):
                blade((-0.25 + k * 0.12, 0.0, 0.0), (0.0, 0, 1), 0.3, 0.05, -0.3, 0.6, "herb", (0.8, 0.9, 0.7))
    # a broom, a cat's bowl and a few crumbs
    bx, _, bz = polar(340, 4.0)
    tube([(bx, 0.05, bz), (bx + 0.3, 1.9, bz)], 0.03, 8, "shelf")
    lathe([(0, 0), (0.16, 0), (0.18, 0.1), (0.0, 0.3)], 12, (bx - 0.05, 0.0, bz), mat="crust", bevel=0.0)
    lathe([(0, 0), (0.14, 0), (0.16, 0.08), (0.0, 0.0)], 16, (bx + 0.7, 0.0, bz + 0.4), mat="terracotta", bevel=0.002)


material("herb", None, tint=(0.24, 0.36, 0.14), rough=0.9, metal=0.0)


def slate_board():
    with at(polar(228, 4.55, 2.15), ry=RAD(228)):
        quad_uv(1.15, 0.86, (0, 0, -0.04), "slate")
        box(1.15, 0.86, 0.06, (0, 0, 0), mat="khearth", bevel=0.01)
        for sx in (-0.63, 0.63):
            box(0.1, 1.04, 0.1, (sx, 0, -0.02), mat="desk", bevel=0.012)
        for sy in (-0.47, 0.47):
            box(1.36, 0.1, 0.1, (0, sy, -0.02), mat="desk", bevel=0.012)


def plants():
    with at(polar(338, 4.2), ry=1.0):
        place(import_model("potted_plant_01", 14000, keep=("stem", "pot", "leaves")), scale=1.0)
    with at(polar(118, 4.3), ry=2.0):
        place(import_model("potted_plant_02", 14000), scale=1.2)
    with at(polar(214, 4.6), ry=RAD(214) + math.pi):
        place(import_model("brass_vase_01", 9000), scale=0.8)


def build():
    stage = arch.stage_runner()
    for fn in (room, hearth, table, sink, pantry, pot_rack, sacks_and_herbs, slate_board, plants):
        stage(fn)
    chores(); jars.jar_units()
    shaft_model(polar(WIN_ANG, R - 0.5, WIN_Y), polar(WIN_ANG - 18, 1.1, 0.06), 0.62, 0.62 * 2.4)


def write(ctx):
    name = "kitchen"
    shelf = jars.write_instances(ctx["tree"], name)
    sw = polar(232, 3.4, 1.5)
    manifest = base_manifest(
        ctx,
        labelSet="pantry",
        lights=LIGHTS,
        window=window_manifest(WIN_ANG, WIN_Y, HOLE_R),
        atmosphere={"sunColor": [1.0, 0.76, 0.5], "sunStrength": 7.0, "skyTop": [0.14, 0.3, 0.6], "skyHorizon": [0.9, 0.7, 0.5], "ambient": [0.8, 0.66, 0.52],
                    "ambientScale": 0.8, "ground": [0.36, 0.26, 0.18], "stars": 0.0, "exposure": 1.5, "bloom": 0.16, "rays": 1.0},
        orbiters={"center": [sw[0], 0, sw[2]], "count": 6, "r": 1.0, "y": 1.9, "speed": 0.5, "scale": 1.0,
                  "tints": [[1, 1, 1]]},
        shelfBooks=shelf,
        slots=jars.SLOTS,
        camera={"pos": polar(332, 4.3, 2.0), "target": list(polar(150, 3.5, 1.2))},
    )
    write_manifest(name, manifest)
