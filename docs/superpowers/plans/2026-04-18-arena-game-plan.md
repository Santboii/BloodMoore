# Arena Dueling Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based real-time isometric PvP arena dueling game where two anonymous players duel as Fire Sorceresses.

**Architecture:** Authoritative 60-tick Node.js game server over Socket.io; Vite+TypeScript+Three.js client with orthographic isometric camera and state interpolation. All physics, collision, and spell logic runs server-side. Client renders received state and sends raw inputs only.

**Tech Stack:** Vite, TypeScript, Three.js, Node.js, Express, Socket.io, npm workspaces, Vitest (server tests)

---

## File Map

```
arena-game/
├── package.json                        # npm workspaces root
├── shared/
│   ├── package.json
│   └── src/
│       └── types.ts                    # All shared types, constants, PILLARS config
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                    # Express + Socket.io entry, room routing
│   │   ├── rooms/
│   │   │   ├── Room.ts                 # Single room: players, state, game loop ref
│   │   │   └── RoomManager.ts          # Create/find/destroy rooms
│   │   ├── physics/
│   │   │   ├── Movement.ts             # movePlayer(), resolvePlayerPillarCollisions()
│   │   │   ├── Collision.ts            # pillarContainsPoint(), circleHitsAABB()
│   │   │   └── LineOfSight.ts          # hasLineOfSight(), rayIntersectsAABB()
│   │   ├── spells/
│   │   │   ├── Fireball.ts             # spawnFireball(), advanceFireball(), fireballHitsPlayer()
│   │   │   ├── FireWall.ts             # spawnFireWall(), buildWallSegments(), fireWallDamagesPlayer()
│   │   │   └── Meteor.ts               # spawnMeteor(), meteorDetonates(), meteorHitsPlayer()
│   │   └── gameloop/
│   │       ├── StateAdvancer.ts        # advanceState() — one tick of game logic
│   │       └── GameLoop.ts             # start/stop 60Hz setInterval, calls advanceState
│   └── tests/
│       ├── physics.test.ts
│       ├── fireball.test.ts
│       ├── firewall.test.ts
│       ├── meteor.test.ts
│       └── stateadvancer.test.ts
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.ts                     # Entry: route between lobby and game
        ├── renderer/
        │   ├── Scene.ts                # Three.js scene, orthographic camera, render loop
        │   ├── Arena.ts                # Floor mesh + 5 pillar meshes
        │   ├── CharacterMesh.ts        # Per-player mesh + name label
        │   └── SpellRenderer.ts        # Fireball particles, fire wall planes, meteor warning
        ├── network/
        │   ├── SocketClient.ts         # Socket.io connection, typed emit/on wrappers
        │   └── StateBuffer.ts          # Ring buffer of snapshots, getInterpolatedState()
        ├── input/
        │   └── InputHandler.ts         # WASD, mouse, spell key (1/2/3), fire wall drag
        ├── hud/
        │   └── HUD.ts                  # DOM overlay: HP/MP orbs, spell slots, enemy HP bar
        └── lobby/
            └── LobbyUI.ts              # Create room / join room / ready screens
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `shared/package.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`

- [ ] **Step 1: Write root package.json**

```json
{
  "name": "arena-game",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev:server": "npm run dev --workspace=server",
    "dev:client": "npm run dev --workspace=client",
    "test": "npm run test --workspace=server"
  }
}
```

- [ ] **Step 2: Write shared/package.json**

```json
{
  "name": "@arena/shared",
  "version": "1.0.0",
  "main": "src/types.ts",
  "types": "src/types.ts"
}
```

- [ ] **Step 3: Write server/package.json**

```json
{
  "name": "@arena/server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch --loader ts-node/esm src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@arena/shared": "*",
    "express": "^4.18.2",
    "nanoid": "^5.0.7",
    "socket.io": "^4.7.4"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

- [ ] **Step 4: Write server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": { "@arena/shared": ["../shared/src/types.ts"] }
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: Write client/package.json**

```json
{
  "name": "@arena/client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "@arena/shared": "*",
    "socket.io-client": "^4.7.4",
    "three": "^0.170.0"
  },
  "devDependencies": {
    "@types/three": "^0.170.0",
    "typescript": "^5.3.3",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 6: Write client/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "paths": { "@arena/shared": ["../shared/src/types.ts"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 7: Write client/vite.config.ts**

```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@arena/shared': resolve(__dirname, '../shared/src/types.ts') },
  },
  server: { proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } } },
});
```

- [ ] **Step 8: Write client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Arena</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a12; color: #fff; font-family: sans-serif; overflow: hidden; }
    #canvas-container { position: fixed; inset: 0; }
    #ui-overlay { position: fixed; inset: 0; pointer-events: none; }
    #ui-overlay > * { pointer-events: auto; }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <div id="ui-overlay"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 9: Install dependencies**

```bash
npm install
```

Expected: node_modules created in root, server, client, and shared workspaces resolved.

- [ ] **Step 10: Commit**

```bash
git add package.json shared/package.json server/package.json server/tsconfig.json client/package.json client/tsconfig.json client/vite.config.ts client/index.html
git commit -m "feat: scaffold monorepo with workspaces"
```

---

### Task 2: Shared Types & Constants

**Files:**
- Create: `shared/src/types.ts`

- [ ] **Step 1: Write shared/src/types.ts**

```ts
export type Vec2 = { x: number; y: number };

export type PlayerState = {
  id: string;
  displayName: string;
  position: Vec2;
  hp: number;
  mana: number;
  facing: number;
  castingSpell: number | null;
  cooldowns: Record<number, number>; // spell key -> ticks remaining
};

export type Projectile = {
  id: string;
  ownerId: string;
  type: 'fireball';
  position: Vec2;
  velocity: Vec2;
};

export type FireWallState = {
  id: string;
  ownerId: string;
  segments: { x1: number; y1: number; x2: number; y2: number }[];
  expiresAt: number; // server tick
};

export type MeteorState = {
  id: string;
  ownerId: string;
  target: Vec2;
  strikeAt: number; // server tick
};

export type GameState = {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  fireWalls: FireWallState[];
  meteors: MeteorState[];
  phase: 'waiting' | 'countdown' | 'dueling' | 'ended';
  winner: string | null;
};

export type InputFrame = {
  move: Vec2;
  castSpell: 1 | 2 | 3 | null;
  aimTarget: Vec2;
  aimTarget2?: Vec2; // drag end for Fire Wall
};

export type Pillar = { x: number; y: number; halfSize: number };

// ── Constants ──────────────────────────────────────────────────────────────

export const ARENA_SIZE = 800;
export const PLAYER_HALF_SIZE = 16;
export const PLAYER_SPEED = 200;   // units/sec
export const TICK_RATE = 60;
export const DELTA = 1 / TICK_RATE;
export const MAX_HP = 500;
export const MAX_MANA = 300;
export const MANA_REGEN_PER_TICK = 10 / TICK_RATE;

export const PILLARS: Pillar[] = [
  { x: 160, y: 160, halfSize: 28 },
  { x: 640, y: 160, halfSize: 28 },
  { x: 400, y: 400, halfSize: 28 },
  { x: 160, y: 640, halfSize: 28 },
  { x: 640, y: 640, halfSize: 28 },
];

export const FIREBALL_SPEED = 400;
export const FIREBALL_RADIUS = 10;

export const FIREWALL_MAX_LENGTH = 200;
export const FIREWALL_DURATION_TICKS = 4 * TICK_RATE;   // 240
export const FIREWALL_DAMAGE_PER_TICK = 40 / TICK_RATE;

export const METEOR_DELAY_TICKS = Math.round(1.5 * TICK_RATE); // 90
export const METEOR_AOE_RADIUS = 60;

export const SPELL_CONFIG: Record<number, { manaCost: number; cooldownTicks: number }> = {
  1: { manaCost: 25,  cooldownTicks: 30  },  // 0.5s
  2: { manaCost: 60,  cooldownTicks: 180 },  // 3s
  3: { manaCost: 100, cooldownTicks: 300 },  // 5s
};

// Spawn positions (left and right side, centered vertically)
export const SPAWN_POSITIONS: Vec2[] = [
  { x: 80,  y: 400 },
  { x: 720, y: 400 },
];
```

- [ ] **Step 2: Commit**

```bash
git add shared/src/types.ts
git commit -m "feat: add shared types and game constants"
```

---

### Task 3: Server Physics — Movement & Collision

**Files:**
- Create: `server/src/physics/Movement.ts`
- Create: `server/src/physics/Collision.ts`
- Create: `server/tests/physics.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/physics.test.ts
import { describe, it, expect } from 'vitest';
import { movePlayer } from '../src/physics/Movement.ts';
import { resolvePlayerPillarCollisions } from '../src/physics/Movement.ts';
import { circleHitsAABB, pillarContainsPoint } from '../src/physics/Collision.ts';
import { PILLARS, ARENA_SIZE, PLAYER_HALF_SIZE } from '@arena/shared';

