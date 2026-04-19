# Skill Tree Phase 1 — Foundation + Fire Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase auth, persistent skill points, and a functional Fire tree + Utility strip so players can unlock and modify existing spells (Fireball, Fire Wall, Meteor, Teleport).

**Architecture:** Server fetches skill unlocks from Supabase when a player joins a room and builds a per-player `SpellModifiers` object used by `StateAdvancer` for the match duration. The client authenticates via Supabase Auth and shows a D2-style skill tree panel accessible from the lobby. New spells (Lightning, Frost) are not implemented here — their tree tabs are visible but locked.

**Tech Stack:** TypeScript, Vitest, Supabase (`@supabase/supabase-js`), Socket.io, existing Express/Three.js stack.

---

## File Map

**New files:**
- `shared/src/skills.ts` — `NodeId` union type, `SKILL_NODES` metadata, `SKILL_GATES`, `canUnlock()`
- `server/src/supabase.ts` — service-role Supabase client singleton
- `server/src/skills/loadSkills.ts` — fetch + build `Set<NodeId>` from DB for a user
- `server/src/skills/SpellModifiers.ts` — derive per-player spell modifier values from skill set
- `server/tests/skills.test.ts` — tests for gates + modifiers
- `client/src/supabase.ts` — anon-key Supabase client singleton
- `client/src/auth/AuthUI.ts` — login/signup overlay
- `client/src/skills/SkillTreeUI.ts` — full-screen skill tree panel

**Modified files:**
- `shared/src/types.ts` — extend `Projectile` with optional modifier fields; add `invulnUntil?` to `PlayerState`; add `hidden?` to `MeteorState`; add `TELEPORT_MAX_RANGE`
- `server/src/spells/Fireball.ts` — accept optional config overrides
- `server/src/spells/FireWall.ts` — accept optional duration/damage multipliers
- `server/src/spells/Meteor.ts` — accept optional `hidden` flag; post-detonation crater support
- `server/src/gameloop/StateAdvancer.ts` — accept `skillSets` param; apply modifiers; Ethereal Form invuln; Phantom Step; Molten Impact crater; Pyroclasm split
- `server/src/rooms/Room.ts` — store `skillSets` per player; pass them into `advanceState`
- `server/src/index.ts` — accept `accessToken` in `join-room`; fetch skills; credit points on match end
- `client/src/hud/HUD.ts` — accept unlocked spell list; hide/show slots dynamically
- `client/src/lobby/LobbyUI.ts` — add Skills button + available-points display; auth gate
- `client/src/main.ts` — auth flow; pass skill set to HUD; send `accessToken` in join-room

---

## Task 1: Supabase project setup

**Files:**
- Create: `server/.env.example`
- Create: `client/.env.example`

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com → New project. Save the **Project URL** and two keys:
- `anon` (public) key
- `service_role` (secret) key

- [ ] **Step 2: Run this SQL in the Supabase SQL editor**

```sql
-- profiles: one row per auth user
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  skill_points_available int not null default 5,
  skill_points_total int not null default 5,
  matches_played int not null default 0,
  matches_won int not null default 0
);

-- skill_unlocks: one row per unlocked node
create table public.skill_unlocks (
  user_id uuid references public.profiles(user_id) on delete cascade,
  node_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, node_id)
);

-- auto-create profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.skill_unlocks enable row level security;

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = user_id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = user_id);

create policy "Users can read own unlocks" on public.skill_unlocks
  for select using (auth.uid() = user_id);

create policy "Users can insert own unlocks" on public.skill_unlocks
  for insert with check (auth.uid() = user_id);

create policy "Users can delete own unlocks" on public.skill_unlocks
  for delete using (auth.uid() = user_id);

-- Service role bypasses RLS (used by server)
```

- [ ] **Step 3: Create env files**

`server/.env`:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`client/.env`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 4: Install Supabase SDK**

```bash
cd server && npm install @supabase/supabase-js
cd ../client && npm install @supabase/supabase-js
```

- [ ] **Step 5: Add .env to .gitignore**

Check `/Users/danielgalvez/coding/arena-game/.gitignore` — add `*.env` if not already present (`.env.example` files are safe to commit).

- [ ] **Step 6: Commit**

```bash
git add server/.env.example client/.env.example server/package.json client/package.json server/package-lock.json client/package-lock.json
git commit -m "feat: add Supabase SDK and env templates for skill tree auth"
```

---

## Task 2: Shared skill types + gate logic

**Files:**
- Create: `shared/src/skills.ts`
- Modify: `shared/src/index.ts` (re-export)

- [ ] **Step 1: Write the failing test**

Create `server/tests/skills.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canUnlock, SKILL_NODES } from '@arena/shared';

describe('canUnlock', () => {
  it('allows unlocking a tier-I spell with no prerequisites', () => {
    expect(canUnlock('fire.fireball', new Set())).toBe(true);
    expect(canUnlock('utility.teleport', new Set())).toBe(true);
  });

  it('blocks a tier-II node when its required spell is not owned', () => {
    expect(canUnlock('fire.volatile_ember', new Set())).toBe(false);
    expect(canUnlock('fire.seeking_flame', new Set())).toBe(false);
  });

  it('allows a tier-II node when its required spell is owned', () => {
    const owned = new Set(['fire.fireball']);
    expect(canUnlock('fire.volatile_ember', owned)).toBe(true);
  });

  it('blocks Fire Wall when no tier-II fire node is owned', () => {
    const owned = new Set(['fire.fireball']);
    expect(canUnlock('fire.fire_wall', owned)).toBe(false);
  });

  it('allows Fire Wall when at least one tier-II fire node is owned', () => {
    const owned = new Set(['fire.fireball', 'fire.volatile_ember']);
    expect(canUnlock('fire.fire_wall', owned)).toBe(true);
  });

  it('blocks Meteor when no tier-V fire node is owned', () => {
    const owned = new Set(['fire.fireball', 'fire.volatile_ember', 'fire.fire_wall']);
    expect(canUnlock('fire.meteor', owned)).toBe(false);
  });

  it('allows Meteor when at least one tier-V fire node is owned', () => {
    const owned = new Set(['fire.fireball', 'fire.volatile_ember', 'fire.fire_wall', 'fire.enduring_flames']);
    expect(canUnlock('fire.meteor', owned)).toBe(true);
  });

  it('returns all 11 fire nodes + 4 utility nodes in SKILL_NODES', () => {
    const fire = SKILL_NODES.filter(n => n.tree === 'fire');
    const util = SKILL_NODES.filter(n => n.tree === 'utility');
    expect(fire).toHaveLength(11);
    expect(util).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd server && npm test -- tests/skills.test.ts
```
Expected: FAIL — `Cannot find module '@arena/shared'` exports for `canUnlock`/`SKILL_NODES`.

- [ ] **Step 3: Create `shared/src/skills.ts`**

