import * as THREE from 'three';

const LERP_FACTOR = 8;

export class CameraController {
  private currentX: number;
  private currentZ: number;

  constructor(private camera: THREE.OrthographicCamera, startX: number, startZ: number) {
    this.currentX = startX;
    this.currentZ = startZ;
  }

  /**
   * Call each frame. Smoothly moves the isometric camera to track the player.
   * playerX/playerZ are world-space XZ coordinates of the local player.
   */
  update(playerX: number, playerZ: number, delta: number): void {
    const alpha = Math.min(1, LERP_FACTOR * delta);
    this.currentX += (playerX - this.currentX) * alpha;
    this.currentZ += (playerZ - this.currentZ) * alpha;

    // Isometric offset: camera sits 200 units "behind" and above the target on XZ
    this.camera.position.set(this.currentX + 200, 600, this.currentZ + 200);
    this.camera.lookAt(this.currentX, 0, this.currentZ);
  }
}
