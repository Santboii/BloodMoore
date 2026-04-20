# Game Modes (FFA & 2v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Free-For-All and 2v2 Team game modes alongside the existing 1v1 Duel mode.

**Architecture:** Each game mode is a plain config object (type, maxPlayers, spawnPositions, friendlyFireMultiplier, checkWinCondition function) in `shared/`. Room, StateAdvancer, and client code read mode config instead of hardcoding 1v1 assumptions.

**Tech Stack:** TypeScript, Vitest, Socket.io, Three.js

---

### Task 1: Define Game Mode Types and Configs in Shared

**Files:**
- Modify: `shared/src/types.ts` — add `GameModeType`, `GameModeConfig`, extend `PlayerState` and `GameState`
- Create: `shared/src/gameModes.ts` — mode config objects and lookup map
- Modify: `shared/src/index.ts` — re-export new module
- Test: `server/tests/gamemodes.test.ts`

- [ ] **Step 1: Write tests for game mode configs**

```typescript
// server/tests/gamemodes.test.ts
import { describe, it, expect } from 'vitest';
import { GAME_MODES, DUEL_MODE, FFA_MODE, TEAM_DUEL_MODE } from '@arena/shared';
import type { GameModeType } from '@arena/shared';

describe('GAME_MODES lookup', () => {
  it('contains all three mode types', () => {
    expect(GAME_MODES['1v1']).toBe(DUEL_MODE);
    expect(GAME_MODES['ffa']).toBe(FFA_MODE);
    expect(GAME_MODES['2v2']).toBe(TEAM_DUEL_MODE);
  });
});

describe('DUEL_MODE', () => {
  it('has correct properties', () => {
    expect(DUEL_MODE.type).toBe('1v1');
    expect(DUEL_MODE.maxPlayers).toBe(2);
    expect(DUEL_MODE.teamsEnabled).toBe(false);
    expect(DUEL_MODE.friendlyFireMultiplier).toBe(1);
    expect(DUEL_MODE.spawnPositions).toHaveLength(2);
  });
});

describe('FFA_MODE', () => {
  it('has correct properties', () => {
    expect(FFA_MODE.type).toBe('ffa');
    expect(FFA_MODE.maxPlayers).toBe(4);
    expect(FFA_MODE.teamsEnabled).toBe(false);
    expect(FFA_MODE.friendlyFireMultiplier).toBe(1);
    expect(FFA_MODE.spawnPositions).toHaveLength(4);
  });
});

describe('TEAM_DUEL_MODE', () => {
  it('has correct properties', () => {
    expect(TEAM_DUEL_MODE.type).toBe('2v2');
    expect(TEAM_DUEL_MODE.maxPlayers).toBe(4);
    expect(TEAM_DUEL_MODE.teamsEnabled).toBe(true);
    expect(TEAM_DUEL_MODE.teamCount).toBe(2);
    expect(TEAM_DUEL_MODE.playersPerTeam).toBe(2);
    expect(TEAM_DUEL_MODE.friendlyFireMultiplier).toBe(0.5);
    expect(TEAM_DUEL_MODE.spawnPositions).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/gamemodes.test.ts`
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Add types to shared/src/types.ts**

Add at the end of `shared/src/types.ts`, after the `SPAWN_POSITIONS` block (after line 120):

```typescript
// ── Game Modes ────────────────────────────────────────────────────────────

export type GameModeType = '1v1' | 'ffa' | '2v2';

export interface GameModeConfig {
  type: GameModeType;
  label: string;
  maxPlayers: number;
  teamsEnabled: boolean;
  teamCount?: number;
  playersPerTeam?: number;
  friendlyFireMultiplier: number;
  spawnPositions: Vec2[];
  checkWinCondition(
    players: Record<string, PlayerState>,
    teams?: Record<string, string[]>,
  ): { phase: 'dueling' | 'ended'; winner: string | null };
}

export const DISCONNECT_TIMEOUT_MS = 30_000;
```

Also extend `PlayerState` (line 9-20) — add `teamId` as optional field:

```typescript
export type PlayerState = {
  id: string;
  displayName: string;
  position: Vec2;
  hp: number;
  mana: number;
  facing: number;
  castingSpell: SpellId | null;
  cooldowns: Partial<Record<SpellId, number>>;
  invulnUntil?: number;
  phantomStepUntil?: number;
  teamId?: string;
};
```

Extend `GameState` (line 54-62) — add `gameMode` and `teams`:

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
};
```

- [ ] **Step 4: Create shared/src/gameModes.ts**

```typescript
// shared/src/gameModes.ts
import type { GameModeConfig, GameModeType, PlayerState } from './types.js';

const SPAWN_POSITIONS_4 = [
  { x: 200,  y: 1000 },   // left center (existing)
  { x: 1800, y: 1000 },   // right center (existing)
  { x: 1000, y: 200  },   // top center
  { x: 1000, y: 1800 },   // bottom center
];

function duelWinCondition(players: Record<string, PlayerState>) {
  const ids = Object.keys(players);
  const deadIds = ids.filter(id => players[id].hp <= 0);
  if (deadIds.length >= 2) return { phase: 'ended' as const, winner: null };
  if (deadIds.length === 1) {
    const winner = ids.find(id => id !== deadIds[0]) ?? null;
    return { phase: 'ended' as const, winner };
  }
  return { phase: 'dueling' as const, winner: null };
}

function ffaWinCondition(players: Record<string, PlayerState>) {
  const ids = Object.keys(players);
  const aliveIds = ids.filter(id => players[id].hp > 0);
  if (aliveIds.length <= 0) return { phase: 'ended' as const, winner: null };
  if (aliveIds.length === 1) return { phase: 'ended' as const, winner: aliveIds[0] };
  return { phase: 'dueling' as const, winner: null };
}

function teamWinCondition(
  players: Record<string, PlayerState>,
  teams?: Record<string, string[]>,
) {
  if (!teams) return { phase: 'dueling' as const, winner: null };
  const teamIds = Object.keys(teams);
  const aliveTeams = teamIds.filter(teamId =>
    teams[teamId].some(pid => players[pid] && players[pid].hp > 0)
  );
  if (aliveTeams.length <= 0) return { phase: 'ended' as const, winner: null };
  if (aliveTeams.length === 1) return { phase: 'ended' as const, winner: aliveTeams[0] };
  return { phase: 'dueling' as const, winner: null };
}

