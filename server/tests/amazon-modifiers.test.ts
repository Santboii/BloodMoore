import { describe, it, expect } from 'vitest';
import { buildAmazonModifiers } from '../src/skills/AmazonModifiers.ts';
import { ARROW_SPEED, EVADE_RANGE } from '@arena/shared';

describe('buildAmazonModifiers', () => {
  it('returns base values when no skills are owned', () => {
    const m = buildAmazonModifiers(new Map());
    expect(m.arrow.speed).toBe(ARROW_SPEED);
    expect(m.arrow.damageMin).toBe(60);
    expect(m.arrow.damageMax).toBe(90);
    expect(m.arrow.homing).toBe(0);
    expect(m.multishot.arrowCount).toBe(3);
    expect(m.multishot.damageMin).toBe(40);
    expect(m.multishot.damageMax).toBe(60);
    expect(m.rain.sustained).toBe(false);
    expect(m.rain.piercing).toBe(false);
    expect(m.evade.range).toBe(EVADE_RANGE);
    expect(m.evade.combatRoll).toBe(false);
    expect(m.evade.shadowstep).toBe(false);
    expect(m.evade.cooldownMultiplier).toBe(1);
    expect(m.element).toBe('none');
  });

  it('applies guided: homing=1', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.guided', 1]]));
    expect(m.arrow.homing).toBe(1);
  });

  it('applies homing: homing=2', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.guided', 1], ['archer.homing', 1]]));
    expect(m.arrow.homing).toBe(2);
  });

  it('applies barrage rank 1: 4 arrows', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.multishot', 1], ['archer.barrage', 1]]));
    expect(m.multishot.arrowCount).toBe(4);
  });

  it('applies barrage rank 3: scales with diminishing returns', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.multishot', 1], ['archer.barrage', 3]]));
    expect(m.multishot.arrowCount).toBeGreaterThan(4);
    expect(m.multishot.arrowCount).toBeLessThanOrEqual(6);
  });

  it('applies sustained_rain with duration multiplier', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.sustained_rain', 1]]));
    expect(m.rain.sustained).toBe(true);
    expect(m.rain.durationMultiplier).toBeGreaterThan(1);
  });

  it('sustained_rain rank 3 has higher duration multiplier', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.sustained_rain', 3]]));
    expect(m.rain.durationMultiplier).toBeGreaterThan(1.15);
  });

  it('applies piercing_rain with damage multiplier', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.piercing_rain', 1]]));
    expect(m.rain.piercing).toBe(true);
    expect(m.rain.damageMultiplier).toBeGreaterThan(1);
  });

  it('applies burn element with scaling damage', () => {
    const m1 = buildAmazonModifiers(new Map([['archer.burn', 1]]));
    const m3 = buildAmazonModifiers(new Map([['archer.burn', 3]]));
    expect(m1.element).toBe('burn');
    expect(m1.elemental.burn.damagePerSecond).toBeGreaterThan(10);
    expect(m3.elemental.burn.damagePerSecond).toBeGreaterThan(m1.elemental.burn.damagePerSecond);
    expect(m1.elemental.burn.duration).toBe(3);
  });

  it('applies freeze element with scaling slow', () => {
    const m1 = buildAmazonModifiers(new Map([['archer.freeze', 1]]));
    const m3 = buildAmazonModifiers(new Map([['archer.freeze', 3]]));
    expect(m1.element).toBe('freeze');
    expect(m1.elemental.freeze.slowPercent).toBeGreaterThan(0.30);
    expect(m3.elemental.freeze.slowPercent).toBeGreaterThan(m1.elemental.freeze.slowPercent);
    expect(m1.elemental.freeze.duration).toBe(2);
  });

  it('applies poison element with scaling damage and mana drain', () => {
    const m1 = buildAmazonModifiers(new Map([['archer.poison', 1]]));
    const m3 = buildAmazonModifiers(new Map([['archer.poison', 3]]));
    expect(m1.element).toBe('poison');
    expect(m1.elemental.poison.damagePerSecond).toBeGreaterThan(4);
    expect(m3.elemental.poison.damagePerSecond).toBeGreaterThan(m1.elemental.poison.damagePerSecond);
    expect(m3.elemental.poison.manaRegenReduction).toBeGreaterThan(m1.elemental.poison.manaRegenReduction);
    expect(m1.elemental.poison.duration).toBe(5);
  });

  it('applies combat_roll', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.combat_roll', 1]]));
    expect(m.evade.combatRoll).toBe(true);
  });

  it('applies shadowstep', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.shadowstep', 1]]));
    expect(m.evade.shadowstep).toBe(true);
  });

  it('applies acrobatics: reduces cooldown multiplier', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.combat_roll', 1], ['archer_utility.acrobatics', 1]]));
    expect(m.evade.cooldownMultiplier).toBeLessThan(1);
    expect(m.evade.cooldownMultiplier).toBeGreaterThan(0.5);
  });

  it('guided rank scales tick reduction', () => {
    const m1 = buildAmazonModifiers(new Map([['archer.guided', 1]]));
    const m3 = buildAmazonModifiers(new Map([['archer.guided', 3]]));
    expect(m1.arrow.guidedTickReduction).toBeGreaterThan(0);
    expect(m3.arrow.guidedTickReduction).toBeGreaterThan(m1.arrow.guidedTickReduction);
  });

  it('homing rank scales tick reduction', () => {
    const m1 = buildAmazonModifiers(new Map([['archer.guided', 1], ['archer.homing', 1]]));
    const m3 = buildAmazonModifiers(new Map([['archer.guided', 1], ['archer.homing', 3]]));
    expect(m1.arrow.homingTickReduction).toBeGreaterThan(0);
    expect(m3.arrow.homingTickReduction).toBeGreaterThan(m1.arrow.homingTickReduction);
  });
});
