"""The bath cellar: cut into the rock under the sanctum, tiled, vaulted, lit by three lanterns and by one low wide window that looks onto a
meadow and a coast that cannot be on the other side of that wall. A sunken cedar ofuro, brim-full and steaming, with a floating tray and
blossoms; a bamboo tap, a washstand, duckboards, towels, and a great deal of green."""
from lib import *
import lib
import arch

material("glaze", gen="glaze", tile=0.6, rough=None, metal=0.0, size=512, tint=(1, 1, 1))
material("bwall", "old_stone_wall", rot=True, tile=1.3, tint=(0.62, 0.64, 0.62))
material("bstone", "monastery_stone_floor", tile=1.8, tint=(0.62, 0.62, 0.6))
material("cedar", "wood_table_worn", tile=1.2, tint=(0.95, 0.8, 0.6))
material("cedardark", "wood_table_worn", tile=1.2, tint=(0.62, 0.45, 0.32))
material("water", None, tint=(0.18, 0.5, 0.58), blend="water", rough=0.05, metal=0.0, emissive=0.35)
material("vista", None, blend="portal", rough=2.0, metal=2.0, nscale=0.0, gen="portalview", centered=False, tile=1.0, size=2048)
material("porcelain", None, tint=(0.93, 0.95, 0.92), rough=0.2, metal=0.0)
material("copper", None, tint=(0.82, 0.46, 0.28), rough=0.32, metal=1.0)
material("terracotta", None, tint=(0.68, 0.32, 0.2), rough=0.85, metal=0.0)
material("mirror", None, tint=(0.86, 0.9, 0.95), rough=0.02, metal=1.0)
material("linen", gen="linen", rough=0.95, metal=0.0, size=512)
material("leaf", None, tint=(0.25, 0.52, 0.28), rough=0.7, metal=0.0)
material("leafdark", None, tint=(0.16, 0.36, 0.2), rough=0.7, metal=0.0)
material("leafpale", None, tint=(0.44, 0.66, 0.34), rough=0.7, metal=0.0)
material("bloom", None, tint=(0.9, 0.42, 0.55), rough=0.6, metal=0.0)
material("steam", None, tint=(1, 1, 1), blend="steam", emissive=1.0, rough=1.0, metal=0.0)
material("stream", None, tint=(0.4, 0.7, 0.8), blend="alpha", alpha=0.45, rough=0.05, metal=0.0)

TUB = polar(300, 2.35)
TW = 2.6
TH = 1.15
WALL_A = (96.0, 344.0)
LIGHTS = []


def tiles():
    """Carrelage laid tile by tile with a hole for the tub; the centre warm, a pale field, a deep teal border."""
    T = 0.58
    c, s_ = math.cos(RAD(300)), math.sin(RAD(300))
    x = -R
    while x <= R:
        z = -R
        while z <= R:
            cx, cz = x + T / 2, z + T / 2
            d = math.hypot(cx, cz)
            if d < R - 0.16:
                lx = (cx - TUB[0]) * c - (cz - TUB[2]) * s_
                lz = (cx - TUB[0]) * s_ + (cz - TUB[2]) * c
                if not (abs(lx) < TW / 2 + 0.45 and abs(lz) < TW / 2 + 0.45):
                    checker = (round(x / T) + round(z / T)) % 2 == 0
                    tint = (0.78, 0.84, 0.82) if checker else (0.88, 0.9, 0.86)
                    if d > R - 1.2:
                        tint = (0.34, 0.5, 0.5) if checker else (0.62, 0.74, 0.72)
                    if d < 1.5:
                        tint = (0.8, 0.66, 0.5) if checker else (0.9, 0.86, 0.8)
                    box(T - 0.03, 0.14, T - 0.03, (cx, -0.07, cz), mat="glaze", bevel=0.01, L=0.4, top_only=True, tint=tint)
            z += T
        x += T
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="bstone", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="bwall", L=1.0)


