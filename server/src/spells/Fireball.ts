import { Projectile, Vec2, FIREBALL_SPEED, FIREBALL_RADIUS, PLAYER_HALF_SIZE, ARENA_SIZE } from '@arena/shared';
import { PILLARS, DELTA } from '@arena/shared';
import { circleHitsAABB } from '../physics/Collision.ts';

let _id = 0;
const nextId = () => `fb_${++_id}`;

export function spawnFireball(ownerId: string, from: Vec2, target: Vec2): Projectile {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    id: nextId(),
    ownerId,
    type: 'fireball',
    position: { x: from.x, y: from.y },
    velocity: { x: (dx / len) * FIREBALL_SPEED, y: (dy / len) * FIREBALL_SPEED },
  };
}

export function advanceFireball(p: Projectile): Projectile {
  return {
    ...p,
    position: {
      x: p.position.x + p.velocity.x * DELTA,
      y: p.position.y + p.velocity.y * DELTA,
    },
  };
}

export function isFireballExpired(p: Projectile): boolean {
  const { x, y } = p.position;
  if (x - FIREBALL_RADIUS < 0 || x + FIREBALL_RADIUS > ARENA_SIZE || y - FIREBALL_RADIUS < 0 || y + FIREBALL_RADIUS > ARENA_SIZE) return true;
  return PILLARS.some(pillar => circleHitsAABB(p.position, FIREBALL_RADIUS, pillar));
}

export function fireballHitsPlayer(p: Projectile, playerPos: Vec2, playerId: string): boolean {
  if (p.ownerId === playerId) return false;
  const playerBox = { x: playerPos.x, y: playerPos.y, halfSize: PLAYER_HALF_SIZE };
  return circleHitsAABB(p.position, FIREBALL_RADIUS, playerBox);
}

export function fireballDamage(): number {
  return Math.floor(80 + Math.random() * 41);
}
