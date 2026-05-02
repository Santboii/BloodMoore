export type NodeId =
  | 'fire.fireball' | 'fire.volatile_ember' | 'fire.seeking_flame'
  | 'fire.hellfire' | 'fire.pyroclasm' | 'fire.fire_wall'
  | 'fire.enduring_flames' | 'fire.searing_heat' | 'fire.meteor'
  | 'fire.molten_impact' | 'fire.blind_strike'
  | 'utility.teleport' | 'utility.phase_shift'
  | 'utility.ethereal_form' | 'utility.phantom_step'
  | 'archer.power_shot' | 'archer.guided' | 'archer.multishot'
  | 'archer.homing' | 'archer.barrage' | 'archer.rain_of_arrows'
  | 'archer.sustained_rain' | 'archer.piercing_rain'
  | 'archer.burn' | 'archer.freeze' | 'archer.poison'
  | 'archer_utility.evade' | 'archer_utility.combat_roll'
  | 'archer_utility.shadowstep' | 'archer_utility.acrobatics';

export type SkillTree = 'fire' | 'lightning' | 'frost' | 'utility' | 'archer' | 'archer_utility';

export type StackableConfig = {
  softCap: number;
  baseEffect: number;
};

export type SkillNode = {
  id: NodeId;
  name: string;
  tree: SkillTree;
  tier: number;
  cost: number;
  isSpell: boolean;
  description: string;
  stackable?: StackableConfig;
};

export type Gate = { requiresAll?: NodeId[]; requiresAny?: NodeId[]; mutuallyExclusive?: NodeId[] };

export const GATES: Partial<Record<NodeId, Gate>> = {
  'fire.volatile_ember':  { requiresAll: ['fire.fireball'] },
  'fire.seeking_flame':   { requiresAll: ['fire.fireball'] },
  'fire.hellfire':        { requiresAll: ['fire.fireball'] },
  'fire.pyroclasm':       { requiresAll: ['fire.fireball'] },
  'fire.fire_wall':       { requiresAll: ['fire.fireball'], requiresAny: ['fire.volatile_ember', 'fire.seeking_flame'] },
  'fire.enduring_flames': { requiresAll: ['fire.fire_wall'] },
  'fire.searing_heat':    { requiresAll: ['fire.fire_wall'] },
  'fire.meteor':          { requiresAll: ['fire.fire_wall'], requiresAny: ['fire.enduring_flames', 'fire.searing_heat'] },
  'fire.molten_impact':   { requiresAll: ['fire.meteor'] },
  'fire.blind_strike':    { requiresAll: ['fire.meteor'] },
  'utility.phase_shift':   { requiresAll: ['utility.teleport'] },
  'utility.ethereal_form': { requiresAll: ['utility.teleport'] },
  'utility.phantom_step':  { requiresAll: ['utility.teleport'], requiresAny: ['utility.phase_shift', 'utility.ethereal_form'] },
  // Archer tree
  'archer.guided':          { requiresAll: ['archer.power_shot'] },
  'archer.multishot':       { requiresAll: ['archer.power_shot'] },
  'archer.homing':          { requiresAll: ['archer.guided'] },
  'archer.barrage':         { requiresAll: ['archer.multishot'] },
  'archer.rain_of_arrows':  { requiresAll: ['archer.power_shot'], requiresAny: ['archer.homing', 'archer.barrage'] },
  'archer.sustained_rain':  { requiresAll: ['archer.rain_of_arrows'] },
  'archer.piercing_rain':   { requiresAll: ['archer.rain_of_arrows'] },
  'archer.burn':            { requiresAll: ['archer.rain_of_arrows'], requiresAny: ['archer.sustained_rain', 'archer.piercing_rain'], mutuallyExclusive: ['archer.freeze', 'archer.poison'] },
  'archer.freeze':          { requiresAll: ['archer.rain_of_arrows'], requiresAny: ['archer.sustained_rain', 'archer.piercing_rain'], mutuallyExclusive: ['archer.burn', 'archer.poison'] },
  'archer.poison':          { requiresAll: ['archer.rain_of_arrows'], requiresAny: ['archer.sustained_rain', 'archer.piercing_rain'], mutuallyExclusive: ['archer.burn', 'archer.freeze'] },
  // Archer utility tree
  'archer_utility.combat_roll': { requiresAll: ['archer_utility.evade'] },
  'archer_utility.shadowstep':  { requiresAll: ['archer_utility.evade'] },
  'archer_utility.acrobatics':  { requiresAll: ['archer_utility.evade'], requiresAny: ['archer_utility.combat_roll', 'archer_utility.shadowstep'] },
};

