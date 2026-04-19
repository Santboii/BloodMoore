# Spell Particle Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat FireWall plane and static Meteor ring with a unified `FireParticles` particle system — upward-rising fire particles for walls, animated warning ring + falling rock + impact explosion for meteors.

**Architecture:** `FireballParticles.ts` is renamed to `FireParticles.ts` and gains three new emit methods (`emitWall`, `emitMeteorTrail`, `emitMeteorImpact`). `SpellRenderer.ts` is updated to use the new class and rewrites `syncFireWalls` and `syncMeteors`. All fire particles share one GPU draw call.

**Tech Stack:** Three.js, TypeScript, Vite. No new dependencies.

**Worktree:** `.worktrees/feature/spell-particle-effects`

---

## File Map

| File | Action |
|---|---|
| `client/src/renderer/FireParticles.ts` | Create (rename from `FireballParticles.ts`) |
| `client/src/renderer/FireballParticles.ts` | Delete after Task 1 |
| `client/src/renderer/SpellRenderer.ts` | Modify — Tasks 2 & 3 |

---

## Task 1: Create FireParticles.ts

**Files:**
- Create: `client/src/renderer/FireParticles.ts`
- Delete: `client/src/renderer/FireballParticles.ts`

- [ ] **Step 1: Create `FireParticles.ts` with all emit methods**

Create `client/src/renderer/FireParticles.ts` with this exact content:

```typescript
import * as THREE from 'three';
import { Segment } from '@arena/shared';

const POOL_SIZE = 4096;
const SOFT_CAP = Math.floor(POOL_SIZE * 0.9);

export class FireParticles {
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
          3 + Math.random() * 3,
        );
      }
    }
  }

  emitMeteorTrail(x: number, y: number, z: number): void {
    if (this.activeCount >= SOFT_CAP) return;
    const count = 2 + Math.floor(Math.random() * 2); // 2–3
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
        2 + Math.random() * 2,
      );
    }
  }

  emitMeteorImpact(x: number, y: number, z: number): void {
    const count = 50 + Math.floor(Math.random() * 21); // 50–70
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
        Math.random() > 0.5 ? 7 : 4,
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects/client && npx tsc --noEmit
```

