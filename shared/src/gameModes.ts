import type { GameModeConfig, GameModeType, PlayerState } from './types.js';

const SPAWN_POSITIONS_4 = [
  { x: 200,  y: 1000 },
  { x: 1800, y: 1000 },
  { x: 1000, y: 200  },
  { x: 1000, y: 1800 },
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
