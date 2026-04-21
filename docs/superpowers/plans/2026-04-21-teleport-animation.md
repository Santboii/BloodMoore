# Teleport Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gold/white arcane electrical flash animation when any player teleports, playing at both origin and destination.

**Architecture:** Rename `FireParticles.ts` → `ParticleSystem.ts` with per-particle color support, create `TeleportEffect.ts` to orchestrate lightning lines + ground ring + point light + sparks, detect teleports in `SpellRenderer.ts` via position delta threshold.

**Tech Stack:** Three.js (BufferGeometry, LineSegments, ShaderMaterial, PointLight, TorusGeometry)

---

### Task 1: Rename FireParticles → ParticleSystem and add per-particle color

**Files:**
- Rename: `client/src/renderer/FireParticles.ts` → `client/src/renderer/ParticleSystem.ts`
- Modify: `client/src/renderer/SpellRenderer.ts` (update import)

- [ ] **Step 1: Rename the file**

```bash
git mv client/src/renderer/FireParticles.ts client/src/renderer/ParticleSystem.ts
```

- [ ] **Step 2: Rename the class and add per-particle color buffer**

In `client/src/renderer/ParticleSystem.ts`, rename the class from `FireParticles` to `ParticleSystem` and add per-particle color support. Replace the entire file contents with:

```typescript
import * as THREE from 'three';
import { Segment } from '@arena/shared';

const POOL_SIZE = 4096;
const SOFT_CAP = Math.floor(POOL_SIZE * 0.9);

const DEFAULT_COLOR_R = 1.0;
const DEFAULT_COLOR_G = 0.4;
const DEFAULT_COLOR_B = 0.0;

export class ParticleSystem {
  private posX = new Float32Array(POOL_SIZE);
  private posY = new Float32Array(POOL_SIZE);
  private posZ = new Float32Array(POOL_SIZE);
  private velX = new Float32Array(POOL_SIZE);
  private velY = new Float32Array(POOL_SIZE);
  private velZ = new Float32Array(POOL_SIZE);
  private life = new Float32Array(POOL_SIZE);
  private maxLife = new Float32Array(POOL_SIZE);
  private particleSize = new Float32Array(POOL_SIZE);
  private colorR = new Float32Array(POOL_SIZE);
  private colorG = new Float32Array(POOL_SIZE);
  private colorB = new Float32Array(POOL_SIZE);
  private activeCount = 0;

  private positionBuffer: Float32Array;
  private sizeBuffer: Float32Array;
  private colorBuffer: Float32Array;
  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;

  constructor(private scene: THREE.Scene) {
    this.positionBuffer = new Float32Array(POOL_SIZE * 3);
    this.sizeBuffer = new Float32Array(POOL_SIZE);
    this.colorBuffer = new Float32Array(POOL_SIZE * 3);

    this.geometry = new THREE.BufferGeometry();

    this.posAttr = new THREE.BufferAttribute(this.positionBuffer, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.posAttr);

    this.sizeAttr = new THREE.BufferAttribute(this.sizeBuffer, 1);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('size', this.sizeAttr);

    this.colorAttr = new THREE.BufferAttribute(this.colorBuffer, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('particleColor', this.colorAttr);

    this.geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute vec3 particleColor;
        varying vec3 vColor;
        void main() {
          vColor = particleColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - dist * 2.0;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emitTrail(x: number, y: number, z: number, dirX: number, dirZ: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 3 + Math.floor(Math.random() * 3);
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
        12 + Math.random() * 4,
      );
    }
  }

  emitExplosion(x: number, y: number, z: number): void {
    const count = 40 + Math.floor(Math.random() * 21);
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
        Math.random() > 0.5 ? 16 : 10,
      );
    }
  }

  emitWall(segments: Segment[]): void {
    if (this.activeCount >= SOFT_CAP) return;
    for (const seg of segments) {
      for (let i = 0; i < 3; i++) {
        if (this.activeCount >= POOL_SIZE) return;
        const t = Math.random();
        this.spawn(
          seg.x1 + (seg.x2 - seg.x1) * t + (Math.random() - 0.5) * 4,
          1,
          seg.y1 + (seg.y2 - seg.y1) * t + (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 15,
          40 + Math.random() * 40,
          (Math.random() - 0.5) * 15,
          0.4 + Math.random() * 0.3,
          14 + Math.random() * 10,
        );
      }
    }
  }

  emitMeteorTrail(x: number, y: number, z: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const spread = 8 + Math.random() * 8;
      this.spawn(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        z + (Math.random() - 0.5) * 6,
        Math.cos(theta) * spread,
        20 + Math.random() * 20,
        Math.sin(theta) * spread,
        0.2 + Math.random() * 0.1,
        8 + Math.random() * 6,
      );
    }
  }

  emitCrater(x: number, z: number, radius: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = Math.max(4, Math.round(radius / 10));
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      this.spawn(
        x + Math.cos(theta) * r,
        1,
        z + Math.sin(theta) * r,
        (Math.random() - 0.5) * 10,
        30 + Math.random() * 30,
        (Math.random() - 0.5) * 10,
        0.3 + Math.random() * 0.3,
        10 + Math.random() * 8,
      );
    }
  }

  emitMeteorImpact(x: number, y: number, z: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 50 + Math.floor(Math.random() * 21);
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      this.spawn(
        x + (Math.random() - 0.5) * 10,
        y + (Math.random() - 0.5) * 10,
        z + (Math.random() - 0.5) * 10,
        Math.cos(theta) * speed,
        30 + Math.random() * 100,
        Math.sin(theta) * speed,
        0.5 + Math.random() * 0.3,
        Math.random() > 0.5 ? 18 : 12,
      );
    }
  }

  emitTeleportSparks(x: number, y: number, z: number): void {
    const count = 20 + Math.floor(Math.random() * 11);
    for (let i = 0; i < count; i++) {
      if (this.activeCount >= POOL_SIZE) return;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.5;
      const speed = 80 + Math.random() * 100;
      const idx = this.activeCount;
      this.spawn(
        x + (Math.random() - 0.5) * 6,
        y + (Math.random() - 0.5) * 6,
        z + (Math.random() - 0.5) * 6,
        Math.cos(theta) * Math.sin(phi) * speed,
        Math.cos(phi) * speed * 0.5 + 20,
        Math.sin(theta) * Math.sin(phi) * speed,
        0.15 + Math.random() * 0.05,
        10 + Math.random() * 6,
      );
      this.colorR[idx] = 1.0;
      this.colorG[idx] = 0.84 + Math.random() * 0.16;
      this.colorB[idx] = 0.4 + Math.random() * 0.6;
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
    this.colorR[i] = DEFAULT_COLOR_R;
    this.colorG[i] = DEFAULT_COLOR_G;
    this.colorB[i] = DEFAULT_COLOR_B;
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
        this.colorR[i] = this.colorR[last]; this.colorG[i] = this.colorG[last]; this.colorB[i] = this.colorB[last];
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
      this.colorBuffer[t]     = this.colorR[i];
      this.colorBuffer[t + 1] = this.colorG[i];
      this.colorBuffer[t + 2] = this.colorB[i];
      this.sizeBuffer[i] = this.particleSize[i] * (this.life[i] / this.maxLife[i]);
      i++;
    }

    this.geometry.setDrawRange(0, this.activeCount);
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    (this.points.material as THREE.ShaderMaterial).dispose();
  }
}
```