export function canUnlock(id: NodeId, owned: { has(id: NodeId): boolean }): boolean {
  const gate = GATES[id];
  if (!gate) return true;
  if (gate.requiresAll && !gate.requiresAll.every(r => owned.has(r))) return false;
  if (gate.requiresAny && !gate.requiresAny.some(r => owned.has(r))) return false;
  if (gate.mutuallyExclusive && gate.mutuallyExclusive.some(r => owned.has(r))) return false;
  return true;
}

export const SKILL_NODES: SkillNode[] = [
  { id: 'fire.fireball',        name: 'Fireball',        tree: 'fire',    tier: 1, cost: 1, isSpell: true,  description: 'Fast projectile. 80–120 damage.' },
  { id: 'fire.volatile_ember',  name: 'Volatile Ember',  tree: 'fire',    tier: 2, cost: 1, isSpell: false, description: 'Larger fireball per rank.', stackable: { softCap: 5, baseEffect: 0.4 } },
  { id: 'fire.seeking_flame',   name: 'Seeking Flame',   tree: 'fire',    tier: 2, cost: 1, isSpell: false, description: 'Homing toward enemy. Stronger per rank.', stackable: { softCap: 5, baseEffect: 12 } },
  { id: 'fire.hellfire',        name: 'Hellfire',        tree: 'fire',    tier: 3, cost: 2, isSpell: false, description: 'Larger, slower, harder-hitting fireball per rank.', stackable: { softCap: 3, baseEffect: 1.0 } },
  { id: 'fire.pyroclasm',       name: 'Pyroclasm',       tree: 'fire',    tier: 3, cost: 2, isSpell: false, description: 'Fireball splits on impact. More splits per rank.', stackable: { softCap: 3, baseEffect: 1 } },
  { id: 'fire.fire_wall',       name: 'Fire Wall',       tree: 'fire',    tier: 4, cost: 2, isSpell: true,  description: 'Persistent fire barrier. 40 dmg/s.' },
  { id: 'fire.enduring_flames', name: 'Enduring Flames', tree: 'fire',    tier: 5, cost: 1, isSpell: false, description: '+10% Fire Wall duration per rank.', stackable: { softCap: 5, baseEffect: 0.10 } },
  { id: 'fire.searing_heat',    name: 'Searing Heat',    tree: 'fire',    tier: 5, cost: 2, isSpell: false, description: '+8% Fire Wall damage per rank.', stackable: { softCap: 5, baseEffect: 0.08 } },
  { id: 'fire.meteor',          name: 'Meteor',          tree: 'fire',    tier: 6, cost: 3, isSpell: true,  description: 'Delayed AoE strike. 200–280 damage.' },
  { id: 'fire.molten_impact',   name: 'Molten Impact',   tree: 'fire',    tier: 7, cost: 2, isSpell: false, description: 'Meteor leaves a burning crater for 3s.' },
  { id: 'fire.blind_strike',    name: 'Blind Strike',    tree: 'fire',    tier: 7, cost: 2, isSpell: false, description: 'Enemy cannot see the Meteor impact indicator.' },
  { id: 'utility.teleport',     name: 'Teleport',        tree: 'utility', tier: 1, cost: 1, isSpell: true,  description: 'Instant displacement.' },
  { id: 'utility.phase_shift',  name: 'Phase Shift',     tree: 'utility', tier: 2, cost: 2, isSpell: false, description: '+8% teleport range per rank.', stackable: { softCap: 5, baseEffect: 0.08 } },
  { id: 'utility.ethereal_form',name: 'Ethereal Form',   tree: 'utility', tier: 2, cost: 2, isSpell: false, description: '0.5s invulnerability after teleporting.' },
  { id: 'utility.phantom_step', name: 'Phantom Step',    tree: 'utility', tier: 3, cost: 3, isSpell: false, description: 'Next cast is instant within 2s of teleporting.' },
  // Archer tree
  { id: 'archer.power_shot',      name: 'Power Shot',      tree: 'archer', tier: 1, cost: 1, isSpell: true,  description: 'Fast arrow projectile. 60–90 damage.' },
  { id: 'archer.guided',          name: 'Guided',          tree: 'archer', tier: 2, cost: 1, isSpell: false, description: 'Power Shot homes. Faster redirect per rank.', stackable: { softCap: 5, baseEffect: 3 } },
  { id: 'archer.multishot',       name: 'Multi-shot',      tree: 'archer', tier: 2, cost: 2, isSpell: true,  description: 'Fire 3 arrows in a spread. 40–60 damage each.' },
  { id: 'archer.homing',          name: 'Homing',          tree: 'archer', tier: 3, cost: 2, isSpell: false, description: 'Power Shot snaps faster. Stronger per rank.', stackable: { softCap: 3, baseEffect: 2 } },
  { id: 'archer.barrage',         name: 'Barrage',         tree: 'archer', tier: 3, cost: 2, isSpell: false, description: 'Multi-shot gains extra arrows per rank.', stackable: { softCap: 5, baseEffect: 1 } },
  { id: 'archer.rain_of_arrows',  name: 'Rain of Arrows',  tree: 'archer', tier: 4, cost: 2, isSpell: true,  description: 'Mark a zone. Arrows rain after 1.5s. 150–220 AoE damage.' },
  { id: 'archer.sustained_rain',  name: 'Sustained Rain',  tree: 'archer', tier: 5, cost: 1, isSpell: false, description: 'Rain zone lasts longer per rank.', stackable: { softCap: 5, baseEffect: 0.15 } },
  { id: 'archer.piercing_rain',   name: 'Piercing Rain',   tree: 'archer', tier: 5, cost: 2, isSpell: false, description: 'Rain damage increases per rank.', stackable: { softCap: 3, baseEffect: 0.25 } },
  { id: 'archer.burn',            name: 'Burn',            tree: 'archer', tier: 6, cost: 3, isSpell: false, description: 'Arrows burn. More damage per rank.', stackable: { softCap: 5, baseEffect: 8 } },
  { id: 'archer.freeze',          name: 'Freeze',          tree: 'archer', tier: 6, cost: 3, isSpell: false, description: 'Arrows freeze. Stronger slow per rank.', stackable: { softCap: 5, baseEffect: 0.06 } },
  { id: 'archer.poison',          name: 'Poison',          tree: 'archer', tier: 6, cost: 3, isSpell: false, description: 'Arrows poison. More damage and mana drain per rank.', stackable: { softCap: 5, baseEffect: 5 } },
  // Archer utility tree
  { id: 'archer_utility.evade',        name: 'Evade',        tree: 'archer_utility', tier: 1, cost: 1, isSpell: true,  description: 'Short dash with invulnerability frames (~0.3s).' },
  { id: 'archer_utility.combat_roll',  name: 'Combat Roll',  tree: 'archer_utility', tier: 2, cost: 2, isSpell: false, description: 'Fire an arrow at the nearest enemy during evade.' },
  { id: 'archer_utility.shadowstep',   name: 'Shadowstep',   tree: 'archer_utility', tier: 2, cost: 2, isSpell: false, description: 'Become invisible for 0.5s after evading.' },
  { id: 'archer_utility.acrobatics',   name: 'Acrobatics',   tree: 'archer_utility', tier: 3, cost: 3, isSpell: false, description: 'Evade cooldown reduced per rank.', stackable: { softCap: 3, baseEffect: 0.10 } },
];

export const HELLFIRE_RADIUS_RATIO = 0.5;
export const HELLFIRE_DAMAGE_RATIO = 0.3;
export const HELLFIRE_SPEED_RATIO = 0.15;

export const DIMINISHING_POWER = 0.7;

export function effectAtRank(baseEffect: number, rank: number): number {
  if (rank <= 0) return 0;
  return baseEffect * Math.pow(rank, DIMINISHING_POWER);
}

export function isStackable(node: SkillNode): boolean {
  return node.stackable !== undefined;
}

export function rankUpCost(node: SkillNode, currentRank: number): number {
  if (!node.stackable) return currentRank === 0 ? node.cost : Infinity;
  const nextRank = currentRank + 1;
  const overCap = Math.max(0, nextRank - node.stackable.softCap);
  return node.cost + overCap;
}

export function totalSpentForRanks(node: SkillNode, rank: number): number {
  let total = 0;
  for (let r = 0; r < rank; r++) {
    total += rankUpCost(node, r);
  }
  return total;
}
