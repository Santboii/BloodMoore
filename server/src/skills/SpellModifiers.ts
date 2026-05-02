import {
  FIREBALL_SPEED, FIREBALL_RADIUS,
  TELEPORT_MAX_RANGE,
  effectAtRank,
  HELLFIRE_RADIUS_RATIO, HELLFIRE_DAMAGE_RATIO, HELLFIRE_SPEED_RATIO,
} from '@arena/shared';

export type FireballModifiers = {
  speed: number;
  radius: number;
  blastRadius: number;
  damageMin: number;
  damageMax: number;
  homingStrength: number;
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

export function buildSpellModifiers(skills: Map<string, number>): SpellModifiers {
  const rank = (id: string) => skills.get(id) ?? 0;

  const veRank = rank('fire.volatile_ember');
  const hfRank = rank('fire.hellfire');

  let fbRadius = FIREBALL_RADIUS;
  let fbBlastRadius = FIREBALL_RADIUS;
  let fbSpeed  = FIREBALL_SPEED;
  let fbDmgMin = 80;
  let fbDmgMax = 120;

  if (hfRank > 0) {
    const e = effectAtRank(1.0, hfRank);
    fbRadius *= 1 + HELLFIRE_RADIUS_RATIO * e;
    fbBlastRadius *= 1 + HELLFIRE_RADIUS_RATIO * e;
    fbSpeed  *= 1 - HELLFIRE_SPEED_RATIO * e;
    fbDmgMin *= 1 + HELLFIRE_DAMAGE_RATIO * e;
    fbDmgMax *= 1 + HELLFIRE_DAMAGE_RATIO * e;
  }
  if (veRank > 0) fbBlastRadius *= 1 + effectAtRank(0.4, veRank);

  const sfRank = rank('fire.seeking_flame');
  const pyRank = rank('fire.pyroclasm');

  return {
    fireball: {
      speed:          fbSpeed,
      radius:         fbRadius,
      blastRadius:    fbBlastRadius,
      damageMin:      fbDmgMin,
      damageMax:      fbDmgMax,
      homingStrength: sfRank > 0 ? 12 * Math.pow(sfRank, 1.65) : 0,
      split:          pyRank > 0 ? Math.floor(effectAtRank(1, pyRank)) : 0,
    },
    firewall: {
      durationMultiplier: rank('fire.enduring_flames') > 0 ? 1 + effectAtRank(0.10, rank('fire.enduring_flames')) : 1,
      damageMultiplier:   rank('fire.searing_heat') > 0    ? 1 + effectAtRank(0.08, rank('fire.searing_heat'))    : 1,
    },
    meteor: {
      hidden:       rank('fire.blind_strike') > 0,
      moltenImpact: rank('fire.molten_impact') > 0,
    },
    teleport: {
      maxRange:     TELEPORT_MAX_RANGE * (rank('utility.phase_shift') > 0 ? 1 + effectAtRank(0.08, rank('utility.phase_shift')) : 1),
      etherealForm: rank('utility.ethereal_form') > 0,
      phantomStep:  rank('utility.phantom_step') > 0,
    },
  };
}
