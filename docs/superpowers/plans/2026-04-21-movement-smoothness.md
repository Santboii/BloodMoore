# Movement Smoothness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate movement jitter by adding client-side prediction for the local player and time-based interpolation for remote players.

**Architecture:** Server becomes sequence-aware (tracks last processed input seq per player, includes it in broadcasts). Client predicts local movement using shared physics, reconciles on server ack. Remote players rendered via timestamp-based interpolation with adaptive jitter buffer.

**Tech Stack:** TypeScript, Socket.io, Three.js, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `shared/src/physics.ts` | Pure movement functions: `movePlayer`, `resolvePlayerPillarCollisions`, `clampToArena`, `circleHitsAABB` |
| Modify | `shared/src/index.ts` | Re-export `physics.ts` |
| Modify | `shared/src/types.ts` | Add `seq` to `InputFrame`, `ack` to `GameState` |
| Modify | `server/src/physics/Movement.ts` | Replace implementations with re-exports from shared |
| Modify | `server/src/physics/Collision.ts` | Import `circleHitsAABB` from shared instead of local |
| Modify | `server/src/rooms/Room.ts` | Track `lastProcessedSeq` per player, include in tick output |
| Modify | `server/src/index.ts` | Pass ack map when broadcasting game state |
| Create | `client/src/network/Predictor.ts` | Client-side prediction + reconciliation |
| Modify | `client/src/network/StateBuffer.ts` | Time-based interpolation with adaptive jitter buffer |
| Modify | `client/src/network/SocketClient.ts` | Accept seq on `sendInput` |
| Modify | `client/src/main.ts` | Split render paths for local vs remote players, integrate Predictor |
| Create | `shared/tests/physics.test.ts` | Tests for shared physics (ported from server) |
| Create | `client/tests/StateBuffer.test.ts` | Tests for time-based interpolation |
| Create | `client/tests/Predictor.test.ts` | Tests for prediction + reconciliation |
| Modify | `server/tests/physics.test.ts` | Update imports to test shared module |

---

### Task 1: Extract Physics to Shared Package

**Files:**
- Create: `shared/src/physics.ts`
- Modify: `shared/src/index.ts`
- Modify: `server/src/physics/Movement.ts`
- Modify: `server/src/physics/Collision.ts`

- [ ] **Step 1: Create `shared/src/physics.ts` with movement functions**

```typescript
// shared/src/physics.ts
import { Vec2, PLAYER_SPEED, PLAYER_HALF_SIZE, ARENA_SIZE, PILLARS, DELTA, Pillar } from './types.js';

export function circleHitsAABB(center: Vec2, radius: number, pillar: Pillar): boolean {
  const closestX = Math.max(pillar.x - pillar.halfSize, Math.min(center.x, pillar.x + pillar.halfSize));
  const closestY = Math.max(pillar.y - pillar.halfSize, Math.min(center.y, pillar.y + pillar.halfSize));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function clampToArena(pos: Vec2): Vec2 {
  return {
    x: Math.max(PLAYER_HALF_SIZE, Math.min(ARENA_SIZE - PLAYER_HALF_SIZE, pos.x)),
    y: Math.max(PLAYER_HALF_SIZE, Math.min(ARENA_SIZE - PLAYER_HALF_SIZE, pos.y)),
  };
}

export function resolvePlayerPillarCollisions(pos: Vec2): Vec2 {
  let p = { ...pos };
  for (const pillar of PILLARS) {
    const minX = pillar.x - pillar.halfSize - PLAYER_HALF_SIZE;
    const maxX = pillar.x + pillar.halfSize + PLAYER_HALF_SIZE;
    const minY = pillar.y - pillar.halfSize - PLAYER_HALF_SIZE;
    const maxY = pillar.y + pillar.halfSize + PLAYER_HALF_SIZE;
    if (p.x > minX && p.x < maxX && p.y > minY && p.y < maxY) {
      const dLeft   = p.x - minX;
      const dRight  = maxX - p.x;
      const dTop    = p.y - minY;
      const dBottom = maxY - p.y;
      const min = Math.min(dLeft, dRight, dTop, dBottom);
      if (min === dLeft)        p.x = minX;
      else if (min === dRight)  p.x = maxX;
      else if (min === dTop)    p.y = minY;
      else                      p.y = maxY;
    }
  }
  return p;
}

export function movePlayer(position: Vec2, input: Vec2): Vec2 {
  const len = Math.sqrt(input.x * input.x + input.y * input.y);
  if (len === 0) return position;
  const nx = input.x / len;
  const ny = input.y / len;
  const moved = {
    x: position.x + nx * PLAYER_SPEED * DELTA,
    y: position.y + ny * PLAYER_SPEED * DELTA,
  };
  return resolvePlayerPillarCollisions(clampToArena(moved));
}
```

