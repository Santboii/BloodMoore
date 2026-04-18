# Diablo III Aesthetic Visual Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace capsule characters and flat-color arena geometry with GLTF character models (skeletal animation), PBR stone textures, atmospheric torch lighting, and EffectComposer bloom + vignette post-processing.

**Architecture:** A new `AssetLoader` singleton preloads all GLTF models and PBR textures before game start. `Arena` and `CharacterMesh` accept pre-loaded asset handles from their constructors. `CharacterAnimator` owns the `AnimationMixer` and drives idle/walk/cast transitions using `PlayerState.castingSpell` from the game state. `Scene` gets a dark atmospheric lighting overhaul and an `EffectComposer` pipeline replacing the bare `renderer.render()` call.

**Tech Stack:** Three.js 0.170 (`three/addons` for GLTFLoader, EffectComposer, UnrealBloomPass, ShaderPass, OutputPass), TypeScript, Vite

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `client/public/assets/characters/warrior.glb` | Create (manual download) | Quaternius warrior character with idle/walk/attack clips |
| `client/public/assets/characters/mage.glb` | Create (manual download) | Quaternius mage character with idle/walk/attack clips |
| `client/public/assets/textures/cobblestone/diffuse.jpg` | Create (manual download) | Floor diffuse texture (1K) |
| `client/public/assets/textures/cobblestone/normal.jpg` | Create (manual download) | Floor normal map (1K) |
| `client/public/assets/textures/cobblestone/roughness.jpg` | Create (manual download) | Floor roughness map (1K) |
| `client/public/assets/textures/castle_stone/diffuse.jpg` | Create (manual download) | Pillar/wall diffuse texture (1K) |
| `client/public/assets/textures/castle_stone/normal.jpg` | Create (manual download) | Pillar/wall normal map (1K) |
| `client/public/assets/textures/castle_stone/roughness.jpg` | Create (manual download) | Pillar/wall roughness map (1K) |
| `client/src/renderer/AssetLoader.ts` | Create | Preloads all GLTF + textures, returns typed `LoadedAssets` |
| `client/src/renderer/CharacterAnimator.ts` | Create | Animation state machine: idle / walk / cast with crossfade |
| `client/src/renderer/CharacterMesh.ts` | Replace | GLTF-based character with AnimationMixer; velocity-derived from position delta |
| `client/src/renderer/Arena.ts` | Replace | PBR MeshStandardMaterial textures + per-pillar torch PointLights |
| `client/src/renderer/Scene.ts` | Modify | Dark atmospheric lighting + EffectComposer (bloom + vignette) |
| `client/src/main.ts` | Modify | Await AssetLoader.load(), pass assets to Arena/CharacterMesh, pass `isCasting` to CharacterMesh |

---

## Task 1: Download and commit CC0 assets

**Files:**
- Create: `client/public/assets/characters/warrior.glb`
- Create: `client/public/assets/characters/mage.glb`
- Create: `client/public/assets/textures/cobblestone/{diffuse,normal,roughness}.jpg`
- Create: `client/public/assets/textures/castle_stone/{diffuse,normal,roughness}.jpg`

- [ ] **Step 1: Download Quaternius characters**

  Go to **https://quaternius.com** → find "Ultimate Animated Character Pack" (or any pack containing distinct male/female or warrior/mage models with idle, walk, and attack animations). Download the GLB versions. Rename two distinct models to `warrior.glb` and `mage.glb` and place them in `client/public/assets/characters/`.

  If Quaternius packs only ship as FBX: use the free online converter at **https://products.aspose.app/3d/conversion/fbx-to-glb** or Blender (File → Export → glTF 2.0 with animations embedded).

  Verify each GLB has embedded animations by running:
  ```bash
  node -e "
  const fs = require('fs');
  const buf = fs.readFileSync('client/public/assets/characters/warrior.glb');
  const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString());
  console.log('Animations:', json.animations?.map(a => a.name));
  "
  ```
  Expected: an array with at least `idle`/`Idle`, `walk`/`Walk`, and `attack`/`Attack` (exact names vary by pack).

