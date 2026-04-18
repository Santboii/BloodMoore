import { describe, it, expect } from 'vitest';
import { spawnFireWall, fireWallDamagesPlayer, buildWallSegments } from '../src/spells/FireWall.ts';
import { FIREWALL_DURATION_TICKS, FIREWALL_MAX_LENGTH } from '@arena/shared';

describe('buildWallSegments', () => {
  it('returns a single segment when path is clear of pillars', () => {
    // 180-unit line at y=250, well clear of all pillars, under FIREWALL_MAX_LENGTH
    const segs = buildWallSegments({ x: 200, y: 250 }, { x: 380, y: 250 });
    expect(segs.length).toBe(1);
    expect(segs[0].x1).toBeCloseTo(200);
    expect(segs[0].x2).toBeCloseTo(380);
  });

  it('splits the wall when a pillar is in the path', () => {
    // 200-unit line through pillar at 400,750 (pillar halfSize=28, spans x=372–428)
    const segs = buildWallSegments({ x: 320, y: 750 }, { x: 520, y: 750 });
    expect(segs.length).toBe(2);
  });

  it('clamps wall length to FIREWALL_MAX_LENGTH (200)', () => {
    const segs = buildWallSegments({ x: 100, y: 100 }, { x: 900, y: 100 });
    const totalLen = segs.reduce((acc, s) => {
      const dx = s.x2 - s.x1; const dy = s.y2 - s.y1;
      return acc + Math.sqrt(dx * dx + dy * dy);
    }, 0);
    expect(totalLen).toBeLessThanOrEqual(FIREWALL_MAX_LENGTH + 0.01);
  });
});

describe('spawnFireWall', () => {
  it('sets expiresAt to current tick + FIREWALL_DURATION_TICKS', () => {
    const fw = spawnFireWall('p1', { x: 200, y: 250 }, { x: 400, y: 250 }, 100);
    expect(fw.expiresAt).toBe(100 + FIREWALL_DURATION_TICKS);
    expect(fw.ownerId).toBe('p1');
  });
});

describe('fireWallDamagesPlayer', () => {
  it('returns true when player is on a fire wall segment', () => {
    // Wall at y=250 (clear of pillars), player standing on it
    const fw = spawnFireWall('p1', { x: 100, y: 250 }, { x: 300, y: 250 }, 0);
    expect(fireWallDamagesPlayer(fw, { x: 200, y: 250 }, 'p2')).toBe(true);
  });

  it('returns false when player is far from the wall', () => {
    const fw = spawnFireWall('p1', { x: 100, y: 100 }, { x: 300, y: 100 }, 0);
    expect(fireWallDamagesPlayer(fw, { x: 400, y: 600 }, 'p2')).toBe(false);
  });
});
