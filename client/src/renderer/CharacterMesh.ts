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

  constructor(gltf: GLTF, color: number, displayName: string, labelContainer: HTMLElement) {
    const model = gltf.scene.clone(true);

    // Auto-scale to TARGET_HEIGHT
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    const scale = TARGET_HEIGHT / Math.max(height, 0.001);
    model.scale.setScalar(scale);
    // Shift so feet sit at y=0
    model.position.y = -box.min.y * scale;

    // Blend a tint color over the model's existing materials
    model.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const mat = (src as THREE.MeshStandardMaterial).clone();
      mat.color.lerp(new THREE.Color(color), 0.4);
      mesh.material = mat;
      mesh.castShadow = true;
    });

    this.group.add(model);

    // Glow ring on ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 18, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
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

  setPosition(x: number, y: number): void {
    const dx = x - this.prevX;
    const dz = y - this.prevZ;
    // Velocity in approx world units/sec (assumes ~60fps; capped to avoid spike on first frame)
    this.velocityMag = Math.min(Math.sqrt(dx * dx + dz * dz) * 60, 1000);
    this.prevX = x;
    this.prevZ = y;
    this.group.position.set(x, 0, y);
  }

  update(delta: number, isCasting: boolean): void {
    this.animator.update(delta, this.velocityMag, isCasting);
  }

  updateLabel(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
    const pos = new THREE.Vector3();
    this.group.getWorldPosition(pos);
    pos.y += 70;
    pos.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const sx = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
    const sy = (-pos.y * 0.5 + 0.5) * rect.height + rect.top - 10;
    this.nameLabel.style.left = `${sx}px`;
    this.nameLabel.style.top = `${sy}px`;
  }

  dispose(labelContainer: HTMLElement): void {
    labelContainer.removeChild(this.nameLabel);
  }
}
