export type Vec2 = { x: number; y: number };

export type SpellId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type ProjectileType = 'fireball' | 'arrow';

export type Segment = { x1: number; y1: number; x2: number; y2: number };

export type PlayerState = {
  id: string;
  displayName: string;
  position: Vec2;
  hp: number;
  mana: number;
  facing: number;
  castingSpell: SpellId | null;
  cooldowns: Partial<Record<SpellId, number>>;
  invulnUntil?: number;
  phantomStepUntil?: number;
  teleported?: Vec2;
  teamId?: string;
};

export type Projectile = {
  id: string;
  ownerId: string;
  type: ProjectileType;
  position: Vec2;
  velocity: Vec2;
  radius?: number;
  blastRadius?: number;
  damageMin?: number;
  damageMax?: number;
  homing?: number;
  split?: number;
};

export type FireWallState = {
  id: string;
  ownerId: string;
  segments: Segment[];
  expiresAt: number; // server tick
  shape?: 'circle';
  center?: Vec2;
  radius?: number;
};

export type MeteorState = {
  id: string;
  ownerId: string;
  target: Vec2;
  strikeAt: number;
  hidden?: boolean;
  moltenImpact?: boolean;
};

export type RainOfArrowsState = {
  id: string;
  ownerId: string;
  target: Vec2;
  radius: number;
  strikeAt: number;
  sustained?: boolean;
  piercing?: boolean;
};

export type GameState = {
  tick: number;
  players: Record<string, PlayerState>;
  projectiles: Projectile[];
  fireWalls: FireWallState[];
  meteors: MeteorState[];
  rainOfArrows: RainOfArrowsState[];
  phase: 'waiting' | 'countdown' | 'dueling' | 'ended';
  winner: string | null;
  gameMode: GameModeType;
  teams?: Record<string, string[]>;
  ack?: Record<string, number>;
};

export type InputFrame = {
  seq?: number;
  move: Vec2;
  castSpell: SpellId | null;
  aimTarget: Vec2;
  aimTarget2?: Vec2; // drag end for Fire Wall
};

export type Pillar = { x: number; y: number; halfSize: number };

// ── Constants ──────────────────────────────────────────────────────────────

export const ARENA_SIZE = 2000;
export const PLAYER_HALF_SIZE = 16;
export const PLAYER_SPEED = 200;   // units/sec
export const TICK_RATE = 60;
export const DELTA = 1 / TICK_RATE;
export const MAX_HP = 750;
export const MAX_MANA = 500;
export const MANA_REGEN_PER_TICK = 18 / TICK_RATE;

export const PILLARS: Pillar[] = [
  { x: 350,  y: 300,  halfSize: 28 },
  { x: 1000, y: 250,  halfSize: 28 },
  { x: 1650, y: 300,  halfSize: 28 },
  { x: 400,  y: 750,  halfSize: 28 },
  { x: 1600, y: 750,  halfSize: 28 },
  { x: 1000, y: 1000, halfSize: 28 },
  { x: 350,  y: 1450, halfSize: 28 },
  { x: 750,  y: 1700, halfSize: 28 },
  { x: 1250, y: 1700, halfSize: 28 },
  { x: 1650, y: 1450, halfSize: 28 },
];

export const FIREBALL_SPEED = 400;
export const FIREBALL_RADIUS = 10; // world units

export const FIREWALL_MAX_LENGTH = 200;
export const FIREWALL_DURATION_TICKS = 4 * TICK_RATE;   // 240
export const FIREWALL_DAMAGE_PER_TICK = 40 / TICK_RATE;

export const METEOR_DELAY_TICKS = Math.round(1.5 * TICK_RATE); // 90
export const METEOR_AOE_RADIUS = 60; // world units

export const ARROW_SPEED = 560;
export const ARROW_RADIUS = 6;
export const MULTISHOT_SPREAD_3 = Math.PI / 12;
export const MULTISHOT_SPREAD_5 = Math.PI / 9;
export const RAIN_DELAY_TICKS = Math.round(1.5 * TICK_RATE);
export const RAIN_AOE_RADIUS = 70;
export const RAIN_SUSTAINED_TICKS = 3 * TICK_RATE;
export const RAIN_DAMAGE_PER_TICK = 30 / TICK_RATE;
export const EVADE_RANGE = 300;
export const EVADE_INVULN_TICKS = Math.round(0.3 * TICK_RATE);

export const SPELL_CONFIG: Record<SpellId, { manaCost: number; cooldownTicks: number }> = {
  1: { manaCost: 25,  cooldownTicks: 30  },
  2: { manaCost: 60,  cooldownTicks: 180 },
  3: { manaCost: 100, cooldownTicks: 300 },
  4: { manaCost: 40,  cooldownTicks: 0   },
  5: { manaCost: 20,  cooldownTicks: 24  },
  6: { manaCost: 50,  cooldownTicks: 120 },
  7: { manaCost: 80,  cooldownTicks: 240 },
  8: { manaCost: 30,  cooldownTicks: 90  },
};

export const TELEPORT_MAX_RANGE = 600;

// Spawn positions (left and right side, centered vertically)
export const SPAWN_POSITIONS: Vec2[] = [
  { x: 200,  y: 1000 },
  { x: 1800, y: 1000 },
];

export type GameModeType = '1v1' | 'ffa' | '2v2';

export interface GameModeConfig {
  type: GameModeType;
  label: string;
  minPlayers: number;
  maxPlayers: number;
  teamsEnabled: boolean;
  teamCount?: number;
  playersPerTeam?: number;
  friendlyFireMultiplier: number;
  spawnPositions: Vec2[];
  checkWinCondition(
    players: Record<string, PlayerState>,
    teams?: Record<string, string[]>,
  ): { phase: 'dueling' | 'ended'; winner: string | null };
}

export const DISCONNECT_TIMEOUT_MS = 30_000;
export const REMATCH_COUNTDOWN_MS = 10_000;