describe('movePlayer', () => {
  it('moves in the given direction scaled by speed and delta', () => {
    const pos = { x: 400, y: 400 };
    const result = movePlayer(pos, { x: 1, y: 0 });
    // PLAYER_SPEED=200, DELTA=1/60 → ~3.33 units
    expect(result.x).toBeCloseTo(400 + 200 / 60, 1);
    expect(result.y).toBe(400);
  });

  it('normalizes diagonal input so diagonal speed equals cardinal speed', () => {
    const pos = { x: 400, y: 400 };
    const diag = movePlayer(pos, { x: 1, y: 1 });
    const card = movePlayer(pos, { x: 1, y: 0 });
    const diagDist = Math.sqrt((diag.x - 400) ** 2 + (diag.y - 400) ** 2);
    const cardDist = Math.abs(card.x - 400);
    expect(diagDist).toBeCloseTo(cardDist, 1);
  });

  it('clamps position to arena bounds', () => {
    const result = movePlayer({ x: 5, y: 400 }, { x: -1, y: 0 });
    expect(result.x).toBeGreaterThanOrEqual(PLAYER_HALF_SIZE);
  });

  it('returns unchanged position for zero input', () => {
    const pos = { x: 400, y: 400 };
    expect(movePlayer(pos, { x: 0, y: 0 })).toEqual(pos);
  });
});

describe('resolvePlayerPillarCollisions', () => {
  it('pushes player out of a pillar', () => {
    const pillar = PILLARS[0]; // x:160 y:160 halfSize:28
    // Place player inside pillar
    const inside = { x: pillar.x, y: pillar.y };
    const resolved = resolvePlayerPillarCollisions(inside);
    // After resolution player should not overlap
    const dx = Math.abs(resolved.x - pillar.x);
    const dy = Math.abs(resolved.y - pillar.y);
    expect(dx >= pillar.halfSize + PLAYER_HALF_SIZE || dy >= pillar.halfSize + PLAYER_HALF_SIZE).toBe(true);
  });

  it('leaves player unchanged when not overlapping any pillar', () => {
    const pos = { x: 400, y: 100 }; // open area, no pillar nearby
    expect(resolvePlayerPillarCollisions(pos)).toEqual(pos);
  });
});

describe('circleHitsAABB', () => {
  it('returns true when circle overlaps box', () => {
    const pillar = PILLARS[0];
    expect(circleHitsAABB({ x: pillar.x, y: pillar.y }, 5, pillar)).toBe(true);
  });

  it('returns false when circle is outside box', () => {
    const pillar = PILLARS[0];
    expect(circleHitsAABB({ x: 400, y: 400 }, 5, pillar)).toBe(false);
  });
});

