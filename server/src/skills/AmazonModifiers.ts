import { ARROW_SPEED, EVADE_RANGE } from '@arena/shared';

export type ElementType = 'none' | 'burn' | 'freeze' | 'poison';

export type ArrowModifiers = {
  speed: number;
  damageMin: number;
  damageMax: number;
  homing: number;
};

export type MultishotModifiers = {
  arrowCount: number;
  damageMin: number;
  damageMax: number;
};

export type RainModifiers = {
  sustained: boolean;
  piercing: boolean;
};

export type EvadeModifiers = {
  range: number;
  combatRoll: boolean;
  shadowstep: boolean;
  cooldownMultiplier: number;
};

export type AmazonSpellModifiers = {
  arrow: ArrowModifiers;
  multishot: MultishotModifiers;
  rain: RainModifiers;
  evade: EvadeModifiers;
  element: ElementType;
};

export function buildAmazonModifiers(skills: Map<string, number>): AmazonSpellModifiers {
  const has = (id: string) => (skills.get(id) ?? 0) > 0;

  let homing = 0;
  if (has('archer.homing')) homing = 2;
  else if (has('archer.guided')) homing = 1;

  let element: ElementType = 'none';
  if (has('archer.burn')) element = 'burn';
  else if (has('archer.freeze')) element = 'freeze';
  else if (has('archer.poison')) element = 'poison';

  return {
    arrow: {
      speed: ARROW_SPEED,
      damageMin: 60,
      damageMax: 90,
      homing,
    },
    multishot: {
      arrowCount: has('archer.barrage') ? 5 : 3,
      damageMin: 40,
      damageMax: 60,
    },
    rain: {
      sustained: has('archer.sustained_rain'),
      piercing: has('archer.piercing_rain'),
    },
    evade: {
      range: EVADE_RANGE,
      combatRoll: has('archer_utility.combat_roll'),
      shadowstep: has('archer_utility.shadowstep'),
      cooldownMultiplier: has('archer_utility.acrobatics') ? 0.6 : 1,
    },
    element,
  };
}
