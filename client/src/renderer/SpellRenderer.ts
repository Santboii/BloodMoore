import * as THREE from 'three';
import { GameState } from '@arena/shared';

export class SpellRenderer {
  private fireballs = new Map<string, THREE.Mesh>();
  private fireWalls = new Map<string, THREE.Group>();
  private meteors = new Map<string, THREE.Mesh>(); // warning indicators

  constructor(private scene: THREE.Scene) {}

  update(state: GameState): void {
    this.syncFireballs(state);
    this.syncFireWalls(state);
    this.syncMeteors(state);
  }

  private syncFireballs(state: GameState): void {
    const activeIds = new Set(state.projectiles.map(p => p.id));

    for (const [id, mesh] of this.fireballs) {
      if (!activeIds.has(id)) { this.scene.remove(mesh); this.fireballs.delete(id); }
    }

    for (const fb of state.projectiles) {
      if (!this.fireballs.has(fb.id)) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(8, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff6600 }),
        );
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(14, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.25 }),
        );
        mesh.add(glow);
        this.scene.add(mesh);
        this.fireballs.set(fb.id, mesh);
      }
      const mesh = this.fireballs.get(fb.id)!;
      mesh.position.set(fb.position.x, 30, fb.position.y);
    }
  }

  private syncFireWalls(state: GameState): void {
    const activeIds = new Set(state.fireWalls.map(f => f.id));

    for (const [id, group] of this.fireWalls) {
      if (!activeIds.has(id)) { this.scene.remove(group); this.fireWalls.delete(id); }
    }

    for (const fw of state.fireWalls) {
      if (!this.fireWalls.has(fw.id)) {
        const group = new THREE.Group();
        for (const seg of fw.segments) {
          const dx = seg.x2 - seg.x1;
          const dy = seg.y2 - seg.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(len, 30),
            new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
          );
          plane.rotation.x = -Math.PI / 2;
          plane.rotation.z = Math.atan2(dy, dx);
          plane.position.set(mid.x, 15, mid.y);
          group.add(plane);
        }
        this.scene.add(group);
        this.fireWalls.set(fw.id, group);
      }
    }
  }

  private syncMeteors(state: GameState): void {
    const activeIds = new Set(state.meteors.map(m => m.id));

    for (const [id, mesh] of this.meteors) {
      if (!activeIds.has(id)) { this.scene.remove(mesh); this.meteors.delete(id); }
    }

    for (const meteor of state.meteors) {
      if (!this.meteors.has(meteor.id)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(50, 58, 32),
          new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(meteor.target.x, 2, meteor.target.y);
        this.scene.add(ring);
        this.meteors.set(meteor.id, ring);
      }
    }
  }

  dispose(): void {
    for (const mesh of this.fireballs.values()) this.scene.remove(mesh);
    for (const group of this.fireWalls.values()) this.scene.remove(group);
    for (const mesh of this.meteors.values()) this.scene.remove(mesh);
    this.fireballs.clear();
    this.fireWalls.clear();
    this.meteors.clear();
  }
}
