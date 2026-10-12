"""The library floor: bookcases, a writing desk, a lectern, a globe, a ladder on a brass rail, and the books on the shelves
(instanced, typeset with the site's own publications) that fly out and back."""
from lib import *
import lib

# ----------------------------------------------------------------------------- the room
WIN_ANG, WIN_Y, WIN_R = 175.0, 3.4, 0.82
HOLE_R = WIN_R - 0.13
slots = []
BAND = [(104.0, 158.0), (194.0, 248.0)]
ROWS = [0.95, 1.62, 2.29, 2.96, 3.63, 4.3]
WALL_A = (100.0, 236.0)

OGEE = [(0, 0), (0.03, 0), (0.03, 0.012), (0.05, 0.03), (0.05, 0.05), (0.035, 0.06), (0.035, 0.07), (0, 0.07)]


def floor_and_platform():
    z = -R
    while z < R:
        half = math.sqrt(max(R * R - (z + 0.1) ** 2, 0))
        if half > 0.3:
            x = -half
            while x < half - 0.05:
                run = min(half - x, 1.1 + rnd() * 2.2)
                if half - (x + run) < 0.5:
                    run = half - x
                k = 0.76 + rnd() * 0.24
                box(run - 0.004, 0.2, 0.196, (x + run / 2, -0.1, z + 0.1), mat="floor", bevel=0.008, L=0.3, top_only=True, tint=(k, k, k))
                # nail heads at the board ends
                for ex in (x + 0.05, x + run - 0.05):
                    cyl(0.006, 0.006, 0.004, 6, (ex, 0.002, z + 0.05), mat="iron", bevel=0.0)
                x += run
        z += 0.2
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat="stone", L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat="stonewall", L=1.0)
    # the platform's stone edge: a rolled moulding all the way round
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, "stone", step=4.0)


def pilaster(a, y0, y1, rad=R - 0.4, w=0.22):
    arcbox(w, y1 - y0, 0.1, a, rad, (y0 + y1) / 2, mat="ebony", bevel=0.008)
    for off in (-0.06, 0.0, 0.06):                                                  # flutes
        arcbox(0.025, y1 - y0 - 0.5, 0.012, a + off / (rad * RAD(1)) , rad - 0.052, (y0 + y1) / 2, mat="shelf", bevel=0.004)
    arcbox(w + 0.1, 0.34, 0.15, a, rad, y0 + 0.17, mat="ebony", bevel=0.02, segs=2)
    arcbox(w + 0.1, 0.22, 0.15, a, rad, y1 - 0.11, mat="ebony", bevel=0.02, segs=2)
    arcbox(w + 0.15, 0.06, 0.18, a, rad, y1 - 0.25, mat="shelf", bevel=0.015)


def wall():
    # the wall core, in narrow columns so the curve is smooth, with the round window cut clean through
    for a in np.arange(WALL_A[0], WALL_A[1] + 1e-6, 2.2):
        dx = (R - 0.2) * math.sin(RAD(a - WIN_ANG))
        if abs(dx) < HOLE_R:
            hh = math.sqrt(HOLE_R ** 2 - dx ** 2)
            lo, hi = WIN_Y - hh, WIN_Y + hh
            arcbox(0.2, lo, 0.3, a, R - 0.18, lo / 2, mat="wall", L=0.3, bevel=0.004)
            arcbox(0.2, WH - hi, 0.3, a, R - 0.18, hi + (WH - hi) / 2, mat="wall", L=0.3, bevel=0.004)
        else:
            arcbox(0.2, WH, 0.3, a, R - 0.18, WH / 2, mat="wall", L=0.3, bevel=0.004)
    # mouldings: skirting, chair rail, frieze and crown
    sweep_arc([(0, 0), (0.05, 0), (0.05, 0.03), (0.07, 0.05), (0.07, 0.2), (0.04, 0.22), (0.04, 0.24), (0, 0.24)], *WALL_A, R - 0.35, 0.0, "ebony")
    sweep_arc(OGEE, *WALL_A, R - 0.35, 1.12, "ebony")
    sweep_arc([(0, 0), (0.04, 0), (0.04, 0.3), (0, 0.3)], *WALL_A, R - 0.35, WH - 0.95, "shelf")
    sweep_arc([(0, 0), (0.04, 0), (0.1, 0.1), (0.2, 0.16), (0.24, 0.2), (0.24, 0.3), (0.12, 0.3), (0.06, 0.26), (0, 0.24)], *WALL_A, R - 0.38, WH - 0.4, "ebony")
    sweep_arc([(0, 0), (0.07, 0), (0.07, 0.1), (0, 0.1)], *WALL_A, R - 0.35, WH - 0.65, "ebony")
    # wainscot: raised panels between pilasters
    k = WALL_A[0]
    while k < WALL_A[1] - 1:
        if abs(k - WIN_ANG) > 10.6:                     # none across the window
            pilaster(k, 0.0, WH - 0.55)
        nxt = min(k + 11.0, WALL_A[1])
        mid = (k + nxt) / 2
        if nxt - k > 6:
            arcbox(0.7, 0.72, 0.05, mid, R - 0.36, 0.66, mat="wall", bevel=0.02, segs=2)
            arcbox(0.5, 0.52, 0.02, mid, R - 0.385, 0.66, mat="ebony", bevel=0.012, segs=2)
        k = nxt
    pilaster(WALL_A[1], 0.0, WH - 0.55)


def railing():
    for a in np.arange(358, 446 + 1e-6, 4.4):
        x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
        lathe([(0, 0), (0.035, 0), (0.03, 0.06), (0.02, 0.12), (0.034, 0.26), (0.02, 0.4), (0.028, 0.5), (0.024, 0.8), (0.0, 0.84)], 12, (x, 0.0, z),
              mat="ebony", bevel=0.002)
    sweep_arc([(-0.07, 0.84), (0.07, 0.84), (0.09, 0.88), (0.08, 0.95), (-0.08, 0.95), (-0.09, 0.88)], 356, 448, R - 0.26, 0.0, "shelf", step=2.0)
    sweep_arc([(-0.05, 0.0), (0.05, 0.0), (0.05, 0.1), (-0.05, 0.1)], 356, 448, R - 0.26, 0.0, "ebony", step=2.0)
    newel(354)
    newel(450)


