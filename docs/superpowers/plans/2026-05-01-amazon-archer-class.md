# Amazon Archer Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a playable Amazon character class with an 11-node archer skill tree, 4-node utility tree (Evade), and full combat integration (arrow projectiles, multi-shot, rain of arrows, elemental passives).

**Architecture:** Extend the existing shared type system (`NodeId`, `SkillTree`, `Gate`) with archer nodes and a new `mutuallyExclusive` gate mechanism. Add a new `arrow` projectile type and `RainOfArrowsState` to the game state. Create Amazon-specific spell modifier logic parallel to the mage's `buildSpellModifiers`. The client skill tree UI renders class-appropriate trees based on `charClass`. The skill system uses `Map<NodeId, number>` for ranked skill ownership — Amazon passives are non-stackable (binary, rank 0 or 1).

**Tech Stack:** TypeScript, Vitest, Supabase (existing RPC for unlock/respec), Vite client

---

## Important Context

The skill system recently added stackable ranks:
- `advanceState` takes `skillSets: Record<string, Map<NodeId, number>>` (node → rank)
- `buildSpellModifiers` takes `Map<string, number>` (ranks, not boolean ownership)
- `canUnlock` is duck-typed: `owned: { has(id: NodeId): boolean }` — works with both Map and Set
- Non-stackable nodes have rank 0 (not owned) or 1 (owned)
- `SkillNode` has optional `stackable?: StackableConfig` field

Amazon nodes are all non-stackable for initial release.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `shared/src/types.ts` | Add arrow constants, `RainOfArrowsState`, expand `SpellId`, `ProjectileType`, `GameState` |
| Modify | `shared/src/character.ts` | Add `'amazon'` to `CharacterClass` and `CHARACTER_CLASSES` |
| Modify | `shared/src/skills.ts` | Expand `NodeId`, `SkillTree`, `Gate` (mutuallyExclusive), add archer nodes/gates |
| Create | `server/src/spells/Arrow.ts` | Arrow projectile spawn, advance, hit detection |
| Create | `server/src/spells/RainOfArrows.ts` | Rain of Arrows spawn, detonation, AoE hit detection |
| Create | `server/src/skills/AmazonModifiers.ts` | `buildAmazonModifiers` function and types |
| Modify | `server/src/skills/loadSkills.ts` | Class-aware default skill logic |
| Modify | `server/src/gameloop/StateAdvancer.ts` | Wire Amazon spells into game loop |
| Modify | `client/src/skills/SkillTreeUI.ts` | Amazon tree rendering, positions, icons, mutual exclusion UI |
| Create | `server/tests/amazon-skills.test.ts` | Tests for archer canUnlock, gates, mutual exclusion |
| Create | `server/tests/arrow.test.ts` | Tests for arrow projectile mechanics |
| Create | `server/tests/rain-of-arrows.test.ts` | Tests for Rain of Arrows mechanics |
| Create | `server/tests/amazon-modifiers.test.ts` | Tests for buildAmazonModifiers |

---

### Task 1: Expand Shared Types — Character Class

**Files:**
- Modify: `shared/src/character.ts`
- Create: `server/tests/amazon-skills.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/tests/amazon-skills.test.ts
import { describe, it, expect } from 'vitest';
import { CHARACTER_CLASSES } from '@arena/shared';

describe('Amazon character class', () => {
  it('includes amazon in CHARACTER_CLASSES', () => {
    const amazon = CHARACTER_CLASSES.find(c => c.id === 'amazon');
    expect(amazon).toBeDefined();
    expect(amazon!.label).toBe('Amazon');
    expect(amazon!.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/amazon-skills.test.ts`
Expected: FAIL — `amazon` not found in CHARACTER_CLASSES

- [ ] **Step 3: Implement — add Amazon to character.ts**

In `shared/src/character.ts`:

```ts
export type CharacterClass = 'mage' | 'amazon';

export const CHARACTER_CLASSES: { id: CharacterClass; label: string; enabled: boolean }[] = [
  { id: 'mage', label: 'Mage', enabled: true },
  { id: 'amazon', label: 'Amazon', enabled: true },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/amazon-skills.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/src/character.ts server/tests/amazon-skills.test.ts
git commit -m "feat: add amazon to CharacterClass type and CHARACTER_CLASSES"
```

---

### Task 2: Expand Shared Types — Skills (NodeId, SkillTree, Gate with mutuallyExclusive)

**Files:**
- Modify: `shared/src/skills.ts`
- Modify: `server/tests/amazon-skills.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/amazon-skills.test.ts`:

```ts
import { canUnlock, SKILL_NODES, GATES } from '@arena/shared';
import type { NodeId } from '@arena/shared';

describe('Archer skill tree nodes', () => {
  it('has 11 archer nodes and 4 archer_utility nodes', () => {
    const archer = SKILL_NODES.filter(n => n.tree === 'archer');
    const archerUtil = SKILL_NODES.filter(n => n.tree === 'archer_utility');
    expect(archer).toHaveLength(11);
    expect(archerUtil).toHaveLength(4);
  });

  it('allows unlocking power_shot with no prerequisites', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer.power_shot' as NodeId, owned)).toBe(true);
  });

  it('blocks guided without power_shot', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer.guided' as NodeId, owned)).toBe(false);
  });

  it('allows guided when power_shot is owned', () => {
    const owned = new Map<NodeId, number>([['archer.power_shot' as NodeId, 1]]);
    expect(canUnlock('archer.guided' as NodeId, owned)).toBe(true);
  });

  it('blocks rain_of_arrows without a tier-3 node', () => {
    const owned = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer.guided' as NodeId, 1],
    ]);
    expect(canUnlock('archer.rain_of_arrows' as NodeId, owned)).toBe(false);
  });

  it('allows rain_of_arrows when homing is owned', () => {
    const owned = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer.guided' as NodeId, 1],
      ['archer.homing' as NodeId, 1],
    ]);
    expect(canUnlock('archer.rain_of_arrows' as NodeId, owned)).toBe(true);
  });

  it('allows rain_of_arrows when barrage is owned', () => {
    const owned = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer.multishot' as NodeId, 1],
      ['archer.barrage' as NodeId, 1],
    ]);
    expect(canUnlock('archer.rain_of_arrows' as NodeId, owned)).toBe(true);
  });
});

describe('Mutual exclusion', () => {
  const fullPath = new Map<NodeId, number>([
    ['archer.power_shot' as NodeId, 1],
    ['archer.guided' as NodeId, 1],
    ['archer.homing' as NodeId, 1],
    ['archer.rain_of_arrows' as NodeId, 1],
    ['archer.sustained_rain' as NodeId, 1],
  ]);

  it('allows burn when no elemental is owned', () => {
    expect(canUnlock('archer.burn' as NodeId, fullPath)).toBe(true);
  });

  it('blocks freeze when burn is owned', () => {
    const owned = new Map([...fullPath, ['archer.burn' as NodeId, 1]] as [NodeId, number][]);
    expect(canUnlock('archer.freeze' as NodeId, owned)).toBe(false);
  });

  it('blocks poison when freeze is owned', () => {
    const owned = new Map([...fullPath, ['archer.freeze' as NodeId, 1]] as [NodeId, number][]);
    expect(canUnlock('archer.poison' as NodeId, owned)).toBe(false);
  });

  it('blocks burn when poison is owned', () => {
    const owned = new Map([...fullPath, ['archer.poison' as NodeId, 1]] as [NodeId, number][]);
    expect(canUnlock('archer.burn' as NodeId, owned)).toBe(false);
  });
});

describe('Archer utility tree', () => {
  it('allows evade with no prerequisites', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer_utility.evade' as NodeId, owned)).toBe(true);
  });

  it('blocks combat_roll without evade', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer_utility.combat_roll' as NodeId, owned)).toBe(false);
  });

  it('allows combat_roll when evade is owned', () => {
    const owned = new Map<NodeId, number>([['archer_utility.evade' as NodeId, 1]]);
    expect(canUnlock('archer_utility.combat_roll' as NodeId, owned)).toBe(true);
  });

  it('blocks acrobatics without a tier-2 utility node', () => {
    const owned = new Map<NodeId, number>([['archer_utility.evade' as NodeId, 1]]);
    expect(canUnlock('archer_utility.acrobatics' as NodeId, owned)).toBe(false);
  });

  it('allows acrobatics when combat_roll is owned', () => {
    const owned = new Map<NodeId, number>([
      ['archer_utility.evade' as NodeId, 1],
      ['archer_utility.combat_roll' as NodeId, 1],
    ]);
    expect(canUnlock('archer_utility.acrobatics' as NodeId, owned)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/amazon-skills.test.ts`
