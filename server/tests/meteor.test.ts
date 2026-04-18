import { describe, it, expect } from 'vitest';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../src/spells/Meteor.ts';
import { METEOR_DELAY_TICKS } from '@arena/shared';

describe('spawnMeteor', () => {
  it('sets strikeAt to currentTick + METEOR_DELAY_TICKS', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 60);
    expect(m.strikeAt).toBe(60 + METEOR_DELAY_TICKS);
    expect(m.target).toEqual({ x: 400, y: 400 });
  });
});

describe('meteorDetonates', () => {
  it('returns true when current tick >= strikeAt', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorDetonates(m, METEOR_DELAY_TICKS)).toBe(true);
    expect(meteorDetonates(m, METEOR_DELAY_TICKS - 1)).toBe(false);
  });
});

describe('meteorHitsPlayer', () => {
  it('returns true when player is within AOE radius', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorHitsPlayer(m, { x: 420, y: 400 }, 'p2')).toBe(true);
  });

  it('returns false when player is outside AOE radius', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorHitsPlayer(m, { x: 600, y: 600 }, 'p2')).toBe(false);
  });

  it('does not hit the owner', () => {
    const m = spawnMeteor('p1', { x: 400, y: 400 }, 0);
    expect(meteorHitsPlayer(m, { x: 400, y: 400 }, 'p1')).toBe(false);
  });
});

describe('meteorDamage', () => {
  it('returns a value between 200 and 280', () => {
    for (let i = 0; i < 100; i++) {
      const d = meteorDamage();
      expect(d).toBeGreaterThanOrEqual(200);
      expect(d).toBeLessThanOrEqual(280);
    }
  });
});
