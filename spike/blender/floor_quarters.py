"""The sleeping quarters: warm oak, textiles, candlelight. A turned-post bed under a patchwork quilt, a woven tapestry of a tower under a moon,
a nightstand with a guttering candle, a washstand with a mirror, a chest, a line of hung robes, an armchair by the round window, and a cat."""
from lib import *
import lib
import arch
import jars

material("qfloor", "wood_cabinet_worn_long", tile=1.4, rot=True, tint=(1.0, 0.82, 0.62))
material("qwall", "dark_wood", tile=2.4, tint=(0.78, 0.68, 0.58))
material("qtrim", "lacquered_cherry_wood", tile=1.8, tint=(0.95, 0.85, 0.78))
material("tapestry", gen="tapestry", rough=0.95, metal=0.0, size=1024)
material("quilt", gen="quilt", rough=0.95, metal=0.0, size=1024)
material("linen", gen="linen", rough=0.95, metal=0.0, size=512)
material("duvet", None, tint=(0.92, 0.88, 0.8), rough=0.95, metal=0.0)
material("mirror", None, tint=(0.86, 0.9, 0.95), rough=0.02, metal=1.0)
material("water", None, tint=(0.25, 0.55, 0.62), blend="water", rough=0.06, metal=0.0)
material("cat", None, tint=(0.05, 0.05, 0.06), rough=0.8, metal=0.0)
material("eye", None, tint=(0.8, 1.0, 0.3), rough=0.3, metal=0.0, emissive=1.0)
material("terracotta", None, tint=(0.68, 0.32, 0.2), rough=0.85, metal=0.0)

WIN_ANG, WIN_Y, WIN_R = 196.0, 3.1, 0.62
HOLE_R = WIN_R - 0.13
LIGHTS = []


def room():
    arch.plank_floor("qfloor", tint=(0.7, 0.96))
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="shelf", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="stone", L=1.0)
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, "shelf", step=4.0)
    arch.core_wall("qwall", 100.0, 236.0, win=(WIN_ANG, WIN_Y, HOLE_R))
    arch.mouldings("qtrim", "qtrim", 100.0, 236.0, rail_mat="qtrim", rail_y=1.0)
    k = 100.0
    while k <= 236.0:
        if abs(k - WIN_ANG) > 8.0 and not (116 <= k <= 140):
            arch.pilaster(k, WH - 0.55, "qtrim")
        k += 12.0
    arch.round_window(WIN_ANG, WIN_Y, WIN_R, "stonewall", "qtrim", lattice=False)
    arch.balustrade("qtrim", "qtrim", turned=True)


def tapestry():
    """Three metres of woven hanging on a rod above the bed, with a fringe."""
    with at(polar(128, R - 0.4, 3.0), ry=RAD(128)):
        quad_uv(2.2, 3.3, (0, 0, 0), "tapestry")
        box(2.4, 0.06, 0.06, (0, 1.72, 0.0), mat="ebony", bevel=0.012)
        for sx in (-1, 1):
            sphere_uv(0.06, (sx * 1.22, 1.72, 0.0), "gilt", usegs=14, vsegs=10)
        for k in range(44):
            tube([(-1.08 + k * 0.049, -1.65, -0.004), (-1.08 + k * 0.049 + 0.01 * math.sin(k), -1.78, -0.004)], 0.005, 4, "ebony", closed_ends=False)
    # rod hangers and a shelf of tallow candles under it
    with at(polar(128, R - 0.5, 1.15), ry=RAD(128)):
        box(2.2, 0.06, 0.3, (0, 0, 0), mat="qtrim", bevel=0.01)


def rug():
    with at((-0.5, 0, 1.0)):
        lathe([(0, 0.0), (2.0, 0.0), (2.0, 0.016), (0, 0.016)], 64, mat="rug", bevel=0.004, L=0.5)


