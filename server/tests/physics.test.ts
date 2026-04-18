import { describe, it, expect } from 'vitest';
import { movePlayer, resolvePlayerPillarCollisions } from '../src/physics/Movement.ts';
import { circleHitsAABB, pillarContainsPoint } from '../src/physics/Collision.ts';
import { PILLARS, ARENA_SIZE, PLAYER_HALF_SIZE } from '@arena/shared';

describe('movePlayer', () => {
  it('moves in the given direction scaled by speed and delta', () => {
    const pos = { x: 400, y: 400 };
    const result = movePlayer(pos, { x: 1, y: 0 });
    expect(result.x).toBeCloseTo(400 + 200 / 60, 1);
    expect(result.y).toBe(400);
  });

  it('normalizes diagonal input so diagonal speed equals cardinal speed', () => {
    const pos = { x: 400, y: 400 };
    const diag = movePlayer(pos, { x: 1, y: 1 });
    const card = movePlayer(pos, { x: 1, y: 0 });
    const diagDist = Math.sqrt((diag.x - 400) ** 2 + (diag.y - 400) ** 2);
    const cardDist = Math.abs(card.x - 400);
    expect(diagDist).toBeCloseTo(cardDist, 1);
  });

  it('clamps position to arena bounds', () => {
    const result = movePlayer({ x: 5, y: 400 }, { x: -1, y: 0 });
    expect(result.x).toBeGreaterThanOrEqual(PLAYER_HALF_SIZE);
  });

  it('returns unchanged position for zero input', () => {
    const pos = { x: 400, y: 400 };
    expect(movePlayer(pos, { x: 0, y: 0 })).toEqual(pos);
  });
});

describe('resolvePlayerPillarCollisions', () => {
  it('pushes player out of a pillar', () => {
    const pillar = PILLARS[0]; // x:160 y:160 halfSize:28
    const inside = { x: pillar.x, y: pillar.y };
    const resolved = resolvePlayerPillarCollisions(inside);
    const dx = Math.abs(resolved.x - pillar.x);
    const dy = Math.abs(resolved.y - pillar.y);
    expect(dx >= pillar.halfSize + PLAYER_HALF_SIZE || dy >= pillar.halfSize + PLAYER_HALF_SIZE).toBe(true);
  });

  it('leaves player unchanged when not overlapping any pillar', () => {
    const pos = { x: 400, y: 100 };
    expect(resolvePlayerPillarCollisions(pos)).toEqual(pos);
  });
});

describe('circleHitsAABB', () => {
  it('returns true when circle overlaps box', () => {
    const pillar = PILLARS[0];
    expect(circleHitsAABB({ x: pillar.x, y: pillar.y }, 5, pillar)).toBe(true);
  });

  it('returns false when circle is outside box', () => {
    const pillar = PILLARS[0];
    expect(circleHitsAABB({ x: 400, y: 400 }, 5, pillar)).toBe(false);
  });
});

describe('pillarContainsPoint', () => {
  it('returns true for a point inside a pillar', () => {
    const p = PILLARS[2]; // center pillar at 400,400
    expect(pillarContainsPoint({ x: p.x, y: p.y })).toBe(true);
  });

  it('returns false for a point in open space', () => {
    expect(pillarContainsPoint({ x: 400, y: 100 })).toBe(false);
  });
});