def newel(a):
    x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
    lathe([(0, 0), (0.11, 0), (0.1, 0.12), (0.07, 0.18), (0.07, 1.1), (0.1, 1.14), (0.1, 1.28), (0.06, 1.34), (0.0, 1.38)], 14, (x, 0, z),
          mat="ebony", bevel=0.005)


def window():
    with at(polar(WIN_ANG, R - 0.4, WIN_Y), ry=RAD(WIN_ANG)):
        # a deep stone reveal, an outer rolled moulding, a keystone and a carved sill
        lathe([(HOLE_R, -0.17), (WIN_R, -0.17), (WIN_R, 0.17), (HOLE_R, 0.17), (HOLE_R, -0.17)], 56, rx=math.pi / 2, mat="stonewall", bevel=0.02, L=0.3)
        lathe([(WIN_R, 0.12), (WIN_R + 0.05, 0.12), (WIN_R + 0.14, 0.16), (WIN_R + 0.17, 0.2), (WIN_R + 0.14, 0.24), (WIN_R, 0.24), (WIN_R, 0.12)], 56,
              rx=math.pi / 2, mat="stonewall", bevel=0.01, L=0.3)
        box(0.3, 0.34, 0.3, (0, WIN_R + 0.1, 0.12), mat="stonewall", bevel=0.03, segs=2)
        for s_ in (-1, 1):
            box(0.2, 0.22, 0.26, (s_ * (WIN_R + 0.1), 0, 0.12), mat="stonewall", bevel=0.03, segs=2)
        span = HOLE_R * 2
        # the casement: a wooden ring, a cross, and lead lines in a lozenge lattice
        lathe([(HOLE_R - 0.05, -0.04), (HOLE_R, -0.04), (HOLE_R, 0.04), (HOLE_R - 0.05, 0.04), (HOLE_R - 0.05, -0.04)], 48, rx=math.pi / 2, mat="ebony", bevel=0.006)
        box(0.07, span, 0.08, (0, 0, 0), mat="ebony", bevel=0.012)
        box(span, 0.07, 0.08, (0, 0, 0), mat="ebony", bevel=0.012)
        for ang in (math.pi / 4, -math.pi / 4):
            for off in (-0.28, 0.28):
                box(0.012, span * 0.78, 0.018, (off * math.cos(ang), off * math.sin(ang), 0), mat="iron", rz=ang, bevel=0.002)
        box(span + 0.5, 0.1, 0.52, (0, -WIN_R - 0.08, 0.1), mat="stonewall", bevel=0.03, segs=2)


def reserved_ranges():
    return [(0, 2, 118, 126), (0, 4, 136, 144), (1, 1, 210, 218), (1, 3, 226, 234), (1, 4, 202, 206), (0, 1, 130, 135)]


BOOK_INST = []
VARIANTS = [
    dict(name="folio", w=0.08, h=0.40, d=0.30, bands=5, label=True, weight=0.14),
    dict(name="quarto", w=0.06, h=0.34, d=0.26, bands=4, label=True, weight=0.34),
    dict(name="thick", w=0.10, h=0.30, d=0.24, bands=3, label=True, weight=0.22),
    dict(name="slim", w=0.035, h=0.26, d=0.20, bands=0, label=False, weight=0.30),
]


def pick_variant():
    r = rnd() * sum(v["weight"] for v in VARIANTS)
    for i, v in enumerate(VARIANTS):
        r -= v["weight"]
        if r <= 0:
            return i
    return 1


def book(a, sy, w_m, lean, tint, variant, rad=R - 0.56):
    """A shelf book is an instance of one of four unit meshes (book_units), scaled to its width and tinted: position,
    yaw, lean, scale and cover colour sit in a small buffer the renderer reads, so every book on the shelves can be
    moved, tinted or opened on its own, and the mesh file carries four books instead of seven hundred."""
    v = VARIANTS[variant]
    ang = RAD(a)
    h = v["h"] * (0.9 + rnd() * 0.2)
    tilt = (0.22 if rnd() < 0.5 else -0.22) if lean else 0.0
    pos = (rad * math.sin(ang), sy + 0.05 + h / 2 + (0.02 if lean else 0), rad * math.cos(ang))
    BOOK_INST.append(dict(pos=pos, yaw=ang, tilt=tilt, sx=w_m / v["w"], sy=h / v["h"], tint=tint, w=w_m, h=h, variant=variant, d=v["d"]))
    return h


