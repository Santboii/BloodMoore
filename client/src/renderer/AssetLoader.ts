import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export interface LoadedAssets {
  characters: { warrior: GLTF; mage: GLTF; pool: GLTF[] };
  textures: { floor: TextureSet; stone: TextureSet };
}

export class AssetLoader {
  static async load(): Promise<LoadedAssets> {
    const gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    const loadGLTF = (url: string): Promise<GLTF> =>
      new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));

    const loadTex = (url: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> =>
      new Promise((res, rej) =>
        texLoader.load(url, (t) => { t.colorSpace = colorSpace; res(t); }, undefined, rej),
      );

    const sRGB = THREE.SRGBColorSpace;
    const linear = THREE.LinearSRGBColorSpace;

    const [warrior, mage, mage2, mage3, mage4, floorDiff, floorNorm, floorRough, stoneDiff, stoneNorm, stoneRough] =
      await Promise.all([
        loadGLTF('/assets/characters/warrior.glb'),
        loadGLTF('/assets/characters/mage.glb'),
        loadGLTF('/assets/characters/mage.glb'),
        loadGLTF('/assets/characters/mage.glb'),
        loadGLTF('/assets/characters/mage.glb'),
        loadTex('/assets/textures/cobblestone/diffuse.jpg', sRGB),
        loadTex('/assets/textures/cobblestone/normal.jpg', linear),
        loadTex('/assets/textures/cobblestone/roughness.jpg', linear),
        loadTex('/assets/textures/castle_stone/diffuse.jpg', sRGB),
        loadTex('/assets/textures/castle_stone/normal.jpg', linear),
        loadTex('/assets/textures/castle_stone/roughness.jpg', linear),
      ]);

    return {
      characters: { warrior, mage, pool: [mage, mage2, mage3, mage4] },
      textures: {
        floor: { map: floorDiff, normalMap: floorNorm, roughnessMap: floorRough },
        stone: { map: stoneDiff, normalMap: stoneNorm, roughnessMap: stoneRough },
      },
    };
  }
}
