import { GameState, PlayerState, Vec2 } from '@arena/shared';

type TimestampedSnapshot = {
  state: GameState;
  receivedAt: number;
};

export class StateBuffer {
  private snapshots: TimestampedSnapshot[] = [];
  private readonly maxSnapshots = 20;
  private renderDelayMs = 33.33;
  private avgInterval = 16.67;
  private jitterVariance = 0;
  private lastArrival = 0;

  push(state: GameState, now = performance.now()): void {
    if (this.lastArrival > 0 && this.snapshots.length > 0) {
      const interval = now - this.lastArrival;
      this.avgInterval = this.avgInterval * 0.9 + interval * 0.1;
      const jitter = Math.abs(interval - this.avgInterval);
      this.jitterVariance = this.jitterVariance * 0.9 + jitter * 0.1;
      this.renderDelayMs = this.avgInterval * 2 + this.jitterVariance * 2;
    }
    this.lastArrival = now;
    this.snapshots.push({ state, receivedAt: now });
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  getInterpolated(now = performance.now()): GameState | null {
    if (this.snapshots.length < 2) return null;

    const renderTime = now - this.renderDelayMs;

    let i = 0;
    for (; i < this.snapshots.length - 1; i++) {
      if (this.snapshots[i + 1].receivedAt >= renderTime) break;
    }
    i = Math.max(0, Math.min(i, this.snapshots.length - 2));

    const a = this.snapshots[i];
    const b = this.snapshots[i + 1];

    const span = b.receivedAt - a.receivedAt;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.receivedAt) / span)) : 1;

    const players: Record<string, PlayerState> = {};
    for (const id of Object.keys(b.state.players)) {
      const pa = a.state.players[id];
      const pb = b.state.players[id];
      if (!pa) {
        players[id] = pb;
        continue;
      }
      players[id] = {
        ...pb,
        position: lerpVec2(pa.position, pb.position, t),
        facing: lerpAngle(pa.facing, pb.facing, t),
      };
    }

    return { ...b.state, players };
  }

  getLatest(): GameState | null {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.snapshots.length - 1].state;
  }

  clear(): void {
    this.snapshots = [];
    this.lastArrival = 0;
    this.renderDelayMs = 33.33;
    this.avgInterval = 16.67;
    this.jitterVariance = 0;
  }
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}