describe('pillarContainsPoint', () => {
  it('returns true for a point inside a pillar', () => {
    const p = PILLARS[2]; // center pillar at 400,400
    expect(pillarContainsPoint({ x: p.x, y: p.y })).toBe(true);
  });

  it('returns false for a point in open space', () => {
    expect(pillarContainsPoint({ x: 400, y: 100 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd server && npx vitest run tests/physics.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Write server/src/physics/Collision.ts**

```ts
import { Vec2, Pillar, PILLARS, FIREBALL_RADIUS } from '@arena/shared';

export function circleHitsAABB(center: Vec2, radius: number, pillar: Pillar): boolean {
  const closestX = Math.max(pillar.x - pillar.halfSize, Math.min(center.x, pillar.x + pillar.halfSize));
  const closestY = Math.max(pillar.y - pillar.halfSize, Math.min(center.y, pillar.y + pillar.halfSize));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

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

- [ ] **Step 4: Write server/src/physics/Movement.ts**

```ts
import { Vec2, PLAYER_SPEED, PLAYER_HALF_SIZE, ARENA_SIZE, PILLARS, DELTA } from '@arena/shared';
import { pointInAABB } from './Collision.ts';

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

export function resolvePlayerPillarCollisions(pos: Vec2): Vec2 {
  let p = { ...pos };
  for (const pillar of PILLARS) {
    const minX = pillar.x - pillar.halfSize - 16;
    const maxX = pillar.x + pillar.halfSize + 16;
    const minY = pillar.y - pillar.halfSize - 16;
    const maxY = pillar.y + pillar.halfSize + 16;
    if (p.x > minX && p.x < maxX && p.y > minY && p.y < maxY) {
      const dLeft   = p.x - minX;
      const dRight  = maxX - p.x;
      const dTop    = p.y - minY;
      const dBottom = maxY - p.y;
      const min = Math.min(dLeft, dRight, dTop, dBottom);
      if (min === dLeft)   p.x = minX;
      else if (min === dRight)  p.x = maxX;
      else if (min === dTop)    p.y = minY;
      else                      p.y = maxY;
    }
  }
  return p;
}

function clampToArena(pos: Vec2): Vec2 {
  return {
    x: Math.max(PLAYER_HALF_SIZE, Math.min(ARENA_SIZE - PLAYER_HALF_SIZE, pos.x)),
    y: Math.max(PLAYER_HALF_SIZE, Math.min(ARENA_SIZE - PLAYER_HALF_SIZE, pos.y)),
  };
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
cd server && npx vitest run tests/physics.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/physics/ server/tests/physics.test.ts
git commit -m "feat: server physics — movement, bounds clamping, pillar collision"
```

---

### Task 4: Server Physics — Line-of-Sight

**Files:**
- Create: `server/src/physics/LineOfSight.ts`
- Modify: `server/tests/physics.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `server/tests/physics.test.ts`:

```ts
import { hasLineOfSight } from '../src/physics/LineOfSight.ts';

describe('hasLineOfSight', () => {
  it('returns true between two open points', () => {
    // Straight shot across open center row (no pillar at y=250)
    expect(hasLineOfSight({ x: 50, y: 250 }, { x: 750, y: 250 })).toBe(true);
  });

  it('returns false when a pillar blocks the path', () => {
    // Shot from left wall to right wall through center pillar at 400,400
    expect(hasLineOfSight({ x: 50, y: 400 }, { x: 750, y: 400 })).toBe(false);
  });

  it('returns true for a path that grazes past a pillar without hitting it', () => {
    // Center pillar at 400,400 halfSize 28 — pass above it at y=350
    expect(hasLineOfSight({ x: 200, y: 350 }, { x: 600, y: 350 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd server && npx vitest run tests/physics.test.ts
```

Expected: FAIL — `hasLineOfSight` not found.

- [ ] **Step 3: Write server/src/physics/LineOfSight.ts**

```ts
import { Vec2, Pillar, PILLARS } from '@arena/shared';

export function hasLineOfSight(from: Vec2, to: Vec2): boolean {
  return PILLARS.every(p => !segmentIntersectsAABB(from, to, p));
}

function segmentIntersectsAABB(from: Vec2, to: Vec2, pillar: Pillar): boolean {
  const minX = pillar.x - pillar.halfSize;
  const maxX = pillar.x + pillar.halfSize;
  const minY = pillar.y - pillar.halfSize;
  const maxY = pillar.y + pillar.halfSize;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tMin = 0, tMax = 1;

  if (Math.abs(dx) < 1e-9) {
    if (from.x < minX || from.x > maxX) return false;
  } else {
    const t1 = (minX - from.x) / dx;
    const t2 = (maxX - from.x) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (Math.abs(dy) < 1e-9) {
    if (from.y < minY || from.y > maxY) return false;
  } else {
    const t1 = (minY - from.y) / dy;
    const t2 = (maxY - from.y) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  return tMin <= tMax;
}

// Exported for FireWall segment splitting
export { segmentIntersectsAABB };
```

- [ ] **Step 4: Run — expect pass**

```bash
cd server && npx vitest run tests/physics.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/physics/LineOfSight.ts server/tests/physics.test.ts
git commit -m "feat: server physics — line-of-sight ray vs AABB"
```

---

### Task 5: Server Spell — Fireball

**Files:**
- Create: `server/src/spells/Fireball.ts`
- Create: `server/tests/fireball.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/tests/fireball.test.ts
import { describe, it, expect } from 'vitest';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../src/spells/Fireball.ts';

describe('spawnFireball', () => {
  it('creates a projectile aimed at the target', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 700, y: 400 });
    expect(fb.ownerId).toBe('p1');
    expect(fb.type).toBe('fireball');
    expect(fb.velocity.x).toBeGreaterThan(0);
    expect(fb.velocity.y).toBeCloseTo(0, 1);
  });

  it('normalizes velocity to FIREBALL_SPEED regardless of target distance', () => {
    const fb = spawnFireball('p1', { x: 0, y: 0 }, { x: 3, y: 4 }); // distance 5
    const speed = Math.sqrt(fb.velocity.x ** 2 + fb.velocity.y ** 2);
    expect(speed).toBeCloseTo(400, 0);
  });
});

describe('advanceFireball', () => {
  it('moves the fireball by velocity * DELTA each tick', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 500, y: 400 });
    const advanced = advanceFireball(fb);
    expect(advanced.position.x).toBeGreaterThan(fb.position.x);
    expect(advanced.position.x).toBeCloseTo(fb.position.x + 400 / 60, 1);
  });
});

describe('isFireballExpired', () => {
  it('returns true when fireball leaves arena', () => {
    const fb = spawnFireball('p1', { x: 790, y: 400 }, { x: 900, y: 400 });
    const advanced = advanceFireball(fb);
    expect(isFireballExpired(advanced)).toBe(true);
  });

  it('returns false when fireball is in open space', () => {
    const fb = spawnFireball('p1', { x: 100, y: 300 }, { x: 500, y: 300 });
    expect(isFireballExpired(fb)).toBe(false);
  });

  it('returns true when fireball hits a pillar', () => {
    // Fire directly into center pillar at 400,400
    const fb = spawnFireball('p1', { x: 390, y: 400 }, { x: 800, y: 400 });
    let current = fb;
    let hit = false;
    for (let i = 0; i < 200; i++) {
      current = advanceFireball(current);
      if (isFireballExpired(current)) { hit = true; break; }
    }
    expect(hit).toBe(true);
  });
});

describe('fireballHitsPlayer', () => {
  it('returns true when fireball position is within hit radius of target player', () => {
    const fb = spawnFireball('p1', { x: 400, y: 400 }, { x: 420, y: 400 });
    const movedFb = { ...fb, position: { x: 418, y: 400 } };
    expect(fireballHitsPlayer(movedFb, { x: 420, y: 400 }, 'p2')).toBe(true);
  });

  it('does not hit the owner', () => {
    const fb = spawnFireball('p1', { x: 400, y: 400 }, { x: 420, y: 400 });
    expect(fireballHitsPlayer(fb, { x: 400, y: 400 }, 'p1')).toBe(false);
  });
});

describe('fireballDamage', () => {
  it('returns a value between 80 and 120', () => {
    for (let i = 0; i < 100; i++) {
      const d = fireballDamage();
      expect(d).toBeGreaterThanOrEqual(80);
      expect(d).toBeLessThanOrEqual(120);
    }
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd server && npx vitest run tests/fireball.test.ts
```

- [ ] **Step 3: Write server/src/spells/Fireball.ts**

```ts
import { Projectile, Vec2, FIREBALL_SPEED, FIREBALL_RADIUS, PLAYER_HALF_SIZE, ARENA_SIZE, DELTA } from '@arena/shared';
import { circleHitsAABB } from '../physics/Collision.ts';
import { PILLARS } from '@arena/shared';

let _id = 0;
const nextId = () => `fb_${++_id}`;

export function spawnFireball(ownerId: string, from: Vec2, target: Vec2): Projectile {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    id: nextId(),
    ownerId,
    type: 'fireball',
    position: { x: from.x, y: from.y },
    velocity: { x: (dx / len) * FIREBALL_SPEED, y: (dy / len) * FIREBALL_SPEED },
  };
}

export function advanceFireball(p: Projectile): Projectile {
  return {
    ...p,
    position: {
      x: p.position.x + p.velocity.x * DELTA,
      y: p.position.y + p.velocity.y * DELTA,
    },
  };
}

export function isFireballExpired(p: Projectile): boolean {
  const { x, y } = p.position;
  if (x < 0 || x > ARENA_SIZE || y < 0 || y > ARENA_SIZE) return true;
  return PILLARS.some(pillar => circleHitsAABB(p.position, FIREBALL_RADIUS, pillar));
}

export function fireballHitsPlayer(p: Projectile, playerPos: Vec2, playerId: string): boolean {
  if (p.ownerId === playerId) return false;
  const dx = p.position.x - playerPos.x;
  const dy = p.position.y - playerPos.y;
  return dx * dx + dy * dy < (FIREBALL_RADIUS + PLAYER_HALF_SIZE) ** 2;
}

export function fireballDamage(): number {
  return Math.floor(80 + Math.random() * 41);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd server && npx vitest run tests/fireball.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/spells/Fireball.ts server/tests/fireball.test.ts
git commit -m "feat: server spell — fireball spawn, advance, hit detection"
```

---

### Task 6: Server Spell — Fire Wall

**Files:**
- Create: `server/src/spells/FireWall.ts`
- Create: `server/tests/firewall.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/tests/firewall.test.ts
import { describe, it, expect } from 'vitest';
import { spawnFireWall, fireWallDamagesPlayer, buildWallSegments } from '../src/spells/FireWall.ts';
import { FIREWALL_DURATION_TICKS } from '@arena/shared';

describe('buildWallSegments', () => {
  it('returns a single segment when path is clear of pillars', () => {
    // Horizontal line at y=250, well clear of all pillars
    const segs = buildWallSegments({ x: 200, y: 250 }, { x: 600, y: 250 });
    expect(segs.length).toBe(1);
    expect(segs[0].x1).toBeCloseTo(200);
    expect(segs[0].x2).toBeCloseTo(600);
  });

  it('splits the wall when a pillar is in the path', () => {
    // Horizontal line through center pillar at 400,400
    const segs = buildWallSegments({ x: 100, y: 400 }, { x: 700, y: 400 });
    expect(segs.length).toBe(2);
  });

  it('clamps wall length to FIREWALL_MAX_LENGTH (200)', () => {
    const segs = buildWallSegments({ x: 100, y: 100 }, { x: 900, y: 100 });
    const totalLen = segs.reduce((acc, s) => {
      const dx = s.x2 - s.x1; const dy = s.y2 - s.y1;
      return acc + Math.sqrt(dx * dx + dy * dy);
    }, 0);
    expect(totalLen).toBeLessThanOrEqual(200 + 0.01);
  });
});

describe('spawnFireWall', () => {
  it('sets expiresAt to current tick + FIREWALL_DURATION_TICKS', () => {
    const fw = spawnFireWall('p1', { x: 200, y: 250 }, { x: 400, y: 250 }, 100);
    expect(fw.expiresAt).toBe(100 + FIREWALL_DURATION_TICKS);
    expect(fw.ownerId).toBe('p1');
  });
});

describe('fireWallDamagesPlayer', () => {
  it('returns true when player is on a fire wall segment', () => {
    const fw = spawnFireWall('p1', { x: 100, y: 400 }, { x: 700, y: 400 }, 0);
    // Player standing on the wall line
    expect(fireWallDamagesPlayer(fw, { x: 400, y: 400 }, 'p2')).toBe(true);
  });

  it('returns false when player is far from the wall', () => {
    const fw = spawnFireWall('p1', { x: 100, y: 100 }, { x: 300, y: 100 }, 0);
    expect(fireWallDamagesPlayer(fw, { x: 400, y: 600 }, 'p2')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd server && npx vitest run tests/firewall.test.ts
```

- [ ] **Step 3: Write server/src/spells/FireWall.ts**

```ts
import {
  Vec2, FireWallState, Pillar, PILLARS,
  FIREWALL_MAX_LENGTH, FIREWALL_DURATION_TICKS, PLAYER_HALF_SIZE,
} from '@arena/shared';
import { segmentIntersectsAABB } from '../physics/LineOfSight.ts';

type Segment = { x1: number; y1: number; x2: number; y2: number };

let _id = 0;
const nextId = () => `fw_${++_id}`;

export function spawnFireWall(ownerId: string, from: Vec2, to: Vec2, currentTick: number): FireWallState {
  return {
    id: nextId(),
    ownerId,
    segments: buildWallSegments(from, to),
    expiresAt: currentTick + FIREWALL_DURATION_TICKS,
  };
}

export function buildWallSegments(from: Vec2, to: Vec2): Segment[] {
  // Clamp to max length
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const clampedLen = Math.min(len, FIREWALL_MAX_LENGTH);
  const end: Vec2 = { x: from.x + (dx / len) * clampedLen, y: from.y + (dy / len) * clampedLen };

  // Find all t-ranges where the segment is blocked by a pillar
  const blocked: [number, number][] = [];
  for (const pillar of PILLARS) {
    const range = getPillarBlockRange(from, end, pillar);
    if (range) blocked.push(range);
  }

  if (blocked.length === 0) return [{ x1: from.x, y1: from.y, x2: end.x, y2: end.y }];

  // Merge overlapping ranges
  blocked.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of blocked) {
    if (!merged.length || r[0] > merged[merged.length - 1][1]) {
      merged.push([r[0], r[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    }
  }

  const lerp = (t: number): Vec2 => ({ x: from.x + (end.x - from.x) * t, y: from.y + (end.y - from.y) * t });
  const segments: Segment[] = [];
  let prev = 0;
  for (const [start, stop] of merged) {
    if (start > prev) {
      const a = lerp(prev); const b = lerp(start);
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    prev = stop;
  }
  if (prev < 1) {
    const a = lerp(prev);
    segments.push({ x1: a.x, y1: a.y, x2: end.x, y2: end.y });
  }
  return segments;
}

function getPillarBlockRange(from: Vec2, to: Vec2, pillar: Pillar): [number, number] | null {
  const minX = pillar.x - pillar.halfSize;
  const maxX = pillar.x + pillar.halfSize;
  const minY = pillar.y - pillar.halfSize;
  const maxY = pillar.y + pillar.halfSize;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tMin = 0, tMax = 1;

  if (Math.abs(dx) < 1e-9) {
    if (from.x < minX || from.x > maxX) return null;
  } else {
    const t1 = (minX - from.x) / dx;
    const t2 = (maxX - from.x) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (Math.abs(dy) < 1e-9) {
    if (from.y < minY || from.y > maxY) return null;
  } else {
    const t1 = (minY - from.y) / dy;
    const t2 = (maxY - from.y) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMin > tMax) return null;
  return [tMin, tMax];
}

export function fireWallDamagesPlayer(fw: FireWallState, playerPos: Vec2, playerId: string): boolean {
  const threshold = PLAYER_HALF_SIZE + 8;
  return fw.segments.some(seg => pointToSegmentDist(playerPos, seg) < threshold);
}

function pointToSegmentDist(p: Vec2, seg: Segment): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.sqrt((p.x - seg.x1) ** 2 + (p.y - seg.y1) ** 2);
  }
  const t = Math.max(0, Math.min(1, ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / lenSq));
  const cx = seg.x1 + t * dx;
  const cy = seg.y1 + t * dy;
  return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd server && npx vitest run tests/firewall.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/spells/FireWall.ts server/tests/firewall.test.ts
git commit -m "feat: server spell — fire wall with pillar-splitting segments"
```

---

### Task 7: Server Spell — Meteor

**Files:**
- Create: `server/src/spells/Meteor.ts`
- Create: `server/tests/meteor.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/tests/meteor.test.ts
import { describe, it, expect } from 'vitest';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../src/spells/Meteor.ts';
import { METEOR_DELAY_TICKS } from '@arena/shared';

describe('spawnMeteor', () => {
  it('sets strikeAt to currentTick + METEOR_DELAY_TICKS', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 60);
    expect(m.strikeAt).toBe(60 + METEOR_DELAY_TICKS);
    expect(m.target).toEqual({ x: 400, y: 400 });
  });
});

describe('meteorDetonates', () => {
  it('returns true when current tick >= strikeAt', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorDetonates(m, METEOR_DELAY_TICKS)).toBe(true);
    expect(meteorDetonates(m, METEOR_DELAY_TICKS - 1)).toBe(false);
  });
});

describe('meteorHitsPlayer', () => {
  it('returns true when player is within AOE radius', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorHitsPlayer(m, { x: 420, y: 400 }, 'p2')).toBe(true);
  });

  it('returns false when player is outside AOE radius', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorHitsPlayer(m, { x: 600, y: 600 }, 'p2')).toBe(false);
  });

  it('does not hit the owner', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorHitsPlayer(m, { x: 400, y: 400 }, 'p1')).toBe(false);
  });
});

describe('meteorDamage', () => {
  it('returns a value between 200 and 280', () => {
    for (let i = 0; i < 100; i++) {
      const d = meteorDamage();
      expect(d).toBeGreaterThanOrEqual(200);
      expect(d).toBeLessThanOrEqual(280);
    }
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd server && npx vitest run tests/meteor.test.ts
```

- [ ] **Step 3: Write server/src/spells/Meteor.ts**

```ts
import { MeteorState, Vec2, METEOR_DELAY_TICKS, METEOR_AOE_RADIUS } from '@arena/shared';

let _id = 0;
const nextId = () => `mt_${++_id}`;

export function spawnMeteor(ownerId: string, target: Vec2, currentTick: number): MeteorState {
  return { id: nextId(), ownerId, target: { ...target }, strikeAt: currentTick + METEOR_DELAY_TICKS };
}

export function meteorDetonates(m: MeteorState, currentTick: number): boolean {
  return currentTick >= m.strikeAt;
}

export function meteorHitsPlayer(m: MeteorState, playerPos: Vec2, playerId: string): boolean {
  if (m.ownerId === playerId) return false;
  const dx = playerPos.x - m.target.x;
  const dy = playerPos.y - m.target.y;
  return dx * dx + dy * dy < METEOR_AOE_RADIUS * METEOR_AOE_RADIUS;
}

export function meteorDamage(): number {
  return Math.floor(200 + Math.random() * 81);
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd server && npx vitest run tests/meteor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/spells/Meteor.ts server/tests/meteor.test.ts
git commit -m "feat: server spell — meteor delayed AoE strike"
```

---

### Task 8: Server State Advancer

**Files:**
- Create: `server/src/gameloop/StateAdvancer.ts`
- Create: `server/tests/stateadvancer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/tests/stateadvancer.test.ts
import { describe, it, expect } from 'vitest';
import { advanceState, makeInitialState } from '../src/gameloop/StateAdvancer.ts';
import { SPELL_CONFIG, MAX_MANA, MANA_REGEN_PER_TICK } from '@arena/shared';

function twoPlayerState() {
  return makeInitialState([
    { id: 'p1', displayName: 'Alice', spawnPos: { x: 80, y: 400 } },
    { id: 'p2', displayName: 'Bob', spawnPos: { x: 720, y: 400 } },
  ]);
}

describe('makeInitialState', () => {
  it('creates state with two players at spawn positions', () => {
    const state = twoPlayerState();
    expect(state.players['p1'].position).toEqual({ x: 80, y: 400 });
    expect(state.players['p2'].position).toEqual({ x: 720, y: 400 });
    expect(state.phase).toBe('dueling');
  });
});

describe('advanceState — movement', () => {
  it('moves p1 right when move input is {x:1, y:0}', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 1, y: 0 }, castSpell: null, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].position.x).toBeGreaterThan(80);
  });
});

describe('advanceState — mana regen', () => {
  it('regens mana up to MAX_MANA', () => {
    const state = twoPlayerState();
    state.players['p1'].mana = MAX_MANA - 1;
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].mana).toBeLessThanOrEqual(MAX_MANA);
    expect(next.players['p1'].mana).toBeGreaterThan(MAX_MANA - 1);
  });
});

describe('advanceState — fireball cast', () => {
  it('spawns a fireball and deducts mana when p1 casts spell 1', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.projectiles.length).toBe(1);
    expect(next.players['p1'].mana).toBe(300 - SPELL_CONFIG[1].manaCost);
  });

  it('does not cast when mana is insufficient', () => {
    const state = twoPlayerState();
    state.players['p1'].mana = 0;
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.projectiles.length).toBe(0);
  });
});

describe('advanceState — win condition', () => {
  it('sets phase to ended and winner when a player reaches 0 hp', () => {
    const state = twoPlayerState();
    state.players['p2'].hp = 1;
    // Place a fireball right on p2
    state.projectiles.push({
      id: 'fb_test',
      ownerId: 'p1',
      type: 'fireball',
      position: { x: 720, y: 400 },
      velocity: { x: 400, y: 0 },
    });
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBe('p1');
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
cd server && npx vitest run tests/stateadvancer.test.ts
```

- [ ] **Step 3: Write server/src/gameloop/StateAdvancer.ts**

```ts
import {
  GameState, PlayerState, InputFrame, Vec2,
  SPELL_CONFIG, MAX_HP, MAX_MANA, MANA_REGEN_PER_TICK, FIREWALL_DAMAGE_PER_TICK,
} from '@arena/shared';
import { movePlayer } from '../physics/Movement.ts';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../spells/Fireball.ts';
import { spawnFireWall, fireWallDamagesPlayer } from '../spells/FireWall.ts';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../spells/Meteor.ts';

export type PlayerInit = { id: string; displayName: string; spawnPos: Vec2 };

export function makeInitialState(players: PlayerInit[]): GameState {
  const playerMap: Record<string, PlayerState> = {};
  for (const p of players) {
    playerMap[p.id] = {
      id: p.id,
      displayName: p.displayName,
      position: { ...p.spawnPos },
      hp: MAX_HP,
      mana: MAX_MANA,
      facing: 0,
      castingSpell: null,
      cooldowns: {},
    };
  }
  return { tick: 0, players: playerMap, projectiles: [], fireWalls: [], meteors: [], phase: 'dueling', winner: null };
}

export function advanceState(state: GameState, inputs: Record<string, InputFrame>): GameState {
  const players = deepCopyPlayers(state.players);

  // 1. Move players and apply mana regen
  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p) continue;
    players[id] = {
      ...p,
      position: movePlayer(p.position, input.move),
      mana: Math.min(MAX_MANA, p.mana + MANA_REGEN_PER_TICK),
      facing: input.aimTarget ? Math.atan2(input.aimTarget.y - p.position.y, input.aimTarget.x - p.position.x) : p.facing,
    };
    // Decrement cooldowns
    for (const key of Object.keys(players[id].cooldowns)) {
      players[id].cooldowns[Number(key)] = Math.max(0, players[id].cooldowns[Number(key)] - 1);
    }
  }

  // 2. Process spell casts
  let projectiles = [...state.projectiles];
  let fireWalls = [...state.fireWalls];
  let meteors = [...state.meteors];
  const tick = state.tick;

  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p || !input.castSpell) continue;
    const spell = input.castSpell;
    const cfg = SPELL_CONFIG[spell];
    if (p.mana < cfg.manaCost) continue;
    if ((p.cooldowns[spell] ?? 0) > 0) continue;

    players[id] = { ...p, mana: p.mana - cfg.manaCost, cooldowns: { ...p.cooldowns, [spell]: cfg.cooldownTicks } };

    if (spell === 1) {
      projectiles = [...projectiles, spawnFireball(id, p.position, input.aimTarget)];
    } else if (spell === 2 && input.aimTarget2) {
      fireWalls = [...fireWalls, spawnFireWall(id, input.aimTarget, input.aimTarget2, tick)];
    } else if (spell === 3) {
      meteors = [...meteors, spawnMeteor(id, input.aimTarget, tick)];
    }
  }

  // 3. Advance projectiles, check hits
  const survivingProjectiles = [];
  for (const fb of projectiles) {
    const moved = advanceFireball(fb);
    if (isFireballExpired(moved)) continue;
    let hit = false;
    for (const [pid, player] of Object.entries(players)) {
      if (fireballHitsPlayer(moved, player.position, pid)) {
        players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage()) };
        hit = true;
        break;
      }
    }
    if (!hit) survivingProjectiles.push(moved);
  }

  // 4. Fire wall damage
  fireWalls = fireWalls.filter(fw => tick < fw.expiresAt);
  for (const fw of fireWalls) {
    for (const [pid, player] of Object.entries(players)) {
      if (fireWallDamagesPlayer(fw, player.position, pid)) {
        players[pid] = { ...player, hp: Math.max(0, player.hp - FIREWALL_DAMAGE_PER_TICK) };
      }
    }
  }

  // 5. Meteor detonations
  const survivingMeteors = [];
  for (const m of meteors) {
    if (meteorDetonates(m, tick)) {
      for (const [pid, player] of Object.entries(players)) {
        if (meteorHitsPlayer(m, player.position, pid)) {
          players[pid] = { ...player, hp: Math.max(0, player.hp - meteorDamage()) };
        }
      }
    } else {
      survivingMeteors.push(m);
    }
  }

  // 6. Win condition
  let phase = state.phase;
  let winner = state.winner;
  for (const [pid, player] of Object.entries(players)) {
    if (player.hp <= 0) {
      phase = 'ended';
      // Winner is the opponent
      winner = Object.keys(players).find(id => id !== pid) ?? null;
      break;
    }
  }

  return {
    tick: tick + 1,
    players,
    projectiles: survivingProjectiles,
    fireWalls,
    meteors: survivingMeteors,
    phase,
    winner,
  };
}

function deepCopyPlayers(players: Record<string, PlayerState>): Record<string, PlayerState> {
  const copy: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(players)) {
    copy[id] = { ...p, position: { ...p.position }, cooldowns: { ...p.cooldowns } };
  }
  return copy;
}
```

- [ ] **Step 4: Run — expect pass**

```bash
cd server && npx vitest run tests/stateadvancer.test.ts
```

- [ ] **Step 5: Run all server tests**

```bash
cd server && npx vitest run
```

Expected: all tests pass across physics, fireball, firewall, meteor, stateadvancer.

- [ ] **Step 6: Commit**

```bash
git add server/src/gameloop/StateAdvancer.ts server/tests/stateadvancer.test.ts
git commit -m "feat: server state advancer — full 60-tick game loop logic"
```

---

### Task 9: Server Room Manager & Game Loop

**Files:**
- Create: `server/src/rooms/Room.ts`
- Create: `server/src/rooms/RoomManager.ts`
- Create: `server/src/gameloop/GameLoop.ts`

- [ ] **Step 1: Write server/src/rooms/Room.ts**

```ts
import { GameState, InputFrame, SPAWN_POSITIONS } from '@arena/shared';
import { makeInitialState, advanceState, PlayerInit } from '../gameloop/StateAdvancer.ts';

export type RoomPlayer = { socketId: string; displayName: string; ready: boolean };

export class Room {
  readonly id: string;
  players: Map<string, RoomPlayer> = new Map(); // socketId -> RoomPlayer
  state: GameState | null = null;
  private pendingInputs: Map<string, InputFrame> = new Map();

  constructor(id: string) { this.id = id; }

  get isFull(): boolean { return this.players.size >= 2; }
  get allReady(): boolean { return this.players.size === 2 && [...this.players.values()].every(p => p.ready); }

  addPlayer(socketId: string, displayName: string): void {
    this.players.set(socketId, { socketId, displayName, ready: false });
  }

  removePlayer(socketId: string): void {
    this.players.delete(socketId);
  }

  setReady(socketId: string): void {
    const p = this.players.get(socketId);
    if (p) p.ready = true;
  }

  startDuel(): void {
    const entries = [...this.players.entries()];
    const inits: PlayerInit[] = entries.map(([id, p], i) => ({
      id,
      displayName: p.displayName,
      spawnPos: SPAWN_POSITIONS[i],
    }));
    this.state = makeInitialState(inits);
    this.pendingInputs.clear();
  }

  queueInput(socketId: string, input: InputFrame): void {
    this.pendingInputs.set(socketId, input);
  }

  tick(): GameState {
    if (!this.state) throw new Error('Room not started');
    const inputs: Record<string, InputFrame> = {};
    for (const [id] of this.players) {
      inputs[id] = this.pendingInputs.get(id) ?? { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } };
    }
    this.state = advanceState(this.state, inputs);
    return this.state;
  }

  reset(): void {
    for (const p of this.players.values()) p.ready = false;
    this.state = null;
    this.pendingInputs.clear();
  }
}
```

- [ ] **Step 2: Write server/src/rooms/RoomManager.ts**

```ts
import { Room } from './Room.ts';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(): Room {
    const id = Math.random().toString(36).slice(2, 8);
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  deleteRoom(id: string): void {
    this.rooms.delete(id);
  }
}
```

- [ ] **Step 3: Write server/src/gameloop/GameLoop.ts**

```ts
import { Room } from '../rooms/Room.ts';

type BroadcastFn = (state: object) => void;

export class GameLoop {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(room: Room, broadcast: BroadcastFn): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      const state = room.tick();
      broadcast(state);
      if (state.phase === 'ended') this.stop();
    }, 1000 / 60);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add server/src/rooms/ server/src/gameloop/GameLoop.ts
git commit -m "feat: server room manager and 60-tick game loop"
```

---

### Task 10: Server Entry Point (Express + Socket.io)

**Files:**
- Create: `server/src/index.ts`

- [ ] **Step 1: Write server/src/index.ts**

```ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.ts';
import { GameLoop } from './gameloop/GameLoop.ts';
import { InputFrame } from '@arena/shared';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const roomManager = new RoomManager();
const loops: Map<string, GameLoop> = new Map();

app.use(express.json());

// Create room endpoint
app.post('/rooms', (_req, res) => {
  const room = roomManager.createRoom();
  res.json({ roomId: room.id });
});

// Room exists check
app.get('/rooms/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  res.json({ exists: !!room, full: room?.isFull ?? false });
});

io.on('connection', socket => {
  let currentRoomId: string | null = null;

  socket.on('join-room', ({ roomId, displayName }: { roomId: string; displayName: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('room-not-found'); return; }
    if (room.isFull && !room.players.has(socket.id)) { socket.emit('room-full'); return; }

    room.addPlayer(socket.id, displayName);
    socket.join(roomId);
    currentRoomId = roomId;

    socket.emit('room-joined', {
      roomId,
      yourId: socket.id,
      players: Object.fromEntries([...room.players.entries()].map(([id, p]) => [id, p.displayName])),
    });
    socket.to(roomId).emit('player-joined', { id: socket.id, displayName });

    if (room.isFull) {
      io.to(roomId).emit('game-ready');
    }
  });

  socket.on('player-ready', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    room.setReady(socket.id);

    if (room.allReady) {
      room.startDuel();
      const loop = new GameLoop();
      loops.set(currentRoomId, loop);
      loop.start(room, state => {
        io.to(currentRoomId!).emit('game-state', state);
        if ((state as any).phase === 'ended') {
          io.to(currentRoomId!).emit('duel-ended', { winnerId: (state as any).winner });
        }
      });
    }
  });

  socket.on('input', (input: InputFrame) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    room?.queueInput(socket.id, input);
  });

  socket.on('rematch', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    loops.get(currentRoomId)?.stop();
    loops.delete(currentRoomId);
    room.reset();
    io.to(currentRoomId).emit('rematch-ready');
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    room.removePlayer(socket.id);
    loops.get(currentRoomId)?.stop();
    loops.delete(currentRoomId);
    io.to(currentRoomId).emit('opponent-disconnected');
    if (room.players.size === 0) roomManager.deleteRoom(currentRoomId);
  });
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => console.log(`Arena server running on :${PORT}`));
```

- [ ] **Step 2: Start server and verify**

```bash
cd server && npm run dev
```

Expected: `Arena server running on :3000`

In a second terminal:
```bash
curl -X POST http://localhost:3000/rooms
```

Expected: `{"roomId":"abc123"}` (random 6-char ID)

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: server entry — Express rooms API and Socket.io event handling"
```

---

### Task 11: Client — Three.js Scene & Isometric Camera

**Files:**
- Create: `client/src/renderer/Scene.ts`

- [ ] **Step 1: Write client/src/renderer/Scene.ts**

```ts
import * as THREE from 'three';

export class Scene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  private animFrameId = 0;

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
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      onFrame();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stopRenderLoop(): void {
    cancelAnimationFrame(this.animFrameId);
  }

  /** Convert screen mouse position to world XZ coordinates */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    return { x: target.x, y: target.z };
  }

  dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Write minimal client/src/main.ts to verify scene loads**

```ts
import { Scene } from './renderer/Scene.ts';

const container = document.getElementById('canvas-container')!;
const scene = new Scene(container);
scene.startRenderLoop(() => {});
```

- [ ] **Step 3: Start client and verify blank isometric scene**

```bash
cd client && npm run dev
```

Open http://localhost:5173 — expect dark background, no errors in console.

- [ ] **Step 4: Commit**

```bash
git add client/src/renderer/Scene.ts client/src/main.ts
git commit -m "feat: client Three.js scene with isometric orthographic camera"
```

---

### Task 12: Client — Arena Geometry

**Files:**
- Create: `client/src/renderer/Arena.ts`

- [ ] **Step 1: Write client/src/renderer/Arena.ts**

```ts
import * as THREE from 'three';
import { PILLARS, ARENA_SIZE } from '@arena/shared';

export class Arena {
  private group = new THREE.Group();

  constructor() {
    this.buildFloor();
    this.buildBoundaryWalls();
    this.buildPillars();
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  private buildFloor(): void {
    const geo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 16, 16);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(ARENA_SIZE / 2, 0, ARENA_SIZE / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Grid lines
    const grid = new THREE.GridHelper(ARENA_SIZE, 20, 0x3a3a5a, 0x3a3a5a);
    grid.position.set(ARENA_SIZE / 2, 0.5, ARENA_SIZE / 2);
    this.group.add(grid);
  }

  private buildBoundaryWalls(): void {
    const wallH = 60;
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });
    const positions: [number, number, number, number][] = [
      // [x, z, width, depth]
      [ARENA_SIZE / 2, -10, ARENA_SIZE + 40, 20],         // top
      [ARENA_SIZE / 2, ARENA_SIZE + 10, ARENA_SIZE + 40, 20], // bottom
      [-10, ARENA_SIZE / 2, 20, ARENA_SIZE],               // left
      [ARENA_SIZE + 10, ARENA_SIZE / 2, 20, ARENA_SIZE],   // right
    ];
    for (const [x, z, w, d] of positions) {
      const geo = new THREE.BoxGeometry(w, wallH, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, wallH / 2, z);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  private buildPillars(): void {
    const pillarH = 80;
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x4a4a7a });
    const capMat = new THREE.MeshLambertMaterial({ color: 0x6a6aaa });

    for (const p of PILLARS) {
      const size = p.halfSize * 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(size, pillarH, size), pillarMat);
      body.position.set(p.x, pillarH / 2, p.y);
      body.castShadow = true;
      body.receiveShadow = true;
      this.group.add(body);

      // Cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(size + 6, 8, size + 6), capMat);
      cap.position.set(p.x, pillarH + 4, p.y);
      this.group.add(cap);
    }
  }
}
```

- [ ] **Step 2: Update main.ts to add arena**

```ts
import { Scene } from './renderer/Scene.ts';
import { Arena } from './renderer/Arena.ts';

const container = document.getElementById('canvas-container')!;
const scene = new Scene(container);
const arena = new Arena();
arena.addToScene(scene.scene);
scene.startRenderLoop(() => {});
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:5173 — expect isometric stone floor with 5 pillars visible.

- [ ] **Step 4: Commit**

```bash
git add client/src/renderer/Arena.ts client/src/main.ts
git commit -m "feat: client arena geometry — floor, boundary walls, 5 pillars"
```

---

### Task 13: Client — Character Mesh

**Files:**
- Create: `client/src/renderer/CharacterMesh.ts`

- [ ] **Step 1: Write client/src/renderer/CharacterMesh.ts**

```ts
import * as THREE from 'three';

export class CharacterMesh {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private nameLabel: HTMLDivElement;

  constructor(color: number, displayName: string, labelContainer: HTMLElement) {
    // Body
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(12, 20, 4, 8),
      new THREE.MeshLambertMaterial({ color }),
    );
    this.body.position.y = 26;
    this.body.castShadow = true;
    this.group.add(this.body);

    // Glow ring on ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 18, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 1;
    this.group.add(ring);

    // Name label (DOM overlay)
    this.nameLabel = document.createElement('div');
    this.nameLabel.style.cssText = `
      position:absolute; pointer-events:none; font-size:12px; color:#fff;
      text-shadow:0 0 4px #000; white-space:nowrap; transform:translateX(-50%);
    `;
    this.nameLabel.textContent = displayName;
    labelContainer.appendChild(this.nameLabel);
  }

  /** Set world position (XY in game space → XZ in Three.js) */
  setPosition(x: number, y: number): void {
    this.group.position.set(x, 0, y);
  }

  /** Update label screen position. Call after render. */
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

- [ ] **Step 2: Commit**

```bash
git add client/src/renderer/CharacterMesh.ts
git commit -m "feat: client character mesh with capsule body and DOM name label"
```

---

### Task 14: Client — State Buffer & Interpolation

**Files:**
- Create: `client/src/network/StateBuffer.ts`

- [ ] **Step 1: Write client/src/network/StateBuffer.ts**

```ts
import { GameState, PlayerState, Vec2 } from '@arena/shared';

export class StateBuffer {
  private snapshots: GameState[] = [];
  private readonly maxSnapshots = 10;
  private renderDelay = 2; // render 2 snapshots behind latest

  push(state: GameState): void {
    this.snapshots.push(state);
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  /** Returns interpolated state for rendering. Returns null if not enough data. */
  getInterpolated(): GameState | null {
    if (this.snapshots.length < 2) return this.snapshots[0] ?? null;
    const targetIndex = Math.max(0, this.snapshots.length - 1 - this.renderDelay);
    const a = this.snapshots[Math.max(0, targetIndex - 1)];
    const b = this.snapshots[targetIndex];
    const t = 0.5; // midpoint interpolation

    const players: Record<string, PlayerState> = {};
    for (const id of Object.keys(b.players)) {
      const pa = a.players[id];
      const pb = b.players[id];
      players[id] = {
        ...pb,
        position: pa ? lerpVec2(pa.position, pb.position, t) : pb.position,
      };
    }

    return { ...b, players };
  }

  clear(): void { this.snapshots = []; }
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/network/StateBuffer.ts
git commit -m "feat: client state buffer with snapshot interpolation"
```

---

### Task 15: Client — Socket Client

**Files:**
- Create: `client/src/network/SocketClient.ts`

- [ ] **Step 1: Write client/src/network/SocketClient.ts**

```ts
import { io, Socket } from 'socket.io-client';
import { GameState, InputFrame } from '@arena/shared';

export type RoomJoinedPayload = { roomId: string; yourId: string; players: Record<string, string> };

export class SocketClient {
  private socket: Socket;

  constructor() {
    this.socket = io({ autoConnect: false });
  }

  connect(): void { this.socket.connect(); }
  disconnect(): void { this.socket.disconnect(); }

  joinRoom(roomId: string, displayName: string): void {
    this.socket.emit('join-room', { roomId, displayName });
  }

  ready(): void { this.socket.emit('player-ready'); }
  sendInput(input: InputFrame): void { this.socket.emit('input', input); }
  rematch(): void { this.socket.emit('rematch'); }

  onRoomJoined(cb: (payload: RoomJoinedPayload) => void): void {
    this.socket.on('room-joined', cb);
  }
  onPlayerJoined(cb: (p: { id: string; displayName: string }) => void): void {
    this.socket.on('player-joined', cb);
  }
  onGameReady(cb: () => void): void { this.socket.on('game-ready', cb); }
  onGameState(cb: (state: GameState) => void): void { this.socket.on('game-state', cb); }
  onDuelEnded(cb: (payload: { winnerId: string }) => void): void { this.socket.on('duel-ended', cb); }
  onRematchReady(cb: () => void): void { this.socket.on('rematch-ready', cb); }
  onOpponentDisconnected(cb: () => void): void { this.socket.on('opponent-disconnected', cb); }
  onRoomNotFound(cb: () => void): void { this.socket.on('room-not-found', cb); }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/network/SocketClient.ts
git commit -m "feat: client socket wrapper with typed emit/on"
```

---

### Task 16: Client — Input Handler

**Files:**
- Create: `client/src/input/InputHandler.ts`

- [ ] **Step 1: Write client/src/input/InputHandler.ts**

```ts
import { InputFrame } from '@arena/shared';
import { Scene } from '../renderer/Scene.ts';

export class InputHandler {
  private keys = new Set<string>();
  private activeSpell: 1 | 2 | 3 = 1;
  private mouseWorld = { x: 400, y: 400 };
  private fireWallDragStart: { x: number; y: number } | null = null;
  private pendingCast: { spell: 1 | 2 | 3; aimTarget: { x: number; y: number }; aimTarget2?: { x: number; y: number } } | null = null;

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

    const frame: InputFrame = { move, castSpell: null, aimTarget: this.mouseWorld };

    if (this.pendingCast) {
      frame.castSpell = this.pendingCast.spell;
      frame.aimTarget = this.pendingCast.aimTarget;
      frame.aimTarget2 = this.pendingCast.aimTarget2;
      this.pendingCast = null;
    }

    return frame;
  }

  getActiveSpell(): 1 | 2 | 3 { return this.activeSpell; }
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

- [ ] **Step 2: Commit**

```bash
git add client/src/input/InputHandler.ts
git commit -m "feat: client input handler — WASD, mouse aim, spell selection, fire wall drag"
```

---

### Task 17: Client — Spell Visual Effects

**Files:**
- Create: `client/src/renderer/SpellRenderer.ts`

- [ ] **Step 1: Write client/src/renderer/SpellRenderer.ts**

```ts
import * as THREE from 'three';
import { GameState } from '@arena/shared';

export class SpellRenderer {
  private fireballs = new Map<string, THREE.Mesh>();
  private fireWalls = new Map<string, THREE.Group>();
  private meteors = new Map<string, THREE.Mesh>(); // warning indicators

  constructor(private scene: THREE.Scene) {}

  update(state: GameState): void {
    this.syncFireballs(state);
    this.syncFireWalls(state);
    this.syncMeteors(state);
  }

  private syncFireballs(state: GameState): void {
    const activeIds = new Set(state.projectiles.map(p => p.id));

    // Remove expired
    for (const [id, mesh] of this.fireballs) {
      if (!activeIds.has(id)) { this.scene.remove(mesh); this.fireballs.delete(id); }
    }

    // Add/update
    for (const fb of state.projectiles) {
      if (!this.fireballs.has(fb.id)) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(8, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff6600 }),
        );
        // Simple glow
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(14, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.25 }),
        );
        mesh.add(glow);
        this.scene.add(mesh);
        this.fireballs.set(fb.id, mesh);
      }
      const mesh = this.fireballs.get(fb.id)!;
      mesh.position.set(fb.position.x, 30, fb.position.y);
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
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/renderer/SpellRenderer.ts
git commit -m "feat: client spell renderer — fireball meshes, fire wall planes, meteor warning rings"
```

---

### Task 18: Client — HUD

**Files:**
- Create: `client/src/hud/HUD.ts`

- [ ] **Step 1: Write client/src/hud/HUD.ts**

```ts
import { GameState, SPELL_CONFIG, MAX_HP, MAX_MANA } from '@arena/shared';

const SPELL_NAMES: Record<number, string> = { 1: 'FB', 2: 'FW', 3: 'MT' };

export class HUD {
  private el: HTMLElement;
  private myId = '';

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <style>
        .hud-panel{position:fixed;bottom:0;left:0;right:0;height:72px;background:rgba(0,0,0,0.85);border-top:2px solid #4a3000;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
        .orb{width:52px;height:52px;border-radius:50%;position:relative;border:2px solid}
        .orb-fill{position:absolute;bottom:0;left:0;right:0;border-radius:50%;transition:height .1s}
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
        <div class="orb orb-hp"><div class="orb-fill" id="hud-hp" style="height:100%"></div></div>
        <div class="spells" id="hud-spells"></div>
        <div class="orb orb-mp"><div class="orb-fill" id="hud-mp" style="height:100%"></div></div>
      </div>
    `;
    container.appendChild(this.el);
    this.buildSpellSlots();
  }

  private buildSpellSlots(): void {
    const spells = this.el.querySelector('#hud-spells')!;
    for (const key of [1, 2, 3]) {
      const slot = document.createElement('div');
      slot.className = 'spell-slot';
      slot.id = `spell-slot-${key}`;
      slot.innerHTML = `<span>${SPELL_NAMES[key]}</span><span style="font-size:9px;color:#888">${key}</span><div class="cd-overlay" id="cd-${key}" style="height:0%"></div>`;
      spells.appendChild(slot);
    }
  }

  init(myId: string): void { this.myId = myId; }

  update(state: GameState, activeSpell: 1 | 2 | 3): void {
    const me = state.players[this.myId];
    if (!me) return;

    // HP / MP orbs
    (this.el.querySelector('#hud-hp') as HTMLElement).style.height = `${(me.hp / MAX_HP) * 100}%`;
    (this.el.querySelector('#hud-mp') as HTMLElement).style.height = `${(me.mana / MAX_MANA) * 100}%`;

    // Spell slots
    for (const key of [1, 2, 3]) {
      const slot = this.el.querySelector(`#spell-slot-${key}`) as HTMLElement;
      slot.classList.toggle('active', key === activeSpell);
      const cd = me.cooldowns[key] ?? 0;
      const maxCd = SPELL_CONFIG[key].cooldownTicks;
      (this.el.querySelector(`#cd-${key}`) as HTMLElement).style.height = `${(cd / maxCd) * 100}%`;
    }

    // Enemy bar
    const enemyId = Object.keys(state.players).find(id => id !== this.myId);
    if (enemyId) {
      const enemy = state.players[enemyId];
      (this.el.querySelector('#hud-enemy-name') as HTMLElement).textContent = enemy.displayName;
      (this.el.querySelector('#hud-enemy-hp') as HTMLElement).style.width = `${(enemy.hp / MAX_HP) * 100}%`;
    }
  }

  show(): void { this.el.style.display = ''; }
  hide(): void { this.el.style.display = 'none'; }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hud/HUD.ts
git commit -m "feat: client D2-style HUD — HP/MP orbs, spell slots with cooldowns, enemy HP bar"
```

---

### Task 19: Client — Lobby UI

**Files:**
- Create: `client/src/lobby/LobbyUI.ts`

- [ ] **Step 1: Write client/src/lobby/LobbyUI.ts**

```ts
export type LobbyCallbacks = {
  onCreateRoom: (displayName: string) => void;
  onJoinRoom: (roomId: string, displayName: string) => void;
  onReady: () => void;
  onRematch: () => void;
};

export class LobbyUI {
  private el: HTMLElement;

  constructor(container: HTMLElement, private cb: LobbyCallbacks) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);z-index:100;font-family:sans-serif;color:#fff';
    container.appendChild(this.el);
    this.showHome();
  }

  showHome(): void {
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) { this.showJoin(roomId); return; }
    this.render(`
      <div style="text-align:center;max-width:320px">
        <h1 style="color:#ffaa00;margin-bottom:8px">ARENA</h1>
        <p style="color:#888;margin-bottom:24px">Fire Sorceress Duels</p>
        <input id="name-input" placeholder="Your name" style="width:100%;padding:10px;background:#1a1a2e;border:1px solid #555;color:#fff;border-radius:4px;margin-bottom:12px;font-size:14px">
        <button id="create-btn" style="width:100%;padding:12px;background:#c85000;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold">Create Room</button>
      </div>
    `);
    this.el.querySelector('#create-btn')!.addEventListener('click', () => {
      const name = (this.el.querySelector('#name-input') as HTMLInputElement).value.trim();
      if (name) this.cb.onCreateRoom(name);
    });
  }

  showJoin(roomId: string): void {
    this.render(`
      <div style="text-align:center;max-width:320px">
        <h1 style="color:#ffaa00;margin-bottom:8px">JOIN DUEL</h1>
        <p style="color:#888;margin-bottom:24px">Room: <code style="color:#aaa">${roomId}</code></p>
        <input id="name-input" placeholder="Your name" style="width:100%;padding:10px;background:#1a1a2e;border:1px solid #555;color:#fff;border-radius:4px;margin-bottom:12px;font-size:14px">
        <button id="join-btn" style="width:100%;padding:12px;background:#005080;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold">Join Room</button>
      </div>
    `);
    this.el.querySelector('#join-btn')!.addEventListener('click', () => {
      const name = (this.el.querySelector('#name-input') as HTMLInputElement).value.trim();
      if (name) this.cb.onJoinRoom(roomId, name);
    });
  }

  showWaiting(shareUrl: string): void {
    this.render(`
      <div style="text-align:center;max-width:360px">
        <h2 style="color:#ffaa00;margin-bottom:12px">Waiting for opponent...</h2>
        <p style="color:#888;margin-bottom:8px">Share this link:</p>
        <div style="background:#1a1a2e;padding:10px;border-radius:4px;word-break:break-all;color:#adf;font-size:12px;margin-bottom:16px">${shareUrl}</div>
        <button id="copy-btn" style="padding:8px 20px;background:#333;border:1px solid #555;color:#fff;border-radius:4px;cursor:pointer">Copy Link</button>
      </div>
    `);
    this.el.querySelector('#copy-btn')!.addEventListener('click', () => navigator.clipboard.writeText(shareUrl));
  }

  showReady(): void {
    this.render(`
      <div style="text-align:center">
        <h2 style="color:#ffaa00;margin-bottom:20px">Opponent joined!</h2>
        <button id="ready-btn" style="padding:14px 40px;background:#008800;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:16px;font-weight:bold">READY</button>
      </div>
    `);
    this.el.querySelector('#ready-btn')!.addEventListener('click', () => this.cb.onReady());
  }

  showResult(won: boolean, opponentName: string): void {
    this.render(`
      <div style="text-align:center">
        <h1 style="color:${won ? '#ffaa00' : '#cc2222'};margin-bottom:8px">${won ? 'VICTORY' : 'DEFEAT'}</h1>
        <p style="color:#888;margin-bottom:24px">${won ? `You defeated ${opponentName}` : `${opponentName} defeated you`}</p>
        <button id="rematch-btn" style="padding:12px 32px;background:#c85000;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold">Rematch</button>
      </div>
    `);
    this.el.querySelector('#rematch-btn')!.addEventListener('click', () => this.cb.onRematch());
  }

  showDisconnected(): void {
    this.render(`<div style="text-align:center"><h2 style="color:#cc2222">Opponent disconnected</h2><p style="color:#888;margin-top:8px">Refresh to start a new room</p></div>`);
  }

  hide(): void { this.el.style.display = 'none'; }
  show(): void { this.el.style.display = 'flex'; }

  private render(html: string): void {
    this.el.innerHTML = html;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/lobby/LobbyUI.ts
git commit -m "feat: client lobby UI — create/join/waiting/ready/result screens"
```

---

### Task 20: Wire main.ts — Full Integration

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Write client/src/main.ts**

```ts
import { Scene } from './renderer/Scene.ts';
import { Arena } from './renderer/Arena.ts';
import { CharacterMesh } from './renderer/CharacterMesh.ts';
import { SpellRenderer } from './renderer/SpellRenderer.ts';
import { StateBuffer } from './network/StateBuffer.ts';
import { SocketClient } from './network/SocketClient.ts';
import { InputHandler } from './input/InputHandler.ts';
import { HUD } from './hud/HUD.ts';
import { LobbyUI } from './lobby/LobbyUI.ts';
import { GameState } from '@arena/shared';

const container = document.getElementById('canvas-container')!;
const uiOverlay = document.getElementById('ui-overlay')!;

const scene = new Scene(container);
const arena = new Arena();
arena.addToScene(scene.scene);

const hud = new HUD(uiOverlay);
hud.hide();

const stateBuffer = new StateBuffer();
const socket = new SocketClient();

let myId = '';
let playerMeshes = new Map<string, CharacterMesh>();
let spellRenderer: SpellRenderer | null = null;
let inputHandler: InputHandler | null = null;
let opponentName = '';

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
      // If room already has 2 players, show ready
      if (Object.keys(players).length >= 2) lobby.showReady();
    });
    setupSocketHandlers(displayName);
  },
  onReady: () => socket.ready(),
  onRematch: () => socket.rematch(),
});

