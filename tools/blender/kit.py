"""
Shared pieces of the Blender kits (forest.py, seafloor.py): colour helpers,
a tube/blob/AO mesh builder, alpha-cut cards with volume normals, and a
quantized glTF writer. Run as a module from a kit script, which must put
this directory on sys.path first (each kit script does).
"""
import math, random

import bpy  # first: it makes bmesh and mathutils importable when run as a module
import bmesh
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

AO_RAYS = 40            # rays per vertex for the baked occlusion
AO_REACH = 6.0          # metres a ray looks for an occluder
WHITE = (1.0, 1.0, 1.0)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scale(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in c)


# ------------------------------------------------------------ mesh helpers
class Part:
    """Geometry being assembled for one object, with a paint function per
    batch of faces: paint(co, normal) -> rgb."""

    def __init__(self):
        self.bm = bmesh.new()
        self.paint = {}      # face index -> painter

    def add_faces(self, faces, painter):
        for f in faces:
            self.paint[f] = painter


def tube(part, pts, radii, sides, painter, cap_end=False, twist=0.0):
    """A tapered tube through `pts`, one ring per point."""
    bm = part.bm
    rings = []
    for i, (p, r) in enumerate(zip(pts, radii)):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        # a frame perpendicular to the path
        up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
        u = d.cross(up).normalized()
        v = d.cross(u).normalized()
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides + twist * i
            # bark is not round: a little noise in the radius
            rr = r * (1.0 + 0.12 * noise.noise(p * 0.9 + Vector((k, 0, 0))))
            ring.append(bm.verts.new(p + (u * math.cos(a) + v * math.sin(a)) * rr))
        rings.append(ring)
    faces = []
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            faces.append(bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])))
    if cap_end:
        faces.append(bm.faces.new(list(reversed(rings[-1]))))
    part.add_faces(faces, painter)
    return rings