Expected: FAIL — types don't exist, nodes not found

- [ ] **Step 3: Implement — expand skills.ts**

Add to `NodeId` type (after the existing utility lines):

```ts
  | 'archer.power_shot' | 'archer.guided' | 'archer.multishot'
  | 'archer.homing' | 'archer.barrage' | 'archer.rain_of_arrows'
  | 'archer.sustained_rain' | 'archer.piercing_rain'
  | 'archer.burn' | 'archer.freeze' | 'archer.poison'
  | 'archer_utility.evade' | 'archer_utility.combat_roll'
  | 'archer_utility.shadowstep' | 'archer_utility.acrobatics';
```

Change `SkillTree`:
```ts
export type SkillTree = 'fire' | 'lightning' | 'frost' | 'utility' | 'archer' | 'archer_utility';
```

Change `Gate` type:
```ts
export type Gate = { requiresAll?: NodeId[]; requiresAny?: NodeId[]; mutuallyExclusive?: NodeId[] };
```

Add to `canUnlock` (before `return true`):
```ts
if (gate.mutuallyExclusive && gate.mutuallyExclusive.some(r => owned.has(r))) return false;
```

Add to `GATES`:
```ts
  // Archer tree
  'archer.guided':          { requiresAll: ['archer.power_shot'] },
  'archer.multishot':       { requiresAll: ['archer.power_shot'] },
  'archer.homing':          { requiresAll: ['archer.guided'] },
  'archer.barrage':         { requiresAll: ['archer.multishot'] },
  'archer.rain_of_arrows':  { requiresAll: ['archer.power_shot'], requiresAny: ['archer.homing', 'archer.barrage'] },
  'archer.sustained_rain':  { requiresAll: ['archer.rain_of_arrows'] },
  'archer.piercing_rain':   { requiresAll: ['archer.rain_of_arrows'] },
  'archer.burn':            { requiresAll: ['archer.rain_of_arrows'], requiresAny: ['archer.sustained_rain', 'archer.piercing_rain'], mutuallyExclusive: ['archer.freeze', 'archer.poison'] },
  'archer.freeze':          { requiresAll: ['archer.rain_of_arrows'], requiresAny: ['archer.sustained_rain', 'archer.piercing_rain'], mutuallyExclusive: ['archer.burn', 'archer.poison'] },
  'archer.poison':          { requiresAll: ['archer.rain_of_arrows'], requiresAny: ['archer.sustained_rain', 'archer.piercing_rain'], mutuallyExclusive: ['archer.burn', 'archer.freeze'] },
  // Archer utility tree
  'archer_utility.combat_roll': { requiresAll: ['archer_utility.evade'] },
  'archer_utility.shadowstep':  { requiresAll: ['archer_utility.evade'] },
  'archer_utility.acrobatics':  { requiresAll: ['archer_utility.evade'], requiresAny: ['archer_utility.combat_roll', 'archer_utility.shadowstep'] },
```

