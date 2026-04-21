import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem';

const LIGHTNING_DURATION = 0.08;
const LIGHT_DURATION = 0.12;
const RING_DURATION = 0.15;
const TOTAL_DURATION = 0.2;
const RING_MAX_RADIUS = 60;
const LIGHTNING_COUNT_MIN = 8;
const LIGHTNING_COUNT_MAX = 12;

const ringGeometry = new THREE.TorusGeometry(1, 0.3, 4, 32);

export class TeleportEffect {
  done = false;
  private elapsed = 0;
  private lightningLines: THREE.LineSegments[] = [];
  private ringMesh: THREE.Mesh;
  private pointLight: THREE.PointLight;
  private lightningDisposed = false;
  private lightDisposed = false;
  private ringDisposed = false;

  constructor(
    private scene: THREE.Scene,
    x: number,
    z: number,
    particles: ParticleSystem,
  ) {
    const y = 2;

    particles.emitTeleportSparks(x, y, z);

    const count = LIGHTNING_COUNT_MIN + Math.floor(Math.random() * (LIGHTNING_COUNT_MAX - LIGHTNING_COUNT_MIN + 1));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const length = 30 + Math.random() * 40;
      const midLen = length * (0.3 + Math.random() * 0.4);
      const fork = (Math.random() - 0.5) * 20;

      const points = [
        new THREE.Vector3(x, y + Math.random() * 10, z),
        new THREE.Vector3(
          x + Math.cos(angle) * midLen + fork,
          y + 5 + Math.random() * 15,
          z + Math.sin(angle) * midLen + fork,
        ),
        new THREE.Vector3(
          x + Math.cos(angle) * length,
          y + Math.random() * 8,
          z + Math.sin(angle) * length,
        ),
      ];

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.LineSegments(geometry, material);
      this.scene.add(line);
      this.lightningLines.push(line);
    }

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    this.ringMesh = new THREE.Mesh(ringGeometry, ringMat);
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.set(x, 1, z);
    this.ringMesh.scale.setScalar(0.01);
    this.scene.add(this.ringMesh);

    this.pointLight = new THREE.PointLight(0xffeebb, 2, 200);
    this.pointLight.position.set(x, 30, z);
    this.scene.add(this.pointLight);
  }

  update(delta: number): void {
    if (this.done) return;
    this.elapsed += delta;

    if (!this.lightningDisposed && this.elapsed >= LIGHTNING_DURATION) {
      for (const line of this.lightningLines) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.LineBasicMaterial).dispose();
      }
      this.lightningLines.length = 0;
      this.lightningDisposed = true;
    }

    if (!this.lightDisposed) {
      if (this.elapsed >= LIGHT_DURATION) {
        this.scene.remove(this.pointLight);
        this.pointLight.dispose();
        this.lightDisposed = true;
      } else {
        this.pointLight.intensity = 2 * (1 - this.elapsed / LIGHT_DURATION);
      }
    }

    if (!this.ringDisposed) {
      if (this.elapsed >= RING_DURATION) {
        this.scene.remove(this.ringMesh);
        (this.ringMesh.material as THREE.MeshBasicMaterial).dispose();
        this.ringDisposed = true;
      } else {
        const t = this.elapsed / RING_DURATION;
        this.ringMesh.scale.setScalar(RING_MAX_RADIUS * t);
        (this.ringMesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
      }
    }

    if (this.elapsed >= TOTAL_DURATION) {
      this.done = true;
    }
  }

  dispose(): void {
    if (!this.lightningDisposed) {
      for (const line of this.lightningLines) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.LineBasicMaterial).dispose();
      }
      this.lightningLines.length = 0;
    }
    if (!this.lightDisposed) {
      this.scene.remove(this.pointLight);
      this.pointLight.dispose();
    }
    if (!this.ringDisposed) {
      this.scene.remove(this.ringMesh);
      (this.ringMesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.done = true;
  }
}