- [ ] **Step 2: Add physics export to `shared/src/index.ts`**

Add this line at the end of `shared/src/index.ts`:

```typescript
export * from './physics.js';
```

- [ ] **Step 3: Replace `server/src/physics/Movement.ts` with re-exports**

Replace the entire file with:

```typescript
export { movePlayer, resolvePlayerPillarCollisions, clampToArena } from '@arena/shared';
```

- [ ] **Step 4: Update `server/src/physics/Collision.ts` to import from shared**

Replace the entire file with:

```typescript
import { Vec2, Pillar, PILLARS, FIREBALL_RADIUS, circleHitsAABB } from '@arena/shared';

export { circleHitsAABB };

export function pillarContainsPoint(point: Vec2): boolean {
  return PILLARS.some(p => circleHitsAABB(point, FIREBALL_RADIUS, p));
}

export function pointInAABB(point: Vec2, pillar: Pillar): boolean {
  return (
    point.x >= pillar.x - pillar.halfSize &&
    point.x <= pillar.x + pillar.halfSize &&
    point.y >= pillar.y - pillar.halfSize &&
    point.y <= pillar.y + pillar.halfSize
  );
}
```

- [ ] **Step 5: Run existing tests to verify nothing broke**

Run: `cd /Users/danielgalvez/coding/arena-game && npm test`

Expected: All existing tests pass. The `server/tests/physics.test.ts` imports from `../src/physics/Movement.ts` which now re-exports from shared — same behavior.

- [ ] **Step 6: Commit**

```bash
git add shared/src/physics.ts shared/src/index.ts server/src/physics/Movement.ts server/src/physics/Collision.ts
git commit -m "refactor: extract movement physics to shared package"
```

---

### Task 2: Add Sequence Numbers to Wire Format

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/src/rooms/Room.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add `seq` to `InputFrame` and `ack` to `GameState` in `shared/src/types.ts`**

In `InputFrame`, add `seq` as an optional field (backwards-compatible during rollout):

```typescript
export type InputFrame = {
  seq?: number;
  move: Vec2;
  castSpell: SpellId | null;
  aimTarget: Vec2;
  aimTarget2?: Vec2;
};
```

In `GameState`, add `ack`:

```typescript
export type GameState = {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  fireWalls: FireWallState[];
  meteors: MeteorState[];
  phase: 'waiting' | 'countdown' | 'dueling' | 'ended';
  winner: string | null;
  gameMode: GameModeType;
  teams?: Record<string, string[]>;
  ack?: Record<string, number>;
};
```

- [ ] **Step 2: Track `lastProcessedSeq` in `Room.ts`**

Add a field to Room and update `queueInput` and `tick`:

In the Room class, add after `private pendingInputs`:

```typescript
private lastProcessedSeq: Map<string, number> = new Map();
```

Update `queueInput` to track the sequence number:

```typescript
queueInput(socketId: string, input: InputFrame): void {
  const existing = this.pendingInputs.get(socketId);
  if (existing?.castSpell && !input.castSpell) {
    input = { ...input, castSpell: existing.castSpell, aimTarget: existing.aimTarget };
  }
  this.pendingInputs.set(socketId, input);
}
```

(No change needed in `queueInput` itself — the seq is just passed through on the input.)

Update `tick()` to extract seq from inputs and attach ack to the returned state. Replace the `tick()` method:

```typescript
tick(): GameState {
  if (!this.state) throw new Error('Room not started');
  if (this.state.phase === 'ended') return this.state;
  const inputs: Record<string, InputFrame> = {};
  for (const [id] of this.players) {
    const pending = this.pendingInputs.get(id) ?? { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } };
    if (pending.seq !== undefined) {
      this.lastProcessedSeq.set(id, pending.seq);
    }
    inputs[id] = pending;
  }
  const skillSetsObj: Record<string, Set<NodeId>> = Object.fromEntries(this.skillSets.entries());
  this.state = advanceState(this.state, inputs, skillSetsObj, this.mode);
  this.state.ack = Object.fromEntries(this.lastProcessedSeq);
  for (const [id, pending] of this.pendingInputs) {
    if (pending.castSpell) {
      this.pendingInputs.set(id, { ...pending, castSpell: null });
    }
  }
  return this.state;
}
```

