"""Glassware and apothecary jars, shared by the laboratory and the kitchen pantry: vessels (glass over liquid with a cork), and the
instanced jars on the walls (three unit meshes, a typeset label cell, a liquid colour and a size per instance)."""
from lib import *
import lib

material("glass", None, tint=(0.8, 0.92, 0.95), rough=0.05, metal=0.0, alpha=0.16, blend="alpha")
material("liquid", None, tint=(1, 1, 1), rough=0.25, metal=0.0, emissive=0.32)
material("cork", None, tint=(0.5, 0.36, 0.22), rough=0.92, metal=0.0)
material("spinelabel", gen="spinelabel", rough=0.8, metal=0.0, size=4096, tint=(0.66, 0.61, 0.52))

INST = []
SLOTS = []
JARS = [
    dict(name="squat", w=0.18, h=0.2, d=0.18, weight=0.34),
    dict(name="bottle", w=0.12, h=0.34, d=0.12, weight=0.38),
    dict(name="wide", w=0.22, h=0.26, d=0.22, weight=0.28),
]
JAR_TINTS = [(0.2, 0.75, 0.38), (0.25, 0.5, 0.9), (0.62, 0.32, 0.85), (0.9, 0.62, 0.15), (0.85, 0.22, 0.2), (0.15, 0.7, 0.72)]


def crop(profile, ymax):
    """The part of a (r, y) profile below `ymax`, closed at that height: the liquid inside a vessel."""
    out = []
    for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
        if y0 >= ymax:
            break
        out.append((r0, y0))
        if y1 > ymax:
            t = (ymax - y0) / (y1 - y0)
            out.append((r0 + (r1 - r0) * t, ymax))
            break
    else:
        out.append(profile[-1])
    if out[-1][0] > 1e-5:
        out.append((0, out[-1][1]))
    return out


def vessel(profile, pos=(0, 0, 0), fill=0.5, seg=28, liquid=(0.2, 0.75, 0.38), cork=0.0, rx=0.0, rz=0.0, tint_mode=1.0):
    """Glass (blended), the liquid inside it (emissive, takes `liquid`), and an optional cork. Profile is (r, y)
    from the centre of the foot up to the lip."""
    h = profile[-1][1]
    lathe(profile, seg, pos, mat="glass", rx=rx, rz=rz, tint=liquid, tint_mode=tint_mode)
    if liquid is not None and fill > 0:
        inner = [(max(r - 0.006, 0.0), y + 0.004) if r > 0 else (0.0, y + 0.004) for r, y in profile]
        lathe(crop(inner, h * fill), seg, pos, mat="liquid", rx=rx, rz=rz, tint=liquid, tint_mode=tint_mode)
    if cork:
        r = profile[-1][0]
        lathe([(0, 0), (r * 0.9, 0), (r * 1.0, cork * 0.5), (r * 1.08, cork), (0, cork)], 14, (pos[0], pos[1] + h - cork * 0.25, pos[2]), mat="cork", bevel=0.002)


ERLEN = [(0, 0), (0.085, 0), (0.092, 0.008), (0.05, 0.14), (0.03, 0.19), (0.028, 0.27), (0.034, 0.28)]
BEAKER = [(0, 0), (0.058, 0), (0.06, 0.008), (0.06, 0.15), (0.065, 0.156)]
RETORT = [(0, 0), (0.07, 0.02), (0.1, 0.1), (0.1, 0.16), (0.07, 0.22), (0.035, 0.27), (0.03, 0.36), (0.034, 0.37)]
TUBE = [(0, 0), (0.014, 0.0), (0.015, 0.012), (0.015, 0.13), (0.017, 0.135)]


def round_flask(r=0.1, neck=0.03, nh=0.14, n=16):
    """A round-bottomed flask: a sphere of radius r with a neck rising from its top."""
    pts = [(0.0, 0.0)]
    for i in range(1, n + 1):
        th = -math.pi / 2 + (i / n) * (math.pi * 0.5 + math.radians(52))
        pts.append((r * math.cos(th), r + r * math.sin(th)))
    top = pts[-1][1]
    return pts + [(neck, top + 0.01), (neck, top + nh), (neck * 1.25, top + nh + 0.008)]



def jar(a, sy, w_m, tint, variant, rad=R - 0.6):
    v = JARS[variant]
    ang = RAD(a)
    sc = w_m / v["w"]
    h = v["h"] * (0.92 + rnd() * 0.16)
    pos = (rad * math.sin(ang), sy + 0.06 + h / 2, rad * math.cos(ang))
    INST.append(dict(pos=pos, yaw=ang, tilt=0.0, sx=sc, sy=h / v["h"], tint=tint, w=w_m, h=h, variant=variant, d=v["d"]))
    return h


def pick_jar():
    r = rnd() * sum(v["weight"] for v in JARS)
    for i, v in enumerate(JARS):
        r -= v["weight"]
        if r <= 0:
            return i
    return 0


