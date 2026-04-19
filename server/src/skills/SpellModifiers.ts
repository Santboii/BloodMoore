import {
  FIREBALL_SPEED, FIREBALL_RADIUS,
  TELEPORT_MAX_RANGE,
} from '@arena/shared';

export type FireballModifiers = {
  speed: number;
  radius: number;
  damageMin: number;
  damageMax: number;
  homing: boolean;
  split: number;
};

export type FirewallModifiers = {
  durationMultiplier: number;
  damageMultiplier: number;
};

export type MeteorModifiers = {
  hidden: boolean;
  moltenImpact: boolean;
};

export type TeleportModifiers = {
  maxRange: number;
  etherealForm: boolean;
  phantomStep: boolean;
};

export type SpellModifiers = {
  fireball: FireballModifiers;
  firewall: FirewallModifiers;
  meteor: MeteorModifiers;
  teleport: TeleportModifiers;
};

export function buildSpellModifiers(skills: Set<string>): SpellModifiers {
  const has = (id: string) => skills.has(id);

  let fbRadius = FIREBALL_RADIUS;
  let fbSpeed  = FIREBALL_SPEED;
  let fbDmgMin = 80;
  let fbDmgMax = 120;

  if (has('fire.volatile_ember')) fbRadius *= 1.3;
  if (has('fire.hellfire')) {
    fbRadius *= 3;
    fbSpeed  *= 0.5;
    fbDmgMin *= 2;
    fbDmgMax *= 2;
  }

  return {
    fireball: {
      speed:     fbSpeed,
      radius:    fbRadius,
      damageMin: fbDmgMin,
      damageMax: fbDmgMax,
      homing:    has('fire.seeking_flame'),
      split:     has('fire.pyroclasm') ? 3 : 0,
    },
    firewall: {
      durationMultiplier: has('fire.enduring_flames') ? 1.5 : 1,
      damageMultiplier:   has('fire.searing_heat')    ? 1.4 : 1,
    },
    meteor: {
      hidden:       has('fire.blind_strike'),
      moltenImpact: has('fire.molten_impact'),
    },
    teleport: {
      maxRange:     TELEPORT_MAX_RANGE * (has('utility.phase_shift')   ? 1.4 : 1),
      etherealForm: has('utility.ethereal_form'),
      phantomStep:  has('utility.phantom_step'),
    },
  };
}
