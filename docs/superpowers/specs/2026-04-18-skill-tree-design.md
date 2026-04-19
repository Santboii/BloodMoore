# Sorceress Skill Tree — Design Spec

**Date:** 2026-04-18
**Status:** Approved

---

## Overview

A persistent, account-level skill tree for the Sorceress class. Players earn skill points by playing and winning matches, then spend them to unlock spells and passive modifiers across three elemental trees (Fire, Lightning, Frost) and a shared Utility strip. Builds are permanent — no per-match respec. The system is designed to create meaningful player identity and interesting matchup variety in duels.

---

## Account & Auth

Supabase handles authentication (email + password). A sign-up/login screen is shown in the lobby before the player can create or join a room.

### Supabase Tables

**`profiles`**
| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | FK → `auth.users.id` |
| `username` | `text` | Display name, unique |
| `skill_points_available` | `int` | Points available to spend |
| `skill_points_total` | `int` | All-time points earned |
| `matches_played` | `int` | |
| `matches_won` | `int` | |

**`skill_unlocks`**
| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` | FK → `profiles.user_id` |
| `node_id` | `text` | e.g. `"fire.fireball"`, `"lightning.fork"` |
| `unlocked_at` | `timestamptz` | |

Primary key: `(user_id, node_id)`.

---

## Skill Point Economy

- **Starting points:** 5 (granted on account creation)
- **Per match played:** +1
- **Per match won:** +2 (in addition to the +1 above, total +3 per win)
- **No refunds:** Points spent are permanent for now
- Points are credited by the server at match end, written directly to Supabase

---

## Skill Tree Structure

Three elemental trees + one shared utility strip. Each tree follows the same 7-tier pattern:

```
Tier I   — Base spell unlock (1 pt)
Tier II  — Two modifier nodes (1 pt each)
Tier III — Two deeper modifiers (2 pts each)
Tier IV  — Second spell unlock (2 pts)
Tier V   — Two modifier nodes (1–2 pts)
Tier VI  — Third spell unlock (3 pts)
Tier VII — Two capstone modifiers (2–3 pts)
```

**Tier gates:**
- Tier III nodes require the Tier I spell to be unlocked
- Tier IV spells require at least one Tier II node to be unlocked
- Tier VII nodes require the Tier VI spell to be unlocked

Players may invest freely across trees with no restriction.

---

### Fire Tree

| Tier | Node | Type | Cost | Effect |
|---|---|---|---|---|
| I | **Fireball** | Spell | 1 pt | Fast projectile, 80–120 dmg |
| II | Volatile Ember | Modifier | 1 pt | +30% explosion radius |
| II | Seeking Flame | Modifier | 1 pt | Slight homing toward enemy |
| III | Hellfire | Modifier | 2 pts | Fireball is 3× size, 2× damage, 50% slower |
| III | Pyroclasm | Modifier | 2 pts | Fireball splits into 3 projectiles on impact |
| IV | **Fire Wall** | Spell | 2 pts | Persistent fire barrier, 40 dmg/s |
| V | Enduring Flames | Modifier | 1 pt | +50% Fire Wall duration |
| V | Searing Heat | Modifier | 2 pts | +40% Fire Wall damage |
| VI | **Meteor** | Spell | 3 pts | Delayed AoE strike, 200–280 dmg |
| VII | Molten Impact | Modifier | 2 pts | Meteor leaves a burning crater for 3s after impact |
| VII | Blind Strike | Modifier | 2 pts | Enemy cannot see the Meteor impact indicator |

**Node IDs:** `fire.fireball`, `fire.volatile_ember`, `fire.seeking_flame`, `fire.hellfire`, `fire.pyroclasm`, `fire.fire_wall`, `fire.enduring_flames`, `fire.searing_heat`, `fire.meteor`, `fire.molten_impact`, `fire.blind_strike`

---

### Lightning Tree

| Tier | Node | Type | Cost | Effect |
|---|---|---|---|---|
| I | **Lightning Bolt** | Spell | 1 pt | Fast straight projectile, 60–90 dmg |
| II | Static Charge | Modifier | 1 pt | Hit enemies are slowed 20% for 1.5s |
| II | Fork | Modifier | 1 pt | Bolt splits into 2 projectiles on impact |
| III | Overcharge | Modifier | 2 pts | +40% Lightning Bolt damage |
| III | Wide Arc | Modifier | 2 pts | Bolt hitbox is 2× wider |
| IV | **Chain Lightning** | Spell | 2 pts | Bolt bounces off pillars up to 3 times |
| V | Conductor | Modifier | 1 pt | Chain Lightning gets +1 extra bounce |
| V | Crackle | Modifier | 2 pts | +40% bolt travel speed |
| VI | **Nova** | Spell | 3 pts | Lightning burst in all directions around caster |
| VII | Static Field | Modifier | 2 pts | Nova additionally drains 8% of enemy's current HP |
| VII | Superstorm | Modifier | 3 pts | +60% Nova radius |

**Node IDs:** `lightning.lightning_bolt`, `lightning.static_charge`, `lightning.fork`, `lightning.overcharge`, `lightning.wide_arc`, `lightning.chain_lightning`, `lightning.conductor`, `lightning.crackle`, `lightning.nova`, `lightning.static_field`, `lightning.superstorm`

---

### Frost Tree

| Tier | Node | Type | Cost | Effect |
|---|---|---|---|---|
| I | **Frost Bolt** | Spell | 1 pt | Projectile that slows enemy on hit, 50–70 dmg |
| II | Brittle | Modifier | 1 pt | Slowed enemies take +20% damage from all sources |
| II | Deep Freeze | Modifier | 1 pt | Slow duration +50% |
| III | Glacial Spike | Modifier | 2 pts | Frost Bolt fully freezes enemy for 0.6s |
| III | Icy Velocity | Modifier | 2 pts | +50% Frost Bolt travel speed |
| IV | **Ice Spikes** | Spell | 2 pts | Frost wall that slows enemies on contact |
| V | Glacial Wall | Modifier | 1 pt | +60% Ice Spikes duration |
| V | Razor Ice | Modifier | 2 pts | Ice Spikes wall deals 25 dmg/s on contact |
| VI | **Blizzard** | Spell | 3 pts | Sustained AoE ice storm at target location |
| VII | Frozen Nova | Modifier | 2 pts | Blizzard briefly freezes enemies in place (0.8s) |
| VII | Permafrost | Modifier | 3 pts | Blizzard area reduces enemy movement by −35% |

**Node IDs:** `frost.frost_bolt`, `frost.brittle`, `frost.deep_freeze`, `frost.glacial_spike`, `frost.icy_velocity`, `frost.ice_spikes`, `frost.glacial_wall`, `frost.razor_ice`, `frost.blizzard`, `frost.frozen_nova`, `frost.permafrost`

---

### Shared Utility Strip

Available to all builds regardless of elemental investment. No tier gates.

| Node | Type | Cost | Effect |
|---|---|---|---|
| **Teleport** | Spell | 1 pt | Instant displacement (existing spell) |
| Phase Shift | Modifier | 2 pts | +40% teleport range |
| Ethereal Form | Modifier | 2 pts | 0.5s invulnerability window after teleporting |
| Phantom Step | Modifier | 3 pts | Next spell cast within 2s of teleporting is instant (no cast animation) |

**Node IDs:** `utility.teleport`, `utility.phase_shift`, `utility.ethereal_form`, `utility.phantom_step`

---

## Server Integration

### Skill Loading at Match Start

When a player joins a room, the server fetches their `skill_unlocks` rows from Supabase and builds a `PlayerSkillSet` — a `Set<string>` of active node IDs. This is attached to the player's room state for the duration of the match.

### Applying Modifiers

`StateAdvancer` reads each player's `PlayerSkillSet` at match initialization and builds a `SpellConfig` per spell. Example:

```ts
// Fireball base config
let fireballConfig = { speed: 400, damage: [80, 120], radius: 60 };

