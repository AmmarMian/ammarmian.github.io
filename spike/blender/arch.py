"""Architecture every floor shares: the plank floor on its stone platform, the curved wall with an optional round window cut
through it, mouldings, a balustrade round the open side, and a window surround. Each takes the materials to use, so the
sanctum can be flagstone and the kitchen plaster and oak without repeating the geometry."""
from lib import *


def plank_floor(mat, tint=(0.7, 0.96), run=(1.2, 2.2), top_only=True):
    """Boards in staggered runs inside the platform circle. `tint` is the (low, high) brightness range per board."""
    z = -R
    while z < R:
        half = math.sqrt(max(R * R - (z + 0.1) ** 2, 0))
        if half > 0.3:
            x = -half
            while x < half - 0.05:
                ln = min(half - x, run[0] + rnd() * (run[1] - run[0]))
                if half - (x + ln) < 0.5:
                    ln = half - x
                k = tint[0] + rnd() * (tint[1] - tint[0])
                box(ln - 0.004, 0.2, 0.196, (x + ln / 2, -0.1, z + 0.1), mat=mat, bevel=0.008, L=0.3, top_only=top_only, tint=(k, k, k))
                x += ln
        z += 0.2


def platform(top_mat, base_mat, edge_mat=None):
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat=top_mat, L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat=base_mat, L=1.0)
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, edge_mat or top_mat, step=4.0)


def stone_floor(mat, base_mat, tile=2.4):
    """A flagged floor: one disc of stone, no boards."""
    lathe([(0, -0.2), (R - 0.02, -0.2), (R - 0.02, 0.0), (0, 0.0)], 64, mat=mat, L=0.35)
    lathe([(0, -0.92), (R - 0.3, -0.92), (R - 0.02, -0.2), (0, -0.2)], 48, mat=base_mat, L=1.0)
    lathe([(0, -1.52), (R - 0.8, -1.52), (R - 0.34, -0.92), (0, -0.92)], 40, mat=base_mat, L=1.0)
    sweep_arc([(0, 0), (0.12, -0.02), (0.14, -0.12), (0.1, -0.2), (-0.02, -0.2), (-0.02, 0)], 0, 360, R - 0.06, -0.2, mat, step=4.0)


def core_wall(mat, a0=100.0, a1=236.0, win=None, step=2.2, bevel=0.006):
    """The wall as narrow columns so the curve is smooth. `win` = (angle, y, hole radius) cuts a round opening clean through."""
    for a in np.arange(a0, a1 + 1e-6, step):
        if win is not None:
            wa, wy, wr = win
            dx = (R - 0.2) * math.sin(RAD(a - wa))
            if abs(dx) < wr:
                hh = math.sqrt(wr ** 2 - dx ** 2)
                lo, hi = wy - hh, wy + hh
                arcbox(0.2, lo, 0.3, a, R - 0.18, lo / 2, mat=mat, L=0.3, bevel=bevel)
                arcbox(0.2, WH - hi, 0.3, a, R - 0.18, hi + (WH - hi) / 2, mat=mat, L=0.3, bevel=bevel)
                continue
        arcbox(0.2, WH, 0.3, a, R - 0.18, WH / 2, mat=mat, L=0.3, bevel=bevel)


def mouldings(base_mat, cap_mat, a0=100.0, a1=236.0, rail_mat=None, rail_y=None):
    sweep_arc([(0, 0), (0.05, 0), (0.05, 0.03), (0.07, 0.05), (0.07, 0.2), (0.04, 0.22), (0.04, 0.24), (0, 0.24)], a0, a1, R - 0.35, 0.0, base_mat)
    sweep_arc([(0, 0), (0.04, 0), (0.1, 0.1), (0.2, 0.16), (0.24, 0.2), (0.24, 0.3), (0.12, 0.3), (0.06, 0.26), (0, 0.24)], a0, a1, R - 0.38, WH - 0.4, cap_mat)
    if rail_mat and rail_y:
        sweep_arc([(0, 0), (0.03, 0), (0.03, 0.012), (0.05, 0.03), (0.05, 0.05), (0.035, 0.06), (0.035, 0.07), (0, 0.07)], a0, a1, R - 0.35, rail_y, rail_mat)


