import { Vec2, Pillar, PILLARS, FIREBALL_RADIUS, circleHitsAABB } from '@arena/shared';

export { circleHitsAABB };

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