def walls_and_vault():
    arch.core_wall("bwall", WALL_A[0], WALL_A[1])
    # glazed wall tiles to head height, a deep band above them, a stone cornice
    for a in np.arange(WALL_A[0], WALL_A[1] + 1e-6, 4.4):
        for k in range(3):
            arcbox(0.35, 0.5, 0.1, a, R - 0.36, 0.3 + k * 0.52, mat="glaze", bevel=0.012, L=0.4, tint=((0.9, 0.93, 0.9) if (k + round(a)) % 2 else (0.8, 0.86, 0.84)))
        arcbox(0.35, 0.2, 0.14, a, R - 0.36, 1.94, mat="glaze", bevel=0.012, tint=(0.32, 0.5, 0.5))
    sweep_arc([(0, 0), (0.08, 0), (0.08, 0.1), (0, 0.12)], *WALL_A, R - 0.4, 2.02, "bstone")
    sweep_arc([(0, 0), (0.1, 0), (0.1, 0.18), (0.04, 0.24), (0, 0.24)], *WALL_A, R - 0.4, 0.0, "bstone")
    for a in np.arange(WALL_A[0], WALL_A[1] + 1e-6, 12.0):
        if abs(a - 300) > 12:
            arch.buttress(a, "bwall", "bstone", band_mat=None)
    # a vault above: a stone shell and the ribs and boss you can see from the water
    lathe([(R, 4.2), (R - 1.0, 4.75), (R - 2.5, 5.05), (0.001, 5.25), (0.001, 5.4), (R - 2.5, 5.2), (R - 1.0, 4.9), (R, 4.35), (R, 4.2)], 48, mat="bwall", L=0.6)
    for a in range(0, 360, 15):
        tube([polar(a, R - 0.1, 4.25), polar(a, R - 1.0, 4.68), polar(a, R - 2.5, 4.98), polar(a, 0.4, 5.15)], [0.09, 0.08, 0.07, 0.06], 8, "bstone")
    for r_ in (R - 1.0, R - 2.5):
        torus(r_, 0.07, (0, 4.72 if r_ > 3 else 5.0, 0), rx=math.pi / 2, mat="bstone", seg=64, tseg=8)
    lathe([(0, 5.12), (1.1, 5.12), (1.4, 5.2), (1.4, 5.3), (0, 5.3)], 32, mat="bstone", bevel=0.01)


def ofuro():
    with at(TUB, ry=RAD(300)):
        # the well: four cedar walls dropping below the tiles, a floor, a broad coping to sit on
        for dz in (-1, 1):
            box(TW, TH, 0.18, (0, -TH / 2 + 0.02, dz * (TW / 2)), mat="cedar", bevel=0.01)
        for dx in (-1, 1):
            box(0.18, TH, TW, (dx * (TW / 2), -TH / 2 + 0.02, 0), mat="cedar", bevel=0.01)
        box(TW, 0.16, TW, (0, -TH, 0), mat="cedardark", bevel=0.01)
        for dz in (-1, 1):
            box(TW + 0.8, 0.16, 0.4, (0, 0.08, dz * (TW / 2 + 0.2)), mat="cedar", bevel=0.03, segs=2)
        for dx in (-1, 1):
            box(0.4, 0.16, TW + 0.8, (dx * (TW / 2 + 0.2), 0.08, 0), mat="cedar", bevel=0.03, segs=2)
        for dx in (-1, 1):
            for dz in (-1, 1):
                box(0.4, 0.2, 0.4, (dx * (TW / 2 + 0.2), 0.1, dz * (TW / 2 + 0.2)), mat="cedardark", bevel=0.04, segs=2)
        # the water, brim-full and rippling
        quad_uv(TW - 0.16, TW - 0.16, (0, -0.03, 0), "water", up=True, cell=0.6)
        # a floating tray with a flask, two cups and a dish
        with at((-0.35, 0.0, 0.3), ry=0.24):
            for i in range(5):
                box(1.0, 0.04, 0.15, (0, 0.03, -0.32 + i * 0.16), mat="cedar" if i % 2 else "cedardark", bevel=0.005)
            for dx in (-0.42, 0.42):
                box(0.07, 0.05, 0.82, (dx, 0.0, 0), mat="cedardark", bevel=0.006)
            lathe([(0, 0), (0.1, 0), (0.12, 0.1), (0.09, 0.22), (0.045, 0.28), (0.04, 0.36), (0.055, 0.38), (0.0, 0.34)], 20, (-0.22, 0.055, 0.02), mat="porcelain", bevel=0.002)
            for (x, z) in ((0.06, -0.1), (0.24, 0.14)):
                lathe([(0, 0), (0.05, 0), (0.08, 0.08), (0.075, 0.09), (0.0, 0.01)], 18, (x, 0.055, z), mat="porcelain", bevel=0.002)
            lathe([(0, 0), (0.11, 0), (0.12, 0.02), (0.0, 0.0)], 18, (0.42, 0.055, -0.12), mat="porcelain", bevel=0.002)
        for i in range(9):                                                      # blossoms on the water
            a = i * 2.4
            r_ = 0.35 + 0.85 * ((i * 0.37) % 1)
            lathe([(0, 0), (0.07, 0), (0.08, 0.006), (0.0, 0.012)], 8, (math.cos(a) * r_, -0.0, math.sin(a) * r_), mat="bloom" if i % 3 == 0 else "linen", bevel=0.0)
    LIGHTS.append(dict(name="tub", pos=[TUB[0], 0.6, TUB[2]], color=[0.5, 0.85, 0.9], intensity=1.2, range=3.5, flicker=0, shadow=0))


