import { ARROW_SPEED, EVADE_RANGE, effectAtRank } from '@arena/shared';

export type ElementType = 'none' | 'burn' | 'freeze' | 'poison';

export type ArrowModifiers = {
  speed: number;
  damageMin: number;
  damageMax: number;
  homing: number;
  guidedRedirects: number;
  homingTickReduction: number;
};

export type MultishotModifiers = {
  arrowCount: number;
  damageMin: number;
  damageMax: number;
};

export type RainModifiers = {
  sustained: boolean;
  durationMultiplier: number;
  piercing: boolean;
  damageMultiplier: number;
  radiusMultiplier: number;
};

export type EvadeModifiers = {
  range: number;
  combatRoll: boolean;
  shadowstep: boolean;
  cooldownMultiplier: number;
};

export type BurnModifiers = {
  damagePerSecond: number;
  duration: number;
};

export type FreezeModifiers = {
  slowPercent: number;
  duration: number;
};

export type PoisonModifiers = {
  damagePerSecond: number;
  duration: number;
  manaRegenReduction: number;
};

export type ElementalModifiers = {
  burn: BurnModifiers;
  freeze: FreezeModifiers;
  poison: PoisonModifiers;
};

export type AmazonSpellModifiers = {
  arrow: ArrowModifiers;
  multishot: MultishotModifiers;
  rain: RainModifiers;
  evade: EvadeModifiers;
  element: ElementType;
  elemental: ElementalModifiers;
};

export function buildAmazonModifiers(skills: Map<string, number>): AmazonSpellModifiers {
  const rank = (id: string) => skills.get(id) ?? 0;
  const has = (id: string) => rank(id) > 0;

  let homing = 0;
  if (has('archer.guided')) homing = 1;

  const guidedRank = rank('archer.guided');
  const homingRank = rank('archer.homing');
  const barrageRank = rank('archer.barrage');
  const sustainedRank = rank('archer.sustained_rain');
  const piercingRank = rank('archer.piercing_rain');
  const wideRank = rank('archer.wide_rain');
  const acrobaticsRank = rank('archer_utility.acrobatics');

  let element: ElementType = 'none';
  if (has('archer.burn')) element = 'burn';
  else if (has('archer.freeze')) element = 'freeze';
  else if (has('archer.poison')) element = 'poison';

  const burnRank = rank('archer.burn');
  const freezeRank = rank('archer.freeze');
  const poisonRank = rank('archer.poison');

  return {
    arrow: {
      speed: ARROW_SPEED,
      damageMin: 60,
      damageMax: 90,
      homing,
      guidedRedirects: guidedRank,
      homingTickReduction: homingRank > 0 ? Math.floor(effectAtRank(2, homingRank)) : 0,
    },
    multishot: {
      arrowCount: 3 + (barrageRank > 0 ? Math.floor(effectAtRank(2, barrageRank)) : 0),
      damageMin: 40,
      damageMax: 60,
    },
    rain: {
      sustained: has('archer.sustained_rain'),
      durationMultiplier: sustainedRank > 0 ? 1 + effectAtRank(0.15, sustainedRank) : 1,
      piercing: has('archer.piercing_rain'),
      damageMultiplier: piercingRank > 0 ? 1 + effectAtRank(0.25, piercingRank) : 1,
      radiusMultiplier: wideRank > 0 ? 1 + effectAtRank(0.15, wideRank) : 1,
    },
    evade: {
      range: EVADE_RANGE,
      combatRoll: has('archer_utility.combat_roll'),
      shadowstep: has('archer_utility.shadowstep'),
      cooldownMultiplier: acrobaticsRank > 0 ? 1 - effectAtRank(0.10, acrobaticsRank) : 1,
    },
    element,
    elemental: {
      burn: {
        damagePerSecond: 10 + (burnRank > 0 ? effectAtRank(8, burnRank) : 0),
        duration: 3,
      },
      freeze: {
        slowPercent: 0.30 + (freezeRank > 0 ? effectAtRank(0.06, freezeRank) : 0),
        duration: 2,
      },
      poison: {
        damagePerSecond: 4 + (poisonRank > 0 ? effectAtRank(5, poisonRank) : 0),
        duration: 5,
        manaRegenReduction: 0.30 + (poisonRank > 0 ? effectAtRank(0.05, poisonRank) : 0),
      },
    },
  };
}