Add to `SKILL_NODES`:
```ts
  // Archer tree
  { id: 'archer.power_shot',      name: 'Power Shot',      tree: 'archer', tier: 1, cost: 1, isSpell: true,  description: 'Fast arrow projectile. 60–90 damage.' },
  { id: 'archer.guided',          name: 'Guided',          tree: 'archer', tier: 2, cost: 1, isSpell: false, description: 'Power Shot gains slight homing.' },
  { id: 'archer.multishot',       name: 'Multi-shot',      tree: 'archer', tier: 2, cost: 2, isSpell: true,  description: 'Fire 3 arrows in a spread. 40–60 damage each.' },
  { id: 'archer.homing',          name: 'Homing',          tree: 'archer', tier: 3, cost: 2, isSpell: false, description: 'Power Shot gains strong tracking.' },
  { id: 'archer.barrage',         name: 'Barrage',         tree: 'archer', tier: 3, cost: 2, isSpell: false, description: 'Multi-shot fires 5 arrows instead of 3.' },
  { id: 'archer.rain_of_arrows',  name: 'Rain of Arrows',  tree: 'archer', tier: 4, cost: 2, isSpell: true,  description: 'Mark a zone. Arrows rain after 1.5s. 150–220 AoE damage.' },
  { id: 'archer.sustained_rain',  name: 'Sustained Rain',  tree: 'archer', tier: 5, cost: 1, isSpell: false, description: '+50% Rain of Arrows duration (ticking damage zone).' },
  { id: 'archer.piercing_rain',   name: 'Piercing Rain',   tree: 'archer', tier: 5, cost: 2, isSpell: false, description: 'Rain arrows hit twice (2× effective damage).' },
  { id: 'archer.burn',            name: 'Burn',            tree: 'archer', tier: 6, cost: 3, isSpell: false, description: 'All arrows inflict 30 damage over 3s.' },
  { id: 'archer.freeze',          name: 'Freeze',          tree: 'archer', tier: 6, cost: 3, isSpell: false, description: 'All arrows inflict 30% slow for 2s.' },
  { id: 'archer.poison',          name: 'Poison',          tree: 'archer', tier: 6, cost: 3, isSpell: false, description: 'All arrows inflict 20 damage over 5s, reduce mana regen 30%.' },
  // Archer utility tree
  { id: 'archer_utility.evade',        name: 'Evade',        tree: 'archer_utility', tier: 1, cost: 1, isSpell: true,  description: 'Short dash with invulnerability frames (~0.3s).' },
  { id: 'archer_utility.combat_roll',  name: 'Combat Roll',  tree: 'archer_utility', tier: 2, cost: 2, isSpell: false, description: 'Fire an arrow at the nearest enemy during evade.' },
  { id: 'archer_utility.shadowstep',   name: 'Shadowstep',   tree: 'archer_utility', tier: 2, cost: 2, isSpell: false, description: 'Become invisible for 0.5s after evading.' },
  { id: 'archer_utility.acrobatics',   name: 'Acrobatics',   tree: 'archer_utility', tier: 3, cost: 3, isSpell: false, description: 'Evade cooldown reduced 40%. Can store 2 charges.' },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/amazon-skills.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run existing skills tests to confirm no regressions**

Run: `cd server && npx vitest run tests/skills.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add shared/src/skills.ts server/tests/amazon-skills.test.ts
git commit -m "feat: add archer and archer_utility skill nodes with mutuallyExclusive gates"
```

---

### Task 3: Expand Shared Types — Game State (Arrow, RainOfArrows, SpellId)

**Files:**
- Modify: `shared/src/types.ts`
- Modify: `server/src/gameloop/StateAdvancer.ts`

- [ ] **Step 1: Add arrow constants, expand SpellId and ProjectileType, add RainOfArrowsState**

In `shared/src/types.ts`:

Change `SpellId`:
```ts
export type SpellId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
```

SpellId mapping:
- 1: Fireball (mage)
- 2: Fire Wall (mage)
- 3: Meteor (mage)
- 4: Teleport (mage)
- 5: Power Shot (amazon)
- 6: Multi-shot (amazon)
- 7: Rain of Arrows (amazon)
- 8: Evade (amazon)

Change `ProjectileType`:
```ts
export type ProjectileType = 'fireball' | 'arrow';
```

Note: `Projectile.homing` is already `number | undefined` — no change needed.

Add after `MeteorState`:
```ts
export type RainOfArrowsState = {
  id: string;
  ownerId: string;
  target: Vec2;
  radius: number;
  strikeAt: number;
  sustained?: boolean;
  piercing?: boolean;
};
```

Add `rainOfArrows` to `GameState`:
```ts
export type GameState = {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  fireWalls: FireWallState[];
  meteors: MeteorState[];
  rainOfArrows: RainOfArrowsState[];
  phase: 'waiting' | 'countdown' | 'dueling' | 'ended';
  winner: string | null;
  gameMode: GameModeType;
  teams?: Record<string, string[]>;
  ack?: Record<string, number>;
};
```

Add arrow constants after the Meteor constants:
```ts
export const ARROW_SPEED = 560;  // 1.4× FIREBALL_SPEED
export const ARROW_RADIUS = 6;
export const MULTISHOT_SPREAD_3 = Math.PI / 12;  // ±15°
export const MULTISHOT_SPREAD_5 = Math.PI / 9;   // ±20°
export const RAIN_DELAY_TICKS = Math.round(1.5 * TICK_RATE);  // 90
export const RAIN_AOE_RADIUS = 70;
export const RAIN_SUSTAINED_TICKS = 3 * TICK_RATE;  // 180
export const RAIN_DAMAGE_PER_TICK = 30 / TICK_RATE;
export const EVADE_RANGE = 300;
export const EVADE_INVULN_TICKS = Math.round(0.3 * TICK_RATE);  // 18
```

Expand `SPELL_CONFIG`:
```ts
export const SPELL_CONFIG: Record<SpellId, { manaCost: number; cooldownTicks: number }> = {
  1: { manaCost: 25,  cooldownTicks: 30  },  // Fireball — 0.5s
  2: { manaCost: 60,  cooldownTicks: 180 },  // Fire Wall — 3s
  3: { manaCost: 100, cooldownTicks: 300 },  // Meteor — 5s
  4: { manaCost: 40,  cooldownTicks: 0   },  // Teleport — mana-gated
  5: { manaCost: 20,  cooldownTicks: 24  },  // Power Shot — 0.4s
  6: { manaCost: 50,  cooldownTicks: 120 },  // Multi-shot — 2s
  7: { manaCost: 80,  cooldownTicks: 240 },  // Rain of Arrows — 4s
  8: { manaCost: 30,  cooldownTicks: 90  },  // Evade — 1.5s
};
```

- [ ] **Step 2: Fix StateAdvancer to compile with new GameState shape**

In `server/src/gameloop/StateAdvancer.ts`:

In `makeInitialState` return, add `rainOfArrows: []`:
```ts
return { tick: 0, players: playerMap, projectiles: [], fireWalls: [], meteors: [], rainOfArrows: [], phase: 'dueling', winner: null, gameMode: mode?.type ?? '1v1', teams };
```

In `advanceState` return (line ~249), add `rainOfArrows: []` temporarily:
```ts
return { tick: tick + 1, players, projectiles, fireWalls, meteors: survivingMeteors, rainOfArrows: [], phase, winner, gameMode: state.gameMode, teams: state.teams };
```

- [ ] **Step 3: Run type check and existing tests**

Run: `cd server && npx tsc --noEmit && npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add shared/src/types.ts server/src/gameloop/StateAdvancer.ts
git commit -m "feat: add arrow/rain types, expand SpellId and GameState for Amazon"
```

---

### Task 4: Arrow Projectile Implementation

**Files:**
- Create: `server/src/spells/Arrow.ts`
- Create: `server/tests/arrow.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/arrow.test.ts
import { describe, it, expect } from 'vitest';
import { spawnArrow, advanceArrow, isArrowExpired, arrowHitsPlayer, arrowDamage } from '../src/spells/Arrow.ts';
import { ARROW_SPEED, ARROW_RADIUS, DELTA } from '@arena/shared';

describe('spawnArrow', () => {
  it('creates an arrow projectile with correct speed', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    const speed = Math.sqrt(arrow.velocity.x ** 2 + arrow.velocity.y ** 2);
    expect(speed).toBeCloseTo(ARROW_SPEED, 0);
    expect(arrow.type).toBe('arrow');
    expect(arrow.ownerId).toBe('p1');
  });

  it('applies custom speed from config', () => {
    const arrow = spawnArrow('p1', { x: 0, y: 0 }, { x: 100, y: 0 }, { speed: 700 });
    expect(arrow.velocity.x).toBeCloseTo(700, 0);
  });
});

describe('advanceArrow', () => {
  it('moves arrow by velocity * DELTA', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    const moved = advanceArrow(arrow, undefined);
    expect(moved.position.x).toBeCloseTo(100 + ARROW_SPEED * DELTA, 1);
    expect(moved.position.y).toBeCloseTo(100, 1);
  });

  it('applies slight homing when homing=1', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 1 });
    const enemy = { x: 100, y: 200 };
    const moved = advanceArrow(arrow, enemy);
    expect(moved.velocity.y).toBeGreaterThan(0);
  });

  it('applies strong homing when homing=2', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 2 });
    const enemy = { x: 100, y: 200 };
    const moved = advanceArrow(arrow, enemy);
    const arrowWeak = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 1 });
    const movedWeak = advanceArrow(arrowWeak, enemy);
    expect(moved.velocity.y).toBeGreaterThan(movedWeak.velocity.y);
  });
});

