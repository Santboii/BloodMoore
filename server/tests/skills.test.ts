import { describe, it, expect } from 'vitest';
import { canUnlock, SKILL_NODES } from '@arena/shared';

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

import { buildSpellModifiers } from '../src/skills/SpellModifiers.ts';
import { FIREBALL_SPEED, FIREBALL_RADIUS } from '@arena/shared';

describe('buildSpellModifiers', () => {
  it('returns base values when no skills are owned', () => {
    const m = buildSpellModifiers(new Set());
    expect(m.fireball.speed).toBe(FIREBALL_SPEED);
    expect(m.fireball.radius).toBe(FIREBALL_RADIUS);
    expect(m.fireball.damageMin).toBe(80);
    expect(m.fireball.damageMax).toBe(120);
    expect(m.fireball.homing).toBe(false);
    expect(m.fireball.split).toBe(0);
    expect(m.firewall.durationMultiplier).toBe(1);
    expect(m.firewall.damageMultiplier).toBe(1);
    expect(m.meteor.hidden).toBe(false);
    expect(m.meteor.moltenImpact).toBe(false);
    expect(m.teleport.maxRange).toBe(600);
    expect(m.teleport.etherealForm).toBe(false);
    expect(m.teleport.phantomStep).toBe(false);
  });

  it('applies Volatile Ember: +30% radius', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.volatile_ember']));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * 1.3, 5);
  });

  it('applies Hellfire: 3× radius, 2× damage, 0.5× speed', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.hellfire']));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * 3, 5);
    expect(m.fireball.damageMin).toBe(160);
    expect(m.fireball.damageMax).toBe(240);
    expect(m.fireball.speed).toBeCloseTo(FIREBALL_SPEED * 0.5, 5);
  });

  it('stacks Volatile Ember + Hellfire: radius is base * 1.3 * 3', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.volatile_ember', 'fire.hellfire']));
    expect(m.fireball.radius).toBeCloseTo(FIREBALL_RADIUS * 1.3 * 3, 5);
  });

  it('applies Enduring Flames: +50% firewall duration', () => {
    const m = buildSpellModifiers(new Set(['fire.fireball', 'fire.volatile_ember', 'fire.fire_wall', 'fire.enduring_flames']));
    expect(m.firewall.durationMultiplier).toBe(1.5);
  });

  it('applies Phase Shift: +40% teleport range', () => {
    const m = buildSpellModifiers(new Set(['utility.teleport', 'utility.phase_shift']));
    expect(m.teleport.maxRange).toBeCloseTo(600 * 1.4, 5);
  });
});
