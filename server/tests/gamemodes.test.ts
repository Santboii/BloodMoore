import { describe, it, expect } from 'vitest';
import { GAME_MODES, DUEL_MODE, FFA_MODE, TEAM_DUEL_MODE, MAX_HP } from '@arena/shared';
import type { GameModeType } from '@arena/shared';

function makePlayer(id: string, hp: number, teamId?: string) {
  return {
    id, displayName: id, position: { x: 0, y: 0 },
    hp, mana: 300, facing: 0, castingSpell: null,
    cooldowns: {}, teamId,
  } as const;
}

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

describe('duelWinCondition', () => {
  it('returns dueling when both players alive', () => {
    const players = { p1: makePlayer('p1', MAX_HP), p2: makePlayer('p2', MAX_HP) };
    const result = DUEL_MODE.checkWinCondition(players);
    expect(result.phase).toBe('dueling');
    expect(result.winner).toBeNull();
  });

  it('returns winner when one player dies', () => {
    const players = { p1: makePlayer('p1', MAX_HP), p2: makePlayer('p2', 0) };
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
      p1: makePlayer('p1', MAX_HP), p2: makePlayer('p2', MAX_HP),
      p3: makePlayer('p3', MAX_HP), p4: makePlayer('p4', MAX_HP),
    };
    const result = FFA_MODE.checkWinCondition(players);
    expect(result.phase).toBe('dueling');
  });

  it('returns dueling when 2 of 4 alive', () => {
    const players = {
      p1: makePlayer('p1', MAX_HP), p2: makePlayer('p2', 0),
      p3: makePlayer('p3', MAX_HP), p4: makePlayer('p4', 0),
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
      p1: makePlayer('p1', MAX_HP, 'team1'), p2: makePlayer('p2', 0, 'team1'),
      p3: makePlayer('p3', MAX_HP, 'team2'), p4: makePlayer('p4', 0, 'team2'),
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