describe('isArrowExpired', () => {
  it('returns true when arrow is out of arena bounds', () => {
    const arrow = spawnArrow('p1', { x: -10, y: 100 }, { x: -20, y: 100 }, {});
    expect(isArrowExpired({ ...arrow, position: { x: -10, y: 100 } })).toBe(true);
  });

  it('returns false when arrow is within bounds', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    expect(isArrowExpired(arrow)).toBe(false);
  });
});

describe('arrowHitsPlayer', () => {
  it('detects hit when arrow overlaps player', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    expect(arrowHitsPlayer({ ...arrow, position: { x: 100, y: 100 } }, { x: 100, y: 100 }, 'p2')).toBe(true);
  });

  it('does not hit own player', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    expect(arrowHitsPlayer(arrow, { x: 100, y: 100 }, 'p1')).toBe(false);
  });
});

describe('arrowDamage', () => {
  it('returns a value between min and max', () => {
    const dmg = arrowDamage(60, 90);
    expect(dmg).toBeGreaterThanOrEqual(60);
    expect(dmg).toBeLessThanOrEqual(90);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/arrow.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Arrow.ts**

```ts
// server/src/spells/Arrow.ts
import { Projectile, Vec2, ARROW_SPEED, ARROW_RADIUS, PLAYER_HALF_SIZE, ARENA_SIZE, DELTA } from '@arena/shared';
import { PILLARS } from '@arena/shared';
import { circleHitsAABB } from '../physics/Collision.ts';

let _id = 0;
const nextId = () => `ar_${++_id}`;

type ArrowConfig = {
  speed?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: number;
};

export function spawnArrow(
  ownerId: string,
  from: Vec2,
  target: Vec2,
  cfg: ArrowConfig = {},
): Projectile {
  const speed = cfg.speed ?? ARROW_SPEED;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    id: nextId(),
    ownerId,
    type: 'arrow',
    position: { x: from.x, y: from.y },
    velocity: { x: (dx / len) * speed, y: (dy / len) * speed },
    radius: ARROW_RADIUS,
    damageMin: cfg.damageMin ?? 60,
    damageMax: cfg.damageMax ?? 90,
    homing: cfg.homing ?? 0,
  };
}

export function advanceArrow(p: Projectile, enemyPos?: Vec2): Projectile {
  let vx = p.velocity.x;
  let vy = p.velocity.y;
  if (p.homing && p.homing > 0 && enemyPos) {
    const dx = enemyPos.x - p.position.x;
    const dy = enemyPos.y - p.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = p.homing >= 2 ? 120 : 60;
    vx += (dx / len) * strength * DELTA;
    vy += (dy / len) * strength * DELTA;
    const spd = Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2);
    const newSpd = Math.sqrt(vx * vx + vy * vy) || 1;
    vx = (vx / newSpd) * spd;
    vy = (vy / newSpd) * spd;
  }
  return {
    ...p,
    velocity: { x: vx, y: vy },
    position: {
      x: p.position.x + vx * DELTA,
      y: p.position.y + vy * DELTA,
    },
  };
}

export function isArrowExpired(p: Projectile): boolean {
  const r = p.radius ?? ARROW_RADIUS;
  const { x, y } = p.position;
  if (x - r < 0 || x + r > ARENA_SIZE || y - r < 0 || y + r > ARENA_SIZE) return true;
  return PILLARS.some(pillar => circleHitsAABB(p.position, r, pillar));
}

export function arrowHitsPlayer(p: Projectile, playerPos: Vec2, playerId: string): boolean {
  if (p.ownerId === playerId) return false;
  const r = p.radius ?? ARROW_RADIUS;
  return circleHitsAABB(p.position, r, { x: playerPos.x, y: playerPos.y, halfSize: PLAYER_HALF_SIZE });
}

export function arrowDamage(min = 60, max = 90): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/arrow.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/spells/Arrow.ts server/tests/arrow.test.ts
git commit -m "feat: add Arrow projectile implementation with homing support"
```

---

### Task 5: Rain of Arrows Implementation

**Files:**
- Create: `server/src/spells/RainOfArrows.ts`
- Create: `server/tests/rain-of-arrows.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/rain-of-arrows.test.ts
import { describe, it, expect } from 'vitest';
import { spawnRainOfArrows, rainDetonates, rainHitsPlayer, rainDamage } from '../src/spells/RainOfArrows.ts';
import { RAIN_DELAY_TICKS, RAIN_AOE_RADIUS } from '@arena/shared';

describe('spawnRainOfArrows', () => {
  it('creates a rain state with correct delay', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 100, { sustained: false, piercing: false });
    expect(rain.ownerId).toBe('p1');
    expect(rain.target).toEqual({ x: 500, y: 500 });
    expect(rain.strikeAt).toBe(100 + RAIN_DELAY_TICKS);
    expect(rain.radius).toBe(RAIN_AOE_RADIUS);
  });

  it('sets sustained and piercing flags', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, { sustained: true, piercing: true });
    expect(rain.sustained).toBe(true);
    expect(rain.piercing).toBe(true);
  });
});

describe('rainDetonates', () => {
  it('returns true when tick equals strikeAt', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainDetonates(rain, RAIN_DELAY_TICKS)).toBe(true);
  });

  it('returns false before strikeAt', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainDetonates(rain, RAIN_DELAY_TICKS - 1)).toBe(false);
  });
});

describe('rainHitsPlayer', () => {
  it('hits a player within the AoE radius', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainHitsPlayer(rain, { x: 530, y: 500 }, 'p2')).toBe(true);
  });

  it('does not hit a player outside the AoE radius', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainHitsPlayer(rain, { x: 600, y: 600 }, 'p2')).toBe(false);
  });

  it('does not hit the owner', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainHitsPlayer(rain, { x: 500, y: 500 }, 'p1')).toBe(false);
  });
});

describe('rainDamage', () => {
  it('returns a value between 150 and 220', () => {
    const dmg = rainDamage(false);
    expect(dmg).toBeGreaterThanOrEqual(150);
    expect(dmg).toBeLessThanOrEqual(220);
  });

  it('doubles damage when piercing is true', () => {
    const dmg = rainDamage(true);
    expect(dmg).toBeGreaterThanOrEqual(300);
    expect(dmg).toBeLessThanOrEqual(440);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/rain-of-arrows.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RainOfArrows.ts**

```ts
// server/src/spells/RainOfArrows.ts
import { RainOfArrowsState, Vec2, RAIN_DELAY_TICKS, RAIN_AOE_RADIUS, PLAYER_HALF_SIZE } from '@arena/shared';

let _id = 0;
const nextId = () => `rain_${++_id}`;

type RainConfig = {
  sustained?: boolean;
  piercing?: boolean;
};

export function spawnRainOfArrows(
  ownerId: string,
  target: Vec2,
  currentTick: number,
  cfg: RainConfig = {},
): RainOfArrowsState {
  return {
    id: nextId(),
    ownerId,
    target: { ...target },
    radius: RAIN_AOE_RADIUS,
    strikeAt: currentTick + RAIN_DELAY_TICKS,
    sustained: cfg.sustained,
    piercing: cfg.piercing,
  };
}

export function rainDetonates(rain: RainOfArrowsState, tick: number): boolean {
  return tick >= rain.strikeAt;
}

export function rainHitsPlayer(rain: RainOfArrowsState, playerPos: Vec2, playerId: string): boolean {
  if (rain.ownerId === playerId) return false;
  const dx = playerPos.x - rain.target.x;
  const dy = playerPos.y - rain.target.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist <= rain.radius + PLAYER_HALF_SIZE;
}

export function rainDamage(piercing: boolean): number {
  const min = 150;
  const max = 220;
  const base = Math.floor(min + Math.random() * (max - min + 1));
  return piercing ? base * 2 : base;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/rain-of-arrows.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/spells/RainOfArrows.ts server/tests/rain-of-arrows.test.ts
git commit -m "feat: add Rain of Arrows spell implementation"
```

---

### Task 6: Amazon Spell Modifiers

**Files:**
- Create: `server/src/skills/AmazonModifiers.ts`
- Create: `server/tests/amazon-modifiers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// server/tests/amazon-modifiers.test.ts
import { describe, it, expect } from 'vitest';
import { buildAmazonModifiers } from '../src/skills/AmazonModifiers.ts';
import { ARROW_SPEED, EVADE_RANGE } from '@arena/shared';

describe('buildAmazonModifiers', () => {
  it('returns base values when no skills are owned', () => {
    const m = buildAmazonModifiers(new Map());
    expect(m.arrow.speed).toBe(ARROW_SPEED);
    expect(m.arrow.damageMin).toBe(60);
    expect(m.arrow.damageMax).toBe(90);
    expect(m.arrow.homing).toBe(0);
    expect(m.multishot.arrowCount).toBe(3);
    expect(m.multishot.damageMin).toBe(40);
    expect(m.multishot.damageMax).toBe(60);
    expect(m.rain.sustained).toBe(false);
    expect(m.rain.piercing).toBe(false);
    expect(m.evade.range).toBe(EVADE_RANGE);
    expect(m.evade.combatRoll).toBe(false);
    expect(m.evade.shadowstep).toBe(false);
    expect(m.evade.cooldownMultiplier).toBe(1);
    expect(m.element).toBe('none');
  });

  it('applies guided: homing=1', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.guided', 1]]));
    expect(m.arrow.homing).toBe(1);
  });

  it('applies homing: homing=2', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.guided', 1], ['archer.homing', 1]]));
    expect(m.arrow.homing).toBe(2);
  });

  it('applies barrage: 5 arrows', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.multishot', 1], ['archer.barrage', 1]]));
    expect(m.multishot.arrowCount).toBe(5);
  });

  it('applies sustained_rain', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.sustained_rain', 1]]));
    expect(m.rain.sustained).toBe(true);
  });

  it('applies piercing_rain', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.piercing_rain', 1]]));
    expect(m.rain.piercing).toBe(true);
  });

  it('applies burn element', () => {
    const m = buildAmazonModifiers(new Map([['archer.burn', 1]]));
    expect(m.element).toBe('burn');
  });

  it('applies freeze element', () => {
    const m = buildAmazonModifiers(new Map([['archer.freeze', 1]]));
    expect(m.element).toBe('freeze');
  });

  it('applies poison element', () => {
    const m = buildAmazonModifiers(new Map([['archer.poison', 1]]));
    expect(m.element).toBe('poison');
  });

  it('applies combat_roll', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.combat_roll', 1]]));
    expect(m.evade.combatRoll).toBe(true);
  });

  it('applies shadowstep', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.shadowstep', 1]]));
    expect(m.evade.shadowstep).toBe(true);
  });

  it('applies acrobatics: 0.6 cooldown multiplier', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.combat_roll', 1], ['archer_utility.acrobatics', 1]]));
    expect(m.evade.cooldownMultiplier).toBe(0.6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/amazon-modifiers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement AmazonModifiers.ts**

```ts
// server/src/skills/AmazonModifiers.ts
import { ARROW_SPEED, EVADE_RANGE } from '@arena/shared';

export type ElementType = 'none' | 'burn' | 'freeze' | 'poison';

export type ArrowModifiers = {
  speed: number;
  damageMin: number;
  damageMax: number;
  homing: number;
};

export type MultishotModifiers = {
  arrowCount: number;
  damageMin: number;
  damageMax: number;
};

export type RainModifiers = {
  sustained: boolean;
  piercing: boolean;
};

export type EvadeModifiers = {
  range: number;
  combatRoll: boolean;
  shadowstep: boolean;
  cooldownMultiplier: number;
};

export type AmazonSpellModifiers = {
  arrow: ArrowModifiers;
  multishot: MultishotModifiers;
  rain: RainModifiers;
  evade: EvadeModifiers;
  element: ElementType;
};

export function buildAmazonModifiers(skills: Map<string, number>): AmazonSpellModifiers {
  const has = (id: string) => (skills.get(id) ?? 0) > 0;

  let homing = 0;
  if (has('archer.homing')) homing = 2;
  else if (has('archer.guided')) homing = 1;

  let element: ElementType = 'none';
  if (has('archer.burn')) element = 'burn';
  else if (has('archer.freeze')) element = 'freeze';
  else if (has('archer.poison')) element = 'poison';

  return {
    arrow: {
      speed: ARROW_SPEED,
      damageMin: 60,
      damageMax: 90,
      homing,
    },
    multishot: {
      arrowCount: has('archer.barrage') ? 5 : 3,
      damageMin: 40,
      damageMax: 60,
    },
    rain: {
      sustained: has('archer.sustained_rain'),
      piercing: has('archer.piercing_rain'),
    },
    evade: {
      range: EVADE_RANGE,
      combatRoll: has('archer_utility.combat_roll'),
      shadowstep: has('archer_utility.shadowstep'),
      cooldownMultiplier: has('archer_utility.acrobatics') ? 0.6 : 1,
    },
    element,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/amazon-modifiers.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/skills/AmazonModifiers.ts server/tests/amazon-modifiers.test.ts
git commit -m "feat: add buildAmazonModifiers for Amazon spell modifier resolution"
```

---

### Task 7: Class-Aware Default Skill in loadSkills.ts

**Files:**
- Modify: `server/src/skills/loadSkills.ts`

- [ ] **Step 1: Update loadSkillsForCharacter to be class-aware**

Change the character query (line ~16) to also select `class`:

```ts
const { data: charData, error: charErr } = await supabase
  .from('characters')
  .select('id, class')
  .eq('id', characterId)
  .eq('user_id', user.id)
  .single();
```

Change the default skill logic (around line 32-34):

```ts
const defaultSkill = charData.class === 'amazon' ? 'archer.power_shot' : 'fire.fireball';
if (!skills.has(defaultSkill as NodeId)) skills.add(defaultSkill as NodeId);
```

Note: `skills` here is a `Set<NodeId>` (the function's internal representation). Verify the function's return type still works — if it returns a `Set`, the caller (likely room join logic) may convert to Map. Check this.

- [ ] **Step 2: Run existing tests to confirm no regressions**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/skills/loadSkills.ts
git commit -m "feat: class-aware default skill (power_shot for amazon, fireball for mage)"
```

---

### Task 8: Wire Amazon Spells into StateAdvancer

**Files:**
- Modify: `server/src/gameloop/StateAdvancer.ts`

- [ ] **Step 1: Add imports**

At the top of StateAdvancer.ts, add:

```ts
import { spawnArrow, advanceArrow, isArrowExpired, arrowHitsPlayer, arrowDamage } from '../spells/Arrow.ts';
import { spawnRainOfArrows, rainDetonates, rainHitsPlayer, rainDamage } from '../spells/RainOfArrows.ts';
import { buildAmazonModifiers } from '../skills/AmazonModifiers.ts';
```

Add to the `@arena/shared` import:
```ts
ARROW_SPEED, EVADE_RANGE, EVADE_INVULN_TICKS,
MULTISHOT_SPREAD_3, MULTISHOT_SPREAD_5,
RAIN_SUSTAINED_TICKS, RAIN_DAMAGE_PER_TICK,
```

And add the type import:
```ts
import type { RainOfArrowsState } from '@arena/shared';
```

- [ ] **Step 2: Make spellNodeMap class-aware**

Extract the inline `spellNodeMap` into a helper function. Add before `advanceState`:

```ts
function getSpellNodeMap(skills: Map<NodeId, number>): Partial<Record<SpellId, NodeId>> {
  const isAmazon = skills.has('archer.power_shot' as NodeId);
  if (isAmazon) {
    return {
      5: 'archer.power_shot' as NodeId,
      6: 'archer.multishot' as NodeId,
      7: 'archer.rain_of_arrows' as NodeId,
      8: 'archer_utility.evade' as NodeId,
    };
  }
  return {
    1: 'fire.fireball' as NodeId,
    2: 'fire.fire_wall' as NodeId,
    3: 'fire.meteor' as NodeId,
    4: 'utility.teleport' as NodeId,
  };
}
```

Replace the inline `spellNodeMap` in the spell-cast loop with:
```ts
const spellNodeMap = getSpellNodeMap(skillSets[id] ?? new Map());
```

- [ ] **Step 3: Build Amazon modifiers alongside mage modifiers**

Change the modifier construction to build both:

```ts
const modifiers = Object.fromEntries(
  Object.keys(players).map(id => {
    const skills = skillSets[id] ?? new Map();
    return [id, buildSpellModifiers(skills)];
  })
);
const amazonMods = Object.fromEntries(
  Object.keys(players).map(id => {
    const skills = skillSets[id] ?? new Map();
    const isAmazon = skills.has('archer.power_shot' as NodeId);
    return [id, isAmazon ? buildAmazonModifiers(skills) : null];
  })
);
```

- [ ] **Step 4: Add `rainOfArrows` tracking variable**

After `let meteors = [...state.meteors];` add:
```ts
let rainOfArrows: RainOfArrowsState[] = [...state.rainOfArrows];
```

- [ ] **Step 5: Add spell cast handling for spells 5, 6, 7, 8**

After the `} else if (spell === 4) { ... }` block, add:

```ts
    } else if (spell === 5) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      const arrow = spawnArrow(id, p.position, input.aimTarget, {
        speed: aMods.arrow.speed,
        damageMin: aMods.arrow.damageMin,
        damageMax: aMods.arrow.damageMax,
        homing: aMods.arrow.homing,
      });
      projectiles = [...projectiles, arrow];
    } else if (spell === 6) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      const count = aMods.multishot.arrowCount;
      const spread = count === 5 ? MULTISHOT_SPREAD_5 : MULTISHOT_SPREAD_3;
      const baseAngle = Math.atan2(input.aimTarget.y - p.position.y, input.aimTarget.x - p.position.x);
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (i - (count - 1) / 2) * (spread * 2 / (count - 1));
        const target = { x: p.position.x + Math.cos(angle) * 500, y: p.position.y + Math.sin(angle) * 500 };
        const arrow = spawnArrow(id, p.position, target, {
          speed: aMods.arrow.speed,
          damageMin: aMods.multishot.damageMin,
          damageMax: aMods.multishot.damageMax,
          homing: 0,
        });
        projectiles = [...projectiles, arrow];
      }
    } else if (spell === 7) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      rainOfArrows = [...rainOfArrows, spawnRainOfArrows(id, input.aimTarget, tick, {
        sustained: aMods.rain.sustained,
        piercing: aMods.rain.piercing,
      })];
    } else if (spell === 8) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      const dx = input.aimTarget.x - p.position.x;
      const dy = input.aimTarget.y - p.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const range = aMods.evade.range;
      const clampedTarget = dist > range
        ? { x: p.position.x + (dx / dist) * range, y: p.position.y + (dy / dist) * range }
        : input.aimTarget;
      const newPos = resolvePlayerPillarCollisions(clampToArena(clampedTarget));
      players[id] = {
        ...players[id],
        position: newPos,
        invulnUntil: tick + EVADE_INVULN_TICKS,
      };
    }