def book_units():
    """Four unit books. Each has a rounded leather spine (a thin arc shell), two boards, a chamfered page block with
    headbands, raised hubs with gilt tooling, and a paper label."""
    for vi, v in enumerate(VARIANTS):
        w, h, d = v["w"], v["h"], v["d"]
        cover = dict(tint=(1, 1, 1), tint_mode=0.85)
        with group(f"shelfbook{vi}"):
            # rounded spine: an arc across the width, thick shell, standing h tall
            bm = bmesh.new()
            n = 9
            rr = w * 0.62
            for t0, t1, dz0 in ((0, 1, 0),):
                pass
            outer_b, outer_t, inner_b, inner_t = [], [], [], []
            for i in range(n + 1):
                th = (i / n - 0.5) * 2.3
                x = rr * math.sin(th)
                z = -d / 2 + rr * (1 - math.cos(th)) * 0.5 - 0.002
                outer_b.append(bm.verts.new((x, -h / 2, z))); outer_t.append(bm.verts.new((x, h / 2, z)))
                inner_b.append(bm.verts.new((x * 0.97, -h / 2 + 0.0, z + 0.006))); inner_t.append(bm.verts.new((x * 0.97, h / 2, z + 0.006)))
            for i in range(n):
                bm.faces.new((outer_b[i], outer_b[i + 1], outer_t[i + 1], outer_t[i]))
                bm.faces.new((inner_b[i + 1], inner_b[i], inner_t[i], inner_t[i + 1]))
                bm.faces.new((outer_t[i], outer_t[i + 1], inner_t[i + 1], inner_t[i]))
                bm.faces.new((inner_b[i], inner_b[i + 1], outer_b[i + 1], outer_b[i]))
            bm.faces.new((outer_b[0], outer_t[0], inner_t[0], inner_b[0]))
            bm.faces.new((inner_b[n], inner_t[n], outer_t[n], outer_b[n]))
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            emit(bm, STACK[-1], "leather", smooth=75.0, **cover)
            for s_ in (-1, 1):                                                              # boards
                box(0.006, h + 0.006, d - 0.012, (s_ * (w / 2 - 0.003 * 1.0), 0, 0.006), mat="leather", bevel=0.0016, **cover)
            box(w - 0.016, h - 0.014, d - 0.026, (0, 0, 0.011), mat="paper", bevel=0.0012)          # page block
            for yy in (-1, 1):                                                              # headbands
                cyl(0.0045, 0.0045, w - 0.018, 6, (0, yy * (h / 2 - 0.007), -d / 2 + 0.014), mat="paper", bevel=0.0, rz=math.pi / 2, tint=(0.75, 0.18, 0.15))
            nb = v["bands"]
            ends = [0.08, 0.17, 0.83, 0.92] if nb >= 4 else ([0.1, 0.9] if nb >= 2 else [])
            for fy in ends:                                                                # raised hubs, tooled in gilt
                box(w * 0.98, 0.011, 0.014, (0, (fy - 0.5) * h, -d / 2 - 0.004), mat="leather", bevel=0.003, **cover)
                quad(w * 0.96, 0.003, (0, (fy - 0.5) * h + 0.007, -d / 2 - 0.0125), "gilt")
                quad(w * 0.96, 0.003, (0, (fy - 0.5) * h - 0.007, -d / 2 - 0.0125), "gilt")
            # the label is a cell of the typeset atlas: the renderer picks it per book from the instance buffer
            lo, hi = (0.24, 0.76) if nb >= 4 else ((0.2, 0.8) if nb >= 2 else (0.1, 0.9))
            quad_uv(w * 0.76, h * (hi - lo), (0, ((lo + hi) / 2 - 0.5) * h, -d / 2 - 0.0135), "spinelabel", flag=255)


def shelf_rows(bi, a0, a1):
    rad = R - 0.54
    for ri, sy in enumerate(ROWS):
        # the shelf board with a rounded nosing, one sweep per row
        sweep_arc([(-0.33, -0.05), (0.33, -0.05), (0.33, 0.05), (-0.31, 0.05), (-0.34, 0.03), (-0.34, -0.03)], a0, a1, rad, sy, "shelf", step=2.0)
        sweep_arc([(-0.345, -0.08), (-0.30, -0.08), (-0.30, -0.05), (-0.345, -0.05)], a0, a1, rad, sy, "ebony", step=3.0)


def shelves():
    res = reserved_ranges()
    for bi, (a0, a1) in enumerate(BAND):
        rad = R - 0.54
        shelf_rows(bi, a0, a1)
        deg_per_m = 180 / math.pi / (R - 0.56)
        for ri, sy in enumerate(ROWS):
            a = a0 + 0.8
            while a < a1 - 1.2:
                vi = pick_variant()
                v = VARIANTS[vi]
                w = v["w"] * (0.85 + rnd() * 0.3)
                gap = 0.0 if rnd() > 0.08 else 0.06 + rnd() * 0.1
                step = (w + 0.004) * deg_per_m
                blocked = any(b == bi and r == ri and a0r - 0.5 <= a <= a1r + 0.5 for b, r, a0r, a1r in res)
                if blocked:
                    a += step
                    continue
                if rnd() < 0.9:
                    lean = rnd() < 0.05
                    h = book(a + step / 2, sy, w, lean, pick(BOOK_TINTS), vi)
                    BOOK_INST[-1]["slot"] = len(slots)
                    slots.append({"band": bi, "angle": float(a + step / 2), "row": ri, "height": h, "width": w, "variant": vi,
                                  "pos": list(BOOK_INST[-1]["pos"]), "yaw": BOOK_INST[-1]["yaw"], "tint": list(BOOK_INST[-1]["tint"]),
                                  "depth": VARIANTS[vi]["d"]})
                a += step + gap * deg_per_m
        # vertical dividers every ~13.5 degrees, finished with a moulded edge
        nb = 4
        for k in range(nb + 1):
            ang = a0 + (a1 - a0) * k / nb
            arcbox(0.05, 4.85, 0.66, ang, rad, 2.55, mat="shelf", bevel=0.008)
        sweep_arc([(-0.34, 0), (0.34, 0), (0.34, 0.12), (-0.34, 0.12)], a0, a1, rad, 0.0, "ebony", step=3.0)            # plinth
        for a in np.arange(a0, a1 + 1e-6, 2.2):
            arcbox(0.2, 4.75, 0.06, a, R - 0.3, 2.55, mat="ebony", bevel=0.0, L=0.8)                                      # back
        # cabinet doors in the lowest bay
        for k in range(nb):
            for s_ in (0.25, 0.75):
                ang = a0 + (a1 - a0) * (k + s_) / nb
                arcbox(0.5, 0.74, 0.035, ang, rad - 0.34, 0.5, mat="shelf", bevel=0.01, segs=2)
                arcbox(0.34, 0.54, 0.02, ang, rad - 0.358, 0.5, mat="wall", bevel=0.012, segs=2)
                ox = 0.2 * (1 if s_ < 0.5 else -1)
                x, z = (rad - 0.37) * math.sin(RAD(ang)), (rad - 0.37) * math.cos(RAD(ang))
                sp = ox / ((rad - 0.37) * RAD(1))
                xk, zk = (rad - 0.375) * math.sin(RAD(ang + sp)), (rad - 0.375) * math.cos(RAD(ang + sp))
                sphere_uv(0.016, (xk, 0.5, zk), "brass")
        # cornice and a frieze above the top shelf
        sweep_arc([(-0.36, 0), (0.34, 0), (0.34, 0.14), (-0.36, 0.14)], a0 - 1, a1 + 1, rad, 4.95, "shelf", step=3.0)
        sweep_arc([(-0.44, 0.14), (0.34, 0.14), (0.34, 0.36), (-0.4, 0.36), (-0.44, 0.3)], a0 - 1, a1 + 1, rad, 4.95, "ebony", step=3.0)
        for a in (a0 - 1.2, a1 + 1.2):
            pilaster(a, 0.0, 5.1, rad=R - 0.5, w=0.2)


