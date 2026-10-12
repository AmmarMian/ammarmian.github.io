"""Turns the texture sources named in spike/public/library.json into the WebP files the page loads.

  python3 spike/tools/pack-assets.py

Poly Haven sets are resized to the material's size cap; maps that are a single roughness channel
become an ARM image (ambient occlusion, roughness, metalness in R, G, B); the three painted
materials (paper, rug, globe) are generated here. The manifest gains a `textures` entry per material.
"""
import json, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import typeset as T

PUB = "spike/public"
SRC = "spike/assets-src"
OUT = os.path.join(PUB, "tex")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)


def fbm(h, w, octaves=5, base=4, seed=0, wrap_x=False):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = r.random((n + 1, n * 2 + 1)).astype(np.float32)
        if wrap_x:
            g[:, -1] = g[:, 0]
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        out += amp * np.asarray(img, np.float32) / 255
        tot += amp
        amp *= 0.5
    return out / tot


def save(name, arr, q=86):
    path = os.path.join(OUT, name + ".webp")
    Image.fromarray(arr).save(path, "WEBP", quality=q, method=5)
    return name + ".webp"


def fit(im, size):
    if max(im.size) > size:
        k = size / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    return im


def gen_paper(size):
    n = fbm(size, size, 6, 8, 3)
    fib = fbm(size, size // 4, 3, 40, 9)
    fib = np.asarray(Image.fromarray((fib * 255).astype(np.uint8)).resize((size, size)), np.float32) / 255
    v = 0.80 + 0.12 * n + 0.06 * fib
    # ruled lines of page edges: thin horizontal grooves
    lines = (np.sin(np.arange(size)[:, None] * math_pi(size / 3.0)) * 0.5 + 0.5) ** 6
    v = v - 0.05 * lines
    rgb = np.stack([v * 0.97, v * 0.92, v * 0.80], -1)
    return (np.clip(rgb, 0, 1) * 255).astype(np.uint8)


def math_pi(x):
    return np.pi * x * 2 / x * x / x if False else np.pi * 2


def gen_rug(size):
    """A woven rug: a dark field with a lattice, a lobed medallion, three border bands with a running motif, a
    pile that wears thin in patches. Returns (albedo, normal) -- the normal map is the weave itself."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    cx, cy = x - 0.5, y - 0.5
    r = np.hypot(cx, cy) * 2
    ang = np.arctan2(cy, cx)
    deep, red, madder, gold, cream, blue, teal = (np.array(c, np.float32) / 255 for c in
        ((34, 10, 14), (110, 24, 30), (146, 40, 36), (186, 142, 66), (210, 192, 156), (24, 36, 74), (36, 84, 88)))
    col = np.zeros((size, size, 3), np.float32)
    col[:] = red
    lat = (np.abs(np.sin((x + y) * 26)) * np.abs(np.sin((x - y) * 26))) ** 0.4
    col = col * (0.82 + 0.22 * lat[..., None])
    for k, (rr, wd, c) in enumerate(((0.62, 0.05, deep), (0.50, 0.035, madder))):
        b = np.clip(1 - np.abs(r - rr) / wd, 0, 1)
        col = col * (1 - b[..., None]) + c * b[..., None]
    lobe = 0.30 * (1 + 0.28 * np.cos(ang * 12))
    for rr, wd, c in ((0.30, 0.018, gold), (0.22, 0.03, cream), (0.14, 0.05, blue)):
        b = np.clip(1 - np.abs(r - lobe * rr / 0.30) / wd, 0, 1)
        col = col * (1 - b[..., None]) + c * b[..., None]
    core = np.clip(1 - r / 0.1, 0, 1)[..., None]
    col = col * (1 - core) + teal * core
    petals = np.clip(np.cos(ang * 8) * 0.5 + 0.5, 0, 1) ** 4 * np.clip(1 - np.abs(r - 0.4) / 0.07, 0, 1)
    col = col * (1 - petals[..., None] * 0.8) + cream * petals[..., None] * 0.8
    # borders: gold line, cream line, a wide dark band carrying a running motif, outer fringe line
    motif = (np.sin(ang * 36) * np.sin(r * 90)) > 0.2
    for rr, wd, c in ((0.78, 0.012, gold), (0.84, 0.008, cream), (0.9, 0.012, gold)):
        b = np.clip(1 - np.abs(r - rr) / wd, 0, 1)
        col = col * (1 - b[..., None]) + c * b[..., None]
    band = np.clip(1 - np.abs(r - 0.945) / 0.045, 0, 1)
    col = col * (1 - band[..., None]) + np.where(motif[..., None], madder, deep) * band[..., None]
    # pile: fine grain along the weave, wear in patches
    weave = (np.sin(x * size * 1.7) * np.sin(y * size * 1.7)) * 0.5 + 0.5
    wear = fbm(size, size, 5, 5, 8)
    col *= (0.86 + 0.14 * weave + 0.12 * (fbm(size, size, 5, 96, 5) - 0.5))[..., None]
    col *= (0.82 + 0.3 * np.clip(wear * 1.6 - 0.2, 0, 1))[..., None]
    col = np.where((r > 1.0)[..., None], 0.0, col)
    height = weave * 0.6 + 0.4 * fbm(size, size, 4, 128, 6)
    gx = np.gradient(height, axis=1) * 6.0
    gy = np.gradient(height, axis=0) * 6.0
    nrm = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    nrm = ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)
    return (np.clip(col, 0, 1) * 255).astype(np.uint8), nrm


def gen_globe(size):
    h, w = size // 2, size
    lat = (np.arange(h)[:, None] / h - 0.5) * np.pi
    n = fbm(h, w, 6, 3, 21, wrap_x=True) * 0.8 + fbm(h, w, 3, 8, 22, wrap_x=True) * 0.2
    land = np.clip((n - 0.50) * 9, 0, 1)
    ocean = np.array((38, 86, 128), np.float32) / 255
    deepc = np.array((20, 52, 92), np.float32) / 255
    green = np.array((92, 120, 62), np.float32) / 255
    sand = np.array((184, 158, 100), np.float32) / 255
    rock = np.array((120, 96, 70), np.float32) / 255
    col = ocean * (0.7 + 0.5 * n[..., None]) * 1.0
    col = np.where((n < 0.42)[..., None], deepc, col)
    g = np.clip((n - 0.5) * 5, 0, 1)[..., None]
    terr = green * (1 - g) + rock * g
    terr = terr * 0.8 + sand * 0.2 * (np.abs(np.sin(lat)) < 0.35)[..., None]
    col = col * (1 - land[..., None]) + terr * land[..., None]
    ice = np.clip((np.abs(lat) - 1.25) * 8, 0, 1)[..., None]
    col = col * (1 - ice) + np.array((0.9, 0.93, 0.96), np.float32) * ice
    # graticule
    gx = (np.abs(((np.arange(w)[None, :] / w * 24) % 1) - 0.5) > 0.485) | (np.abs(((np.arange(h)[:, None] / h * 12) % 1) - 0.5) > 0.485)
    col = np.where(gx[..., None], col * 0.55 + np.array((0.6, 0.5, 0.25)) * 0.35, col)
    return (np.clip(col, 0, 1) * 255).astype(np.uint8)


def flat_arm(shape, ao=255, rough=200, metal=0):
    a = np.zeros((*shape, 3), np.uint8)
    a[...] = (ao, rough, metal)
    return a


m = json.load(open(os.path.join(PUB, "library.json")))
total = 0


def spine_entries(slots):
    """One label per shelf slot: the site's real publications first (oldest on the lowest shelves), then bound
    volumes from a small library of classics. Returns the atlas entries and writes `label` onto each slot."""
    pubs = json.load(open("src/data/hal-snapshot.json"))
    pubs = sorted(pubs, key=lambda p: (p.get("year") or 0, p.get("title") or ""))

    def short(names):
        who = [n.split()[-1] if i else f"{n.split()[0][0]}. {n.split()[-1]}" for i, n in enumerate(names)]
        return who[0] if len(who) == 1 else (f"{who[0]} & {who[1]}" if len(who) == 2 else f"{who[0]} et al.")
    order = sorted(range(len(slots)), key=lambda i: (slots[i]["row"], slots[i]["band"], slots[i]["angle"]))
    entries = [None] * len(slots)
    for rank, i in enumerate(order):
        if rank < len(pubs):
            p = pubs[rank]
            title, author, year, pub = p["title"], short(p.get("authorList") or [p.get("authors", "")]), p.get("year") or 0, True
            hal = p.get("id", "")
        else:
            title, author, year = T.FILLERS[(rank - len(pubs)) % len(T.FILLERS)]
            pub, hal = False, ""
        entries[i] = (title, author, year, rank + 1)
        slots[i]["label"] = {"title": title, "author": author, "year": year, "publication": pub, "id": hal, "number": rank + 1}
    return entries


def save_img(name, arr, q=88):
    path = os.path.join(OUT, name + ".webp")
    Image.fromarray(arr).save(path, "WEBP", quality=q, method=5)
    return name + ".webp"


def gen_typeset(name):
    """Textures that carry type. Returns {diff, nor, arm} file names."""
    t = {"diff": None, "nor": None, "arm": None}
    if name == "spinelabel":
        entries = spine_entries(m["slots"])
        atlas, cols, rows = T.spine_atlas(entries)
        t["diff"] = save_img("spinelabel_diff", atlas, 90)
        m["spineAtlas"] = {"cols": cols, "rows": rows, "cell": [56, 288], "size": 4096}
    elif name == "pages":
        left = T.page_image("prose", folio="8", seed=1)
        right = T.page_image("algorithm", folio="9", seed=2)
        t["diff"] = save_img("pages_diff", np.concatenate([left, right], axis=1), 90)
    elif name == "letter":
        t["diff"] = save_img("letter_diff", T.page_image("letter", folio="", running="Annecy, le 12 octobre", seed=5), 88)
    elif name == "plaque":
        a, n, r = T.brass_plaque([("sc", 74, "Bibliotheca Mian"), ("mono", 24, "LISTIC · ANNECY · MMXXVI")])
        t["diff"], t["nor"], t["arm"] = save_img("plaque_diff", a), save_img("plaque_nor", n, 92), save_img("plaque_arm", r, 92)
    elif name == "cards":
        labels = [("I.1", "Riemannian geometry"), ("I.2", "Covariance estimation"), ("I.3", "Radar polarimetry"), ("I.4", "Robust statistics"),
                  ("II.1", "Machine learning"), ("II.2", "Signal processing"), ("II.3", "Hyperspectral imaging"), ("II.4", "Algorithms and code")]
        t["diff"] = save_img("cards_diff", T.shelf_cards(labels), 90)
    elif name == "grimoire":
        a, n, r = T.grimoire_cover()
        t["diff"], t["nor"], t["arm"] = save_img("grimoire_diff", a, 90), save_img("grimoire_nor", n, 92), save_img("grimoire_arm", r, 92)
    return t

for mat in m["materials"]:
    t = {"diff": None, "nor": None, "arm": None}
    size = mat["size"]
    name = mat["name"]
    if mat.get("gen") in ("spinelabel", "pages", "letter", "plaque", "cards", "grimoire"):
        t = gen_typeset(mat["gen"])
    elif mat.get("gen"):
        g = mat["gen"]
        img = {"paper": gen_paper, "rug": gen_rug, "globe": gen_globe}[g](size)
        if isinstance(img, tuple):
            t["diff"] = save(f"{name}_diff", img[0])
            t["nor"] = save(f"{name}_nor", img[1], 90)
        else:
            t["diff"] = save(f"{name}_diff", img)
    elif mat.get("tex"):
        d = os.path.join(SRC, "textures", mat["tex"])
        for k in ("diff", "nor", "arm"):
            p = os.path.join(d, k + ".jpg")
            if os.path.exists(p):
                t[k] = save(f"{name}_{k}", np.asarray(fit(Image.open(p).convert("RGB"), size)), 90 if k == "nor" else 86)
    elif mat.get("files"):
        f = mat["files"]
        if "diff" in f:
            t["diff"] = save(f"{name}_diff", np.asarray(fit(Image.open(os.path.join(SRC, f["diff"])).convert("RGB"), size)))
        if "nor" in f:
            t["nor"] = save(f"{name}_nor", np.asarray(fit(Image.open(os.path.join(SRC, f["nor"])).convert("RGB"), size)), 90)
        if "arm" in f:
            t["arm"] = save(f"{name}_arm", np.asarray(fit(Image.open(os.path.join(SRC, f["arm"])).convert("RGB"), size)), 90)
        elif "rough" in f:
            r = np.asarray(fit(Image.open(os.path.join(SRC, f["rough"])).convert("L"), size))
            a = np.zeros((*r.shape, 3), np.uint8)
            a[..., 0] = 255; a[..., 1] = r
            t["arm"] = save(f"{name}_arm", a, 90)
    mat["textures"] = t
    for v in t.values():
        if v:
            total += os.path.getsize(os.path.join(OUT, v))
json.dump(m, open(os.path.join(PUB, "library.json"), "w"), indent=1)
print(f"{len(m['materials'])} materials, {total / 1e6:.1f} MB of WebP")
