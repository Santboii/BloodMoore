import * as THREE from 'three';
import { GameState, METEOR_DELAY_TICKS } from '@arena/shared';
import { ParticleSystem } from './ParticleSystem';
import { TeleportEffect } from './TeleportEffect';

type MeteorEntry = { ring: THREE.Mesh; rock: THREE.Mesh; target: { x: number; y: number }; spawnTime: number };

export class SpellRenderer {
  private fireballs = new Map<string, THREE.Mesh>();
  private fireWalls = new Map<string, THREE.Group>();
  private meteors = new Map<string, MeteorEntry>();
  private particles: ParticleSystem;
  private prevFireballPositions = new Map<string, { x: number; y: number; z: number }>();
  private clock = new THREE.Clock();
  private elapsedTime = 0;
  private teleportEffects: TeleportEffect[] = [];

  constructor(private scene: THREE.Scene, private myId: string) {
    this.particles = new ParticleSystem(scene);
  }

  private detectTeleports(state: GameState): void {
    for (const player of Object.values(state.players)) {
      if (player.teleported) {
        this.teleportEffects.push(new TeleportEffect(this.scene, player.teleported.x, player.teleported.y, this.particles));
        this.teleportEffects.push(new TeleportEffect(this.scene, player.position.x, player.position.y, this.particles));
      }
    }
  }

  update(state: GameState): void {
    const delta = this.clock.getDelta();
    this.elapsedTime += delta;
    this.detectTeleports(state);
    this.syncFireballs(state);
    this.syncFireWalls(state);
    this.syncMeteors(state);
    this.particles.update(delta);

    for (let i = this.teleportEffects.length - 1; i >= 0; i--) {
      this.teleportEffects[i].update(delta);
      if (this.teleportEffects[i].done) {
        this.teleportEffects.splice(i, 1);
      }
    }
  }

  private syncFireballs(state: GameState): void {
    const activeIds = new Set(state.projectiles.map(p => p.id));

    for (const [id, mesh] of this.fireballs) {
      if (!activeIds.has(id)) {
        const last = this.prevFireballPositions.get(id);
        if (last) this.particles.emitExplosion(last.x, last.y, last.z);
        this.scene.remove(mesh);
        this.fireballs.delete(id);
        this.prevFireballPositions.delete(id);
      }
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
      const wx = fb.position.x;
      const wy = 30;
      const wz = fb.position.y;
      mesh.position.set(wx, wy, wz);

      const prev = this.prevFireballPositions.get(fb.id);
      let dirX = 0, dirZ = 0;
      if (prev) {
        const dx = wx - prev.x;
        const dz = wz - prev.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0) { dirX = dx / len; dirZ = dz / len; }
      }
      this.particles.emitTrail(wx, wy, wz, dirX, dirZ);
      this.prevFireballPositions.set(fb.id, { x: wx, y: wy, z: wz });
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
        if (fw.shape === 'circle' && fw.center && fw.radius) {
          const disc = new THREE.Mesh(
            new THREE.CircleGeometry(fw.radius, 32),
            new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),
          );
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(fw.center.x, 1, fw.center.y);
          group.add(disc);
        } else {
          for (const seg of fw.segments) {
            const points = [
              new THREE.Vector3(seg.x1, 1, seg.y1),
              new THREE.Vector3(seg.x2, 1, seg.y2),
            ];
            const line = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(points),
              new THREE.LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4 }),
            );
            group.add(line);
          }
        }
        this.scene.add(group);
        this.fireWalls.set(fw.id, group);
      }

      if (fw.shape === 'circle' && fw.center && fw.radius) {
        this.particles.emitCrater(fw.center.x, fw.center.y, fw.radius);
      } else {
        this.particles.emitWall(fw.segments);
      }
    }
  }

  private syncMeteors(state: GameState): void {
    const activeIds = new Set(state.meteors.map(m => m.id));

    for (const [id, entry] of this.meteors) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.ring);
        this.scene.remove(entry.rock);
        this.particles.emitMeteorImpact(entry.target.x, 0, entry.target.y);
        this.meteors.delete(id);
      }
    }

    for (const meteor of state.meteors) {
      if (!this.meteors.has(meteor.id)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(50, 58, 32),
          new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(meteor.target.x, 2, meteor.target.y);

        const rock = new THREE.Mesh(
          new THREE.SphereGeometry(25, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xff4400 }),
        );

        this.scene.add(ring);
        this.scene.add(rock);
        this.meteors.set(meteor.id, { ring, rock, target: { ...meteor.target }, spawnTime: this.elapsedTime });
      }

      const entry = this.meteors.get(meteor.id)!;
      const visible = !meteor.hidden || meteor.ownerId === this.myId;
      entry.ring.visible = visible;
      entry.rock.visible = visible;
      const t = Math.max(0, Math.min(1, 1 - (meteor.strikeAt - state.tick) / METEOR_DELAY_TICKS));

      const scale = 1.0 - t * 0.4;
      entry.ring.scale.setScalar(scale);
      const localTime = this.elapsedTime - entry.spawnTime;
      const pulseFreq = 0.5 + t * 2; // 0.5Hz → 2.5Hz
      (entry.ring.material as THREE.MeshBasicMaterial).opacity =
        Math.sin(localTime * pulseFreq * Math.PI * 2) * 0.3 + 0.5;

      // Animate rock: fall from y=500 to y=0
      const rockY = 500 * (1 - t);
      entry.rock.position.set(meteor.target.x, rockY, meteor.target.y);
      const rockScale = 0.4 + t * 0.6;
      entry.rock.scale.setScalar(rockScale);

      // Emit trail while falling
      this.particles.emitMeteorTrail(meteor.target.x, rockY, meteor.target.y);
    }
  }

  dispose(): void {
    for (const mesh of this.fireballs.values()) this.scene.remove(mesh);
    for (const group of this.fireWalls.values()) this.scene.remove(group);
    for (const entry of this.meteors.values()) {
      this.scene.remove(entry.ring);
      this.scene.remove(entry.rock);
    }
    for (const effect of this.teleportEffects) effect.dispose();
    this.fireballs.clear();
    this.fireWalls.clear();
    this.meteors.clear();
    this.teleportEffects.length = 0;
    this.particles.dispose();
  }
}
