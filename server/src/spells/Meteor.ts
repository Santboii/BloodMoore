import { MeteorState, Vec2, METEOR_DELAY_TICKS, METEOR_AOE_RADIUS } from '@arena/shared';

let _id = 0;
const nextId = () => `mt_${++_id}`;

export function spawnMeteor(ownerId: string, target: Vec2, currentTick: number): MeteorState {
  return { id: nextId(), ownerId, target: { ...target }, strikeAt: currentTick + METEOR_DELAY_TICKS };
}

export function meteorDetonates(m: MeteorState, currentTick: number): boolean {
  return currentTick >= m.strikeAt;
}

export function meteorHitsPlayer(m: MeteorState, playerPos: Vec2, playerId: string): boolean {
  if (m.ownerId === playerId) return false;
  const dx = playerPos.x - m.target.x;
  const dy = playerPos.y - m.target.y;
  return dx * dx + dy * dy < METEOR_AOE_RADIUS * METEOR_AOE_RADIUS;
}

export function meteorDamage(): number {
  return Math.floor(200 + Math.random() * 81);
}
