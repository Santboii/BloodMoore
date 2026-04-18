# Larger Map, Player Camera & Teleport Spell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the arena to 2000×2000 with scattered pillars, replace the fixed camera with a Diablo 2-style player-following camera with corner minimap, and add a mana-costed teleport spell.

**Architecture:** Shared constants drive the arena size — Arena.ts already reads from ARENA_SIZE and PILLARS, so updating the constants flows through automatically. A new CameraController.ts owns the lerp logic and is called each frame from main.ts. Minimap.ts is a standalone DOM canvas integrated into HUD. Teleport is SpellId 4, handled server-side in StateAdvancer alongside the existing spell switch.

**Tech Stack:** TypeScript, Three.js (client renderer), Vitest (server tests), Socket.IO

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `shared/src/types.ts` | Modify | ARENA_SIZE, PILLARS, SPAWN_POSITIONS, SpellId 4, SPELL_CONFIG[4] |
| `server/tests/physics.test.ts` | Modify | Update hasLineOfSight test for new pillar layout |
| `server/tests/stateadvancer.test.ts` | Modify | Update spawn positions, add teleport test |
| `server/src/physics/Movement.ts` | Modify | Export clampToArena |
| `server/src/gameloop/StateAdvancer.ts` | Modify | Handle spell 4 (teleport) |
| `client/src/renderer/CameraController.ts` | Create | Player-following orthographic camera with lerp |
| `client/src/renderer/Scene.ts` | Modify | Use CameraController; update frustum to 600, far plane to 3000 |
| `client/src/hud/Minimap.ts` | Create | 120×120 DOM canvas minimap |
| `client/src/hud/HUD.ts` | Modify | Add spell 4 slot, integrate Minimap |
| `client/src/input/InputHandler.ts` | Modify | Bind Digit4 key to activeSpell = 4 |
| `client/src/main.ts` | Modify | Add delta time, call scene.updateCamera() per frame |

---

## Task 1: Expand arena constants and fix broken tests

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/tests/stateadvancer.test.ts`
- Modify: `server/tests/physics.test.ts`

- [ ] **Step 1: Run the existing test suite to establish baseline**

```bash
cd /path/to/arena-game && npm test
```

Expected: all tests pass (confirms clean baseline before changes).

- [ ] **Step 2: Update shared/src/types.ts — two independent edits**

**Edit 1:** On line 3, extend SpellId to include 4:
```typescript
// Before:
export type SpellId = 1 | 2 | 3;
// After:
export type SpellId = 1 | 2 | 3 | 4;
```

**Edit 2:** Replace the constants block (lines 63–100) with the updated values. Leave everything above line 63 untouched:

```typescript
// ── Constants ──────────────────────────────────────────────────────────────

export const ARENA_SIZE = 2000;
export const PLAYER_HALF_SIZE = 16;
export const PLAYER_SPEED = 200;   // units/sec
export const TICK_RATE = 60;
export const DELTA = 1 / TICK_RATE;
export const MAX_HP = 500;
export const MAX_MANA = 300;
export const MANA_REGEN_PER_TICK = 10 / TICK_RATE;

export const PILLARS: Pillar[] = [
  { x: 350,  y: 300,  halfSize: 28 },
  { x: 1000, y: 250,  halfSize: 28 },
  { x: 1650, y: 300,  halfSize: 28 },
  { x: 400,  y: 750,  halfSize: 28 },
  { x: 1600, y: 750,  halfSize: 28 },
  { x: 1000, y: 1000, halfSize: 28 },
  { x: 350,  y: 1450, halfSize: 28 },
  { x: 750,  y: 1700, halfSize: 28 },
  { x: 1250, y: 1700, halfSize: 28 },
  { x: 1650, y: 1450, halfSize: 28 },
];

export const FIREBALL_SPEED = 400;
export const FIREBALL_RADIUS = 10; // world units