- [ ] **Step 2: Download Poly Haven PBR textures**

  Go to **https://polyhaven.com/textures** and download:
  - Search "cobblestone" → pick any cobblestone set → download at **1K resolution**, JPEG format. Save the three maps as:
    - `client/public/assets/textures/cobblestone/diffuse.jpg`
    - `client/public/assets/textures/cobblestone/normal.jpg`
    - `client/public/assets/textures/cobblestone/roughness.jpg`
  - Search "castle brick" or "stone wall" → download at **1K**, JPEG. Save as:
    - `client/public/assets/textures/castle_stone/diffuse.jpg`
    - `client/public/assets/textures/castle_stone/normal.jpg`
    - `client/public/assets/textures/castle_stone/roughness.jpg`

  Poly Haven's download dialog names the maps "diff", "nor_gl" (OpenGL normal), "rough". Rename to match the paths above.

- [ ] **Step 3: Verify directory structure**

  ```bash
  find client/public/assets -type f | sort
  ```
  Expected output:
  ```
  client/public/assets/characters/mage.glb
  client/public/assets/characters/warrior.glb
  client/public/assets/textures/castle_stone/diffuse.jpg
  client/public/assets/textures/castle_stone/normal.jpg
  client/public/assets/textures/castle_stone/roughness.jpg
  client/public/assets/textures/cobblestone/diffuse.jpg
  client/public/assets/textures/cobblestone/normal.jpg
  client/public/assets/textures/cobblestone/roughness.jpg
  ```

- [ ] **Step 4: Commit assets**

  ```bash
  git add client/public/assets/
  git commit -m "feat: add CC0 character GLBs and PBR stone textures"
  ```

---

## Task 2: AssetLoader

**Files:**
- Create: `client/src/renderer/AssetLoader.ts`

- [ ] **Step 1: Create AssetLoader**

  ```typescript
  // client/src/renderer/AssetLoader.ts
  import * as THREE from 'three';
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

  export interface TextureSet {
    map: THREE.Texture;
    normalMap: THREE.Texture;
    roughnessMap: THREE.Texture;
  }

  export interface LoadedAssets {
    characters: { warrior: GLTF; mage: GLTF };
    textures: { floor: TextureSet; stone: TextureSet };
  }

  export class AssetLoader {
    static async load(): Promise<LoadedAssets> {
      const gltfLoader = new GLTFLoader();
      const texLoader = new THREE.TextureLoader();

      const loadGLTF = (url: string): Promise<GLTF> =>
        new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));

      const loadTex = (url: string, colorSpace: string): Promise<THREE.Texture> =>
        new Promise((res, rej) =>
          texLoader.load(url, (t) => { t.colorSpace = colorSpace; res(t); }, undefined, rej),
        );

      const sRGB = THREE.SRGBColorSpace;
      const linear = THREE.LinearSRGBColorSpace;

      const [warrior, mage, floorDiff, floorNorm, floorRough, stoneDiff, stoneNorm, stoneRough] =
        await Promise.all([
          loadGLTF('/assets/characters/warrior.glb'),
          loadGLTF('/assets/characters/mage.glb'),
          loadTex('/assets/textures/cobblestone/diffuse.jpg', sRGB),
          loadTex('/assets/textures/cobblestone/normal.jpg', linear),
          loadTex('/assets/textures/cobblestone/roughness.jpg', linear),
          loadTex('/assets/textures/castle_stone/diffuse.jpg', sRGB),
          loadTex('/assets/textures/castle_stone/normal.jpg', linear),
          loadTex('/assets/textures/castle_stone/roughness.jpg', linear),
        ]);

      return {
        characters: { warrior, mage },
        textures: {
          floor: { map: floorDiff, normalMap: floorNorm, roughnessMap: floorRough },
          stone: { map: stoneDiff, normalMap: stoneNorm, roughnessMap: stoneRough },
        },
      };
    }
  }
  ```