def plaque():
    """An engraved brass plate on the wall under the window: kicker and title in the system's type."""
    with at(polar(WIN_ANG, R - 0.355, 1.82), ry=RAD(WIN_ANG)):
        box(0.72, 0.2, 0.014, (0, 0, 0.0), mat="brass", bevel=0.006)
        quad_uv(0.68, 0.17, (0, 0, -0.0085), "plaque")
        for sx in (-1, 1):
            for sy in (-1, 1):
                cyl(0.006, 0.006, 0.008, 8, (sx * 0.35, sy * 0.085, -0.004), mat="brass", bevel=0.001, rx=math.pi / 2)


CARD_LABELS = 8


def shelf_cards():
    """A brass card holder on the nosing of each bay's first shelf, carrying its category in tracked mono capitals."""
    rad = R - 0.54 - 0.34 - 0.03
    k = 0
    for bi, (a0, a1) in enumerate(BAND):
        for bay in range(4):
            ang = a0 + (a1 - a0) * (bay + 0.5) / 4
            x, z = rad * math.sin(RAD(ang)), rad * math.cos(RAD(ang))
            with at((x, ROWS[0], z), ry=RAD(ang)):
                box(0.23, 0.058, 0.01, (0, 0, 0.0), mat="brass", bevel=0.004)
                quad_uv(0.21, 0.046, (0, 0, -0.0065), "cards", uv=(0.0, k / CARD_LABELS, 1.0, (k + 1) / CARD_LABELS))
            k += 1


def tome(pos, ry, tint):
    open_book(pos, ry, 0.23, 0.32, tint)


def desk():
    with at(polar(176, 2.6), ry=RAD(176)):
        top_y = 0.9
        # top: a thick slab with a rolled edge, over a moulded apron
        box(2.3, 0.07, 1.05, (0, top_y + 0.035, 0), mat="desk", bevel=0.03, segs=3, L=0.25)
        extrude_x([(0.52, 0), (0.54, 0.02), (0.54, 0.05), (0.5, 0.07), (0.46, 0.07), (0.46, 0)], 2.26, (0, top_y - 0.07, 0), "ebony")
        # leather writing surface with a gilt border
        box(1.62, 0.006, 0.7, (0, top_y + 0.0745, -0.06), mat="leather", tint=(0.28, 0.1, 0.09), tint_mode=0.92, bevel=0.002)
        for (w_, d_, z_, x_) in ((1.58, 0.008, -0.06 + 0.33, 0), (1.58, 0.008, -0.06 - 0.33, 0), (0.008, 0.66, -0.06, 0.79), (0.008, 0.66, -0.06, -0.79)):
            box(w_, 0.002, d_, (x_, top_y + 0.0785, z_), mat="gilt", bevel=0.0)
        # two pedestals of drawers, a kneehole between, a modesty panel behind it
        for sx in (-1, 1):
            cx = sx * 0.78
            box(0.62, 0.82, 0.88, (cx, 0.41, 0), mat="ebony", bevel=0.012)
            for k, (y0, hh) in enumerate(((0.62, 0.17), (0.4, 0.2), (0.14, 0.24))):
                box(0.54, hh - 0.015, 0.03, (cx, y0 + hh / 2, -0.455), mat="desk", bevel=0.01, segs=2)
                box(0.44, hh - 0.06, 0.012, (cx, y0 + hh / 2, -0.472), mat="ebony", bevel=0.006)
                cyl(0.014, 0.014, 0.02, 10, (cx, y0 + hh / 2, -0.48), mat="brass", bevel=0.004, rx=math.pi / 2)
                torus(0.022, 0.004, (cx, y0 + hh / 2 - 0.012, -0.492), mat="brass", seg=16, tseg=6, rx=0.0)
        box(0.86, 0.6, 0.03, (0, 0.5, 0.42), mat="ebony", bevel=0.01)
        # turned bun feet and a plinth
        for sx in (-1, 1):
            for sz in (-1, 1):
                lathe([(0, 0), (0.055, 0), (0.06, 0.02), (0.05, 0.05), (0.03, 0.07), (0.0, 0.07)], 14, (sx * 1.0, 0, sz * 0.38), mat="ebony", bevel=0.004)
        # hutch: pigeonholes and tiny drawers along the back edge
        hz = 0.36
        box(1.9, 0.34, 0.26, (0, top_y + 0.07 + 0.17, hz), mat="ebony", bevel=0.01)
        for i in range(8):
            x = -0.84 + i * 0.24
            box(0.2, 0.15, 0.02, (x, top_y + 0.07 + 0.09, hz - 0.13), mat="shelf", bevel=0.004)
            if i % 2 == 0:
                box(0.2, 0.12, 0.012, (x, top_y + 0.07 + 0.27, hz - 0.135), mat="desk", bevel=0.004)
                cyl(0.008, 0.008, 0.012, 8, (x, top_y + 0.07 + 0.27, hz - 0.145), mat="brass", bevel=0.002, rx=math.pi / 2)
        for i in range(9):
            box(0.012, 0.18, 0.26, (-0.96 + i * 0.24, top_y + 0.07 + 0.16, hz), mat="ebony", bevel=0.002)
        # on the desk
        tome((-0.28, top_y + 0.0775, -0.1), 0.1, (0.45, 0.1, 0.1))
        for i, (tn, ry_, w_, d_) in enumerate(((BOOK_TINTS[2], 0.45, 0.42, 0.32), (BOOK_TINTS[1], 0.12, 0.38, 0.3), (BOOK_TINTS[3], 0.3, 0.34, 0.26))):
            box(w_, 0.04, d_, (0.74, top_y + 0.0775 + 0.02 + i * 0.045, -0.2), ry_, mat="leather", tint=tn, tint_mode=0.9, bevel=0.007, segs=2)
            box(w_ - 0.03, 0.028, d_ - 0.02, (0.742, top_y + 0.0775 + 0.02 + i * 0.045, -0.2), ry_, mat="paper", bevel=0.0)
        lathe([(0, 0), (0.075, 0), (0.08, 0.05), (0.06, 0.1), (0.035, 0.14), (0.04, 0.17), (0.0, 0.17)], 24, (0.44, top_y + 0.0775, 0.05), mat="ink", bevel=0.003)
        cyl(0.042, 0.042, 0.014, 18, (0.44, top_y + 0.0775 + 0.18, 0.05), mat="brass", bevel=0.003)
        with at((0.46, top_y + 0.0775 + 0.2, 0.05), rx=0.35, rz=-0.35):                 # quill in the well
            cyl(0.0035, 0.0045, 0.34, 6, (0, 0.17, 0), mat="paper", bevel=0.0)
            blade((0, 0.2, 0), (0, 0, 1), 0.22, 0.05, 0.12, 0.2, "paper", (0.94, 0.9, 0.82))
        with at((0.1, top_y + 0.0775 + 0.012, 0.15), ry=0.7):                            # a magnifier
            torus(0.045, 0.004, (0, 0.0, 0), rx=math.pi / 2, mat="brass", seg=24, tseg=6)
            tube([(0, 0, 0.045), (0, 0, 0.09), (0, 0, 0.18)], [0.006, 0.008, 0.009], 8, "ebony")
        for k in range(3):                                                                # typed letters, one on top of another
            quad_uv(0.21, 0.297, (-0.80 + k * 0.035, top_y + 0.0775 + 0.002 + k * 0.0016, -0.22 + k * 0.02), "letter", up=True, ry=0.25 * (k - 1))
        cyl(0.018, 0.018, 0.004, 14, (-0.74, top_y + 0.0775 + 0.009, -0.19), mat="wax", bevel=0.001)


