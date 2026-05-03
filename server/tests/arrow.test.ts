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

  it('guided arrow (homing=1) flies straight initially', () => {
    const arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 1 });
    const enemy = { x: 100, y: 200 };
    const moved = advanceArrow(arrow, enemy);
    expect(moved.velocity.y).toBe(0);
    expect(moved.homing).toBe(29);
  });

  it('guided arrow (homing=1) snaps toward enemy after countdown', () => {
    let arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 200, y: 100 }, { homing: 1 });
    const enemy = { x: 100, y: 300 };
    for (let i = 0; i < 30; i++) {
      arrow = advanceArrow(arrow, enemy);
    }
    expect(arrow.homing).toBe(-1);
    expect(arrow.velocity.y).toBeGreaterThan(0);
    const angle = Math.atan2(arrow.velocity.y, arrow.velocity.x);
    const toEnemy = Math.atan2(300 - arrow.position.y, 100 - arrow.position.x);
    expect(Math.abs(angle - toEnemy)).toBeLessThan(0.1);
  });

  it('guided arrow with 2 redirects snaps twice', () => {
    let arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 500, y: 100 }, { homing: 1, guidedRedirects: 2 });
    const enemy = { x: 100, y: 300 };
    for (let i = 0; i < 30; i++) {
      arrow = advanceArrow(arrow, enemy);
    }
    expect(arrow.homing).toBe(30);
    expect(arrow.homingRedirects).toBe(0);
    expect(arrow.velocity.y).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) {
      arrow = advanceArrow(arrow, enemy);
    }
    expect(arrow.homing).toBe(-1);
    expect(arrow.homingRedirects).toBe(0);
  });

  it('homingTickReduction reduces redirect interval', () => {
    let arrow = spawnArrow('p1', { x: 100, y: 100 }, { x: 500, y: 100 }, { homing: 1, homingTickReduction: 10 });
    expect(arrow.homing).toBe(20);
    const enemy = { x: 100, y: 300 };
    for (let i = 0; i < 20; i++) {
      arrow = advanceArrow(arrow, enemy);
    }
    expect(arrow.homing).toBe(-1);
    expect(arrow.velocity.y).toBeGreaterThan(0);
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