- [ ] **Step 2: Smoke-test import compiles**

  ```bash
  cd client && npx tsc --noEmit
  ```
  Expected: no errors related to `AssetLoader.ts`.

- [ ] **Step 3: Commit**

  ```bash
  git add client/src/renderer/AssetLoader.ts
  git commit -m "feat: add AssetLoader — preloads GLTF characters and PBR textures"
  ```

---

## Task 3: CharacterAnimator

**Files:**
- Create: `client/src/renderer/CharacterAnimator.ts`

- [ ] **Step 1: Create CharacterAnimator**

  ```typescript
  // client/src/renderer/CharacterAnimator.ts
  import * as THREE from 'three';

  type AnimState = 'idle' | 'walk' | 'cast';

  export class CharacterAnimator {
    private mixer: THREE.AnimationMixer;
    private actions = new Map<AnimState, THREE.AnimationAction>();
    private current: AnimState = 'idle';

    constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
      this.mixer = new THREE.AnimationMixer(root);

      const find = (...names: string[]) => {
        const lower = names.map(n => n.toLowerCase());
        return clips.find(c => lower.includes(c.name.toLowerCase())) ?? clips[0];
      };

      const idleClip  = find('idle', 'Idle', 'IDLE');
      const walkClip  = find('walk', 'Walk', 'WALK', 'run', 'Run') ?? idleClip;
      const castClip  = find('attack', 'Attack', 'cast', 'Cast', 'spell', 'Spell') ?? idleClip;

      this.actions.set('idle', this.mixer.clipAction(idleClip));
      this.actions.set('walk', this.mixer.clipAction(walkClip));

      const castAction = this.mixer.clipAction(castClip);
      castAction.setLoop(THREE.LoopOnce, 1);
      castAction.clampWhenFinished = true;
      this.actions.set('cast', castAction);

      this.actions.get('idle')!.play();

      this.mixer.addEventListener('finished', (e) => {
        if (e.action === this.actions.get('cast') && this.current === 'cast') {
          this.current = 'idle'; // reset so transitionTo can run
          this.transitionTo('idle');
        }
      });
    }

    update(delta: number, velocityMag: number, isCasting: boolean): void {
      this.mixer.update(delta);

      if (this.current === 'cast') return; // let cast finish via 'finished' event

      if (isCasting) {
        this.transitionTo('cast');
        return;
      }

      const target: AnimState = velocityMag > 5 ? 'walk' : 'idle';
      if (target !== this.current) this.transitionTo(target);
    }

    transitionTo(state: AnimState): void {
      if (state === this.current) return;
      const from = this.actions.get(this.current)!;
      const to = this.actions.get(state)!;

      if (state === 'cast') {
        to.reset();
        to.play();
      }

      from.crossFadeTo(to, 0.2, true);
      this.current = state;
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd client && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add client/src/renderer/CharacterAnimator.ts
  git commit -m "feat: add CharacterAnimator — idle/walk/cast state machine with AnimationMixer"
  ```

---

## Task 4: CharacterMesh (GLTF-based)

**Files:**
- Replace: `client/src/renderer/CharacterMesh.ts`

- [ ] **Step 1: Replace CharacterMesh with GLTF version**

  ```typescript
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
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd client && npx tsc --noEmit
  ```
  Expected: errors only in `main.ts` (CharacterMesh constructor signature changed — fixed in Task 7).

- [ ] **Step 3: Commit**

  ```bash
  git add client/src/renderer/CharacterMesh.ts
  git commit -m "feat: replace CharacterMesh capsule with GLTF model + CharacterAnimator"
  ```

---

## Task 5: Arena — PBR textures + torch lights

**Files:**
- Replace: `client/src/renderer/Arena.ts`

