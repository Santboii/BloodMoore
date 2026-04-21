import { Vec2, movePlayer } from '@arena/shared';

type BufferedInput = {
  seq: number;
  move: Vec2;
};

const MAX_BUFFER_SIZE = 30;
const RECONCILE_TOLERANCE = 0.5;
const CORRECTION_DURATION_MS = 100;

export class Predictor {
  private position: Vec2;
  private seq = 0;
  private buffer: BufferedInput[] = [];
  private correctionOffset: Vec2 = { x: 0, y: 0 };
  private correctionStartTime = 0;
  private correctionDurationMs = CORRECTION_DURATION_MS;

  constructor(initialPosition: Vec2) {
    this.position = { ...initialPosition };
  }

  applyInput(move: Vec2, _tick: number): number {
    this.seq++;
    this.position = movePlayer(this.position, move);
    this.buffer.push({ seq: this.seq, move });
    return this.seq;
  }

  reconcile(serverPosition: Vec2, ackSeq: number): void {
    this.buffer = this.buffer.filter(b => b.seq > ackSeq);

    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.position = { ...serverPosition };
      this.buffer = [];
      this.correctionOffset = { x: 0, y: 0 };
      return;
    }

    let replayPos = { ...serverPosition };
    for (const input of this.buffer) {
      replayPos = movePlayer(replayPos, input.move);
    }

    const dx = replayPos.x - this.position.x;
    const dy = replayPos.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > RECONCILE_TOLERANCE) {
      this.correctionOffset = {
        x: this.position.x - replayPos.x,
        y: this.position.y - replayPos.y,
      };
      this.correctionStartTime = performance.now();
      this.position = replayPos;
    }
  }

  getPosition(now = performance.now()): Vec2 {
    if (this.correctionOffset.x === 0 && this.correctionOffset.y === 0) {
      return { ...this.position };
    }
    const elapsed = now - this.correctionStartTime;
    const t = Math.min(1, elapsed / this.correctionDurationMs);
    const remaining = 1 - t;
    return {
      x: this.position.x + this.correctionOffset.x * remaining,
      y: this.position.y + this.correctionOffset.y * remaining,
    };
  }

  reset(position: Vec2): void {
    this.position = { ...position };
    this.buffer = [];
    this.seq = 0;
    this.correctionOffset = { x: 0, y: 0 };
  }

  getSeq(): number {
    return this.seq;
  }
}