export const DUEL_MODE: GameModeConfig = {
  type: '1v1',
  label: '1v1 Duel',
  maxPlayers: 2,
  teamsEnabled: false,
  friendlyFireMultiplier: 1,
  spawnPositions: SPAWN_POSITIONS_4.slice(0, 2),
  checkWinCondition: duelWinCondition,
};

export const FFA_MODE: GameModeConfig = {
  type: 'ffa',
  label: 'Free-For-All',
  maxPlayers: 4,
  teamsEnabled: false,
  friendlyFireMultiplier: 1,
  spawnPositions: SPAWN_POSITIONS_4,
  checkWinCondition: ffaWinCondition,
};

export const TEAM_DUEL_MODE: GameModeConfig = {
  type: '2v2',
  label: '2v2 Teams',
  maxPlayers: 4,
  teamsEnabled: true,
  teamCount: 2,
  playersPerTeam: 2,
  friendlyFireMultiplier: 0.5,
  spawnPositions: SPAWN_POSITIONS_4,
  checkWinCondition: teamWinCondition,
};

export const GAME_MODES: Record<GameModeType, GameModeConfig> = {
  '1v1': DUEL_MODE,
  'ffa': FFA_MODE,
  '2v2': TEAM_DUEL_MODE,
};
```

- [ ] **Step 5: Add re-export in shared/src/index.ts**

Add to `shared/src/index.ts`:

```typescript
export * from './gameModes.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/gamemodes.test.ts`
Expected: PASS — all 4 test blocks pass

- [ ] **Step 7: Commit**

```bash
git add shared/src/types.ts shared/src/gameModes.ts shared/src/index.ts server/tests/gamemodes.test.ts
git commit -m "feat: add game mode types, configs, and win condition functions"
```

---

### Task 2: Test Win Condition Functions

**Files:**
- Test: `server/tests/gamemodes.test.ts` (extend from Task 1)

- [ ] **Step 1: Add win condition tests**

Append to `server/tests/gamemodes.test.ts`:

```typescript
import { makeInitialState } from '../src/gameloop/StateAdvancer.ts';
import { MAX_HP } from '@arena/shared';

function makePlayer(id: string, hp: number, teamId?: string) {
  return {
    id, displayName: id, position: { x: 0, y: 0 },
    hp, mana: 300, facing: 0, castingSpell: null,
    cooldowns: {}, teamId,
  } as const;
}

describe('duelWinCondition', () => {
  it('returns dueling when both players alive', () => {
    const players = { p1: makePlayer('p1', 500), p2: makePlayer('p2', 500) };
    const result = DUEL_MODE.checkWinCondition(players);
    expect(result.phase).toBe('dueling');
    expect(result.winner).toBeNull();
  });

  it('returns winner when one player dies', () => {
    const players = { p1: makePlayer('p1', 500), p2: makePlayer('p2', 0) };
    const result = DUEL_MODE.checkWinCondition(players);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBe('p1');
  });

  it('returns tie when both die', () => {
    const players = { p1: makePlayer('p1', 0), p2: makePlayer('p2', 0) };
    const result = DUEL_MODE.checkWinCondition(players);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBeNull();
  });
});

describe('ffaWinCondition', () => {
  it('returns dueling when multiple players alive', () => {
    const players = {
      p1: makePlayer('p1', 500), p2: makePlayer('p2', 500),
      p3: makePlayer('p3', 500), p4: makePlayer('p4', 500),
    };
    const result = FFA_MODE.checkWinCondition(players);
    expect(result.phase).toBe('dueling');
  });

  it('returns dueling when 2 of 4 alive', () => {
    const players = {
      p1: makePlayer('p1', 500), p2: makePlayer('p2', 0),
      p3: makePlayer('p3', 500), p4: makePlayer('p4', 0),
    };
    const result = FFA_MODE.checkWinCondition(players);
    expect(result.phase).toBe('dueling');
  });

  it('returns winner when last player standing', () => {
    const players = {
      p1: makePlayer('p1', 0), p2: makePlayer('p2', 0),
      p3: makePlayer('p3', 100), p4: makePlayer('p4', 0),
    };
    const result = FFA_MODE.checkWinCondition(players);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBe('p3');
  });

  it('returns tie when all die simultaneously', () => {
    const players = {
      p1: makePlayer('p1', 0), p2: makePlayer('p2', 0),
      p3: makePlayer('p3', 0), p4: makePlayer('p4', 0),
    };
    const result = FFA_MODE.checkWinCondition(players);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBeNull();
  });
});

describe('teamWinCondition', () => {
  const teams = { team1: ['p1', 'p2'], team2: ['p3', 'p4'] };

  it('returns dueling when both teams have alive players', () => {
    const players = {
      p1: makePlayer('p1', 500, 'team1'), p2: makePlayer('p2', 0, 'team1'),
      p3: makePlayer('p3', 500, 'team2'), p4: makePlayer('p4', 0, 'team2'),
    };
    const result = TEAM_DUEL_MODE.checkWinCondition(players, teams);
    expect(result.phase).toBe('dueling');
  });

  it('returns winning team when all enemies eliminated', () => {
    const players = {
      p1: makePlayer('p1', 200, 'team1'), p2: makePlayer('p2', 100, 'team1'),
      p3: makePlayer('p3', 0, 'team2'), p4: makePlayer('p4', 0, 'team2'),
    };
    const result = TEAM_DUEL_MODE.checkWinCondition(players, teams);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBe('team1');
  });

  it('returns tie when both teams fully eliminated', () => {
    const players = {
      p1: makePlayer('p1', 0, 'team1'), p2: makePlayer('p2', 0, 'team1'),
      p3: makePlayer('p3', 0, 'team2'), p4: makePlayer('p4', 0, 'team2'),
    };
    const result = TEAM_DUEL_MODE.checkWinCondition(players, teams);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBeNull();
  });

  it('team wins if at least one member survives', () => {
    const players = {
      p1: makePlayer('p1', 0, 'team1'), p2: makePlayer('p2', 1, 'team1'),
      p3: makePlayer('p3', 0, 'team2'), p4: makePlayer('p4', 0, 'team2'),
    };
    const result = TEAM_DUEL_MODE.checkWinCondition(players, teams);
    expect(result.phase).toBe('ended');
    expect(result.winner).toBe('team1');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/gamemodes.test.ts`
Expected: PASS — all win condition tests pass

- [ ] **Step 3: Commit**

