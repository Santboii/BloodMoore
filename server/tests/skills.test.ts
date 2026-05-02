import { describe, it, expect } from 'vitest';
import { canUnlock, SKILL_NODES, effectAtRank, rankUpCost, totalSpentForRanks, isStackable, DIMINISHING_POWER } from '@arena/shared';

describe('canUnlock', () => {
  it('allows unlocking a tier-I spell with no prerequisites', () => {
    expect(canUnlock('fire.fireball', new Set())).toBe(true);
    expect(canUnlock('utility.teleport', new Set())).toBe(true);
  });

  it('blocks a tier-II node when its required spell is not owned', () => {
    expect(canUnlock('fire.volatile_ember', new Set())).toBe(false);
    expect(canUnlock('fire.seeking_flame', new Set())).toBe(false);
  });

  it('allows a tier-II node when its required spell is owned', () => {
    const owned = new Set(['fire.fireball']);
    expect(canUnlock('fire.volatile_ember', owned)).toBe(true);
  });

  it('blocks Fire Wall when no tier-II fire node is owned', () => {
    const owned = new Set(['fire.fireball']);
    expect(canUnlock('fire.fire_wall', owned)).toBe(false);
  });

  it('allows Fire Wall when at least one tier-II fire node is owned', () => {
    const owned = new Set(['fire.fireball', 'fire.volatile_ember']);
    expect(canUnlock('fire.fire_wall', owned)).toBe(true);
  });

  it('blocks Meteor when no tier-V fire node is owned', () => {
    const owned = new Set(['fire.fireball', 'fire.volatile_ember', 'fire.fire_wall']);
    expect(canUnlock('fire.meteor', owned)).toBe(false);
  });

  it('allows Meteor when at least one tier-V fire node is owned', () => {
    const owned = new Set(['fire.fireball', 'fire.volatile_ember', 'fire.fire_wall', 'fire.enduring_flames']);
    expect(canUnlock('fire.meteor', owned)).toBe(true);
  });

  it('returns all 11 fire nodes + 4 utility nodes in SKILL_NODES', () => {
    const fire = SKILL_NODES.filter(n => n.tree === 'fire');
    const util = SKILL_NODES.filter(n => n.tree === 'utility');
    expect(fire).toHaveLength(11);
    expect(util).toHaveLength(4);
  });
});

describe('scaling helpers', () => {
  it('effectAtRank returns baseEffect at rank 1', () => {
    expect(effectAtRank(25, 1)).toBeCloseTo(25, 5);
  });

  it('effectAtRank applies diminishing power curve', () => {
    expect(effectAtRank(25, 2)).toBeCloseTo(25 * Math.pow(2, DIMINISHING_POWER), 5);
    expect(effectAtRank(25, 5)).toBeCloseTo(25 * Math.pow(5, DIMINISHING_POWER), 5);
  });

  it('effectAtRank returns 0 for rank 0', () => {
    expect(effectAtRank(25, 0)).toBe(0);
  });

  it('rankUpCost returns base cost for ranks up to soft cap', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!;
    expect(rankUpCost(node, 0)).toBe(1);
    expect(rankUpCost(node, 1)).toBe(1);
    expect(rankUpCost(node, 4)).toBe(1);
  });

  it('rankUpCost ramps past soft cap', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!;
    expect(rankUpCost(node, 5)).toBe(2);
    expect(rankUpCost(node, 6)).toBe(3);
    expect(rankUpCost(node, 7)).toBe(4);
  });

  it('rankUpCost for binary node returns cost at rank 0, Infinity at rank 1', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.blind_strike')!;
    expect(rankUpCost(node, 0)).toBe(2);
    expect(rankUpCost(node, 1)).toBe(Infinity);
  });

  it('totalSpentForRanks computes cumulative cost', () => {
    const node = SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!;
    expect(totalSpentForRanks(node, 0)).toBe(0);
    expect(totalSpentForRanks(node, 1)).toBe(1);
    expect(totalSpentForRanks(node, 5)).toBe(5);
    expect(totalSpentForRanks(node, 6)).toBe(7);
    expect(totalSpentForRanks(node, 7)).toBe(10);
  });

  it('isStackable returns true for stackable nodes, false for binary', () => {
    expect(isStackable(SKILL_NODES.find(n => n.id === 'fire.seeking_flame')!)).toBe(true);
    expect(isStackable(SKILL_NODES.find(n => n.id === 'fire.blind_strike')!)).toBe(false);
    expect(isStackable(SKILL_NODES.find(n => n.id === 'fire.fireball')!)).toBe(false);
  });
});

