# Stackable Skill Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players to invest multiple skill points into certain modifier nodes, with per-rank scaling via diminishing returns and escalating costs past a soft cap.

**Architecture:** Shared types and scaling helpers live in `shared/src/skills.ts` so both client and server compute costs/effects identically. The server's `buildSpellModifiers` reads rank values from a `Map<NodeId, number>` instead of a `Set<NodeId>`. The client UI renders radial ring segments and rank badges for stackable nodes. Database adds `rank` and `total_spent` columns to `skill_unlocks`.

**Tech Stack:** TypeScript, Vitest, Supabase (Postgres RPCs), Socket.io, HTML/CSS (skill tree UI)

**Test command:** `cd server && npx vitest run`

---

### Task 1: Shared Types — StackableConfig, Helpers, Updated SKILL_NODES

**Files:**
- Modify: `shared/src/skills.ts`

- [ ] **Step 1: Write failing tests for the new shared helpers**

Create the test file first. These test `effectAtRank`, `rankUpCost`, `totalSpentForRanks`, and `isStackable`.

In `server/tests/skills.test.ts`, update the existing `@arena/shared` import on line 2 to include the new symbols:

```typescript
import { canUnlock, SKILL_NODES, effectAtRank, rankUpCost, totalSpentForRanks, isStackable, DIMINISHING_POWER } from '@arena/shared';
```

Then add a new describe block after the existing `canUnlock` describe:

```typescript
describe('scaling helpers', () => {
  it('effectAtRank returns baseEffect at rank 1', () => {
    expect(effectAtRank(25, 1)).toBeCloseTo(25, 5);
  });

  it('effectAtRank applies diminishing power curve', () => {
    expect(effectAtRank(25, 2)).toBeCloseTo(25 * Math.pow(2, 0.7), 5);
    expect(effectAtRank(25, 5)).toBeCloseTo(25 * Math.pow(5, 0.7), 5);
  });

  it('effectAtRank returns 0 for rank 0', () => {
    expect(effectAtRank(25, 0)).toBe(0);
  });

  it('rankUpCost returns base cost for ranks up to soft cap', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!;
    expect(rankUpCost(node, 0)).toBe(1);
    expect(rankUpCost(node, 1)).toBe(1);
    expect(rankUpCost(node, 4)).toBe(1);
  });

  it('rankUpCost ramps past soft cap', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!;
    expect(rankUpCost(node, 5)).toBe(2);  // baseCost(1) + (6 - 5)
    expect(rankUpCost(node, 6)).toBe(3);  // baseCost(1) + (7 - 5)
    expect(rankUpCost(node, 7)).toBe(4);  // baseCost(1) + (8 - 5)
  });

  it('rankUpCost for binary node returns cost at rank 0, Infinity at rank 1', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.blind_strike')!;
    expect(rankUpCost(node, 0)).toBe(2);
    expect(rankUpCost(node, 1)).toBe(Infinity);
  });

  it('totalSpentForRanks computes cumulative cost', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!;
    expect(totalSpentForRanks(node, 0)).toBe(0);
    expect(totalSpentForRanks(node, 1)).toBe(1);
    expect(totalSpentForRanks(node, 5)).toBe(5);
    expect(totalSpentForRanks(node, 6)).toBe(7);  // 5 + 2
    expect(totalSpentForRanks(node, 7)).toBe(10); // 5 + 2 + 3
  });

  it('isStackable returns true for stackable nodes, false for binary', () => {
    expect(isStackable(SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!)).toBe(true);
    expect(isStackable(SKILL_NODES.find(n => n.id === 'fire.blind_strike')!)).toBe(false);
    expect(isStackable(SKILL_NODES.find(n => n.id === 'fire.fireball')!)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/skills.test.ts`
Expected: FAIL — `effectAtRank`, `rankUpCost`, `totalSpentForRanks`, `isStackable`, `DIMINISHING_POWER` are not exported from `@arena/shared`.

- [ ] **Step 3: Add StackableConfig type and stackable field to SkillNode**

In `shared/src/skills.ts`, after the `SkillTree` type (line 9), add:

```typescript
export type StackableConfig = {
  softCap: number;
  baseEffect: number;
};
```

Update the `SkillNode` type to add the optional `stackable` field:

```typescript
export type SkillNode = {
  id: NodeId;
  name: string;
  tree: SkillTree;
  tier: number;
  cost: number;
  isSpell: boolean;
  description: string;
  stackable?: StackableConfig;
};
```

- [ ] **Step 4: Add stackable configs to SKILL_NODES entries**

Update the 7 stackable modifier entries in `SKILL_NODES`:

```typescript
export const SKILL_NODES: SkillNode[] = [
  { id: 'fire.fireball',        name: 'Fireball',        tree: 'fire',    tier: 1, cost: 1, isSpell: true,  description: 'Fast projectile. 80–120 damage.' },
  { id: 'fire.volatile_ember',  name: 'Volatile Ember',  tree: 'fire',    tier: 2, cost: 1, isSpell: false, description: '+8% explosion radius per rank.', stackable: { softCap: 5, baseEffect: 0.08 } },
  { id: 'fire.seeking_flame',   name: 'Seeking Flame',   tree: 'fire',    tier: 2, cost: 1, isSpell: false, description: 'Homing toward enemy. Stronger per rank.', stackable: { softCap: 5, baseEffect: 25 } },
  { id: 'fire.hellfire',        name: 'Hellfire',        tree: 'fire',    tier: 3, cost: 2, isSpell: false, description: 'Larger, slower, harder-hitting fireball per rank.', stackable: { softCap: 3, baseEffect: 1.0 } },
  { id: 'fire.pyroclasm',       name: 'Pyroclasm',       tree: 'fire',    tier: 3, cost: 2, isSpell: false, description: 'Fireball splits on impact. More splits per rank.', stackable: { softCap: 3, baseEffect: 1 } },
  { id: 'fire.fire_wall',       name: 'Fire Wall',       tree: 'fire',    tier: 4, cost: 2, isSpell: true,  description: 'Persistent fire barrier. 40 dmg/s.' },
  { id: 'fire.enduring_flames', name: 'Enduring Flames', tree: 'fire',    tier: 5, cost: 1, isSpell: false, description: '+10% Fire Wall duration per rank.', stackable: { softCap: 5, baseEffect: 0.10 } },
  { id: 'fire.searing_heat',    name: 'Searing Heat',    tree: 'fire',    tier: 5, cost: 2, isSpell: false, description: '+8% Fire Wall damage per rank.', stackable: { softCap: 5, baseEffect: 0.08 } },
  { id: 'fire.meteor',          name: 'Meteor',          tree: 'fire',    tier: 6, cost: 3, isSpell: true,  description: 'Delayed AoE strike. 200–280 damage.' },
  { id: 'fire.molten_impact',   name: 'Molten Impact',   tree: 'fire',    tier: 7, cost: 2, isSpell: false, description: 'Meteor leaves a burning crater for 3s.' },
  { id: 'fire.blind_strike',    name: 'Blind Strike',    tree: 'fire',    tier: 7, cost: 2, isSpell: false, description: 'Enemy cannot see the Meteor impact indicator.' },
  { id: 'utility.teleport',     name: 'Teleport',        tree: 'utility', tier: 1, cost: 1, isSpell: true,  description: 'Instant displacement.' },
  { id: 'utility.phase_shift',  name: 'Phase Shift',     tree: 'utility', tier: 2, cost: 2, isSpell: false, description: '+8% teleport range per rank.', stackable: { softCap: 5, baseEffect: 0.08 } },
  { id: 'utility.ethereal_form',name: 'Ethereal Form',   tree: 'utility', tier: 2, cost: 2, isSpell: false, description: '0.5s invulnerability after teleporting.' },
  { id: 'utility.phantom_step', name: 'Phantom Step',    tree: 'utility', tier: 3, cost: 3, isSpell: false, description: 'Next cast is instant within 2s of teleporting.' },
];
```

- [ ] **Step 5: Add Hellfire scaling ratios as shared constants**

After the `SKILL_NODES` array, add:

```typescript
export const HELLFIRE_RADIUS_RATIO = 0.5;
export const HELLFIRE_DAMAGE_RATIO = 0.3;
export const HELLFIRE_SPEED_RATIO = 0.15;
```

- [ ] **Step 6: Add DIMINISHING_POWER and helper functions**

After the Hellfire constants, add:

```typescript
export const DIMINISHING_POWER = 0.7;

export function effectAtRank(baseEffect: number, rank: number): number {
  if (rank <= 0) return 0;
  return baseEffect * Math.pow(rank, DIMINISHING_POWER);
}

export function isStackable(node: SkillNode): boolean {
  return node.stackable !== undefined;
}

export function rankUpCost(node: SkillNode, currentRank: number): number {
  if (!node.stackable) return currentRank === 0 ? node.cost : Infinity;
  const nextRank = currentRank + 1;
  const overCap = Math.max(0, nextRank - node.stackable.softCap);
  return node.cost + overCap;
}

export function totalSpentForRanks(node: SkillNode, rank: number): number {
  let total = 0;
  for (let r = 0; r < rank; r++) {
    total += rankUpCost(node, r);
  }
  return total;
}
```

- [ ] **Step 7: Update canUnlock to accept Map or Set**

The `canUnlock` function currently takes `Set<NodeId>`. Since gates only care about ownership (rank >= 1), update it to accept both representations. The simplest approach: change the parameter type to accept anything with a `has` method:

```typescript
export function canUnlock(id: NodeId, owned: { has(id: NodeId): boolean }): boolean {
  const gate = GATES[id];
  if (!gate) return true;
  if (gate.requiresAll && !gate.requiresAll.every(r => owned.has(r))) return false;
  if (gate.requiresAny && !gate.requiresAny.some(r => owned.has(r))) return false;
  return true;
}
```

