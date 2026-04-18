import * as THREE from 'three';
import { PILLARS, ARENA_SIZE } from '@arena/shared';

export class Arena {
  private group = new THREE.Group();

  constructor() {
    this.buildFloor();
    this.buildBoundaryWalls();
    this.buildPillars();
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  private buildFloor(): void {
    const geo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 16, 16);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ARENA_SIZE / 2, 0, ARENA_SIZE / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Grid lines
    const grid = new THREE.GridHelper(ARENA_SIZE, 20, 0x3a3a5a, 0x3a3a5a);
    grid.position.set(ARENA_SIZE / 2, 0.5, ARENA_SIZE / 2);
    this.group.add(grid);
  }

  private buildBoundaryWalls(): void {
    const wallH = 60;
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const positions: [number, number, number, number][] = [
      // [x, z, width, depth]
      [ARENA_SIZE / 2, -10, ARENA_SIZE + 40, 20],
      [ARENA_SIZE / 2, ARENA_SIZE + 10, ARENA_SIZE + 40, 20],
      [-10, ARENA_SIZE / 2, 20, ARENA_SIZE],
      [ARENA_SIZE + 10, ARENA_SIZE / 2, 20, ARENA_SIZE],
    ];
    for (const [x, z, w, d] of positions) {
      const geo = new THREE.BoxGeometry(w, wallH, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, wallH / 2, z);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  private buildPillars(): void {
    const pillarH = 80;
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x4a4a7a });
    const capMat = new THREE.MeshLambertMaterial({ color: 0x6a6aaa });

    for (const p of PILLARS) {
      const size = p.halfSize * 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(size, pillarH, size), pillarMat);
      body.position.set(p.x, pillarH / 2, p.y);
      body.castShadow = true;
      body.receiveShadow = true;
      this.group.add(body);

      // Cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(size + 6, 8, size + 6), capMat);
      cap.position.set(p.x, pillarH + 4, p.y);
      this.group.add(cap);
    }
  }
}
