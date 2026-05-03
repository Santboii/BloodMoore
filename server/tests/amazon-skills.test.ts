import { describe, it, expect } from 'vitest';
import { CHARACTER_CLASSES } from '@arena/shared';

describe('Amazon character class', () => {
  it('includes amazon in CHARACTER_CLASSES', () => {
    const amazon = CHARACTER_CLASSES.find(c => c.id === 'amazon');
    expect(amazon).toBeDefined();
    expect(amazon!.label).toBe('Amazon');
    expect(amazon!.enabled).toBe(true);
  });
});

import { canUnlock, SKILL_NODES, GATES } from '@arena/shared';
import type { NodeId } from '@arena/shared';

describe('Archer skill tree nodes', () => {
  it('has 12 archer nodes and 4 archer_utility nodes', () => {
    const archer = SKILL_NODES.filter(n => n.tree === 'archer');
    const archerUtil = SKILL_NODES.filter(n => n.tree === 'archer_utility');
    expect(archer).toHaveLength(12);
    expect(archerUtil).toHaveLength(4);
  });

  it('allows unlocking power_shot with no prerequisites', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer.power_shot' as NodeId, owned)).toBe(true);
  });

  it('blocks guided without power_shot', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer.guided' as NodeId, owned)).toBe(false);
  });

  it('allows guided when power_shot is owned', () => {
    const owned = new Map<NodeId, number>([['archer.power_shot' as NodeId, 1]]);
    expect(canUnlock('archer.guided' as NodeId, owned)).toBe(true);
  });

  it('blocks rain_of_arrows without a tier-3 node', () => {
    const owned = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer.guided' as NodeId, 1],
    ]);
    expect(canUnlock('archer.rain_of_arrows' as NodeId, owned)).toBe(false);
  });

  it('allows rain_of_arrows when homing is owned', () => {
    const owned = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer.guided' as NodeId, 1],
      ['archer.homing' as NodeId, 1],
    ]);
    expect(canUnlock('archer.rain_of_arrows' as NodeId, owned)).toBe(true);
  });

  it('allows rain_of_arrows when barrage is owned', () => {
    const owned = new Map<NodeId, number>([
      ['archer.power_shot' as NodeId, 1],
      ['archer.multishot' as NodeId, 1],
      ['archer.barrage' as NodeId, 1],
    ]);
    expect(canUnlock('archer.rain_of_arrows' as NodeId, owned)).toBe(true);
  });
});

describe('Mutual exclusion', () => {
  const fullPath = new Map<NodeId, number>([
    ['archer.power_shot' as NodeId, 1],
    ['archer.guided' as NodeId, 1],
    ['archer.homing' as NodeId, 1],
    ['archer.rain_of_arrows' as NodeId, 1],
    ['archer.sustained_rain' as NodeId, 1],
  ]);

  it('allows burn when no elemental is owned', () => {
    expect(canUnlock('archer.burn' as NodeId, fullPath)).toBe(true);
  });

  it('blocks freeze when burn is owned', () => {
    const owned = new Map([...fullPath, ['archer.burn' as NodeId, 1]] as [NodeId, number][]);
    expect(canUnlock('archer.freeze' as NodeId, owned)).toBe(false);
  });

  it('blocks poison when freeze is owned', () => {
    const owned = new Map([...fullPath, ['archer.freeze' as NodeId, 1]] as [NodeId, number][]);
    expect(canUnlock('archer.poison' as NodeId, owned)).toBe(false);
  });

  it('blocks burn when poison is owned', () => {
    const owned = new Map([...fullPath, ['archer.poison' as NodeId, 1]] as [NodeId, number][]);
    expect(canUnlock('archer.burn' as NodeId, owned)).toBe(false);
  });
});

describe('Archer utility tree', () => {
  it('allows evade with no prerequisites', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer_utility.evade' as NodeId, owned)).toBe(true);
  });

  it('blocks combat_roll without evade', () => {
    const owned = new Map<NodeId, number>();
    expect(canUnlock('archer_utility.combat_roll' as NodeId, owned)).toBe(false);
  });

  it('allows combat_roll when evade is owned', () => {
    const owned = new Map<NodeId, number>([['archer_utility.evade' as NodeId, 1]]);
    expect(canUnlock('archer_utility.combat_roll' as NodeId, owned)).toBe(true);
  });

  it('blocks acrobatics without a tier-2 utility node', () => {
    const owned = new Map<NodeId, number>([['archer_utility.evade' as NodeId, 1]]);
    expect(canUnlock('archer_utility.acrobatics' as NodeId, owned)).toBe(false);
  });

  it('allows acrobatics when combat_roll is owned', () => {
    const owned = new Map<NodeId, number>([
      ['archer_utility.evade' as NodeId, 1],
      ['archer_utility.combat_roll' as NodeId, 1],
    ]);
    expect(canUnlock('archer_utility.acrobatics' as NodeId, owned)).toBe(true);
  });
});