- [ ] **Step 3: Update SpellRenderer import**

In `client/src/renderer/SpellRenderer.ts`, change the import and field type:

Replace:
```typescript
import { FireParticles } from './FireParticles';
```
With:
```typescript
import { ParticleSystem } from './ParticleSystem';
```

Replace:
```typescript
private fireParticles: FireParticles;
```
With:
```typescript
private particles: ParticleSystem;
```

Replace:
```typescript
this.fireParticles = new FireParticles(scene);
```
With:
```typescript
this.particles = new ParticleSystem(scene);
```

Then replace all remaining occurrences of `this.fireParticles` with `this.particles` in the file (there are 7 occurrences across `syncFireballs`, `syncFireWalls`, `syncMeteors`, and `dispose`).

- [ ] **Step 4: Verify build**

```bash
cd client && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/renderer/ParticleSystem.ts client/src/renderer/SpellRenderer.ts
git commit -m "refactor: rename FireParticles to ParticleSystem, add per-particle color"
```

---

### Task 2: Create TeleportEffect

**Files:**
- Create: `client/src/renderer/TeleportEffect.ts`

- [ ] **Step 1: Create TeleportEffect.ts**

```typescript
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
```

- [ ] **Step 2: Verify build**

```bash
cd client && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/renderer/TeleportEffect.ts
git commit -m "feat: add TeleportEffect class for arcane flash animation"
```

---

### Task 3: Integrate teleport detection and effect spawning into SpellRenderer