def jar_units():
    """Three unit jars, each glass over liquid with a cork or brass lid and a paper label: the renderer picks a cell
    of the typeset atlas, the liquid colour and the size per instance."""
    for vi, v in enumerate(JARS):
        w, h, d = v["w"], v["h"], v["d"]
        with group(f"shelfbook{vi}"):
            r = w / 2
            if v["name"] == "squat":
                prof = [(0, -h / 2), (r * 0.94, -h / 2), (r, -h / 2 + 0.012), (r, h * 0.22), (r * 0.86, h * 0.34), (r * 0.5, h * 0.42), (r * 0.5, h / 2), (r * 0.56, h / 2 + 0.006)]
            elif v["name"] == "bottle":
                prof = [(0, -h / 2), (r * 0.9, -h / 2), (r, -h / 2 + 0.014), (r, h * 0.16), (r * 0.7, h * 0.28), (r * 0.3, h * 0.36), (r * 0.3, h / 2), (r * 0.36, h / 2 + 0.005)]
            else:
                prof = [(0, -h / 2), (r * 0.94, -h / 2), (r, -h / 2 + 0.014), (r, h * 0.26), (r * 0.92, h * 0.32), (r * 0.86, h / 2), (r * 0.9, h / 2 + 0.006)]
            y0 = -h / 2
            ys = [p[1] - y0 for p in prof]
            prof0 = [(p[0], y) for p, y in zip(prof, ys)]
            hh = prof0[-1][1]
            lathe(prof, 28, mat="glass", tint=(1, 1, 1), tint_mode=1.0, L=0.1)
            inner = [(max(p[0] - 0.006, 0.0), p[1] + 0.004) for p in prof]
            lathe(crop(inner, y0 + hh * 0.78), 28, mat="liquid", tint=(1, 1, 1), tint_mode=1.0, L=0.1)
            if v["name"] == "wide":
                lathe([(0, 0), (r * 0.9, 0), (r * 0.92, 0.012), (r * 0.88, 0.03), (0, 0.032)], 24, (0, h / 2 - 0.004, 0), mat="brass", bevel=0.002)
                cyl(0.014, 0.014, 0.02, 10, (0, h / 2 + 0.04, 0), mat="brass", bevel=0.003)
            else:
                lathe([(0, -0.03), (r * (0.5 if v["name"] == "squat" else 0.32), -0.03), (r * (0.58 if v["name"] == "squat" else 0.4), 0.0), (r * (0.62 if v["name"] == "squat" else 0.42), 0.04), (0, 0.04)],
                      14, (0, h / 2, 0), mat="cork", bevel=0.002)
            quad_uv(w * 0.62, h * 0.4, (0, -h * 0.05, -r - 0.002), "spinelabel", flag=255)




def fill_row(bi, ri, a0, a1, sy, rad, gap_m=0.05, chance=0.78, tints=None, vi_pick=None):
    """Jars along one shelf board, by their real widths. Records a slot per jar for the label atlas."""
    deg_per_m = 180 / math.pi / rad
    a = a0
    while a < a1:
        vi = (vi_pick or pick_jar)()
        v = JARS[vi]
        w = v["w"] * (0.9 + rnd() * 0.2)
        step = (w + gap_m) * deg_per_m
        if a + step > a1:
            break
        if rnd() < chance:
            h = jar(a + step / 2, sy, w, pick(tints or JAR_TINTS), vi, rad)
            INST[-1]["slot"] = len(SLOTS)
            SLOTS.append({"band": bi, "angle": float(a + step / 2), "row": ri, "height": h, "width": w, "variant": vi, "pos": list(INST[-1]["pos"]),
                          "yaw": INST[-1]["yaw"], "tint": list(INST[-1]["tint"]), "depth": v["d"]})
        a += step


def write_instances(tree, name):
    """Sort the jars by unit mesh, bake an occlusion value at foot and head of each, write <name>.books.bin; return the variant table."""
    INST.sort(key=lambda it: it["variant"])
    pts, nrm = [], []
    for it in INST:
        m = frame(it["pos"], it["yaw"], 0.0, it["tilt"])
        for fy in (-0.42, 0.42):
            pts.append(tuple(m @ Vector((0, fy * it["h"], -it["d"] / 2 - 0.02))))
            nrm.append(tuple((m.to_3x3() @ Vector((0, 0, -1))).normalized()))
    aoI = ao_bake(np.array(pts, np.float32), np.array(nrm, np.float32), tree, nrays=48) if pts else np.array([])
    inst = np.zeros((len(INST), 16), np.float32)
    variants = []
    for i, it in enumerate(INST):
        a0, a1 = float(np.clip(aoI[2 * i], 0, 1) ** 1.2), float(np.clip(aoI[2 * i + 1], 0, 1) ** 1.2)
        inst[i] = [*it["pos"], it["yaw"], it["sx"], it["sy"], it["tilt"], a0, *it["tint"], a1, float(it["slot"]), 0, 0, 0]
    for vi in range(len(JARS)):
        idx = [i for i, it in enumerate(INST) if it["variant"] == vi]
        variants.append({"group": f"shelfbook{vi}", "first": idx[0] if idx else 0, "count": len(idx)})
    for i, it in enumerate(INST):
        SLOTS[it["slot"]]["inst"] = i
    inst.tofile(os.path.join(OUT, f"{name}.books.bin"))
    print(f"[{name}] jars: {len(INST)} instances", [v["count"] for v in variants], flush=True)
    return {"file": f"{name}.books.bin", "count": len(INST), "variants": variants}