```bash
git add server/tests/gamemodes.test.ts
git commit -m "test: add win condition tests for all game modes"
```

---

### Task 3: Refactor StateAdvancer for Game Modes

**Files:**
- Modify: `server/src/gameloop/StateAdvancer.ts` — accept mode config, use mode win condition, add friendly fire
- Modify: `server/tests/stateadvancer.test.ts` — update existing tests for new signature
- Test: `server/tests/stateadvancer-modes.test.ts` — new mode-specific tests

- [ ] **Step 1: Write tests for friendly fire and mode-aware win conditions**

```typescript
// server/tests/stateadvancer-modes.test.ts
import { describe, it, expect } from 'vitest';
import { advanceState, makeInitialState } from '../src/gameloop/StateAdvancer.ts';
import { DUEL_MODE, FFA_MODE, TEAM_DUEL_MODE, MAX_HP } from '@arena/shared';
import type { GameModeConfig } from '@arena/shared';

function fourPlayerState(mode: GameModeConfig, teams?: Record<string, string[]>) {
  return makeInitialState(
    [
      { id: 'p1', displayName: 'A', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'B', spawnPos: { x: 1800, y: 1000 } },
      { id: 'p3', displayName: 'C', spawnPos: { x: 1000, y: 200 } },
      { id: 'p4', displayName: 'D', spawnPos: { x: 1000, y: 1800 } },
    ],
    mode,
    teams,
  );
}

const idleInput = { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } };

describe('FFA win condition in advanceState', () => {
  it('does not end when 1 of 4 players dies', () => {
    const state = fourPlayerState(FFA_MODE);
    state.players['p1'].hp = 0;
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, FFA_MODE);
    expect(next.phase).toBe('dueling');
  });

  it('ends with winner when 3 of 4 players dead', () => {
    const state = fourPlayerState(FFA_MODE);
    state.players['p1'].hp = 0;
    state.players['p2'].hp = 0;
    state.players['p3'].hp = 0;
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, FFA_MODE);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBe('p4');
  });
});

describe('2v2 win condition in advanceState', () => {
  const teams = { team1: ['p1', 'p2'], team2: ['p3', 'p4'] };

  it('does not end when one player per team dies', () => {
    const state = fourPlayerState(TEAM_DUEL_MODE, teams);
    state.players['p1'].hp = 0;
    state.players['p3'].hp = 0;
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, TEAM_DUEL_MODE);
    expect(next.phase).toBe('dueling');
  });

  it('ends when full team eliminated', () => {
    const state = fourPlayerState(TEAM_DUEL_MODE, teams);
    state.players['p3'].hp = 0;
    state.players['p4'].hp = 0;
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, TEAM_DUEL_MODE);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBe('team1');
  });
});

describe('friendly fire', () => {
  const teams = { team1: ['p1', 'p2'], team2: ['p3', 'p4'] };

  it('applies 0.5x damage to teammates in 2v2', () => {
    const state = fourPlayerState(TEAM_DUEL_MODE, teams);
    // Place p2 right next to p1's fireball
    state.players['p2'].position = { x: 210, y: 1000 };
    state.projectiles.push({
      id: 'fb1', ownerId: 'p1', type: 'fireball',
      position: { x: 210, y: 1000 }, velocity: { x: 400, y: 0 },
    });
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, TEAM_DUEL_MODE);
    const dmg = MAX_HP - next.players['p2'].hp;
    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThan(MAX_HP * 0.6); // should be roughly half of normal
  });

  it('applies full damage to enemies in 2v2', () => {
    const state = fourPlayerState(TEAM_DUEL_MODE, teams);
    state.players['p3'].position = { x: 210, y: 1000 };
    state.projectiles.push({
      id: 'fb1', ownerId: 'p1', type: 'fireball',
      position: { x: 210, y: 1000 }, velocity: { x: 400, y: 0 },
    });
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, TEAM_DUEL_MODE);
    const dmg = MAX_HP - next.players['p3'].hp;
    expect(dmg).toBeGreaterThan(0);
  });

  it('applies full damage in FFA (no teams)', () => {
    const state = fourPlayerState(FFA_MODE);
    state.players['p2'].position = { x: 210, y: 1000 };
    state.projectiles.push({
      id: 'fb1', ownerId: 'p1', type: 'fireball',
      position: { x: 210, y: 1000 }, velocity: { x: 400, y: 0 },
    });
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, FFA_MODE);
    const dmg = MAX_HP - next.players['p2'].hp;
    expect(dmg).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/stateadvancer-modes.test.ts`
Expected: FAIL — `makeInitialState` and `advanceState` don't accept mode parameters yet

- [ ] **Step 3: Update makeInitialState to accept mode config**

In `server/src/gameloop/StateAdvancer.ts`, change `makeInitialState` (lines 14-29) to:

```typescript
export function makeInitialState(
  players: PlayerInit[],
  mode?: GameModeConfig,
  teams?: Record<string, string[]>,
): GameState {
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
      teamId: teams
        ? Object.entries(teams).find(([, pids]) => pids.includes(p.id))?.[0]
        : undefined,
    };
  }
  return {
    tick: 0, players: playerMap, projectiles: [], fireWalls: [], meteors: [],
    phase: 'dueling', winner: null,
    gameMode: mode?.type ?? '1v1',
    teams,
  };
}
```

Add `GameModeConfig` and `DUEL_MODE` to the imports from `@arena/shared` at the top of the file.

- [ ] **Step 4: Add friendly fire helper function**

Add after the `deepCopyPlayers` function at the bottom of `StateAdvancer.ts`:

```typescript
function getDamageMultiplier(
  ownerId: string,
  targetId: string,
  players: Record<string, PlayerState>,
  mode: GameModeConfig,
): number {
  if (!mode.teamsEnabled) return 1;
  const ownerTeam = players[ownerId]?.teamId;
  const targetTeam = players[targetId]?.teamId;
  if (ownerTeam && targetTeam && ownerTeam === targetTeam) {
    return mode.friendlyFireMultiplier;
  }
  return 1;
}
```

- [ ] **Step 5: Update advanceState signature and win condition**

Change the `advanceState` signature (lines 31-35) to accept a mode config:

```typescript
export function advanceState(
  state: GameState,
  inputs: Record<string, InputFrame>,
  skillSets: Record<string, Set<NodeId>> = {},
  mode: GameModeConfig = DUEL_MODE,
): GameState {
```

Replace the win condition block (lines 215-225) with:

```typescript
  // 6. Win condition
  let phase = state.phase;
  let winner = state.winner;
  if (phase !== 'ended') {
    const result = mode.checkWinCondition(players, state.teams);
    phase = result.phase;
    winner = result.winner;
  }
```

- [ ] **Step 6: Apply friendly fire multiplier to projectile damage**

In the projectile hit section (around line 154-158), change the damage line. Replace:

```typescript
          players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage(moved)) };
```

With:

```typescript
          const ffMul = getDamageMultiplier(moved.ownerId, pid, players, mode);
          players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage(moved) * ffMul) };
```

- [ ] **Step 7: Apply friendly fire multiplier to Fire Wall damage**

In the fire wall damage section (around line 188), replace:

```typescript
          players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - FIREWALL_DAMAGE_PER_TICK * dmgMultiplier) };
```

With:

```typescript
          const ffMul = getDamageMultiplier(fw.ownerId, pid, players, mode);
          players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - FIREWALL_DAMAGE_PER_TICK * dmgMultiplier * ffMul) };
```

- [ ] **Step 8: Apply friendly fire multiplier to Meteor damage**

In the meteor detonation section (around line 202), replace:

```typescript
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - meteorDamage()) };
```

With:

```typescript
            const ffMul = getDamageMultiplier(m.ownerId, pid, players, mode);
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - meteorDamage() * ffMul) };
```

- [ ] **Step 9: Update return statement to include gameMode and teams**

Replace the return statement (line 227) with:

```typescript
  return {
    tick: tick + 1, players, projectiles, fireWalls, meteors: survivingMeteors,
    phase, winner,
    gameMode: state.gameMode,
    teams: state.teams,
  };
```

- [ ] **Step 10: Also remove the homing target hardcoded assumption**

Line 150 currently finds a single enemy for homing:
```typescript
    const enemyEntry = Object.entries(players).find(([pid]) => pid !== fb.ownerId);
```

Replace with finding the nearest non-self player:

```typescript
    const candidates = Object.entries(players).filter(([pid]) => pid !== fb.ownerId && players[pid].hp > 0);
    const enemyEntry = candidates.length > 0
      ? candidates.reduce((closest, curr) => {
          const closestDist = (closest[1].position.x - fb.position.x) ** 2 + (closest[1].position.y - fb.position.y) ** 2;
          const currDist = (curr[1].position.x - fb.position.x) ** 2 + (curr[1].position.y - fb.position.y) ** 2;
          return currDist < closestDist ? curr : closest;
        })
      : undefined;
```

- [ ] **Step 11: Run all StateAdvancer tests**

Run: `cd server && npx vitest run tests/stateadvancer.test.ts tests/stateadvancer-modes.test.ts`
Expected: PASS — existing tests still pass (mode defaults to DUEL_MODE), new mode tests pass

- [ ] **Step 12: Run full test suite to check for regressions**

Run: `cd server && npx vitest run`
Expected: PASS — the new `gameMode` field on GameState may cause issues in other test files if they compare full state objects; fix any such failures by adding `gameMode: '1v1'` to expected values

- [ ] **Step 13: Commit**

```bash
git add server/src/gameloop/StateAdvancer.ts server/tests/stateadvancer-modes.test.ts server/tests/stateadvancer.test.ts
git commit -m "feat: make StateAdvancer mode-aware with friendly fire and per-mode win conditions"
```

---

### Task 4: Refactor Room to Accept Game Mode

**Files:**
- Modify: `server/src/rooms/Room.ts` — accept mode config, mode-aware isFull/allReady, team assignment
- Modify: `server/tests/room.test.ts` — update tests for new constructor

- [ ] **Step 1: Write tests for mode-aware Room behavior**

Append to `server/tests/room.test.ts`:

```typescript
import { DUEL_MODE, FFA_MODE, TEAM_DUEL_MODE } from '@arena/shared';

describe('Room with game modes', () => {
  it('1v1 room is full at 2 players', () => {
    const room = new Room('r1', DUEL_MODE);
    room.addPlayer('s1', 'Alice');
    expect(room.isFull).toBe(false);
    room.addPlayer('s2', 'Bob');
    expect(room.isFull).toBe(true);
  });

  it('FFA room is full at 4 players', () => {
    const room = new Room('r1', FFA_MODE);
    room.addPlayer('s1', 'A');
    room.addPlayer('s2', 'B');
    expect(room.isFull).toBe(false);
    room.addPlayer('s3', 'C');
    expect(room.isFull).toBe(false);
    room.addPlayer('s4', 'D');
    expect(room.isFull).toBe(true);
  });

  it('rejects players beyond maxPlayers', () => {
    const room = new Room('r1', DUEL_MODE);
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.addPlayer('s3', 'Charlie');
    expect(room.players.size).toBe(2);
  });
});

describe('Room team assignment', () => {
  it('assigns team in 2v2 mode', () => {
    const room = new Room('r1', TEAM_DUEL_MODE);
    room.addPlayer('s1', 'Alice', 'team1');
    room.addPlayer('s2', 'Bob', 'team2');
    expect(room.teamAssignments.get('s1')).toBe('team1');
    expect(room.teamAssignments.get('s2')).toBe('team2');
  });

  it('rejects player joining a full team', () => {
    const room = new Room('r1', TEAM_DUEL_MODE);
    room.addPlayer('s1', 'Alice', 'team1');
    room.addPlayer('s2', 'Bob', 'team1');
    const result = room.addPlayer('s3', 'Charlie', 'team1');
    expect(result).toBe('team-full');
    expect(room.players.size).toBe(2);
  });

  it('ignores team parameter for non-team modes', () => {
    const room = new Room('r1', FFA_MODE);
    room.addPlayer('s1', 'Alice', 'team1');
    expect(room.teamAssignments.size).toBe(0);
  });
});

describe('Room.startMatch with modes', () => {
  it('uses mode spawn positions', () => {
    const room = new Room('r1', FFA_MODE);
    room.addPlayer('s1', 'A');
    room.addPlayer('s2', 'B');
    room.addPlayer('s3', 'C');
    room.addPlayer('s4', 'D');
    for (const p of room.players.values()) p.ready = true;
    room.startMatch();
    expect(room.state).not.toBeNull();
    expect(Object.keys(room.state!.players)).toHaveLength(4);
    expect(room.state!.gameMode).toBe('ffa');
  });

  it('builds teams record for 2v2', () => {
    const room = new Room('r1', TEAM_DUEL_MODE);
    room.addPlayer('s1', 'A', 'team1');
    room.addPlayer('s2', 'B', 'team1');
    room.addPlayer('s3', 'C', 'team2');
    room.addPlayer('s4', 'D', 'team2');
    for (const p of room.players.values()) p.ready = true;
    room.startMatch();
    expect(room.state!.teams).toEqual({
      team1: ['s1', 's2'],
      team2: ['s3', 's4'],
    });
    expect(room.state!.gameMode).toBe('2v2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/room.test.ts`
