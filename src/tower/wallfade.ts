import * as THREE from 'three';

/* Walls that stand between the eye and a room dissolve.

   Each room is open on the side the camera normally approaches from, with
   its wall running round the rest. Turn the tower, or let the whole-tower
   view drift round, and that wall comes between you and the room. So the
   walls fade by where they are: a wall on the camera's side of the tower's
   axis dissolves with a dither (it stays in the opaque pass, keeps its
   depth, and at this pixel scale the stipple reads as of a piece with the
   rest — the same screen door the worlds use for trees in front of the
   tower), and a wall on the far side, behind the room, stays solid.

   Only the wall meshes are touched: they get their own copy of whichever
   shared material they used, so the furniture in the same stone or wood is
   unaffected. One copy per material, and one shader program for them all. */

const WALL_NAMES = new Set(['wall_panel', 'wall_panel_cap', 'wall_trim']);

export function fadeWalls(root: THREE.Object3D, axis: THREE.Vector3) {
  const uAxis = { value: new THREE.Vector2(axis.x, axis.z) };
  const copies = new Map<THREE.Material, THREE.Material>();

  const patched = (base: THREE.Material) => {
    let m = copies.get(base);
    if (m) return m;
    m = base.clone();
    const prev = base.onBeforeCompile;
    m.onBeforeCompile = (s, r) => {
      prev?.call(base, s, r);
      s.uniforms.uWallAxis = uAxis;
      s.vertexShader = 'varying vec3 vWallWP;\n' + s.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWallWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = 'varying vec3 vWallWP;\nuniform vec2 uWallAxis;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        {
          // which side of the tower's axis this piece of wall is on, against
          // which side the eye is on: 1 = squarely between eye and room
          vec2 toWall = vWallWP.xz - uWallAxis;
          vec2 toEye = cameraPosition.xz - uWallAxis;
          float facing = dot(normalize(toWall), normalize(toEye));
          // only from outside the wall's ring (a camera inside a room keeps it)
          float outside = smoothstep(5.0, 7.0, length(toEye));
          float fade = smoothstep(0.05, 0.5, facing) * outside * 0.9;
          // 4x4 ordered (Bayer) dither
          const float B[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          int bx = int(mod(gl_FragCoord.x, 4.0)), by = int(mod(gl_FragCoord.y, 4.0));
          float bayer = (B[by * 4 + bx] + 0.5) / 16.0;
          if (fade > 0.002 && bayer < fade) discard;
        }`);
    };
    m.customProgramCacheKey = () => (base.customProgramCacheKey?.() ?? '') + '|wallfade';
    copies.set(base, m);
    return m;
  };

  root.traverse((o: any) => {
    if (!o.isMesh || !WALL_NAMES.has(o.name)) return;
    o.material = Array.isArray(o.material) ? o.material.map(patched) : patched(o.material);
  });
  return { setAxis: (p: THREE.Vector3) => uAxis.value.set(p.x, p.z) };
}
