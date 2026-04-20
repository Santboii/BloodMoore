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