```ts
export type NodeId =
  | 'fire.fireball' | 'fire.volatile_ember' | 'fire.seeking_flame'
  | 'fire.hellfire' | 'fire.pyroclasm' | 'fire.fire_wall'
  | 'fire.enduring_flames' | 'fire.searing_heat' | 'fire.meteor'
  | 'fire.molten_impact' | 'fire.blind_strike'
  | 'utility.teleport' | 'utility.phase_shift'
  | 'utility.ethereal_form' | 'utility.phantom_step';

export type SkillTree = 'fire' | 'lightning' | 'frost' | 'utility';

export type SkillNode = {
  id: NodeId;
  name: string;
  tree: SkillTree;
  tier: number;
  cost: number;
  isSpell: boolean;
  description: string;
};

// requiresAny: at least one of these must be owned
type Gate = { requiresAll?: NodeId[]; requiresAny?: NodeId[] };

const GATES: Partial<Record<NodeId, Gate>> = {
  'fire.volatile_ember':  { requiresAll: ['fire.fireball'] },
  'fire.seeking_flame':   { requiresAll: ['fire.fireball'] },
  'fire.hellfire':        { requiresAll: ['fire.fireball'] },
  'fire.pyroclasm':       { requiresAll: ['fire.fireball'] },
  'fire.fire_wall':       { requiresAll: ['fire.fireball'], requiresAny: ['fire.volatile_ember', 'fire.seeking_flame'] },
  'fire.enduring_flames': { requiresAll: ['fire.fire_wall'] },
  'fire.searing_heat':    { requiresAll: ['fire.fire_wall'] },
  'fire.meteor':          { requiresAll: ['fire.fire_wall'], requiresAny: ['fire.enduring_flames', 'fire.searing_heat'] },
  'fire.molten_impact':   { requiresAll: ['fire.meteor'] },
  'fire.blind_strike':    { requiresAll: ['fire.meteor'] },
  'utility.phase_shift':   { requiresAll: ['utility.teleport'] },
  'utility.ethereal_form': { requiresAll: ['utility.teleport'] },
  'utility.phantom_step':  { requiresAll: ['utility.teleport'], requiresAny: ['utility.phase_shift', 'utility.ethereal_form'] },
};

export function canUnlock(id: NodeId, owned: Set<string>): boolean {
  const gate = GATES[id];
  if (!gate) return true;
  if (gate.requiresAll && !gate.requiresAll.every(r => owned.has(r))) return false;
  if (gate.requiresAny && !gate.requiresAny.some(r => owned.has(r))) return false;
  return true;
}

export const SKILL_NODES: SkillNode[] = [
  { id: 'fire.fireball',        name: 'Fireball',        tree: 'fire',    tier: 1, cost: 1, isSpell: true,  description: 'Fast projectile. 80–120 damage.' },
  { id: 'fire.volatile_ember',  name: 'Volatile Ember',  tree: 'fire',    tier: 2, cost: 1, isSpell: false, description: '+30% explosion radius.' },
  { id: 'fire.seeking_flame',   name: 'Seeking Flame',   tree: 'fire',    tier: 2, cost: 1, isSpell: false, description: 'Slight homing toward enemy.' },
  { id: 'fire.hellfire',        name: 'Hellfire',        tree: 'fire',    tier: 3, cost: 2, isSpell: false, description: 'Fireball is 3× size, 2× damage, 50% slower.' },
  { id: 'fire.pyroclasm',       name: 'Pyroclasm',       tree: 'fire',    tier: 3, cost: 2, isSpell: false, description: 'Fireball splits into 3 on impact.' },
  { id: 'fire.fire_wall',       name: 'Fire Wall',       tree: 'fire',    tier: 4, cost: 2, isSpell: true,  description: 'Persistent fire barrier. 40 dmg/s.' },
  { id: 'fire.enduring_flames', name: 'Enduring Flames', tree: 'fire',    tier: 5, cost: 1, isSpell: false, description: '+50% Fire Wall duration.' },
  { id: 'fire.searing_heat',    name: 'Searing Heat',    tree: 'fire',    tier: 5, cost: 2, isSpell: false, description: '+40% Fire Wall damage.' },
  { id: 'fire.meteor',          name: 'Meteor',          tree: 'fire',    tier: 6, cost: 3, isSpell: true,  description: 'Delayed AoE strike. 200–280 damage.' },
  { id: 'fire.molten_impact',   name: 'Molten Impact',   tree: 'fire',    tier: 7, cost: 2, isSpell: false, description: 'Meteor leaves a burning crater for 3s.' },
  { id: 'fire.blind_strike',    name: 'Blind Strike',    tree: 'fire',    tier: 7, cost: 2, isSpell: false, description: 'Enemy cannot see the Meteor impact indicator.' },
  { id: 'utility.teleport',     name: 'Teleport',        tree: 'utility', tier: 1, cost: 1, isSpell: true,  description: 'Instant displacement.' },
  { id: 'utility.phase_shift',  name: 'Phase Shift',     tree: 'utility', tier: 2, cost: 2, isSpell: false, description: '+40% teleport range.' },
  { id: 'utility.ethereal_form',name: 'Ethereal Form',   tree: 'utility', tier: 2, cost: 2, isSpell: false, description: '0.5s invulnerability after teleporting.' },
  { id: 'utility.phantom_step', name: 'Phantom Step',    tree: 'utility', tier: 3, cost: 3, isSpell: false, description: 'Next cast is instant (no mana cost) within 2s of teleporting.' },
];

// The spell that each tree node ultimately modifies — used for spell availability checks
export const SPELL_NODES: NodeId[] = [
  'fire.fireball', 'fire.fire_wall', 'fire.meteor', 'utility.teleport',
];
```

- [ ] **Step 4: Re-export from `shared/src/index.ts`**

Open `shared/src/index.ts` and add:
```ts
export * from './skills.ts';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd server && npm test -- tests/skills.test.ts
```
Expected: All 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add shared/src/skills.ts shared/src/index.ts server/tests/skills.test.ts
git commit -m "feat: add NodeId types, SKILL_NODES, canUnlock gate logic to shared"
```

---

## Task 3: Extend shared types for modifier-carrying projectiles

**Files:**
- Modify: `shared/src/types.ts`

- [ ] **Step 1: Write failing tests for extended types**

Add to `server/tests/fireball.test.ts`:

```ts
import { spawnFireball } from '../src/spells/Fireball.ts';

describe('spawnFireball with config overrides', () => {
  it('uses overridden speed when provided', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 700, y: 400 }, { speed: 200 });
    const spd = Math.sqrt(fb.velocity.x ** 2 + fb.velocity.y ** 2);
    expect(spd).toBeCloseTo(200, 0);
  });

  it('stores radius override on the projectile', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 700, y: 400 }, { radius: 30 });
    expect(fb.radius).toBe(30);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd server && npm test -- tests/fireball.test.ts
```
Expected: FAIL — `spawnFireball` doesn't accept 4th arg.

- [ ] **Step 3: Extend `Projectile` type in `shared/src/types.ts`**

Replace the `Projectile` type (lines 20–27) with:

```ts
export type Projectile = {
  id: string;
  ownerId: string;
  type: ProjectileType;
  position: Vec2;
  velocity: Vec2;
  // skill modifier fields — undefined means use defaults
  radius?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: boolean;
  split?: number;
};
```

Add to `MeteorState`:
```ts
export type MeteorState = {
  id: string;
  ownerId: string;
  target: Vec2;
  strikeAt: number;
  hidden?: boolean;       // Blind Strike: enemy can't see indicator
  moltenImpact?: boolean; // Molten Impact: leave burning crater
};
```

Add to `PlayerState`:
```ts
export type PlayerState = {
  id: string;
  displayName: string;
  position: Vec2;
  hp: number;
  mana: number;
  facing: number;
  castingSpell: SpellId | null;
  cooldowns: Partial<Record<SpellId, number>>;
  invulnUntil?: number;    // Ethereal Form: tick until invuln expires
  phantomStepUntil?: number; // Phantom Step: tick until free-cast expires
};
```

Add constant at bottom of file:
```ts
export const TELEPORT_MAX_RANGE = 600; // Phase Shift increases this by 40%
```

- [ ] **Step 4: Update `server/src/spells/Fireball.ts`**

```ts
import { Projectile, Vec2, FIREBALL_SPEED, FIREBALL_RADIUS, PLAYER_HALF_SIZE, ARENA_SIZE, DELTA } from '@arena/shared';
import { PILLARS } from '@arena/shared';
import { circleHitsAABB } from '../physics/Collision.ts';

let _id = 0;
const nextId = () => `fb_${++_id}`;

type FireballConfig = {
  speed?: number;
  radius?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: boolean;
  split?: number;
};

export function spawnFireball(
  ownerId: string,
  from: Vec2,
  target: Vec2,
  cfg: FireballConfig = {},
): Projectile {
  const speed = cfg.speed ?? FIREBALL_SPEED;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    id: nextId(),
    ownerId,
    type: 'fireball',
    position: { x: from.x, y: from.y },
    velocity: { x: (dx / len) * speed, y: (dy / len) * speed },
    radius: cfg.radius,
    damageMin: cfg.damageMin,
    damageMax: cfg.damageMax,
    homing: cfg.homing,
    split: cfg.split,
  };
}