Expected: no errors (FireballParticles still exists, SpellRenderer still imports it — that's fine at this step).

- [ ] **Step 3: Delete FireballParticles.ts**

```bash
rm /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects/client/src/renderer/FireballParticles.ts
```

- [ ] **Step 4: Commit**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects
git add client/src/renderer/FireParticles.ts client/src/renderer/FireballParticles.ts
git commit -m "feat: create FireParticles — unified particle system with emitWall/emitMeteorTrail/emitMeteorImpact"
```

---

## Task 2: Update SpellRenderer — FireWall

**Files:**
- Modify: `client/src/renderer/SpellRenderer.ts`

- [ ] **Step 1: Replace SpellRenderer.ts with the updated version**

Replace the full contents of `client/src/renderer/SpellRenderer.ts`:

```typescript
import * as THREE from 'three';
import { GameState, METEOR_DELAY_TICKS } from '@arena/shared';
import { FireParticles } from './FireParticles';

type MeteorEntry = { ring: THREE.Mesh; rock: THREE.Mesh; target: { x: number; y: number } };

export class SpellRenderer {
  private fireballs = new Map<string, THREE.Mesh>();
  private fireWalls = new Map<string, THREE.Group>();
  private meteors = new Map<string, MeteorEntry>();
  private fireParticles: FireParticles;
  private prevFireballPositions = new Map<string, { x: number; y: number; z: number }>();
  private clock = new THREE.Clock();
  private elapsedTime = 0;

  constructor(private scene: THREE.Scene) {
    this.fireParticles = new FireParticles(scene);
  }

  update(state: GameState): void {
    const delta = this.clock.getDelta();
    this.elapsedTime += delta;
    this.syncFireballs(state);
    this.syncFireWalls(state);
    this.syncMeteors(state);
    this.fireParticles.update(delta);
  }

  private syncFireballs(state: GameState): void {
    const activeIds = new Set(state.projectiles.map(p => p.id));

    for (const [id, mesh] of this.fireballs) {
      if (!activeIds.has(id)) {
        const last = this.prevFireballPositions.get(id);
        if (last) this.fireParticles.emitExplosion(last.x, last.y, last.z);
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
      this.fireParticles.emitTrail(wx, wy, wz, dirX, dirZ);
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
          const points = [
            new THREE.Vector3(seg.x1, 1, seg.y1),
            new THREE.Vector3(seg.x2, 1, seg.y2),
          ];
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4 }),
          );
          group.add(line);
        }
        this.scene.add(group);
        this.fireWalls.set(fw.id, group);
      }

      this.fireParticles.emitWall(fw.segments);
    }
  }

  private syncMeteors(state: GameState): void {
    const activeIds = new Set(state.meteors.map(m => m.id));

    for (const [id, entry] of this.meteors) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.ring);
        this.scene.remove(entry.rock);
        this.fireParticles.emitMeteorImpact(entry.target.x, 0, entry.target.y);
        this.meteors.delete(id);
      }
    }

    for (const meteor of state.meteors) {
      if (!this.meteors.has(meteor.id)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(50, 58, 32),
          new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(meteor.target.x, 2, meteor.target.y);

        const rock = new THREE.Mesh(
          new THREE.SphereGeometry(10, 4, 4),
          new THREE.MeshBasicMaterial({ color: 0xff4400 }),
        );

        this.scene.add(ring);
        this.scene.add(rock);
        this.meteors.set(meteor.id, { ring, rock, target: { ...meteor.target } });
      }

      const entry = this.meteors.get(meteor.id)!;
      const t = Math.max(0, Math.min(1, 1 - (meteor.strikeAt - state.tick) / METEOR_DELAY_TICKS));

      // Animate ring: shrink + pulse faster as strike approaches
      const scale = 1.0 - t * 0.4;
      entry.ring.scale.set(scale, 1, scale);
      const pulseFreq = 1 + t * 3; // 1Hz → 4Hz
      (entry.ring.material as THREE.MeshBasicMaterial).opacity =
        Math.sin(this.elapsedTime * pulseFreq * Math.PI * 2) * 0.3 + 0.5;

      // Animate rock: fall from y=500 to y=0
      const rockY = 500 * (1 - t);
      entry.rock.position.set(meteor.target.x, rockY, meteor.target.y);
      const rockScale = 0.4 + t * 0.6;
      entry.rock.scale.setScalar(rockScale);

      // Emit trail while falling
      this.fireParticles.emitMeteorTrail(meteor.target.x, rockY, meteor.target.y);
    }
  }

  dispose(): void {
    for (const mesh of this.fireballs.values()) this.scene.remove(mesh);
    for (const group of this.fireWalls.values()) this.scene.remove(group);
    for (const entry of this.meteors.values()) {
      this.scene.remove(entry.ring);
      this.scene.remove(entry.rock);
    }
    this.fireballs.clear();
    this.fireWalls.clear();
    this.meteors.clear();
    this.fireParticles.dispose();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects/client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run server tests to confirm no regressions**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects && npm test
```

Expected: 73 passed, 0 failed.

- [ ] **Step 4: Commit**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects
git add client/src/renderer/SpellRenderer.ts
git commit -m "feat: rewrite SpellRenderer — FireParticles, FireWall floor line, animated Meteor ring + falling rock"
```

---

## Task 3: Visual smoke test

**Files:** none — verification only

- [ ] **Step 1: Start the dev server**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects
npm run dev
```

Open the game in two browser tabs (two players). Cast FireWall (spell 2) and Meteor (spell 3). Verify:

- FireWall: thin orange floor line visible along the wall, orange particles rising upward from it
- Meteor: pulsing red ring at target, rock visible falling from above, impact explosion on strike
- Fireball: still works with trail + explosion (no regression)
- No console errors

- [ ] **Step 2: Commit smoke test confirmation note and close**

```bash
cd /Users/danielgalvez/coding/arena-game/.worktrees/feature/spell-particle-effects
git commit --allow-empty -m "chore: visual smoke test passed — FireWall particles + Meteor lifecycle confirmed"
```
