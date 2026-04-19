# Arena Game Roadmap Expansion — Design Spec

## Vision

Competitive ranked arena — 1v1 cross-class dueling with room-based matchmaking, a persistent ladder, and cosmetic-only progression rewards. Team modes (2v2, 3v3) planned long-term. Three classes form a balance triangle: Mage (ranged control), Rogue (burst/evasion), Paladin (sustain/resilience).

## Key Design Decisions

- **Competitive identity:** The game is about climbing a ladder, not RPG character building. Progression exists to unlock gameplay options (skill points) and cosmetic rewards, not to create power gaps.
- **One rank per account:** Prevents smurfing via alts. Your rating is you, not your character.
- **Config-driven balance:** All spell numbers live in shared config. Balance patches are config changes. Admin dashboard deferred until there's data to act on.
- **Cosmetic-only rewards:** No gear, no stat items. Skill trees are the only gameplay progression. Cosmetics (spell skins, character skins, arena themes) reward time investment without affecting balance.
- **Room-based matchmaking for now:** Keep the current "create room + share link" flow. Ladder tracks results passively. Queue-based matchmaking deferred until player base justifies it.
- **Interleaved delivery:** Alternate infrastructure and content phases so every phase ships something playable and testable.

---

## Phase 1: Bugs, Polish & Complete the Mage

### Goal
Finish the Mage as a complete class with all four spell trees before building competitive infrastructure.

### Bugs / Polish
- **Fireball visual scaling:** The "Hellfire" node already applies 3x gameplay size. The fireball mesh/particle system needs to scale to match.
- **Header bar:** Move login/logout button to a persistent top-right header. Currently lives in the lobby UI body.
- **Logout navigation:** Logging out should route to the login view. Currently stays on the lobby.
- **Skill respec:** A "Reset Skills" button in the skill tree UI. Refunds all spent points. No cost or cooldown — keep it frictionless during this phase.

### Lightning Tree (~12 nodes across 7 tiers)

Three new spells following Fire's tier structure:

**Chain Lightning (Tier 1 gateway spell)**
- Projectile that bounces between nearby enemies (in 1v1, functions as a fast single-target projectile — bounce mechanic becomes relevant in 2v2+ team modes)
- Moderate damage, fast travel speed
- Mana cost and cooldown comparable to Fireball

**Thunder Strike (Tier 4 spell)**
- Targeted AoE — click a location, lightning strikes after a short delay
- Introduces **stun** as a new CC type (brief, ~0.5s, prevents movement and casting)
- Smaller radius than Meteor but faster

