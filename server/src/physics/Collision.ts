import { Vec2, Pillar, PILLARS, FIREBALL_RADIUS } from '@arena/shared';

export function circleHitsAABB(center: Vec2, radius: number, pillar: Pillar): boolean {
  const closestX = Math.max(pillar.x - pillar.halfSize, Math.min(center.x, pillar.x + pillar.halfSize));
  const closestY = Math.max(pillar.y - pillar.halfSize, Math.min(center.y, pillar.y + pillar.halfSize));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export function pillarContainsPoint(point: Vec2): boolean {
  return PILLARS.some(p => circleHitsAABB(point, FIREBALL_RADIUS, p));
}

export function pointInAABB(point: Vec2, pillar: Pillar): boolean {
  return (
    point.x >= pillar.x - pillar.halfSize &&
    point.x <= pillar.x + pillar.halfSize &&
    point.y >= pillar.y - pillar.halfSize &&
    point.y <= pillar.y + pillar.halfSize
  );
}