def window():
    """The casement: low and wide, level with the water, a splayed stone reveal round a pane that shows a meadow and a coast in turn."""
    CW, CH = 3.1, 1.5
    with at(polar(300, R - 0.4, 1.05), ry=RAD(300)):
        quad_uv(CW, CH, (0, 0, -0.0), "vista", cell=1.0)
        box(CW + 0.6, 0.2, 0.6, (0, -CH / 2 - 0.1, -0.2), mat="bstone", bevel=0.03, segs=2)
        box(CW + 0.6, 0.22, 0.5, (0, CH / 2 + 0.11, -0.1), mat="bstone", bevel=0.03, segs=2)
        for dx in (-1, 1):
            box(0.24, CH + 0.2, 0.5, (dx * (CW / 2 + 0.12), 0, -0.1), mat="bstone", bevel=0.03, segs=2)
        for dx in (-0.33, 0, 0.33):
            box(0.07, CH, 0.1, (dx * CW, 0, -0.06), mat="ebony", bevel=0.01)
        box(CW, 0.07, 0.1, (0, 0, -0.06), mat="ebony", bevel=0.01)
    LIGHTS.append(dict(name="vista", pos=list(polar(300, R - 2.2, 1.5)), color=[0.82, 0.9, 0.86], intensity=3.4, range=8.0, flicker=0, shadow=0))
    with at(polar(288, R - 0.6, 1.35), ry=RAD(288)):                              # the lever that changes the view
        box(0.26, 0.4, 0.06, (0, 0, 0), mat="brass", bevel=0.008)
        tube([(0, 0.0, -0.05), (0, 0.17, -0.1), (0, 0.36, -0.1)], 0.03, 8, "copper")
        sphere_uv(0.07, (0, 0.38, -0.1), "brass", usegs=14, vsegs=10)


def tap():
    x = TUB[0] + polar(390, 1.5)[0]
    z = TUB[2] + polar(390, 1.5)[2]
    with at((x, 0.1, z), ry=RAD(390)):
        tube([(0, 0, 0), (0, 1.5, 0)], [0.1, 0.09], 10, "cedar")
        tube(bezier((0, 1.44, 0), (0.3, 1.5, 0), (0.6, 1.42, 0), (0.7, 1.3, 0), 8), [0.075] * 9, 10, "cedar")
        lathe([(0.1, 0), (0.11, 0), (0.11, 0.09), (0.1, 0.09)], 10, (0, 1.4, 0), mat="copper", bevel=0.002)
        cyl(0.16, 0.16, 0.06, 14, (0, 1.05, 0.12), mat="brass", bevel=0.004, rx=math.pi / 2)
        quad_uv(0.1, 1.1, (0.66, 0.74, 0.0), "stream", cell=2.0)
        quad_uv(0.1, 1.1, (0.66, 0.74, 0.0), "stream", cell=2.0, ry=math.pi / 2)
    # steam hanging over the water: wide sheets that thin as they rise
    for k in range(6):
        a = k * 1.05
        quad_uv(1.5, 1.8, (TUB[0] + math.cos(a) * 0.7, 1.15, TUB[2] + math.sin(a) * 0.7), "steam", ry=a, cell=3.0)


