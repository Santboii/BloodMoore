import * as THREE from 'three';

export class CharacterMesh {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private nameLabel: HTMLDivElement;

  constructor(color: number, displayName: string, labelContainer: HTMLElement) {
    // Body
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(12, 20, 4, 8),
      new THREE.MeshLambertMaterial({ color }),
    );
    this.body.position.y = 26;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Glow ring on ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 18, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1;
    this.group.add(ring);

    // Name label (DOM overlay)
    this.nameLabel = document.createElement('div');
    this.nameLabel.style.cssText = `
      position:absolute; pointer-events:none; font-size:12px; color:#fff;
      text-shadow:0 0 4px #000; white-space:nowrap; transform:translateX(-50%);
    `;
    this.nameLabel.textContent = displayName;
    labelContainer.appendChild(this.nameLabel);
  }

  /** Set world position (XY in game space → XZ in Three.js) */
  setPosition(x: number, y: number): void {
    this.group.position.set(x, 0, y);
  }

  /** Update label screen position. Call after render. */
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
