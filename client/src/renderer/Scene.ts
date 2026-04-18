import * as THREE from 'three';
import { CameraController } from './CameraController';

const FRUSTUM = 600;
const INITIAL_CENTER_X = 1000; // center of 2000×2000 arena
const INITIAL_CENTER_Z = 1000;

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  private cameraController: CameraController;
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

    // Isometric orthographic camera — owned here, position managed by CameraController
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -FRUSTUM * aspect, FRUSTUM * aspect,
      FRUSTUM, -FRUSTUM,
      0.1, 3000, // increased far plane for 2000×2000 arena
    );
    this.cameraController = new CameraController(
      this.camera,
      INITIAL_CENTER_X,
      INITIAL_CENTER_Z,
    );
    // Position camera at arena center for the lobby/loading state
    this.cameraController.update(INITIAL_CENTER_X, INITIAL_CENTER_Z, 1);

    // Ambient + directional light
    this.scene.add(new THREE.AmbientLight(0x444466, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(200, 400, 100);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  /** Call each frame with the local player's world position and elapsed time in seconds. */
  updateCamera(playerX: number, playerZ: number, delta: number): void {
    this.cameraController.update(playerX, playerZ, delta);
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.left = -FRUSTUM * aspect;
    this.camera.right = FRUSTUM * aspect;
    this.camera.top = FRUSTUM;
    this.camera.bottom = -FRUSTUM;
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
