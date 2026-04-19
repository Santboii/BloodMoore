// client/src/renderer/Arena.ts
import * as THREE from 'three';
import { PILLARS, ARENA_SIZE } from '@arena/shared';
import type { TextureSet } from './AssetLoader';

const PILLAR_H = 80;

function tiledPBR(tex: TextureSet, repeatU: number, repeatV: number): THREE.MeshStandardMaterial {
  const apply = (t: THREE.Texture) => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeatU, repeatV);
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: apply(tex.map),
    normalMap: apply(tex.normalMap),
    roughnessMap: apply(tex.roughnessMap),
    roughness: 1,
    metalness: 0,
  });
}

export class Arena {
  private group = new THREE.Group();

  constructor(textures: { floor: TextureSet; stone: TextureSet }) {
    this.buildFloor(textures.floor);
    this.buildBoundaryWalls(textures.stone);
    this.buildPillars(textures.stone);
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  private buildFloor(tex: TextureSet): void {
    const repeat = ARENA_SIZE / 200; // one tile per 200 world units
    const mat = tiledPBR(tex, repeat, repeat);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ARENA_SIZE / 2, 0, ARENA_SIZE / 2);
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  private buildBoundaryWalls(tex: TextureSet): void {
    const wallH = 60;
    const positions: [number, number, number, number][] = [
      [ARENA_SIZE / 2, -10,            ARENA_SIZE + 40, 20],
      [ARENA_SIZE / 2, ARENA_SIZE + 10, ARENA_SIZE + 40, 20],
      [-10,            ARENA_SIZE / 2,  20,              ARENA_SIZE],
      [ARENA_SIZE + 10, ARENA_SIZE / 2, 20,              ARENA_SIZE],
    ];
    for (const [x, z, w, d] of positions) {
      const mat = tiledPBR(tex, w / 200, wallH / 200);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat);
      mesh.position.set(x, wallH / 2, z);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  private buildPillars(tex: TextureSet): void {
    const capMat = new THREE.MeshStandardMaterial({ color: 0x6a6aaa, roughness: 0.7, metalness: 0.1 });

    for (const p of PILLARS) {
      const size = p.halfSize * 2;
      const pillarMat = tiledPBR(tex, size / 200, PILLAR_H / 200);

      const body = new THREE.Mesh(new THREE.BoxGeometry(size, PILLAR_H, size), pillarMat);
      body.position.set(p.x, PILLAR_H / 2, p.y);
      body.castShadow = true;
      body.receiveShadow = true;
      this.group.add(body);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(size + 6, 8, size + 6), capMat);
      cap.position.set(p.x, PILLAR_H + 4, p.y);
      this.group.add(cap);

      // Torch PointLight above each pillar cap
      const torch = new THREE.PointLight(0xff6600, 3, 450, 2);
      torch.position.set(p.x, PILLAR_H + 60, p.y);
      this.group.add(torch);
    }
  }
}
