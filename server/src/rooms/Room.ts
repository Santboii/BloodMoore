import { GameState, InputFrame, SPAWN_POSITIONS, NodeId, DUEL_MODE } from '@arena/shared';
import type { GameModeConfig } from '@arena/shared';
import { makeInitialState, advanceState, PlayerInit } from '../gameloop/StateAdvancer.ts';

export type RoomPlayer = { socketId: string; displayName: string; ready: boolean; colorIndex: number };

export type PauseState = {
  disconnectedUserIds: Set<string>;
  pausedAt: number; // Date.now() timestamp
};

export class Room {
  readonly id: string;
  readonly mode: GameModeConfig;
  creatorName: string = '';
  players: Map<string, RoomPlayer> = new Map(); // socketId -> RoomPlayer
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
  get canStart(): boolean { return this.players.size >= this.mode.minPlayers && [...this.players.values()].every(p => p.ready); }
  get allReady(): boolean { return this.canStart; }

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
    this.teamAssignments.delete(socketId);
    this.skillSets.delete(socketId);
    this.userIds.delete(socketId);
  }

  setReady(socketId: string): void {
    const p = this.players.get(socketId);
    if (p) p.ready = true;
  }

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

  queueInput(socketId: string, input: InputFrame): void {
    const existing = this.pendingInputs.get(socketId);
    if (existing?.castSpell && !input.castSpell) {
      input = { ...input, castSpell: existing.castSpell, aimTarget: existing.aimTarget };
    }
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
    this.state = advanceState(this.state, inputs, skillSetsObj, this.mode);
    for (const [id, pending] of this.pendingInputs) {
      if (pending.castSpell) {
        this.pendingInputs.set(id, { ...pending, castSpell: null });
      }
    }
    return this.state;
  }

  reset(): void {
    for (const p of this.players.values()) p.ready = false;
    this.state = null;
    this.pauseState = null;
    this.pendingInputs.clear();
  }

  pause(userId: string): void {
    if (!this.pauseState) {
      this.pauseState = {
        disconnectedUserIds: new Set([userId]),
        pausedAt: Date.now(),
      };
    } else {
      this.pauseState.disconnectedUserIds.add(userId);
    }
  }

  resume(userId: string): void {
    if (!this.pauseState) return;
    this.pauseState.disconnectedUserIds.delete(userId);
    if (this.pauseState.disconnectedUserIds.size === 0) {
      this.pauseState = null;
    }
  }

  remapPlayer(oldSocketId: string, newSocketId: string): void {
    // Remap players
    const player = this.players.get(oldSocketId);
    if (player) {
      this.players.delete(oldSocketId);
      player.socketId = newSocketId;
      this.players.set(newSocketId, player);
    }

    // Remap userIds
    const userId = this.userIds.get(oldSocketId);
    if (userId !== undefined) {
      this.userIds.delete(oldSocketId);
      this.userIds.set(newSocketId, userId);
    }

    // Remap skillSets
    const skills = this.skillSets.get(oldSocketId);
    if (skills) {
      this.skillSets.delete(oldSocketId);
      this.skillSets.set(newSocketId, skills);
    }

    // Remap teamAssignments
    const team = this.teamAssignments.get(oldSocketId);
    if (team !== undefined) {
      this.teamAssignments.delete(oldSocketId);
      this.teamAssignments.set(newSocketId, team);
    }

    // Remap pendingInputs
    const input = this.pendingInputs.get(oldSocketId);
    if (input) {
      this.pendingInputs.delete(oldSocketId);
      this.pendingInputs.set(newSocketId, input);
    }

    // Remap player ID in GameState
    if (this.state) {
      const playerState = this.state.players[oldSocketId];
      if (playerState) {
        delete this.state.players[oldSocketId];
        playerState.id = newSocketId;
        this.state.players[newSocketId] = playerState;
      }
    }

    // Remap teams in GameState (2v2)
    if (this.state?.teams) {
      for (const [teamId, members] of Object.entries(this.state.teams)) {
        const idx = members.indexOf(oldSocketId);
        if (idx !== -1) {
          members[idx] = newSocketId;
          break;
        }
      }
    }
  }
}
