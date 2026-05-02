import { describe, it, expect } from 'vitest';
import { spawnRainOfArrows, rainDetonates, rainHitsPlayer, rainDamage } from '../src/spells/RainOfArrows.ts';
import { RAIN_DELAY_TICKS, RAIN_AOE_RADIUS } from '@arena/shared';

describe('spawnRainOfArrows', () => {
  it('creates a rain state with correct delay', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 100, { sustained: false, piercing: false });
    expect(rain.ownerId).toBe('p1');
    expect(rain.target).toEqual({ x: 500, y: 500 });
    expect(rain.strikeAt).toBe(100 + RAIN_DELAY_TICKS);
    expect(rain.radius).toBe(RAIN_AOE_RADIUS);
  });

  it('sets sustained and piercing flags', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, { sustained: true, piercing: true });
    expect(rain.sustained).toBe(true);
    expect(rain.piercing).toBe(true);
  });
});

describe('rainDetonates', () => {
  it('returns true when tick equals strikeAt', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainDetonates(rain, RAIN_DELAY_TICKS)).toBe(true);
  });

  it('returns false before strikeAt', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainDetonates(rain, RAIN_DELAY_TICKS - 1)).toBe(false);
  });
});

describe('rainHitsPlayer', () => {
  it('hits a player within the AoE radius', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainHitsPlayer(rain, { x: 530, y: 500 }, 'p2')).toBe(true);
  });

  it('does not hit a player outside the AoE radius', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainHitsPlayer(rain, { x: 600, y: 600 }, 'p2')).toBe(false);
  });

  it('does not hit the owner', () => {
    const rain = spawnRainOfArrows('p1', { x: 500, y: 500 }, 0, {});
    expect(rainHitsPlayer(rain, { x: 500, y: 500 }, 'p1')).toBe(false);
  });
});

describe('rainDamage', () => {
  it('returns a value between 150 and 220', () => {
    const dmg = rainDamage(false);
    expect(dmg).toBeGreaterThanOrEqual(150);
    expect(dmg).toBeLessThanOrEqual(220);
  });

  it('doubles damage when piercing is true', () => {
    const dmg = rainDamage(true);
    expect(dmg).toBeGreaterThanOrEqual(300);
    expect(dmg).toBeLessThanOrEqual(440);
  });
});