if (skills.has('fire.volatile_ember'))  fireballConfig.radius *= 1.3;
if (skills.has('fire.hellfire'))        fireballConfig = { ...fireballConfig, radius: fireballConfig.radius * 3, damage: fireballConfig.damage.map(d => d * 2), speed: fireballConfig.speed * 0.5 };
if (skills.has('fire.seeking_flame'))   fireballConfig.homing = true;
if (skills.has('fire.pyroclasm'))       fireballConfig.splitOnImpact = 3;
```

Modifiers stack in tier order (earlier tiers applied first). Hellfire and Pyroclasm are mutually exclusive in effect — both can be unlocked but Hellfire's speed reduction applies before the split check.

### Spell Availability

Spells not unlocked are simply unavailable. The server rejects any `castSpell` input referencing an unowned spell. The client HUD hides slots for unowned spells.

**Existing spells (Fireball, Fire Wall, Meteor, Teleport) become locked behind the tree.** Players without the relevant unlock can no longer cast them. Starting points (5) are enough to unlock a base spell + a couple of modifiers, or two base spells.

### Match Result Credits

At match end, the server writes to Supabase:
- `matches_played += 1`
- `skill_points_available += 1`, `skill_points_total += 1`
- If winner: `matches_won += 1`, `skill_points_available += 2`, `skill_points_total += 2`

---

## Client UI

### Lobby Changes

- Sign-up / login screen gating access (Supabase Auth)
- New **"Skills"** button on the lobby screen opens the skill tree panel
- Player's available points shown in the lobby header

### Skill Tree Panel

- Full-screen overlay, D2-inspired aesthetic (dark stone, Cinzel serif, monochromatic icons, gold trim)
- Three column tabs (Fire, Lightning, Frost) + Utility strip
- Nodes show: icon, name, description, point cost, locked/unlocked state
- Clicking any node opens a detail tooltip with full description
- "Unlock" button appears on affordable, gate-satisfied locked nodes
- Locked nodes that don't meet tier gates are visually greyed out with a lock icon

### HUD Changes

- Spell bar only renders slots for spells the player has unlocked
- New players with only e.g. Fireball + Teleport see a 2-slot bar

---

## Implementation Phases

Since most new spells (Lightning Bolt, Chain Lightning, Nova, Frost Bolt, Ice Spikes, Blizzard) don't exist yet, implementation proceeds in phases:

1. **Phase 1 — Foundation:** Supabase setup, auth, profiles table, skill_unlocks table, point crediting at match end, server skill loading
2. **Phase 2 — Tree UI:** Skill tree client panel with Fire tree only (existing spells: Fireball, Fire Wall, Meteor, Teleport)
3. **Phase 3 — Fire modifiers:** Wire all Fire tree modifier nodes into `StateAdvancer`
4. **Phase 4 — Lightning tree:** Implement Lightning Bolt, Chain Lightning, Nova + their modifiers
5. **Phase 5 — Frost tree:** Implement Frost Bolt, Ice Spikes, Blizzard + their modifiers
6. **Phase 6 — Polish:** Full UI pass, point balance tuning, Utility modifiers

---

## Open Questions

- Should Hellfire and Pyroclasm be mutually exclusive at the unlock level (only one can be purchased), or both purchasable with combined behavior?
- Should there be a "respec" feature eventually, even if not in v1?