Also update `reset()` to clear `lastProcessedSeq`:

```typescript
reset(): void {
  for (const p of this.players.values()) p.ready = false;
  this.state = null;
  this.pauseState = null;
  this.pendingInputs.clear();
  this.lastProcessedSeq.clear();
}
```

And update `remapPlayer` to remap `lastProcessedSeq`:

Add after the `pendingInputs` remap block:

```typescript
const seq = this.lastProcessedSeq.get(oldSocketId);
if (seq !== undefined) {
  this.lastProcessedSeq.delete(oldSocketId);
  this.lastProcessedSeq.set(newSocketId, seq);
}
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `cd /Users/danielgalvez/coding/arena-game && npm test`

Expected: All tests pass. The `ack` field is optional so existing test assertions on GameState structure still work.

- [ ] **Step 4: Commit**

```bash
git add shared/src/types.ts server/src/rooms/Room.ts
git commit -m "feat: add input sequence numbers and server ack to wire format"
```

---

### Task 3: Time-Based Interpolation for StateBuffer

**Files:**
- Modify: `client/src/network/StateBuffer.ts`
- Create: `client/tests/StateBuffer.test.ts`

- [ ] **Step 1: Write failing tests for time-based interpolation**

Create `client/tests/StateBuffer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { StateBuffer } from '../src/network/StateBuffer';
import { GameState, PlayerState } from '@arena/shared';

function makeState(tick: number, px: number, py: number, id = 'p1'): GameState {
  const player: PlayerState = {
    id, displayName: 'Test', position: { x: px, y: py },
    hp: 750, mana: 500, facing: 0, castingSpell: null, cooldowns: {},
  };
  return {
    tick, players: { [id]: player }, projectiles: [], fireWalls: [],
    meteors: [], phase: 'dueling', winner: null, gameMode: '1v1',
  };
}

describe('StateBuffer time-based interpolation', () => {
  let buffer: StateBuffer;

  beforeEach(() => {
    buffer = new StateBuffer();
  });

  it('returns null with fewer than 2 snapshots', () => {
    expect(buffer.getInterpolated(1000)).toBeNull();
    buffer.push(makeState(1, 100, 100), 1000);
    expect(buffer.getInterpolated(1000)).toBeNull();
  });

  it('interpolates between two snapshots based on time', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    buffer.push(makeState(3, 300, 300), 1033.33);
    // renderTime should be ~2 ticks behind latest
    // With 3 snapshots and render delay, we interpolate between snap 1 and 2
    const state = buffer.getInterpolated(1033.33);
    expect(state).not.toBeNull();
    const pos = state!.players['p1'].position;
    // Should be somewhere between 100 and 200
    expect(pos.x).toBeGreaterThanOrEqual(100);
    expect(pos.x).toBeLessThanOrEqual(200);
  });

  it('clamps to latest available snapshot when renderTime is ahead', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    // Ask for far future — should clamp to latest
    const state = buffer.getInterpolated(5000);
    expect(state).not.toBeNull();
    expect(state!.players['p1'].position.x).toBe(200);
  });

  it('clamps to earliest available snapshot when renderTime is behind', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    // Ask for distant past — should clamp to earliest
    const state = buffer.getInterpolated(500);
    expect(state).not.toBeNull();
    expect(state!.players['p1'].position.x).toBe(100);
  });

  it('handles player joining mid-game (only in later snapshots)', () => {
    buffer.push(makeState(1, 100, 100, 'p1'), 1000);
    const s2 = makeState(2, 200, 200, 'p1');
    s2.players['p2'] = {
      id: 'p2', displayName: 'New', position: { x: 500, y: 500 },
      hp: 750, mana: 500, facing: 0, castingSpell: null, cooldowns: {},
    };
    buffer.push(s2, 1016.67);
    const state = buffer.getInterpolated(1016.67);
    expect(state).not.toBeNull();
    // p2 only exists in snapshot 2 — should use its position directly
    expect(state!.players['p2'].position.x).toBe(500);
  });

  it('interpolates facing angle', () => {
    const s1 = makeState(1, 100, 100);
    s1.players['p1'].facing = 0;
    const s2 = makeState(2, 200, 200);
    s2.players['p1'].facing = Math.PI;
    buffer.push(s1, 1000);
    buffer.push(s2, 1016.67);
    buffer.push(makeState(3, 300, 300), 1033.33);
    const state = buffer.getInterpolated(1033.33);
    expect(state).not.toBeNull();
    // Facing should be interpolated, not snapped
    expect(state!.players['p1'].facing).not.toBe(0);
    expect(state!.players['p1'].facing).not.toBe(Math.PI);
  });
});
```

- [ ] **Step 2: Ensure client has a vitest config**

Check if `client/vitest.config.ts` or similar exists. If not, add a test script to `client/package.json`:

```json
"scripts": {
  "test": "vitest run"
}
```

And ensure vitest is a dev dependency in client/package.json. Run:

```bash
cd /Users/danielgalvez/coding/arena-game/client && npx vitest run tests/StateBuffer.test.ts
```

Expected: Tests FAIL because `StateBuffer.push` doesn't accept a timestamp and `getInterpolated` doesn't accept a time parameter.

- [ ] **Step 3: Implement time-based StateBuffer**

Replace `client/src/network/StateBuffer.ts` entirely:

```typescript
import { GameState, PlayerState, Vec2 } from '@arena/shared';

