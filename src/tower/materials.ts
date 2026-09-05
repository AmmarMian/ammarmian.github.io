import * as THREE from 'three';

export const M: Record<string, THREE.MeshStandardMaterial> = {};

export function mat(name: string, color: string, o: Record<string, any> = {}) {
  M[name] = new THREE.MeshStandardMaterial({ name, color, roughness: 0.88, metalness: 0.05, ...o });
  return M[name];
}

mat('plank_warm', '#c98a45');
mat('plank_warm_mid', '#b3762f');
mat('plank_oak', '#a5712f');
mat('plank_oak_dark', '#8a5b26');
mat('plank_ash', '#9b8767');
mat('plank_ash_dark', '#7f6c50');
mat('wood_mid', '#8a5a2f');
mat('wood_dark', '#6b4325');
mat('wood_deep', '#472b17');
mat('wood_ebony', '#33200f');
mat('stone', '#4a4340');
mat('stone_light', '#6b625c');
mat('stone_warm', '#6d5f50');
mat('cloth_red', '#b5352a');
mat('cloth_red_dark', '#8b2419');
mat('cloth_purple', '#63398c');
mat('robe_deep', '#452a70');
mat('tapestry', '#7a2f3a');
mat('linen', '#c9b899');
mat('rug', '#cdbb95');
mat('rug_ink', '#7a5330');
mat('paper', '#e0d4b4');
mat('leaf', '#2f6b39');
mat('leaf_dark', '#20492a');
mat('terracotta', '#ae4a2e');
mat('skin', '#d9a877');
mat('glass_blue', '#2f7fbf', { roughness: 0.35 });
mat('glass_green', '#2f9f6a', { roughness: 0.35 });
mat('glass_violet', '#7a4fb0', { roughness: 0.35 });
mat('glass_amber', '#c98a2f', { roughness: 0.35 });
mat('iron', '#4f4a46', { metalness: 0.35, roughness: 0.6 });
mat('cauldron', '#48544a', { metalness: 0.3, roughness: 0.55 });
mat('brew', '#5fd97a', { emissive: '#2f8f45', emissiveIntensity: 0.6, roughness: 0.3 });
mat('candle', '#efe6cf');
mat('flame', '#ffc857', { emissive: '#ff9d2f', emissiveIntensity: 1.5 });
mat('brass', '#b8912f', { metalness: 0.35, roughness: 0.45 });
mat('glow_pane', '#fff4d8', { emissive: '#ffe6ab', emissiveIntensity: 2.6 });
/* Window glass is not a lamp. It is see-through, and what it carries — tint,
   how much it glows, how much light it lets past — is written every time the
   sky outside changes. See ambience.ts; do not set these here. */
mat('window_glass', '#cfe6ff', {
  emissive: '#ffe6ab', emissiveIntensity: 0.5,
  transparent: true, opacity: 0.26, roughness: 0.12, metalness: 0,
  side: THREE.DoubleSide, depthWrite: false,
});
mat('orb', '#9fe8ff', { emissive: '#4fc8ff', emissiveIntensity: 1.6, roughness: 0.3 });
mat('portal_stone', '#6f6a72', { roughness: 0.8 });
mat('portal_rim', '#9fdcff', { emissive: '#4fb8f0', emissiveIntensity: 1.1, roughness: 0.4 });
mat('marker', '#ffe6a8', { emissive: '#ffc65a', emissiveIntensity: 1.4 });
mat('rune_glow', '#6fd0e8', { emissive: '#2f9fcf', emissiveIntensity: 0.9, roughness: 0.4 });
mat('rune_violet', '#b98ee0', { emissive: '#7a45c8', emissiveIntensity: 0.85, roughness: 0.4 });
/* Spines for the bound publications: eight buckets from the oldest record on
   the shelf to the newest, so the library reads as a timeline once you notice
   it. They live in M rather than being cloned per book — eight materials
   instead of fifty, and the pixel-mode flatShading sweep finds them. */
export const SPINE_STEPS = 8;
for (let i = 0; i < SPINE_STEPS; i++) {
  const t = i / (SPINE_STEPS - 1);
  const c = new THREE.Color().setHSL(0.58 - t * 0.52, 0.42 + t * 0.2, 0.26 + t * 0.16);
  mat('spine_' + i, '#' + c.getHexString(), { roughness: 0.82 });
}

/* A bound project's specimen: lit from within and never quite still. Kept in
   M so the pixel-mode sweep finds it, and so the ambience wash can drive its
   emissive along with every other glowing thing in the tower. */
mat('specimen', '#7fe8c0', { emissive: '#2fc08f', emissiveIntensity: 1.6, roughness: 0.28 });
mat('specimen_tag', '#e8dcb8', { roughness: 0.95 });

mat('fox_fur', '#c8622c');
mat('fox_fur_dark', '#9c4720');
mat('fox_cream', '#e8d7bd');
mat('fox_ink', '#2a1a14');

export const shaftMat = new THREE.MeshBasicMaterial({
  color: 0xffdca6, transparent: true, opacity: 0.17,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