def bed():
    with at((-2.55, 0, 1.35), ry=RAD(292)):
        # frame: four turned posts, a headboard with spindles and a crest, a low footboard, rails and slats
        for sx in (-0.86, 0.86):
            for sz, h in ((-1.28, 1.35), (1.28, 1.9)):
                lathe([(0, 0), (0.08, 0), (0.07, 0.1), (0.06, 0.16), (0.075, 0.26), (0.05, 0.4), (0.06, 0.55), (0.05, h * 0.55), (0.065, h * 0.7),
                       (0.05, h * 0.75), (0.08, h * 0.8), (0.06, h * 0.9), (0.03, h * 0.96), (0.0, h)], 14, (sx, 0, sz), mat="qtrim", bevel=0.003)
                sphere_uv(0.045, (sx, h + 0.04, sz), "gilt", usegs=14, vsegs=10)
        box(1.72, 0.12, 0.09, (0, 0.3, 1.28), mat="qtrim", bevel=0.015)
        box(1.72, 0.12, 0.09, (0, 0.3, -1.28), mat="qtrim", bevel=0.015)
        for sx in (-0.86, 0.86):
            box(0.09, 0.12, 2.56, (sx, 0.3, 0.0), mat="qtrim", bevel=0.015)
        for i in range(8):
            box(1.6, 0.03, 0.12, (0, 0.28, -1.15 + i * 0.33), mat="shelf", bevel=0.005)
        box(1.72, 0.1, 0.1, (0, 1.4, 1.28), mat="qtrim", bevel=0.02, segs=2)                   # headboard rails and spindles
        box(1.72, 0.1, 0.1, (0, 0.85, 1.28), mat="qtrim", bevel=0.02, segs=2)
        for i in range(9):
            lathe([(0, 0), (0.03, 0.0), (0.025, 0.1), (0.035, 0.25), (0.025, 0.4), (0.03, 0.5), (0.0, 0.52)], 10, (-0.7 + i * 0.175, 0.88, 1.28), mat="qtrim", bevel=0.002)
        box(1.72, 0.1, 0.1, (0, 0.62, -1.28), mat="qtrim", bevel=0.02, segs=2)
        # bedding: a mattress, a sheet folded back, two pillows, a patchwork quilt that drapes over the sides
        subsurf_box(1.62, 0.26, 2.4, (0, 0.48, 0.0), "linen", bevel=0.05)
        subsurf_box(1.66, 0.12, 2.0, (0, 0.62, -0.1), "duvet", bevel=0.04)
        subsurf_box(1.7, 0.16, 1.5, (0, 0.72, -0.4), "quilt", bevel=0.05, levels=2)
        subsurf_box(1.72, 0.3, 0.4, (0, 0.74, 0.25), "linen", bevel=0.07, ry=0.0)
        for sx in (-0.4, 0.4):
            subsurf_box(0.7, 0.2, 0.46, (sx, 0.78, 0.92), "linen", bevel=0.07, ry=0.05 * (1 if sx > 0 else -1))
        subsurf_box(1.8, 0.5, 0.2, (0, 0.5, -1.0), "quilt", bevel=0.05)                       # the drape at the foot
        for sx in (-1, 1):
            subsurf_box(0.14, 0.5, 1.4, (sx * 0.86, 0.5, -0.4), "quilt", bevel=0.04)


def nightstand():
    with at((-1.15, 0, 2.9), ry=0.3):
        box(0.7, 0.07, 0.7, (0, 0.76, 0), mat="desk", bevel=0.015, segs=2)
        box(0.62, 0.14, 0.62, (0, 0.67, 0), mat="qtrim", bevel=0.01)
        for dx, dz in ((-0.26, -0.26), (0.26, -0.26), (-0.26, 0.26), (0.26, 0.26)):
            lathe([(0, 0), (0.04, 0), (0.035, 0.15), (0.05, 0.3), (0.035, 0.5), (0.04, 0.6), (0.0, 0.62)], 10, (dx, 0.0, dz), mat="qtrim", bevel=0.002)
        box(0.58, 0.02, 0.58, (0, 0.22, 0), mat="qtrim", bevel=0.005)
        # a brass candlestick, a stub, a book, a mug, a quill
        lathe([(0, 0), (0.09, 0), (0.1, 0.02), (0.05, 0.05), (0.025, 0.08), (0.03, 0.16), (0.045, 0.19), (0.0, 0.2)], 18, (0.0, 0.795, 0.0), mat="brass", bevel=0.002)
        cyl(0.03, 0.035, 0.22, 12, (0.0, 0.795 + 0.31, 0.0), mat="candle", bevel=0.002)
        lathe([(0, 0), (0.016, 0.02), (0.012, 0.06), (0.0, 0.11)], 8, (0.0, 0.795 + 0.42, 0.0), mat="flame")
        box(0.34, 0.07, 0.26, (-0.25, 0.835, 0.12), 0.4, mat="leather", tint=(0.5, 0.1, 0.1), tint_mode=0.9, bevel=0.01)
        lathe([(0, 0), (0.07, 0), (0.075, 0.14), (0.065, 0.15), (0.0, 0.01)], 18, (0.26, 0.795, 0.12), mat="terracotta", bevel=0.002)
        tube([(0.3, 0.9, 0.05), (0.5, 0.92, 0.0)], 0.004, 4, "paper")
    LIGHTS.insert(0, dict(name="candle", pos=[-1.15 + 0.0, 1.35, 2.9], color=[1.0, 0.66, 0.34], intensity=6.0, range=7.0, flicker=1, shadow=1))


