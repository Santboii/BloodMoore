export type Vec2 = { x: number; y: number };

export type PlayerState = {
  id: string;
  displayName: string;
  position: Vec2;
  hp: number;
  mana: number;
  facing: number;
  castingSpell: number | null;
  cooldowns: Record<number, number>; // spell key -> ticks remaining
};

export type Projectile = {
  id: string;
  ownerId: string;
  type: 'fireball';
  position: Vec2;
  velocity: Vec2;
};

export type FireWallState = {
  id: string;
  ownerId: string;
  segments: { x1: number; y1: number; x2: number; y2: number }[];
  expiresAt: number; // server tick
};

export type MeteorState = {
  id: string;
  ownerId: string;
  target: Vec2;
  strikeAt: number; // server tick
};

export type GameState = {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  fireWalls: FireWallState[];
  meteors: MeteorState[];
  phase: 'waiting' | 'countdown' | 'dueling' | 'ended';
  winner: string | null;
};

export type InputFrame = {
  move: Vec2;
  castSpell: 1 | 2 | 3 | null;
  aimTarget: Vec2;
  aimTarget2?: Vec2; // drag end for Fire Wall
};

export type Pillar = { x: number; y: number; halfSize: number };

// ── Constants ──────────────────────────────────────────────────────────────

export const ARENA_SIZE = 800;
export const PLAYER_HALF_SIZE = 16;
export const PLAYER_SPEED = 200;   // units/sec
export const TICK_RATE = 60;
export const DELTA = 1 / TICK_RATE;
export const MAX_HP = 500;
export const MAX_MANA = 300;
export const MANA_REGEN_PER_TICK = 10 / TICK_RATE;

export const PILLARS: Pillar[] = [
  { x: 160, y: 160, halfSize: 28 },
  { x: 640, y: 160, halfSize: 28 },
  { x: 400, y: 400, halfSize: 28 },
  { x: 160, y: 640, halfSize: 28 },
  { x: 640, y: 640, halfSize: 28 },
];

export const FIREBALL_SPEED = 400;
export const FIREBALL_RADIUS = 10;

export const FIREWALL_MAX_LENGTH = 200;
export const FIREWALL_DURATION_TICKS = 4 * TICK_RATE;   // 240
export const FIREWALL_DAMAGE_PER_TICK = 40 / TICK_RATE;

export const METEOR_DELAY_TICKS = Math.round(1.5 * TICK_RATE); // 90
export const METEOR_AOE_RADIUS = 60;

export const SPELL_CONFIG: Record<number, { manaCost: number; cooldownTicks: number }> = {
  1: { manaCost: 25,  cooldownTicks: 30  },  // 0.5s
  2: { manaCost: 60,  cooldownTicks: 180 },  // 3s
  3: { manaCost: 100, cooldownTicks: 300 },  // 5s
};

// Spawn positions (left and right side, centered vertically)
export const SPAWN_POSITIONS: Vec2[] = [
  { x: 80,  y: 400 },
  { x: 720, y: 400 },
];