export const FIREWALL_MAX_LENGTH = 200;
export const FIREWALL_DURATION_TICKS = 4 * TICK_RATE;   // 240
export const FIREWALL_DAMAGE_PER_TICK = 40 / TICK_RATE;

export const METEOR_DELAY_TICKS = Math.round(1.5 * TICK_RATE); // 90
export const METEOR_AOE_RADIUS = 60; // world units

export const SPELL_CONFIG: Record<SpellId, { manaCost: number; cooldownTicks: number }> = {
  1: { manaCost: 25,  cooldownTicks: 30  },  // 0.5s
  2: { manaCost: 60,  cooldownTicks: 180 },  // 3s
  3: { manaCost: 100, cooldownTicks: 300 },  // 5s
  4: { manaCost: 40,  cooldownTicks: 0   },  // teleport — mana-gated, no cooldown timer
};

// Spawn positions (left and right side, centered vertically)
export const SPAWN_POSITIONS: Vec2[] = [
  { x: 200,  y: 1000 },
  { x: 1800, y: 1000 },
];
```

- [ ] **Step 3: Update stateadvancer.test.ts — spawn positions and position-specific assertions**

Replace `twoPlayerState()` and the spawn-position test in `server/tests/stateadvancer.test.ts`:

```typescript
function twoPlayerState() {
  return makeInitialState([
    { id: 'p1', displayName: 'Alice', spawnPos: { x: 200,  y: 1000 } },
    { id: 'p2', displayName: 'Bob',   spawnPos: { x: 1800, y: 1000 } },
  ]);
}
```

Update the makeInitialState position test:
```typescript
it('creates state with two players at spawn positions', () => {
  const state = twoPlayerState();
  expect(state.players['p1'].position).toEqual({ x: 200,  y: 1000 });
  expect(state.players['p2'].position).toEqual({ x: 1800, y: 1000 });
  expect(state.phase).toBe('dueling');
});
```

Update the fireball cast test aimTargets:
```typescript
describe('advanceState — fireball cast', () => {
  it('spawns a fireball and deducts mana when p1 casts spell 1', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null,       aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.projectiles.length).toBe(1);
    expect(next.players['p1'].mana).toBe(MAX_MANA - SPELL_CONFIG[1].manaCost);
  });

  it('does not cast when mana is insufficient', () => {
    const state = twoPlayerState();
    state.players['p1'].mana = 0;
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null,       aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.projectiles.length).toBe(0);
  });
});
```

Update the cooldown test aimTargets:
```typescript
describe('advanceState — cooldowns', () => {
  it('sets cooldown after casting fireball and blocks immediate re-cast', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null,       aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].cooldowns[1]).toBeGreaterThan(0);

    const next2 = advanceState(next, inputs);
    expect(next2.projectiles.length).toBe(next.projectiles.length);
  });
});
```

Update the win condition test (projectile placed at p2's new position):
```typescript
describe('advanceState — win condition', () => {
  it('sets phase to ended and winner when a player reaches 0 hp', () => {
    const state = twoPlayerState();
    state.players['p2'].hp = 1;
    state.projectiles.push({
      id: 'fb_test',
      ownerId: 'p1',
      type: 'fireball',
      position: { x: 1800, y: 1000 },
      velocity: { x: 400, y: 0 },
    });
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBe('p1');
  });
});
```

Update the fire wall damage test (wall placed at p1's new position):
```typescript
describe('advanceState — fire wall damage', () => {
  it('stacks damage from two overlapping fire walls', () => {
    const state = twoPlayerState();
    const fw1 = spawnFireWall('p2', { x: 180, y: 1000 }, { x: 220, y: 1000 }, 0);
    const fw2 = spawnFireWall('p2', { x: 180, y: 1000 }, { x: 220, y: 1000 }, 0);
    state.fireWalls.push(fw1, fw2);
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].hp).toBeCloseTo(MAX_HP - FIREWALL_DAMAGE_PER_TICK * 2, 10);
  });
});
```

Update the simultaneous death test (fireballs placed at new spawn positions):
```typescript
describe('advanceState — simultaneous death', () => {
  it('sets winner to null when both players die in the same tick', () => {
    const state = twoPlayerState();
    state.players['p1'].hp = 1;
    state.players['p2'].hp = 1;
    state.projectiles.push(
      { id: 'fb1', ownerId: 'p2', type: 'fireball', position: { x: 200,  y: 1000 }, velocity: { x: 400,  y: 0 } },
      { id: 'fb2', ownerId: 'p1', type: 'fireball', position: { x: 1800, y: 1000 }, velocity: { x: -400, y: 0 } },
    );
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBeNull();
  });
});
```

- [ ] **Step 4: Update physics.test.ts — fix hasLineOfSight test that depends on old pillar layout**

The old test fires a shot at y=400 expecting to hit the old center pillar (400,400). The new center pillar is at (1000,1000). Update the two affected tests:

```typescript
it('returns false when a pillar blocks the path', () => {
  // Shot through center pillar at (1000,1000) halfSize 28
  expect(hasLineOfSight({ x: 200, y: 1000 }, { x: 1800, y: 1000 })).toBe(false);
});

