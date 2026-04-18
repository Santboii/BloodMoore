# Fireball Particle Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a glowing ember trail behind each fireball and an explosion burst on any collision, using a single pre-allocated `THREE.Points` particle pool for 60fps performance.

**Architecture:** A new `FireballParticles` class owns a 2048-slot typed-array pool and a single `THREE.Points` draw call backed by a custom `ShaderMaterial` (needed for per-particle size). `SpellRenderer` constructs it, tracks previous fireball positions to detect vanished IDs (= collision), emits trail particles each frame per live fireball, and triggers explosion bursts for any fireball that disappears.

**Tech Stack:** TypeScript, Three.js r170, no client test framework — manual browser verification only.

---

### Task 1: Create `FireballParticles.ts`

**Files:**
- Create: `client/src/renderer/FireballParticles.ts`

- [ ] **Step 1: Create the file with the particle pool and `THREE.Points` setup**

Create `/Users/danielgalvez/coding/arena-game/client/src/renderer/FireballParticles.ts` with this exact content:

```typescript
import * as THREE from 'three';

const POOL_SIZE = 2048;
const SOFT_CAP = Math.floor(POOL_SIZE * 0.9); // skip trail emission above this

export class FireballParticles {
  private posX = new Float32Array(POOL_SIZE);
  private posY = new Float32Array(POOL_SIZE);
  private posZ = new Float32Array(POOL_SIZE);
  private velX = new Float32Array(POOL_SIZE);
  private velY = new Float32Array(POOL_SIZE);
  private velZ = new Float32Array(POOL_SIZE);
  private life = new Float32Array(POOL_SIZE);
  private maxLife = new Float32Array(POOL_SIZE);
  private particleSize = new Float32Array(POOL_SIZE);
  private activeCount = 0;

  private positionBuffer: Float32Array;
  private sizeBuffer: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;

  constructor(private scene: THREE.Scene) {
    this.positionBuffer = new Float32Array(POOL_SIZE * 3);
    this.sizeBuffer = new Float32Array(POOL_SIZE);

    this.geometry = new THREE.BufferGeometry();

    this.posAttr = new THREE.BufferAttribute(this.positionBuffer, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);

    this.sizeAttr = new THREE.BufferAttribute(this.sizeBuffer, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('size', this.sizeAttr);

    this.geometry.setDrawRange(0, 0);

    // ShaderMaterial required for per-particle size.
    // Standard PointsMaterial uses a uniform size — no per-vertex control.
    // Camera is orthographic so no perspective division in vertex shader.
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xff6600) } },
      vertexShader: `
        attribute float size;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - dist * 2.0;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    // frustumCulled false: particles span the arena; bounding sphere computation
    // is expensive and this is one draw call regardless.
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emitTrail(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 3 + Math.floor(Math.random() * 3); // 3–5
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      this.spawn(
        x + (Math.random() - 0.5) * 4,
        y + (Math.random() - 0.5) * 4,
        z + (Math.random() - 0.5) * 4,
        -dirX * (40 + Math.random() * 30) + (Math.random() - 0.5) * 30,
        10 + Math.random() * 20,
        -dirZ * (40 + Math.random() * 30) + (Math.random() - 0.5) * 30,
        0.35 + Math.random() * 0.15,
        4,
      );
    }
  }

  emitExplosion(x: number, y: number, z: number): void {
    const count = 40 + Math.floor(Math.random() * 21); // 40–60
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 120;
      this.spawn(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        z + (Math.random() - 0.5) * 6,
        Math.cos(theta) * speed,
        20 + Math.random() * 80,
        Math.sin(theta) * speed,
        0.5 + Math.random() * 0.3,
        Math.random() > 0.5 ? 6 : 3,
      );
    }
  }

  private spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number,
  ): void {
    const i = this.activeCount++;
    this.posX[i] = x; this.posY[i] = y; this.posZ[i] = z;
    this.velX[i] = vx; this.velY[i] = vy; this.velZ[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.particleSize[i] = size;
  }

  update(delta: number): void {
    let i = 0;
    while (i < this.activeCount) {
      this.life[i] -= delta;
      if (this.life[i] <= 0) {
        const last = this.activeCount - 1;
        this.posX[i] = this.posX[last]; this.posY[i] = this.posY[last]; this.posZ[i] = this.posZ[last];
        this.velX[i] = this.velX[last]; this.velY[i] = this.velY[last]; this.velZ[i] = this.velZ[last];
        this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last];
        this.particleSize[i] = this.particleSize[last];
        this.activeCount--;
        continue;
      }
      this.velY[i] -= 80 * delta;
      this.posX[i] += this.velX[i] * delta;
      this.posY[i] += this.velY[i] * delta;
      this.posZ[i] += this.velZ[i] * delta;

      const t = i * 3;
      this.positionBuffer[t]     = this.posX[i];
      this.positionBuffer[t + 1] = this.posY[i];
      this.positionBuffer[t + 2] = this.posZ[i];
      this.sizeBuffer[i] = this.particleSize[i] * (this.life[i] / this.maxLife[i]);
      i++;
    }

    this.geometry.setDrawRange(0, this.activeCount);
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/danielgalvez/coding/arena-game/client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/danielgalvez/coding/arena-game
git add client/src/renderer/FireballParticles.ts
git commit -m "feat: add FireballParticles pool and shader"
```

---

### Task 2: Integrate `FireballParticles` into `SpellRenderer`

**Files:**
- Modify: `client/src/renderer/SpellRenderer.ts`

The current `SpellRenderer.ts` is 102 lines. Replace it entirely with the version below, which adds:
- Import of `FireballParticles`
- `fireballParticles`, `prevFireballPositions`, `clock` fields
- `delta` passed through `update → syncFireballs`
- Trail emission per live fireball
- Explosion burst on vanished fireball ID
- `fireballParticles.dispose()` in `dispose()`

- [ ] **Step 1: Replace `SpellRenderer.ts`**

Write this to `/Users/danielgalvez/coding/arena-game/client/src/renderer/SpellRenderer.ts`:

```typescript
import * as THREE from 'three';
import { GameState } from '@arena/shared';
import { FireballParticles } from './FireballParticles';

export class SpellRenderer {
  private fireballs = new Map<string, THREE.Mesh>();
  private fireWalls = new Map<string, THREE.Group>();
  private meteors = new Map<string, THREE.Mesh>();
  private fireballParticles: FireballParticles;
  private prevFireballPositions = new Map<string, { x: number; y: number; z: number }>();
  private clock = new THREE.Clock();

  constructor(private scene: THREE.Scene) {
    this.fireballParticles = new FireballParticles(scene);
  }

  update(state: GameState): void {
    const delta = this.clock.getDelta();
    this.syncFireballs(state);
    this.syncFireWalls(state);
    this.syncMeteors(state);
    this.fireballParticles.update(delta);
  }

  private syncFireballs(state: GameState): void {
    const activeIds = new Set(state.projectiles.map(p => p.id));

    for (const [id, mesh] of this.fireballs) {
      if (!activeIds.has(id)) {
        const last = this.prevFireballPositions.get(id);
        if (last) this.fireballParticles.emitExplosion(last.x, last.y, last.z);
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
      this.fireballParticles.emitTrail(wx, wy, wz, dirX, dirZ);
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
        for (const seg of fw.segments) {
          const dx = seg.x2 - seg.x1;
          const dy = seg.y2 - seg.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(len, 30),
            new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
          );
          plane.rotation.x = -Math.PI / 2;
          plane.rotation.z = Math.atan2(dy, dx);
          plane.position.set(mid.x, 15, mid.y);
          group.add(plane);
        }
        this.scene.add(group);
        this.fireWalls.set(fw.id, group);
      }
    }
  }

  private syncMeteors(state: GameState): void {
    const activeIds = new Set(state.meteors.map(m => m.id));

    for (const [id, mesh] of this.meteors) {
      if (!activeIds.has(id)) { this.scene.remove(mesh); this.meteors.delete(id); }
    }

    for (const meteor of state.meteors) {
      if (!this.meteors.has(meteor.id)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(50, 58, 32),
          new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(meteor.target.x, 2, meteor.target.y);
        this.scene.add(ring);
        this.meteors.set(meteor.id, ring);
      }
    }
  }

  dispose(): void {
    for (const mesh of this.fireballs.values()) this.scene.remove(mesh);
    for (const group of this.fireWalls.values()) this.scene.remove(group);
    for (const mesh of this.meteors.values()) this.scene.remove(mesh);
    this.fireballs.clear();
    this.fireWalls.clear();
    this.meteors.clear();
    this.fireballParticles.dispose();
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/danielgalvez/coding/arena-game/client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the dev server and verify visually**

```bash
cd /Users/danielgalvez/coding/arena-game && npm run dev
```

Open the game in the browser and verify:

| Action | Expected |
|--------|----------|
| Fire a fireball (key `1`, then left-click) | Glowing orange ember sparks trail behind the fireball |
| Sparks drift backward and fade out | Sparks shrink to nothing over ~0.4s, arc slightly downward |
| Fireball hits a player | Burst of 40–60 orange sparks explodes outward at impact point |
| Fireball hits a pillar | Same explosion burst at pillar contact point |
| Fireball reaches the arena boundary | Explosion burst at the edge |
| Fire multiple fireballs rapidly | All trails render simultaneously, no frame rate drop |
| Fire wall, meteor spells | Unaffected — no particles on those spells |

- [ ] **Step 4: Commit**

```bash
cd /Users/danielgalvez/coding/arena-game
git add client/src/renderer/SpellRenderer.ts
git commit -m "feat: integrate fireball particle trail and explosion into SpellRenderer"
```
