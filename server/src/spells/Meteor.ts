import { MeteorState, Vec2, METEOR_DELAY_TICKS, METEOR_AOE_RADIUS, PLAYER_HALF_SIZE } from '@arena/shared';

let _id = 0;
const nextId = () => `m_${++_id}`;

export function spawnMeteor(
  ownerId: string,
  target: Vec2,
  tick: number,
  opts: { hidden?: boolean; moltenImpact?: boolean } = {},
): MeteorState {
  return {
    id: nextId(),
    ownerId,
    target: { ...target },
    strikeAt: tick + METEOR_DELAY_TICKS,
    hidden: opts.hidden,
    moltenImpact: opts.moltenImpact,
  };
}

export function meteorDetonates(m: MeteorState, tick: number): boolean {
  return tick >= m.strikeAt;
}

export function meteorHitsPlayer(m: MeteorState, playerPos: Vec2, playerId: string): boolean {
  if (m.ownerId === playerId) return false;
  const dx = playerPos.x - m.target.x;
  const dy = playerPos.y - m.target.y;
  return dx * dx + dy * dy <= METEOR_AOE_RADIUS ** 2;
}

export function meteorDamage(): number {
  return Math.floor(200 + Math.random() * 81);
}
