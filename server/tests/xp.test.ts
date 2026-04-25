import { describe, it, expect } from 'vitest';
import { xpToNextLevel, computeLevelUp } from '../src/skills/xp.ts';

describe('xpToNextLevel', () => {
  it('requires 100 XP to go from level 1 to level 2', () => {
    expect(xpToNextLevel(1)).toBe(100);
  });

  it('requires 282 XP to go from level 2 to level 3', () => {
    expect(xpToNextLevel(2)).toBe(282);
  });

  it('scales with diminishing returns', () => {
    const l5 = xpToNextLevel(5);
    const l10 = xpToNextLevel(10);
    expect(l10).toBeGreaterThan(l5);
    expect(l10).toBe(3162);
  });
});

describe('computeLevelUp', () => {
  it('returns no level-up when XP is below threshold', () => {
    const result = computeLevelUp(1, 50, 40);
    expect(result.newLevel).toBe(1);
    expect(result.newXp).toBe(90);
    expect(result.levelsGained).toBe(0);
  });

  it('levels up once when XP crosses one threshold', () => {
    const result = computeLevelUp(1, 50, 80);
    expect(result.newLevel).toBe(2);
    expect(result.newXp).toBe(30);
    expect(result.levelsGained).toBe(1);
  });

  it('levels up multiple times if XP is large enough', () => {
    const result = computeLevelUp(1, 0, 400);
    expect(result.newLevel).toBe(3);
    expect(result.newXp).toBe(18);
    expect(result.levelsGained).toBe(2);
  });

  it('does not level up if XP exactly equals zero remaining', () => {
    const result = computeLevelUp(1, 0, 99);
    expect(result.newLevel).toBe(1);
    expect(result.newXp).toBe(99);
    expect(result.levelsGained).toBe(0);
  });

  it('levels up exactly at threshold', () => {
    const result = computeLevelUp(1, 0, 100);
    expect(result.newLevel).toBe(2);
    expect(result.newXp).toBe(0);
    expect(result.levelsGained).toBe(1);
  });
});