Expected: FAIL — Room constructor doesn't accept mode yet

- [ ] **Step 3: Update Room class**

In `server/src/rooms/Room.ts`, update the class:

```typescript
import { GAME_MODES, DUEL_MODE } from '@arena/shared';
import type { GameModeConfig, GameModeType } from '@arena/shared';

// ... existing imports ...

export class Room {
  readonly id: string;
  readonly mode: GameModeConfig;
  creatorName: string = '';
  players: Map<string, RoomPlayer> = new Map();
  teamAssignments: Map<string, string> = new Map(); // socketId -> teamId
  skillSets: Map<string, Set<NodeId>> = new Map();
  userIds: Map<string, string> = new Map();
  state: GameState | null = null;
  pauseState: PauseState | null = null;
  private pendingInputs: Map<string, InputFrame> = new Map();

  constructor(id: string, mode: GameModeConfig = DUEL_MODE) {
    this.id = id;
    this.mode = mode;
  }

  get isFull(): boolean { return this.players.size >= this.mode.maxPlayers; }
  get allReady(): boolean { return this.isFull && [...this.players.values()].every(p => p.ready); }

  addPlayer(socketId: string, displayName: string, teamId?: string): 'ok' | 'full' | 'team-full' {
    if (this.isFull) return 'full';

    if (this.mode.teamsEnabled && teamId) {
      const teamSize = [...this.teamAssignments.values()].filter(t => t === teamId).length;
      if (teamSize >= (this.mode.playersPerTeam ?? Infinity)) return 'team-full';
      this.teamAssignments.set(socketId, teamId);
    }

    if (this.players.size === 0) this.creatorName = displayName;
    const colorIndex = this.players.size;
    this.players.set(socketId, { socketId, displayName, ready: false, colorIndex });
    return 'ok';
  }

  removePlayer(socketId: string): void {
    this.players.delete(socketId);
    this.skillSets.delete(socketId);
    this.userIds.delete(socketId);
    this.teamAssignments.delete(socketId);
  }

  // setReady stays the same

  startMatch(): void {
    const entries = [...this.players.entries()];
    const inits: PlayerInit[] = entries.map(([id, p], i) => ({
      id,
      displayName: p.displayName,
      spawnPos: this.mode.spawnPositions[i],
    }));

    let teams: Record<string, string[]> | undefined;
    if (this.mode.teamsEnabled) {
      teams = {};
      for (const [socketId, teamId] of this.teamAssignments) {
        if (!teams[teamId]) teams[teamId] = [];
        teams[teamId].push(socketId);
      }
    }

    this.state = makeInitialState(inits, this.mode, teams);
    this.pendingInputs.clear();
  }

  // tick() needs to pass mode to advanceState
  tick(): GameState {
    if (!this.state) throw new Error('Room not started');
    if (this.state.phase === 'ended') return this.state;
    const inputs: Record<string, InputFrame> = {};
    for (const [id] of this.players) {
      inputs[id] = this.pendingInputs.get(id) ?? { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } };
    }
    const skillSetsObj: Record<string, Set<NodeId>> = Object.fromEntries(this.skillSets.entries());
    this.state = advanceState(this.state, inputs, skillSetsObj, this.mode);
    return this.state;
  }

  // reset, pause, resume, queueInput, remapPlayer stay the same
  // (remapPlayer should also remap teamAssignments entry)
}
```

Also update `remapPlayer` to remap teamAssignments:

```typescript
  remapPlayer(oldSocketId: string, newSocketId: string): void {
    // ... existing remap logic ...

    // Add at the end:
    const team = this.teamAssignments.get(oldSocketId);
    if (team !== undefined) {
      this.teamAssignments.delete(oldSocketId);
      this.teamAssignments.set(newSocketId, team);
    }
  }
```

- [ ] **Step 4: Update existing Room tests to use new constructor**

In existing test blocks at the top of `server/tests/room.test.ts`, update `new Room('r1')` calls. Since the mode parameter defaults to `DUEL_MODE`, existing tests should pass without changes. But update `startDuel()` calls to `startMatch()`:

Find all `room.startDuel()` in the test file and replace with `room.startMatch()`.

- [ ] **Step 5: Run tests**

Run: `cd server && npx vitest run tests/room.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite**

Run: `cd server && npx vitest run`
Expected: PASS — other tests may reference `startDuel` in fixtures; fix any such references

- [ ] **Step 7: Commit**

```bash
git add server/src/rooms/Room.ts server/tests/room.test.ts
git commit -m "feat: make Room mode-aware with team assignment and configurable capacity"
```

---

### Task 5: Refactor RoomManager

**Files:**
- Modify: `server/src/rooms/RoomManager.ts` — accept mode on createRoom
- Modify: `server/tests/roommanager.test.ts` — update tests

- [ ] **Step 1: Write tests for mode-aware RoomManager**

Add to `server/tests/roommanager.test.ts`:

```typescript
import { DUEL_MODE, FFA_MODE, TEAM_DUEL_MODE } from '@arena/shared';
import type { GameModeType } from '@arena/shared';