def lanterns():
    for a in (120.0, 200.0, 280.0):
        x, z = (R - 0.62) * math.sin(RAD(a)), (R - 0.62) * math.cos(RAD(a))
        with at((x, 2.9, z), ry=RAD(a)):
            box(0.1, 0.1, 0.3, (0, 0, 0.12), mat="iron", bevel=0.01)
            lathe([(0, 0), (0.12, 0), (0.13, 0.04), (0.1, 0.3), (0.0, 0.3)], 4, (0, -0.15, -0.12), ry=math.pi / 4, mat="glass", tint=(1, 0.85, 0.6), tint_mode=0.0)
            for k in range(4):
                a2 = k * math.pi / 2 + math.pi / 4
                tube([(0.1 * math.cos(a2), -0.15, -0.12 + 0.1 * math.sin(a2)), (0.1 * math.cos(a2), 0.15, -0.12 + 0.1 * math.sin(a2))], 0.01, 6, "iron")
            lathe([(0, 0), (0.17, 0), (0.1, 0.1), (0.0, 0.12)], 4, (0, 0.14, -0.12), ry=math.pi / 4, mat="iron", bevel=0.003)
            cyl(0.02, 0.02, 0.14, 8, (0, -0.08, -0.12), mat="candle", bevel=0.002)
            lathe([(0, 0), (0.014, 0.02), (0.01, 0.06), (0.0, 0.12)], 8, (0, -0.01, -0.12), mat="flame")
        LIGHTS.append(dict(name=f"lantern{int(a)}", pos=list(polar(a, R - 1.1, 2.9)), color=[1.0, 0.78, 0.5], intensity=2.6, range=5.5, flicker=1, shadow=0))


def plant(a, rad, y=0.0, kind=0, scale=1.0, hanging=False):
    x, z = rad * math.sin(RAD(a)), rad * math.cos(RAD(a))
    rr = rnd()
    with at((x, y, z), ry=rr * 6):
        s = scale
        pr = (0.34 if kind == 1 else 0.26) * s
        lathe([(0, 0), (pr * 0.78, 0), (pr, 0.34 * s), (pr + 0.04 * s, 0.36 * s), (pr + 0.02 * s, 0.4 * s), (pr - 0.04 * s, 0.39 * s), (pr - 0.05 * s, 0.35 * s), (0, 0.35 * s)], 14, mat="terracotta", bevel=0.006)
        greens = ["leaf", "leafdark", "leafpale"]
        n = {0: 10, 1: 15, 2: 10}[kind]
        for i in range(n):
            ang = i / n * math.tau + rnd() * 0.5
            dirv = (math.sin(ang), 0, math.cos(ang))
            ln = (0.5 + rnd() * 0.45) * s if kind == 0 else (0.4 + rnd() * 0.25) * s
            lift, droop = ((1.3 + rnd() * 0.6), (0.9 + rnd() * 0.5)) if kind == 0 else ((0.7 + rnd() * 0.5), (0.5 + rnd() * 0.4))
            if kind == 2:
                lift, droop, ln = 0.3, 1.5, ln * 1.8
            blade((math.sin(ang) * 0.04 * s, 0.37 * s, math.cos(ang) * 0.04 * s), dirv, ln, (0.15 + rnd() * 0.06) * s, lift, droop, greens[i % 3], (0.9 + 0.1 * rnd(),) * 3)
        if hanging:
            for k in range(3):
                a3 = k * math.tau / 3
                tube([(pr * math.cos(a3), 0.38 * s, pr * math.sin(a3)), (0.0, 1.5 * s, 0.0)], 0.005, 4, "iron", closed_ends=False)
            tube([(0, 1.5 * s, 0), (0, 2.4, 0)], 0.008, 4, "iron")


def green():
    for a, d, k, sc in ((110, 4.5, 0, 1.5), (126, 4.6, 1, 1.2), (150, 4.5, 0, 1.35), (168, 4.6, 1, 1.05), (190, 4.5, 0, 1.25), (214, 4.6, 1, 1.45),
                        (238, 4.5, 2, 1.1), (258, 4.6, 0, 1.3), (332, 4.5, 1, 1.4), (344, 4.4, 0, 1.15)):
        plant(a, d, 0.0, k, sc)
    for a in np.arange(104.0, 340.0, 4.4):                                           # a stone ledge round the tiled wall
        arcbox(0.35, 0.14, 0.42, a, R - 0.5, 2.15, mat="bstone", bevel=0.02)
    for a, k in ((118, 2), (140, 0), (162, 2), (186, 1), (208, 2), (232, 0), (252, 2), (330, 2)):
        plant(a, R - 0.62, 2.22, k, 0.62)
    for a, d, y, sc in ((122, 3.4, 3.1, 0.95), (158, 3.8, 3.3, 0.85), (196, 3.2, 3.0, 1.0), (232, 3.7, 3.2, 0.8), (264, 3.0, 3.1, 0.9), (330, 3.5, 3.2, 0.85)):
        plant(a, d, y, 2, sc, hanging=True)