Both `Set<NodeId>` and `Map<NodeId, number>` have `.has()`, so all existing callers continue to work.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/skills.test.ts`
Expected: All tests PASS, including the new `scaling helpers` describe block and all existing `canUnlock` tests.

- [ ] **Step 9: Commit**

```bash
git add shared/src/skills.ts server/tests/skills.test.ts
git commit -m "feat: add stackable skill config, scaling helpers, and updated SKILL_NODES"
```

---

### Task 2: Projectile Type — homing boolean → number

**Files:**
- Modify: `shared/src/types.ts:24-35` (Projectile type)

- [ ] **Step 1: Change Projectile.homing from boolean to number**

In `shared/src/types.ts`, change the `Projectile` type:

```typescript
export type Projectile = {
  id: string;
  ownerId: string;
  type: ProjectileType;
  position: Vec2;
  velocity: Vec2;
  radius?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: number;
  split?: number;
};
```

The only change is `homing?: boolean` → `homing?: number`.

- [ ] **Step 2: Run tests to check for type breakage**

Run: `cd server && npx vitest run`
Expected: Tests should still pass — existing code assigns `boolean` to `homing` which will now fail type-checking but runtime behavior is compatible. We'll fix the assignment sites in Tasks 3 and 4.

- [ ] **Step 3: Commit**

```bash
git add shared/src/types.ts
git commit -m "feat: change Projectile.homing from boolean to number for variable homing strength"
```

---

### Task 3: SpellModifiers — Rank-Based Scaling

**Files:**
- Modify: `server/src/skills/SpellModifiers.ts`
- Modify: `server/tests/skills.test.ts` (buildSpellModifiers tests)

- [ ] **Step 1: Update existing buildSpellModifiers tests to use Map and new field names**

Replace the entire `buildSpellModifiers` describe block in `server/tests/skills.test.ts`:

```typescript
describe('buildSpellModifiers', () => {
  it('returns base values when no skills are owned', () => {
    const m = buildSpellModifiers(new Map());
    expect(m.fireball.speed).toBe(FIREBALL_SPEED);
    expect(m.fireball.radius).toBe(FIREBALL_RADIUS);
    expect(m.fireball.damageMin).toBe(80);
    expect(m.fireball.damageMax).toBe(120);
    expect(m.fireball.homingStrength).toBe(0);
    expect(m.fireball.split).toBe(0);
    expect(m.firewall.durationMultiplier).toBe(1);
    expect(m.firewall.damageMultiplier).toBe(1);
    expect(m.meteor.hidden).toBe(false);
    expect(m.meteor.moltenImpact).toBe(false);
    expect(m.teleport.maxRange).toBe(600);
    expect(m.teleport.etherealForm).toBe(false);
    expect(m.teleport.phantomStep).toBe(false);
  });

  it('applies Volatile Ember rank 1: +8% radius', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.volatile_ember', 1]]));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * (1 + effectAtRank(0.08, 1)), 5);
  });

  it('applies Volatile Ember rank 5: stacked radius bonus', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.volatile_ember', 5]]));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * (1 + effectAtRank(0.08, 5)), 5);
  });

  it('applies Hellfire rank 1: +50% radius, +30% damage, -15% speed', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.hellfire', 1]]));
    const e = effectAtRank(1.0, 1);
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * (1 + 0.5 * e), 5);
    expect(m.fireball.damageMin).toBeCloseTo(80 * (1 + 0.3 * e), 5);
    expect(m.fireball.damageMax).toBeCloseTo(120 * (1 + 0.3 * e), 5);
    expect(m.fireball.speed).toBeCloseTo(FIREBALL_SPEED * (1 - 0.15 * e), 5);
  });

  it('stacks Volatile Ember rank 3 + Hellfire rank 2', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 3], ['fire.hellfire', 2],
    ]));
    const veBonus = 1 + effectAtRank(0.08, 3);
    const hfE = effectAtRank(1.0, 2);
    const hfBonus = 1 + 0.5 * hfE;
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * veBonus * hfBonus, 5);
  });

  it('applies Seeking Flame rank 3: homing strength', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.seeking_flame', 3]]));
    expect(m.fireball.homingStrength).toBeCloseTo(effectAtRank(25, 3), 5);
  });

  it('applies Pyroclasm rank 2: split count floored', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.pyroclasm', 2]]));
    expect(m.fireball.split).toBe(Math.floor(effectAtRank(1, 2)));
  });

  it('applies Enduring Flames rank 4: duration multiplier', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1], ['fire.enduring_flames', 4],
    ]));
    expect(m.firewall.durationMultiplier).toBeCloseTo(1 + effectAtRank(0.10, 4), 5);
  });

  it('applies Searing Heat rank 2: damage multiplier', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1], ['fire.searing_heat', 2],
    ]));
    expect(m.firewall.damageMultiplier).toBeCloseTo(1 + effectAtRank(0.08, 2), 5);
  });

  it('applies Phase Shift rank 3: teleport range', () => {
    const m = buildSpellModifiers(new Map([['utility.teleport', 1], ['utility.phase_shift', 3]]));
    expect(m.teleport.maxRange).toBeCloseTo(600 * (1 + effectAtRank(0.08, 3)), 5);
  });

  it('binary nodes still work: Blind Strike', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1],
      ['fire.enduring_flames', 1], ['fire.meteor', 1], ['fire.blind_strike', 1],
    ]));
    expect(m.meteor.hidden).toBe(true);
  });

  it('binary nodes still work: Molten Impact', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1],
      ['fire.enduring_flames', 1], ['fire.meteor', 1], ['fire.molten_impact', 1],
    ]));
    expect(m.meteor.moltenImpact).toBe(true);
  });

  it('binary nodes still work: Ethereal Form and Phantom Step', () => {
    const m = buildSpellModifiers(new Map([
      ['utility.teleport', 1], ['utility.ethereal_form', 1], ['utility.phantom_step', 1],
    ]));
    expect(m.teleport.etherealForm).toBe(true);
    expect(m.teleport.phantomStep).toBe(true);
  });
});
```

Update the import at the top of the `buildSpellModifiers` section (line 48) to also import `effectAtRank`:

```typescript
import { buildSpellModifiers } from '../src/skills/SpellModifiers.ts';
import { FIREBALL_SPEED, FIREBALL_RADIUS, effectAtRank } from '@arena/shared';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/skills.test.ts`
Expected: FAIL — `buildSpellModifiers` still accepts `Set<string>` and returns `homing: boolean`.

- [ ] **Step 3: Rewrite buildSpellModifiers to use Map and rank-based scaling**

Replace the entire content of `server/src/skills/SpellModifiers.ts`:

```typescript
import {
  FIREBALL_SPEED, FIREBALL_RADIUS,
  TELEPORT_MAX_RANGE,
  effectAtRank,
  HELLFIRE_RADIUS_RATIO, HELLFIRE_DAMAGE_RATIO, HELLFIRE_SPEED_RATIO,
} from '@arena/shared';

