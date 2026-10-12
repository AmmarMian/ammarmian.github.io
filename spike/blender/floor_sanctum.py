"""The portal sanctum: a bare stone vault built round the gate. A ring of voussoirs and runes frames a disc that looks onto
another world and gives way to the next every few seconds; a chalk circle on the flags, an offering table with candles,
a kneeling cushion, a relic crate, and a trapdoor in the floor that leads down to the bath."""
from lib import *
import lib
import arch

material("flag", "monastery_stone_floor", tile=2.2, tint=(0.6, 0.6, 0.64))
material("sancwall", "old_stone_wall", rot=True, tile=1.3, tint=(0.78, 0.8, 0.88))
material("portalstone", "monastery_stone_floor", tile=1.4, tint=(0.8, 0.8, 0.86))
material("portalrim", None, tint=(0.55, 0.85, 1.0), rough=0.4, metal=0.0, emissive=1.0)
material("runev", None, tint=(0.72, 0.52, 0.98), rough=0.4, metal=0.0, emissive=1.0)
material("portalview", gen="portalview", blend="portal", centered=True, tile=2.8, size=2048, rough=0.0, metal=7.0)
material("chalk", gen="chalk", blend="additive", emissive=0.55, tint=(0.4, 0.82, 0.92), centered=True, tile=4.1, size=1024)
material("halo", None, tint=(0.5, 0.85, 1.0), blend="additive", emissive=0.25, rough=1.0, metal=0.0, gen="chalk", centered=True, tile=4.0, size=512)
material("shell", None, tint=(0.88, 0.8, 0.7), rough=0.45, metal=0.0)
material("coral", None, tint=(0.78, 0.34, 0.26), rough=0.8, metal=0.0)
material("ore", None, tint=(0.6, 0.38, 0.95), rough=0.2, metal=0.0, emissive=0.7)

WIN = None
PORTAL_ANG, PORTAL_Y = 168.0, 2.4
LIGHTS = []


def floor_and_walls():
    arch.stone_floor("flag", "sancwall")
    arch.core_wall("sancwall", 100.0, 236.0)
    arch.mouldings("flag", "flag", 100.0, 236.0, rail_mat="flag", rail_y=1.15)
    for a in np.arange(100.0, 236.01, 12.0):
        if abs(a - PORTAL_ANG) > 8:
            arch.buttress(a, "sancwall", "flag")
    arch.balustrade("flag", "flag", turned=True)
    # iron torch brackets between the buttresses, with a flame each
    for a in (112.0, 136.0, 190.0, 214.0):
        x, z = (R - 0.4) * math.sin(RAD(a)), (R - 0.4) * math.cos(RAD(a))
        with at((x, 2.3, z), ry=RAD(a)):
            tube(bezier((0, 0, 0), (0, 0, -0.1), (0, 0.05, -0.2), (0, 0.15, -0.28), 8), [0.018] * 9, 8, "iron")
            lathe([(0, 0), (0.06, 0), (0.07, 0.04), (0.08, 0.14), (0.0, 0.14)], 14, (0, 0.14, -0.28), mat="iron", bevel=0.003)
            lathe([(0, 0), (0.05, 0.03), (0.04, 0.2), (0.0, 0.34)], 10, (0, 0.26, -0.28), mat="flame")


def portal():
    with at(polar(PORTAL_ANG, R - 0.5, PORTAL_Y), ry=RAD(PORTAL_ANG)):
        # the dressed ring: 24 voussoirs round a rolled moulding, runes on the face, a glowing inner rim
        torus(1.5, 0.17, (0, 0, -0.05), mat="portalstone", seg=64, tseg=12)
        for i in range(24):
            a = i / 24 * math.tau
            box(0.3, 0.42, 0.3, (math.cos(a) * 1.7, math.sin(a) * 1.7, -0.02), rz=a, mat="portalstone", bevel=0.02, segs=2, tint=((0.92 + 0.08 * (i % 2)),) * 3)
        torus(1.34, 0.065, (0, 0, -0.12), mat="portalrim", seg=64, tseg=10)
        for i in range(12):
            a = (i + 0.5) / 12 * math.tau
            box(0.15, 0.15, 0.06, (math.cos(a) * 1.5, math.sin(a) * 1.5, -0.2), rz=a, mat="runev" if i % 2 else "portalrim", bevel=0.01)
        # a throat of stone behind the ring, and the view itself
        lathe([(1.36, -0.2), (1.36, 0.0), (1.28, 0.0), (1.28, -0.2), (1.36, -0.2)], 48, (0, 0, 0.0), rx=math.pi / 2, mat="portalstone", L=0.3)
        lathe([(0, 0), (1.34, 0), (1.34, 0.004), (0, 0.004)], 64, (0, 0, -0.02), rx=-math.pi / 2, mat="portalview", L=1.0)
        lathe([(1.5, 0), (1.95, 0), (1.95, 0.004), (1.5, 0.004)], 64, (0, 0, -0.22), rx=-math.pi / 2, mat="halo", L=1.0)
    LIGHTS.insert(0, dict(name="portal", pos=list(polar(PORTAL_ANG, R - 1.5, PORTAL_Y)), color=[0.56, 0.85, 1.0], intensity=8.0, range=8.0, flicker=0, shadow=1))