```

- [ ] **Step 6: Split projectile advancement by type**

Replace section 3 (projectile advancement loop) to handle both arrow and fireball:

```ts
  // 3. Advance projectiles, check hits
  const survivingProjectiles = [];
  const newProjectiles: typeof projectiles = [];
  for (const proj of projectiles) {
    const candidates = Object.entries(players).filter(([pid]) => pid !== proj.ownerId && players[pid].hp > 0);
    const enemyEntry = candidates.length > 0
      ? candidates.reduce((closest, curr) => {
          const closestDist = (closest[1].position.x - proj.position.x) ** 2 + (closest[1].position.y - proj.position.y) ** 2;
          const currDist = (curr[1].position.x - proj.position.x) ** 2 + (curr[1].position.y - proj.position.y) ** 2;
          return currDist < closestDist ? curr : closest;
        })
      : undefined;

    if (proj.type === 'arrow') {
      const moved = advanceArrow(proj, enemyEntry?.[1].position);
      if (isArrowExpired(moved)) continue;
      let hit = false;
      for (const [pid, player] of Object.entries(players)) {
        if (arrowHitsPlayer(moved, player.position, pid)) {
          const invuln = (player.invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...player, hp: Math.max(0, player.hp - arrowDamage(moved.damageMin, moved.damageMax) * getDamageMultiplier(moved.ownerId, pid, players, resolvedMode)) };
          }
          hit = true;
          break;
        }
      }
      if (!hit) survivingProjectiles.push(moved);
    } else {
      const moved = advanceFireball(proj, enemyEntry?.[1].position);
      if (isFireballExpired(moved)) continue;
      let hit = false;
      for (const [pid, player] of Object.entries(players)) {
        if (fireballHitsPlayer(moved, player.position, pid)) {
          const invuln = (player.invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage(moved) * getDamageMultiplier(moved.ownerId, pid, players, resolvedMode)) };
          }
          if ((moved.split ?? 0) > 0) {
            const angles = [-0.4, 0, 0.4];
            for (const offset of angles) {
              const baseAngle = Math.atan2(moved.velocity.y, moved.velocity.x) + offset;
              const spd = Math.sqrt(moved.velocity.x ** 2 + moved.velocity.y ** 2);
              newProjectiles.push(spawnFireball(moved.ownerId, moved.position, {
                x: moved.position.x + Math.cos(baseAngle) * 100,
                y: moved.position.y + Math.sin(baseAngle) * 100,
              }, { speed: spd, radius: moved.radius, damageMin: moved.damageMin, damageMax: moved.damageMax }));
            }
          }
          hit = true;
          break;
        }
      }
      if (!hit) survivingProjectiles.push(moved);
    }
  }
  projectiles = [...survivingProjectiles, ...newProjectiles];