export function advanceFireball(p: Projectile, enemyPos?: Vec2): Projectile {
  let vx = p.velocity.x;
  let vy = p.velocity.y;
  if (p.homing && enemyPos) {
    const dx = enemyPos.x - p.position.x;
    const dy = enemyPos.y - p.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = 60; // degrees/sec effective homing force
    vx += (dx / len) * strength * DELTA;
    vy += (dy / len) * strength * DELTA;
    // re-normalize to original speed
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

export function isFireballExpired(p: Projectile): boolean {
  const r = p.radius ?? FIREBALL_RADIUS;
  const { x, y } = p.position;
  if (x - r < 0 || x + r > ARENA_SIZE || y - r < 0 || y + r > ARENA_SIZE) return true;
  return PILLARS.some(pillar => circleHitsAABB(p.position, r, pillar));
}

export function fireballHitsPlayer(p: Projectile, playerPos: Vec2, playerId: string): boolean {
  if (p.ownerId === playerId) return false;
  const r = p.radius ?? FIREBALL_RADIUS;
  return circleHitsAABB(p.position, r, { x: playerPos.x, y: playerPos.y, halfSize: PLAYER_HALF_SIZE });
}

export function fireballDamage(p: Projectile): number {
  const min = p.damageMin ?? 80;
  const max = p.damageMax ?? 120;
  return Math.floor(min + Math.random() * (max - min + 1));
}
```

- [ ] **Step 5: Run tests**

```bash
cd server && npm test
```
Expected: All existing tests pass + new config override tests pass. Note: `fireballDamage()` now requires a `Projectile` argument — the stateadvancer test that calls it indirectly via `advanceState` will still pass since we update `StateAdvancer` in Task 5.

- [ ] **Step 6: Commit**

```bash
git add shared/src/types.ts server/src/spells/Fireball.ts server/tests/fireball.test.ts
git commit -m "feat: extend Projectile/PlayerState/MeteorState with skill modifier fields"
```

---

## Task 4: SpellModifiers — derive modifier values from a skill set

**Files:**
- Create: `server/src/skills/SpellModifiers.ts`
- Add tests to: `server/tests/skills.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `server/tests/skills.test.ts`:

```ts
import { buildSpellModifiers } from '../src/skills/SpellModifiers.ts';
import { FIREBALL_SPEED, FIREBALL_RADIUS, FIREWALL_DURATION_TICKS, FIREWALL_DAMAGE_PER_TICK } from '@arena/shared';

describe('buildSpellModifiers', () => {
  it('returns base values when no skills are owned', () => {
    const m = buildSpellModifiers(new Set());
    expect(m.fireball.speed).toBe(FIREBALL_SPEED);
    expect(m.fireball.radius).toBe(FIREBALL_RADIUS);
    expect(m.fireball.damageMin).toBe(80);
    expect(m.fireball.damageMax).toBe(120);
    expect(m.fireball.homing).toBe(false);
    expect(m.fireball.split).toBe(0);
    expect(m.firewall.durationMultiplier).toBe(1);
    expect(m.firewall.damageMultiplier).toBe(1);
    expect(m.meteor.hidden).toBe(false);
    expect(m.meteor.moltenImpact).toBe(false);
    expect(m.teleport.maxRange).toBe(600);
    expect(m.teleport.etherealForm).toBe(false);
    expect(m.teleport.phantomStep).toBe(false);
  });

  it('applies Volatile Ember: +30% radius', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.volatile_ember']));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * 1.3, 5);
  });

  it('applies Hellfire: 3× radius, 2× damage, 0.5× speed', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.hellfire']));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * 3, 5);
    expect(m.fireball.damageMin).toBe(160);
    expect(m.fireball.damageMax).toBe(240);
    expect(m.fireball.speed).toBeCloseTo(FIREBALL_SPEED * 0.5, 5);
  });

  it('stacks Volatile Ember + Hellfire: radius is base * 1.3 * 3', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.volatile_ember', 'fire.hellfire']));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * 1.3 * 3, 5);
  });

  it('applies Enduring Flames: +50% firewall duration', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.volatile_ember', 'fire.fire_wall', 'fire.enduring_flames']));
    expect(m.firewall.durationMultiplier).toBe(1.5);
  });

  it('applies Phase Shift: +40% teleport range', () => {
    const m = buildSpellModifiers(new Set(['utility.teleport', 'utility.phase_shift']));
    expect(m.teleport.maxRange).toBeCloseTo(600 * 1.4, 5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd server && npm test -- tests/skills.test.ts
```
Expected: FAIL — `buildSpellModifiers` not found.

- [ ] **Step 3: Create `server/src/skills/SpellModifiers.ts`**

```ts
import {
  FIREBALL_SPEED, FIREBALL_RADIUS,
  TELEPORT_MAX_RANGE,
} from '@arena/shared';

export type FireballModifiers = {
  speed: number;
  radius: number;
  damageMin: number;
  damageMax: number;
  homing: boolean;
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

export function buildSpellModifiers(skills: Set<string>): SpellModifiers {
  const has = (id: string) => skills.has(id);

  let fbRadius = FIREBALL_RADIUS;
  let fbSpeed  = FIREBALL_SPEED;
  let fbDmgMin = 80;
  let fbDmgMax = 120;

  if (has('fire.volatile_ember')) fbRadius *= 1.3;
  if (has('fire.hellfire')) {
    fbRadius *= 3;
    fbSpeed  *= 0.5;
    fbDmgMin *= 2;
    fbDmgMax *= 2;
  }

  return {
    fireball: {
      speed:     fbSpeed,
      radius:    fbRadius,
      damageMin: fbDmgMin,
      damageMax: fbDmgMax,
      homing:    has('fire.seeking_flame'),
      split:     has('fire.pyroclasm') ? 3 : 0,
    },
    firewall: {
      durationMultiplier: has('fire.enduring_flames') ? 1.5 : 1,
      damageMultiplier:   has('fire.searing_heat')    ? 1.4 : 1,
    },
    meteor: {
      hidden:       has('fire.blind_strike'),
      moltenImpact: has('fire.molten_impact'),
    },
    teleport: {
      maxRange:     TELEPORT_MAX_RANGE * (has('utility.phase_shift')   ? 1.4 : 1),
      etherealForm: has('utility.ethereal_form'),
      phantomStep:  has('utility.phantom_step'),
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd server && npm test -- tests/skills.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/skills/SpellModifiers.ts server/tests/skills.test.ts
git commit -m "feat: add buildSpellModifiers — derives per-player spell config from skill set"
```

---

## Task 5: Wire modifiers into StateAdvancer

**Files:**
- Modify: `server/src/gameloop/StateAdvancer.ts`
- Modify: `server/src/spells/FireWall.ts`
- Modify: `server/src/spells/Meteor.ts`

- [ ] **Step 1: Add failing tests**

Append to `server/tests/stateadvancer.test.ts`:

```ts
import { NodeId } from '@arena/shared';

describe('advanceState — skill modifiers', () => {
  it('fireball with Volatile Ember has larger radius (hits from further away)', () => {
    const state = twoPlayerState();
    const skills: Record<string, Set<NodeId>> = {
      p1: new Set(['fire.fireball', 'fire.volatile_ember']),
      p2: new Set(['fire.fireball']),
    };
    // Place a fireball just outside normal radius but inside enlarged radius
    // Normal radius 10, enlarged 13 — place enemy 11 units from fireball
    state.projectiles.push({
      id: 'fb_test',
      ownerId: 'p1',
      type: 'fireball',
      position: { x: 1811, y: 1000 }, // 11 units right of p2 (at 1800)
      velocity: { x: 400, y: 0 },
      radius: 13, // volatile ember applied
    });
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200,  y: 1000 } },
    };
    const next = advanceState(state, inputs, skills);
    expect(next.players['p2'].hp).toBeLessThan(500);
  });

  it('casting fireball when fire.fireball not in skills does nothing', () => {
    const state = twoPlayerState();
    const skills: Record<string, Set<NodeId>> = {
      p1: new Set(['utility.teleport']), // no fireball
      p2: new Set(['fire.fireball']),
    };
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200, y: 1000 } },
    };
    const next = advanceState(state, inputs, skills);
    expect(next.projectiles).toHaveLength(0);
  });

  it('Ethereal Form: player is invuln for 30 ticks after teleporting', () => {
    const state = twoPlayerState();
    const skills: Record<string, Set<NodeId>> = {
      p1: new Set(['utility.teleport', 'utility.ethereal_form']),
      p2: new Set(['fire.fireball']),
    };
    // Put a fireball right on p1's teleport destination
    state.projectiles.push({
      id: 'fb_test',
      ownerId: 'p2',
      type: 'fireball',
      position: { x: 1001, y: 1000 },
      velocity: { x: 400, y: 0 },
    });
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 4 as const, aimTarget: { x: 1000, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 200, y: 1000 } },
    };
    const next = advanceState(state, inputs, skills);
    expect(next.players['p1'].hp).toBe(500); // no damage during invuln
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd server && npm test -- tests/stateadvancer.test.ts
```
Expected: FAIL — `advanceState` doesn't accept 3rd arg.

- [ ] **Step 3: Update `server/src/spells/FireWall.ts`**

Read the current FireWall.ts first, then update `spawnFireWall` to accept multipliers:

```ts
import { FireWallState, Segment, Vec2, FIREWALL_MAX_LENGTH, FIREWALL_DURATION_TICKS, PLAYER_HALF_SIZE } from '@arena/shared';

let _id = 0;
const nextId = () => `fw_${++_id}`;

export function spawnFireWall(
  ownerId: string,
  start: Vec2,
  end: Vec2,
  tick: number,
  durationMultiplier = 1,
): FireWallState {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const clampedLen = Math.min(len, FIREWALL_MAX_LENGTH);
  const nx = dx / len;
  const ny = dy / len;
  const clampedEnd = { x: start.x + nx * clampedLen, y: start.y + ny * clampedLen };
  const segment: Segment = { x1: start.x, y1: start.y, x2: clampedEnd.x, y2: clampedEnd.y };
  return {
    id: nextId(),
    ownerId,
    segments: [segment],
    expiresAt: tick + Math.round(FIREWALL_DURATION_TICKS * durationMultiplier),
  };
}

export function fireWallDamagesPlayer(fw: FireWallState, playerPos: Vec2, playerId: string): boolean {
  if (fw.ownerId === playerId) return false;
  for (const seg of fw.segments) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((playerPos.x - seg.x1) * dx + (playerPos.y - seg.y1) * dy) / len2));
    const closestX = seg.x1 + t * dx;
    const closestY = seg.y1 + t * dy;
    const distSq = (playerPos.x - closestX) ** 2 + (playerPos.y - closestY) ** 2;
    if (distSq <= PLAYER_HALF_SIZE ** 2) return true;
  }
  return false;
}
```

- [ ] **Step 4: Update `server/src/spells/Meteor.ts`**

Read current Meteor.ts, then update to accept `hidden`/`moltenImpact` flags:

```ts
import { MeteorState, Vec2, METEOR_DELAY_TICKS, METEOR_AOE_RADIUS, PLAYER_HALF_SIZE } from '@arena/shared';

let _id = 0;
const nextId = () => `m_${++_id}`;

export function spawnMeteor(
  ownerId: string,
  target: Vec2,
  tick: number,
  opts: { hidden?: boolean; moltenImpact?: boolean } = {},
): MeteorState {
  return {
    id: nextId(),
    ownerId,
    target: { ...target },
    strikeAt: tick + METEOR_DELAY_TICKS,
    hidden: opts.hidden,
    moltenImpact: opts.moltenImpact,
  };
}

export function meteorDetonates(m: MeteorState, tick: number): boolean {
  return tick >= m.strikeAt;
}

export function meteorHitsPlayer(m: MeteorState, playerPos: Vec2, playerId: string): boolean {
  if (m.ownerId === playerId) return false;
  const dx = playerPos.x - m.target.x;
  const dy = playerPos.y - m.target.y;
  return dx * dx + dy * dy <= METEOR_AOE_RADIUS ** 2;
}

export function meteorDamage(): number {
  return Math.floor(200 + Math.random() * 81);
}
```

- [ ] **Step 5: Rewrite `server/src/gameloop/StateAdvancer.ts`**

```ts
import {
  GameState, PlayerState, InputFrame, Vec2, SpellId, NodeId,
  SPELL_CONFIG, MAX_HP, MAX_MANA, MANA_REGEN_PER_TICK,
  FIREWALL_DAMAGE_PER_TICK, TELEPORT_MAX_RANGE,
} from '@arena/shared';
import { movePlayer, clampToArena, resolvePlayerPillarCollisions } from '../physics/Movement.ts';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../spells/Fireball.ts';
import { spawnFireWall, fireWallDamagesPlayer } from '../spells/FireWall.ts';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../spells/Meteor.ts';
import { buildSpellModifiers } from '../skills/SpellModifiers.ts';

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

export function advanceState(
  state: GameState,
  inputs: Record<string, InputFrame>,
  skillSets: Record<string, Set<NodeId>> = {},
): GameState {
  const players = deepCopyPlayers(state.players);
  const modifiers = Object.fromEntries(
    Object.keys(players).map(id => [id, buildSpellModifiers(skillSets[id] ?? new Set())])
  );

  // 1. Move players and apply mana regen
  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p) continue;
    const newMana = Math.min(MAX_MANA, p.mana + MANA_REGEN_PER_TICK);
    const newFacing = input.aimTarget
      ? Math.atan2(input.aimTarget.y - p.position.y, input.aimTarget.x - p.position.x)
      : p.facing;
    const newCooldowns: Partial<Record<SpellId, number>> = {};
    for (const [k, v] of Object.entries(p.cooldowns)) {
      const remaining = (v as number) - 1;
      if (remaining > 0) newCooldowns[Number(k)] = remaining;
    }
    // Expire phantom step
    const phantomActive = (p.phantomStepUntil ?? 0) > state.tick;
    players[id] = {
      ...p,
      position: movePlayer(p.position, input.move),
      mana: newMana,
      facing: newFacing,
      cooldowns: newCooldowns,
      phantomStepUntil: phantomActive ? p.phantomStepUntil : undefined,
    };
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
    const skills = skillSets[id] ?? new Set();
    const mods = modifiers[id];

    // Spell availability gate — player must own the spell node
    const spellNodeMap: Partial<Record<SpellId, NodeId>> = {
      1: 'fire.fireball',
      2: 'fire.fire_wall',
      3: 'fire.meteor',
      4: 'utility.teleport',
    };
    const requiredNode = spellNodeMap[spell];
    if (requiredNode && !skills.has(requiredNode)) continue;

    const cfg = SPELL_CONFIG[spell];
    const phantomActive = (p.phantomStepUntil ?? 0) > tick;
    const effectiveManaCost = phantomActive ? 0 : cfg.manaCost;
    if (p.mana < effectiveManaCost) continue;
    if ((p.cooldowns[spell] ?? 0) > 0) continue;

    players[id] = {
      ...p,
      mana: p.mana - effectiveManaCost,
      cooldowns: phantomActive ? { ...p.cooldowns } : { ...p.cooldowns, [spell]: cfg.cooldownTicks },
      phantomStepUntil: phantomActive ? undefined : p.phantomStepUntil,
    };

    if (spell === 1) {
      const fb = spawnFireball(id, p.position, input.aimTarget, {
        speed:     mods.fireball.speed,
        radius:    mods.fireball.radius,
        damageMin: mods.fireball.damageMin,
        damageMax: mods.fireball.damageMax,
        homing:    mods.fireball.homing,
        split:     mods.fireball.split,
      });
      projectiles = [...projectiles, fb];
    } else if (spell === 2 && input.aimTarget2) {
      fireWalls = [...fireWalls, spawnFireWall(id, input.aimTarget, input.aimTarget2, tick, mods.firewall.durationMultiplier)];
    } else if (spell === 3) {
      meteors = [...meteors, spawnMeteor(id, input.aimTarget, tick, {
        hidden: mods.meteor.hidden,
        moltenImpact: mods.meteor.moltenImpact,
      })];
    } else if (spell === 4) {
      // Clamp teleport distance to maxRange
      const tMods = mods.teleport;
      const dx = input.aimTarget.x - p.position.x;
      const dy = input.aimTarget.y - p.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedTarget = dist > tMods.maxRange
        ? { x: p.position.x + (dx / dist) * tMods.maxRange, y: p.position.y + (dy / dist) * tMods.maxRange }
        : input.aimTarget;
      const newPos = resolvePlayerPillarCollisions(clampToArena(clampedTarget));
      players[id] = {
        ...players[id],
        position: newPos,
        invulnUntil: tMods.etherealForm ? tick + 30 : undefined,
        phantomStepUntil: tMods.phantomStep ? tick + 2 * 60 : players[id].phantomStepUntil,
      };
    }
  }

  // 3. Advance projectiles, check hits
  const survivingProjectiles = [];
  const newProjectiles: typeof projectiles = [];
  for (const fb of projectiles) {
    const enemyEntry = Object.entries(players).find(([pid]) => pid !== fb.ownerId);
    const moved = advanceFireball(fb, enemyEntry?.[1].position);
    if (isFireballExpired(moved)) continue;
    let hit = false;
    for (const [pid, player] of Object.entries(players)) {
      if (fireballHitsPlayer(moved, player.position, pid)) {
        const invuln = (player.invulnUntil ?? 0) > tick;
        if (!invuln) {
          players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage(moved)) };
        }
        // Pyroclasm split
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
  projectiles = [...survivingProjectiles, ...newProjectiles];

  // 4. Fire wall damage
  fireWalls = fireWalls.filter(fw => tick < fw.expiresAt);
  for (const fw of fireWalls) {
    const ownerMods = modifiers[fw.ownerId];
    const dmgMultiplier = ownerMods?.firewall.damageMultiplier ?? 1;
    for (const [pid] of Object.entries(players)) {
      if (fireWallDamagesPlayer(fw, players[pid].position, pid)) {
        const invuln = (players[pid].invulnUntil ?? 0) > tick;
        if (!invuln) {
          players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - FIREWALL_DAMAGE_PER_TICK * dmgMultiplier) };
        }
      }
    }
  }

  // 5. Meteor detonations
  const survivingMeteors = [];
  for (const m of meteors) {
    if (meteorDetonates(m, tick)) {
      for (const [pid] of Object.entries(players)) {
        if (meteorHitsPlayer(m, players[pid].position, pid)) {
          const invuln = (players[pid].invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - meteorDamage()) };
          }
        }
      }
      // Molten Impact: spawn a fire wall at impact site
      if (m.moltenImpact) {
        const crater = spawnFireWall(m.ownerId,
          { x: m.target.x - 40, y: m.target.y },
          { x: m.target.x + 40, y: m.target.y },
          tick,
          0.5, // 3s at default 4s duration * 0.5 ≈ 2s... use explicit: 3s = 180 ticks
        );
        // Override expiresAt to exactly 180 ticks (3s)
        fireWalls = [...fireWalls, { ...crater, expiresAt: tick + 180 }];
      }
    } else {
      survivingMeteors.push(m);
    }
  }

  // 6. Win condition
  let phase = state.phase;
  let winner = state.winner;
  if (phase !== 'ended') {
    const deadIds = Object.keys(players).filter(id => players[id].hp <= 0);
    if (deadIds.length >= 2) { phase = 'ended'; winner = null; }
    else if (deadIds.length === 1) {
      phase = 'ended';
      winner = Object.keys(players).find(id => id !== deadIds[0]) ?? null;
    }
  }

  return { tick: tick + 1, players, projectiles, fireWalls, meteors: survivingMeteors, phase, winner };
}

function deepCopyPlayers(players: Record<string, PlayerState>): Record<string, PlayerState> {
  const copy: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(players)) {
    copy[id] = { ...p, position: { ...p.position }, cooldowns: { ...p.cooldowns } };
  }
  return copy;
}
```

- [ ] **Step 6: Run all server tests**

```bash
cd server && npm test
```
Expected: All tests pass. Note: existing `stateadvancer.test.ts` tests call `advanceState(state, inputs)` — the new optional 3rd param defaults to `{}` so they continue working.

- [ ] **Step 7: Commit**

```bash
git add server/src/gameloop/StateAdvancer.ts server/src/spells/FireWall.ts server/src/spells/Meteor.ts
git commit -m "feat: wire skill modifiers into StateAdvancer — fireball, firewall, meteor, teleport"
```

---

## Task 6: Server Supabase client + skill loader

**Files:**
- Create: `server/src/supabase.ts`
- Create: `server/src/skills/loadSkills.ts`

- [ ] **Step 1: Create `server/src/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const url  = process.env.SUPABASE_URL!;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
```

- [ ] **Step 2: Create `server/src/skills/loadSkills.ts`**

```ts
import { supabase } from '../supabase.ts';
import type { NodeId } from '@arena/shared';

export type SkillLoadResult =
  | { ok: true; userId: string; skills: Set<NodeId> }
  | { ok: false; error: string };

export async function loadSkillsForToken(accessToken: string): Promise<SkillLoadResult> {
  // Verify the token and get the user
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: authErr?.message ?? 'Invalid token' };

  const { data, error } = await supabase
    .from('skill_unlocks')
    .select('node_id')
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };

  const skills = new Set<NodeId>((data ?? []).map((row: { node_id: string }) => row.node_id as NodeId));
  return { ok: true, userId: user.id, skills };
}

export async function creditMatchResult(
  userId: string,
  won: boolean,
): Promise<void> {
  const pointsEarned = won ? 3 : 1; // +1 played, +2 won = 3 total for win
  await supabase.rpc('credit_match_result', { p_user_id: userId, p_won: won, p_points: pointsEarned });
}
```

- [ ] **Step 3: Add the RPC function to Supabase**

Run this SQL in the Supabase SQL editor:

```sql
create or replace function public.credit_match_result(
  p_user_id uuid,
  p_won boolean,
  p_points int
) returns void language plpgsql security definer as $$
begin
  update public.profiles set
    matches_played = matches_played + 1,
    matches_won    = matches_won + (case when p_won then 1 else 0 end),
    skill_points_available = skill_points_available + p_points,
    skill_points_total     = skill_points_total + p_points
  where user_id = p_user_id;
end;
$$;
```

- [ ] **Step 4: Commit**

```bash
git add server/src/supabase.ts server/src/skills/loadSkills.ts
git commit -m "feat: server Supabase client + loadSkillsForToken + creditMatchResult"
```

---

## Task 7: Update Room + server index for auth and skill loading

**Files:**
- Modify: `server/src/rooms/Room.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Update `server/src/rooms/Room.ts`**

Add `skillSets` map and `userIds` map; pass skill sets into `advanceState`:

```ts
import { GameState, InputFrame, SPAWN_POSITIONS, NodeId } from '@arena/shared';
import { makeInitialState, advanceState, PlayerInit } from '../gameloop/StateAdvancer.ts';

export type RoomPlayer = { socketId: string; displayName: string; ready: boolean };

export class Room {
  readonly id: string;
  players: Map<string, RoomPlayer> = new Map();
  skillSets: Map<string, Set<NodeId>> = new Map();  // socketId -> skill set
  userIds: Map<string, string> = new Map();          // socketId -> supabase userId
  state: GameState | null = null;
  private pendingInputs: Map<string, InputFrame> = new Map();

  constructor(id: string) { this.id = id; }

  get isFull(): boolean { return this.players.size === 2; }
  get allReady(): boolean { return this.players.size === 2 && [...this.players.values()].every(p => p.ready); }

  addPlayer(socketId: string, displayName: string): void {
    if (this.isFull) return;
    this.players.set(socketId, { socketId, displayName, ready: false });
  }

  removePlayer(socketId: string): void {
    this.players.delete(socketId);
    this.skillSets.delete(socketId);
    this.userIds.delete(socketId);
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
    if (this.state.phase === 'ended') return this.state;
    const inputs: Record<string, InputFrame> = {};
    for (const [id] of this.players) {
      inputs[id] = this.pendingInputs.get(id) ?? { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } };
    }
    const skillSetsObj: Record<string, Set<NodeId>> = Object.fromEntries(this.skillSets.entries());
    this.state = advanceState(this.state, inputs, skillSetsObj);
    return this.state;
  }

  reset(): void {
    for (const p of this.players.values()) p.ready = false;
    this.state = null;
    this.pendingInputs.clear();
  }
}
```

- [ ] **Step 2: Update `server/src/index.ts`**

Replace the `join-room` handler and add match-end point crediting:

```ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.ts';
import { GameLoop } from './gameloop/GameLoop.ts';
import { InputFrame } from '@arena/shared';
import { loadSkillsForToken, creditMatchResult } from './skills/loadSkills.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const roomManager = new RoomManager();
const loops: Map<string, GameLoop> = new Map();

app.use(express.json());

app.post('/rooms', (_req, res) => {
  const room = roomManager.createRoom();
  res.json({ roomId: room.id });
});

app.get('/rooms/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  res.json({ exists: !!room, full: room?.isFull ?? false });
});

