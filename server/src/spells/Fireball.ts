import { Projectile, Vec2, FIREBALL_SPEED, FIREBALL_RADIUS, PLAYER_HALF_SIZE, ARENA_SIZE, DELTA } from '@arena/shared';
import { PILLARS } from '@arena/shared';
import { circleHitsAABB } from '../physics/Collision.ts';

let _id = 0;
const nextId = () => `fb_${++_id}`;

type FireballConfig = {
  speed?: number;
  radius?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: boolean;
  split?: number;
};

export function spawnFireball(
  ownerId: string,
  from: Vec2,
  target: Vec2,
  cfg: FireballConfig = {},
): Projectile {
  const speed = cfg.speed ?? FIREBALL_SPEED;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    id: nextId(),
    ownerId,
    type: 'fireball',
    position: { x: from.x, y: from.y },
    velocity: { x: (dx / len) * speed, y: (dy / len) * speed },
    radius: cfg.radius,
    damageMin: cfg.damageMin,
    damageMax: cfg.damageMax,
    homing: cfg.homing,
    split: cfg.split,
  };
}

export function advanceFireball(p: Projectile, enemyPos?: Vec2): Projectile {
  let vx = p.velocity.x;
  let vy = p.velocity.y;
  if (p.homing && enemyPos) {
    const dx = enemyPos.x - p.position.x;
    const dy = enemyPos.y - p.position.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = 60;
    vx += (dx / len) * strength * DELTA;
    vy += (dy / len) * strength * DELTA;
    const spd = Math.sqrt(p.velocity.x ** 2 + p.velocity.y ** 2);
    const newSpd = Math.sqrt(vx * vx + vy * vy) || 1;
    vx = (vx / newSpd) * spd;
    vy = (vy / newSpd) * spd;
  }
  return {
    ...p,
    velocity: { x: vx, y: vy },
    position: {
      x: p.position.x + vx * DELTA,
      y: p.position.y + vy * DELTA,
    },
  };
}

export function isFireballExpired(p: Projectile): boolean {
  const r = p.radius ?? FIREBALL_RADIUS;
  const { x, y } = p.position;
  if (x - r < 0 || x + r > ARENA_SIZE || y - r < 0 || y + r > ARENA_SIZE) return true;
  return PILLARS.some(pillar => circleHitsAABB(p.position, r, pillar));
}

export function fireballHitsPlayer(p: Projectile, playerPos: Vec2, playerId: string): boolean {
  if (p.ownerId === playerId) return false;
  const r = p.radius ?? FIREBALL_RADIUS;
  return circleHitsAABB(p.position, r, { x: playerPos.x, y: playerPos.y, halfSize: PLAYER_HALF_SIZE });
}

export function fireballDamage(p?: Projectile): number {
  const min = p?.damageMin ?? 80;
  const max = p?.damageMax ?? 120;
  return Math.floor(min + Math.random() * (max - min + 1));
}
