"""
The space world's asteroids, modelled in Blender from code, one glTF.

    python tools/blender/space.py public/worlds/space.glb   # with the `bpy` module

Three asteroids: lumpy bodies with craters punched into them (a bowl, a
raised rim, pale ejecta round the young ones), dark regolith with lighter
patches. Same conventions as the other kits.
"""
import math, os, random, sys

import bpy  # first: it makes bmesh and mathutils importable when run as a module
import bmesh
from mathutils import Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import mix, scale, Part, finish, write_glb  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
OUT = os.path.abspath(argv[0] if argv else "public/worlds/space.glb")

DARK = (0.22, 0.20, 0.24)
MID = (0.40, 0.37, 0.40)
PALE = (0.66, 0.62, 0.60)


def asteroid(name, seed, stretch=(1.0, 0.8, 0.7), n_craters=9):
    rnd = random.Random(seed)
    part = Part()
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=4, radius=1.0)
    craters = []
    for _ in range(n_craters):
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        craters.append((d, rnd.uniform(0.18, 0.45), rnd.random() < 0.35))   # centre, radius, young
    off = Vector((seed * 1.7, seed * 0.3, seed * 2.1))
    verts, cols = {}, {}
    for v in tmp.verts:
        n = v.co.normalized()
        # lumpy body: two octaves of noise, then the stretch
        r = 1.0 + 0.22 * noise.noise(n * 1.3 + off) + 0.08 * noise.noise(n * 3.7 + off)
        ejecta = 0.0
        for (c, cr, young) in craters:
            dd = (n - c).length / cr
            if dd < 1.0:
                r -= 0.11 * cr * (1.0 - dd * dd) * 2.2          # the bowl
            elif dd < 1.35:
                r += 0.05 * cr * (1.0 - (dd - 1.0) / 0.35)       # the rim
            if young and dd < 2.2:
                ejecta = max(ejecta, 1.0 - dd / 2.2)
        p = Vector((n.x * stretch[0], n.y * stretch[1], n.z * stretch[2])) * r
        verts[v] = part.bm.verts.new(p)
        tone = 0.5 + 0.5 * noise.noise(n * 2.2 + off * 0.5)
        cols[v] = mix(mix(DARK, MID, tone), PALE, ejecta * 0.8)
    faces = [part.bm.faces.new([verts[v] for v in f.verts]) for f in tmp.faces]
    # paint by position: the painter sees the new vertex's coordinates
    by_pos = {tuple(round(x, 5) for x in verts[v].co): c for v, c in cols.items()}
    part.add_faces(faces, lambda co, nn: by_pos.get(tuple(round(x, 5) for x in co), MID))
    tmp.free()
    return finish(part, name, ao_ground=False, ao_strength=0.6)


bpy.ops.wm.read_factory_settings(use_empty=True)
print("space kit:")
asteroid("asteroid_a", 1, (1.0, 0.8, 0.7))
asteroid("asteroid_b", 2, (1.3, 0.7, 0.75), 12)
asteroid("asteroid_c", 3, (0.9, 0.9, 0.85), 7)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
write_glb(OUT)
print(f"wrote {OUT}: {os.path.getsize(OUT) / 1024:.0f} KB")
