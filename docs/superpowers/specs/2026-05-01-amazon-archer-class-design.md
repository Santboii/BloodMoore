# Amazon Character Class — Archer Skill Tree Design

## Overview

Add an "Amazon" character class with an "archer" skill tree inspired by the Diablo 2 Amazon bow tree. The Amazon uses fast arrow projectiles as her primary attack, with branching paths into guided/homing arrows, multi-shot spread, and a Rain of Arrows AoE capstone. A mutually exclusive elemental passive at the top of the tree (burn, freeze, or poison) colors the entire kit. The Amazon gets her own utility tree (Evade) instead of the mage's Teleport tree.

## Archer Skill Tree (11 nodes)

### Tree Shape

```
Tier 1:  archer.power_shot (active)
              │
        ┌─────┴─────┐
Tier 2:  archer.guided       archer.multishot (active)
              │                    │
Tier 3:  archer.homing        archer.barrage
              │                    │
        └─────┬─────┘
Tier 4:  archer.rain_of_arrows (active)
              │
        ┌─────┴─────┐
Tier 5:  archer.sustained_rain    archer.piercing_rain
              │                    │
        └─────┬─────┘
Tier 6:  archer.burn | archer.freeze | archer.poison (mutually exclusive)
```

### Node Definitions

| ID | Name | Tier | Cost | isSpell | Description |
|----|------|------|------|---------|-------------|
| archer.power_shot | Power Shot | 1 | 1 | true | Fast arrow projectile. 60–90 damage. |
| archer.guided | Guided | 2 | 1 | false | Power Shot gains slight homing. |
| archer.multishot | Multi-shot | 2 | 2 | true | Fire 3 arrows in a spread. 40–60 damage each. |
| archer.homing | Homing | 3 | 2 | false | Power Shot gains strong tracking. |
| archer.barrage | Barrage | 3 | 2 | false | Multi-shot fires 5 arrows instead of 3. |
| archer.rain_of_arrows | Rain of Arrows | 4 | 2 | true | Mark a zone. Arrows rain after 1.5s. 150–220 AoE damage. |
| archer.sustained_rain | Sustained Rain | 5 | 1 | false | +50% Rain of Arrows duration (ticking damage zone). |
| archer.piercing_rain | Piercing Rain | 5 | 2 | false | Rain arrows hit twice (2× effective damage). |
| archer.burn | Burn | 6 | 3 | false | All arrows inflict 30 damage over 3s. |
| archer.freeze | Freeze | 6 | 3 | false | All arrows inflict 30% slow for 2s. |
| archer.poison | Poison | 6 | 3 | false | All arrows inflict 20 damage over 5s and reduce mana regen by 30%. |

### Gates

```
archer.guided         → requiresAll: [archer.power_shot]
archer.multishot      → requiresAll: [archer.power_shot]
archer.homing         → requiresAll: [archer.guided]
archer.barrage        → requiresAll: [archer.multishot]
archer.rain_of_arrows → requiresAll: [archer.power_shot], requiresAny: [archer.homing, archer.barrage]
archer.sustained_rain → requiresAll: [archer.rain_of_arrows]
archer.piercing_rain  → requiresAll: [archer.rain_of_arrows]
archer.burn           → requiresAll: [archer.rain_of_arrows], requiresAny: [archer.sustained_rain, archer.piercing_rain], mutuallyExclusive: [archer.freeze, archer.poison]
archer.freeze         → requiresAll: [archer.rain_of_arrows], requiresAny: [archer.sustained_rain, archer.piercing_rain], mutuallyExclusive: [archer.burn, archer.poison]
archer.poison         → requiresAll: [archer.rain_of_arrows], requiresAny: [archer.sustained_rain, archer.piercing_rain], mutuallyExclusive: [archer.burn, archer.freeze]
```

## Amazon Utility Tree (4 nodes)

### Tree Shape

```
Tier 1:  archer_utility.evade (active — short dash, ~300 range, brief invuln)
              │
        ┌─────┴─────┐
Tier 2:  archer_utility.combat_roll       archer_utility.shadowstep
         (fire arrow at nearest             (invisible for 0.5s
          enemy during evade)                after evade)
              │                              │
        └─────┬─────┘
Tier 3:  archer_utility.acrobatics
         (40% cooldown reduction, can store 2 charges)
```

### Node Definitions