def chest():
    x, _, z = polar(66, 4.1)
    with at((x, 0, z), ry=RAD(66)):
        box(1.2, 0.55, 0.75, (0, 0.28, 0), mat="shelf", bevel=0.015, segs=2)
        box(1.25, 0.17, 0.79, (0, 0.63, 0), mat="qtrim", bevel=0.05, segs=3)
        for dx in (-0.5, 0.5):
            box(0.07, 0.62, 0.8, (dx, 0.31, 0), mat="brass", bevel=0.008)
        box(0.1, 0.16, 0.04, (0, 0.5, -0.4), mat="brass", bevel=0.008)
        subsurf_box(0.6, 0.2, 0.42, (-0.1, 0.84, 0.05), "velvet", ry=0.2, bevel=0.05, tint=(0.42, 0.26, 0.6), tint_mode=0.9)


def sconces():
    for a, y in ((150.0, 2.6), (166.0, 3.2), (232.0, 2.8)):
        x, z = (R - 0.42) * math.sin(RAD(a)), (R - 0.42) * math.cos(RAD(a))
        with at((x, y, z), ry=RAD(a)):
            tube(bezier((0, 0, 0), (0, 0, -0.1), (0, 0.05, -0.2), (0, 0.14, -0.26), 8), [0.016] * 9, 8, "iron")
            lathe([(0, 0), (0.06, 0), (0.07, 0.03), (0.0, 0.03)], 14, (0, 0.14, -0.26), mat="iron", bevel=0.002)
            cyl(0.028, 0.028, 0.24, 12, (0, 0.28, -0.26), mat="candle", bevel=0.002)
            lathe([(0, 0), (0.014, 0.02), (0.01, 0.06), (0.0, 0.11)], 8, (0, 0.4, -0.26), mat="flame")
        LIGHTS.append(dict(name=f"sconce{int(a)}", pos=list(polar(a, R - 0.78, y + 0.5)), color=[1.0, 0.62, 0.34], intensity=2.0, range=4.4, flicker=1, shadow=0))


def washstand():
    with at((1.9, 0, 2.6), ry=0.5):
        box(0.8, 0.07, 0.6, (0, 0.88, 0), mat="desk", bevel=0.012, segs=2)
        for dx, dz in ((-0.34, -0.24), (0.34, -0.24), (-0.34, 0.24), (0.34, 0.24)):
            lathe([(0, 0), (0.035, 0), (0.03, 0.2), (0.045, 0.4), (0.03, 0.6), (0.035, 0.85), (0.0, 0.86)], 10, (dx, 0.0, dz), mat="qtrim", bevel=0.002)
        box(0.7, 0.02, 0.5, (0, 0.3, 0), mat="qtrim", bevel=0.004)
        lathe([(0, 0), (0.2, 0.0), (0.26, 0.1), (0.28, 0.2), (0.0, 0.01)], 28, (0, 0.915, 0), mat="paper", bevel=0.003)
        lathe([(0, 0.0), (0.2, 0.0), (0.2, 0.002), (0, 0.002)], 24, (0, 1.09, 0), mat="water", L=0.3)
        lathe([(0, 0), (0.08, 0), (0.1, 0.1), (0.09, 0.26), (0.06, 0.32), (0.07, 0.34), (0.0, 0.3)], 20, (0.32, 0.915, -0.12), mat="terracotta", bevel=0.003)
        tube(bezier((0.4, 1.12, -0.12), (0.5, 1.2, -0.12), (0.5, 1.12, -0.12), (0.42, 1.0, -0.12), 8), [0.012] * 9, 6, "terracotta")
        # a standing mirror: a brass-framed oval that reflects the room
        with at((0, 1.35, 0.26), rx=-0.12):
            lathe([(0, 0), (0.24, 0), (0.24, 0.01), (0, 0.01)], 36, (0, 0, 0), rx=math.pi / 2, mat="mirror", bevel=0.0, L=0.3)
            torus(0.25, 0.018, (0, 0, 0), mat="brass", seg=48, tseg=8)
            tube([(0, -0.25, 0), (0, -0.48, 0)], 0.015, 6, "brass")


