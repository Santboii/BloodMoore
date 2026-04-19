// client/src/renderer/Scene.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CameraController } from './CameraController';

const FRUSTUM = 600;
const INITIAL_CENTER_X = 1000;
const INITIAL_CENTER_Z = 1000;

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: 0.35 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float v = 1.0 - dot(uv * 0.4, uv * 0.4);
      v = clamp(mix(1.0 - intensity, 1.0, v), 0.0, 1.0);
      gl_FragColor = vec4(color.rgb * v, color.a);
    }
  `,
};

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  private cameraController: CameraController;
  private composer!: EffectComposer;
  private animFrameId = 0;
  private readonly _raycaster = new THREE.Raycaster();
  private readonly _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly _worldTarget = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      -FRUSTUM * aspect, FRUSTUM * aspect,
      FRUSTUM, -FRUSTUM,
      0.1, 3000,
    );
    this.cameraController = new CameraController(this.camera, INITIAL_CENTER_X, INITIAL_CENTER_Z);
    this.cameraController.update(INITIAL_CENTER_X, INITIAL_CENTER_Z, 1);

    this.buildLighting();

    window.addEventListener('resize', this.onResize);
    this.onResize();
  }

  private buildLighting(): void {
    // Near-black warm ambient — prevents total darkness between torches
    this.scene.add(new THREE.AmbientLight(0x110a08, 0.4));

    // Cool blue sky / blood-red ground gradient
    this.scene.add(new THREE.HemisphereLight(0x001122, 0x220800, 0.3));

    // Dim moonlight — still casts shadows, cool blue-white
    const moon = new THREE.DirectionalLight(0x4455aa, 0.25);
    moon.position.set(500, 800, 200);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 0.5;
    moon.shadow.camera.far = 4000;
    moon.shadow.camera.left = -1200;
    moon.shadow.camera.right = 1200;
    moon.shadow.camera.top = 1200;
    moon.shadow.camera.bottom = -1200;
    this.scene.add(moon);
  }

  /** Call after scene objects are added. Creates EffectComposer pipeline. */
  initPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.5,  // strength
        0.4,  // radius
        0.3,  // threshold
      ),
    );
    this.composer.addPass(new ShaderPass(VignetteShader));
    this.composer.addPass(new OutputPass());
  }

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
    this.composer?.setSize(w, h);
  };

  startRenderLoop(onFrame: () => void): void {
    if (this.animFrameId !== 0) return;
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      onFrame();
      // Fall back to bare render before initPostProcessing() is called
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  stopRenderLoop(): void {
    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = 0;
  }

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
    this.composer?.dispose();
  }
}