def rug():
    with at(polar(176, 2.0)):
        lathe([(0, 0.0), (2.5, 0.0), (2.5, 0.016), (0, 0.016)], 72, mat="rug", bevel=0.004, L=0.5)


LADDER_TILT = 0.2
LADDER_LEN = 4.72 / math.cos(LADDER_TILT)       # the top ends level with the brass rail
RAIL_R = R - 0.54 - 0.34                        # the rail runs along the shelf nosings


def ladder():
    """A rolling library ladder: it leans against the bookcase and hooks over the brass rail at the top."""
    base_r = RAIL_R - 0.06 - LADDER_LEN * math.sin(LADDER_TILT)
    with at(polar(214, base_r), ry=RAD(214), rx=LADDER_TILT):
        for dx in (-0.29, 0.29):
            box(0.055, LADDER_LEN, 0.075, (dx, LADDER_LEN / 2, 0), mat="shelf", bevel=0.01, segs=2)
            box(0.06, 0.1, 0.1, (dx, LADDER_LEN + 0.02, 0.03), mat="brass", bevel=0.012)
            # the hook: up over the rail and back down on its far side
            box(0.03, 0.05, 0.18, (dx, LADDER_LEN + 0.07, 0.09), mat="brass", bevel=0.008)
            box(0.03, 0.14, 0.03, (dx, LADDER_LEN - 0.0, 0.17), mat="brass", bevel=0.008)
            cyl(0.055, 0.055, 0.04, 16, (dx, 0.05, 0.02), mat="iron", bevel=0.005, rz=math.pi / 2)
        n = 12
        for i in range(n):
            box(0.6, 0.03, 0.1, (0, 0.4 + i * (LADDER_LEN - 0.6) / (n - 1), 0.0), mat="shelf", bevel=0.008, segs=2)


def ladder_rail():
    for (a0, a1) in BAND:
        r_ = []
        for i in range(8):
            t = i / 7 * math.tau
            r_.append((0.018 * math.cos(t), 0.018 * math.sin(t)))
        sweep_arc(r_, a0 - 1, a1 + 1, RAIL_R, 4.72, "brass", step=3.0)
        for a in np.arange(a0, a1 + 1e-6, 6.0):
            arcbox(0.03, 0.03, 0.12, a, RAIL_R + 0.06, 4.72, mat="brass", bevel=0.005)


def floor_litter():
    for _ in range(5):
        x, _, z = polar(rnd() * 360, 1.0 + rnd() * 2.8)
        n = 2 + int(rnd() * 4)
        for j in range(n):
            tnt = pick(BOOK_TINTS)
            w = 0.44 - j * 0.02
            with at((x + (rnd() - 0.5) * 0.1, 0.07 + j * 0.075, z + (rnd() - 0.5) * 0.1), ry=rnd() * math.pi):
                box(w, 0.012, 0.32, (0, -0.03, 0), mat="leather", tint=tnt, tint_mode=0.88, bevel=0.005, segs=2)
                box(w, 0.012, 0.32, (0, 0.03, 0), mat="leather", tint=tnt, tint_mode=0.88, bevel=0.005, segs=2)
                box(0.02, 0.072, 0.32, (-w / 2 + 0.01, 0, 0), mat="leather", tint=tnt, tint_mode=0.88, bevel=0.007, segs=2)
                box(w - 0.03, 0.05, 0.305, (0.006, 0, 0.004), mat="paper", bevel=0.0)
    for _ in range(18):
        x, _, z = polar(rnd() * 360, 0.8 + rnd() * 3.6)
        box(0.3 + rnd() * 0.12, 0.004, 0.22 + rnd() * 0.1, (x, 0.012, z), rnd() * math.pi, mat="paper", bevel=0.002)
    # a few rolled scrolls on the floor by the desk
    for k in range(3):
        x, _, z = polar(190 + k * 6, 1.6 + k * 0.1)
        cyl(0.022, 0.022, 0.5, 10, (x, 0.03, z), mat="paper", bevel=0.002, rz=math.pi / 2, ry=0.4 * k)