type TimestampedSnapshot = {
  state: GameState;
  receivedAt: number; // performance.now() timestamp
};

export class StateBuffer {
  private snapshots: TimestampedSnapshot[] = [];
  private readonly maxSnapshots = 20;
  private renderDelayMs = 33.33; // ~2 ticks at 60Hz
  private avgInterval = 16.67; // estimated ms between server ticks
  private jitterVariance = 0;
  private lastArrival = 0;

  push(state: GameState, now = performance.now()): void {
    if (this.lastArrival > 0 && this.snapshots.length > 0) {
      const interval = now - this.lastArrival;
      this.avgInterval = this.avgInterval * 0.9 + interval * 0.1;
      const jitter = Math.abs(interval - this.avgInterval);
      this.jitterVariance = this.jitterVariance * 0.9 + jitter * 0.1;
      this.renderDelayMs = this.avgInterval * 2 + this.jitterVariance * 2;
    }
    this.lastArrival = now;
    this.snapshots.push({ state, receivedAt: now });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  getInterpolated(now = performance.now()): GameState | null {
    if (this.snapshots.length < 2) return null;

    const renderTime = now - this.renderDelayMs;

    // Find the two snapshots bracketing renderTime
    let i = 0;
    for (; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i + 1].receivedAt >= renderTime) break;
    }
    // Clamp: if renderTime is before all snapshots, use first pair
    // If renderTime is after all snapshots, use last pair
    i = Math.max(0, Math.min(i, this.snapshots.length - 2));

    const a = this.snapshots[i];
    const b = this.snapshots[i + 1];

    const span = b.receivedAt - a.receivedAt;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.receivedAt) / span)) : 1;

    const players: Record<string, PlayerState> = {};
    for (const id of Object.keys(b.state.players)) {
      const pa = a.state.players[id];
      const pb = b.state.players[id];
      if (!pa) {
        players[id] = pb;
        continue;
      }
      players[id] = {
        ...pb,
        position: lerpVec2(pa.position, pb.position, t),
        facing: lerpAngle(pa.facing, pb.facing, t),
      };
    }

    return { ...b.state, players };
  }

  getLatest(): GameState | null {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1].state;
  }

  clear(): void {
    this.snapshots = [];
    this.lastArrival = 0;
    this.renderDelayMs = 33.33;
    this.avgInterval = 16.67;
    this.jitterVariance = 0;
  }
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}
```

- [ ] **Step 4: Run StateBuffer tests**

Run: `cd /Users/danielgalvez/coding/arena-game/client && npx vitest run tests/StateBuffer.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Run all server tests to verify no regressions**

Run: `cd /Users/danielgalvez/coding/arena-game && npm test`

Expected: All server tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/network/StateBuffer.ts client/tests/StateBuffer.test.ts
git commit -m "feat: time-based interpolation with adaptive jitter buffer"
```

---

### Task 4: Client-Side Predictor

**Files:**
- Create: `client/src/network/Predictor.ts`
- Create: `client/tests/Predictor.test.ts`

- [ ] **Step 1: Write failing tests for Predictor**

Create `client/tests/Predictor.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Predictor } from '../src/network/Predictor';
import { Vec2 } from '@arena/shared';

