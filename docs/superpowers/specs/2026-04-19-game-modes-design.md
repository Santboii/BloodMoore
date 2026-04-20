# Game Modes Design: FFA & 2v2

## Overview

Add Free-For-All (FFA) and 2v2 Team modes alongside the existing 1v1 Duel mode. All three modes share the same arena, combat system, and spell mechanics — they differ only in player count, team structure, friendly fire rules, and win conditions.

## Architecture: Mode Config Objects

Each game mode is defined as a plain config object in `shared/src/`. This follows the existing pattern used for `SPELL_CONFIG` and game constants.

### GameModeType

```typescript
type GameModeType = '1v1' | 'ffa' | '2v2';
```

### GameModeConfig Interface

```typescript
interface GameModeConfig {
  type: GameModeType;
  label: string;                    // Display name: "1v1 Duel", "Free-For-All", "2v2 Teams"
  maxPlayers: number;               // 2, 4, 4
  teamsEnabled: boolean;
  teamCount?: number;               // undefined for 1v1/FFA, 2 for 2v2
  playersPerTeam?: number;          // undefined for 1v1/FFA, 2 for 2v2
  friendlyFireMultiplier: number;   // 1.0 for 1v1/FFA, 0.5 for 2v2
  spawnPositions: Vec2[];           // 2 for 1v1, 4 for FFA/2v2
  checkWinCondition(players: Record<string, PlayerState>): {
    phase: 'dueling' | 'ended';
    winner: string | null;          // playerId (1v1/FFA) or teamId (2v2), null = tie
  };
}
```

### Mode Definitions

Three const config objects: `DUEL_MODE`, `FFA_MODE`, `TEAM_DUEL_MODE`.

A lookup map `GAME_MODES: Record<GameModeType, GameModeConfig>` provides access by type string.

### Spawn Positions

The existing 2 spawn positions are kept. Two additional positions are added (e.g. upper-left and lower-right quadrants of the current arena). Each mode references a subset:
- 1v1: positions 0, 1 (left, right — current behavior)
- FFA: all 4 positions
- 2v2: positions 0,1 for Team 1; positions 2,3 for Team 2 (teammates spawn adjacent)

Arena size (`ARENA_SIZE`) remains unchanged.

## Type Extensions

### PlayerState

Add optional field:
- `teamId?: string` — set for 2v2 mode, undefined otherwise

### GameState

Add fields:
- `gameMode: GameModeType` — which mode is active
- `teams?: Record<string, string[]>` — teamId to array of playerIds (2v2 only)

## Room & Lobby

### Room Creation

- `RoomManager.createRoom()` accepts a `GameModeType` parameter
- Room stores the resolved `GameModeConfig` and uses `config.maxPlayers` for `isFull` instead of hardcoded `2`
- `OpenRoomInfo.mode` carries the actual `GameModeType` value

### Team Assignment (2v2)

- Player sends preferred team (`'team1'` or `'team2'`) when joining a 2v2 room
- Room validates the team is not full (`playersPerTeam` cap) and assigns
- If the team is full, server emits `'team-full'` event
- For 1v1 and FFA, no team selection occurs

### Lobby UI

- Mode selector (three buttons/cards for 1v1, FFA, 2v2) appears before "Create Room"
- Mode is set at room creation and cannot be changed afterward
- Room list shows mode as a badge on each room entry
- When joining a 2v2 room, a team picker shows which players are on each team
- For 1v1/FFA, players join directly without team selection

### Ready & Start

- All players must ready up (same as today)
- `startMatch()` (renamed from `startDuel()`) maps players to spawn positions using the mode config's `spawnPositions` array
- For 2v2, teammates get adjacent spawn positions

## Combat

### Friendly Fire

When a projectile/spell deals damage, check if the caster and target share a `teamId`:
- Same team: multiply damage by `config.friendlyFireMultiplier` (0.5 for 2v2)
- Different teams or no teams: full damage

This applies to all damage sources: projectiles, Fire Wall ticks, Meteor detonation.

No changes to spell casting, mana, cooldowns, skill gating, movement, collision detection, or projectile physics — these are all mode-agnostic.