```

- [ ] **Step 7: Add Rain of Arrows detonation logic**

After the meteor detonation section (section 5), add:

```ts
  // 5b. Rain of Arrows detonations
  const survivingRain: RainOfArrowsState[] = [];
  for (const rain of rainOfArrows) {
    if (rainDetonates(rain, tick)) {
      for (const [pid] of Object.entries(players)) {
        if (rainHitsPlayer(rain, players[pid].position, pid)) {
          const invuln = (players[pid].invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - rainDamage(rain.piercing ?? false) * getDamageMultiplier(rain.ownerId, pid, players, resolvedMode)) };
          }
        }
      }
      if (rain.sustained) {
        fireWalls = [...fireWalls, {
          id: `rain_zone_${rain.id}`,
          ownerId: rain.ownerId,
          segments: [],
          expiresAt: tick + RAIN_SUSTAINED_TICKS,
          shape: 'circle' as const,
          center: { ...rain.target },
          radius: rain.radius,
        }];
      }
    } else {
      survivingRain.push(rain);
    }
  }
  rainOfArrows = survivingRain;
```

- [ ] **Step 8: Update the return statement**

```ts
return { tick: tick + 1, players, projectiles, fireWalls, meteors: survivingMeteors, rainOfArrows, phase, winner, gameMode: state.gameMode, teams: state.teams };
```

- [ ] **Step 9: Run all tests**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add server/src/gameloop/StateAdvancer.ts
git commit -m "feat: wire Amazon spells (power shot, multishot, rain, evade) into game loop"
```