- [ ] **Step 1: Replace Arena with PBR textured version**

  ```typescript
  // client/src/renderer/Arena.ts
  import * as THREE from 'three';
  import { PILLARS, ARENA_SIZE } from '@arena/shared';
  import type { TextureSet } from './AssetLoader';

  const PILLAR_H = 80;

  function tiledPBR(tex: TextureSet, repeatU: number, repeatV: number): THREE.MeshStandardMaterial {
    const apply = (t: THREE.Texture) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeatU, repeatV);
      c.needsUpdate = true;
      return c;
    };
    return new THREE.MeshStandardMaterial({
      map: apply(tex.map),
      normalMap: apply(tex.normalMap),
      roughnessMap: apply(tex.roughnessMap),
      roughness: 1,
      metalness: 0,
    });
  }

  export class Arena {
    private group = new THREE.Group();

    constructor(textures: { floor: TextureSet; stone: TextureSet }) {
      this.buildFloor(textures.floor);
      this.buildBoundaryWalls(textures.stone);
      this.buildPillars(textures.stone);
    }

    addToScene(scene: THREE.Scene): void {
      scene.add(this.group);
    }

    private buildFloor(tex: TextureSet): void {
      const repeat = ARENA_SIZE / 200; // one tile per 200 world units
      const mat = tiledPBR(tex, repeat, repeat);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE), mat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(ARENA_SIZE / 2, 0, ARENA_SIZE / 2);
      floor.receiveShadow = true;
      this.group.add(floor);
    }

    private buildBoundaryWalls(tex: TextureSet): void {
      const wallH = 60;
      const positions: [number, number, number, number][] = [
        [ARENA_SIZE / 2, -10,            ARENA_SIZE + 40, 20],
        [ARENA_SIZE / 2, ARENA_SIZE + 10, ARENA_SIZE + 40, 20],
        [-10,            ARENA_SIZE / 2,  20,              ARENA_SIZE],
        [ARENA_SIZE + 10, ARENA_SIZE / 2, 20,              ARENA_SIZE],
      ];
      for (const [x, z, w, d] of positions) {
        const mat = tiledPBR(tex, w / 200, wallH / 200);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mat);
        mesh.position.set(x, wallH / 2, z);
        mesh.castShadow = true;
        this.group.add(mesh);
      }
    }

    private buildPillars(tex: TextureSet): void {
      const capMat = new THREE.MeshStandardMaterial({ color: 0x6a6aaa, roughness: 0.7, metalness: 0.1 });

      for (const p of PILLARS) {
        const size = p.halfSize * 2;
        const pillarMat = tiledPBR(tex, size / 200, PILLAR_H / 200);

        const body = new THREE.Mesh(new THREE.BoxGeometry(size, PILLAR_H, size), pillarMat);
        body.position.set(p.x, PILLAR_H / 2, p.y);
        body.castShadow = true;
        body.receiveShadow = true;
        this.group.add(body);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(size + 6, 8, size + 6), capMat);
        cap.position.set(p.x, PILLAR_H + 4, p.y);
        this.group.add(cap);

        // Torch PointLight above each pillar cap
        const torch = new THREE.PointLight(0xff6600, 3, 450, 2);
        torch.position.set(p.x, PILLAR_H + 60, p.y);
        this.group.add(torch);
      }
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd client && npx tsc --noEmit
  ```
  Expected: errors only in `main.ts` (Arena constructor now requires textures argument — fixed in Task 7).

- [ ] **Step 3: Commit**

  ```bash
  git add client/src/renderer/Arena.ts
  git commit -m "feat: Arena PBR stone textures and per-pillar torch PointLights"
  ```

---

## Task 6: Scene — atmospheric lighting + EffectComposer

**Files:**
- Modify: `client/src/renderer/Scene.ts`

