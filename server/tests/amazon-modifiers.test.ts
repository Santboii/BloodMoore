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

  it('applies barrage: 5 arrows', () => {
    const m = buildAmazonModifiers(new Map([['archer.power_shot', 1], ['archer.multishot', 1], ['archer.barrage', 1]]));
    expect(m.multishot.arrowCount).toBe(5);
  });

  it('applies sustained_rain', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.sustained_rain', 1]]));
    expect(m.rain.sustained).toBe(true);
  });

  it('applies piercing_rain', () => {
    const m = buildAmazonModifiers(new Map([['archer.rain_of_arrows', 1], ['archer.piercing_rain', 1]]));
    expect(m.rain.piercing).toBe(true);
  });

  it('applies burn element', () => {
    const m = buildAmazonModifiers(new Map([['archer.burn', 1]]));
    expect(m.element).toBe('burn');
  });

  it('applies freeze element', () => {
    const m = buildAmazonModifiers(new Map([['archer.freeze', 1]]));
    expect(m.element).toBe('freeze');
  });

  it('applies poison element', () => {
    const m = buildAmazonModifiers(new Map([['archer.poison', 1]]));
    expect(m.element).toBe('poison');
  });

  it('applies combat_roll', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.combat_roll', 1]]));
    expect(m.evade.combatRoll).toBe(true);
  });

  it('applies shadowstep', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.shadowstep', 1]]));
    expect(m.evade.shadowstep).toBe(true);
  });

  it('applies acrobatics: 0.6 cooldown multiplier', () => {
    const m = buildAmazonModifiers(new Map([['archer_utility.evade', 1], ['archer_utility.combat_roll', 1], ['archer_utility.acrobatics', 1]]));
    expect(m.evade.cooldownMultiplier).toBe(0.6);
  });
});