export type FireballModifiers = {
  speed: number;
  radius: number;
  damageMin: number;
  damageMax: number;
  homingStrength: number;
  split: number;
};

export type FirewallModifiers = {
  durationMultiplier: number;
  damageMultiplier: number;
};

export type MeteorModifiers = {
  hidden: boolean;
  moltenImpact: boolean;
};

export type TeleportModifiers = {
  maxRange: number;
  etherealForm: boolean;
  phantomStep: boolean;
};

export type SpellModifiers = {
  fireball: FireballModifiers;
  firewall: FirewallModifiers;
  meteor: MeteorModifiers;
  teleport: TeleportModifiers;
};

export function buildSpellModifiers(skills: Map<string, number>): SpellModifiers {
  const rank = (id: string) => skills.get(id) ?? 0;

  const veRank = rank('fire.volatile_ember');
  const hfRank = rank('fire.hellfire');

  let fbRadius = FIREBALL_RADIUS;
  let fbSpeed  = FIREBALL_SPEED;
  let fbDmgMin = 80;
  let fbDmgMax = 120;

  if (veRank > 0) fbRadius *= 1 + effectAtRank(0.08, veRank);
  if (hfRank > 0) {
    const e = effectAtRank(1.0, hfRank);
    fbRadius *= 1 + HELLFIRE_RADIUS_RATIO * e;
    fbSpeed  *= 1 - HELLFIRE_SPEED_RATIO * e;
    fbDmgMin *= 1 + HELLFIRE_DAMAGE_RATIO * e;
    fbDmgMax *= 1 + HELLFIRE_DAMAGE_RATIO * e;
  }

  const sfRank = rank('fire.seeking_flame');
  const pyRank = rank('fire.pyroclasm');

  return {
    fireball: {
      speed:          fbSpeed,
      radius:         fbRadius,
      damageMin:      fbDmgMin,
      damageMax:      fbDmgMax,
      homingStrength: sfRank > 0 ? effectAtRank(25, sfRank) : 0,
      split:          pyRank > 0 ? Math.floor(effectAtRank(1, pyRank)) : 0,
    },
    firewall: {
      durationMultiplier: rank('fire.enduring_flames') > 0 ? 1 + effectAtRank(0.10, rank('fire.enduring_flames')) : 1,
      damageMultiplier:   rank('fire.searing_heat') > 0    ? 1 + effectAtRank(0.08, rank('fire.searing_heat'))    : 1,
    },
    meteor: {
      hidden:       rank('fire.blind_strike') > 0,
      moltenImpact: rank('fire.molten_impact') > 0,
    },
    teleport: {
      maxRange:     TELEPORT_MAX_RANGE * (rank('utility.phase_shift') > 0 ? 1 + effectAtRank(0.08, rank('utility.phase_shift')) : 1),
      etherealForm: rank('utility.ethereal_form') > 0,
      phantomStep:  rank('utility.phantom_step') > 0,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/skills.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/skills/SpellModifiers.ts server/tests/skills.test.ts
git commit -m "feat: rank-based scaling in buildSpellModifiers using Map<NodeId, number>"
```

---

### Task 4: Fireball.ts — Numeric Homing Strength

**Files:**
- Modify: `server/src/spells/Fireball.ts`
- Modify: `server/tests/fireball.test.ts`

- [ ] **Step 1: Write a failing test for variable homing strength**

Read `server/tests/fireball.test.ts` to understand the existing test patterns. Then add a test:

```typescript
it('applies variable homing strength from projectile', () => {
  const fb = spawnFireball('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 40 });
  const enemy = { x: 100, y: 200 };
  const moved = advanceFireball(fb, enemy);
  // With homing strength 40, the projectile should curve toward the enemy
  // The y-velocity should be positive (toward enemy at y:200)
  expect(moved.velocity.y).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/fireball.test.ts`
Expected: FAIL — `homing` is now `number` but `FireballConfig` still types it as `boolean`.

- [ ] **Step 3: Update FireballConfig and advanceFireball to use numeric homing**

In `server/src/spells/Fireball.ts`:

Change `FireballConfig`:

```typescript
type FireballConfig = {
  speed?: number;
  radius?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: number;
  split?: number;
};
```

Update `advanceFireball` — replace the homing block (lines 44-55):

```typescript
export function advanceFireball(p: Projectile, enemyPos?: Vec2): Projectile {
  let vx = p.velocity.x;
  let vy = p.velocity.y;
  if (p.homing && p.homing > 0 && enemyPos) {
    const dx = enemyPos.x - p.position.x;
    const dy = enemyPos.y - p.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = p.homing;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/fireball.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/spells/Fireball.ts server/tests/fireball.test.ts
git commit -m "feat: use numeric homing strength from projectile instead of hardcoded value"
```

---

### Task 5: StateAdvancer — Map-Based skillSets

**Files:**
- Modify: `server/src/gameloop/StateAdvancer.ts:46-55,96-104,120-128`

- [ ] **Step 1: Write a failing test for Map-based skillSets in advanceState**

Add to `server/tests/stateadvancer.test.ts`. Read the file first to understand existing patterns, then add:

```typescript
it('applies rank-based modifiers from Map skillSets', () => {
  const state = makeInitialState([
    { id: 'p1', displayName: 'P1', spawnPos: { x: 200, y: 1000 } },
    { id: 'p2', displayName: 'P2', spawnPos: { x: 1800, y: 1000 } },
  ]);
  const skillSets: Record<string, Map<string, number>> = {
    p1: new Map([['fire.fireball', 1], ['fire.seeking_flame', 3]]),
  };
  const inputs: Record<string, InputFrame> = {
    p1: { move: { x: 0, y: 0 }, castSpell: 1, aimTarget: { x: 1800, y: 1000 } },
    p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200, y: 1000 } },
  };
  const next = advanceState(state, inputs, skillSets);
  expect(next.projectiles.length).toBe(1);
  expect(next.projectiles[0].homing).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/stateadvancer.test.ts`
Expected: FAIL — `advanceState` expects `Record<string, Set<NodeId>>`, not `Record<string, Map<string, number>>`.

- [ ] **Step 3: Update advanceState signature and usage**

In `server/src/gameloop/StateAdvancer.ts`:

Change the `advanceState` signature (line 46-51):

```typescript
export function advanceState(
  state: GameState,
  inputs: Record<string, InputFrame>,
  skillSets: Record<string, Map<NodeId, number>> = {},
  mode?: GameModeConfig,
): GameState {
```

Update the modifiers construction (line 54-56):

```typescript
  const modifiers = Object.fromEntries(
    Object.keys(players).map(id => [id, buildSpellModifiers(skillSets[id] ?? new Map())])
  );
```

Update the spell availability gate (line 104) — `Map.has()` works the same as `Set.has()`:

```typescript
    if (hasSkillSystem && requiredNode && !(skillSets[id] ?? new Map()).has(requiredNode)) continue;
```

Update the fireball spawn (line 120-128) to use `homingStrength`:

```typescript
    if (spell === 1) {
      const fb = spawnFireball(id, p.position, input.aimTarget, {
        speed:     mods.fireball.speed,
        radius:    mods.fireball.radius,
        damageMin: mods.fireball.damageMin,
        damageMax: mods.fireball.damageMax,
        homing:    mods.fireball.homingStrength,
        split:     mods.fireball.split,
      });
      projectiles = [...projectiles, fb];
    }
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `cd server && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/gameloop/StateAdvancer.ts server/tests/stateadvancer.test.ts
git commit -m "feat: update advanceState to use Map-based skillSets"
```

---

### Task 6: Room — Map-Based skillSets

**Files:**
- Modify: `server/src/rooms/Room.ts:18`
- Modify: `server/src/index.ts:66-68`
- Modify: `server/src/skills/loadSkills.ts:5-7,25-35`

- [ ] **Step 1: Update Room.skillSets type**

In `server/src/rooms/Room.ts`, change line 18:

```typescript
  skillSets: Map<string, Map<NodeId, number>> = new Map();
```

Update the `tick()` method (line 99):

```typescript
    const skillSetsObj: Record<string, Map<NodeId, number>> = Object.fromEntries(this.skillSets.entries());
```

- [ ] **Step 2: Update loadSkillsForCharacter return type**

In `server/src/skills/loadSkills.ts`, change the `SkillLoadResult` type (lines 5-7):

```typescript
export type SkillLoadResult =
  | { ok: true; userId: string; skills: Map<NodeId, number> }
  | { ok: false; error: string };
```

Update the query to select `node_id, rank` and return a Map (lines 25-35):

```typescript
  const { data, error } = await supabase
    .from('skill_unlocks')
    .select('node_id, rank')
    .eq('character_id', characterId);

  if (error) return { ok: false, error: error.message };

  const skills = new Map<NodeId, number>(
    (data ?? []).map((row: { node_id: string; rank: number }) => [row.node_id as NodeId, row.rank ?? 1])
  );
  if (!skills.has('fire.fireball')) skills.set('fire.fireball', 1);
  return { ok: true, userId: user.id, skills };
```

- [ ] **Step 3: Verify server/src/index.ts needs no changes**

The `skillResult.skills` is now a `Map`, and `room.skillSets.set(socket.id, skillResult.skills)` sets a `Map` value — the call site at `server/src/index.ts:68` needs no changes because the types now align.

- [ ] **Step 4: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/rooms/Room.ts server/src/skills/loadSkills.ts
git commit -m "feat: update Room and loadSkills to use Map-based skill ownership"
```

---

### Task 7: Database Migration

**Files:**
- Create: `supabase/migrations/<timestamp>_stackable_skill_ranks.sql` (or run via Supabase dashboard)

- [ ] **Step 1: Write the migration SQL**

Create the migration file. Check if a `supabase/migrations` directory exists first; if not, this migration can be applied via the Supabase SQL editor.

```sql
-- Add rank and total_spent columns to skill_unlocks
ALTER TABLE skill_unlocks ADD COLUMN rank INTEGER NOT NULL DEFAULT 1;
ALTER TABLE skill_unlocks ADD COLUMN total_spent INTEGER NOT NULL DEFAULT 0;

-- Backfill total_spent for existing rows (all are rank 1)
UPDATE skill_unlocks SET total_spent = CASE node_id
  WHEN 'fire.fireball' THEN 1
  WHEN 'fire.volatile_ember' THEN 1
  WHEN 'fire.seeking_flame' THEN 1
  WHEN 'fire.hellfire' THEN 2
  WHEN 'fire.pyroclasm' THEN 2
  WHEN 'fire.fire_wall' THEN 2
  WHEN 'fire.enduring_flames' THEN 1
  WHEN 'fire.searing_heat' THEN 2
  WHEN 'fire.meteor' THEN 3
  WHEN 'fire.molten_impact' THEN 2
  WHEN 'fire.blind_strike' THEN 2
  WHEN 'utility.teleport' THEN 1
  WHEN 'utility.phase_shift' THEN 2
  WHEN 'utility.ethereal_form' THEN 2
  WHEN 'utility.phantom_step' THEN 3
  ELSE 1
END;
```

- [ ] **Step 2: Update unlock_skill_node RPC**

Replace the existing `unlock_skill_node` function:

```sql
CREATE OR REPLACE FUNCTION unlock_skill_node(
  p_character_id UUID,
  p_node_id TEXT,
  p_cost INTEGER
) RETURNS VOID AS $$
DECLARE
  v_existing_rank INTEGER;
BEGIN
  -- Check if already owned
  SELECT rank INTO v_existing_rank
  FROM skill_unlocks
  WHERE character_id = p_character_id AND node_id = p_node_id;

  IF v_existing_rank IS NULL THEN
    -- First purchase: insert new row
    INSERT INTO skill_unlocks (character_id, node_id, rank, total_spent)
    VALUES (p_character_id, p_node_id, 1, p_cost);
  ELSE
    -- Rank up: increment rank and accumulate cost
    UPDATE skill_unlocks
    SET rank = rank + 1, total_spent = total_spent + p_cost
    WHERE character_id = p_character_id AND node_id = p_node_id;
  END IF;

  -- Deduct skill points
  UPDATE characters
  SET skill_points_available = skill_points_available - p_cost
  WHERE id = p_character_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Update respec_skills RPC**

Replace the existing `respec_skills` function:

```sql
CREATE OR REPLACE FUNCTION respec_skills(
  p_character_id UUID
) RETURNS VOID AS $$
DECLARE
  v_refund INTEGER;
BEGIN
  -- Calculate total refund from total_spent column
  SELECT COALESCE(SUM(total_spent), 0) INTO v_refund
  FROM skill_unlocks
  WHERE character_id = p_character_id;

  -- Refund points
  UPDATE characters
  SET skill_points_available = skill_points_available + v_refund
  WHERE id = p_character_id;

  -- Delete all unlocks
  DELETE FROM skill_unlocks
  WHERE character_id = p_character_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ 2>/dev/null; git add -A supabase/ 2>/dev/null
git commit -m "feat: database migration for stackable skill ranks"
```

---

### Task 8: Client SkillTreeUI — Rank State & Data Loading

**Files:**
- Modify: `client/src/skills/SkillTreeUI.ts`

This task updates the data model in the UI. The next task adds the visual ring/badge rendering.

- [ ] **Step 1: Change owned from Set to Map and update reload()**

In `client/src/skills/SkillTreeUI.ts`, change the class properties (line 105):

```typescript
  private ranks = new Map<NodeId, number>();
```

Update `reload()` to fetch `node_id, rank` (lines 142-146):

```typescript
    const { data } = await supabase
      .from('skill_unlocks')
      .select('node_id, rank')
      .eq('character_id', this.characterId);
    this.ranks = new Map(
      (data ?? []).map((r: { node_id: string; rank: number }) => [r.node_id as NodeId, r.rank ?? 1])
    );
```

Update the fireball auto-grant (lines 148-155):

```typescript
    if (!this.ranks.has('fire.fireball')) {
      await supabase.rpc('unlock_skill_node', {
        p_character_id: this.characterId,
        p_node_id: 'fire.fireball',
        p_cost: 0,
      });
      this.ranks.set('fire.fireball', 1);
    }
```

- [ ] **Step 2: Update all this.owned references to this.ranks**

Replace all `this.owned.has(...)` calls with `this.ranks.has(...)` throughout the file. This affects:
- `renderNode` (line 207)
- `drawConnections` (line 237)
- `attachNodeListeners` (lines 268, 270, 280, 288, 323)

Also add the `isStackable` and `rankUpCost` imports at line 2:

```typescript
import { SKILL_NODES, GATES, canUnlock, NodeId, SkillNode, isStackable, rankUpCost } from '@arena/shared';
```

- [ ] **Step 3: Update renderNode for stackable cost display**

In `renderNode`, update the node state and cost logic to handle stackable nodes that are owned but can be ranked up:

```typescript
  private renderNode(node: SkillNode, pts: number, pos: NodePos | undefined): string {
    if (!pos) return '';
    const currentRank = this.ranks.get(node.id) ?? 0;
    const isOwned = currentRank > 0;
    const canBuyFirst = !isOwned && canUnlock(node.id, this.ranks) && pts >= node.cost;
    const canRankUp = isOwned && isStackable(node) && pts >= rankUpCost(node, currentRank);
    const stateClass = isOwned ? 'st-node-owned' : (canBuyFirst ? 'st-node-purchasable' : 'st-node-locked');
    const spellClass = node.isSpell ? 'st-node-is-spell' : '';
    const sizeClass = node.isSpell ? 'st-node-spell' : 'st-node-mod';
    const icon = NODE_ICONS[node.id] ?? 'fa-star';
    const state = isOwned ? 'owned' : (canBuyFirst ? 'purchasable' : 'locked');
    let costText: string;
    if (isOwned && isStackable(node)) {
      costText = `Rank ${currentRank}`;
    } else if (isOwned) {
      costText = 'Owned';
    } else {
      costText = `${node.cost} pt${node.cost > 1 ? 's' : ''}`;
    }

    return `<div class="st-node ${stateClass} ${spellClass}" data-id="${node.id}" data-state="${state}"
      style="left:${pos.x}%;top:${pos.y}px;">
      <div class="st-node-circle ${sizeClass}">
        <i class="fa ${icon} fa-fw st-node-icon" style="font-size:${node.isSpell ? '1.25rem' : '1.05rem'}"></i>
      </div>
      <div class="st-node-name">${esc(node.name)}</div>
      <div class="st-node-cost">${costText}</div>
    </div>`;
  }
```

- [ ] **Step 4: Update click handler for rank-up**

In `attachNodeListeners`, update the click handler (lines 322-325):

```typescript
      el.addEventListener('click', () => {
        const currentRank = this.ranks.get(id) ?? 0;
        const isOwned = currentRank > 0;
        if (!isOwned) {
          const canBuyFirst = canUnlock(id, this.ranks) && pts >= node.cost;
          if (canBuyFirst) this.handleUnlock(id, node.cost);
        } else if (isStackable(node)) {
          const cost = rankUpCost(node, currentRank);
          if (pts >= cost) this.handleRankUp(id, node, currentRank, cost);
        }
      });
```

- [ ] **Step 5: Add handleRankUp method**

After `handleUnlock`, add:

```typescript
  private handleRankUp(id: NodeId, node: SkillNode, currentRank: number, cost: number): void {
    const softCap = node.stackable!.softCap;
    const pastCap = currentRank >= softCap;
    const warning = pastCap ? ' (past soft cap)' : '';
    this.showConfirm(
      'Rank Up',
      `${esc(node.name)}: Rank ${currentRank} → ${currentRank + 1}${warning}\nCost: ${cost} pt${cost > 1 ? 's' : ''}`,
      async () => {
        if (!this.characterId) return;
        const { error } = await supabase.rpc('unlock_skill_node', {
          p_character_id: this.characterId,
          p_node_id: id,
          p_cost: cost,
        });
        if (error) { console.error('Rank up failed:', error.message); return; }
        await this.reload();
      },
    );
  }
```

- [ ] **Step 6: Update drawConnections to use this.ranks**

In `drawConnections`, replace `this.owned.has(node.id)` with `this.ranks.has(node.id)` (line 237):

```typescript
      const isOwned = this.ranks.has(node.id);
```

- [ ] **Step 7: Commit**

```bash
git add client/src/skills/SkillTreeUI.ts
git commit -m "feat: update SkillTreeUI data model to Map-based ranks with rank-up flow"
```

---

### Task 9: Client SkillTreeUI — Ring Segments, Rank Badge, Tooltips

**Files:**
- Modify: `client/src/skills/SkillTreeUI.ts`

- [ ] **Step 1: Add CSS for ring segments and rank badge**

Add these styles to the `STYLES` constant, before the closing backtick:

```css
.st-node-rank{position:absolute;bottom:2px;font-family:'Cinzel',serif;font-size:0.52rem;font-weight:700;color:#ddb84a;text-shadow:0 0 4px rgba(0,0,0,0.8);pointer-events:none;}
.st-ring{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;}
.st-ring circle{fill:none;stroke-linecap:round;}
```

- [ ] **Step 2: Add SVG ring rendering helper**

Add a private method to the class:

```typescript
  private renderRing(node: SkillNode, currentRank: number, size: number): string {
    if (!isStackable(node) || currentRank === 0) return '';
    const softCap = node.stackable!.softCap;
    const maxDisplay = Math.max(softCap + 3, currentRank);
    const r = (size - 4) / 2;
    const circumference = 2 * Math.PI * r;
    const segmentArc = circumference / maxDisplay;
    const gap = 2;

    let segments = '';
    for (let i = 0; i < currentRank; i++) {
      const offset = circumference - (i * segmentArc);
      const dashLen = segmentArc - gap;
      const color = i < softCap ? '#e86020' : '#ddb84a';
      segments += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" 
        stroke="${color}" stroke-width="2.5" stroke-opacity="0.85"
        stroke-dasharray="${dashLen} ${circumference - dashLen}" 
        stroke-dashoffset="${offset}"
        transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    }

    return `<svg class="st-ring" viewBox="0 0 ${size} ${size}">${segments}</svg>`;
  }
```

- [ ] **Step 3: Update renderNode to include ring and rank badge**

Update the node circle rendering in `renderNode` to include the ring SVG and rank number:

```typescript
    const circleSize = node.isSpell ? 58 : 44;
    const ring = this.renderRing(node, currentRank, circleSize);
    const rankBadge = (isStackable(node) && currentRank > 0)
      ? `<span class="st-node-rank">${currentRank}</span>`
      : '';

    return `<div class="st-node ${stateClass} ${spellClass}" data-id="${node.id}" data-state="${state}"
      style="left:${pos.x}%;top:${pos.y}px;">
      <div class="st-node-circle ${sizeClass}" style="position:relative;">
        ${ring}
        <i class="fa ${icon} fa-fw st-node-icon" style="font-size:${node.isSpell ? '1.25rem' : '1.05rem'}"></i>
        ${rankBadge}
      </div>
      <div class="st-node-name">${esc(node.name)}</div>
      <div class="st-node-cost">${costText}</div>
    </div>`;
```

- [ ] **Step 4: Update tooltip for stackable nodes**

In `attachNodeListeners`, update the tooltip mouseenter handler. Add the `effectAtRank` import at line 2:

```typescript
import { SKILL_NODES, GATES, canUnlock, NodeId, SkillNode, isStackable, rankUpCost, effectAtRank } from '@arena/shared';
```

Replace the tooltip innerHTML section inside the mouseenter handler:

```typescript
      el.addEventListener('mouseenter', e => {
        const currentRank = this.ranks.get(id) ?? 0;
        const isOwned = currentRank > 0;
        const canBuyFirst = !isOwned && canUnlock(id, this.ranks) && pts >= node.cost;
        const gateBlocked = !isOwned && !canUnlock(id, this.ranks);

        let statusLine = '';
        let rankLine = '';
        if (isOwned && isStackable(node)) {
          const softCap = node.stackable!.softCap;
          const nextCost = rankUpCost(node, currentRank);
          const pastCap = currentRank >= softCap;
          rankLine = `<span style="color:#c8a870;font-size:0.6rem">Rank ${currentRank} / ${softCap}</span><br>`;
          if (pts >= nextCost) {
            const costColor = pastCap ? '#ddb84a' : '#c8860a';
            statusLine = `<span style="color:${costColor};font-size:0.6rem">Next rank: ${nextCost} pt${nextCost > 1 ? 's' : ''}${pastCap ? ' (past cap)' : ''}</span>`;
          } else {
            statusLine = '<span style="color:#884020;font-size:0.6rem">Not enough points for next rank</span>';
          }
        } else if (isOwned) {
          statusLine = '<span style="color:#90a870;font-size:0.6rem">Owned</span>';
        } else if (gateBlocked) {
          const gate = GATES[id];
          const missing: string[] = [];
          if (gate?.requiresAll) {
            for (const req of gate.requiresAll) {
              if (!this.ranks.has(req)) {
                const reqNode = SKILL_NODES.find(n => n.id === req);
                if (reqNode) missing.push(reqNode.name);
              }
            }
          }
          if (gate?.requiresAny) {
            const hasAny = gate.requiresAny.some(r => this.ranks.has(r));
            if (!hasAny) {
              const names = gate.requiresAny
                .map(r => SKILL_NODES.find(n => n.id === r)?.name)
                .filter(Boolean);
              missing.push(`one of: ${names.join(', ')}`);
            }
          }
          statusLine = `<span style="color:#884020;font-size:0.6rem">Requires: ${esc(missing.join(', '))}</span>`;
        } else if (canBuyFirst) {
          statusLine = '<span style="color:#60a840;font-size:0.6rem">Click to unlock</span>';
        } else {
          statusLine = '<span style="color:#884020;font-size:0.6rem">Not enough points</span>';
        }

        const costDisplay = isOwned ? '' : `<span style="color:#7a6030;font-size:0.6rem">Cost: ${node.cost} pt${node.cost > 1 ? 's' : ''}</span><br>`;

        tooltip.innerHTML = `
          <strong style="color:#ddb84a">${esc(node.name)}</strong><br>
          <span style="color:#c8a870">${esc(node.description)}</span><br>
          ${rankLine}${costDisplay}${statusLine}
        `;
        tooltip.style.display = 'block';
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top = `${me.clientY - 10}px`;
      });
```

- [ ] **Step 5: Build the client to verify no TypeScript errors**

Run: `cd client && npx tsc --noEmit` (or whatever the client build command is)

- [ ] **Step 6: Commit**

```bash
git add client/src/skills/SkillTreeUI.ts
git commit -m "feat: add ring segments, rank badges, and stackable tooltips to SkillTreeUI"
```

---

### Task 10: Run Full Test Suite & Manual Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Build the client**

Run: `cd client && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server and verify in browser:
1. Open skill tree — nodes render with current styling
2. Binary nodes (Blind Strike, Molten Impact, etc.) behave exactly as before
3. Stackable nodes show "Rank X" cost text when owned
4. Clicking an owned stackable node opens rank-up confirmation
5. Ring segments appear around ranked nodes
6. Gold ring segments appear when a node exceeds its soft cap
7. Tooltip shows rank/softCap and next rank cost
8. Respec refunds all points correctly

- [ ] **Step 4: Commit any fixes from smoke testing**

If any adjustments are needed, fix and commit with descriptive messages.
