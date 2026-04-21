import { describe, it, expect, beforeEach } from 'vitest';
import { Predictor } from '../src/network/Predictor';

describe('Predictor', () => {
  let predictor: Predictor;

  beforeEach(() => {
    predictor = new Predictor({ x: 500, y: 500 });
  });

  it('applies movement input locally', () => {
    predictor.applyInput({ x: 1, y: 0 }, 1);
    const pos = predictor.getPosition();
    expect(pos.x).toBeGreaterThan(500);
    expect(pos.y).toBe(500);
  });

  it('returns sequential sequence numbers', () => {
    const seq1 = predictor.applyInput({ x: 1, y: 0 }, 1);
    const seq2 = predictor.applyInput({ x: 0, y: 1 }, 2);
    expect(seq2).toBe(seq1 + 1);
  });

  it('does not correct when server position matches prediction', () => {
    const seq = predictor.applyInput({ x: 1, y: 0 }, 1);
    const predicted = predictor.getPosition();
    predictor.reconcile(predicted, seq);
    expect(predictor.getPosition().x).toBeCloseTo(predicted.x, 1);
  });

  it('corrects to server position when prediction diverges', () => {
    const seq = predictor.applyInput({ x: 1, y: 0 }, 1);
    const serverPos = { x: 510, y: 500 };
    predictor.reconcile(serverPos, seq);
    // Pass a future timestamp so correction animation is fully elapsed
    const pos = predictor.getPosition(performance.now() + 200);
    expect(pos.x).toBeCloseTo(510, 1);
  });

  it('replays unacknowledged inputs after correction', () => {
    const seq1 = predictor.applyInput({ x: 1, y: 0 }, 1);
    const seq2 = predictor.applyInput({ x: 1, y: 0 }, 2);
    const serverPos = { x: 504, y: 500 };
    predictor.reconcile(serverPos, seq1);
    const pos = predictor.getPosition();
    expect(pos.x).toBeGreaterThan(504);
  });

  it('snaps to server on buffer overflow', () => {
    for (let i = 0; i < 35; i++) {
      predictor.applyInput({ x: 1, y: 0 }, i + 1);
    }
    const serverPos = { x: 600, y: 600 };
    predictor.reconcile(serverPos, 1);
    const pos = predictor.getPosition();
    expect(pos.x).toBeCloseTo(600, 0);
    expect(pos.y).toBeCloseTo(600, 0);
  });

  it('resets clears all state', () => {
    predictor.applyInput({ x: 1, y: 0 }, 1);
    predictor.reset({ x: 200, y: 300 });
    expect(predictor.getPosition()).toEqual({ x: 200, y: 300 });
  });
});
