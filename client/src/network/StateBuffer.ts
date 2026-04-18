import { GameState, PlayerState, Vec2 } from '@arena/shared';

export class StateBuffer {
  private snapshots: GameState[] = [];
  private readonly maxSnapshots = 10;
  private renderDelay = 2; // render 2 snapshots behind latest

  push(state: GameState): void {
    this.snapshots.push(state);
    if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
  }

  /** Returns interpolated state for rendering. Returns null if not enough data. */
  getInterpolated(): GameState | null {
    if (this.snapshots.length < 2) return this.snapshots[0] ?? null;
    const targetIndex = Math.max(0, this.snapshots.length - 1 - this.renderDelay);
    const a = this.snapshots[Math.max(0, targetIndex - 1)];
    const b = this.snapshots[targetIndex];
    const t = 0.5; // midpoint interpolation

    const players: Record<string, PlayerState> = {};
    for (const id of Object.keys(b.players)) {
      const pa = a.players[id];
      const pb = b.players[id];
      players[id] = {
        ...pb,
        position: pa ? lerpVec2(pa.position, pb.position, t) : pb.position,
      };
    }

    return { ...b, players };
  }

  clear(): void { this.snapshots = []; }
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
