"""Typography for the render, set in the Paper & Night system: Cormorant Garamond for display, Cormorant SC for small
caps, Newsreader for text, JetBrains Mono for tracked capital labels, Pirata One for the one blackletter signature.
Ink is the system's `ink`, paper its `slide`, and the single vermilion `accent` marks one idea per surface.

Everything here returns RGBA numpy arrays; pack-assets.py puts them into the textures the room samples.
"""
import os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONTS = "spike/assets-src/fonts"
PAPER = (239, 236, 228)        # slide
CARD = (246, 244, 238)
INK = (31, 30, 27)
INK2 = (78, 75, 69)
INK3 = (98, 94, 87)
ACCENT = (176, 57, 21)
TEAL = (0, 119, 95)
GILT = (196, 154, 72)
RULE = (31, 30, 27, 60)

_cache = {}


def font(face, size):
    key = (face, size)
    if key not in _cache:
        path = {
            "display": "CormorantGaramond-normal-400.ttf", "sc": "CormorantSC-normal-400.ttf", "text": "Newsreader-normal-400.ttf",
            "mono": "JetBrainsMono-normal-400.ttf", "black": "PirataOne-normal-400.ttf",
            "display-i": "CormorantGaramond-italic-400.ttf", "text-i": "Newsreader-italic-400.ttf", "display-l": "CormorantGaramond-normal-300.ttf",
        }[face]
        _cache[key] = ImageFont.truetype(os.path.join(FONTS, path), size)
    return _cache[key]