---

### Task 9: Client Skill Tree UI — Amazon Rendering

**Files:**
- Modify: `client/src/skills/SkillTreeUI.ts`

- [ ] **Step 1: Add archer node IDs to the NODE_ICONS map**

Add these entries to the `NODE_ICONS` record:

```ts
'archer.power_shot':          'fa-bullseye',
'archer.guided':              'fa-location-arrow',
'archer.multishot':           'fa-arrows-split-up-and-left',
'archer.homing':              'fa-crosshairs',
'archer.barrage':             'fa-burst',
'archer.rain_of_arrows':      'fa-cloud-rain',
'archer.sustained_rain':      'fa-hourglass-half',
'archer.piercing_rain':       'fa-bolt',
'archer.burn':                'fa-fire',
'archer.freeze':              'fa-snowflake',
'archer.poison':              'fa-skull-crossbones',
'archer_utility.evade':       'fa-person-running',
'archer_utility.combat_roll': 'fa-person-falling',
'archer_utility.shadowstep':  'fa-ghost',
'archer_utility.acrobatics':  'fa-tornado',
```

- [ ] **Step 2: Add position maps**

Add after the existing `UTIL_POSITIONS`:

```ts
const ARCHER_POSITIONS: Partial<Record<NodeId, NodePos>> = {
  'archer.power_shot':      { x: 50, y: 0 },
  'archer.guided':          { x: 30, y: 90 },
  'archer.multishot':       { x: 70, y: 90 },
  'archer.homing':          { x: 30, y: 180 },
  'archer.barrage':         { x: 70, y: 180 },
  'archer.rain_of_arrows':  { x: 50, y: 270 },
  'archer.sustained_rain':  { x: 30, y: 360 },
  'archer.piercing_rain':   { x: 70, y: 360 },
  'archer.burn':            { x: 25, y: 450 },
  'archer.freeze':          { x: 50, y: 450 },
  'archer.poison':          { x: 75, y: 450 },
};

const ARCHER_UTIL_POSITIONS: Partial<Record<NodeId, NodePos>> = {
  'archer_utility.evade':        { x: 50, y: 0 },
  'archer_utility.combat_roll':  { x: 30, y: 90 },
  'archer_utility.shadowstep':   { x: 70, y: 90 },
  'archer_utility.acrobatics':   { x: 50, y: 180 },
};
```

- [ ] **Step 3: Make render() class-aware**

Replace the `render()` method body to switch on `this.charClass`:

```ts
private render(): void {
  const pts = this.skillPoints;

  const isAmazon = this.charClass === 'amazon';
  const mainNodes = SKILL_NODES.filter(n => n.tree === (isAmazon ? 'archer' : 'fire'));
  const utilNodes = SKILL_NODES.filter(n => n.tree === (isAmazon ? 'archer_utility' : 'utility'));
  const mainPositions = isAmazon ? ARCHER_POSITIONS : FIRE_POSITIONS;
  const utilPositions = isAmazon ? ARCHER_UTIL_POSITIONS : UTIL_POSITIONS;
  const mainLabel = isAmazon ? 'Archer' : 'Fire';
  const mainContainerHeight = isAmazon ? '520px' : '600px';

  this.el.innerHTML = `
    <div class="st-vignette"></div>
    <div class="st-ui">
      <div class="st-header">
        <div>
          <div class="st-title">${esc(this.charName)} — ${esc(this.charClass)} Skills</div>
          <div class="st-points">Points Available: <b>${pts}</b></div>
        </div>
        <div class="st-header-buttons">
          <button id="st-respec" class="st-btn">Reset Skills</button>
          <button id="st-close" class="st-btn">Back to Lobby</button>
        </div>
      </div>

      <div class="st-tree-label">${mainLabel}</div>
      <div class="st-tree-container" style="height:${mainContainerHeight}">
        <svg id="st-main-svg" class="st-tree-svg"></svg>
        ${mainNodes.map(n => this.renderNode(n, pts, mainPositions[n.id])).join('')}
      </div>

      <div class="st-divider"><div class="st-divider-line"></div><div class="st-divider-gem"></div><div class="st-divider-line"></div></div>

      <div class="st-util-label">${isAmazon ? 'Evasion' : 'Shared Utility'}</div>
      <div class="st-util-container">
        <svg id="st-util-svg" class="st-util-svg" overflow="visible"></svg>
        ${utilNodes.map(n => this.renderNode(n, pts, utilPositions[n.id])).join('')}
      </div>

      <div id="st-tooltip" class="st-tooltip"></div>
    </div>
  `;

  this.el.querySelector('#st-close')!.addEventListener('click', () => this.hide());
  this.el.querySelector('#st-respec')!.addEventListener('click', () => this.handleRespec());

  this.drawConnections('st-main-svg', mainPositions, mainNodes, pts);
  this.drawConnections('st-util-svg', utilPositions, utilNodes, pts);
  this.attachNodeListeners(pts);
}
```

