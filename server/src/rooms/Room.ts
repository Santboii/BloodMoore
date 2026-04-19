import { GameState, InputFrame, SPAWN_POSITIONS, NodeId } from '@arena/shared';
import { makeInitialState, advanceState, PlayerInit } from '../gameloop/StateAdvancer.ts';

export type RoomPlayer = { socketId: string; displayName: string; ready: boolean };

export class Room {
  readonly id: string;
  creatorName: string = '';
  players: Map<string, RoomPlayer> = new Map(); // socketId -> RoomPlayer
  skillSets: Map<string, Set<NodeId>> = new Map();
  userIds: Map<string, string> = new Map();
  state: GameState | null = null;
  private pendingInputs: Map<string, InputFrame> = new Map();

  constructor(id: string) { this.id = id; }

  get isFull(): boolean { return this.players.size === 2; }
  get allReady(): boolean { return this.players.size === 2 && [...this.players.values()].every(p => p.ready); }

  addPlayer(socketId: string, displayName: string): void {
    if (this.isFull) return;
    if (this.players.size === 0) this.creatorName = displayName;
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
