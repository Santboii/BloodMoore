import { describe, it, expect, beforeEach } from 'vitest';
import { StateBuffer } from '../src/network/StateBuffer';
import { GameState, PlayerState } from '@arena/shared';

function makeState(tick: number, px: number, py: number, id = 'p1'): GameState {
  const player: PlayerState = {
    id, displayName: 'Test', position: { x: px, y: py },
    hp: 750, mana: 500, facing: 0, castingSpell: null, cooldowns: {},
  };
  return {
    tick, players: { [id]: player }, projectiles: [], fireWalls: [],
    meteors: [], phase: 'dueling', winner: null, gameMode: '1v1',
  };
}

describe('StateBuffer time-based interpolation', () => {
  let buffer: StateBuffer;

  beforeEach(() => {
    buffer = new StateBuffer();
  });

  it('returns null with fewer than 2 snapshots', () => {
    expect(buffer.getInterpolated(1000)).toBeNull();
    buffer.push(makeState(1, 100, 100), 1000);
    expect(buffer.getInterpolated(1000)).toBeNull();
  });

  it('interpolates between two snapshots based on time', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    buffer.push(makeState(3, 300, 300), 1033.33);
    const state = buffer.getInterpolated(1033.33);
    expect(state).not.toBeNull();
    const pos = state!.players['p1'].position;
    expect(pos.x).toBeGreaterThanOrEqual(100);
    expect(pos.x).toBeLessThanOrEqual(200);
  });

  it('clamps to latest available snapshot when renderTime is ahead', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    const state = buffer.getInterpolated(5000);
    expect(state).not.toBeNull();
    expect(state!.players['p1'].position.x).toBe(200);
  });

  it('clamps to earliest available snapshot when renderTime is behind', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    const state = buffer.getInterpolated(500);
    expect(state).not.toBeNull();
    expect(state!.players['p1'].position.x).toBe(100);
  });

  it('handles player joining mid-game', () => {
    buffer.push(makeState(1, 100, 100, 'p1'), 1000);
    const s2 = makeState(2, 200, 200, 'p1');
    s2.players['p2'] = {
      id: 'p2', displayName: 'New', position: { x: 500, y: 500 },
      hp: 750, mana: 500, facing: 0, castingSpell: null, cooldowns: {},
    };
    buffer.push(s2, 1016.67);
    const state = buffer.getInterpolated(1016.67);
    expect(state).not.toBeNull();
    expect(state!.players['p2'].position.x).toBe(500);
  });

  it('interpolates facing angle', () => {
    const s1 = makeState(1, 100, 100);
    s1.players['p1'].facing = 0;
    const s2 = makeState(2, 200, 200);
    s2.players['p1'].facing = Math.PI;
    buffer.push(s1, 1000);
    buffer.push(s2, 1016.67);
    buffer.push(makeState(3, 300, 300), 1033.33);
    // renderDelay starts at 33.33ms; renderTime = 1041.67 - 33.33 = 1008.34
    // which falls between s1 (1000) and s2 (1016.67), so t ≈ 0.5 → facing ≈ π/2
    const state = buffer.getInterpolated(1041.67);
    expect(state).not.toBeNull();
    expect(state!.players['p1'].facing).toBeGreaterThan(0);
    expect(state!.players['p1'].facing).toBeLessThan(Math.PI);
  });

  it('getLatest returns most recent state', () => {
    expect(buffer.getLatest()).toBeNull();
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    expect(buffer.getLatest()!.tick).toBe(2);
  });

  it('clear resets all state', () => {
    buffer.push(makeState(1, 100, 100), 1000);
    buffer.push(makeState(2, 200, 200), 1016.67);
    buffer.clear();
    expect(buffer.getInterpolated(1020)).toBeNull();
    expect(buffer.getLatest()).toBeNull();
  });
});