def laundry():
    x0, _, z0 = polar(258, 4.1)
    x1, _, z1 = polar(300, 4.1)
    tube([(x0, 3.4, z0), ((x0 + x1) / 2 * 0.98, 3.25, (z0 + z1) / 2 * 0.98), (x1, 3.4, z1)], 0.012, 6, "linen")
    for a, h, tn in ((264.0, 0.8, (0.45, 0.26, 0.6)), (276.0, 0.7, (0.85, 0.82, 0.74)), (288.0, 0.85, (0.3, 0.2, 0.55))):
        x, _, z = polar(a, 4.1)
        with at((x, 3.3, z), ry=RAD(a)):
            subsurf_box(0.5, h, 0.05, (0, -h / 2, 0), "velvet" if a != 276.0 else "linen", bevel=0.015, tint=tn, tint_mode=0.9 if a != 276.0 else 0.0, levels=2)
            for sx in (-0.18, 0.18):
                box(0.03, 0.08, 0.05, (sx, 0.0, 0.0), mat="shelf", bevel=0.005)


def cat():
    """A black familiar asleep on the end of the bed: a few smoothed boxes and two small green lamps."""
    with at((-2.2, 0.9, 0.55), ry=RAD(200)):
        subsurf_box(0.46, 0.22, 0.28, (0, 0.11, 0), "cat", bevel=0.05, levels=2)
        subsurf_box(0.2, 0.18, 0.18, (0.28, 0.17, 0.0), "cat", bevel=0.04, levels=2)
        for sz in (-0.06, 0.06):
            box(0.05, 0.08, 0.05, (0.26, 0.29, sz), mat="cat", bevel=0.01, rx=0.2)
            sphere_uv(0.014, (0.38, 0.2, sz * 0.8), "eye", usegs=8, vsegs=6)
        tube(bezier((-0.22, 0.1, 0.05), (-0.38, 0.12, 0.12), (-0.42, 0.05, 0.22), (-0.3, 0.04, 0.3), 10), [0.04 - 0.02 * i / 10 for i in range(11)], 8, "cat")


def furniture_scans():
    x, _, z = polar(240, 4.2)
    with at((x, 0, z), ry=RAD(240) + math.pi + 0.3):
        place(import_model("ArmChair_01", 12000), scale=1.25)
    with at(polar(216, 4.55), ry=RAD(216) + math.pi):
        place(import_model("vintage_wooden_drawer_01", 8000), scale=1.5)
    with at(polar(44, 4.4), ry=0.5):
        place(import_model("potted_plant_02", 16000), scale=1.4)
    with at(polar(84, 4.5), ry=1.2):
        place(import_model("potted_plant_01", 14000, keep=("stem", "pot", "leaves")), scale=1.0)
    with at(polar(104, 4.2), ry=2.0):
        place(import_model("ceramic_vase_01", 7000), scale=1.4)


def build():
    stage = arch.stage_runner()
    for fn in (room, tapestry, rug, bed, nightstand, chest, sconces, washstand, laundry, cat, furniture_scans):
        stage(fn)
    shaft_model(polar(WIN_ANG, R - 0.5, WIN_Y), polar(WIN_ANG - 18, 1.1, 0.06), 0.52, 0.52 * 2.4)


def write(ctx):
    name = "quarters"
    manifest = base_manifest(
        ctx,
        lights=LIGHTS,
        window=window_manifest(WIN_ANG, WIN_Y, HOLE_R),
        atmosphere={"sunColor": [1.0, 0.7, 0.44], "sunStrength": 8.0, "skyTop": [0.1, 0.2, 0.5], "skyHorizon": [0.9, 0.6, 0.4], "ambient": [0.8, 0.62, 0.5],
                    "ambientScale": 0.8, "ground": [0.36, 0.24, 0.16], "stars": 0.0, "exposure": 1.5, "bloom": 0.14, "rays": 1.0},
        camera={"pos": polar(332, 4.4, 2.1), "target": [-1.6, 1.0, 1.3]},
    )
    write_manifest(name, manifest)