| ID | Name | Tier | Cost | isSpell | Description |
|----|------|------|------|---------|-------------|
| archer_utility.evade | Evade | 1 | 1 | true | Short dash with invulnerability frames (~0.3s). |
| archer_utility.combat_roll | Combat Roll | 2 | 2 | false | Fire an arrow at the nearest enemy during evade. |
| archer_utility.shadowstep | Shadowstep | 2 | 2 | false | Become invisible for 0.5s after evading. |
| archer_utility.acrobatics | Acrobatics | 3 | 3 | false | Evade cooldown reduced 40%. Can store 2 charges. |

### Gates

```
archer_utility.combat_roll → requiresAll: [archer_utility.evade]
archer_utility.shadowstep  → requiresAll: [archer_utility.evade]
archer_utility.acrobatics  → requiresAll: [archer_utility.evade], requiresAny: [archer_utility.combat_roll, archer_utility.shadowstep]
```

## Combat Mechanics

### Power Shot
- Speed: 1.4× FIREBALL_SPEED
- Damage: 60–90
- Single target, no explosion radius
- With `guided`: slight homing toward nearest enemy
- With `homing`: strong tracking (aggressive curve)

### Multi-shot
- Fires 3 arrows (5 with `barrage`) in an even angular spread (±15° for 3, ±20° for 5)
- Each arrow: 40–60 damage
- Same speed as Power Shot
- Higher mana cost and cooldown than Power Shot

### Rain of Arrows
- Player marks a target zone (circular area)
- Arrows rain down after 1.5s delay
- Base damage: 150–220 across the zone
- With `sustained_rain`: zone persists as a damage-over-time area (like Fire Wall)
- With `piercing_rain`: each arrow hits twice (2× damage)

### Evade
- Dash range: ~300 units (vs Teleport's 600 base)
- Invulnerability: 0.3s during the roll
- Cooldown: lower than Teleport's
- With `combat_roll`: auto-fires an arrow at nearest enemy mid-dash
- With `shadowstep`: invisible for 0.5s after evade ends
- With `acrobatics`: 40% shorter cooldown, stores 2 charges

### Elemental Passives (apply to all arrow abilities)
- **Burn:** 30 damage over 3s after hit (DoT)
- **Freeze:** 30% movement speed slow for 2s on hit
- **Poison:** 20 damage over 5s, reduces target mana regen by 30%

## Type System Changes

### `shared/src/character.ts`
- `CharacterClass` → `'mage' | 'amazon'`
- Add `{ id: 'amazon', label: 'Amazon', enabled: true }` to `CHARACTER_CLASSES`

### `shared/src/skills.ts`
- `NodeId` union expands with all `archer.*` and `archer_utility.*` string literals
- `SkillTree` → `'fire' | 'lightning' | 'frost' | 'utility' | 'archer' | 'archer_utility'`
- `Gate` type adds `mutuallyExclusive?: NodeId[]` field
- `canUnlock` checks: if any node in `mutuallyExclusive` is owned, return false
- New `GATES` entries for all archer/archer_utility prerequisites
- New `SKILL_NODES` entries (11 archer + 4 archer_utility = 15 new nodes)

### `shared/src/types.ts`
- `ProjectileType` → `'fireball' | 'arrow'`
- `SpellId` expands to include Power Shot, Multi-shot, Rain of Arrows, Evade
- New `RainOfArrowsState` type (similar to `MeteorState`: id, ownerId, target zone, strikeAt, sustained flag, piercing flag)
- `GameState.rainOfArrows: RainOfArrowsState[]`

### `server/src/skills/SpellModifiers.ts`
- New types: `ArrowModifiers`, `MultishotModifiers`, `RainModifiers`, `EvadeModifiers`
- New `buildAmazonModifiers(skills: Set<string>)` function (or extend existing `buildSpellModifiers` with class routing)

### `server/src/skills/loadSkills.ts`
- Class-aware default skill: mages get `fire.fireball`, amazons get `archer.power_shot`

### `client/src/skills/SkillTreeUI.ts`
- Render archer tree + archer_utility when viewing an Amazon character
- New `ARCHER_POSITIONS` and `ARCHER_UTIL_POSITIONS` maps
- New `NODE_ICONS` entries for all archer nodes
- Elemental choice UI: purchasing one locks the other two (shows "Requires respec" tooltip)

## Mutual Exclusion Mechanism

The `Gate` type gains a `mutuallyExclusive` field:

```ts
export type Gate = {
  requiresAll?: NodeId[];
  requiresAny?: NodeId[];
  mutuallyExclusive?: NodeId[];
};
```

`canUnlock` logic: if `gate.mutuallyExclusive` exists and any of those nodes are in the `owned` set, return `false`.

Switching elements requires a full respec (existing respec RPC clears all nodes). The UI displays all three elemental nodes side-by-side at tier 6 and locks the unchosen two once one is purchased.