function setupSocketHandlers(myDisplayName: string): void {
  socket.onPlayerJoined(({ displayName }) => {
    opponentName = displayName;
    lobby.showReady();
  });

  socket.onGameReady(() => lobby.showReady());

  socket.onGameState((state: GameState) => {
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
  // Clear old meshes
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

// Game-ready event: client shows ready button, user clicks, server starts loop
socket.onGameReady(() => {
  lobby.showReady();
});

// Main render loop — runs always
scene.startRenderLoop(() => {
  if (!inputHandler || !spellRenderer) return;

  // Send input
  const frame = inputHandler.buildInputFrame();
  socket.sendInput(frame);

  // Get interpolated state
  const state = stateBuffer.getInterpolated();
  if (!state) return;

  // Sync player meshes
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

  // Update spells and HUD
  spellRenderer.update(state);
  hud.update(state, inputHandler.getActiveSpell());
});
```

- [ ] **Step 2: Start both server and client**

Terminal 1:
```bash
cd server && npm run dev
```

Terminal 2:
```bash
cd client && npm run dev
```

- [ ] **Step 3: End-to-end test**

1. Open http://localhost:5173 — expect lobby home screen
2. Enter a name, click **Create Room** — expect waiting screen with share URL
3. Open the share URL in a second browser tab, enter a name, click **Join**
4. Both tabs show **Ready** button — click Ready in both
5. Duel starts — WASD moves character, 1/2/3 selects spell, click fires
6. Verify: fireball fires and stops at pillars, fire wall splits around pillars, meteor hits through pillars
7. Kill opponent (reduce to 0 HP) — expect victory/defeat screen with Rematch button

- [ ] **Step 4: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: wire full client — lobby, game loop, rendering, HUD, socket integration"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Isometric Three.js orthographic camera — Task 11
- ✅ Anonymous lobby with share link — Tasks 10, 19
- ✅ Real-time 60-tick authoritative server — Tasks 8, 9, 10
- ✅ Symmetric cross pillar layout — Tasks 2 (PILLARS constant), 12
- ✅ Pillar line-of-sight blocking Fireball/FireWall — Tasks 4, 5, 6, 7
- ✅ Meteor bypasses pillars — Task 7 (no LoS check)
- ✅ Fireball: projectile, 80-120 dmg, 25 mana, 0.5s CD — Tasks 5, 8
- ✅ Fire Wall: drag, split at pillars, 4s, 40 dmg/s — Tasks 6, 8
- ✅ Meteor: 1.5s delay, 200-280 dmg, 60u AoE, warning ring — Tasks 7, 8, 17
- ✅ HP/Mana stats per spec — Task 2
- ✅ Mana regen — Task 8 (StateAdvancer)
- ✅ D2-style HUD — Task 18
- ✅ Win condition: HP to 0, duel-ended event — Tasks 8, 10
- ✅ Rematch button — Tasks 10, 19, 20
- ✅ State interpolation — Task 14
- ✅ Client sends inputs, server authoritative — Tasks 10, 15, 20

**Type consistency verified:** All types reference `shared/src/types.ts`. `PlayerState.cooldowns`, `InputFrame.aimTarget2`, `Pillar.halfSize` are used consistently across server tasks.
