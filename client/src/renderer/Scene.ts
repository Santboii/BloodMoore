import * as THREE from 'three';

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  private animFrameId = 0;
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _worldTarget = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a12);

    // Isometric camera: orthographic + 45° yaw + 35.26° pitch
    const aspect = window.innerWidth / window.innerHeight;
    const frustum = 500;
    this.camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect,
      frustum, -frustum,
      0.1, 2000,
    );
    this.camera.position.set(600, 600, 600);
    this.camera.lookAt(400, 0, 400); // center of arena

    // Ambient + directional light
    this.scene.add(new THREE.AmbientLight(0x444466, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(200, 400, 100);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const frustum = 500;
    this.camera.left = -frustum * aspect;
    this.camera.right = frustum * aspect;
    this.camera.top = frustum;
    this.camera.bottom = -frustum;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  startRenderLoop(onFrame: () => void): void {
    if (this.animFrameId !== 0) return;
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      onFrame();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stopRenderLoop(): void {
    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = 0;
  }

  /** Convert screen mouse position to world XZ coordinates */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    this._raycaster.ray.intersectPlane(this._groundPlane, this._worldTarget);
    return { x: this._worldTarget.x, y: this._worldTarget.z };
  }

  dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