def blob(part, center, size, painter, subdiv=2, rough=0.22, seed=0.0, flatten=0.8):
    """A displaced icosphere: the unit of foliage and of stone. bmesh counts
    subdivisions from 1 = the bare icosahedron (20 faces); 2 is 80 faces."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=1.0)
    c = Vector(center)
    sx, sy, sz = size
    verts = {}
    for v in tmp.verts:
        n = v.co.normalized()
        d = 1.0 + rough * noise.noise(n * 1.7 + Vector((seed, seed * 0.7, seed * 1.3)))
        p = Vector((n.x * sx * d, n.y * sy * d, n.z * sz * d))
        if p.z < 0:
            p.z *= flatten          # clumps sag flatter underneath
        verts[v] = part.bm.verts.new(c + p)
    faces = [part.bm.faces.new([verts[v] for v in f.verts]) for f in tmp.faces]
    tmp.free()
    part.add_faces(faces, painter)
    return faces


def finish(part, name, ao_ground=True, ao_strength=0.7):
    """Paint every vertex (average of its faces' painters, times baked AO)
    and turn the bmesh into an object."""
    bm = part.bm
    bm.verts.index_update()
    bm.faces.index_update()
    bm.normal_update()
    # painter per vertex: the first face that claims it (parts don't share verts)
    painter_of = {}
    for f, p in part.paint.items():
        for v in f.verts:
            painter_of.setdefault(v.index, p)

    # occlusion: rays against the object itself, and the ground plane
    tree = BVHTree.FromBMesh(bm)
    rnd = random.Random(7)
    dirs = []
    for _ in range(AO_RAYS):      # cosine-weighted hemisphere around +Z
        u, w = rnd.random(), rnd.random()
        r, a = math.sqrt(u), 2 * math.pi * w
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))

    cols = {}
    for v in bm.verts:
        n = v.normal if v.normal.length > 0 else Vector((0, 0, 1))
        # rotate the hemisphere onto the normal
        q = Vector((0, 0, 1)).rotation_difference(n)
        o = v.co + n * 0.03
        hit = 0
        for d in dirs:
            dd = q @ d
            if tree.ray_cast(o, dd, AO_REACH)[0] is not None:
                hit += 1
            elif ao_ground and dd.z < 0 and o.z > 0:
                # the ground at z = 0 stops a downward ray within reach
                t = -o.z / dd.z
                if t < AO_REACH:
                    hit += 1
        ao = 1.0 - ao_strength * (hit / len(dirs))
        base = painter_of.get(v.index, lambda co, nn: WHITE)(v.co, n)
        cols[v.index] = scale(base, ao)

    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    for i, c in cols.items():
        attr.data[i].color = (*c, 1.0)
    me.color_attributes.active_color = attr
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    print(f"  {name}: {len(me.polygons)} faces, {len(me.vertices)} verts")
    return obj


class Cards:
    """Foliage as cards: small alpha-cut quads with a leaf texture, grouped
    into clusters. Each card's normal is bent toward the outside of its
    crown, so the crown lights as one soft volume instead of as facets —
    the standard trick for stylized trees. Cards carry UVs into a 2x2 atlas
    the page draws at runtime, and a vertex colour (tint and shade)."""

    def __init__(self):
        self.co, self.nor, self.uv, self.col, self.faces = [], [], [], [], []

    def card(self, centre, size, crown, crown_r, colour, rnd, droop=0.0):
        c = Vector(centre)
        # a random orientation, mostly facing outward from the crown
        out = (c - crown).normalized() if (c - crown).length > 1e-3 else Vector((0, 0, 1))
        rand = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized()
        n = (out * 0.6 + rand * 0.8).normalized()
        u = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.95 else Vector((1, 0, 0))).normalized()
        v = n.cross(u).normalized()
        # spin the card in its own plane
        ang = rnd.uniform(0, math.tau)
        u, v = u * math.cos(ang) + v * math.sin(ang), -u * math.sin(ang) + v * math.cos(ang)
        h = size * 0.5
        cell = rnd.randrange(4)
        cu, cv = (cell % 2) * 0.5, (cell // 2) * 0.5
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        base = len(self.co)
        for (x, y) in corners:
            p = c + u * (x * h) + v * (y * h)
            p.z -= droop * (y + 1) * 0.5 * size
            self.co.append(p)
            # the lighting normal: mostly the crown's sphere, a little the card
            sph = (p - crown) / max(crown_r, 1e-3)
            self.nor.append((sph.normalized() * 0.82 + n * 0.18).normalized())
            self.uv.append((cu + (x + 1) * 0.25, cv + (y + 1) * 0.25))
            # deeper inside the crown is darker: cheap occlusion
            depth = min(1.0, (p - crown).length / max(crown_r, 1e-3))
            self.col.append(scale(colour, 0.55 + 0.45 * depth))
        self.faces.append((base, base + 1, base + 2, base + 3))

    def cluster(self, centre, radii, count, size, crown, crown_r, paint, rnd, droop=0.0):
        """Cards spread through an ellipsoid, thicker near its skin."""
        c = Vector(centre)
        for _ in range(count):
            d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
            r = rnd.uniform(0.45, 1.0) ** 0.6
            p = c + Vector((d.x * radii[0], d.y * radii[1], d.z * radii[2])) * r
            self.card(p, size * rnd.uniform(0.75, 1.2), crown, crown_r, paint(p), rnd, droop)

    def finish(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.co], [], self.faces)
        me.update()
        uvl = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                uvl.data[li].uv = self.uv[me.loops[li].vertex_index]
        attr = me.color_attributes.new("Col", "BYTE_COLOR", "POINT")
        for i, c in enumerate(self.col):
            attr.data[i].color = (*c, 1.0)
        me.color_attributes.active_color = attr
        me.normals_split_custom_set_from_vertices([tuple(n) for n in self.nor])
        obj = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(obj)
        print(f"  {name}: {len(self.faces)} cards")
        return obj


def write_glb(path):
    """Write every mesh as a quantized glTF (KHR_mesh_quantization): 16-bit
    positions dequantized by the node's scale and translation, 8-bit
    normals, UVs and colours, 16-bit indices. About a quarter of what the
    stock exporter writes in 32-bit floats, and still a plain glTF that
    Blender and any viewer open — no decoder needed at runtime.
    Blender is Z up, glTF Y up: (x, y, z) -> (x, z, -y)."""
    import json, struct
    bin_, views, accessors, meshes, nodes = bytearray(), [], [], [], []

    def view(data, stride=None, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        v = {"buffer": 0, "byteOffset": len(bin_), "byteLength": len(data)}
        if stride:
            v["byteStride"] = stride
        if target:
            v["target"] = target
        bin_.extend(data)
        views.append(v)
        return len(views) - 1

    def accessor(vi, ctype, count, typ, normalized=False, mn=None, mx=None):
        a = {"bufferView": vi, "componentType": ctype, "count": count, "type": typ}
        if normalized:
            a["normalized"] = True
        if mn is not None:
            a["min"], a["max"] = mn, mx
        accessors.append(a)
        return len(accessors) - 1

    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        me = obj.data
        me.calc_loop_triangles()
        n = len(me.vertices)
        P = [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]
        lo = [min(p[i] for p in P) for i in range(3)]
        hi = [max(p[i] for p in P) for i in range(3)]
        sc = [max((hi[i] - lo[i]) / 2, 1e-6) for i in range(3)]
        mid = [(hi[i] + lo[i]) / 2 for i in range(3)]
        q = bytearray()
        for p in P:
            q += struct.pack("<hhhh", *[round((p[i] - mid[i]) / sc[i] * 32767) for i in range(3)], 0)
        attrs = {"POSITION": accessor(view(q, 8, 34962), 5122, n, "VEC3", True, [-1, -1, -1], [1, 1, 1])}

        if me.has_custom_normals:
            acc = [[0.0, 0.0, 0.0] for _ in range(n)]
            for li, l in enumerate(me.loops):
                cn = me.corner_normals[li].vector
                a_ = acc[l.vertex_index]
                a_[0] += cn.x; a_[1] += cn.z; a_[2] -= cn.y
            nb = bytearray()
            for a_ in acc:
                ln = math.sqrt(sum(c * c for c in a_)) or 1.0
                nb += struct.pack("<bbbb", *[round(c / ln * 127) for c in a_], 0)
            attrs["NORMAL"] = accessor(view(nb, 4, 34962), 5120, n, "VEC3", True)

        if me.uv_layers:
            uv = [(0.0, 0.0)] * n
            for li, l in enumerate(me.loops):
                u = me.uv_layers[0].data[li].uv
                uv[l.vertex_index] = (u.x, 1.0 - u.y)
            ub = bytearray()
            for u in uv:
                ub += struct.pack("<BBBB", round(u[0] * 255), round(u[1] * 255), 0, 0)
            attrs["TEXCOORD_0"] = accessor(view(ub, 4, 34962), 5121, n, "VEC2", True)

        if me.color_attributes:
            ca = me.color_attributes.active_color or me.color_attributes[0]
            cb = bytearray()
            for i in range(n):
                c = ca.data[i].color
                cb += struct.pack("<BBBB", *[round(max(0, min(1, x)) * 255) for x in c[:3]], 255)
            attrs["COLOR_0"] = accessor(view(cb, 4, 34962), 5121, n, "VEC4", True)

        ib = bytearray()
        for t in me.loop_triangles:
            ib += struct.pack("<HHH", *t.vertices)
        idx = accessor(view(ib, None, 34963), 5123, len(me.loop_triangles) * 3, "SCALAR")
        meshes.append({"name": obj.name, "primitives": [{"attributes": attrs, "indices": idx}]})
        nodes.append({"name": obj.name, "mesh": len(meshes) - 1, "translation": mid, "scale": sc})

    gltf = {
        "asset": {"version": "2.0", "generator": "tools/blender/forest.py"},
        "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(bin_)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    while len(bin_) % 4:
        bin_.append(0)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(bin_), 0x004E4942) + bytes(bin_))