def tracked(draw, xy, text, f, fill, tracking=0.0, anchor="ls"):
    """Draw text with letter-spacing (em fraction), as the system sets mono labels (0.14em)."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill, anchor=anchor)
        x += draw.textlength(ch, font=f) + tracking * f.size
    return x


def width(draw, text, f, tracking=0.0):
    return sum(draw.textlength(c, font=f) + tracking * f.size for c in text)


def fit(draw, text, face, size, maxw, tracking=0.0, min_size=10):
    """Largest size down to min_size at which `text` fits, else truncated with an ellipsis."""
    s = size
    while s > min_size and width(draw, text, font(face, s), tracking) > maxw:
        s -= 1
    f = font(face, s)
    if width(draw, text, f, tracking) <= maxw:
        return text, f
    while len(text) > 1 and width(draw, text + "…", f, tracking) > maxw:
        text = text[:-1].rstrip()
    return text + "…", f


def paper_ground(w, h, base=PAPER, seed=1, tooth=0.05):
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 4), np.float32)
    img[..., :3] = np.array(base, np.float32) / 255
    img[..., 3] = 1
    n = rng.random((h, w)).astype(np.float32)
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    img[..., :3] *= (1 - tooth + tooth * 2 * n)[..., None]
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


# ------------------------------------------------------------------------ spine labels
def spine_label(title, author, year, index, w=56, h=288, seed=0):
    """The paper label on a spine, drawn flat (reading along its length), then turned to stand upright: the accent
    index, a hairline, the title in Cormorant SC, authors and year in small mono. Returns (h, w, 4) RGBA."""
    W, H = h, w
    S = 3                                        # supersample
    im = Image.fromarray(paper_ground(W * S, H * S, seed=seed + 3, tooth=0.04))
    d = ImageDraw.Draw(im, "RGBA")
    # top and bottom rules
    d.rectangle([0, 2 * S, W * S, 3 * S], fill=(31, 30, 27, 70))
    d.rectangle([0, (H - 3) * S, W * S, (H - 2) * S], fill=(31, 30, 27, 70))
    ix = f"{index:02d}"
    fx = font("mono", 15 * S)
    tracked(d, (10 * S, 21 * S), ix, fx, ACCENT + (255,), 0.1)
    d.rectangle([34 * S, 8 * S, 35 * S, (H - 8) * S], fill=(31, 30, 27, 80))
    x0 = 44 * S
    avail = (W - 44 - 10) * S
    t, ft = fit(d, title.upper() if len(title) < 26 else title, "sc", 24 * S, avail, 0.05 if len(title) < 26 else 0.0, 14 * S)
    d.text((x0, 27 * S), t, font=ft, fill=INK + (255,), anchor="ls")
    a, fa = fit(d, f"{author}", "text-i", 14 * S, avail - 52 * S, 0.0, 9 * S)
    d.text((x0, 45 * S), a, font=fa, fill=INK2 + (255,), anchor="ls")
    fy = font("mono", 11 * S)
    tw = width(d, str(year), fy, 0.08)
    tracked(d, (W * S - 10 * S - tw, 45 * S), str(year), fy, INK3 + (255,), 0.08)
    im = im.resize((W, H), Image.LANCZOS)
    im = im.rotate(90, expand=True)              # reads from the foot of the spine up, as on a French shelf
    return np.asarray(im.convert("RGBA"))


FILLERS = [
    ("Traité des matrices", "Hermite", 1856), ("Géométrie différentielle", "É. Cartan", 1925), ("Éléments de statistique", "Fisher", 1925),
    ("Radar Polarimetry", "Lee & Pottier", 2009), ("Optimal Transport", "Villani", 2008), ("Théorie du signal", "Picinbono", 1993),
    ("Matrix Analysis", "Bhatia", 1997), ("Principia", "Newton", 1687), ("Les Misérables", "Hugo", 1862), ("Disquisitiones", "Gauss", 1801),
    ("Statistical Signal Processing", "Kay", 1993), ("Manifold Optimization", "Absil", 2008), ("Robust Statistics", "Maronna", 2006),
    ("De la démonstration", "Poincaré", 1902), ("Les Fleurs du mal", "Baudelaire", 1857), ("Spectral Estimation", "Stoica", 2005),
    ("Information Geometry", "Amari", 2016), ("Synthetic Aperture Radar", "Curlander", 1991), ("Calcul des probabilités", "Laplace", 1812),
    ("Fourier Analysis", "Stein", 2003), ("Topologie", "Bourbaki", 1960), ("Hyperspectral Imaging", "Chang", 2003),
    ("Riemannian Geometry", "do Carmo", 1992), ("Mécanique analytique", "Lagrange", 1788), ("Pensées", "Pascal", 1670),
    ("Detection Theory", "Scharf", 1991), ("Le Rouge et le Noir", "Stendhal", 1830), ("Algèbre linéaire", "Cartan", 1951),
    ("Convex Optimization", "Boyd", 2004), ("Wavelets", "Mallat", 1998), ("Probability", "Kolmogorov", 1933), ("Faust", "Goethe", 1808),
]


def spine_atlas(entries, cell=(56, 288), size=4096):
    """All labels in one image: entries is a list of (title, author, year, index); returns (atlas, cols)."""
    cw, ch = cell
    cols = size // cw
    rows = size // ch
    assert len(entries) <= cols * rows, (len(entries), cols * rows)
    atlas = np.zeros((size, size, 4), np.uint8)
    atlas[..., :3] = PAPER
    atlas[..., 3] = 255
    for i, (t, a, y, ix) in enumerate(entries):
        r, c = divmod(i, cols)
        atlas[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = spine_label(t, a, y, ix, cw, ch, seed=i)
    return atlas, cols, rows


# ------------------------------------------------------------------------ typeset pages
def page_image(kind, w=1024, h=1440, folio="8", running="Estimation on the cone", seed=0):
    """A typeset page in the system's voice: mono running head, a kicker with an accent index, a display title with
    the short accent bar, body in Newsreader with a drop cap, a ruled plate with a theorem, a caption, a folio.
    `kind` picks the content: 'algorithm', 'theorem', 'prose', 'letter'."""
    S = 2
    im = Image.fromarray(paper_ground(w * S, h * S, seed=seed + 9, tooth=0.05))
    d = ImageDraw.Draw(im, "RGBA")
    mx = 110 * S
    # running head
    f = font("mono", 17 * S)
    tracked(d, (mx, 96 * S), running.upper(), f, INK3 + (255,), 0.14)
    d.rectangle([mx, 112 * S, (w - 110) * S, 113 * S], fill=(31, 30, 27, 50))
    y = 200 * S
    # kicker: accent index + label
    ix, label = {"algorithm": ("II.4", "Algorithm"), "theorem": ("II.3", "Theorem"), "prose": ("I.2", "Introduction"), "letter": ("", "")}[kind]
    if ix:
        x = tracked(d, (mx, y), ix, font("mono", 18 * S), ACCENT + (255,), 0.14)
        tracked(d, (x + 14 * S, y), label.upper(), font("mono", 18 * S), INK3 + (255,), 0.14)
        y += 78 * S
    titles = {"algorithm": "Computing the Fréchet mean", "theorem": "The mean is unique", "prose": "What the radar remembers", "letter": ""}
    if titles[kind]:
        t, ft = fit(d, titles[kind], "display", 72 * S, (w - 220) * S, 0.0, 40 * S)
        d.text((mx, y), t, font=ft, fill=INK + (255,), anchor="ls")
        y += 22 * S
        d.rectangle([mx, y, mx + 64 * S, y + 4 * S], fill=ACCENT + (255,))
        y += 82 * S
    body = font("text", 30 * S)
    small = font("text", 25 * S)

    def para(text, y, dropcap=False, f=body, color=INK2, lead=1.5, maxw=None, indent=0):
        maxw = maxw or (w - 220) * S
        words = text.split()
        lines, cur = [], ""
        for wd in words:
            test = (cur + " " + wd).strip()
            if d.textlength(test, font=f) <= maxw - (indent if not lines else 0):
                cur = test
            else:
                lines.append(cur); cur = wd
        lines.append(cur)
        for k, ln in enumerate(lines):
            x = mx + (indent if k == 0 else 0)
            d.text((x, y), ln, font=f, fill=color + (255,), anchor="ls")
            y += int(f.size * lead)
        return y

    lorem = {
        "algorithm": ("The Fréchet mean of K covariance matrices is the point of the cone that is closest to all of them in the affine-invariant "
                      "distance. It has no closed form, but gradient descent on the manifold finds it in a handful of steps."),
        "theorem": ("On a space of non-positive curvature the mean is unique: the cone of positive definite matrices is such a space, "
                    "so averaging there never invents information that the samples did not carry."),
        "prose": ("A polarimetric radar measures not one number per pixel but a covariance matrix, and a covariance matrix lives on a curved "
                  "space. Follow it around a closed loop and it does not come back the same: it remembers the path it took."),
        "letter": ("Cher collègue, vous trouverez ci-joint le manuscrit révisé, ainsi que les réponses aux relecteurs. Je reste à votre disposition "
                   "pour en discuter lors de notre prochaine rencontre à Annecy, et vous prie d’agréer mes salutations les meilleures."),
    }
    if kind == "letter":
        d.text((mx, 210 * S), "Université Savoie Mont Blanc", font=font("sc", 34 * S), fill=INK + (255,), anchor="ls")
        tracked(d, (mx, 250 * S), "LISTIC · ANNECY", font("mono", 16 * S), INK3 + (255,), 0.14)
        d.rectangle([mx, 270 * S, mx + 64 * S, 273 * S], fill=ACCENT + (255,))
        y = 360 * S
    # lead paragraph with a drop cap
    text = lorem[kind]
    cap = text[0]
    fcap = font("display", 150 * S)
    d.text((mx - 4 * S, y + 96 * S), cap, font=fcap, fill=ACCENT + (255,), anchor="ls")
    capw = int(d.textlength(cap, font=fcap)) + 10 * S
    # first two lines wrap around the cap
    words = text[1:].split()
    line, lines = "", []
    for wd in words:
        test = (line + " " + wd).strip()
        lim = (w - 220) * S - (capw if len(lines) < 3 else 0)
        if d.textlength(test, font=body) <= lim:
            line = test
        else:
            lines.append(line); line = wd
    lines.append(line)
    yy = y
    for k, ln in enumerate(lines):
        x = mx + (capw if k < 3 else 0)
        d.text((x, yy + 6 * S), ln, font=body, fill=INK2 + (255,), anchor="ls")
        yy += int(body.size * 1.5)
    y = yy + 40 * S
    if kind in ("algorithm", "theorem"):
        # a ruled plate
        top = y
        d.rectangle([mx, top, (w - 110) * S, top + 3 * S], fill=INK + (255,))
        tracked(d, (mx + 4 * S, top + 44 * S), ("ALGORITHM 1" if kind == "algorithm" else "THEOREM 2"), font("mono", 17 * S), ACCENT + (255,), 0.14)
        tracked(d, ((w - 110) * S - 250 * S, top + 44 * S), "O(K n^3) / IT.", font("mono", 17 * S), INK3 + (255,), 0.14)
        d.rectangle([mx, top + 62 * S, (w - 110) * S, top + 63 * S], fill=(31, 30, 27, 70))
        rows_ = {
            "algorithm": [("Require", "K covariance matrices, step size, tolerance"), ("1", "M  is set to the first sample"), ("2", "for t = 1 to T do"),
                          ("3", "    G  is the mean of Log_M(S_k)"), ("4", "    M  is set to Exp_M(step x G)"), ("5", "return M")],
            "theorem": [("", "Let M be a Hadamard manifold and S_1 to S_K"), ("", "points of M. Then the functional"), ("", "    F(M) = sum of d(M, S_k) squared"), ("", "has exactly one minimiser."), ("", "")],
        }[kind]
        yy = top + 110 * S
        for lab, tx in rows_:
            tracked(d, (mx + 4 * S, yy), lab, font("mono", 20 * S), ACCENT + (255,) if lab not in ("Require",) else INK3 + (255,), 0.06)
            d.text((mx + 110 * S, yy), tx, font=font("text", 28 * S), fill=INK + (255,), anchor="ls")
            yy += 54 * S
        d.rectangle([mx, yy - 20 * S, (w - 110) * S, yy - 19 * S], fill=(31, 30, 27, 70))
        y = yy + 46 * S
        cap_ = "Shaded: the tangent mean at each iteration."
        d.text((mx, y), cap_, font=font("text-i", 25 * S), fill=INK3 + (255,), anchor="ls")
        y += 70 * S
    else:
        y = para("Averages of this kind are routinely computed in the Euclidean sense, and routinely wrong; the cone has a geometry, and the geometry "
                 "decides what an average means. The rest of this chapter makes that precise.", y, f=body)
    # footer
    d.rectangle([mx, (h - 150) * S, (w - 110) * S, (h - 149) * S], fill=(31, 30, 27, 50))
    tracked(d, (mx, (h - 104) * S), "AMMAR MIAN", font("mono", 16 * S), INK3 + (255,), 0.14)
    fo = font("display", 34 * S)
    d.text(((w - 110) * S, (h - 100) * S), folio, font=fo, fill=ACCENT + (255,), anchor="rs")
    # a few weak ink bleed pixels: slight blur makes the type sit in the sheet
    im = im.filter(ImageFilter.GaussianBlur(0.5 * S / 2))
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im.convert("RGBA"))


# ------------------------------------------------------------------------ plaque, labels, cover
def brass_plaque(text_lines, w=1024, h=256):
    """An engraved brass plate: returns (albedo, normal, arm). The text is cut into the metal."""
    S = 2
    base = np.zeros((h * S, w * S, 3), np.float32)
    rng = np.random.default_rng(5)
    n = np.asarray(Image.fromarray((rng.random((h * S, w * S)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    brush = np.asarray(Image.fromarray((rng.random((h * S, 8)) * 255).astype(np.uint8)).resize((w * S, h * S), Image.BILINEAR), np.float32) / 255
    base[:] = np.array((190, 145, 70), np.float32) / 255
    base *= (0.86 + 0.1 * n + 0.1 * brush)[..., None]
    mask = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(mask)
    # frame: a hairline rule inset
    d.rectangle([14 * S, 14 * S, (w - 14) * S, (h - 14) * S], outline=255, width=2 * S)
    y = 70 * S
    for kind, size, text in text_lines:
        face = {"sc": "sc", "mono": "mono", "display": "display", "black": "black"}[kind]
        f = font(face, size * S)
        tr = 0.14 if kind == "mono" else (0.06 if kind == "sc" else 0.0)
        tw = width(d, text, f, tr)
        tracked(d, ((w * S - tw) / 2, y), text, f, 255, tr)
        y += int(size * S * 1.5)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    m = np.asarray(mask, np.float32) / 255
    albedo = base * (1 - 0.65 * m[..., None])
    height = -m
    gx = np.gradient(height, axis=1) * 4
    gy = np.gradient(height, axis=0) * 4
    nrm = np.stack([-gx, -gy, np.ones_like(gx)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    arm = np.zeros((h * S, w * S, 3), np.float32)
    arm[..., 0] = 1
    arm[..., 1] = 0.34 + 0.2 * m + 0.1 * n
    arm[..., 2] = 1
    f_ = lambda a: np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS))
    return f_(albedo), f_(nrm * 0.5 + 0.5), f_(arm)


def shelf_cards(labels, w=512, h=112):
    """One card per bay, stacked in a column: accent index, hairline, the category in tracked mono capitals."""
    out = np.zeros((h * len(labels), w, 4), np.uint8)
    for i, (ix, text) in enumerate(labels):
        S = 3
        im = Image.fromarray(paper_ground(w * S, h * S, base=CARD, seed=40 + i, tooth=0.04))
        d = ImageDraw.Draw(im, "RGBA")
        d.rectangle([6 * S, 6 * S, (w - 6) * S, (h - 6) * S], outline=(31, 30, 27, 90), width=S)
        tracked(d, (30 * S, 66 * S), ix, font("mono", 26 * S), ACCENT + (255,), 0.14)
        d.rectangle([100 * S, 28 * S, 101 * S, (h - 28) * S], fill=(31, 30, 27, 90))
        t, f = fit(d, text.upper(), "mono", 24 * S, (w - 150) * S, 0.14, 14 * S)
        tracked(d, (124 * S, 66 * S), t, f, INK + (255,), 0.14)
        out[i * h:(i + 1) * h] = np.asarray(im.resize((w, h), Image.LANCZOS).convert("RGBA"))
    return out


def grimoire_cover(w=768, h=1024):
    """The lectern's book: deep violet cloth, gilt rules, the title in Cormorant SC, the signature in blackletter."""
    S = 2
    rng = np.random.default_rng(3)
    n = np.asarray(Image.fromarray((rng.random((h * S, w * S)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    weave = (np.sin(np.arange(w * S)[None, :] * 0.9) * np.sin(np.arange(h * S)[:, None] * 0.9)) * 0.5 + 0.5
    col = np.zeros((h * S, w * S, 3), np.float32)
    col[:] = np.array((54, 30, 96), np.float32) / 255
    col *= (0.82 + 0.12 * n + 0.08 * weave)[..., None]
    gold = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(gold)
    for inset, wd in ((46, 3), (62, 1)):
        d.rectangle([inset * S, inset * S, (w - inset) * S, (h - inset) * S], outline=255, width=wd * S)
    cx = w * S / 2
    def centred(text, f, y, tr):
        tw = width(d, text, f, tr)
        tracked(d, (cx - tw / 2, y), text, f, 255, tr)
    centred("GRIMOIRE", font("sc", 92 * S), 330 * S, 0.12)
    d.rectangle([cx - 60 * S, 372 * S, cx + 60 * S, 374 * S], fill=255)
    centred("LIBER · COLOPHON", font("mono", 24 * S), 440 * S, 0.3)
    centred("Ammar Mian", font("black", 76 * S), 800 * S, 0.0)
    # a small compass ornament
    cy = 560 * S
    for r_ in (70, 46):
        d.ellipse([cx - r_ * S, cy - r_ * S, cx + r_ * S, cy + r_ * S], outline=255, width=2 * S)
    for a in range(0, 360, 45):
        import math
        d.line([cx, cy, cx + math.cos(math.radians(a)) * 70 * S, cy + math.sin(math.radians(a)) * 70 * S], fill=255, width=2 * S)
    gold = gold.filter(ImageFilter.GaussianBlur(0.7))
    g = np.asarray(gold, np.float32) / 255
    gcol = np.array(GILT, np.float32) / 255
    albedo = col * (1 - g[..., None]) + gcol * g[..., None]
    arm = np.zeros((h * S, w * S, 3), np.float32)
    arm[..., 0] = 1; arm[..., 1] = 0.8 - 0.45 * g; arm[..., 2] = g
    height = g * 0.6 + weave * 0.1
    gx = np.gradient(height, axis=1) * 3; gy = np.gradient(height, axis=0) * 3
    nrm = np.stack([-gx, -gy, np.ones_like(gx)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    f_ = lambda a: np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS))
    return f_(albedo), f_(nrm * 0.5 + 0.5), f_(arm)


# ------------------------------------------------------------------------ the laboratory
JAR_NAMES = [
    ("Aqua regia", "royal water"), ("Sal ammoniacum", "sel ammoniac"), ("Mercurius vivus", "quicksilver"), ("Spiritus vini", "spirit of wine"),
    ("Oleum vitrioli", "oil of vitriol"), ("Cinnabaris", "vermilion"), ("Antimonium", "stibnite"), ("Tinctura solis", "tincture of the sun"),
    ("Elixir vitae", "elixir of life"), ("Aqua fortis", "strong water"), ("Sulphur", "brimstone"), ("Nitrum", "saltpetre"),
    ("Lapis lunaris", "moonstone"), ("Argentum vivum", "living silver"), ("Essentia rosae", "attar of rose"), ("Vitriolum", "green vitriol"),
    ("Cuprum", "copper"), ("Plumbum", "lead"), ("Aurum potabile", "potable gold"), ("Terra sigillata", "sealed earth"),
    ("Cremor tartari", "cream of tartar"), ("Alumen", "alum"), ("Borax", "tincal"), ("Camphora", "camphor"), ("Balsamum", "balsam"),
    ("Succinum", "amber"), ("Galbanum", "resin"), ("Opopanax", "gum"), ("Myrrha", "myrrh"), ("Olibanum", "frankincense"),
]


def jar_label(title, gloss, index, w=256, h=176, seed=0):
    """A paper label for an apothecary jar, in the system's voice: accent index, small-caps name, italic gloss, a rule."""
    S = 3
    im = Image.fromarray(paper_ground(w * S, h * S, seed=seed + 11, tooth=0.05))
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle([8 * S, 8 * S, (w - 8) * S, (h - 8) * S], outline=(31, 30, 27, 120), width=S)
    d.rectangle([14 * S, 14 * S, (w - 14) * S, (h - 14) * S], outline=(31, 30, 27, 60), width=S)
    tracked(d, (w * S / 2 - width(d, f"N° {index:02d}", font("mono", 15 * S), 0.14) / 2, 44 * S), f"N° {index:02d}", font("mono", 15 * S), ACCENT + (255,), 0.14)
    t, ft = fit(d, title.upper(), "sc", 30 * S, (w - 40) * S, 0.05, 16 * S)
    d.text((w * S / 2, 92 * S), t, font=ft, fill=INK + (255,), anchor="mm")
    d.rectangle([w * S / 2 - 20 * S, 108 * S, w * S / 2 + 20 * S, 109 * S], fill=ACCENT + (255,))
    g, fg = fit(d, gloss, "text-i", 18 * S, (w - 40) * S, 0.0, 11 * S)
    d.text((w * S / 2, 134 * S), g, font=fg, fill=INK2 + (255,), anchor="mm")
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im.convert("RGBA"))


def jar_atlas(entries, cell=(256, 176), size=4096):
    cw, ch = cell
    cols, rows = size // cw, size // ch
    assert len(entries) <= cols * rows
    atlas = np.zeros((size, size, 4), np.uint8)
    atlas[..., :3] = PAPER
    atlas[..., 3] = 255
    for i, (t, g, ix) in enumerate(entries):
        r, c = divmod(i, cols)
        atlas[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = jar_label(t, g, ix, cw, ch, seed=i)
    return atlas, cols, rows


def _noise(h, w, octaves, base, seed):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = r.random((n + 1, n + 1)).astype(np.float32)
        out += amp * np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
        tot += amp
        amp *= 0.5
    return out / tot


def brew_texture(size=512):
    """The cauldron's surface: a slow green swirl with foam and bright rolling crests."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    wx = _noise(size, size, 4, 3, 1) - 0.5
    wy = _noise(size, size, 4, 3, 2) - 0.5
    n = _noise(size, size, 5, 4, 3)
    sw = np.sin((x + wx * 0.8) * 14 + (y + wy * 0.8) * 9) * 0.5 + 0.5
    v = np.clip(0.45 * n + 0.55 * sw ** 2, 0, 1)
    dark = np.array((8, 60, 24), np.float32) / 255
    mid = np.array((40, 170, 80), np.float32) / 255
    hi = np.array((170, 255, 170), np.float32) / 255
    col = dark + (mid - dark) * np.clip(v * 1.6, 0, 1)[..., None]
    col = col + (hi - col) * np.clip((v - 0.62) * 4, 0, 1)[..., None]
    rng = np.random.default_rng(9)
    for _ in range(70):                                              # foam rings
        cx, cy, r = rng.random(), rng.random(), 0.008 + rng.random() * 0.03
        d = np.abs(np.hypot(x - cx, y - cy) - r)
        col = col + (hi - col) * np.clip(1 - d / 0.003, 0, 1)[..., None] * 0.7
    r_ = np.hypot(x - 0.5, y - 0.5)
    col *= np.clip(1.15 - r_ * 0.8, 0.5, 1)[..., None]
    return (np.clip(col, 0, 1) * 255).astype(np.uint8)


def _rune(d, cx, cy, size, seed, color, wd):
    r = np.random.default_rng(seed)
    pts = [(r.integers(0, 3), r.integers(0, 5)) for _ in range(int(r.integers(3, 6)))]
    P = [(cx + (px - 1) * size * 0.32, cy + (py - 2) * size * 0.25) for px, py in pts]
    d.line(P, fill=color, width=wd, joint="curve")
    if r.random() < 0.5:
        qx, qy = P[-1]
        d.ellipse([qx - wd * 1.4, qy - wd * 1.4, qx + wd * 1.4, qy + wd * 1.4], outline=color, width=max(1, wd // 2))


def spell_ring(kind, size=1024):
    """A glowing ring of magic on black, to be drawn additively on a flat disc and turned: runes between two circles
    (kind 1), a hexagram in a double circle (2), an eight-pointed star with spokes (3)."""
    S = 2
    im = Image.new("L", (size * S, size * S), 0)
    d = ImageDraw.Draw(im)
    c = size * S / 2
    R_ = size * S * 0.495
    W = 5 * S

    def circle(r, w=W):
        d.ellipse([c - r, c - r, c + r, c + r], outline=255, width=w)

    if kind == 1:
        circle(R_); circle(R_ * 0.955, 2 * S); circle(R_ * 0.72); circle(R_ * 0.68, 2 * S)
        for k in range(72):
            a = k / 72 * math.tau
            r0, r1 = R_ * 0.955, R_ * (0.935 if k % 6 else 0.9)
            d.line([c + math.cos(a) * r0, c + math.sin(a) * r0, c + math.cos(a) * r1, c + math.sin(a) * r1], fill=255, width=2 * S)
        for k in range(12):
            a = (k + 0.5) / 12 * math.tau
            rr = R_ * 0.835
            _rune(d, c + math.cos(a) * rr, c + math.sin(a) * rr, R_ * 0.1, k + 3, 255, 4 * S)
            for b in (k / 12 * math.tau,):
                d.line([c + math.cos(b) * R_ * 0.72, c + math.sin(b) * R_ * 0.72, c + math.cos(b) * R_ * 0.955, c + math.sin(b) * R_ * 0.955], fill=255, width=2 * S)
    elif kind == 2:
        circle(R_); circle(R_ * 0.93, 2 * S); circle(R_ * 0.52); circle(R_ * 0.2, 4 * S)
        for off in (-math.pi / 2, math.pi / 2):
            tri = [(c + math.cos(off + k * math.tau / 3) * R_ * 0.93, c + math.sin(off + k * math.tau / 3) * R_ * 0.93) for k in range(3)]
            d.line(tri + [tri[0]], fill=255, width=W)
        for k in range(6):
            a = -math.pi / 2 + k * math.tau / 6
            x_, y_ = c + math.cos(a) * R_ * 0.93, c + math.sin(a) * R_ * 0.93
            d.ellipse([x_ - 9 * S, y_ - 9 * S, x_ + 9 * S, y_ + 9 * S], fill=255)
            _rune(d, c + math.cos(a) * R_ * 0.62, c + math.sin(a) * R_ * 0.62, R_ * 0.12, 40 + k, 255, 4 * S)
    else:
        circle(R_ * 0.98, 3 * S); circle(R_ * 0.5, 3 * S); circle(R_ * 0.12, 4 * S)
        for k in range(8):
            a = k * math.tau / 8
            d.line([c + math.cos(a) * R_ * 0.12, c + math.sin(a) * R_ * 0.12, c + math.cos(a) * R_ * 0.98, c + math.sin(a) * R_ * 0.98], fill=255, width=2 * S)
        star = [(c + math.cos(k * math.tau * 3 / 8) * R_ * 0.9, c + math.sin(k * math.tau * 3 / 8) * R_ * 0.9) for k in range(9)]
        d.line(star, fill=255, width=W)
        for k in range(8):
            a = (k + 0.5) * math.tau / 8
            _rune(d, c + math.cos(a) * R_ * 0.36, c + math.sin(a) * R_ * 0.36, R_ * 0.09, 70 + k, 255, 3 * S)
    glow = im.filter(ImageFilter.GaussianBlur(10 * S))
    a = np.asarray(im, np.float32) / 255
    g = np.asarray(glow, np.float32) / 255
    v = np.clip(a + 0.9 * g, 0, 1)
    v = np.asarray(Image.fromarray((v * 255).astype(np.uint8)).resize((size, size), Image.LANCZOS), np.uint8)
    return np.stack([v, v, v], -1)


import math  # noqa: E402 (used by the generators above)


# ------------------------------------------------------------------------ the observatory
CONSTELLATIONS = [
    ("LYR", [(0.0, 0.0), (0.12, 0.04), (0.2, 0.2), (0.08, 0.26), (-0.02, 0.15)]),
    ("CYG", [(0.0, 0.0), (0.0, 0.2), (0.0, 0.4), (-0.15, 0.2), (0.15, 0.2)]),
    ("UMA", [(0.0, 0.0), (0.1, -0.03), (0.2, 0.02), (0.3, 0.1), (0.32, 0.22), (0.45, 0.24), (0.47, 0.12)]),
    ("ORI", [(0.0, 0.0), (0.1, 0.02), (0.05, 0.18), (0.04, 0.2), (0.03, 0.22), (-0.05, 0.4), (0.12, 0.38)]),
    ("CAS", [(0.0, 0.0), (0.08, 0.1), (0.18, 0.04), (0.26, 0.14), (0.36, 0.06)]),
    ("SCO", [(0.0, 0.0), (0.04, 0.1), (0.1, 0.18), (0.14, 0.3), (0.22, 0.36), (0.3, 0.32), (0.32, 0.24)]),
]


def star_chart(size=1024):
    """A planisphere on parchment, in the system's type: concentric circles of declination, the ecliptic, the twelve signs round
    the rim in small caps, constellations as dotted lines with mono names, an accent kicker and a title cartouche."""
    S = 2
    W = size * S
    im = Image.fromarray(paper_ground(W, W, base=(232, 222, 198), seed=77, tooth=0.07))
    d = ImageDraw.Draw(im, "RGBA")
    c = W / 2
    R0 = W * 0.46
    for r_, wd in ((1.0, 4), (0.97, 2), (0.75, 2), (0.5, 2), (0.25, 2)):
        d.ellipse([c - R0 * r_, c - R0 * r_, c + R0 * r_, c + R0 * r_], outline=INK + (200,), width=wd * S)
    for k in range(72):                                                    # degree ticks
        a = k / 72 * math.tau
        r0, r1 = R0 * 0.97, R0 * (0.94 if k % 6 else 0.9)
        d.line([c + math.cos(a) * r0, c + math.sin(a) * r0, c + math.cos(a) * r1, c + math.sin(a) * r1], fill=INK + (190,), width=S)
    for k in range(12):                                                    # the signs, in small caps
        a = (k + 0.5) / 12 * math.tau
        d.line([c + math.cos(k / 12 * math.tau) * R0 * 0.75, c + math.sin(k / 12 * math.tau) * R0 * 0.75,
                c + math.cos(k / 12 * math.tau) * R0 * 0.9, c + math.sin(k / 12 * math.tau) * R0 * 0.9], fill=INK + (130,), width=S)
        name = ["ARIES", "TAURUS", "GEMINI", "CANCER", "LEO", "VIRGO", "LIBRA", "SCORPIO", "SAGITTA", "CAPRICORN", "AQUARIUS", "PISCES"][k]
        f = font("sc", 26 * S)
        tw = d.textlength(name, font=f)
        t = Image.new("RGBA", (int(tw) + 8, 40 * S), (0, 0, 0, 0))
        ImageDraw.Draw(t).text((4, 28 * S), name, font=f, fill=INK2 + (255,), anchor="ls")
        t = t.rotate(-math.degrees(a) - 90, expand=True, resample=Image.BICUBIC)
        rr = R0 * 0.835
        im.alpha_composite(t, (int(c + math.cos(a) * rr - t.width / 2), int(c + math.sin(a) * rr - t.height / 2)))
    # the ecliptic, tilted
    e = [(c + R0 * 0.5 * math.cos(t) + R0 * 0.18, c + R0 * 0.5 * math.sin(t)) for t in np.linspace(0, math.tau, 200)]
    d.line(e + [e[0]], fill=ACCENT + (190,), width=3 * S)
    rng = np.random.default_rng(12)
    for name, pts in CONSTELLATIONS:                                       # constellations
        ox, oy = (rng.random() - 0.5) * 0.9, (rng.random() - 0.5) * 0.9
        rot = rng.random() * math.tau
        P = []
        for px, py in pts:
            x, y = px * 0.8 * math.cos(rot) - py * 0.8 * math.sin(rot), px * 0.8 * math.sin(rot) + py * 0.8 * math.cos(rot)
            P.append((c + (ox + x) * R0 * 0.8, c + (oy + y) * R0 * 0.8))
        for (x0, y0), (x1, y1) in zip(P, P[1:]):
            for k in range(14):
                t = k / 14
                if k % 2 == 0:
                    d.ellipse([x0 + (x1 - x0) * t - S, y0 + (y1 - y0) * t - S, x0 + (x1 - x0) * t + S, y0 + (y1 - y0) * t + S], fill=INK2 + (200,))
        for k, (x, y) in enumerate(P):
            r_ = (7 if k == 0 else 4.5) * S
            d.ellipse([x - r_, y - r_, x + r_, y + r_], fill=INK + (255,))
            if k == 0:
                d.ellipse([x - r_ * 1.9, y - r_ * 1.9, x + r_ * 1.9, y + r_ * 1.9], outline=ACCENT + (255,), width=2 * S)
        tracked(d, (P[0][0] + 16 * S, P[0][1] - 12 * S), name, font("mono", 17 * S), ACCENT + (255,), 0.14)
    for _ in range(260):                                                   # field stars
        x, y = rng.random() * W, rng.random() * W
        if math.hypot(x - c, y - c) < R0 * 0.96:
            r_ = (1 + rng.random() * 2) * S
            d.ellipse([x - r_, y - r_, x + r_, y + r_], fill=INK + (150,))
    # cartouche
    d.rectangle([c - 240 * S, 40 * S, c + 240 * S, 130 * S], fill=PAPER + (255,), outline=INK + (200,), width=2 * S)
    tracked(d, (c - 210 * S, 78 * S), "III.1", font("mono", 20 * S), ACCENT + (255,), 0.14)
    d.rectangle([c - 140 * S, 56 * S, c - 139 * S, 112 * S], fill=INK + (120,))
    d.text((c - 120 * S, 82 * S), "Planisphere", font=font("display", 44 * S), fill=INK + (255,), anchor="lm")
    tracked(d, (c - 120 * S, 114 * S), "LISTIC · 45° 54′ N", font("mono", 15 * S), INK3 + (255,), 0.14)
    d.text((c, W - 18 * S), "Epoch MMXXVI", font=font("text-i", 28 * S), fill=INK3 + (255,), anchor="mm")
    im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im.convert("RGBA"))