def lectern():
    with at(polar(320, 2.6), ry=RAD(320)):
        # octagonal stepped plinth
        lathe([(0, 0), (0.34, 0), (0.34, 0.05), (0.3, 0.07), (0.26, 0.14), (0.0, 0.14)], 8, mat="ebony", bevel=0.008)
        # a turned column with bead and reel work
        lathe([(0, 0.14), (0.16, 0.14), (0.15, 0.2), (0.1, 0.24), (0.1, 0.3), (0.13, 0.34), (0.1, 0.38), (0.075, 0.46), (0.075, 0.74), (0.1, 0.78), (0.095, 0.84),
               (0.12, 0.88), (0.1, 0.92), (0.15, 1.0), (0.17, 1.06), (0.0, 1.06)], 20, mat="shelf", bevel=0.003)
        # reading board with a lip and a brass edge
        with at((0, 1.18, 0.02), rx=-0.5):
            box(0.84, 0.05, 0.62, mat="desk", bevel=0.012, segs=2)
            box(0.86, 0.03, 0.04, (0, -0.005, 0.33), mat="brass", bevel=0.008)
            box(0.84, 0.05, 0.05, (0, 0.035, -0.31), mat="shelf", bevel=0.01)
        with at((0, 1.27, 0.03), rx=-0.5):                                                # the grimoire
            box(0.38, 0.11, 0.52, (0, 0, 0), mat="leather", tint=(0.22, 0.1, 0.4), tint_mode=0.92, bevel=0.016, segs=2)
            box(0.345, 0.085, 0.485, (0.012, -0.002, 0.012), mat="paper", bevel=0.0)
            quad_uv(0.355, 0.49, (0, 0.0572, 0), "grimoire", up=True)                          # the typeset cover
            for (cx, cz) in ((-0.185, -0.255), (0.185, -0.255), (-0.185, 0.255), (0.185, 0.255)):
                box(0.05, 0.116, 0.05, (cx, 0, cz), mat="gilt", bevel=0.008)
            box(0.03, 0.118, 0.52, (0.18, 0, 0), mat="gilt", bevel=0.006)
            cyl(0.03, 0.03, 0.014, 18, (0.0, 0.06, 0.0), mat="rune", bevel=0.0, emissive=0.3)  # a gem in the cover
            box(0.05, 0.003, 0.2, (-0.02, 0.058, 0.0), mat="gilt", bevel=0.0)                  # clasp strap


GLOBE_TILT = RAD(23.5)
GLOBE_C = polar(300, 3.4, 1.2)


def globe_stand():
    with at(polar(300, 3.4)):
        # three curved legs rising from bun feet to a turned collar
        for k in range(3):
            a = k * 2 * math.pi / 3 + 0.4
            p0 = (0.34 * math.cos(a), 0.02, 0.34 * math.sin(a))
            p1 = (0.38 * math.cos(a), 0.2, 0.38 * math.sin(a))
            p2 = (0.16 * math.cos(a), 0.55, 0.16 * math.sin(a))
            p3 = (0.045 * math.cos(a), 0.8, 0.045 * math.sin(a))
            tube(bezier(p0, p1, p2, p3, 14), [0.026 - 0.012 * i / 14 for i in range(15)], 10, "ebony")
            lathe([(0, 0), (0.035, 0), (0.03, 0.03), (0.0, 0.03)], 12, (p0[0], 0, p0[2]), mat="brass", bevel=0.004)
        lathe([(0, 0.78), (0.07, 0.78), (0.09, 0.82), (0.06, 0.86), (0.045, 0.9), (0.0, 0.9)], 18, mat="ebony", bevel=0.003)
        lathe([(0, 0.88), (0.025, 0.88), (0.022, 1.0), (0.0, 1.0)], 10, mat="brass", bevel=0.002)
        # the horizon ring and the tilted brass meridian
        lathe([(0.47, 0.88), (0.52, 0.88), (0.52, 0.92), (0.47, 0.92), (0.47, 0.88)], 64, mat="ebony", bevel=0.004, L=0.4)
        torus(0.5, 0.008, (0, 0.905, 0), rx=math.pi / 2, mat="brass", seg=64, tseg=6)
    with at(GLOBE_C, rz=GLOBE_TILT):
        torus(0.43, 0.017, (0, 0, 0), ry=0.0, mat="brass", seg=72, tseg=10)
        for sy in (-1, 1):
            lathe([(0, 0), (0.03, 0), (0.016, 0.06), (0.0, 0.06)], 12, (0, sy * 0.4 if sy > 0 else -0.4, 0), mat="brass", bevel=0.002, rx=0 if sy > 0 else math.pi)


def armillary(pos, scale=1.0):
    with at(pos, scale=scale):
        lathe([(0, 0), (0.08, 0), (0.07, 0.03), (0.035, 0.06), (0.03, 0.15), (0.05, 0.19), (0.0, 0.2)], 20, mat="brass", bevel=0.002)
        with at((0, 0.36, 0), rz=GLOBE_TILT):
            for a in (0.0, math.pi / 3, 2 * math.pi / 3):
                torus(0.15, 0.005, (0, 0, 0), ry=a, mat="brass", seg=48, tseg=6)
            torus(0.15, 0.005, (0, 0, 0), rx=math.pi / 2, mat="brass", seg=48, tseg=6)
            torus(0.11, 0.004, (0, 0.0, 0), rx=math.pi / 2, mat="brass", seg=48, tseg=6)
            sphere_uv(0.04, (0, 0, 0), "globe", usegs=24, vsegs=16)
            tube([(0, -0.19, 0), (0, 0.19, 0)], 0.004, 6, "brass")


