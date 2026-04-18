import { Vec2, Pillar, PILLARS } from '@arena/shared';

export function hasLineOfSight(from: Vec2, to: Vec2): boolean {
  return PILLARS.every(p => !segmentIntersectsAABB(from, to, p));
}

export function segmentIntersectsAABB(from: Vec2, to: Vec2, pillar: Pillar): boolean {
  const minX = pillar.x - pillar.halfSize;
  const maxX = pillar.x + pillar.halfSize;
  const minY = pillar.y - pillar.halfSize;
  const maxY = pillar.y + pillar.halfSize;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tMin = 0, tMax = 1;

  if (Math.abs(dx) < 1e-9) {
    if (from.x < minX || from.x > maxX) return false;
  } else {
    const t1 = (minX - from.x) / dx;
    const t2 = (maxX - from.x) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  if (Math.abs(dy) < 1e-9) {
    if (from.y < minY || from.y > maxY) return false;
  } else {
    const t1 = (minY - from.y) / dy;
    const t2 = (maxY - from.y) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }

  return tMin <= tMax;
}
