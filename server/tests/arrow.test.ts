import { describe, it, expect } from 'vitest';
import { spawnArrow, advanceArrow, isArrowExpired, arrowHitsPlayer, arrowDamage } from '../src/spells/Arrow.ts';
import { ARROW_SPEED, ARROW_RADIUS, DELTA } from '@arena/shared';

describe('spawnArrow', () => {
  it('creates an arrow projectile with correct speed', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    const speed = Math.sqrt(arrow.velocity.x ** 2 + arrow.velocity.y ** 2);
    expect(speed).toBeCloseTo(ARROW_SPEED, 0);
    expect(arrow.type).toBe('arrow');
    expect(arrow.ownerId).toBe('p1');
  });

  it('applies custom speed from config', () => {
    const arrow = spawnArrow('p1', { x: 0, y: 0 }, { x: 100, y: 0 }, { speed: 700 });
    expect(arrow.velocity.x).toBeCloseTo(700, 0);
  });
});

describe('advanceArrow', () => {
  it('moves arrow by velocity * DELTA', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    const moved = advanceArrow(arrow, undefined);
    expect(moved.position.x).toBeCloseTo(100 + ARROW_SPEED * DELTA, 1);
    expect(moved.position.y).toBeCloseTo(100, 1);
  });

  it('applies slight homing when homing=1', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 1 });
    const enemy = { x: 100, y: 200 };
    const moved = advanceArrow(arrow, enemy);
    expect(moved.velocity.y).toBeGreaterThan(0);
  });

  it('applies strong homing when homing=2', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 2 });
    const enemy = { x: 100, y: 200 };
    const moved = advanceArrow(arrow, enemy);
    const arrowWeak = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 1 });
    const movedWeak = advanceArrow(arrowWeak, enemy);
    expect(moved.velocity.y).toBeGreaterThan(movedWeak.velocity.y);
  });
});

describe('isArrowExpired', () => {
  it('returns true when arrow is out of arena bounds', () => {
    const arrow = spawnArrow('p1', { x: -10, y: 100 }, { x: -20, y: 100 }, {});
    expect(isArrowExpired({ ...arrow, position: { x: -10, y: 100 } })).toBe(true);
  });

  it('returns false when arrow is within bounds', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    expect(isArrowExpired(arrow)).toBe(false);
  });
});

describe('arrowHitsPlayer', () => {
  it('detects hit when arrow overlaps player', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    expect(arrowHitsPlayer({ ...arrow, position: { x: 100, y: 100 } }, { x: 100, y: 100 }, 'p2')).toBe(true);
  });

  it('does not hit own player', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, {});
    expect(arrowHitsPlayer(arrow, { x: 100, y: 100 }, 'p1')).toBe(false);
  });
});

describe('arrowDamage', () => {
  it('returns a value between min and max', () => {
    const dmg = arrowDamage(60, 90);
    expect(dmg).toBeGreaterThanOrEqual(60);
    expect(dmg).toBeLessThanOrEqual(90);
  });
});