import { buildSpellModifiers } from '../src/skills/SpellModifiers.ts';
import { FIREBALL_SPEED, FIREBALL_RADIUS, effectAtRank } from '@arena/shared';

describe('buildSpellModifiers', () => {
  it('returns base values when no skills are owned', () => {
    const m = buildSpellModifiers(new Map());
    expect(m.fireball.speed).toBe(FIREBALL_SPEED);
    expect(m.fireball.radius).toBe(FIREBALL_RADIUS);
    expect(m.fireball.damageMin).toBe(80);
    expect(m.fireball.damageMax).toBe(120);
    expect(m.fireball.homingStrength).toBe(0);
    expect(m.fireball.split).toBe(0);
    expect(m.firewall.durationMultiplier).toBe(1);
    expect(m.firewall.damageMultiplier).toBe(1);
    expect(m.meteor.hidden).toBe(false);
    expect(m.meteor.moltenImpact).toBe(false);
    expect(m.teleport.maxRange).toBe(600);
    expect(m.teleport.etherealForm).toBe(false);
    expect(m.teleport.phantomStep).toBe(false);
  });

  it('applies Volatile Ember rank 1: +8% radius', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.volatile_ember', 1]]));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * (1 + effectAtRank(0.08, 1)), 5);
  });

  it('applies Volatile Ember rank 5: stacked radius bonus', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.volatile_ember', 5]]));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * (1 + effectAtRank(0.08, 5)), 5);
  });

  it('applies Hellfire rank 1: +50% radius, +30% damage, -15% speed', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.hellfire', 1]]));
    const e = effectAtRank(1.0, 1);
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * (1 + 0.5 * e), 5);
    expect(m.fireball.damageMin).toBeCloseTo(80 * (1 + 0.3 * e), 5);
    expect(m.fireball.damageMax).toBeCloseTo(120 * (1 + 0.3 * e), 5);
    expect(m.fireball.speed).toBeCloseTo(FIREBALL_SPEED * (1 - 0.15 * e), 5);
  });

  it('stacks Volatile Ember rank 3 + Hellfire rank 2', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 3], ['fire.hellfire', 2],
    ]));
    const veBonus = 1 + effectAtRank(0.08, 3);
    const hfE = effectAtRank(1.0, 2);
    const hfBonus = 1 + 0.5 * hfE;
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * veBonus * hfBonus, 5);
  });

  it('applies Seeking Flame rank 3: homing strength', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.seeking_flame', 3]]));
    expect(m.fireball.homingStrength).toBeCloseTo(effectAtRank(25, 3), 5);
  });

  it('applies Pyroclasm rank 2: split count floored', () => {
    const m = buildSpellModifiers(new Map([['fire.fireball', 1], ['fire.pyroclasm', 2]]));
    expect(m.fireball.split).toBe(Math.floor(effectAtRank(1, 2)));
  });

  it('applies Enduring Flames rank 4: duration multiplier', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1], ['fire.enduring_flames', 4],
    ]));
    expect(m.firewall.durationMultiplier).toBeCloseTo(1 + effectAtRank(0.10, 4), 5);
  });

  it('applies Searing Heat rank 2: damage multiplier', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1], ['fire.searing_heat', 2],
    ]));
    expect(m.firewall.damageMultiplier).toBeCloseTo(1 + effectAtRank(0.08, 2), 5);
  });

  it('applies Phase Shift rank 3: teleport range', () => {
    const m = buildSpellModifiers(new Map([['utility.teleport', 1], ['utility.phase_shift', 3]]));
    expect(m.teleport.maxRange).toBeCloseTo(600 * (1 + effectAtRank(0.08, 3)), 5);
  });

  it('binary nodes still work: Blind Strike', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1],
      ['fire.enduring_flames', 1], ['fire.meteor', 1], ['fire.blind_strike', 1],
    ]));
    expect(m.meteor.hidden).toBe(true);
  });

  it('binary nodes still work: Molten Impact', () => {
    const m = buildSpellModifiers(new Map([
      ['fire.fireball', 1], ['fire.volatile_ember', 1], ['fire.fire_wall', 1],
      ['fire.enduring_flames', 1], ['fire.meteor', 1], ['fire.molten_impact', 1],
    ]));
    expect(m.meteor.moltenImpact).toBe(true);
  });

  it('binary nodes still work: Ethereal Form and Phantom Step', () => {
    const m = buildSpellModifiers(new Map([
      ['utility.teleport', 1], ['utility.ethereal_form', 1], ['utility.phantom_step', 1],
    ]));
    expect(m.teleport.etherealForm).toBe(true);
    expect(m.teleport.phantomStep).toBe(true);
  });
});
