// client/src/renderer/CharacterMesh.ts
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterAnimator } from './CharacterAnimator';

const TARGET_HEIGHT = 50; // world units tall

export class CharacterMesh {
  readonly group = new THREE.Group();
  private animator: CharacterAnimator;
  private nameLabel: HTMLDivElement;
  private prevX = 0;
  private prevZ = 0;
  private velocityMag = 0;
  private smoothVel = 0;
  private smoothVelX = 0;
  private smoothVelZ = 0;

  constructor(gltf: GLTF, color: number, displayName: string, labelContainer: HTMLElement) {
    // warrior.glb and mage.glb are loaded as separate instances — no clone needed.
    const model = gltf.scene;

    // Reset scale so setFromObject measures the native model, not a previously-
    // scaled instance. The gltf.scene is reused across CharacterMesh instances
    // (e.g. on rejoin), and leftover scale would make the new mesh giant.
    model.scale.setScalar(1);

    // Auto-scale to TARGET_HEIGHT
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    const scale = TARGET_HEIGHT / Math.max(height, 0.001);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;

    model.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      // SkinnedMesh deforms beyond its rest-pose bounding sphere at runtime.
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const src of mats) {
        const mat = src as THREE.MeshStandardMaterial;
        mat.color.lerp(new THREE.Color(color), 0.3);
        mat.emissive.setHex(color);
        mat.emissiveIntensity = 0.12;
        mat.needsUpdate = true;
      }
      mesh.castShadow = true;
    });

    this.group.add(model);

    // Glow ring on ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 18, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1;
    this.group.add(ring);

    // DOM name label
    this.nameLabel = document.createElement('div');
    this.nameLabel.style.cssText = `
      position:absolute; pointer-events:none; font-size:12px; color:#fff;
      text-shadow:0 0 4px #000; white-space:nowrap; transform:translateX(-50%);
    `;
    this.nameLabel.textContent = displayName;
    labelContainer.appendChild(this.nameLabel);

    this.animator = new CharacterAnimator(model, gltf.animations);
  }

  setPosition(x: number, y: number, facing?: number): void {
    const dx = x - this.prevX;
    const dz = y - this.prevZ;
    // Exponential smoothing of velocity vector — filters jitter from interpolated positions.
    this.smoothVelX = this.smoothVelX * 0.8 + dx * 0.2;
    this.smoothVelZ = this.smoothVelZ * 0.8 + dz * 0.2;
    const smoothMag = Math.sqrt(this.smoothVelX * this.smoothVelX + this.smoothVelZ * this.smoothVelZ);
    const raw = Math.min(Math.sqrt(dx * dx + dz * dz) * 60, 1000);
    this.smoothVel = this.smoothVel * 0.85 + raw * 0.15;
    this.velocityMag = this.smoothVel;
    // Rotation: use smoothed velocity direction when moving (stable & responsive),
    // fall back to server facing (aim direction) when stationary.
    // Model's forward is +Z in world space, so atan2(dx, dz) directly gives rotation.y.
    if (smoothMag > 0.05) {
      this.group.rotation.y = Math.atan2(this.smoothVelX, this.smoothVelZ);
    } else if (facing !== undefined) {
      this.group.rotation.y = Math.atan2(Math.cos(facing), Math.sin(facing));
    }
    this.prevX = x;
    this.prevZ = y;
    this.group.position.set(x, 0, y);
  }

  update(delta: number, isCasting: boolean): void {
    this.animator.update(delta, this.velocityMag, isCasting);
  }

  die(): void {
    this.animator.die();
  }

  updateLabel(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    const pos = new THREE.Vector3();
    this.group.getWorldPosition(pos);
    pos.y += TARGET_HEIGHT + 10;
    pos.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const sx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top - 10;
    this.nameLabel.style.left = `${sx}px`;
    this.nameLabel.style.top = `${sy}px`;
  }

  dispose(labelContainer: HTMLElement): void {
    labelContainer.removeChild(this.nameLabel);
    this.group.removeFromParent();
  }
}