def dial():
    with at(polar(134, R - 0.62, 2.1), ry=RAD(134)):
        box(1.1, 1.5, 0.16, (0, 0, 0), mat="portalstone", bevel=0.02, segs=2)
        box(1.22, 0.1, 0.22, (0, 0.78, -0.03), mat="brass", bevel=0.01)
        box(1.22, 0.1, 0.22, (0, -0.78, -0.03), mat="brass", bevel=0.01)
        torus(0.36, 0.05, (0, 0.3, -0.13), mat="brass", seg=48, tseg=8)
        for i in range(7):
            a = i / 7 * math.tau
            box(0.09, 0.2, 0.09, (math.cos(a) * 0.36, 0.3 + math.sin(a) * 0.36, -0.15), rz=a - math.pi / 2, mat="portalrim" if i == 0 else "brass", bevel=0.008)
        cyl(0.12, 0.12, 0.18, 16, (0, 0.3, -0.17), mat="portalrim", bevel=0.01, rx=math.pi / 2)
        tube([(0, -0.42, -0.16), (0, -0.84, -0.16)], 0.045, 8, "brass")
        sphere_uv(0.1, (0, -0.9, -0.16), "portalrim", usegs=16, vsegs=12)
    LIGHTS.append(dict(name="dial", pos=list(polar(134, R - 1.4, 2.1)), color=[0.56, 0.85, 1.0], intensity=2.2, range=3.5, flicker=0, shadow=0))


def trapdoor():
    x, _, z = polar(64, 3.2)
    with at((x, 0.0, z), ry=RAD(64)):
        torus(1.0, 0.04, (0, 0.02, 0), rx=math.pi / 2, mat="brass", seg=48, tseg=8)
        lathe([(0, 0), (0.94, 0), (0.94, 0.07), (0, 0.07)], 40, (0, 0.005, 0), mat="shelf", L=0.3)
        for i in range(5):
            box(1.7 * (0.6 + 0.4 * math.sin((i + 0.5) / 5 * math.pi)), 0.04, 0.3, (0, 0.085, -0.62 + i * 0.31), mat="shelf" if i % 2 else "desk", bevel=0.006)
        for z in (-0.32, 0.32):
            box(1.7, 0.03, 0.1, (0, 0.11, z), mat="iron", bevel=0.005)
        torus(0.13, 0.014, (0.52, 0.13, 0.16), rx=math.pi / 2, mat="iron", seg=20, tseg=6)
        box(0.44, 0.012, 0.2, (-0.06, 0.12, 0), mat="brass", bevel=0.002)     # an engraved tub, in brass
        box(0.52, 0.012, 0.05, (-0.06, 0.12, -0.12), mat="brass", bevel=0.002)
        for dx in (-0.2, 0.16):
            box(0.05, 0.012, 0.07, (-0.06 + dx, 0.12, 0.13), mat="brass", bevel=0.002)