- [ ] **Step 4: Update tooltip for mutual exclusion**

In `attachNodeListeners`, update the tooltip status logic. Before the existing `gateBlocked` check, add:

```ts
const gate = GATES[id];
const mutuallyLocked = gate?.mutuallyExclusive && gate.mutuallyExclusive.some(r => this.owned.has(r));
```

Then in the statusLine logic:
```ts
if (mutuallyLocked) {
  statusLine = '<span style="color:#884020;font-size:0.6rem">Locked (requires respec to change element)</span>';
} else if (isOwned) {
  // ...existing owned logic
}
```

- [ ] **Step 5: Make reload() class-aware for auto-unlock**

Replace the fireball auto-unlock block with:

```ts
if (this.charClass === 'amazon') {
  if (!this.owned.has('archer.power_shot' as NodeId)) {
    await supabase.rpc('unlock_skill_node', {
      p_character_id: this.characterId,
      p_node_id: 'archer.power_shot',
      p_cost: 0,
    });
    this.owned.add('archer.power_shot' as NodeId);
  }
} else {
  if (!this.owned.has('fire.fireball')) {
    await supabase.rpc('unlock_skill_node', {
      p_character_id: this.characterId,
      p_node_id: 'fire.fireball',
      p_cost: 0,
    });
    this.owned.add('fire.fireball');
  }
}
```

- [ ] **Step 6: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add client/src/skills/SkillTreeUI.ts
git commit -m "feat: render Amazon archer tree and utility tree in SkillTreeUI"
```

---

### Task 10: Integration Test — Amazon in StateAdvancer

**Files:**
- Create: `server/tests/amazon-combat.test.ts`

- [ ] **Step 1: Write integration tests**

```ts
// server/tests/amazon-combat.test.ts
import { describe, it, expect } from 'vitest';
import { makeInitialState, advanceState } from '../src/gameloop/StateAdvancer.ts';
import type { NodeId, InputFrame } from '@arena/shared';
import { ARROW_SPEED, DELTA, RAIN_DELAY_TICKS } from '@arena/shared';

describe('Amazon combat integration', () => {
  const amazonSkills = new Map<NodeId, number>([
    ['archer.power_shot' as NodeId, 1],
    ['archer.guided' as NodeId, 1],
    ['archer.multishot' as NodeId, 1],
  ]);

  it('Power Shot spawns an arrow projectile', () => {
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 5, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: amazonSkills, p2: new Map() });
    const arrows = next.projectiles.filter(p => p.type === 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0].ownerId).toBe('p1');
  });

  it('Multi-shot spawns 3 arrow projectiles', () => {
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 6, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: amazonSkills, p2: new Map() });
    const arrows = next.projectiles.filter(p => p.type === 'arrow');
    expect(arrows).toHaveLength(3);
  });

  it('Rain of Arrows creates a rain state', () => {
    const skills = new Map<NodeId, number>([
      ...amazonSkills,
      ['archer.homing' as NodeId, 1],
      ['archer.rain_of_arrows' as NodeId, 1],
    ]);
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 7, aimTarget: { x: 1000, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: skills, p2: new Map() });
    expect(next.rainOfArrows).toHaveLength(1);
    expect(next.rainOfArrows[0].ownerId).toBe('p1');
  });

  it('Evade moves the player and grants invulnerability', () => {
    const skills = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer_utility.evade' as NodeId, 1],
    ]);
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', spawnPos: { x: 500, y: 1000 } },
      { id: 'p2', displayName: 'Mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 8, aimTarget: { x: 800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: skills, p2: new Map() });
    expect(next.players['p1'].position.x).toBeGreaterThan(500);
    expect(next.players['p1'].invulnUntil).toBeGreaterThan(0);
  });

  it('Amazon cannot cast Fireball (spell 1)', () => {
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: amazonSkills, p2: new Map() });
    expect(next.projectiles.filter(p => p.type === 'fireball')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run tests/amazon-combat.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Run the full test suite**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add server/tests/amazon-combat.test.ts
git commit -m "test: add Amazon combat integration tests"
```

---

### Task 11: Client SpellRenderer — Arrow Rendering

**Files:**
- Modify: `client/src/renderer/SpellRenderer.ts`

- [ ] **Step 1: Read SpellRenderer to understand existing rendering pattern**

Read `client/src/renderer/SpellRenderer.ts` to understand how fireballs and meteors are rendered (canvas 2D or WebGL, shape, color).

- [ ] **Step 2: Add arrow projectile rendering**

In the projectile rendering loop, branch on `projectile.type === 'arrow'`:
- Draw a thin elongated shape (2px wide, 12px long) oriented along the velocity vector
- Color: `#88dd44` (green, Amazon theme)
- Optionally add a short trail (3-4px trailing line at 50% opacity)

- [ ] **Step 3: Add Rain of Arrows zone indicator**

Similar to Meteor's impact indicator:
- Before detonation: draw a dashed green circle at `rain.target` with radius `rain.radius`
- Fill opacity increases as tick approaches `strikeAt` (progress = (tick - spawnTick) / RAIN_DELAY_TICKS)
- After detonation (if sustained): render as a semi-transparent green zone (like fire wall but circular)

- [ ] **Step 4: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/renderer/SpellRenderer.ts
git commit -m "feat: add arrow projectile and rain-of-arrows indicator rendering"
```

---

### Task 12: Client InputHandler — Class-Aware Keybindings

**Files:**
- Modify: `client/src/input/InputHandler.ts`

- [ ] **Step 1: Read InputHandler**

Read `client/src/input/InputHandler.ts` to understand keybinding → SpellId mapping.

- [ ] **Step 2: Add class-aware spell mapping**

Add a method or property that allows setting the active class. The same hotkeys (Q/W/E/R or 1/2/3/4) should emit different SpellIds based on class:
- Mage: keys → 1, 2, 3, 4
- Amazon: keys → 5, 6, 7, 8

Add a `setCharacterClass(cls: string)` method that sets an internal `spellOffset`:
```ts
private spellOffset = 0;  // 0 for mage, 4 for amazon

setCharacterClass(cls: string): void {
  this.spellOffset = cls === 'amazon' ? 4 : 0;
}
```

Then where SpellId is emitted from key presses, add the offset:
```ts
const spellId = (baseSpellId + this.spellOffset) as SpellId;
```

- [ ] **Step 3: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/input/InputHandler.ts
git commit -m "feat: class-aware spell keybindings for Amazon"
```

---

### Task 13: Final Integration — Full Test Suite and Build

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run client type check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Build the client**

Run: `cd client && npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

Start the dev server and verify:
1. Create a new character — Amazon appears as a selectable class
2. Select Amazon — archer skill tree renders with correct nodes
3. Power Shot is auto-unlocked, tooltip works
4. Spend points on Guided and Multi-shot
5. Enter a match — Power Shot fires arrows (green, fast)
6. Multi-shot fires a spread of arrows
7. Test elemental mutual exclusion in skill tree UI (unlock burn → freeze/poison locked)
8. Respec clears all and allows re-choosing element

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
