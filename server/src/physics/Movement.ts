import { Vec2, PLAYER_SPEED, PLAYER_HALF_SIZE, ARENA_SIZE, PILLARS, DELTA } from '@arena/shared';

export function movePlayer(position: Vec2, input: Vec2): Vec2 {
  const len = Math.sqrt(input.x * input.x + input.y * input.y);
  if (len === 0) return position;
  const nx = input.x / len;
  const ny = input.y / len;
  const moved = {
    x: position.x + nx * PLAYER_SPEED * DELTA,
    y: position.y + ny * PLAYER_SPEED * DELTA,
  };
  return clampToArena(moved);
}

export function resolvePlayerPillarCollisions(pos: Vec2): Vec2 {
  let p = { ...pos };
  for (const pillar of PILLARS) {
    const minX = pillar.x - pillar.halfSize - PLAYER_HALF_SIZE;
    const maxX = pillar.x + pillar.halfSize + PLAYER_HALF_SIZE;
    const minY = pillar.y - pillar.halfSize - PLAYER_HALF_SIZE;
    const maxY = pillar.y + pillar.halfSize + PLAYER_HALF_SIZE;
    if (p.x > minX && p.x < maxX && p.y > minY && p.y < maxY) {
      const dLeft   = p.x - minX;
      const dRight  = maxX - p.x;
      const dTop    = p.y - minY;
      const dBottom = maxY - p.y;
      const min = Math.min(dLeft, dRight, dTop, dBottom);
      if (min === dLeft)        p.x = minX;
      else if (min === dRight)  p.x = maxX;
      else if (min === dTop)    p.y = minY;
      else                      p.y = maxY;
    }
  }
  return p;
}

function clampToArena(pos: Vec2): Vec2 {
  return {
    x: Math.max(PLAYER_HALF_SIZE, Math.min(ARENA_SIZE - PLAYER_HALF_SIZE, pos.x)),
    y: Math.max(PLAYER_HALF_SIZE, Math.min(ARENA_SIZE - PLAYER_HALF_SIZE, pos.y)),
  };
}
