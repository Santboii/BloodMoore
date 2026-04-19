import { describe, it, expect } from 'vitest';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../src/spells/Fireball.ts';

describe('spawnFireball', () => {
  it('creates a projectile aimed at the target', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 700, y: 400 });
    expect(fb.ownerId).toBe('p1');
    expect(fb.type).toBe('fireball');
    expect(fb.velocity.x).toBeGreaterThan(0);
    expect(fb.velocity.y).toBeCloseTo(0, 1);
  });

  it('normalizes velocity to FIREBALL_SPEED regardless of target distance', () => {
    const fb = spawnFireball('p1', { x: 0, y: 0 }, { x: 3, y: 4 }); // distance 5
    const speed = Math.sqrt(fb.velocity.x ** 2 + fb.velocity.y ** 2);
    expect(speed).toBeCloseTo(400, 0);
  });
});

describe('advanceFireball', () => {
  it('moves the fireball by velocity * DELTA each tick', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 500, y: 400 });
    const advanced = advanceFireball(fb);
    expect(advanced.position.x).toBeGreaterThan(fb.position.x);
    expect(advanced.position.x).toBeCloseTo(fb.position.x + 400 / 60, 1);
  });
});

describe('isFireballExpired', () => {
  it('returns true when fireball leaves arena', () => {
    const fb = spawnFireball('p1', { x: 1990, y: 1000 }, { x: 2100, y: 1000 });
    const advanced = advanceFireball(fb);
    expect(isFireballExpired(advanced)).toBe(true);
  });

  it('returns false when fireball is in open space', () => {
    const fb = spawnFireball('p1', { x: 100, y: 300 }, { x: 500, y: 300 });
    expect(isFireballExpired(fb)).toBe(false);
  });

  it('returns true when fireball hits a pillar', () => {
    // Fire directly into center pillar at 1000,1000
    const fb = spawnFireball('p1', { x: 990, y: 1000 }, { x: 1400, y: 1000 });
    let current = fb;
    let hit = false;
    for (let i = 0; i < 200; i++) {
      current = advanceFireball(current);
      if (isFireballExpired(current)) { hit = true; break; }
    }
    expect(hit).toBe(true);
  });
});

describe('fireballHitsPlayer', () => {
  it('returns true when fireball position is within hit radius of target player', () => {
    const fb = spawnFireball('p1', { x: 400, y: 400 }, { x: 420, y: 400 });
    const movedFb = { ...fb, position: { x: 418, y: 400 } };
    expect(fireballHitsPlayer(movedFb, { x: 420, y: 400 }, 'p2')).toBe(true);
  });

  it('does not hit the owner', () => {
    const fb = spawnFireball('p1', { x: 400, y: 400 }, { x: 420, y: 400 });
    expect(fireballHitsPlayer(fb, { x: 400, y: 400 }, 'p1')).toBe(false);
  });
});

describe('fireballDamage', () => {
  it('returns a value between 80 and 120', () => {
    for (let i = 0; i < 100; i++) {
      const d = fireballDamage();
      expect(d).toBeGreaterThanOrEqual(80);
      expect(d).toBeLessThanOrEqual(120);
    }
  });
});

import { spawnFireball } from '../src/spells/Fireball.ts';

describe('spawnFireball with config overrides', () => {
  it('uses overridden speed when provided', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 700, y: 400 }, { speed: 200 });
    const spd = Math.sqrt(fb.velocity.x ** 2 + fb.velocity.y ** 2);
    expect(spd).toBeCloseTo(200, 0);
  });

  it('stores radius override on the projectile', () => {
    const fb = spawnFireball('p1', { x: 100, y: 400 }, { x: 700, y: 400 }, { radius: 30 });
    expect(fb.radius).toBe(30);
  });
});