**Files:**
- Modify: `client/src/renderer/SpellRenderer.ts`

- [ ] **Step 1: Add teleport detection and effect management**

Add imports at the top of `SpellRenderer.ts`:

```typescript
import { TeleportEffect } from './TeleportEffect';
import { PLAYER_SPEED, DELTA } from '@arena/shared';
```

Add new fields to the `SpellRenderer` class:

```typescript
private teleportEffects: TeleportEffect[] = [];
private prevPlayerPositions = new Map<string, { x: number; z: number }>();
private knownPlayerIds = new Set<string>();
```

Add a constant at the top of the file (below imports):

```typescript
const TELEPORT_THRESHOLD = PLAYER_SPEED * 2 * DELTA;
```

Add a new method `detectTeleports` to the class:

```typescript
private detectTeleports(state: GameState): void {
  for (const [id, player] of Object.entries(state.players)) {
    const wx = player.position.x;
    const wz = player.position.y;

    if (!this.knownPlayerIds.has(id)) {
      this.knownPlayerIds.add(id);
      this.prevPlayerPositions.set(id, { x: wx, z: wz });
      continue;
    }

    const prev = this.prevPlayerPositions.get(id);
    if (prev) {
      const dx = wx - prev.x;
      const dz = wz - prev.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > TELEPORT_THRESHOLD) {
        this.teleportEffects.push(new TeleportEffect(this.scene, prev.x, prev.z, this.particles));
        this.teleportEffects.push(new TeleportEffect(this.scene, wx, wz, this.particles));
      }
    }
    this.prevPlayerPositions.set(id, { x: wx, z: wz });
  }

  for (const id of this.prevPlayerPositions.keys()) {
    if (!(id in state.players)) {
      this.prevPlayerPositions.delete(id);
      this.knownPlayerIds.delete(id);
    }
  }
}
```

Update the `update` method to call `detectTeleports` and update active effects:

Replace the existing `update` method:
```typescript
update(state: GameState): void {
  const delta = this.clock.getDelta();
  this.elapsedTime += delta;
  this.detectTeleports(state);
  this.syncFireballs(state);
  this.syncFireWalls(state);
  this.syncMeteors(state);
  this.particles.update(delta);

  for (let i = this.teleportEffects.length - 1; i >= 0; i--) {
    this.teleportEffects[i].update(delta);
    if (this.teleportEffects[i].done) {
      this.teleportEffects.splice(i, 1);
    }
  }
}
```

Update the `dispose` method to clean up teleport effects:

```typescript
dispose(): void {
  for (const mesh of this.fireballs.values()) this.scene.remove(mesh);
  for (const group of this.fireWalls.values()) this.scene.remove(group);
  for (const entry of this.meteors.values()) {
    this.scene.remove(entry.ring);
    this.scene.remove(entry.rock);
  }
  for (const effect of this.teleportEffects) effect.dispose();
  this.fireballs.clear();
  this.fireWalls.clear();
  this.meteors.clear();
  this.teleportEffects.length = 0;
  this.prevPlayerPositions.clear();
  this.knownPlayerIds.clear();
  this.particles.dispose();
}
```

- [ ] **Step 2: Verify build**

```bash
cd client && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/renderer/SpellRenderer.ts
git commit -m "feat: integrate teleport detection and effect spawning"
```

---

### Task 4: Visual and performance verification

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/danielgalvez/coding/arena-game && npm run dev
```

- [ ] **Step 2: Manual visual test**

Open the game in a browser. Join a match and cast the teleport spell (spell ID 4). Verify:
- Gold lightning lines flash at both origin and destination
- Golden sparks scatter outward with gravity
- Expanding gold ring on the ground at both points
- Brief bright light flash at both points
- All effects clean up within ~200ms — no lingering geometry
- Existing fire spell particles still render orange (not gold)

- [ ] **Step 3: Performance test**

Open browser DevTools Performance tab. Cast teleport rapidly (spam it as mana allows). Verify:
- Frame time stays under 16.7ms (60fps)
- No memory leaks (heap doesn't grow after effects complete)
- Particle pool doesn't exhaust (fire spells still emit particles after teleports)

- [ ] **Step 4: Edge case tests**

- Have another player teleport — verify you see their flash too
- Join a match mid-game — verify no false flash on initial position
- Teleport near a pillar (position gets clamped) — verify flash at clamped destination

- [ ] **Step 5: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: teleport animation adjustments from visual testing"
```
