import {
  GameState, PlayerState, InputFrame, Vec2, SpellId, NodeId,
  SPELL_CONFIG, MAX_HP, MAX_MANA, MANA_REGEN_PER_TICK,
  FIREWALL_DAMAGE_PER_TICK, FIREWALL_MAX_LENGTH, TELEPORT_MAX_RANGE, METEOR_AOE_RADIUS, FIREBALL_RADIUS, PLAYER_HALF_SIZE,
  DUEL_MODE,
  ARROW_SPEED, EVADE_RANGE, EVADE_INVULN_TICKS,
  MULTISHOT_SPREAD_3, MULTISHOT_SPREAD_5,
  RAIN_SUSTAINED_TICKS, RAIN_DAMAGE_PER_TICK,
} from '@arena/shared';
import type { GameModeConfig, RainOfArrowsState } from '@arena/shared';
import { movePlayer, clampToArena, resolvePlayerPillarCollisions } from '../physics/Movement.ts';
import { spawnFireball, advanceFireball, isFireballExpired, fireballHitsPlayer, fireballDamage } from '../spells/Fireball.ts';
import { spawnFireWall, spawnFireCrater, fireWallDamagesPlayer } from '../spells/FireWall.ts';
import { spawnMeteor, meteorDetonates, meteorHitsPlayer, meteorDamage } from '../spells/Meteor.ts';
import { buildSpellModifiers } from '../skills/SpellModifiers.ts';
import { spawnArrow, advanceArrow, isArrowExpired, arrowHitsPlayer, arrowDamage } from '../spells/Arrow.ts';
import { spawnRainOfArrows, rainDetonates, rainHitsPlayer, rainDamage } from '../spells/RainOfArrows.ts';
import { buildAmazonModifiers } from '../skills/AmazonModifiers.ts';

export type PlayerInit = { id: string; displayName: string; spawnPos: Vec2 };

function getSpellNodeMap(skills: Map<NodeId, number>): Partial<Record<SpellId, NodeId>> {
  const isAmazon = skills.has('archer.power_shot' as NodeId);
  if (isAmazon) {
    return {
      5: 'archer.power_shot' as NodeId,
      6: 'archer.multishot' as NodeId,
      7: 'archer.rain_of_arrows' as NodeId,
      8: 'archer_utility.evade' as NodeId,
    };
  }
  return {
    1: 'fire.fireball' as NodeId,
    2: 'fire.fire_wall' as NodeId,
    3: 'fire.meteor' as NodeId,
    4: 'utility.teleport' as NodeId,
  };
}

export function makeInitialState(
  players: PlayerInit[],
  mode?: GameModeConfig,
  teams?: Record<string, string[]>,
): GameState {
  const playerMap: Record<string, PlayerState> = {};
  const teamLookup: Record<string, string> = {};
  if (teams) {
    for (const [teamId, memberIds] of Object.entries(teams)) {
      for (const pid of memberIds) {
        teamLookup[pid] = teamId;
      }
    }
  }
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
      teamId: teamLookup[p.id],
    };
  }
  return { tick: 0, players: playerMap, projectiles: [], fireWalls: [], meteors: [], rainOfArrows: [], phase: 'dueling', winner: null, gameMode: mode?.type ?? '1v1', teams };
}