io.on('connection', socket => {
  let currentRoomId: string | null = null;

  socket.on('join-room', async ({ roomId, displayName, accessToken }: {
    roomId: string;
    displayName: string;
    accessToken?: string;
  }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('room-not-found'); return; }
    if (room.isFull) { socket.emit('room-full'); return; }

    room.addPlayer(socket.id, displayName);

    // Load skills if auth token provided
    if (accessToken) {
      const result = await loadSkillsForToken(accessToken);
      if (result.ok) {
        room.skillSets.set(socket.id, result.skills);
        room.userIds.set(socket.id, result.userId);
      }
    }

    socket.join(roomId);
    currentRoomId = roomId;

    socket.emit('room-joined', {
      roomId,
      yourId: socket.id,
      players: Object.fromEntries([...room.players.entries()].map(([id, p]) => [id, p.displayName])),
    });
    socket.to(roomId).emit('player-joined', { id: socket.id, displayName });
    if (room.isFull) io.to(roomId).emit('game-ready');
  });

  socket.on('player-ready', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    room.setReady(socket.id);
    if (room.allReady) {
      room.startDuel();
      const loop = new GameLoop();
      const roomId = currentRoomId;
      loops.set(roomId, loop);
      loop.start(room, async state => {
        io.to(roomId).emit('game-state', state);
        if (state.phase === 'ended') {
          io.to(roomId).emit('duel-ended', { winnerId: state.winner });
          // Credit points for both players
          for (const [socketId, userId] of room.userIds.entries()) {
            const won = state.winner === socketId;
            creditMatchResult(userId, won).catch(console.error);
          }
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

- [ ] **Step 3: Run all server tests**

```bash
cd server && npm test
```
Expected: All tests pass (Supabase calls are not invoked in tests since `accessToken` is not provided in test helpers).

- [ ] **Step 4: Commit**

```bash
git add server/src/rooms/Room.ts server/src/index.ts
git commit -m "feat: load player skills from Supabase on join, credit points at match end"
```

---

## Task 8: Client Supabase client + AuthUI

**Files:**
- Create: `client/src/supabase.ts`
- Create: `client/src/auth/AuthUI.ts`

- [ ] **Step 1: Create `client/src/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);

export type UserProfile = {
  username: string;
  skill_points_available: number;
  skill_points_total: number;
  matches_played: number;
  matches_won: number;
};

export async function fetchProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('username, skill_points_available, skill_points_total, matches_played, matches_won')
    .eq('user_id', user.id)
    .single();
  return data ?? null;
}
```

- [ ] **Step 2: Create `client/src/auth/AuthUI.ts`**

```ts
import { supabase } from '../supabase.ts';

type AuthCallbacks = {
  onAuthed: (username: string, accessToken: string) => void;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class AuthUI {
  private el: HTMLElement;

  constructor(container: HTMLElement, private cb: AuthCallbacks) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);z-index:200;font-family:serif;color:#c8a870';
    container.appendChild(this.el);
    this.checkSession();
  }

  private async checkSession(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase.from('profiles').select('username').eq('user_id', session.user.id).single();
      if (profile) { this.cb.onAuthed(profile.username, session.access_token); return; }
    }
    this.showLogin();
  }

  private showLogin(error = ''): void {
    this.el.innerHTML = `
      <div style="text-align:center;max-width:320px;width:100%;padding:24px">
        <h1 style="color:#ddb84a;font-size:1.6rem;letter-spacing:0.15em;margin-bottom:4px">ARENA</h1>
        <p style="color:#6a5228;font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:28px">Sign in to continue</p>
        ${error ? `<p style="color:#cc4444;font-size:0.75rem;margin-bottom:12px">${esc(error)}</p>` : ''}
        <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:8px;font-family:serif">
        <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:12px;font-family:serif">
        <button id="auth-signin" style="width:100%;padding:11px;background:#c85000;border:none;color:#fff;border-radius:2px;cursor:pointer;font-family:serif;letter-spacing:0.1em;margin-bottom:8px">Sign In</button>
        <button id="auth-register" style="width:100%;padding:11px;background:#333;border:1px solid #555;color:#c8a870;border-radius:2px;cursor:pointer;font-family:serif;letter-spacing:0.1em">Create Account</button>
      </div>
    `;
    this.el.querySelector('#auth-signin')!.addEventListener('click', () => this.handleSignIn());
    this.el.querySelector('#auth-register')!.addEventListener('click', () => this.showRegister());
  }

  private showRegister(error = ''): void {
    this.el.innerHTML = `
      <div style="text-align:center;max-width:320px;width:100%;padding:24px">
        <h1 style="color:#ddb84a;font-size:1.6rem;letter-spacing:0.15em;margin-bottom:28px">Create Account</h1>
        ${error ? `<p style="color:#cc4444;font-size:0.75rem;margin-bottom:12px">${esc(error)}</p>` : ''}
        <input id="auth-username" placeholder="Username" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:8px;font-family:serif">
        <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:8px;font-family:serif">
        <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:12px;font-family:serif">
        <button id="auth-submit" style="width:100%;padding:11px;background:#c85000;border:none;color:#fff;border-radius:2px;cursor:pointer;font-family:serif;letter-spacing:0.1em;margin-bottom:8px">Register</button>
        <button id="auth-back" style="width:100%;padding:11px;background:#333;border:1px solid #555;color:#c8a870;border-radius:2px;cursor:pointer;font-family:serif">Back</button>
      </div>
    `;
    this.el.querySelector('#auth-submit')!.addEventListener('click', () => this.handleRegister());
    this.el.querySelector('#auth-back')!.addEventListener('click', () => this.showLogin());
  }

  private async handleSignIn(): Promise<void> {
    const email    = (this.el.querySelector('#auth-email') as HTMLInputElement).value.trim();
    const password = (this.el.querySelector('#auth-password') as HTMLInputElement).value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) { this.showLogin(error?.message ?? 'Sign in failed'); return; }
    const { data: profile } = await supabase.from('profiles').select('username').eq('user_id', data.user.id).single();
    this.cb.onAuthed(profile?.username ?? email, data.session.access_token);
  }

  private async handleRegister(): Promise<void> {
    const username = (this.el.querySelector('#auth-username') as HTMLInputElement).value.trim();
    const email    = (this.el.querySelector('#auth-email') as HTMLInputElement).value.trim();
    const password = (this.el.querySelector('#auth-password') as HTMLInputElement).value;
    if (!username) { this.showRegister('Username is required'); return; }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } },
    });
    if (error || !data.session) { this.showRegister(error?.message ?? 'Registration failed'); return; }
    this.cb.onAuthed(username, data.session.access_token);
  }

  hide(): void { this.el.style.display = 'none'; }
  show(): void { this.el.style.display = 'flex'; }
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/supabase.ts client/src/auth/AuthUI.ts
git commit -m "feat: client Supabase client + AuthUI login/register overlay"
```

---

## Task 9: SkillTreeUI

**Files:**
- Create: `client/src/skills/SkillTreeUI.ts`

- [ ] **Step 1: Create `client/src/skills/SkillTreeUI.ts`**

```ts
import { supabase, fetchProfile, UserProfile } from '../supabase.ts';
import { SKILL_NODES, canUnlock, NodeId, SkillNode } from '@arena/shared';

// Font Awesome icon map for each node
const NODE_ICONS: Record<NodeId, string> = {
  'fire.fireball':        'fa-fire',
  'fire.volatile_ember':  'fa-circle-dot',
  'fire.seeking_flame':   'fa-crosshairs',
  'fire.hellfire':        'fa-skull',
  'fire.pyroclasm':       'fa-code-fork',
  'fire.fire_wall':       'fa-fire-flame-simple',
  'fire.enduring_flames': 'fa-hourglass-half',
  'fire.searing_heat':    'fa-temperature-high',
  'fire.meteor':          'fa-meteor',
  'fire.molten_impact':   'fa-burst',
  'fire.blind_strike':    'fa-eye-slash',
  'utility.teleport':     'fa-wand-magic',
  'utility.phase_shift':  'fa-maximize',
  'utility.ethereal_form':'fa-ghost',
  'utility.phantom_step': 'fa-person-running',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class SkillTreeUI {
  private el: HTMLElement;
  private owned = new Set<NodeId>();
  private profile: UserProfile | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);z-index:150;overflow-y:auto';
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'flex';
    await this.reload();
  }

  hide(): void { this.el.style.display = 'none'; }

  private async reload(): Promise<void> {
    this.profile = await fetchProfile();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('user_id', user.id);
      this.owned = new Set((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
    }
    this.render();
  }

  private render(): void {
    const pts = this.profile?.skill_points_available ?? 0;
    const fireTiers = [1,2,3,4,5,6,7];
    const utilityNodes = SKILL_NODES.filter(n => n.tree === 'utility');

    this.el.innerHTML = `
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&display=swap" rel="stylesheet">
      <div id="skill-tree-panel" style="
        background:#0f0b05;border:1px solid #3a2710;border-radius:2px;
        box-shadow:0 0 0 1px #1e1408,0 8px 40px #000000a0;
        padding:28px 24px 24px;max-width:720px;width:100%;margin:20px;
        font-family:'Cinzel',Georgia,serif;color:#c8a870;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <div style="font-family:'Cinzel Decorative',Cinzel,serif;font-size:1.3rem;color:#ddb84a;letter-spacing:0.14em">Sorceress Skills</div>
            <div style="font-size:0.62rem;color:#6a5228;letter-spacing:0.2em;text-transform:uppercase;margin-top:2px">Points Available: <span style="color:#90a870" id="pts-display">${pts}</span></div>
          </div>
          <div style="display:flex;gap:10px">
            <button id="skill-respec" style="padding:7px 14px;background:#2a1808;border:1px solid #5a3010;color:#c8a870;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.1em">Reset Skills</button>
            <button id="skill-close" style="padding:7px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.1em">Close</button>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:20px">
          ${this.renderTreeColumn('fire', fireTiers, pts)}
          <div style="opacity:0.3;cursor:not-allowed;flex:1">${this.renderLockedColumn('Lightning')}</div>
          <div style="opacity:0.3;cursor:not-allowed;flex:1">${this.renderLockedColumn('Frost')}</div>
        </div>

        <div style="border-top:1px solid #2a1e0c;padding-top:16px">
          <div style="font-size:0.58rem;letter-spacing:0.22em;color:#5a4420;text-transform:uppercase;text-align:center;margin-bottom:12px">Shared Utility</div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            ${utilityNodes.map(n => this.renderNode(n, pts)).join('')}
          </div>
        </div>

        <div id="skill-tooltip" style="display:none;position:fixed;background:#1a1208;border:1px solid #3a2710;padding:10px 14px;border-radius:2px;max-width:220px;font-size:0.68rem;line-height:1.5;color:#c8a870;z-index:300;pointer-events:none"></div>
      </div>
    `;

    this.el.querySelector('#skill-close')!.addEventListener('click', () => this.hide());
    this.el.querySelector('#skill-respec')!.addEventListener('click', () => this.handleRespec());
    this.attachNodeListeners(pts);
  }

  private renderTreeColumn(tree: string, tiers: number[], pts: number): string {
    const nodes = SKILL_NODES.filter(n => n.tree === tree);
    const label = tree.charAt(0).toUpperCase() + tree.slice(1);
    let html = `<div style="flex:1">
      <div style="font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;
        padding:5px 0;border-bottom:1px solid;color:${tree === 'fire' ? '#d86030' : '#40b0d0'};
        border-color:${tree === 'fire' ? '#d8603030' : '#40b0d030'};text-align:center;margin-bottom:12px">${label}</div>`;
    for (const tier of tiers) {
      const tierNodes = nodes.filter(n => n.tier === tier);
      if (!tierNodes.length) continue;
      html += `<div style="font-size:0.44rem;letter-spacing:0.18em;color:#3a2810;text-transform:uppercase;text-align:center;margin-bottom:5px">Tier ${tier}</div>`;
      html += `<div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px">`;
      for (const n of tierNodes) html += this.renderNode(n, pts);
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  private renderLockedColumn(label: string): string {
    return `<div style="flex:1">
      <div style="font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;
        padding:5px 0;border-bottom:1px solid #88888830;color:#888;text-align:center;margin-bottom:12px">${label}</div>
      <div style="text-align:center;font-size:0.58rem;color:#3a3020;margin-top:30px;letter-spacing:0.1em">Coming Soon</div>
    </div>`;
  }

  private renderNode(node: SkillNode, pts: number): string {
    const isOwned    = this.owned.has(node.id);
    const canBuy     = !isOwned && canUnlock(node.id, this.owned) && pts >= node.cost;
    const gateBlocked = !isOwned && !canUnlock(node.id, this.owned);

    const treeColors: Record<string, { border: string; glow: string; icon: string }> = {
      fire:    { border: isOwned ? '#e86020' : (canBuy ? '#903010' : '#3a1808'), glow: '#e8602040', icon: isOwned ? '#e87040' : (canBuy ? '#b04020' : '#3a1808') },
      utility: { border: isOwned ? '#e0a030' : (canBuy ? '#907020' : '#3a2808'), glow: '#e0a03040', icon: isOwned ? '#c89030' : (canBuy ? '#8a6020' : '#3a2808') },
    };
    const c = treeColors[node.tree] ?? treeColors.utility;
    const bgGrad = isOwned
      ? `radial-gradient(circle at 38% 38%, ${node.tree === 'fire' ? '#2a0c00' : '#1a1008'}, #0e0400)`
      : `radial-gradient(circle at 38% 38%, #160800, #0a0400)`;
    const outerRing = node.isSpell
      ? `box-shadow:0 0 0 3px ${isOwned ? '#0f0302' : '#0e0a00'},0 0 0 5px ${c.border}${isOwned ? '60' : '20'},0 0 ${isOwned ? '12px' : '4px'} ${c.glow};`
      : (isOwned ? `box-shadow:0 0 8px ${c.glow};` : '');
    const icon = NODE_ICONS[node.id] ?? 'fa-star';
    const size = node.isSpell ? '58px' : '50px';

    return `
      <div class="skill-node" data-id="${node.id}" data-owned="${isOwned}" data-canbuy="${canBuy}" style="
        display:flex;flex-direction:column;align-items:center;cursor:${gateBlocked ? 'default' : 'pointer'};
        opacity:${gateBlocked ? '0.3' : '1'};
      ">
        <div style="
          width:${size};height:${size};border-radius:50%;border:2px solid ${c.border};
          background:${bgGrad};display:flex;align-items:center;justify-content:center;
          transition:filter 0.14s,transform 0.14s;${outerRing}
        ">
          <i class="fa ${icon} fa-fw" style="color:${c.icon};font-size:${node.isSpell ? '1.25rem' : '1.05rem'}"></i>
        </div>
        <div style="font-size:${node.isSpell ? '0.62rem' : '0.56rem'};font-weight:${node.isSpell ? '600' : '400'};
          color:${node.tree === 'fire' ? (isOwned ? '#d86040' : '#7a3828') : (isOwned ? '#c09828' : '#6a5018')};
          text-align:center;max-width:66px;margin-top:4px;line-height:1.2">${node.name}</div>
        <div style="font-size:0.48rem;color:#4a3620;margin-top:2px;letter-spacing:0.08em">${isOwned ? 'Owned' : `${node.cost} pt${node.cost > 1 ? 's' : ''}`}</div>
      </div>
    `;
  }

  private attachNodeListeners(pts: number): void {
    const tooltip = this.el.querySelector('#skill-tooltip') as HTMLElement;

    this.el.querySelectorAll('.skill-node').forEach(el => {
      const id = el.getAttribute('data-id') as NodeId;
      const node = SKILL_NODES.find(n => n.id === id)!;

      el.addEventListener('mouseenter', e => {
        const canBuy = !this.owned.has(id) && canUnlock(id, this.owned) && pts >= node.cost;
        const gateBlocked = !this.owned.has(id) && !canUnlock(id, this.owned);
        tooltip.innerHTML = `
          <strong style="color:#ddb84a">${node.name}</strong><br>
          <span style="color:#c8a870">${node.description}</span><br>
          <span style="color:#7a6030;font-size:0.6rem">Cost: ${node.cost} pt${node.cost > 1 ? 's' : ''}</span>
          ${gateBlocked ? '<br><span style="color:#884020;font-size:0.6rem">Requirements not met</span>' : ''}
          ${canBuy ? '<br><span style="color:#60a840;font-size:0.6rem">Click to unlock</span>' : ''}
        `;
        tooltip.style.display = 'block';
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top  = `${me.clientY - 10}px`;
      });

      el.addEventListener('mousemove', e => {
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top  = `${me.clientY - 10}px`;
      });

      el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

      el.addEventListener('click', () => {
        const canBuy = !this.owned.has(id) && canUnlock(id, this.owned) && pts >= node.cost;
        if (canBuy) this.handleUnlock(id, node.cost);
      });
    });
  }

  private async handleUnlock(id: NodeId, cost: number): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Insert unlock + decrement points in one transaction via RPC
    const { error } = await supabase.rpc('unlock_skill_node', {
      p_user_id: user.id,
      p_node_id: id,
      p_cost: cost,
    });
    if (error) { console.error('Unlock failed:', error.message); return; }
    await this.reload();
  }

  private async handleRespec(): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.rpc('respec_skills', { p_user_id: user.id });
    if (error) { console.error('Respec failed:', error.message); return; }
    await this.reload();
  }
}
```

- [ ] **Step 2: Add the two RPC functions to Supabase**

Run in the Supabase SQL editor:

```sql
-- Atomic unlock: insert node + deduct points (fails if insufficient)
create or replace function public.unlock_skill_node(
  p_user_id uuid,
  p_node_id text,
  p_cost int
) returns void language plpgsql security definer as $$
begin
  if (select skill_points_available from public.profiles where user_id = p_user_id) < p_cost then
    raise exception 'Insufficient skill points';
  end if;
  insert into public.skill_unlocks (user_id, node_id) values (p_user_id, p_node_id)
    on conflict do nothing;
  update public.profiles set skill_points_available = skill_points_available - p_cost
  where user_id = p_user_id;
end;
$$;

-- Respec: delete all unlocks and refund all spent points
create or replace function public.respec_skills(
  p_user_id uuid
) returns void language plpgsql security definer as $$
declare
  spent int;
begin
  select coalesce(sum(
    case node_id
      when 'fire.fireball'        then 1
      when 'fire.volatile_ember'  then 1
      when 'fire.seeking_flame'   then 1
      when 'fire.hellfire'        then 2
      when 'fire.pyroclasm'       then 2
      when 'fire.fire_wall'       then 2
      when 'fire.enduring_flames' then 1
      when 'fire.searing_heat'    then 2
      when 'fire.meteor'          then 3
      when 'fire.molten_impact'   then 2
      when 'fire.blind_strike'    then 2
      when 'utility.teleport'     then 1
      when 'utility.phase_shift'  then 2
      when 'utility.ethereal_form'then 2
      when 'utility.phantom_step' then 3
      else 0
    end
  ), 0) into spent
  from public.skill_unlocks where user_id = p_user_id;

  delete from public.skill_unlocks where user_id = p_user_id;
  update public.profiles set skill_points_available = skill_points_available + spent
  where user_id = p_user_id;
end;
$$;
```

- [ ] **Step 3: Commit**

```bash
git add client/src/skills/SkillTreeUI.ts
git commit -m "feat: SkillTreeUI — D2-style skill tree panel with unlock + respec"
```

---

## Task 10: Update HUD for dynamic spell slots

**Files:**
- Modify: `client/src/hud/HUD.ts`

- [ ] **Step 1: Update `client/src/hud/HUD.ts`**

Replace `buildSpellSlots` and `update` to accept an `ownedSpells` set:

```ts
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
  }

  init(myId: string): void { this.myId = myId; }

  buildSpellSlots(ownedSpells: Set<SpellId>): void {
    const spells = this.el.querySelector('#hud-spells')!;
    spells.innerHTML = '';
    for (const key of [1, 2, 3, 4] as SpellId[]) {
      if (!ownedSpells.has(key)) continue;
      const slot = document.createElement('div');
      slot.className = 'spell-slot';
      slot.id = `spell-slot-${key}`;
      slot.innerHTML = `<span>${SPELL_NAMES[key]}</span><span style="font-size:9px;color:#888">${key}</span><div class="cd-overlay" id="cd-${key}" style="height:0%"></div>`;
      spells.appendChild(slot);
    }
  }

  update(state: GameState, activeSpell: SpellId): void {
    const me = state.players[this.myId];
    if (!me) return;

    (this.el.querySelector('#hud-hp') as HTMLElement).style.transform = `translateY(${(1 - me.hp / MAX_HP) * 100}%)`;
    (this.el.querySelector('#hud-mp') as HTMLElement).style.transform = `translateY(${(1 - me.mana / MAX_MANA) * 100}%)`;

    for (const key of [1, 2, 3, 4] as SpellId[]) {
      const slot = this.el.querySelector(`#spell-slot-${key}`) as HTMLElement | null;
      if (!slot) continue;
      slot.classList.toggle('active', key === activeSpell);
      const cd = me.cooldowns[key] ?? 0;
      const maxCd = SPELL_CONFIG[key].cooldownTicks;
      const pct = maxCd > 0 ? (cd / maxCd) * 100 : 0;
      (this.el.querySelector(`#cd-${key}`) as HTMLElement).style.height = `${pct}%`;
    }

    const enemyId = Object.keys(state.players).find(id => id !== this.myId);
    if (enemyId) {
      const enemy = state.players[enemyId];
      (this.el.querySelector('#hud-enemy-name') as HTMLElement).textContent = enemy.displayName;
      (this.el.querySelector('#hud-enemy-hp') as HTMLElement).style.width = `${(enemy.hp / MAX_HP) * 100}%`;
      this.minimap.update(me, enemy);
    } else {
      this.minimap.update(me, undefined);
    }
  }

  show(): void { this.el.style.display = ''; this.minimap.show(); }
  hide(): void { this.el.style.display = 'none'; this.minimap.hide(); }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hud/HUD.ts
git commit -m "feat: HUD buildSpellSlots accepts owned spell set, hides unowned slots"
```

---

## Task 11: Wire auth + skill tree into client main + LobbyUI

**Files:**
- Modify: `client/src/main.ts`
- Modify: `client/src/lobby/LobbyUI.ts`

- [ ] **Step 1: Add Skills button + points display to `client/src/lobby/LobbyUI.ts`**

Update `showHome` to accept optional auth context and render points + Skills button. Add `onOpenSkills` callback:

```ts
export type LobbyCallbacks = {
  onCreateRoom: (displayName: string) => void;
  onJoinRoom: (roomId: string, displayName: string) => void;
  onReady: () => void;
  onRematch: () => void;
  onOpenSkills: () => void;
};

// In showHome(), replace the render call with:
showHome(username?: string, points?: number): void {
  const roomId = new URLSearchParams(window.location.search).get('room');
  if (roomId) { this.showJoin(roomId); return; }
  const nameVal = username ? `value="${escapeHtml(username)}"` : '';
  this.render(`
    <div style="text-align:center;max-width:320px">
      <h1 style="color:#ffaa00;margin-bottom:8px">ARENA</h1>
      <p style="color:#888;margin-bottom:4px">Fire Sorceress Duels</p>
      ${points !== undefined ? `<p style="color:#90a870;font-size:0.75rem;margin-bottom:16px">Skill Points: ${points}</p>` : '<div style="margin-bottom:16px"></div>'}
      <input id="name-input" placeholder="Your name" ${nameVal} style="width:100%;padding:10px;background:#1a1a2e;border:1px solid #555;color:#fff;border-radius:4px;margin-bottom:12px;font-size:14px">
      <button id="create-btn" style="width:100%;padding:12px;background:#c85000;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold;margin-bottom:8px">Create Room</button>
      <button id="skills-btn" style="width:100%;padding:10px;background:#1a1a2e;border:1px solid #555;color:#c8a870;border-radius:4px;cursor:pointer;font-size:13px">Skills</button>
    </div>
  `);
  this.el.querySelector('#create-btn')!.addEventListener('click', () => {
    const name = (this.el.querySelector('#name-input') as HTMLInputElement).value.trim();
    if (name) this.cb.onCreateRoom(name);
  });
  this.el.querySelector('#skills-btn')!.addEventListener('click', () => this.cb.onOpenSkills());
}
```

- [ ] **Step 2: Update `client/src/main.ts`**

Replace top of file through the lobby instantiation:

```ts
import { Scene } from './renderer/Scene';
import { Arena } from './renderer/Arena';
import { CharacterMesh } from './renderer/CharacterMesh';
import { SpellRenderer } from './renderer/SpellRenderer';
import { StateBuffer } from './network/StateBuffer';
import { SocketClient } from './network/SocketClient';
import { InputHandler } from './input/InputHandler';
import { HUD } from './hud/HUD';
import { LobbyUI } from './lobby/LobbyUI';
import { AuthUI } from './auth/AuthUI';
import { SkillTreeUI } from './skills/SkillTreeUI';
import { GameState, SpellId, NodeId } from '@arena/shared';
import { supabase, fetchProfile } from './supabase';

const container = document.getElementById('canvas-container')!;
const uiOverlay = document.getElementById('ui-overlay')!;

const scene = new Scene(container);
const arena = new Arena();
arena.addToScene(scene.scene);

const hud = new HUD(uiOverlay);
hud.hide();

const stateBuffer = new StateBuffer();
const socket = new SocketClient();
const skillTreeUI = new SkillTreeUI(uiOverlay);

let myId = '';
let playerMeshes = new Map<string, CharacterMesh>();
let spellRenderer: SpellRenderer | null = null;
let inputHandler: InputHandler | null = null;
let opponentName = '';
let handlersRegistered = false;
let accessToken = '';
let ownedSpells = new Set<SpellId>();

const PLAYER_COLORS: Record<number, number> = { 0: 0xc8a000, 1: 0xc00030 };
let myColorIndex = 0;

// Derive owned SpellId set from NodeId set
function spellsFromNodes(nodes: Set<NodeId>): Set<SpellId> {
  const map: [NodeId, SpellId][] = [
    ['fire.fireball', 1], ['fire.fire_wall', 2], ['fire.meteor', 3], ['utility.teleport', 4],
  ];
  const result = new Set<SpellId>();
  for (const [nodeId, spellId] of map) {
    if (nodes.has(nodeId)) result.add(spellId);
  }
  return result;
}

// Auth gate
const auth = new AuthUI(uiOverlay, {
  onAuthed: async (username, token) => {
    accessToken = token;
    auth.hide();
    const profile = await fetchProfile();
    // Build ownedSpells from DB
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('user_id', user.id);
      const nodeSet = new Set<NodeId>((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
      ownedSpells = spellsFromNodes(nodeSet);
      hud.buildSpellSlots(ownedSpells);
    }
    lobby.show();
    lobby.showHome(username, profile?.skill_points_available);
  },
});

const lobby = new LobbyUI(uiOverlay, {
  onCreateRoom: async (displayName) => {
    const res = await fetch('/rooms', { method: 'POST' });
    const { roomId } = await res.json();
    const shareUrl = `${location.origin}?room=${roomId}`;
    socket.connect();
    socket.joinRoom(roomId, displayName, accessToken);
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
    socket.joinRoom(roomId, displayName, accessToken);
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
  onOpenSkills: async () => {
    lobby.hide();
    await skillTreeUI.show();
    // Refresh ownedSpells after closing tree
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('user_id', user.id);
      const nodeSet = new Set<NodeId>((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
      ownedSpells = spellsFromNodes(nodeSet);
      hud.buildSpellSlots(ownedSpells);
    }
    const profile = await fetchProfile();
    lobby.show();
    lobby.showHome(undefined, profile?.skill_points_available);
  },
});
lobby.hide(); // hidden until authed
```

Also update `socket.joinRoom` call site — the `SocketClient.joinRoom` method needs to accept an optional token. Update `client/src/network/SocketClient.ts`:

Open `client/src/network/SocketClient.ts` and find the `joinRoom` method. Change:
```ts
joinRoom(roomId: string, displayName: string): void {
  this.socket!.emit('join-room', { roomId, displayName });
}
```
to:
```ts
joinRoom(roomId: string, displayName: string, accessToken?: string): void {
  this.socket!.emit('join-room', { roomId, displayName, accessToken });
}
```

- [ ] **Step 3: Run server tests to confirm nothing broke**

```bash
cd server && npm test
```
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/main.ts client/src/lobby/LobbyUI.ts client/src/network/SocketClient.ts
git commit -m "feat: wire AuthUI + SkillTreeUI into lobby flow, send accessToken on join-room"
```

---

## Task 12: Blind Strike — hide meteor indicator for enemy

**Files:**
- Modify: `client/src/renderer/SpellRenderer.ts`

- [ ] **Step 1: Read current SpellRenderer meteor rendering**

Open `client/src/renderer/SpellRenderer.ts` and find where `MeteorState` indicators are rendered. The indicator is the targeting circle shown before impact. Find the code that creates/updates it.

- [ ] **Step 2: Update meteor indicator rendering**

Find the loop that creates meteor indicators (look for `m.strikeAt`, `MeteorState`). Add a check for `m.hidden`:

```ts
// In the meteor update section, when creating the indicator mesh:
// Only show indicator if: it's our own meteor OR it's not hidden
const isOwnMeteor = m.ownerId === this.myId; // you'll need myId accessible in SpellRenderer
if (!m.hidden || isOwnMeteor) {
  // existing indicator creation code
}
```

Since `SpellRenderer` doesn't currently know `myId`, add a `setMyId(id: string)` method:

```ts
setMyId(id: string): void { this.myId = id; }
private myId = '';
```

Call it from `main.ts` after `startGame()`:
```ts
spellRenderer!.setMyId(myId);
```

- [ ] **Step 3: Commit**

```bash
git add client/src/renderer/SpellRenderer.ts client/src/main.ts
git commit -m "feat: Blind Strike — hide meteor impact indicator for enemy when skill is active"
```

---

## Self-Review Checklist

- [x] **Spec: Account & Auth** — Task 1 (Supabase setup), Task 8 (AuthUI), Task 11 (auth gate in main.ts)
- [x] **Spec: Point Economy** — Task 1 (SQL trigger: 5 starting points), Task 6 (creditMatchResult RPC)
- [x] **Spec: Respec** — Task 9 (respec_skills RPC + Reset Skills button)
- [x] **Spec: Fire tree modifiers** — Tasks 3-5 (Fireball overrides, FireWall multipliers, Meteor flags, StateAdvancer)
- [x] **Spec: Spell gating** — Task 5 (spellNodeMap check in advanceState)
- [x] **Spec: HUD spell slots** — Task 10 (buildSpellSlots with owned set)
- [x] **Spec: Skill tree UI** — Task 9 (SkillTreeUI)
- [x] **Spec: canUnlock gates** — Task 2 (shared/skills.ts)
- [x] **Spec: Blind Strike** — Task 12
- [x] **Spec: Ethereal Form** — Task 5 (invulnUntil in StateAdvancer)
- [x] **Spec: Phantom Step** — Task 5 (phantomStepUntil in StateAdvancer)
- [x] **Spec: Phase Shift** — Task 5 (maxRange clamp in teleport handler), Task 4 (buildSpellModifiers)
- [x] **Spec: Molten Impact** — Task 5 (fire wall spawned post-meteor)
- [x] **Spec: Hellfire + Pyroclasm stack** — Task 4 (buildSpellModifiers), Task 5 (split logic in StateAdvancer)

**Type consistency check:**
- `NodeId` used consistently as `string` in `Set<NodeId>` across shared/server/client ✓
- `advanceState(state, inputs, skillSets)` signature matches Room.ts call in Task 7 ✓
- `buildSpellModifiers` returns `SpellModifiers` with all fields used in Task 5 ✓
- `hud.buildSpellSlots(ownedSpells)` called before match in main.ts ✓
- `spawnFireball` 4th arg `FireballConfig` matches usage in StateAdvancer ✓
