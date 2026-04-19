import {
  GameState, PlayerState, InputFrame, Vec2, SpellId, NodeId,
  SPELL_CONFIG, MAX_HP, MAX_MANA, MANA_REGEN_PER_TICK,
  FIREWALL_DAMAGE_PER_TICK, TELEPORT_MAX_RANGE,
} from '@arena/shared';
import { movePlayer, clampToArena, resolvePlayerPillarCollisions } from '../physics/Movement.ts';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../spells/Fireball.ts';
import { spawnFireWall, fireWallDamagesPlayer } from '../spells/FireWall.ts';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../spells/Meteor.ts';
import { buildSpellModifiers } from '../skills/SpellModifiers.ts';

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

export function advanceState(
  state: GameState,
  inputs: Record<string, InputFrame>,
  skillSets: Record<string, Set<NodeId>> = {},
): GameState {
  const players = deepCopyPlayers(state.players);
  const modifiers = Object.fromEntries(
    Object.keys(players).map(id => [id, buildSpellModifiers(skillSets[id] ?? new Set())])
  );

  // 1. Move players and apply mana regen
  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p) continue;
    const newMana = Math.min(MAX_MANA, p.mana + MANA_REGEN_PER_TICK);
    const newFacing = input.aimTarget
      ? Math.atan2(input.aimTarget.y - p.position.y, input.aimTarget.x - p.position.x)
      : p.facing;
    const newCooldowns: Partial<Record<SpellId, number>> = {};
    for (const [k, v] of Object.entries(p.cooldowns)) {
      const remaining = (v as number) - 1;
      if (remaining > 0) newCooldowns[Number(k) as SpellId] = remaining;
    }
    const phantomActive = (p.phantomStepUntil ?? 0) > state.tick;
    players[id] = {
      ...p,
      position: movePlayer(p.position, input.move),
      mana: newMana,
      facing: newFacing,
      cooldowns: newCooldowns,
      castingSpell: null,
      phantomStepUntil: phantomActive ? p.phantomStepUntil : undefined,
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
    const mods = modifiers[id];

    // Spell availability gate — only applies when player has a skill set registered
    const hasSkillSystem = skillSets[id] !== undefined;
    const spellNodeMap: Partial<Record<SpellId, NodeId>> = {
      1: 'fire.fireball',
      2: 'fire.fire_wall',
      3: 'fire.meteor',
      4: 'utility.teleport',
    };
    const requiredNode = spellNodeMap[spell];
    if (hasSkillSystem && requiredNode && !(skillSets[id] ?? new Set()).has(requiredNode)) continue;

    const cfg = SPELL_CONFIG[spell];
    const phantomActive = (p.phantomStepUntil ?? 0) > tick;
    const effectiveManaCost = phantomActive ? 0 : cfg.manaCost;
    if (p.mana < effectiveManaCost) continue;
    if ((p.cooldowns[spell] ?? 0) > 0) continue;

    players[id] = {
      ...p,
      mana: p.mana - effectiveManaCost,
      cooldowns: phantomActive ? { ...p.cooldowns } : { ...p.cooldowns, [spell]: cfg.cooldownTicks },
      castingSpell: spell,
      phantomStepUntil: phantomActive ? undefined : p.phantomStepUntil,
    };

    if (spell === 1) {
      const fb = spawnFireball(id, p.position, input.aimTarget, {
        speed:     mods.fireball.speed,
        radius:    mods.fireball.radius,
        damageMin: mods.fireball.damageMin,
        damageMax: mods.fireball.damageMax,
        homing:    mods.fireball.homing,
        split:     mods.fireball.split,
      });
      projectiles = [...projectiles, fb];
    } else if (spell === 2 && input.aimTarget2) {
      fireWalls = [...fireWalls, spawnFireWall(id, input.aimTarget, input.aimTarget2, tick, mods.firewall.durationMultiplier)];
    } else if (spell === 3) {
      meteors = [...meteors, spawnMeteor(id, input.aimTarget, tick, {
        hidden: mods.meteor.hidden,
        moltenImpact: mods.meteor.moltenImpact,
      })];
    } else if (spell === 4) {
      const tMods = mods.teleport;
      const dx = input.aimTarget.x - p.position.x;
      const dy = input.aimTarget.y - p.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedTarget = (hasSkillSystem && dist > tMods.maxRange)
        ? { x: p.position.x + (dx / dist) * tMods.maxRange, y: p.position.y + (dy / dist) * tMods.maxRange }
        : input.aimTarget;
      const newPos = resolvePlayerPillarCollisions(clampToArena(clampedTarget));
      players[id] = {
        ...players[id],
        position: newPos,
        invulnUntil: (hasSkillSystem && tMods.etherealForm) ? tick + 30 : players[id].invulnUntil,
        phantomStepUntil: (hasSkillSystem && tMods.phantomStep) ? tick + 2 * 60 : players[id].phantomStepUntil,
      };
    }
  }

  // 3. Advance projectiles, check hits
  const survivingProjectiles = [];
  const newProjectiles: typeof projectiles = [];
  for (const fb of projectiles) {
    const enemyEntry = Object.entries(players).find(([pid]) => pid !== fb.ownerId);
    const moved = advanceFireball(fb, enemyEntry?.[1].position);
    if (isFireballExpired(moved)) continue;
    let hit = false;
    for (const [pid, player] of Object.entries(players)) {
      if (fireballHitsPlayer(moved, player.position, pid)) {
        const invuln = (player.invulnUntil ?? 0) > tick;
        if (!invuln) {
          players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage(moved)) };
        }
        if ((moved.split ?? 0) > 0) {
          const angles = [-0.4, 0, 0.4];
          for (const offset of angles) {
            const baseAngle = Math.atan2(moved.velocity.y, moved.velocity.x) + offset;
            const spd = Math.sqrt(moved.velocity.x ** 2 + moved.velocity.y ** 2);
            newProjectiles.push(spawnFireball(moved.ownerId, moved.position, {
              x: moved.position.x + Math.cos(baseAngle) * 100,
              y: moved.position.y + Math.sin(baseAngle) * 100,
            }, { speed: spd, radius: moved.radius, damageMin: moved.damageMin, damageMax: moved.damageMax }));
          }
        }
        hit = true;
        break;
      }
    }
    if (!hit) survivingProjectiles.push(moved);
  }
  projectiles = [...survivingProjectiles, ...newProjectiles];

  // 4. Fire wall damage
  fireWalls = fireWalls.filter(fw => tick < fw.expiresAt);
  for (const fw of fireWalls) {
    const ownerMods = modifiers[fw.ownerId];
    const dmgMultiplier = ownerMods?.firewall.damageMultiplier ?? 1;
    for (const [pid] of Object.entries(players)) {
      if (fireWallDamagesPlayer(fw, players[pid].position, pid)) {
        const invuln = (players[pid].invulnUntil ?? 0) > tick;
        if (!invuln) {
          players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - FIREWALL_DAMAGE_PER_TICK * dmgMultiplier) };
        }
      }
    }
  }

  // 5. Meteor detonations
  const survivingMeteors = [];
  for (const m of meteors) {
    if (meteorDetonates(m, tick)) {
      for (const [pid] of Object.entries(players)) {
        if (meteorHitsPlayer(m, players[pid].position, pid)) {
          const invuln = (players[pid].invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - meteorDamage()) };
          }
        }
      }
      if (m.moltenImpact) {
        const crater = spawnFireWall(m.ownerId,
          { x: m.target.x - 40, y: m.target.y },
          { x: m.target.x + 40, y: m.target.y },
          tick,
        );
        fireWalls = [...fireWalls, { ...crater, expiresAt: tick + 180 }];
      }
    } else {
      survivingMeteors.push(m);
    }
  }

  // 6. Win condition
  let phase = state.phase;
  let winner = state.winner;
  if (phase !== 'ended') {
    const deadIds = Object.keys(players).filter(id => players[id].hp <= 0);
    if (deadIds.length >= 2) { phase = 'ended'; winner = null; }
    else if (deadIds.length === 1) {
      phase = 'ended';
      winner = Object.keys(players).find(id => id !== deadIds[0]) ?? null;
    }
  }

  return { tick: tick + 1, players, projectiles, fireWalls, meteors: survivingMeteors, phase, winner };
}

function deepCopyPlayers(players: Record<string, PlayerState>): Record<string, PlayerState> {
  const copy: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(players)) {
    copy[id] = { ...p, position: { ...p.position }, cooldowns: { ...p.cooldowns } };
  }
  return copy;
}