def sconces():
    """Two brass wall sconces on the shelf pilasters, each holding a candle: they are real light sources."""
    out = []
    for a, side in ((162.4, -1), (187.6, 1)):
        a_r = RAD(a)
        rr = R - 0.36
        base = Vector((rr * math.sin(a_r), 2.1, rr * math.cos(a_r)))
        inward = -Vector((math.sin(a_r), 0, math.cos(a_r)))
        tang = Vector((math.cos(a_r), 0, -math.sin(a_r))) * side
        plate = base
        p0 = tuple(plate)
        p1 = tuple(plate + inward * 0.12 + Vector((0, 0.06, 0)))
        p2 = tuple(plate + inward * 0.2 + tang * 0.12 + Vector((0, -0.04, 0)))
        p3 = tuple(plate + inward * 0.2 + tang * 0.2 + Vector((0, 0.08, 0)))
        tube(bezier(p0, p1, p2, p3, 14), [0.012] * 15, 8, "brass")
        cup = plate + inward * 0.2 + tang * 0.2 + Vector((0, 0.08, 0))
        lathe([(0, 0), (0.035, 0), (0.05, 0.03), (0.035, 0.04), (0.0, 0.04)], 16, tuple(cup), mat="brass", bevel=0.002)
        cyl(0.017, 0.017, 0.15, 12, tuple(cup + Vector((0, 0.115, 0))), mat="candle", bevel=0.002)
        lathe([(0, 0), (0.014, 0.02), (0.011, 0.06), (0.0, 0.11)], 10, tuple(cup + Vector((0, 0.19, 0))), mat="flame", bevel=0.0)
        arcbox(0.08, 0.16, 0.025, a, R - 0.35, 2.1, mat="brass", bevel=0.008)
        out.append(dict(name=f"sconce{side}", pos=list(cup + Vector((0, 0.22, 0))), color=[1.0, 0.62, 0.3], intensity=1.8, range=4.2, flicker=1, shadow=0))
    return out


SCONCE_LIGHTS = []


# ----------------------------------------------------------------------------- scans
def catalogue():
    recs = import_model("vintage_wooden_drawer_01", 9000)
    with at(polar(268, 4.15), ry=RAD(268)):
        place(recs, scale=1.7, ry=math.pi)
    # an armillary and a stack of atlases on top
    top = 0.55 * 1.7
    armillary((polar(268, 4.15)[0] + 0.1, top, polar(268, 4.15)[2]), 0.9)


def console_set():
    recs = import_model("ClassicConsole_01", 12000)
    a = WIN_ANG
    with at(polar(a, 4.72), ry=RAD(a) + math.pi):
        place(recs)
    top = 0.95
    with at(polar(a, 4.72, top), ry=RAD(a)):
        place(import_model("marble_bust_01", 11000), pos=(-0.5, 0, 0), ry=math.pi + 0.3)
        place(import_model("mantel_clock_01", 9000), pos=(0.45, 0, 0), ry=math.pi, scale=1.15)
        place(import_model("vintage_oil_lamp", 12000), pos=(0.05, 0, 0.0), ry=math.pi, scale=0.8)


def armchair():
    x, _, z = polar(340, 2.0)
    with at((x, 0, z), ry=RAD(340) + math.pi + 0.3):
        place(import_model("ArmChair_01", 12000), scale=1.25)
    x, _, z = polar(176, 1.4)
    with at((x, 0, z), ry=RAD(176) + 0.15):
        place(import_model("WoodenChair_01", 14000), scale=0.95)


def grandfather():
    x, _, z = polar(161.5, 4.75)
    with at((x, 0, z), ry=RAD(161.5) + math.pi):
        place(import_model("vintage_grandfather_clock_01", 18000), scale=0.95)


def stool():
    x, _, z = polar(222, 3.2)
    with at((x, 0, z), ry=0.6):
        place(import_model("wooden_stool_01", 8000), scale=1.4)


def plants():
    with at(polar(193, 4.15), ry=0.5):
        place(import_model("potted_plant_02", 16000), scale=1.45)
        cyl(0.2, 0.2, 0.02, 14, (0, 0.46, 0), mat="soil", bevel=0.0)
    with at(polar(286, 4.25), ry=1.2):
        place(import_model("potted_plant_01", 16000, keep=("stem", "pot", "leaves")), scale=1.0)


def chest():
    with at(polar(35, 4.2), ry=RAD(35) + math.pi):
        place(import_model("treasure_chest", 10000), scale=1.15)


def candelabra():
    recs = import_model("brass_candleholders", 15000, keep=("candleholder_03",))
    with at(polar(176, 2.6, 0.9 + 0.0775), ry=RAD(176)):
        with at((0.88, 0, 0.06)):
            place(recs, per_object_base=True)


def shelf_scans():
    rows = ROWS
    rad = R - 0.56

    def spot(band, row, a):
        return polar(a, rad, rows[row] + 0.05), RAD(a)
    p, ry = spot(0, 2, 122)
    with at(p, ry=ry + math.pi):
        place(import_model("book_encyclopedia_set_01", 9000), scale=1.0)
    p, ry = spot(1, 3, 230)
    with at(p, ry=ry + math.pi):
        place(import_model("book_encyclopedia_set_01", 6000), scale=1.0)
    p, ry = spot(0, 4, 140)
    with at(p, ry=ry + math.pi + 0.25):
        place(import_model("antique_ceramic_vase_01", 9000), scale=1.25)
    p, ry = spot(1, 1, 214)
    with at(p, ry=ry + math.pi):
        place(import_model("ceramic_vase_01", 8000), scale=1.2)
    p, ry = spot(1, 4, 204)
    with at(p, ry=ry + math.pi):
        place(import_model("brass_vase_01", 10000), scale=0.8)
    p, ry = spot(0, 1, 132)
    with at(p, ry=ry + math.pi):
        place(import_model("Lantern_01", 9000), scale=1.4)