describe('RoomManager with modes', () => {
  it('creates room with specified mode', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('ffa');
    expect(room.mode).toBe(FFA_MODE);
  });

  it('defaults to 1v1 mode', () => {
    const rm = new RoomManager();
    const room = rm.createRoom();
    expect(room.mode).toBe(DUEL_MODE);
  });

  it('listOpenRooms reports correct mode and maxPlayers', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('2v2');
    room.addPlayer('s1', 'Alice', 'team1');
    const list = rm.listOpenRooms();
    expect(list).toHaveLength(1);
    expect(list[0].mode).toBe('2v2');
    expect(list[0].maxPlayers).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/roommanager.test.ts`
Expected: FAIL

- [ ] **Step 3: Update RoomManager**

```typescript
import { GAME_MODES, DUEL_MODE } from '@arena/shared';
import type { GameModeType } from '@arena/shared';

// ...

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(modeType: GameModeType = '1v1'): Room {
    const id = Math.random().toString(36).slice(2, 8);
    const mode = GAME_MODES[modeType] ?? DUEL_MODE;
    const room = new Room(id, mode);
    this.rooms.set(id, room);
    return room;
  }

  // getRoom, deleteRoom, findPausedMatchForUser stay the same

  listOpenRooms(): OpenRoomInfo[] {
    const result: OpenRoomInfo[] = [];
    for (const room of this.rooms.values()) {
      if (room.players.size > 0 && !room.isFull && room.state === null) {
        result.push({
          roomId: room.id,
          creatorName: room.creatorName,
          playerCount: room.players.size,
          maxPlayers: room.mode.maxPlayers,
          mode: room.mode.type,
        });
      }
    }
    return result;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && npx vitest run tests/roommanager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/rooms/RoomManager.ts server/tests/roommanager.test.ts
git commit -m "feat: make RoomManager create rooms with configurable game mode"
```

---

### Task 6: Update Server Socket Handlers

**Files:**
- Modify: `server/src/index.ts` — accept mode on room creation, team on join, mode-aware disconnect

- [ ] **Step 1: Update POST /rooms to accept mode**

In `server/src/index.ts`, change the POST /rooms handler (lines 18-21):

```typescript
app.post('/rooms', (req, res) => {
  const mode = (req.body?.mode as GameModeType) ?? '1v1';
  const room = roomManager.createRoom(mode);
  res.json({ roomId: room.id, mode });
});
```

Add `express.json()` middleware if not already present (check line ~17 area):

```typescript
app.use(express.json());
```

Add `GameModeType` to imports from `@arena/shared`.

- [ ] **Step 2: Update join-room handler for team assignment**

In the `join-room` socket handler (around line 44-73), update to accept team and use new `addPlayer` return value:

```typescript
socket.on('join-room', async ({ roomId, displayName, accessToken, teamId }: {
  roomId: string; displayName: string; accessToken?: string; teamId?: string;
}) => {
  const room = roomManager.getRoom(roomId);
  if (!room) { socket.emit('room-not-found'); return; }

  const result = room.addPlayer(socket.id, displayName, teamId);
  if (result === 'full') { socket.emit('room-full'); return; }
  if (result === 'team-full') { socket.emit('team-full'); return; }

  // ... skill loading stays the same ...

  socket.join(roomId);
  currentRoomId = roomId;

  socket.emit('room-joined', {
    roomId,
    yourId: socket.id,
    players: Object.fromEntries([...room.players.entries()].map(([id, p]) => [id, p.displayName])),
    mode: room.mode.type,
    teams: Object.fromEntries(room.teamAssignments),
  });
  socket.to(roomId).emit('player-joined', {
    id: socket.id,
    displayName,
    teamId: room.teamAssignments.get(socket.id),
  });
  if (room.isFull) io.to(roomId).emit('game-ready');
});
```

- [ ] **Step 3: Update player-ready to call startMatch**

In the `player-ready` handler (around line 91-117), rename `startDuel()` to `startMatch()`:

```typescript
    if (room.allReady) {
      room.startMatch();
      // ... rest stays the same
    }
```

- [ ] **Step 4: Update duel-ended handler for team-based wins**

In the game loop callback where `duel-ended` is emitted (around line 108-113), update credit logic:

```typescript
        if (state.phase === 'ended') {
          io.to(roomId).emit('duel-ended', {
            winnerId: state.winner,
            gameMode: state.gameMode,
          });
          for (const [socketId, userId] of room.userIds.entries()) {
            let won: boolean;
            if (state.gameMode === '2v2') {
              const playerTeam = room.teamAssignments.get(socketId);
              won = state.winner === playerTeam;
            } else {
              won = state.winner === socketId;
            }
            creditMatchResult(userId, won).catch(console.error);
          }
        }
```

- [ ] **Step 5: Update disconnect handler for mode-aware pausing**

In the `disconnect` handler (around lines 135-194), add mode awareness. For FFA and 2v2, don't pause — set a timeout to eliminate the disconnected player:

After the check `if (room.state && room.state.phase !== 'ended')`, branch on mode:

```typescript
      if (room.mode.type === '1v1') {
        // Existing pause logic — keep as-is
        // ...
      } else {
        // FFA / 2v2: don't pause, start elimination timer
        const timer = setTimeout(() => {
          if (room.state && room.state.players[socket.id]) {
            room.state.players[socket.id].hp = 0;
          }
          pauseTimers.delete(roomId);
        }, DISCONNECT_TIMEOUT_MS);
        pauseTimers.set(`${roomId}:${socket.id}`, timer);
      }
```

Add `DISCONNECT_TIMEOUT_MS` to imports from `@arena/shared`.

- [ ] **Step 6: Run full test suite**

Run: `cd server && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: update socket handlers for mode selection, team joining, and mode-aware disconnect"
```

---

### Task 7: Update Client Lobby UI

**Files:**
- Modify: `client/src/lobby/LobbyUI.ts` — enable mode selector, add team picker for 2v2
- Modify: `client/src/main.ts` — pass mode to server on room creation, handle team selection

- [ ] **Step 1: Enable mode selector buttons in LobbyUI**

In `client/src/lobby/LobbyUI.ts`, the mode grid already exists (lines 240-246) with locked classes. Update to make 1v1, FFA, and 2v2 clickable (remove 3v3 since it's not supported). Replace the mode grid HTML:

```typescript
<div class="bm-label">Game Mode</div>
<div class="bm-mode-grid" id="mode-grid">
  <div class="bm-mode active" data-mode="1v1"><span class="bm-mode-label">1v1</span><span class="bm-mode-desc">Duel · 2 players</span></div>
  <div class="bm-mode" data-mode="ffa"><span class="bm-mode-label">FFA</span><span class="bm-mode-desc">Free-for-All · 4p</span></div>
  <div class="bm-mode" data-mode="2v2"><span class="bm-mode-label">2v2</span><span class="bm-mode-desc">Teams · 4 players</span></div>
</div>
```

Add click handlers after the mode grid is rendered:

```typescript
const modeGrid = root.querySelector('#mode-grid')!;
let selectedMode = '1v1';
modeGrid.querySelectorAll('.bm-mode').forEach(el => {
  el.addEventListener('click', () => {
    modeGrid.querySelectorAll('.bm-mode').forEach(m => m.classList.remove('active'));
    el.classList.add('active');
    selectedMode = (el as HTMLElement).dataset.mode!;
  });
});
```

- [ ] **Step 2: Update LobbyCallbacks to include mode**

```typescript
export type LobbyCallbacks = {
  onCreateRoom: (displayName: string, mode: string) => void;
  onJoinRoom: (roomId: string, displayName: string, teamId?: string) => void;
  // ... rest stays the same
};
```

Update the "Create Room" button click handler to pass mode:

```typescript
callbacks.onCreateRoom(displayName, selectedMode);
```

- [ ] **Step 3: Add team picker for 2v2 rooms**

In `renderLobby` (lines 442-523), update the lobby subtitle to show mode:

Replace the hardcoded `⚔ Lobby — 1v1 Duel` (line 472) with a dynamic value. Pass mode info into `renderLobby`:

```typescript
renderLobby(players: Record<string, string>, myId: string, roomId: string, mode: string): void {
```

Update subtitle:
```typescript
const modeLabels: Record<string, string> = { '1v1': '1v1 Duel', 'ffa': 'Free-For-All', '2v2': '2v2 Teams' };
const subtitle = `⚔ Lobby — ${modeLabels[mode] ?? mode}`;
```

For 2v2, add team selection UI in the lobby before the ready button. Show two team columns with player names:

```typescript
if (mode === '2v2') {
  const teamPicker = document.createElement('div');
  teamPicker.className = 'bm-team-picker';
  teamPicker.innerHTML = `
    <div class="bm-team" data-team="team1">
      <div class="bm-team-header" style="color:#4a9eff">Team 1</div>
      <div class="bm-team-slots" id="team1-slots"></div>
    </div>
    <div class="bm-team" data-team="team2">
      <div class="bm-team-header" style="color:#ff4a4a">Team 2</div>
      <div class="bm-team-slots" id="team2-slots"></div>
    </div>
  `;
  lobbyEl.appendChild(teamPicker);

  // Populate slots from the teams record passed with room-joined
  for (const [playerId, name] of Object.entries(players)) {
    const teamId = teams?.[playerId] ?? 'team1';
    const slot = document.createElement('div');
    slot.className = 'bm-team-slot';
    slot.textContent = name;
    document.getElementById(`${teamId}-slots`)?.appendChild(slot);
  }
}
```

Add CSS for `.bm-team-picker` — flex row with two equal columns, `.bm-team` styled as bordered panels with team color accent.

- [ ] **Step 4: Update slot rendering for 4-player lobbies**

In `renderLobby`, the slot rendering (lines 448-462) currently renders exactly 2 slots. Update to render `maxPlayers` slots based on mode:

```typescript
const maxPlayers = mode === '1v1' ? 2 : 4;
for (let i = 0; i < maxPlayers; i++) {
  // ... render slot
}
```

- [ ] **Step 5: Update showResult for mode-aware messaging**

In `showResult` (lines 303-317), update to handle FFA placement and team wins:

```typescript
showResult(won: boolean, mode: string, placement?: number): void {
  let title: string;
  let color: string;
  if (won) {
    title = mode === '2v2' ? 'Your Team Wins!' : 'Victory!';
    color = '#c8a000';
  } else if (mode === 'ffa' && placement) {
    const ordinal = placement === 2 ? '2nd' : placement === 3 ? '3rd' : `${placement}th`;
    title = `Defeated — ${ordinal} place`;
    color = '#c00030';
  } else if (mode === '2v2') {
    title = 'Your Team Loses!';
    color = '#c00030';
  } else {
    title = 'Defeat';
    color = '#c00030';
  }
  // Render title with color, show rematch/return buttons
  this.root.innerHTML = `
    <div class="bm-result" style="color:${color}"><h2>${title}</h2></div>
    <button id="btn-rematch">Rematch</button>
    <button id="btn-return">Return to Lobby</button>
  `;
  // Wire up rematch/return button handlers as before
}
```

- [ ] **Step 6: Update room list to show mode badges**

In the polling section (lines 407-440) where open rooms are listed, add mode badge to each room entry:

```typescript
// In the room list HTML, add mode badge:
<span class="bm-mode-badge">${room.mode}</span>
```

- [ ] **Step 7: Commit**

```bash
git add client/src/lobby/LobbyUI.ts
git commit -m "feat: add mode selector, team picker, and mode-aware lobby UI"
```

---

### Task 8: Update Client Main Entry Point

**Files:**
- Modify: `client/src/main.ts` — pass mode to server, handle 4-player colors, update result handling

- [ ] **Step 1: Add 4-player color palette**

In `client/src/main.ts`, replace the 2-color palette (line 52) with 4 colors:

```typescript
const PLAYER_COLORS: Record<number, number> = {
  0: 0xc8a000,  // gold
  1: 0xc00030,  // red
  2: 0x0080c0,  // blue
  3: 0x00a040,  // green
};
```

- [ ] **Step 2: Track current mode and all players**

Replace `let opponentName = ''` (line 34) with:

```typescript
let currentMode: string = '1v1';
let allPlayerNames: Record<string, string> = {};
```

- [ ] **Step 3: Update onCreateRoom to pass mode**

In the `onCreateRoom` callback (lines 129-145), update the fetch call:

```typescript
onCreateRoom: async (displayName, mode) => {
  myDisplayName = displayName;
  currentMode = mode;
  const res = await fetch('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const { roomId } = await res.json();
  // ... rest stays the same
},
```

- [ ] **Step 4: Update onJoinRoom to handle mode from server**

In the `onJoinRoom` callback (lines 146-167), read mode from the `room-joined` response:

```typescript
socket.onRoomJoined(({ yourId, players, mode, teams }) => {
  myId = yourId;
  currentRoomId = roomId;
  currentPlayers = players;
  currentMode = mode;
  allPlayerNames = players;
  // ... color index assignment needs updating for 4 players
  myColorIndex = Object.keys(players).indexOf(yourId);
  hud.init(myId);
  // ... lobby rendering
});
```

- [ ] **Step 5: Fix character mesh color assignment for 4 players**

Replace the hardcoded 2-color flip (line 351):

```typescript
const colorIndex = id === myId ? myColorIndex : 1 - myColorIndex;
```

With:

```typescript
const playerIds = Object.keys(state.players);
const colorIndex = playerIds.indexOf(id) % Object.keys(PLAYER_COLORS).length;
```

This assigns colors consistently by player order in the state.

- [ ] **Step 6: Update duel-ended handler for mode-aware results**

In the `onDuelEnded` handler (around line 238-294), update result display:

```typescript
socket.onDuelEnded(({ winnerId, gameMode }) => {
  duelEnded = true;
  let won: boolean;
  if (gameMode === '2v2') {
    // winnerId is a teamId — check if local player is on that team
    // Need to track local player's teamId from room-joined
    won = winnerId === myTeamId;
  } else {
    won = winnerId === myId;
  }
  lobby.hidePauseOverlay();
  stopGame();
  lobby.showResult(won, '', gameMode);
  lobby.show();
});
```

Add `let myTeamId: string | undefined;` to the top-level variables and set it from `room-joined` response.

For FFA placement, track death order during the game loop. Add to top-level variables:

```typescript
let deathOrder: string[] = [];
```

In the render loop where `state` is received, check for newly dead players each frame:

```typescript
for (const [id, player] of Object.entries(state.players)) {
  if (player.hp <= 0 && !deathOrder.includes(id)) {
    deathOrder.push(id);
  }
}
```

When the match ends, compute placement from `deathOrder`:

```typescript
// In duel-ended handler:
if (gameMode === 'ffa' && !won) {
  const myDeathIndex = deathOrder.indexOf(myId);
  const totalPlayers = Object.keys(state.players).length;
  const placement = myDeathIndex >= 0 ? totalPlayers - myDeathIndex : 1;
  lobby.showResult(won, gameMode, placement);
} else {
  lobby.showResult(won, gameMode);
}
```

Reset `deathOrder = []` in the `stopGame()` function.

- [ ] **Step 7: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: update client for 4-player colors, mode passing, and team-aware results"
```

---

### Task 9: Update HUD for Multiple Players

**Files:**
- Modify: `client/src/hud/HUD.ts` — show HP bars for all opponents, team grouping

- [ ] **Step 1: Replace single-enemy HP bar with multi-player bars**

In `client/src/hud/HUD.ts`, the `update` method (lines 58-84) currently finds one enemy. Replace the enemy section (lines 75-82):

```typescript
// Remove old single-enemy logic and replace with:
const enemies = Object.entries(state.players).filter(([id]) => id !== this.myId);
const enemyContainer = this.el.querySelector('#hud-enemies')!;
enemyContainer.innerHTML = '';
for (const [id, enemy] of enemies) {
  const bar = document.createElement('div');
  bar.className = 'enemy-bar';
  bar.innerHTML = `
    <span class="enemy-name">${enemy.displayName}</span>
    <div class="enemy-hp-track"><div class="enemy-hp-fill" style="width:${(enemy.hp / MAX_HP) * 100}%"></div></div>
  `;
  if (enemy.hp <= 0) bar.classList.add('dead');
  enemyContainer.appendChild(bar);
}
```

- [ ] **Step 2: Update constructor HTML**

In the constructor, replace the single enemy bar HTML with a container:

```html
<div id="hud-enemies" class="hud-enemies"></div>
```

Add CSS for the enemy bars container — style to show bars stacked vertically in the top-right area. For 2v2, add a team label/color indicator.

- [ ] **Step 3: Add death notifications**

Add a `showElimination(name: string)` method to HUD that displays a brief notification:

```typescript
showElimination(name: string): void {
  const note = document.createElement('div');
  note.className = 'elimination-notice';
  note.textContent = `${name} was eliminated`;
  this.el.appendChild(note);
  setTimeout(() => note.remove(), 3000);
}
```

Add CSS for `.elimination-notice` — centered, semi-transparent dark background, white text, fade-out animation.

In `update()`, track previously alive players and call `showElimination` when a player's HP transitions to 0:

```typescript
for (const [id, player] of Object.entries(state.players)) {
  if (id === this.myId) continue;
  const wasAlive = this.prevHp.get(id) ?? MAX_HP;
  if (wasAlive > 0 && player.hp <= 0) {
    this.showElimination(player.displayName);
  }
  this.prevHp.set(id, player.hp);
}
```

Add `private prevHp: Map<string, number> = new Map();` to the class fields.

- [ ] **Step 4: Update minimap for multiple players**

In the minimap update call, pass all enemies instead of one:

```typescript
const enemies = Object.values(state.players).filter(p => p.id !== this.myId);
this.minimap.update(me, enemies);
```

This requires updating the `Minimap` class to accept an array. Check the Minimap implementation and update its `update` method signature from `(me, enemy?)` to `(me, enemies: PlayerState[])`.

- [ ] **Step 4: Commit**

```bash
git add client/src/hud/HUD.ts
git commit -m "feat: update HUD to show HP bars for all players and multi-player minimap"
```

---

### Task 10: Update Socket Client for New Events

**Files:**
- Check and modify: `client/src/net/SocketClient.ts` (or wherever socket events are defined) — add `team-full` event, update `room-joined` payload, update `duel-ended` payload

- [ ] **Step 1: Find and update socket client**

Locate the socket client file and add:
- Handler for `team-full` event
- Updated `room-joined` payload type to include `mode` and `teams`
- Updated `duel-ended` payload type to include `gameMode`
- New `joinRoom` method signature to include optional `teamId`

```typescript
joinRoom(roomId: string, displayName: string, accessToken: string, teamId?: string): void {
  this.socket.emit('join-room', { roomId, displayName, accessToken, teamId });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/net/SocketClient.ts
git commit -m "feat: update socket client for mode and team events"
```

---

### Task 11: Integration Testing and Final Verification

**Files:**
- All test files

- [ ] **Step 1: Run full server test suite**

Run: `cd server && npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Fix any regressions**

The new `gameMode` field on `GameState` and `teamId` on `PlayerState` may cause snapshot or equality mismatches in existing tests. Update any affected assertions.

- [ ] **Step 3: Start the dev servers and test manually**

Run: `npm run dev` (or however the dev server starts)

Test the following scenarios in the browser:

1. **1v1 mode:** Create a 1v1 room, join with a second browser tab, play a match — should work exactly as before
2. **FFA mode:** Create an FFA room, join with 3 more tabs, verify all 4 can fight and last standing wins
3. **2v2 mode:** Create a 2v2 room, join 4 players picking teams, verify team assignment, friendly fire deals half damage, team elimination wins

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for multi-mode support"
```

- [ ] **Step 5: Final full test run**

Run: `cd server && npx vitest run`
Expected: ALL PASS