describe('Predictor', () => {
  let predictor: Predictor;

  beforeEach(() => {
    predictor = new Predictor({ x: 500, y: 500 });
  });

  it('applies movement input locally', () => {
    predictor.applyInput({ x: 1, y: 0 }, 1);
    const pos = predictor.getPosition();
    // Should have moved right by PLAYER_SPEED * DELTA ≈ 3.33
    expect(pos.x).toBeGreaterThan(500);
    expect(pos.y).toBe(500);
  });

  it('returns sequential sequence numbers', () => {
    const seq1 = predictor.applyInput({ x: 1, y: 0 }, 1);
    const seq2 = predictor.applyInput({ x: 0, y: 1 }, 2);
    expect(seq2).toBe(seq1 + 1);
  });

  it('does not correct when server position matches prediction', () => {
    const seq = predictor.applyInput({ x: 1, y: 0 }, 1);
    const predicted = predictor.getPosition();
    // Server confirms same position
    predictor.reconcile(predicted, seq);
    expect(predictor.getPosition().x).toBeCloseTo(predicted.x, 1);
  });

  it('corrects to server position when prediction diverges', () => {
    const seq = predictor.applyInput({ x: 1, y: 0 }, 1);
    const serverPos = { x: 510, y: 500 };
    predictor.reconcile(serverPos, seq);
    // After reconciliation with no pending inputs, should match server
    const pos = predictor.getPosition();
    expect(pos.x).toBeCloseTo(510, 1);
  });

  it('replays unacknowledged inputs after correction', () => {
    const seq1 = predictor.applyInput({ x: 1, y: 0 }, 1);
    const seq2 = predictor.applyInput({ x: 1, y: 0 }, 2);
    // Server acks only seq1 but with a slightly different position
    const serverPos = { x: 504, y: 500 };
    predictor.reconcile(serverPos, seq1);
    const pos = predictor.getPosition();
    // Should be serverPos + replay of seq2's movement
    expect(pos.x).toBeGreaterThan(504);
  });

  it('snaps to server on buffer overflow', () => {
    // Fill buffer beyond limit
    for (let i = 0; i < 35; i++) {
      predictor.applyInput({ x: 1, y: 0 }, i + 1);
    }
    const serverPos = { x: 600, y: 600 };
    predictor.reconcile(serverPos, 1);
    const pos = predictor.getPosition();
    // Buffer overflow — should hard snap, position near server
    expect(pos.x).toBeCloseTo(600, 0);
    expect(pos.y).toBeCloseTo(600, 0);
  });

  it('resets clears all state', () => {
    predictor.applyInput({ x: 1, y: 0 }, 1);
    predictor.reset({ x: 200, y: 300 });
    expect(predictor.getPosition()).toEqual({ x: 200, y: 300 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/danielgalvez/coding/arena-game/client && npx vitest run tests/Predictor.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Predictor**

Create `client/src/network/Predictor.ts`:

```typescript
import { Vec2 } from '@arena/shared';
import { movePlayer } from '@arena/shared';

type BufferedInput = {
  seq: number;
  move: Vec2;
};

const MAX_BUFFER_SIZE = 30;
const RECONCILE_TOLERANCE = 0.5;
const CORRECTION_DURATION_MS = 100;

export class Predictor {
  private position: Vec2;
  private seq = 0;
  private buffer: BufferedInput[] = [];
  private correctionOffset: Vec2 = { x: 0, y: 0 };
  private correctionStartTime = 0;
  private correctionDurationMs = CORRECTION_DURATION_MS;

  constructor(initialPosition: Vec2) {
    this.position = { ...initialPosition };
  }

  applyInput(move: Vec2, _tick: number): number {
    this.seq++;
    this.position = movePlayer(this.position, move);
    this.buffer.push({ seq: this.seq, move });
    return this.seq;
  }

  reconcile(serverPosition: Vec2, ackSeq: number): void {
    // Discard acknowledged inputs
    this.buffer = this.buffer.filter(b => b.seq > ackSeq);

    // Buffer overflow — hard snap
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.position = { ...serverPosition };
      this.buffer = [];
      this.correctionOffset = { x: 0, y: 0 };
      return;
    }

    // Replay unacknowledged inputs from server position
    let replayPos = { ...serverPosition };
    for (const input of this.buffer) {
      replayPos = movePlayer(replayPos, input.move);
    }

    // Check if correction needed
    const dx = replayPos.x - this.position.x;
    const dy = replayPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > RECONCILE_TOLERANCE) {
      this.correctionOffset = {
        x: this.position.x - replayPos.x,
        y: this.position.y - replayPos.y,
      };
      this.correctionStartTime = performance.now();
      this.position = replayPos;
    }
  }

  getPosition(now = performance.now()): Vec2 {
    if (this.correctionOffset.x === 0 && this.correctionOffset.y === 0) {
      return { ...this.position };
    }
    const elapsed = now - this.correctionStartTime;
    const t = Math.min(1, elapsed / this.correctionDurationMs);
    const remaining = 1 - t;
    return {
      x: this.position.x + this.correctionOffset.x * remaining,
      y: this.position.y + this.correctionOffset.y * remaining,
    };
  }

  reset(position: Vec2): void {
    this.position = { ...position };
    this.buffer = [];
    this.seq = 0;
    this.correctionOffset = { x: 0, y: 0 };
  }

  getSeq(): number {
    return this.seq;
  }
}
```

- [ ] **Step 4: Run Predictor tests**

Run: `cd /Users/danielgalvez/coding/arena-game/client && npx vitest run tests/Predictor.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/network/Predictor.ts client/tests/Predictor.test.ts
git commit -m "feat: client-side movement predictor with server reconciliation"
```

---

### Task 5: Integrate Predictor into Render Loop

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Import Predictor and wire up state**

At the top of `main.ts`, add the import:

```typescript
import { Predictor } from './network/Predictor';
```

Add state variable after `let deathOrder: string[] = [];`:

```typescript
let predictor: Predictor | null = null;
```

- [ ] **Step 2: Initialize predictor on game state received**

In the `onGameState` handler (the `socket.onGameState` callback around line 251), add predictor initialization when the game starts:

Replace:
```typescript
socket.onGameState((state: GameState) => {
  if (!spellRenderer) {
    stateBuffer.clear();
    startGame();
    lobby.hide();
  }
  stateBuffer.push(state);
});
```

With:
```typescript
socket.onGameState((state: GameState) => {
  if (!spellRenderer) {
    stateBuffer.clear();
    startGame();
    lobby.hide();
  }
  const now = performance.now();
  stateBuffer.push(state, now);

  // Initialize predictor from first state containing our player
  if (!predictor && state.players[myId]) {
    predictor = new Predictor(state.players[myId].position);
  }

  // Reconcile predictor with server-acknowledged position
  if (predictor && state.players[myId] && state.ack) {
    const ackSeq = state.ack[myId];
    if (ackSeq !== undefined) {
      predictor.reconcile(state.players[myId].position, ackSeq);
    }
  }
});
```

- [ ] **Step 3: Update render loop to use prediction for local player**

Replace the render loop (the `scene.startRenderLoop` callback, lines 384-431):

```typescript
let lastFrameTime = performance.now();

scene.startRenderLoop(() => {
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  if (!inputHandler || !spellRenderer) return;

  const frame = inputHandler.buildInputFrame();

  // Apply prediction for local player
  if (predictor) {
    const seq = predictor.applyInput(frame.move, now);
    frame.seq = seq;
  }

  socket.sendInput(frame);

  const state = stateBuffer.getInterpolated(now);
  if (!state) return;

  // Clean up meshes for departed players
  for (const [id, mesh] of playerMeshes) {
    if (!(id in state.players)) {
      mesh.dispose(uiOverlay);
      playerMeshes.delete(id);
    }
  }

  for (const [id, player] of Object.entries(state.players)) {
    if (player.hp <= 0 && !deathOrder.includes(id)) {
      deathOrder.push(id);
    }
    if (!playerMeshes.has(id)) {
      const playerIds = Object.keys(state.players);
      const colorIndex = playerIds.indexOf(id) % Object.keys(PLAYER_COLORS).length;
      const gltf = assets.characters.pool[colorIndex] ?? assets.characters.pool[0];
      const mesh = new CharacterMesh(gltf, PLAYER_COLORS[colorIndex], player.displayName, uiOverlay);
      scene.scene.add(mesh.group);
      playerMeshes.set(id, mesh);
    }
    const mesh = playerMeshes.get(id)!;

    // Local player uses predicted position, remote players use interpolated
    if (id === myId && predictor) {
      const predicted = predictor.getPosition(now);
      mesh.setPosition(predicted.x, predicted.y, player.facing);
    } else {
      mesh.setPosition(player.position.x, player.position.y, player.facing);
    }

    mesh.update(delta, player.castingSpell !== null);
    if (player.hp <= 0) mesh.die();
    mesh.updateLabel(scene.camera, scene.renderer);
  }

  // Camera follows predicted position for local player
  if (predictor && state.players[myId]) {
    const predicted = predictor.getPosition(now);
    scene.updateCamera(predicted.x, predicted.y, delta);
  } else {
    const myPlayer = state.players[myId];
    if (myPlayer) {
      scene.updateCamera(myPlayer.position.x, myPlayer.position.y, delta);
    }
  }

  spellRenderer.update(state);
  hud.update(state, inputHandler.getActiveSpell());
});
```

- [ ] **Step 4: Reset predictor on game stop and rematch**

In `stopGame()` function, add:

```typescript
function stopGame(): void {
  inputHandler?.dispose();
  inputHandler = null;
  spellRenderer?.dispose();
  spellRenderer = null;
  for (const mesh of playerMeshes.values()) mesh.dispose(uiOverlay);
  playerMeshes.clear();
  hud.hide();
  stateBuffer.clear();
  predictor = null;
  deathOrder = [];
  readyPlayers = new Set();
}
```

- [ ] **Step 5: Add visibility change handler for tab-away edge case**

Add after the `assetsReady` block at the bottom of `main.ts`:

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden && predictor) {
    const latest = stateBuffer.getLatest();
    if (latest?.players[myId]) {
      predictor.reset(latest.players[myId].position);
    }
  }
});
```

- [ ] **Step 6: Verify the app builds**

Run: `cd /Users/danielgalvez/coding/arena-game && npm run dev:client -- --mode development 2>&1 | head -20`

Expected: Vite dev server starts without TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: integrate client-side prediction and time-based interpolation into render loop"
```

---

### Task 6: Update Server Physics Imports

**Files:**
- Modify: `server/tests/physics.test.ts`

- [ ] **Step 1: Update test imports to also verify shared module**

The existing `server/tests/physics.test.ts` imports from `../src/physics/Movement.ts` which re-exports from shared. The tests already verify the shared module indirectly. But let's also add a direct import test to be explicit.

Add at the top of `server/tests/physics.test.ts`, change:

```typescript
import { movePlayer, resolvePlayerPillarCollisions } from '../src/physics/Movement.ts';
import { circleHitsAABB, pillarContainsPoint } from '../src/physics/Collision.ts';
```

To:

```typescript
import { movePlayer, resolvePlayerPillarCollisions, clampToArena, circleHitsAABB } from '@arena/shared';
import { pillarContainsPoint } from '../src/physics/Collision.ts';
```

- [ ] **Step 2: Run all server tests**

Run: `cd /Users/danielgalvez/coding/arena-game && npm test`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/tests/physics.test.ts
git commit -m "test: update physics test imports to use shared module"
```

---

### Task 7: Manual Testing and Tuning

**Files:** None (testing only)

- [ ] **Step 1: Start the dev servers**

Run: `cd /Users/danielgalvez/coding/arena-game && npm run dev`

- [ ] **Step 2: Test with no latency**

Open browser to localhost. Create a room and play. Verify:
- Local player movement feels instant and smooth
- No visible jitter when moving around pillars
- Camera follows smoothly without lag

- [ ] **Step 3: Test with simulated latency**

Open Chrome DevTools → Network → Throttling → Add custom profile with 50ms latency. Verify:
- Local player still feels responsive
- Remote players (open second browser tab) move smoothly
- No snapping or teleporting on reconciliation

- [ ] **Step 4: Test with 200ms latency**

Increase throttle to 200ms. Verify:
- Local player still responds immediately to input
- Some visual correction may occur near pillars (acceptable)
- Remote players are smooth but slightly delayed (expected)

- [ ] **Step 5: Test edge cases**

- Switch tabs and come back — player should snap to correct position
- Disconnect and reconnect — game should resume correctly
- Walk into pillars from various angles — collision should be identical to server

- [ ] **Step 6: Tune if needed**

If jitter persists, adjust these values:
- `StateBuffer.renderDelayMs` initial value (increase for more smoothness, decrease for less delay)
- `Predictor.CORRECTION_DURATION_MS` (increase for smoother corrections, decrease for snappier)
- `Predictor.RECONCILE_TOLERANCE` (increase to ignore tiny differences, decrease for tighter sync)