# ----------------------------------------------------------------------------- animated parts
def flying_book_model():
    """One open book hinged at its spine on the origin; the renderer opens the leaves."""
    with group("book"):
        box(0.06, 0.045, 0.35, mat="leather", tint_mode=1.0, tint=(1, 1, 1), bevel=0.01, segs=2)
        for side in (-1, 1):
            box(0.23, 0.014, 0.35, (side * 0.145, -0.016, 0), mat="leather", tint_mode=1.0, tint=(1, 1, 1), bevel=0.006, side=side)
            box(0.21, 0.03, 0.32, (side * 0.14, 0.008, 0), mat="paper", bevel=0.004, side=side)
            quad_uv(0.205, 0.31, (side * 0.14, 0.0305, 0), "pages", up=True, uv=((0.0, 0.0, 0.5, 1.0) if side > 0 else (0.5, 0.0, 1.0, 1.0)), side=side)


def globe_model():
    with group("globe"):
        sphere_uv(0.38, (0, 0, 0), "globe")




def build():
    def stage(fn, *a):
        t0 = sum(b.n for b in BATCHES.values())
        fn(*a)
        print(f"[library]   {fn.__name__}: {sum(b.n for b in BATCHES.values()) - t0} corners", flush=True)

    for fn in (floor_and_platform, wall, railing, window, plaque, shelves, shelf_cards, ladder_rail, desk, rug, ladder, floor_litter, lectern, globe_stand,
               catalogue, console_set, armchair, stool, plants, chest, candelabra, shelf_scans):
        stage(fn)
    SCONCE_LIGHTS.extend(sconces())
    book_units(); flying_book_model(); globe_model()
    shaft_model(polar(WIN_ANG, R - 0.5, WIN_Y), polar(WIN_ANG - 18, 1.1, 0.06), 0.68, 0.68 * 2.4)


def write(ctx):
    name = "library"
    tree, uniq = ctx["tree"], ctx["uniq"]
    # shelf books: sorted by variant, with per-instance ambient occlusion sampled on the spine, foot and head
    BOOK_INST.sort(key=lambda it: it["variant"])
    pts, nrm = [], []
    for it in BOOK_INST:
        m = frame(it["pos"], it["yaw"], 0.0, it["tilt"])
        for fy in (-0.42, 0.42):
            pts.append(tuple(m @ Vector((0, fy * it["h"], -it["d"] / 2 - 0.02))))
            nrm.append(tuple((m.to_3x3() @ Vector((0, 0, -1))).normalized()))
    aoI = ao_bake(np.array(pts, np.float32), np.array(nrm, np.float32), tree, nrays=48) if pts else np.array([])
    inst = np.zeros((len(BOOK_INST), 16), np.float32)
    variants = []
    for i, it in enumerate(BOOK_INST):
        a0, a1 = float(np.clip(aoI[2 * i], 0, 1) ** 1.2), float(np.clip(aoI[2 * i + 1], 0, 1) ** 1.2)
        inst[i] = [*it["pos"], it["yaw"], it["sx"], it["sy"], it["tilt"], a0, *it["tint"], a1, float(it["slot"]), 0, 0, 0]
    for vi in range(len(VARIANTS)):
        idx = [i for i, it in enumerate(BOOK_INST) if it["variant"] == vi]
        variants.append({"group": f"shelfbook{vi}", "first": idx[0] if idx else 0, "count": len(idx)})
    for i, it in enumerate(BOOK_INST):
        slots[it["slot"]]["inst"] = i
    inst.tofile(os.path.join(OUT, f"{name}.books.bin"))
    print(f"[{name}] shelf books: {len(BOOK_INST)} instances", [v["count"] for v in variants], flush=True)

    # the candelabra's light sits in the middle of its flames
    fl = uniq[("static", "flame")][0]
    fp = np.ascontiguousarray(fl[:, 0:3]).view(np.float32)
    dx, dz = polar(176, 2.6)[0], polar(176, 2.6)[2]
    near = (np.hypot(fp[:, 0] - dx, fp[:, 2] - dz) < 1.6) & (fp[:, 1] > 0.9)       # the desk's flames, not the sconces'
    fp = fp[near]
    cand_pos = [float(fp[:, 0].mean()), float(fp[:, 1].mean()) + 0.05, float(fp[:, 2].mean())]
    manifest = base_manifest(
        ctx,
        lights=[
            {"name": "candelabra", "pos": cand_pos, "color": [1.0, 0.62, 0.3], "intensity": 7.0, "range": 7.5, "flicker": 1, "shadow": 1},
            {"name": "lectern", "pos": polar(320, 2.6, 1.7), "color": [0.5, 0.88, 1.0], "intensity": 2.4, "range": 3.6, "flicker": 0, "shadow": 0},
            {"name": "books", "pos": polar(176, 2.2, 3.1), "color": [0.55, 0.9, 1.0], "intensity": 1.5, "range": 4.5, "flicker": 0, "shadow": 0},
        ] + SCONCE_LIGHTS,
        window=window_manifest(WIN_ANG, WIN_Y, HOLE_R),
        globe={"pos": list(GLOBE_C), "spin": 0.25, "tilt": GLOBE_TILT},
        flyingCount=4,
        flyingBooks=[{"r": 1.5 + (i % 3) * 0.55, "a0": i / 7 * 2 * math.pi, "y": 2.5 + (i % 4) * 0.4, "sp": 0.35 + (i % 3) * 0.12,
                      "spread": 0.38 + (i * 0.037 % 0.16), "tint": list(BOOK_TINTS[i % len(BOOK_TINTS)])} for i in range(7)],
        flyingCenter=polar(176, 2.2),
        shelfBooks={"file": f"{name}.books.bin", "count": len(BOOK_INST), "variants": variants},
        slots=slots,
        camera={"pos": polar(332, 4.6, 2.3), "target": polar(165, 2.4, 1.7)},
    )
    write_manifest(name, manifest)
