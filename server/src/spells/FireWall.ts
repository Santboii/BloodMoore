import {
  Vec2, FireWallState, Segment, Pillar, PILLARS,
  FIREWALL_MAX_LENGTH, FIREWALL_DURATION_TICKS, PLAYER_HALF_SIZE,
} from '@arena/shared';
import { segmentIntersectsAABB } from '../physics/LineOfSight.ts';

let _id = 0;
const nextId = () => `fw_${++_id}`;

export function spawnFireWall(
  ownerId: string,
  from: Vec2,
  to: Vec2,
  currentTick: number,
  durationMultiplier = 1,
): FireWallState {
  return {
    id: nextId(),
    ownerId,
    segments: buildWallSegments(from, to),
    expiresAt: currentTick + Math.round(FIREWALL_DURATION_TICKS * durationMultiplier),
  };
}

export function buildWallSegments(from: Vec2, to: Vec2): Segment[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const clampedLen = Math.min(len, FIREWALL_MAX_LENGTH);
  const end: Vec2 = { x: from.x + (dx / len) * clampedLen, y: from.y + (dy / len) * clampedLen };

  const blocked: [number, number][] = [];
  for (const pillar of PILLARS) {
    const range = getPillarBlockRange(from, end, pillar);
    if (range) blocked.push(range);
  }

  if (blocked.length === 0) return [{ x1: from.x, y1: from.y, x2: end.x, y2: end.y }];

  blocked.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of blocked) {
    if (!merged.length || r[0] > merged[merged.length - 1][1]) {
      merged.push([r[0], r[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    }
  }

  const lerp = (t: number): Vec2 => ({ x: from.x + (end.x - from.x) * t, y: from.y + (end.y - from.y) * t });
  const segments: Segment[] = [];
  let prev = 0;
  for (const [start, stop] of merged) {
    if (start > prev) {
      const a = lerp(prev); const b = lerp(start);
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    prev = stop;
  }
  if (prev < 1) {
    const a = lerp(prev);
    segments.push({ x1: a.x, y1: a.y, x2: end.x, y2: end.y });
  }
  return segments;
}

function getPillarBlockRange(from: Vec2, to: Vec2, pillar: Pillar): [number, number] | null {
  const minX = pillar.x - pillar.halfSize;
  const maxX = pillar.x + pillar.halfSize;
  const minY = pillar.y - pillar.halfSize;
  const maxY = pillar.y + pillar.halfSize;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tMin = 0, tMax = 1;

  if (Math.abs(dx) < 1e-9) {
    if (from.x < minX || from.x > maxX) return null;
  } else {
    const t1 = (minX - from.x) / dx;
    const t2 = (maxX - from.x) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (Math.abs(dy) < 1e-9) {
    if (from.y < minY || from.y > maxY) return null;
  } else {
    const t1 = (minY - from.y) / dy;
    const t2 = (maxY - from.y) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMin > tMax) return null;
  return [tMin, tMax];
}

export function fireWallDamagesPlayer(fw: FireWallState, playerPos: Vec2, playerId: string): boolean {
  if (fw.ownerId === playerId) return false;
  const threshold = PLAYER_HALF_SIZE + 8;
  return fw.segments.some(seg => pointToSegmentDist(playerPos, seg) < threshold);
}

function pointToSegmentDist(p: Vec2, seg: Segment): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - seg.x1) ** 2 + (p.y - seg.y1) ** 2);
  const t = Math.max(0, Math.min(1, ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / lenSq));
  const cx = seg.x1 + t * dx;
  const cy = seg.y1 + t * dy;
  return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}
