import {
  GameState, PlayerState, InputFrame, Vec2,
  SPELL_CONFIG, MAX_HP, MAX_MANA, MANA_REGEN_PER_TICK, FIREWALL_DAMAGE_PER_TICK,
} from '@arena/shared';
import { movePlayer } from '../physics/Movement.ts';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../spells/Fireball.ts';
import { spawnFireWall, fireWallDamagesPlayer } from '../spells/FireWall.ts';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../spells/Meteor.ts';

export type PlayerInit = { id: string; displayName: string; spawnPos: Vec2 };

export function makeInitialState(players: PlayerInit[]): GameState {
  const playerMap: Record<string, PlayerState> = {};
  for (const p of players) {
    playerMap[p.id] = {
      id: p.id,
      displayName: p.displayName,
      position: { ...p.spawnPos },
      hp: MAX_HP,
      mana: MAX_MANA,
      facing: 0,
      castingSpell: null,
      cooldowns: {},
    };
  }
  return { tick: 0, players: playerMap, projectiles: [], fireWalls: [], meteors: [], phase: 'dueling', winner: null };
}

export function advanceState(state: GameState, inputs: Record<string, InputFrame>): GameState {
  const players = deepCopyPlayers(state.players);

  // 1. Move players and apply mana regen
  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p) continue;
    const newMana = Math.min(MAX_MANA, p.mana + MANA_REGEN_PER_TICK);
    const newFacing = input.aimTarget
      ? Math.atan2(input.aimTarget.y - p.position.y, input.aimTarget.x - p.position.x)
      : p.facing;
    const newCooldowns: Record<number, number> = {};
    for (const [k, v] of Object.entries(p.cooldowns)) {
      const remaining = (v as number) - 1;
      if (remaining > 0) newCooldowns[Number(k)] = remaining;
    }
    players[id] = {
      ...p,
      position: movePlayer(p.position, input.move),
      mana: newMana,
      facing: newFacing,
      cooldowns: newCooldowns,
    };
  }

  // 2. Process spell casts
  let projectiles = [...state.projectiles];
  let fireWalls = [...state.fireWalls];
  let meteors = [...state.meteors];
  const tick = state.tick;

  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p || !input.castSpell) continue;
    const spell = input.castSpell;
    const cfg = SPELL_CONFIG[spell];
    if (!cfg || p.mana < cfg.manaCost) continue;
    if ((p.cooldowns[spell] ?? 0) > 0) continue;

    players[id] = {
      ...p,
      mana: p.mana - cfg.manaCost,
      cooldowns: { ...p.cooldowns, [spell]: cfg.cooldownTicks },
    };

    if (spell === 1) {
      projectiles = [...projectiles, spawnFireball(id, p.position, input.aimTarget)];
    } else if (spell === 2 && input.aimTarget2) {
      fireWalls = [...fireWalls, spawnFireWall(id, input.aimTarget, input.aimTarget2, tick)];
    } else if (spell === 3) {
      meteors = [...meteors, spawnMeteor(id, input.aimTarget, tick)];
    }
  }

  // 3. Advance projectiles, check hits
  const survivingProjectiles = [];
  for (const fb of projectiles) {
    const moved = advanceFireball(fb);
    if (isFireballExpired(moved)) continue;
    let hit = false;
    for (const [pid, player] of Object.entries(players)) {
      if (fireballHitsPlayer(moved, player.position, pid)) {
        players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage()) };
        hit = true;
        break;
      }
    }
    if (!hit) survivingProjectiles.push(moved);
  }

  // 4. Fire wall damage
  fireWalls = fireWalls.filter(fw => tick < fw.expiresAt);
  for (const fw of fireWalls) {
    for (const [pid, player] of Object.entries(players)) {
      if (fireWallDamagesPlayer(fw, player.position, pid)) {
        players[pid] = { ...player, hp: Math.max(0, player.hp - FIREWALL_DAMAGE_PER_TICK) };
      }
    }
  }

  // 5. Meteor detonations
  const survivingMeteors = [];
  for (const m of meteors) {
    if (meteorDetonates(m, tick)) {
      for (const [pid, player] of Object.entries(players)) {
        if (meteorHitsPlayer(m, player.position, pid)) {
          players[pid] = { ...player, hp: Math.max(0, player.hp - meteorDamage()) };
        }
      }
    } else {
      survivingMeteors.push(m);
    }
  }

  // 6. Win condition
  let phase = state.phase;
  let winner = state.winner;
  if (phase !== 'ended') {
    for (const [pid, player] of Object.entries(players)) {
      if (player.hp <= 0) {
        phase = 'ended';
        winner = Object.keys(players).find(id => id !== pid) ?? null;
        break;
      }
    }
  }

  return {
    tick: tick + 1,
    players,
    projectiles: survivingProjectiles,
    fireWalls,
    meteors: survivingMeteors,
    phase,
    winner,
  };
}

function deepCopyPlayers(players: Record<string, PlayerState>): Record<string, PlayerState> {
  const copy: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(players)) {
    copy[id] = { ...p, position: { ...p.position }, cooldowns: { ...p.cooldowns } };
  }
  return copy;
}