**Storm Shield (Tier 6 spell)**
- Defensive bubble around self — absorbs a set amount of incoming damage
- Duration-limited (3-4s), cannot attack while active (channeled — distinct from Paladin's Holy Shield which is cast-and-forget)
- First defensive spell in the Mage kit

**Modifier nodes:** Follow the same pattern as Fire — damage increases, radius increases, duration increases, and unique mechanical modifiers (e.g., chain lightning hits increase per bounce, thunder strike leaves a static field, storm shield reflects damage on expiry).

### Frost Tree (~12 nodes across 7 tiers)

**Ice Bolt (Tier 1 gateway spell)**
- Projectile that applies **slow** (reduces movement speed by ~30% for 2s)
- Lower damage than Fireball — the value is in the CC
- Introduces the slow debuff system

**Frost Nova (Tier 4 spell)**
- Point-blank AoE centered on caster
- Applies **freeze** (brief root, ~1s, prevents movement but not casting)
- Short range forces the Mage to position aggressively

**Blizzard (Tier 6 spell)**
- Persistent AoE zone at target location (like Meteor but lingers)
- Deals damage over time and applies slow while enemies stand in it
- Duration ~4s, large radius

**Modifier nodes:** Slow duration increases, freeze duration, Blizzard size, Ice Bolt pierces targets, Frost Nova pushes enemies outward, etc.

### New Mechanics Introduced
- **Stun:** Prevents movement and casting for a duration. Visual indicator on stunned player.
- **Slow:** Reduces movement speed by a percentage. Visual indicator (frost particles on character).
- **Freeze/Root:** Prevents movement but allows casting. Visual indicator (ice encasing feet).
- **Damage absorption shield:** Absorbs incoming damage up to a threshold before breaking.

---

## Phase 2: Character System, Leveling & Competitive Infrastructure

### Goal
Build the persistence and competitive tracking systems that all future content plugs into.

### Character System

**Data model:**
```
characters table:
  id: uuid (PK)
  user_id: uuid (FK → profiles)
  name: string (unique per user, 3-20 chars)
  class: enum ('mage') — extensible
  level: integer (default 1)
  xp: integer (default 0)
  skill_points_available: integer (default 1)
  skill_points_total: integer (default 1)
  created_at: timestamp
```

**Existing `skill_unlocks` table** gains a `character_id` foreign key (migration needed — move existing unlocks or reset).

**Existing `profiles` table** gains:
- `elo_rating: integer (default 1000)`
- `matches_played`, `matches_won` stay on profile (account-level stats)

**Create Character flow:**
1. After login, if user has no characters → forced into "Create Character"
2. Pick a name, pick a class (Mage only, but UI shows a grid with Rogue/Paladin grayed out)
3. Character created, user enters lobby

**Character Selection:**
- If user has multiple characters, show selection screen after login
- Each character shows: name, class, level, last played
- "Create New" button available

### Leveling System

- XP earned per match: base amount (e.g., 50) + win bonus (e.g., 50)
- Level thresholds: `xp_required = 100 * level * (1 + 0.1 * level)` — flattening curve
- 1 skill point per level, cap at level 30
- Level displayed: lobby (character card), HUD (next to player name), post-match

### Persistent Ladder

- ELO system: start at 1000, K-factor of 32
- Standard ELO formula: `expected = 1 / (1 + 10^((opponent_rating - player_rating) / 400))`
- Rating change: `K * (result - expected)` where result is 1 (win) or 0 (loss)
- Leaderboard: simple sorted query of profiles by elo_rating, displayed in lobby
- No decay, no placements, no seasons (Phase 6)

### Post-Match Screen Upgrade
- XP earned breakdown (base + win bonus)
- Level progress bar (current XP / next level XP)
- ELO rating change ("+23" or "-18" with color)
- Existing "Rematch" and "Return to Lobby" buttons

---

## Phase 3: Rogue Class

### Goal
First cross-class matchup. Rogue is melee/close-range, evasive, burst-oriented — the polar opposite of Mage.

### Class Design

**Resource — Energy:**
- Pool: 150 (vs Mage's 300 Mana)
- Regen: 25/sec (vs Mage's 10/sec Mana regen)
- Design intent: Rogue casts more frequently but can't sustain long combos. Encourages hit-and-run.

**Base Stats:**
- HP: 400 (vs Mage's 500) — squishier, compensated by evasion tools
- Movement speed: 240 units/sec (vs Mage's 200) — faster base movement

### New Gameplay Mechanics

**Directional damage (Backstab):**
- Server already tracks `facing` (radians) per player
- Backstab check: angle between attacker's position and defender's facing direction > 90° = "from behind"
- Backstab bonus: +50% damage

**Poison (DoT):**
- New damage-over-time type, ticks every 0.5s for a duration
- Stacks up to 3 times
- Distinct from Fire Wall (zone-based) — Poison follows the target

**Stealth/Vision Denial:**
- Smoke Bomb creates a zone where players inside cannot be targeted by enemy spells
- Players inside the zone are semi-transparent to the opponent
- Does NOT make the Rogue invisible — just obscures position within the zone

### Shadow Tree (~12 nodes, 7 tiers)

**Shadow Strike (Tier 1):** Short-range dash (200 units) that damages the first enemy hit. Primary gap closer. Energy cost: 30, Cooldown: 2s.

**Poison Blade (Tier 4):** Melee-range attack applying poison DoT (20 damage/tick, 3s duration). Energy cost: 25, Cooldown: 1.5s.

**Smoke Bomb (Tier 6):** AoE zone (80-unit radius) lasting 3s. Enemy projectiles pass through the zone without hitting players inside. Energy cost: 60, Cooldown: 8s.

### Assassination Tree (~12 nodes, 7 tiers)

**Backstab (Tier 1):** Melee attack with +50% damage from behind. Energy cost: 35, Cooldown: 1s.

**Fan of Knives (Tier 4):** 360° close-range AoE (100-unit radius). Energy cost: 45, Cooldown: 4s.

**Mark for Death (Tier 6):** Debuff on target — all damage taken increased by 25% for 4s. Energy cost: 50, Cooldown: 10s.

### Agility Tree (~4 nodes, 3 tiers)

**Dodge Roll (Tier 1):** Short dash (150 units) with 0.3s invulnerability. Energy cost: 20, Cooldown: 3s. Analogous to Mage's Teleport but shorter, faster, cheaper.

Modifier nodes: extended roll range, reduced cooldown, leave a poison trail.

### Character Model
- Distinct silhouette — lighter, leaner build than Mage
- Dual-wielding daggers (visual only — no weapon system)
- Different idle/attack/death animations

---

## Phase 4: Cosmetics & Audio

### Goal
Add audio and give players cosmetic rewards for progression. No gameplay impact.

### Audio System

**Architecture:**
- Web Audio API for sound effects (low latency)
- HTML5 Audio for background music (streaming, doesn't need low latency)
- Audio manager singleton on client — handles loading, pooling, volume

**Background Music:**
- Lobby: ambient dark/gothic track, looping
- Match: more intense track, crossfades on phase transition (waiting → dueling)
- Victory/defeat: short stingers

**Sound Effects (per spell):**
- Each spell gets: cast sound, travel/active sound (if applicable), impact/hit sound
- Fire spells: whoosh, crackle, explosion
- Lightning spells: zap, crack, rumble
- Frost spells: crystalline shatter, wind, crunch
- Rogue spells: blade slash, sizzle (poison), smoke puff
- UI: button clicks, menu transitions, match-found chime

**Volume Controls:**
- Master, Music, SFX — three sliders in settings
- Persisted to localStorage

### Cosmetic System

**Unlock Mechanism:**
- Level milestones: levels 5, 10, 15, 20, 25, 30 each unlock a cosmetic
- Player chooses from available unlocks at each milestone (not random)
- Account-wide — any character can use any unlocked cosmetic

**Cosmetic Types:**

*Spell Skins:*
- Alternate particle/color for spells (blue fire, purple lightning, dark ice)
- Stored as a `spell_skin` field on the character or account
- Client renders the variant based on skin ID

*Character Skins:*
- Color palette swaps or alternate GLTF models
- 2-3 per class at launch

*Arena Themes:*
- Different ground texture + pillar style
- Both players see the same arena (host's choice, or random)
- 3-4 themes: stone (default), lava, ice, shadow

**Data Model:**
```
cosmetic_unlocks table:
  id: uuid (PK)
  user_id: uuid (FK → profiles)
  cosmetic_id: string (e.g., "fireball_blue", "mage_skin_2", "arena_lava")
  unlocked_at: timestamp

equipped_cosmetics table:
  user_id: uuid (FK → profiles)
  slot: enum ('spell_skin_1', 'spell_skin_2', ..., 'character_skin', 'arena_theme')
  cosmetic_id: string
```

### Settings Menu
- Audio volume sliders (master, music, SFX)
- Keybind remapping (store in localStorage, default WASD + 1-4)
- Display name change (updates profile username)

---

## Phase 5: Paladin Class

### Goal
Third class completing the balance triangle. Durable, sustain-oriented, designed with future team modes in mind.

### Class Design

**Resource — Mana:**
- Pool: 250 (between Mage's 300 and Rogue's 150 Energy)
- Regen: 12/sec (slightly faster than Mage's 10)
- Spells are cheaper individually — Paladin sustains through long fights

**Base Stats:**
- HP: 650 (highest — Mage 500, Rogue 400)
- Movement speed: 180 units/sec (slowest — Mage 200, Rogue 240)

### Holy Tree (~12 nodes, 7 tiers)

**Smite (Tier 1):** Mid-range targeted bolt (300-unit range). Moderate damage. Mana cost: 20, Cooldown: 1s. Reliable poke.

**Consecration (Tier 4):** Persistent AoE zone centered on self, moves with Paladin. Damages enemies standing in it. Duration: 5s. Mana cost: 50, Cooldown: 8s.

**Divine Judgment (Tier 6):** Delayed single-target nuke. 2s wind-up (visible to opponent), massive damage if it lands. Interruptible by stun. Mana cost: 80, Cooldown: 12s.

### Protection Tree (~12 nodes, 7 tiers)

**Holy Shield (Tier 1):** Damage absorption barrier. Absorbs 150 damage over 4s. Mana cost: 30, Cooldown: 6s. Future: castable on allies.

**Cleanse (Tier 4):** Removes all debuffs (poison, slow, DoTs) from self. Instant cast. Mana cost: 25, Cooldown: 5s. Future: castable on allies.

**Retribution Aura (Tier 6):** Passive toggle — while active, reflects 15% of melee damage taken back to attacker. Drains 5 mana/sec while active. Anti-Rogue tool.

### Valor Tree (~4 nodes, 3 tiers)

**Holy Charge (Tier 1):** Forward dash (250 units) that stuns the first enemy hit for 0.75s. Mana cost: 35, Cooldown: 6s. Primary gap closer and interrupt.

Modifier nodes: increased stun duration, reduced cooldown, heal on impact.

### Balance Triangle

| Matchup | Favored | Why |
|---------|---------|-----|
| Mage vs Rogue | Skill-dependent | Mage controls space, Rogue closes gaps. Frost slow vs Dodge Roll. |
| Mage vs Paladin | Slight Mage | Range advantage, but Paladin sustains through poke. Cleanse removes DoTs. |
| Rogue vs Paladin | Slight Rogue | Burst overcomes sustain if applied fast. Retribution Aura punishes overcommitting. |

All matchups should be viable (45-55% win rate target). Ladder data from Phase 2 measures this.

### Character Model
- Heavy/armored silhouette — visually distinct from Mage (robed) and Rogue (light)
- Shield + mace or hammer (visual only)
- Slower, weightier animations

### Team Mode Prep
- `Holy Shield` and `Cleanse` spell configs include a `target_type: 'self'` field
- Changing to `'self_or_ally'` in a future phase enables team play
- No team mode implementation in this phase

---

## Phase 6: Matchmaking & Ranked Queue (Future)

Deferred until player base and game stability justify it.

- **Matchmaking queue:** ELO-based, tolerance window widens over time to prevent infinite waits
- **Class preference:** Indicate class before queueing
- **Seasons:** Soft reset (compress toward 1000), placement matches, seasonal cosmetic rewards
- **2v2 / 3v3:** Team composition, ally-targeting spells, new arena sizes
- **Anti-cheat / reporting:** Client-side validation, server-side replay logging, report button
- **Spectator mode:** Watch live matches, delay for competitive integrity, useful for community tournaments
