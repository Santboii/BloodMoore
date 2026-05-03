import { RainOfArrowsState, Vec2, RAIN_DELAY_TICKS, RAIN_AOE_RADIUS, PLAYER_HALF_SIZE } from '@arena/shared';

let _id = 0;
const nextId = () => `rain_${++_id}`;

type RainConfig = {
  sustained?: boolean;
  piercing?: boolean;
  radiusMultiplier?: number;
};

export function spawnRainOfArrows(
  ownerId: string,
  target: Vec2,
  currentTick: number,
  cfg: RainConfig = {},
): RainOfArrowsState {
  return {
    id: nextId(),
    ownerId,
    target: { ...target },
    radius: RAIN_AOE_RADIUS * (cfg.radiusMultiplier ?? 1),
    strikeAt: currentTick + RAIN_DELAY_TICKS,
    sustained: cfg.sustained,
    piercing: cfg.piercing,
  };
}

export function rainDetonates(rain: RainOfArrowsState, tick: number): boolean {
  return tick >= rain.strikeAt;
}

export function rainHitsPlayer(rain: RainOfArrowsState, playerPos: Vec2, playerId: string): boolean {
  if (rain.ownerId === playerId) return false;
  const dx = playerPos.x - rain.target.x;
  const dy = playerPos.y - rain.target.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist <= rain.radius + PLAYER_HALF_SIZE;
}

export function rainDamage(piercing: boolean): number {
  const min = 150;
  const max = 220;
  const base = Math.floor(min + Math.random() * (max - min + 1));
  return piercing ? base * 2 : base;
}