export function advanceState(
  state: GameState,
  inputs: Record<string, InputFrame>,
  skillSets: Record<string, Map<NodeId, number>> = {},
  mode?: GameModeConfig,
): GameState {
  const resolvedMode = mode ?? DUEL_MODE;
  const players = deepCopyPlayers(state.players);
  const modifiers = Object.fromEntries(
    Object.keys(players).map(id => [id, buildSpellModifiers(skillSets[id] ?? new Map())])
  );
  const amazonMods = Object.fromEntries(
    Object.keys(players).map(id => {
      const skills = skillSets[id] ?? new Map();
      const isAmazon = skills.has('archer.power_shot' as NodeId);
      return [id, isAmazon ? buildAmazonModifiers(skills) : null];
    })
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
  let rainOfArrows: RainOfArrowsState[] = [...state.rainOfArrows];
  const tick = state.tick;

  for (const [id, input] of Object.entries(inputs)) {
    const p = players[id];
    if (!p || !input.castSpell) continue;
    const spell = input.castSpell;
    const mods = modifiers[id];

    // Spell availability gate — only applies when player has a skill set registered
    const hasSkillSystem = skillSets[id] !== undefined;
    const spellNodeMap = getSpellNodeMap(skillSets[id] ?? new Map());
    const requiredNode = spellNodeMap[spell];
    // Block spells not in this class's spell map entirely
    if (hasSkillSystem && !(spell in spellNodeMap)) continue;
    if (hasSkillSystem && requiredNode && !(skillSets[id] ?? new Map()).has(requiredNode)) continue;

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
        homing:    mods.fireball.homingStrength,
        split:     mods.fireball.split,
      });
      projectiles = [...projectiles, fb];
    } else if (spell === 2) {
      const dx = input.aimTarget.x - p.position.x;
      const dy = input.aimTarget.y - p.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;
      const half = FIREWALL_MAX_LENGTH / 2;
      const from = { x: input.aimTarget.x - perpX * half, y: input.aimTarget.y - perpY * half };
      const to = { x: input.aimTarget.x + perpX * half, y: input.aimTarget.y + perpY * half };
      fireWalls = [...fireWalls, spawnFireWall(id, from, to, tick, mods.firewall.durationMultiplier)];
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
        teleported: { ...p.position },
        invulnUntil: (hasSkillSystem && tMods.etherealForm) ? tick + 30 : players[id].invulnUntil,
        phantomStepUntil: (hasSkillSystem && tMods.phantomStep) ? tick + 2 * 60 : players[id].phantomStepUntil,
      };
    } else if (spell === 5) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      const arrow = spawnArrow(id, p.position, input.aimTarget, {
        speed: aMods.arrow.speed,
        damageMin: aMods.arrow.damageMin,
        damageMax: aMods.arrow.damageMax,
        homing: aMods.arrow.homing,
      });
      projectiles = [...projectiles, arrow];
    } else if (spell === 6) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      const count = aMods.multishot.arrowCount;
      const spread = count === 5 ? MULTISHOT_SPREAD_5 : MULTISHOT_SPREAD_3;
      const baseAngle = Math.atan2(input.aimTarget.y - p.position.y, input.aimTarget.x - p.position.x);
      for (let i = 0; i < count; i++) {
        const angle = baseAngle + (i - (count - 1) / 2) * (spread * 2 / (count - 1));
        const target = { x: p.position.x + Math.cos(angle) * 500, y: p.position.y + Math.sin(angle) * 500 };
        const arrow = spawnArrow(id, p.position, target, {
          speed: aMods.arrow.speed,
          damageMin: aMods.multishot.damageMin,
          damageMax: aMods.multishot.damageMax,
          homing: 0,
        });
        projectiles = [...projectiles, arrow];
      }
    } else if (spell === 7) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      rainOfArrows = [...rainOfArrows, spawnRainOfArrows(id, input.aimTarget, tick, {
        sustained: aMods.rain.sustained,
        piercing: aMods.rain.piercing,
      })];
    } else if (spell === 8) {
      const aMods = amazonMods[id];
      if (!aMods) continue;
      const dx = input.aimTarget.x - p.position.x;
      const dy = input.aimTarget.y - p.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const range = aMods.evade.range;
      const clampedTarget = dist > range
        ? { x: p.position.x + (dx / dist) * range, y: p.position.y + (dy / dist) * range }
        : input.aimTarget;
      const newPos = resolvePlayerPillarCollisions(clampToArena(clampedTarget));
      players[id] = {
        ...players[id],
        position: newPos,
        invulnUntil: tick + EVADE_INVULN_TICKS,
      };
    }
  }

  // 3. Advance projectiles, check hits
  const survivingProjectiles = [];
  const newProjectiles: typeof projectiles = [];
  for (const proj of projectiles) {
    const candidates = Object.entries(players).filter(([pid]) => pid !== proj.ownerId && players[pid].hp > 0);
    const enemyEntry = candidates.length > 0
      ? candidates.reduce((closest, curr) => {
          const closestDist = (closest[1].position.x - proj.position.x) ** 2 + (closest[1].position.y - proj.position.y) ** 2;
          const currDist = (curr[1].position.x - proj.position.x) ** 2 + (curr[1].position.y - proj.position.y) ** 2;
          return currDist < closestDist ? curr : closest;
        })
      : undefined;
    if (proj.type === 'arrow') {
      const moved = advanceArrow(proj, enemyEntry?.[1].position);
      if (isArrowExpired(moved)) continue;
      let hit = false;
      for (const [pid, player] of Object.entries(players)) {
        if (arrowHitsPlayer(moved, player.position, pid)) {
          const invuln = (player.invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...player, hp: Math.max(0, player.hp - arrowDamage(moved.damageMin, moved.damageMax) * getDamageMultiplier(moved.ownerId, pid, players, resolvedMode)) };
          }
          hit = true;
          break;
        }
      }
      if (!hit) survivingProjectiles.push(moved);
    } else {
      const moved = advanceFireball(proj, enemyEntry?.[1].position);
      const expired = isFireballExpired(moved);
      let directHit = false;

      if (!expired) {
        for (const [pid, player] of Object.entries(players)) {
          if (fireballHitsPlayer(moved, player.position, pid)) {
            directHit = true;
            break;
          }
        }
      }

      if (directHit || expired) {
        const blastRadius = (moved.radius ?? FIREBALL_RADIUS) * 3;
        for (const [pid, player] of Object.entries(players)) {
          if (pid === moved.ownerId) continue;
          if (player.hp <= 0) continue;
          const dx = player.position.x - moved.position.x;
          const dy = player.position.y - moved.position.y;
          if (dx * dx + dy * dy > (blastRadius + PLAYER_HALF_SIZE) ** 2) continue;
          const invuln = (player.invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...player, hp: Math.max(0, player.hp - fireballDamage(moved) * getDamageMultiplier(moved.ownerId, pid, players, resolvedMode)) };
          }
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
      } else {
        survivingProjectiles.push(moved);
      }
    }
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
          players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - FIREWALL_DAMAGE_PER_TICK * dmgMultiplier * getDamageMultiplier(fw.ownerId, pid, players, resolvedMode)) };
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
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - meteorDamage() * getDamageMultiplier(m.ownerId, pid, players, resolvedMode)) };
          }
        }
      }
      if (m.moltenImpact) {
        const crater = spawnFireCrater(m.ownerId, { ...m.target }, METEOR_AOE_RADIUS, tick, 180);
        fireWalls = [...fireWalls, crater];
      }
    } else {
      survivingMeteors.push(m);
    }
  }

  // 5b. Rain of Arrows detonations
  const survivingRain: RainOfArrowsState[] = [];
  for (const rain of rainOfArrows) {
    if (rainDetonates(rain, tick)) {
      for (const [pid] of Object.entries(players)) {
        if (rainHitsPlayer(rain, players[pid].position, pid)) {
          const invuln = (players[pid].invulnUntil ?? 0) > tick;
          if (!invuln) {
            players[pid] = { ...players[pid], hp: Math.max(0, players[pid].hp - rainDamage(rain.piercing ?? false) * getDamageMultiplier(rain.ownerId, pid, players, resolvedMode)) };
          }
        }
      }
      if (rain.sustained) {
        fireWalls = [...fireWalls, {
          id: `rain_zone_${rain.id}`,
          ownerId: rain.ownerId,
          segments: [],
          expiresAt: tick + RAIN_SUSTAINED_TICKS,
          shape: 'circle' as const,
          center: { ...rain.target },
          radius: rain.radius,
        }];
      }
    } else {
      survivingRain.push(rain);
    }
  }
  rainOfArrows = survivingRain;

  // 6. Win condition
  let phase = state.phase;
  let winner = state.winner;
  if (phase !== 'ended') {
    const result = resolvedMode.checkWinCondition(players, state.teams);
    phase = result.phase;
    winner = result.winner;
  }

  return { tick: tick + 1, players, projectiles, fireWalls, meteors: survivingMeteors, rainOfArrows, phase, winner, gameMode: state.gameMode, teams: state.teams };
}

function deepCopyPlayers(players: Record<string, PlayerState>): Record<string, PlayerState> {
  const copy: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(players)) {
    copy[id] = { ...p, position: { ...p.position }, cooldowns: { ...p.cooldowns }, teleported: undefined };
  }
  return copy;
}

function getDamageMultiplier(
  ownerId: string,
  targetId: string,
  players: Record<string, PlayerState>,
  mode: GameModeConfig,
): number {
  if (!mode.teamsEnabled) return 1;
  const ownerTeam = players[ownerId]?.teamId;
  const targetTeam = players[targetId]?.teamId;
  if (ownerTeam && targetTeam && ownerTeam === targetTeam) {
    return mode.friendlyFireMultiplier;
  }
  return 1;
}