- [ ] **Step 1: Replace Scene.ts with atmospheric lighting and post-processing**

  Full replacement of `client/src/renderer/Scene.ts`:

  ```typescript
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
  ```

  > **Important:** `startRenderLoop` now calls `this.composer.render()` instead of `this.renderer.render()`. `initPostProcessing()` must be called before `startRenderLoop`.

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd client && npx tsc --noEmit
  ```
  Expected: errors only in `main.ts` — Scene constructor changes and missing `initPostProcessing()` call.

- [ ] **Step 3: Commit**

  ```bash
  git add client/src/renderer/Scene.ts
  git commit -m "feat: atmospheric lighting overhaul and EffectComposer bloom + vignette"
  ```

---

## Task 7: Wire up main.ts

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Replace main.ts with async-init version**

  The key changes:
  - Wrap setup in an async IIFE so we can `await AssetLoader.load()`
  - Show a loading message in the lobby while assets load
  - Pass `assets.textures` to `Arena` constructor
  - Call `scene.initPostProcessing()` after arena is added to scene
  - Pass `gltf` handle to `CharacterMesh` constructor (warrior for colorIndex 0, mage for 1)
  - Pass `isCasting` (from `player.castingSpell !== null`) to `mesh.update()`

  ```typescript
  // client/src/main.ts
  import { Scene } from './renderer/Scene';
  import { Arena } from './renderer/Arena';
  import { CharacterMesh } from './renderer/CharacterMesh';
  import { SpellRenderer } from './renderer/SpellRenderer';
  import { AssetLoader } from './renderer/AssetLoader';
  import type { LoadedAssets } from './renderer/AssetLoader';
  import { StateBuffer } from './network/StateBuffer';
  import { SocketClient } from './network/SocketClient';
  import { InputHandler } from './input/InputHandler';
  import { HUD } from './hud/HUD';
  import { LobbyUI } from './lobby/LobbyUI';
  import { GameState } from '@arena/shared';

  const container = document.getElementById('canvas-container')!;
  const uiOverlay = document.getElementById('ui-overlay')!;

  const scene = new Scene(container);

  const hud = new HUD(uiOverlay);
  hud.hide();

  const stateBuffer = new StateBuffer();
  const socket = new SocketClient();

  let myId = '';
  let playerMeshes = new Map<string, CharacterMesh>();
  let spellRenderer: SpellRenderer | null = null;
  let inputHandler: InputHandler | null = null;
  let opponentName = '';
  let handlersRegistered = false;
  let assets: LoadedAssets;

  const PLAYER_COLORS: Record<number, number> = { 0: 0xc8a000, 1: 0xc00030 };
  let myColorIndex = 0;

  const lobby = new LobbyUI(uiOverlay, {
    onCreateRoom: async (displayName) => {
      const res = await fetch('/rooms', { method: 'POST' });
      const { roomId } = await res.json();
      const shareUrl = `${location.origin}?room=${roomId}`;
      socket.connect();
      socket.joinRoom(roomId, displayName);
      socket.onRoomJoined(({ yourId }) => {
        myId = yourId;
        myColorIndex = 0;
        hud.init(myId);
        lobby.showWaiting(shareUrl);
      });
      setupSocketHandlers(displayName);
    },
    onJoinRoom: (roomId, displayName) => {
      socket.connect();
      socket.joinRoom(roomId, displayName);
      socket.onRoomJoined(({ yourId, players }) => {
        myId = yourId;
        myColorIndex = 1;
        hud.init(myId);
        const opponentEntry = Object.entries(players).find(([id]) => id !== yourId);
        if (opponentEntry) opponentName = opponentEntry[1];
        if (Object.keys(players).length >= 2) lobby.showReady();
      });
      setupSocketHandlers(displayName);
    },
    onReady: () => socket.ready(),
    onRematch: () => socket.rematch(),
  });

  function setupSocketHandlers(_myDisplayName: string): void {
    if (handlersRegistered) return;
    handlersRegistered = true;

    socket.onPlayerJoined(({ displayName }) => {
      opponentName = displayName;
      lobby.showReady();
    });

    socket.onGameReady(() => lobby.showReady());

    socket.onGameState((state: GameState) => {
      if (!spellRenderer) {
        stateBuffer.clear();
        startGame();
        lobby.hide();
      }
      stateBuffer.push(state);
    });

    socket.onDuelEnded(({ winnerId }) => {
      const won = winnerId === myId;
      stopGame();
      lobby.showResult(won, opponentName);
      lobby.show();
    });

    socket.onRematchReady(() => {
      stateBuffer.clear();
      startGame();
      lobby.hide();
    });

    socket.onOpponentDisconnected(() => {
      stopGame();
      lobby.showDisconnected();
      lobby.show();
    });

    socket.onRoomNotFound(() => {
      lobby.showHome();
    });
  }

  function startGame(): void {
    for (const mesh of playerMeshes.values()) mesh.dispose(uiOverlay);
    playerMeshes.clear();
    spellRenderer?.dispose();
    inputHandler?.dispose();

    spellRenderer = new SpellRenderer(scene.scene);
    inputHandler = new InputHandler(scene, scene.renderer.domElement);

    hud.show();
    lobby.hide();
  }

  function stopGame(): void {
    inputHandler?.dispose();
    inputHandler = null;
    spellRenderer?.dispose();
    spellRenderer = null;
    for (const mesh of playerMeshes.values()) mesh.dispose(uiOverlay);
    playerMeshes.clear();
    hud.hide();
    stateBuffer.clear();
  }

  let lastFrameTime = performance.now();

  scene.startRenderLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    if (!inputHandler || !spellRenderer) return;

    const frame = inputHandler.buildInputFrame();
    socket.sendInput(frame);

    const state = stateBuffer.getInterpolated();
    if (!state) return;

    for (const [id, player] of Object.entries(state.players)) {
      if (!playerMeshes.has(id)) {
        const colorIndex = id === myId ? myColorIndex : 1 - myColorIndex;
        const gltf = colorIndex === 0 ? assets.characters.warrior : assets.characters.mage;
        const mesh = new CharacterMesh(gltf, PLAYER_COLORS[colorIndex], player.displayName, uiOverlay);
        scene.scene.add(mesh.group);
        playerMeshes.set(id, mesh);
      }
      const mesh = playerMeshes.get(id)!;
      mesh.setPosition(player.position.x, player.position.y);
      mesh.update(delta, player.castingSpell !== null);
      mesh.updateLabel(scene.camera, scene.renderer);
    }

    const myPlayer = state.players[myId];
    if (myPlayer) {
      scene.updateCamera(myPlayer.position.x, myPlayer.position.y, delta);
    }

    spellRenderer.update(state);
    hud.update(state, inputHandler.getActiveSpell());
  });

  // Async init — load assets then build scene
  (async () => {
    lobby.showLoading?.('Loading assets…');
    try {
      assets = await AssetLoader.load();
    } catch (err) {
      console.error('Asset load failed:', err);
      lobby.showError?.('Failed to load game assets. Please refresh.');
      return;
    }

    const arena = new Arena(assets.textures);
    arena.addToScene(scene.scene);
    scene.initPostProcessing();

    lobby.showHome?.();
  })();
  ```

  > **Note on `lobby.showLoading` / `lobby.showHome` / `lobby.showError`:** Check `LobbyUI.ts` — if these methods don't exist, add stubs or use the closest existing method (`lobby.showHome()` is the default starting state). The `?.` optional chaining means it silently skips missing methods.

- [ ] **Step 2: Check LobbyUI for needed methods**

  ```bash
  grep -n 'showHome\|showLoading\|showError' client/src/lobby/LobbyUI.ts
  ```

  If `showLoading` or `showError` don't exist, add them to `LobbyUI.ts`:

  ```typescript
  // Add to LobbyUI class:
  showLoading(message = 'Loading…'): void {
    this.showSection('loading');
    const el = this.root.querySelector('#loading-message');
    if (el) el.textContent = message;
  }

  showError(message: string): void {
    this.showSection('error');
    const el = this.root.querySelector('#error-message');
    if (el) el.textContent = message;
  }
  ```

  And add the corresponding HTML sections in the lobby template if needed (a `<div id="loading-message">` and `<div id="error-message">`). If adding HTML sections is too disruptive to LobbyUI, replace the `lobby.showLoading?.()` call in main.ts with whatever method currently shows a waiting/placeholder state.

- [ ] **Step 3: Verify full TypeScript compile**

  ```bash
  cd client && npx tsc --noEmit
  ```
  Expected: zero errors.

- [ ] **Step 4: Commit**

  ```bash
  git add client/src/main.ts client/src/lobby/LobbyUI.ts
  git commit -m "feat: wire AssetLoader, GLTF CharacterMesh, and post-processing into main"
  ```

---

## Task 8: Visual verification

**No code changes — run the game and verify visually.**

- [ ] **Step 1: Start dev server**

  ```bash
  npm run dev
  ```
  Open `http://localhost:5173` (or whatever port Vite reports).