def pilaster(a, y1, mat, cap_mat=None, rad=R - 0.4, w=0.22):
    cap_mat = cap_mat or mat
    arcbox(w, y1, 0.1, a, rad, y1 / 2, mat=mat, bevel=0.008)
    arcbox(w + 0.1, 0.34, 0.15, a, rad, 0.17, mat=cap_mat, bevel=0.02, segs=2)
    arcbox(w + 0.1, 0.22, 0.15, a, rad, y1 - 0.11, mat=cap_mat, bevel=0.02, segs=2)


def buttress(a, mat, cap_mat, y1=WH - 0.5, band_mat="iron"):
    arcbox(0.42, y1, 0.3, a, R - 0.5, y1 / 2, mat=mat, bevel=0.02, segs=2)
    arcbox(0.5, 0.3, 0.38, a, R - 0.5, 0.15, mat=cap_mat, bevel=0.03, segs=2)
    arcbox(0.5, 0.2, 0.38, a, R - 0.5, y1 - 0.1, mat=cap_mat, bevel=0.03, segs=2)
    if band_mat:
        for y in (1.2, 2.6, 3.9):
            arcbox(0.46, 0.05, 0.33, a, R - 0.5, y, mat=band_mat, bevel=0.01)


def round_window(ang, y, r, stone_mat, frame_mat, lattice=True, sill=True):
    """A stone reveal with a rolled outer moulding, an iron-or-timber cross, optional rings, and a sill. Local frame at the opening."""
    hole = r - 0.13
    with at(polar(ang, R - 0.4, y), ry=RAD(ang)):
        lathe([(hole, -0.18), (r, -0.18), (r, 0.18), (hole, 0.18), (hole, -0.18)], 56, rx=math.pi / 2, mat=stone_mat, bevel=0.02, L=0.3)
        lathe([(r, 0.1), (r + 0.06, 0.1), (r + 0.15, 0.15), (r + 0.18, 0.2), (r + 0.15, 0.25), (r, 0.25), (r, 0.1)], 56, rx=math.pi / 2, mat=stone_mat, bevel=0.01, L=0.3)
        span = hole * 2
        box(0.06, span, 0.08, (0, 0, 0), mat=frame_mat, bevel=0.01)
        box(span, 0.06, 0.08, (0, 0, 0), mat=frame_mat, bevel=0.01)
        if lattice:
            for r_ in (hole * 0.34, hole * 0.66):
                torus(r_, 0.008, (0, 0, 0), mat=frame_mat, seg=48, tseg=6)
        if sill:
            box(span + 0.5, 0.1, 0.5, (0, -r - 0.08, 0.1), mat=stone_mat, bevel=0.03, segs=2)


def balustrade(post_mat, rail_mat, a0=358.0, a1=446.0, turned=True):
    for a in np.arange(a0, a1 + 1e-6, 4.4):
        x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
        if turned:
            lathe([(0, 0), (0.035, 0), (0.03, 0.06), (0.02, 0.12), (0.034, 0.26), (0.02, 0.4), (0.028, 0.5), (0.024, 0.8), (0.0, 0.84)], 12, (x, 0.0, z), mat=post_mat, bevel=0.002)
        else:
            box(0.05, 0.84, 0.05, (x, 0.42, z), ry=RAD(a), mat=post_mat, bevel=0.006)
    sweep_arc([(-0.07, 0.84), (0.07, 0.84), (0.09, 0.88), (0.08, 0.95), (-0.08, 0.95), (-0.09, 0.88)], a0 - 2, a1 + 2, R - 0.26, 0.0, rail_mat, step=2.0)
    sweep_arc([(-0.05, 0.0), (0.05, 0.0), (0.05, 0.1), (-0.05, 0.1)], a0 - 2, a1 + 2, R - 0.26, 0.0, post_mat, step=2.0)
    for a in (a0 - 4, a1 + 4):
        x, z = (R - 0.26) * math.sin(RAD(a)), (R - 0.26) * math.cos(RAD(a))
        lathe([(0, 0), (0.11, 0), (0.1, 0.12), (0.07, 0.18), (0.07, 1.1), (0.1, 1.14), (0.1, 1.28), (0.06, 1.34), (0.0, 1.38)], 14, (x, 0, z), mat=post_mat, bevel=0.005)


def stage_runner():
    """Returns stage(fn) that reports how many vertices a build step added."""
    def stage(fn, *a):
        t0 = sum(b.n for b in BATCHES.values())
        fn(*a)
        print(f"[{FLOOR}]   {fn.__name__}: {sum(b.n for b in BATCHES.values()) - t0} corners", flush=True)
    return stage