### Win Conditions

Each mode's `checkWinCondition()` function:

**1v1 (DUEL_MODE):** If one player has `hp <= 0`, the other wins. Both dead on same tick = tie.

**FFA (FFA_MODE):** Last player standing. If exactly one player has `hp > 0`, they win. If all remaining players die on the same tick, tie.

**2v2 (TEAM_DUEL_MODE):** If all players on a team have `hp <= 0`, that team is eliminated. The surviving team's `teamId` is the winner. Both teams fully eliminated on the same tick = tie.

### Winner Field Semantics

- 1v1 and FFA: `winner` is a `playerId` string or `null`
- 2v2: `winner` is a `teamId` string (e.g. `'team1'`) or `null`
- Client uses `gameMode` from `GameState` to interpret whether `winner` refers to a player or a team

## Client HUD & Post-Match

### In-Match HUD

- 4-player modes show all 4 HP/mana bars
- 2v2: bars grouped by team, visually distinguished with team colors (e.g. blue tones vs red tones)
- FFA: all 4 bars shown individually with per-player colors
- Local player's bar stays prominent in the same position as today

### Death Notifications

- Brief notification when a player dies (e.g. "PlayerName was eliminated")
- 2v2 adds teammate-specific callout if applicable

### Post-Match Screen

- 1v1: unchanged — "You Win" / "You Lose" / "Draw"
- FFA: "Victory!" for last standing, "Defeated" with placement (based on death order), or "Draw"
- 2v2: "Your Team Wins!" / "Your Team Loses!" / "Draw"
- Rematch button works the same — all players must agree

### Spectating on Death

When a player dies while the match continues (FFA/2v2), their camera stays in the arena. Character is frozen, client keeps receiving state updates. No special spectator controls needed.

## Disconnect/Rejoin

Behavior varies by mode:

**1v1:** Keep current behavior — pause match, wait for rejoin.

**FFA and 2v2:** Do not pause the match. Disconnected player's character stands idle (no inputs, takes damage normally). If they rejoin within a timeout, they resume control. If timeout expires, they are eliminated. The timeout duration is a shared constant `DISCONNECT_TIMEOUT_MS` in `shared/src/types.ts` (default: 30000ms).

### Edge Cases

- **Not enough players:** Room requires exactly `maxPlayers` before `game-ready` fires. No partial starts.
- **Everyone disconnects (FFA/2v2):** Match ends with no winner.
- **Simultaneous deaths:** Handled per-tick — if all remaining players/teams die on the same tick, it's a tie.
- **Player leaves lobby:** Remove from room, free team slot (2v2). Room returns to waiting state.

## Files to Change

### Shared
- `shared/src/types.ts` — Add `GameModeType`, `GameModeConfig` interface, extend `PlayerState` with `teamId`, extend `GameState` with `gameMode` and `teams`
- New file: `shared/src/gameModes.ts` — `DUEL_MODE`, `FFA_MODE`, `TEAM_DUEL_MODE` config objects, `GAME_MODES` lookup map, expanded spawn positions

### Server
- `server/src/rooms/Room.ts` — Accept mode config, replace hardcoded `maxPlayers: 2`, add team assignment, rename `startDuel` to `startMatch`
- `server/src/rooms/RoomManager.ts` — Accept `GameModeType` in `createRoom()`, pass config to Room
- `server/src/gameloop/StateAdvancer.ts` — Replace hardcoded win condition with `config.checkWinCondition()`, add friendly fire multiplier to damage calculation
- `server/src/index.ts` — Accept mode from client on room creation, pass to RoomManager. Update join-room handler for team assignment. Update disconnect handling per mode.

### Client
- `client/src/lobby/LobbyUI.ts` — Add mode selector before room creation, team picker for 2v2, mode badges on room list
- `client/src/main.ts` — Pass selected mode to server on room creation
- `client/src/hud/HUD.ts` — Support 4-player HP/mana display, team grouping for 2v2
- Post-match UI — Mode-aware win/lose/draw messaging, FFA placement