- [ ] **Step 2: Verify asset loading**

  Open browser DevTools → Network tab. Filter by `glb` and `jpg`. Confirm all 8 texture files and 2 GLB files load with HTTP 200. If any 404: check file paths in `client/public/assets/` match the paths in `AssetLoader.ts`.

- [ ] **Step 3: Verify character models appear**

  Create a room (or open two tabs). Confirm:
  - Characters are visible 3D models, not capsules
  - Player 0 shows the warrior model tinted gold (`0xc8a000`)
  - Player 1 shows the mage model tinted red (`0xc00030`)
  - Name labels still appear above each character

- [ ] **Step 4: Verify animations**

  - Standing still → idle animation plays (character breathes/idles)
  - Moving with WASD → walk animation plays
  - Casting a spell → attack/cast animation plays once, then returns to idle/walk
  - If animation clips aren't triggering: open DevTools console, look for `CharacterAnimator` warnings about missing clip names. Update the `find(...)` call in `CharacterAnimator` constructor with the exact names from the GLB (found in Task 1 Step 1 output).

- [ ] **Step 5: Verify arena textures**

  - Floor shows tiled stone/cobblestone texture (not flat dark gray)
  - Pillars show stone texture
  - If textures appear black: check `colorSpace` assignments in `AssetLoader` (diffuse must be `SRGBColorSpace`; normal/roughness must be `LinearSRGBColorSpace`)

- [ ] **Step 6: Verify torch lighting**

  - Pillars emit warm orange glow onto nearby floor/walls
  - Scene overall is darker/moodier than before (near-black ambient)
  - If scene is completely dark: check that `Arena.addToScene()` was called before `scene.initPostProcessing()`, and that PointLight intensity (3) and distance (450) are reaching the floor

- [ ] **Step 7: Verify bloom post-processing**

  - Torch lights have a soft orange glow halo
  - Fireball particles appear brighter/more luminous than before
  - Screen edges are slightly darkened (vignette)
  - If the scene appears washed out or overly bright: reduce `UnrealBloomPass` strength from `0.5` to `0.3` in `Scene.ts`

- [ ] **Step 8: Performance check**

  Open Chrome DevTools → Performance tab → record 5 seconds of gameplay. Confirm frame time stays under 16ms (60fps) with both players active and particles flying. If frames are dropping: the most likely culprit is PointLight shadow casting — torches don't need to cast shadows, so verify `torch.castShadow` is NOT set (default is false).

- [ ] **Step 9: Final commit**

  ```bash
  git add -A
  git commit -m "feat: Diablo III aesthetic overhaul — GLTF characters, PBR arena, bloom lighting"
  ```
