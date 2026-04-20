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
    state.players['p2'].position = { x: 210, y: 1000 };
    state.projectiles.push({
      id: 'fb1', ownerId: 'p1', type: 'fireball',
      position: { x: 210, y: 1000 }, velocity: { x: 400, y: 0 },
    });
    const inputs = { p1: idleInput, p2: idleInput, p3: idleInput, p4: idleInput };
    const next = advanceState(state, inputs, {}, TEAM_DUEL_MODE);
    const dmg = MAX_HP - next.players['p2'].hp;
    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThan(MAX_HP * 0.6);
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