def washstand():
    with at(polar(140, R - 1.0), ry=RAD(140 + 180)):
        box(1.2, 0.08, 0.6, (0, 0.96, 0), mat="glaze", bevel=0.012, segs=2, tint=(0.88, 0.9, 0.86))
        box(1.1, 0.5, 0.5, (0, 0.65, 0), mat="ebony", bevel=0.012)
        for dx in (-0.5, 0.5):
            box(0.12, 0.88, 0.46, (dx, 0.44, 0), mat="ebony", bevel=0.012)
        lathe([(0, 0), (0.2, 0.0), (0.3, 0.1), (0.34, 0.22), (0.0, 0.01)], 28, (-0.16, 0.98, 0), mat="porcelain", bevel=0.003)
        lathe([(0, 0.0), (0.3, 0.0), (0.3, 0.002), (0, 0.002)], 24, (-0.16, 1.17, 0), mat="water", L=0.3)
        tube(bezier((-0.16, 1.0, -0.22), (-0.16, 1.3, -0.24), (-0.16, 1.4, -0.18), (-0.16, 1.28, -0.05), 8), [0.022] * 9, 8, "copper")
        lathe([(0, 0), (0.08, 0), (0.1, 0.1), (0.09, 0.24), (0.06, 0.3), (0.0, 0.28)], 20, (0.4, 1.0, 0.04), mat="terracotta", bevel=0.003)
        lathe([(0, 0), (0.28, 0), (0.28, 0.01), (0, 0.01)], 28, (0, 1.7, -0.26), rx=-math.pi / 2, mat="mirror", L=0.3)
        torus(0.29, 0.02, (0, 1.7, -0.27), mat="brass", seg=40, tseg=8)


def floor_things():
    for i in range(8):
        arcbox(0.16, 0.06, 1.2, 232.0 + i * 3.2, 2.4, 0.05, mat="cedar" if i % 2 else "cedardark", bevel=0.01)
    sx, _, sz = polar(258, 2.2)
    with at((sx, 0, sz), ry=RAD(258)):
        box(0.5, 0.08, 0.36, (0, 0.38, 0), mat="cedar", bevel=0.015, segs=2)
        for dx in (-0.18, 0.18):
            box(0.07, 0.36, 0.3, (dx, 0.18, 0), mat="cedardark", bevel=0.01)
    tx, _, tz = polar(246, 3.4)
    for i in range(3):
        subsurf_box(0.5, 0.13, 0.36, (tx, 0.07 + i * 0.14, tz), "linen", ry=RAD(246) + i * 0.06, bevel=0.03, tint=((0.8, 0.2, 0.2) if i == 1 else (0.95, 0.95, 0.9)), tint_mode=0.9 if i == 1 else 0.0)
    dx, _, dz = polar(120, 1.0)
    with at((TUB[0] + dx * 0.6, 0.0, TUB[2] + dz * 0.6)):
        lathe([(0, 0), (0.22, 0), (0.22, 0.05), (0, 0.05)], 20, mat="brass", bevel=0.004)
        for i in range(4):
            box(0.36, 0.03, 0.04, (0, 0.06, -0.12 + i * 0.08), mat="iron", bevel=0.003)


def build():
    stage = arch.stage_runner()
    for fn in (tiles, walls_and_vault, ofuro, window, tap, lanterns, green, washstand, floor_things):
        stage(fn)


def write(ctx):
    name = "bath"
    m = Vector((0.0, 1.0, 0.0))
    manifest = base_manifest(
        ctx,
        lights=LIGHTS,
        window={"center": [0, -50, 0], "normal": [0, 0, 1], "right": [1, 0, 0], "radius": 0.0, "towardSun": [m.x, m.y, m.z], "shaftFrom": [0, 0, 0], "shaftTo": [0, 0, 0]},
        atmosphere={"sunColor": [1.0, 0.9, 0.7], "sunStrength": 0.001, "skyTop": [0.05, 0.05, 0.06], "skyHorizon": [0.05, 0.05, 0.06], "ambient": [0.55, 0.5, 0.45],
                    "ambientScale": 0.5, "ground": [0.28, 0.26, 0.24], "stars": 0.0, "exposure": 1.9, "bloom": 0.22, "rays": 0.0},
        camera={"pos": polar(110, 2.2, 1.9), "target": list(polar(300, 2.4, 0.4))},
    )
    write_manifest(name, manifest)
