import { describe, it, expect } from 'vitest';
import { makeInitialState, advanceState } from '../src/gameloop/StateAdvancer.ts';
import type { NodeId, InputFrame } from '@arena/shared';
import { ARROW_SPEED, DELTA, RAIN_DELAY_TICKS } from '@arena/shared';

describe('Amazon combat integration', () => {
  const amazonSkills = new Map<NodeId, number>([
    ['archer.power_shot' as NodeId, 1],
    ['archer.guided' as NodeId, 1],
    ['archer.multishot' as NodeId, 1],
  ]);

  it('Power Shot spawns an arrow projectile', () => {
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', charClass: 'amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', charClass: 'mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 5, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: amazonSkills, p2: new Map() });
    const arrows = next.projectiles.filter(p => p.type === 'arrow');
    expect(arrows).toHaveLength(1);
    expect(arrows[0].ownerId).toBe('p1');
  });

  it('Multi-shot spawns 3 arrow projectiles', () => {
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', charClass: 'amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', charClass: 'mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 6, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: amazonSkills, p2: new Map() });
    const arrows = next.projectiles.filter(p => p.type === 'arrow');
    expect(arrows).toHaveLength(3);
  });

  it('Rain of Arrows creates a rain state', () => {
    const skills = new Map<NodeId, number>([
      ...amazonSkills,
      ['archer.homing' as NodeId, 1],
      ['archer.rain_of_arrows' as NodeId, 1],
    ]);
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', charClass: 'amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', charClass: 'mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 7, aimTarget: { x: 1000, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: skills, p2: new Map() });
    expect(next.rainOfArrows).toHaveLength(1);
    expect(next.rainOfArrows[0].ownerId).toBe('p1');
  });

  it('Evade moves the player and grants invulnerability', () => {
    const skills = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer_utility.evade' as NodeId, 1],
    ]);
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', charClass: 'amazon', spawnPos: { x: 500, y: 1000 } },
      { id: 'p2', displayName: 'Mage', charClass: 'mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 8, aimTarget: { x: 800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: skills, p2: new Map() });
    expect(next.players['p1'].position.x).toBeGreaterThan(500);
    expect(next.players['p1'].invulnUntil).toBeGreaterThan(0);
  });

  it('Amazon cannot cast Fireball (spell 1)', () => {
    const state = makeInitialState([
      { id: 'p1', displayName: 'Amazon', charClass: 'amazon', spawnPos: { x: 200, y: 1000 } },
      { id: 'p2', displayName: 'Mage', charClass: 'mage', spawnPos: { x: 1800, y: 1000 } },
    ]);
    const inputs: Record<string, InputFrame> = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1, aimTarget: { x: 1800, y: 1000 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } },
    };
    const next = advanceState(state, inputs, { p1: amazonSkills, p2: new Map() });
    expect(next.projectiles.filter(p => p.type === 'fireball')).toHaveLength(0);
  });
});