def offering():
    with at(polar(300, 3.2), ry=RAD(300)):
        box(1.3, 0.1, 0.7, (0, 0.95, 0), mat="flag", bevel=0.02, segs=2)
        for sx in (-0.5, 0.5):
            box(0.18, 0.9, 0.5, (sx, 0.45, 0), mat="portalstone", bevel=0.02, segs=2)
        for i in range(4):
            x = -0.45 + i * 0.3
            lathe([(0, 0), (0.07, 0), (0.06, 0.03), (0.0, 0.03)], 12, (x, 1.0, 0.0), mat="brass", bevel=0.002)
            cyl(0.03, 0.03, 0.26 - 0.03 * (i % 2), 12, (x, 1.14 - 0.015 * (i % 2), 0.0), mat="candle", bevel=0.002)
            lathe([(0, 0), (0.016, 0.02), (0.011, 0.07), (0.0, 0.12)], 8, (x, 1.27 - 0.03 * (i % 2), 0.0), mat="flame")
    LIGHTS.append(dict(name="offering", pos=list(polar(300, 3.0, 1.6)), color=[1.0, 0.6, 0.3], intensity=3.4, range=6.0, flicker=1, shadow=0))
    x, _, z = polar(168, 2.2)
    subsurf_box(0.7, 0.16, 0.5, (x, 0.09, z), "velvet", ry=RAD(168), bevel=0.04, tint=(0.8, 0.12, 0.14), tint_mode=0.9)


def chalk_circle():
    lathe([(0, 0), (2.05, 0), (2.05, 0.002), (0, 0.002)], 64, (0, 0.012, 0), mat="chalk", L=1.0)
    torus(1.98, 0.012, (0, 0.012, 0), rx=math.pi / 2, mat="brass", seg=96, tseg=6)
    torus(1.12, 0.008, (0, 0.012, 0), rx=math.pi / 2, mat="brass", seg=64, tseg=6)


def relic_crate():
    x, _, z = polar(122, 3.9)
    with at((x, 0, z), ry=RAD(122)):
        box(0.9, 0.68, 0.9, (0, 0.34, 0), mat="shelf", bevel=0.01)
        for dy in (0.18, 0.5):
            box(0.94, 0.05, 0.94, (0, dy, 0), mat="ebony", bevel=0.01)
        box(0.94, 0.07, 0.94, (0, 0.72, 0), mat="ebony", bevel=0.01)
        lathe([(0, 0), (0.1, 0.0), (0.16, 0.04), (0.17, 0.12), (0.1, 0.2), (0.03, 0.22), (0, 0.2)], 20, (0.12, 0.76, 0.0), mat="shell", bevel=0.003)
        for k in range(5):
            a = k * math.tau / 5
            tube(bezier((0, 0, 0), (0.06 * math.cos(a), 0.12, 0.06 * math.sin(a)), (0.1 * math.cos(a), 0.24, 0.1 * math.sin(a)), (0.12 * math.cos(a), 0.34, 0.12 * math.sin(a)), 8), [0.028 - 0.016 * i / 8 for i in range(9)], 8, "coral")
        # the coral stands in a little dish
        with at((-0.22, 0.76, 0.1)):
            tube([(0, 0, 0), (0, 0.3, 0)], 0.02, 8, "coral")
        box(0.18, 0.18, 0.18, (0.05, 0.84, -0.3), ry=0.7, rx=0.3, mat="ore", bevel=0.03, segs=2)


def plants():
    with at(polar(210, 4.5), ry=0.6):
        place(import_model("potted_plant_02", 16000), scale=1.35)
    with at(polar(120, 4.3), ry=1.4):
        place(import_model("potted_plant_01", 16000, keep=("stem", "pot", "leaves")), scale=1.0)


def build():
    stage = arch.stage_runner()
    for fn in (floor_and_walls, portal, dial, trapdoor, offering, chalk_circle, relic_crate, plants):
        stage(fn)


def write(ctx):
    name = "sanctum"
    m = Vector((0.2, 0.8, -0.5)).normalized()
    manifest = base_manifest(
        ctx,
        lights=LIGHTS,
        window={"center": [0, -50, 0], "normal": [0, 0, 1], "right": [1, 0, 0], "radius": 0.0, "towardSun": [m.x, m.y, m.z], "shaftFrom": [0, 0, 0], "shaftTo": [0, 0, 0]},
        atmosphere={"sunColor": [0.6, 0.72, 1.0], "sunStrength": 1.4, "skyTop": [0.006, 0.012, 0.04], "skyHorizon": [0.04, 0.05, 0.1], "ambient": [0.2, 0.26, 0.46],
                    "ambientScale": 1.0, "ground": [0.04, 0.045, 0.08], "stars": 0.5, "exposure": 2.3, "bloom": 0.2, "rays": 0.0},
        camera={"pos": polar(332, 4.5, 1.9), "target": list(polar(PORTAL_ANG, 4.0, 2.2))},
    )
    write_manifest(name, manifest)