it('returns true for a path that passes above a pillar', () => {
  // y=900 passes above center pillar top edge (1000-28=972) — no other pillar at this y
  expect(hasLineOfSight({ x: 50, y: 900 }, { x: 1950, y: 900 })).toBe(true);
});
```

Also update the comment on the pillarContainsPoint test (PILLARS[2] is now (1650,300), not the center):
```typescript
describe('pillarContainsPoint', () => {
  it('returns true for a point inside a pillar', () => {
    const p = PILLARS[2]; // (1650, 300) — top-right pillar
    expect(pillarContainsPoint({ x: p.x, y: p.y })).toBe(true);
  });

  it('returns false for a point in open space', () => {
    expect(pillarContainsPoint({ x: 400, y: 100 })).toBe(false);
  });
});
```

- [ ] **Step 5: Run tests to confirm they all pass**

```bash
npm test
```

Expected: all tests pass. If TypeScript errors appear around `SpellId`, ensure the old `export type SpellId = 1 | 2 | 3;` on line 3 of types.ts was removed.

- [ ] **Step 6: Commit**

```bash
git add shared/src/types.ts server/tests/stateadvancer.test.ts server/tests/physics.test.ts
git commit -m "feat: expand arena to 2000×2000, add 10 scattered pillars, extend SpellId to include teleport (4)"
```

---

## Task 2: Export clampToArena from Movement.ts

**Files:**
- Modify: `server/src/physics/Movement.ts`

- [ ] **Step 1: Change clampToArena from private function to exported function**

In `server/src/physics/Movement.ts`, change line 37 from:

```typescript
function clampToArena(pos: Vec2): Vec2 {
```

to:

```typescript
export function clampToArena(pos: Vec2): Vec2 {
```

No other changes needed — the internal call on line 12 (`return resolvePlayerPillarCollisions(clampToArena(moved));`) continues to work.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (no behavior change).

- [ ] **Step 3: Commit**

```bash
git add server/src/physics/Movement.ts
git commit -m "refactor: export clampToArena from Movement for use by teleport handler"
```

---

## Task 3: Add teleport spell server-side

**Files:**
- Modify: `server/src/gameloop/StateAdvancer.ts`
- Modify: `server/tests/stateadvancer.test.ts`

- [ ] **Step 1: Write the failing test — add to stateadvancer.test.ts**

Add this new describe block at the end of `server/tests/stateadvancer.test.ts`:

```typescript
describe('advanceState — teleport cast (spell 4)', () => {
  it('sets player position to clamped target and deducts 40 mana', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 4 as const, aimTarget: { x: 1000, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null,       aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].position).toEqual({ x: 1000, y: 1000 });
    expect(next.players['p1'].mana).toBe(MAX_MANA - 40);
  });

  it('clamps teleport target to arena bounds', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 4 as const, aimTarget: { x: -500, y: 9999 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null,       aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].position.x).toBeGreaterThanOrEqual(16); // PLAYER_HALF_SIZE
    expect(next.players['p1'].position.y).toBeLessThanOrEqual(2000 - 16);
  });

  it('does not teleport when mana is insufficient', () => {
    const state = twoPlayerState();
    state.players['p1'].mana = 10; // less than 40
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 4 as const, aimTarget: { x: 1000, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null,       aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].position).toEqual({ x: 200, y: 1000 }); // unchanged spawn
    expect(next.players['p1'].mana).toBe(10 + MANA_REGEN_PER_TICK); // regen only, no deduction
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: 3 new tests fail with something like "Expected 200, received 200" (teleport does nothing yet) or TypeScript error about `castSpell: 4 as const` not being a valid SpellId (if types.ts wasn't updated — ensure Task 1 is complete first).

- [ ] **Step 3: Import clampToArena in StateAdvancer.ts and add teleport handler**

In `server/src/gameloop/StateAdvancer.ts`, add `clampToArena` to the import from Movement:

```typescript
import { movePlayer, clampToArena } from '../physics/Movement.ts';
```

Then in the spell cast block (the `if (spell === 1)` chain, around lines 74–80), add the teleport case:

```typescript
    if (spell === 1) {
      projectiles = [...projectiles, spawnFireball(id, p.position, input.aimTarget)];
    } else if (spell === 2 && input.aimTarget2) {
      fireWalls = [...fireWalls, spawnFireWall(id, input.aimTarget, input.aimTarget2, tick)];
    } else if (spell === 3) {
      meteors = [...meteors, spawnMeteor(id, input.aimTarget, tick)];
    } else if (spell === 4) {
      players[id] = { ...players[id], position: clampToArena(input.aimTarget) };
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: all tests pass including the 3 new teleport tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/gameloop/StateAdvancer.ts server/tests/stateadvancer.test.ts
git commit -m "feat: add teleport spell (spell 4) — instant position warp, 40 mana cost, server-side"
```

---

## Task 4: Create CameraController.ts

**Files:**
- Create: `client/src/renderer/CameraController.ts`

- [ ] **Step 1: Create the file**

Create `client/src/renderer/CameraController.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles (no test to write for a renderer class)**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors. If Three.js import errors appear, ensure `three` is in client/package.json dependencies (it already is — Arena.ts and Scene.ts import it).

- [ ] **Step 3: Commit**

```bash
git add client/src/renderer/CameraController.ts
git commit -m "feat: add CameraController — player-following isometric camera with lerp"
```

---

## Task 5: Update Scene.ts to use CameraController

**Files:**
- Modify: `client/src/renderer/Scene.ts`

- [ ] **Step 1: Update Scene.ts**

Replace the entire content of `client/src/renderer/Scene.ts` with:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/renderer/Scene.ts
git commit -m "feat: wire CameraController into Scene — player-following with 600-unit frustum, 3000 far plane"
```

---

## Task 6: Wire camera update into main.ts

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Add delta time tracking and call updateCamera in the render loop**

In `client/src/main.ts`, add a `lastFrameTime` variable before the render loop and update the loop to compute delta and call `scene.updateCamera`:

Add before `scene.startRenderLoop(...)`:
```typescript
let lastFrameTime = performance.now();
```

Update the render loop callback (replace the existing `scene.startRenderLoop(() => {` block):

```typescript
scene.startRenderLoop(() => {
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1); // cap at 100ms to avoid jumps
  lastFrameTime = now;

  if (!inputHandler || !spellRenderer) return;

  const frame = inputHandler.buildInputFrame();
  socket.sendInput(frame);

  const state = stateBuffer.getInterpolated();
  if (!state) return;

  for (const [id, player] of Object.entries(state.players)) {
    if (!playerMeshes.has(id)) {
      const colorIndex = id === myId ? myColorIndex : 1 - myColorIndex;
      const mesh = new CharacterMesh(PLAYER_COLORS[colorIndex], player.displayName, uiOverlay);
      scene.scene.add(mesh.group);
      playerMeshes.set(id, mesh);
    }
    const mesh = playerMeshes.get(id)!;
    mesh.setPosition(player.position.x, player.position.y);
    mesh.updateLabel(scene.camera, scene.renderer);
  }

  // Follow local player with camera
  const myPlayer = state.players[myId];
  if (myPlayer) {
    scene.updateCamera(myPlayer.position.x, myPlayer.position.y, delta);
  }

  spellRenderer.update(state);
  hud.update(state, inputHandler.getActiveSpell());
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test — start the dev server**

```bash
npm run dev
```

Open the game in a browser. The arena should be visible (much larger than before). If you can get into a game, the camera should follow your character and the arena boundaries should be correct.

- [ ] **Step 4: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: camera follows local player each frame with delta-time lerp"
```

---

## Task 7: Create Minimap.ts

**Files:**
- Create: `client/src/hud/Minimap.ts`

- [ ] **Step 1: Create the file**

Create `client/src/hud/Minimap.ts`:

```typescript
import { ARENA_SIZE, PILLARS, PlayerState } from '@arena/shared';

const SIZE = 120;
const SCALE = SIZE / ARENA_SIZE;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      opacity: '0.85',
      border: '1px solid #b8860b',
      borderRadius: '3px',
      zIndex: '100',
      display: 'none',
    });
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  update(localPlayer: PlayerState, opponent: PlayerState | undefined): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Arena border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, SIZE, SIZE);

    // Pillars
    ctx.fillStyle = '#6c63ff';
    for (const p of PILLARS) {
      const pw = Math.max(2, p.halfSize * 2 * SCALE);
      ctx.fillRect(p.x * SCALE - pw / 2, p.y * SCALE - pw / 2, pw, pw);
    }

    // Opponent
    if (opponent) {
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(opponent.position.x * SCALE, opponent.position.y * SCALE, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player (drawn on top of opponent)
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.arc(localPlayer.position.x * SCALE, localPlayer.position.y * SCALE, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  show(): void { this.canvas.style.display = ''; }
  hide(): void { this.canvas.style.display = 'none'; }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hud/Minimap.ts
git commit -m "feat: add Minimap — 120×120 DOM canvas overlay showing players and pillars"
```

---

## Task 8: Update HUD.ts — add teleport slot and integrate minimap

**Files:**
- Modify: `client/src/hud/HUD.ts`

- [ ] **Step 1: Replace HUD.ts**

Replace the entire content of `client/src/hud/HUD.ts` with:

```typescript
import { GameState, SpellId, SPELL_CONFIG, MAX_HP, MAX_MANA } from '@arena/shared';
import { Minimap } from './Minimap';

const SPELL_NAMES: Record<number, string> = { 1: 'FB', 2: 'FW', 3: 'MT', 4: 'TP' };

export class HUD {
  private el: HTMLElement;
  private minimap: Minimap;
  private myId = '';

  constructor(container: HTMLElement) {
    this.minimap = new Minimap(container);

    this.el = document.createElement('div');
    this.el.innerHTML = `
      <style>
        .hud-panel{position:fixed;bottom:0;left:0;right:0;height:72px;background:rgba(0,0,0,0.85);border-top:2px solid #4a3000;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
        .orb{width:52px;height:52px;border-radius:50%;position:relative;border:2px solid;overflow:hidden}
        .orb-fill{position:absolute;inset:0;transition:transform .1s}
        .orb-hp{border-color:#aa1111}.orb-hp .orb-fill{background:radial-gradient(circle at 40% 30%,#ff4444,#880000)}
        .orb-mp{border-color:#1133aa}.orb-mp .orb-fill{background:radial-gradient(circle at 40% 30%,#4488ff,#001888)}
        .spells{display:flex;gap:6px}
        .spell-slot{width:44px;height:44px;border:2px solid #555;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;color:#ccc;position:relative;overflow:hidden;cursor:pointer}
        .spell-slot.active{border-color:#ffaa00;color:#ffcc66}
        .spell-slot .cd-overlay{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);transition:height .1s}
        .enemy-bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);text-align:center;min-width:160px}
        .enemy-name{font-size:12px;color:#ffcc44;margin-bottom:4px}
        .enemy-hp-track{height:8px;background:#330000;border-radius:4px;overflow:hidden;width:160px}
        .enemy-hp-fill{height:100%;background:#cc2222;border-radius:4px;transition:width .1s}
      </style>
      <div class="enemy-bar">
        <div class="enemy-name" id="hud-enemy-name">—</div>
        <div class="enemy-hp-track"><div class="enemy-hp-fill" id="hud-enemy-hp" style="width:100%"></div></div>
      </div>
      <div class="hud-panel">
        <div class="orb orb-hp"><div class="orb-fill" id="hud-hp" style="transform:translateY(0%)"></div></div>
        <div class="spells" id="hud-spells"></div>
        <div class="orb orb-mp"><div class="orb-fill" id="hud-mp" style="transform:translateY(0%)"></div></div>
      </div>
    `;
    container.appendChild(this.el);
    this.buildSpellSlots();
  }

  private buildSpellSlots(): void {
    const spells = this.el.querySelector('#hud-spells')!;
    for (const key of [1, 2, 3, 4]) {
      const slot = document.createElement('div');
      slot.className = 'spell-slot';
      slot.id = `spell-slot-${key}`;
      slot.innerHTML = `<span>${SPELL_NAMES[key]}</span><span style="font-size:9px;color:#888">${key}</span><div class="cd-overlay" id="cd-${key}" style="height:0%"></div>`;
      spells.appendChild(slot);
    }
  }

  init(myId: string): void { this.myId = myId; }

  update(state: GameState, activeSpell: SpellId): void {
    const me = state.players[this.myId];
    if (!me) return;

    // HP / MP orbs
    (this.el.querySelector('#hud-hp') as HTMLElement).style.transform = `translateY(${(1 - me.hp / MAX_HP) * 100}%)`;
    (this.el.querySelector('#hud-mp') as HTMLElement).style.transform = `translateY(${(1 - me.mana / MAX_MANA) * 100}%)`;

    // Spell slots (1–4)
    for (const key of [1, 2, 3, 4] as SpellId[]) {
      const slot = this.el.querySelector(`#spell-slot-${key}`) as HTMLElement;
      slot.classList.toggle('active', key === activeSpell);
      const cd = me.cooldowns[key] ?? 0;
      const maxCd = SPELL_CONFIG[key].cooldownTicks;
      const pct = maxCd > 0 ? (cd / maxCd) * 100 : 0; // avoid division by zero for spell 4
      (this.el.querySelector(`#cd-${key}`) as HTMLElement).style.height = `${pct}%`;
    }

    // Enemy bar
    const enemyId = Object.keys(state.players).find(id => id !== this.myId);
    if (enemyId) {
      const enemy = state.players[enemyId];
      (this.el.querySelector('#hud-enemy-name') as HTMLElement).textContent = enemy.displayName;
      (this.el.querySelector('#hud-enemy-hp') as HTMLElement).style.width = `${(enemy.hp / MAX_HP) * 100}%`;

      // Minimap
      this.minimap.update(me, enemy);
    } else {
      this.minimap.update(me, undefined);
    }
  }

  show(): void {
    this.el.style.display = '';
    this.minimap.show();
  }

  hide(): void {
    this.el.style.display = 'none';
    this.minimap.hide();
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors. If `getActiveSpell()` in main.ts has a type mismatch (returns `1 | 2 | 3`), that's fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add client/src/hud/HUD.ts
git commit -m "feat: add teleport spell slot to HUD and integrate minimap"
```

---

## Task 9: Update InputHandler.ts — bind spell 4

**Files:**
- Modify: `client/src/input/InputHandler.ts`

- [ ] **Step 1: Extend InputHandler to support SpellId 4**

Replace `client/src/input/InputHandler.ts` with:

```typescript
import { InputFrame, SpellId } from '@arena/shared';
import { Scene } from '../renderer/Scene';

const ISO_ANGLE = -Math.PI / 4;
const ISO_COS   =  Math.cos(ISO_ANGLE); // ≈  0.7071
const ISO_SIN   =  Math.sin(ISO_ANGLE); // ≈ -0.7071

export class InputHandler {
  private keys = new Set<string>();
  private activeSpell: SpellId = 1;
  private mouseWorld = { x: 1000, y: 1000 }; // center of new arena
  private fireWallDragStart: { x: number; y: number } | null = null;
  private pendingCast: { spell: SpellId; aimTarget: { x: number; y: number }; aimTarget2?: { x: number; y: number } } | null = null;

  constructor(private scene: Scene, private canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup', this.onMouseUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Digit1') this.activeSpell = 1;
    if (e.code === 'Digit2') this.activeSpell = 2;
    if (e.code === 'Digit3') this.activeSpell = 3;
    if (e.code === 'Digit4') this.activeSpell = 4;
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private onMouseMove = (e: MouseEvent) => {
    this.mouseWorld = this.scene.screenToWorld(e.clientX, e.clientY);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.activeSpell === 2) {
      this.fireWallDragStart = this.scene.screenToWorld(e.clientX, e.clientY);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.activeSpell === 2 && this.fireWallDragStart) {
      const end = this.scene.screenToWorld(e.clientX, e.clientY);
      this.pendingCast = { spell: 2, aimTarget: this.fireWallDragStart, aimTarget2: end };
      this.fireWallDragStart = null;
    } else {
      this.pendingCast = { spell: this.activeSpell, aimTarget: this.mouseWorld };
    }
  };

  buildInputFrame(): InputFrame {
    const move = { x: 0, y: 0 };
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    move.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  move.y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  move.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.x += 1;

    // Camera azimuth is 45°, so rotate movement input by -π/4 to align screen directions.
    const rx = move.x * ISO_COS - move.y * ISO_SIN;
    const ry = move.x * ISO_SIN + move.y * ISO_COS;
    move.x = rx;
    move.y = ry;

    const frame: InputFrame = { move, castSpell: null, aimTarget: this.mouseWorld };

    if (this.pendingCast) {
      frame.castSpell = this.pendingCast.spell;
      frame.aimTarget = this.pendingCast.aimTarget;
      frame.aimTarget2 = this.pendingCast.aimTarget2;
      this.pendingCast = null;
    }

    return frame;
  }

  getActiveSpell(): SpellId { return this.activeSpell; }
  getFireWallDragStart(): { x: number; y: number } | null { return this.fireWallDragStart; }
  getCurrentMouseWorld(): { x: number; y: number } { return this.mouseWorld; }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles (entire client)**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors. The `hud.update(state, inputHandler.getActiveSpell())` call in main.ts is now correctly typed as `SpellId`.

- [ ] **Step 3: Run server tests one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Full manual test**

Start the dev server:
```bash
npm run dev
```

Open two browser tabs and start a duel. Verify:
- [ ] Arena is noticeably larger — players start far apart
- [ ] Camera follows your character smoothly (Diablo 2 feel)
- [ ] Opponent can go fully off-screen
- [ ] Minimap appears top-right showing both players and pillars as dots
- [ ] Press `4` to select teleport spell (slot highlights in HUD)
- [ ] Click anywhere on the ground while teleport is selected — character warps instantly
- [ ] Teleport deducts ~40 mana (visible in orb)
- [ ] Teleport does not fire if mana is below 40

- [ ] **Step 5: Commit**

```bash
git add client/src/input/InputHandler.ts
git commit -m "feat: bind Digit4 to teleport spell — extends SpellId to 4 throughout client"
```
