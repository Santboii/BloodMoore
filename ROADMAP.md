# Arena Game Roadmap

Competitive ranked arena — 1v1 cross-class dueling, room-based matchmaking for now, persistent ladder, cosmetic-only progression rewards. Team modes (2v2, 3v3) planned for the future.

---

## Phase 1: Bugs, Polish & Complete the Mage

### Bugs / Polish
- [ ] Fireball visual size should scale with the "Hellfire" skill tree node (3x size — gameplay effect exists, visual doesn't match)
- [ ] Login/logout button should be in a persistent top-right header bar
- [ ] Logging out should navigate to the login view
- [ ] Implement skill point reset (respec button in skill tree UI, refunds all points)

### Lightning Tree (~12 nodes, 3 spells)
- [ ] Chain Lightning — bouncing projectile
- [ ] Thunder Strike — targeted AoE with stun
- [ ] Storm Shield — defensive bubble
- [ ] Modifier nodes following Fire tree's tier structure

### Frost Tree (~12 nodes, 3 spells)
- [ ] Ice Bolt — projectile that slows
- [ ] Frost Nova — point-blank AoE freeze
- [ ] Blizzard — persistent AoE zone
- [ ] Modifier nodes following Fire tree's tier structure

---

## Phase 2: Character System, Leveling & Competitive Infrastructure

### Character System
- [ ] "Create Character" flow after login (pick name, pick class — Mage only for now, UI supports a class grid)
- [ ] Character selection screen for users with multiple characters
- [ ] XP and skill points tied to the character, not the account
- [ ] New `characters` table in Supabase linked to user profile

### Leveling System
- [ ] Characters earn XP from matches (win bonus + participation XP)
- [ ] Level determines skill points available (1 point per level, cap ~30)
- [ ] XP curve flattens at higher levels
- [ ] Level displayed in lobby, HUD, and post-match screen

### Persistent Ladder
- [ ] ELO rating per account (not per character)
- [ ] Leaderboard view in lobby (top players, your rank, your rating)
- [ ] Rating adjusts after each match, weighted by opponent rating
- [ ] Room-based matchmaking still — ladder just tracks results

### Post-Match Screen
- [ ] Show XP earned, level progress bar, rating change (+/- ELO)
- [ ] "Rematch" and "Return to Lobby" options

---

## Phase 3: Rogue Class

Close-range, evasive, burst damage. Fundamentally different from Mage.

### Class Foundation
- [ ] New character model (distinct silhouette from Mage)
- [ ] Energy resource (fast regen, lower pool) instead of Mana
- [ ] Directional damage system (backstab bonus based on facing)
- [ ] DoT (poison) damage type — ticks over time
- [ ] Stealth/vision denial mechanic

### Shadow Tree (~12 nodes, 3 spells)
- [ ] Shadow Strike — short-range dash-attack
- [ ] Poison Blade — melee DoT
- [ ] Smoke Bomb — AoE blind/stealth zone

### Assassination Tree (~12 nodes, 3 spells)
- [ ] Backstab — bonus damage from behind
- [ ] Fan of Knives — close-range AoE
- [ ] Mark for Death — debuff amplifying damage taken

### Agility Tree (~4 nodes, 1 spell)
- [ ] Dodge Roll — short invulnerable dash (shorter range, shorter cooldown than Teleport)

---

## Phase 4: Cosmetics & Audio

### Audio
- [ ] Background music — ambient track for lobby, intense track for matches
- [ ] Spell sound effects — unique per spell per class
- [ ] Hit/death sounds, UI click sounds
- [ ] Volume controls in a settings menu

### Cosmetic Rewards
- [ ] Unlocked by reaching level milestones (5, 10, 15, 20, 25, 30)
- [ ] Spell skins — alternate visual effects (e.g., blue fireball, golden lightning)
- [ ] Character skins — color variants or alternate models per class
- [ ] Arena themes — different floor/pillar textures (stone, lava, ice, shadow)
- [ ] Cosmetics are account-wide, not character-specific
- [ ] Cosmetic selection UI in lobby

### Settings Menu
- [ ] Audio volume (music, SFX, master)
- [ ] Keybind remapping
- [ ] Display name change

---

## Phase 5: Paladin Class

Durable frontliner. Completes the class triangle: Mage (ranged control), Rogue (burst/evasion), Paladin (sustain/resilience).

### Class Foundation
- [ ] New character model
- [ ] Higher base HP, lower damage output
- [ ] Mana resource (like Mage, but cheaper spells focused on sustain)
- [ ] Spells designed with ally-targeting in mind (for future team modes)

### Holy Tree (~12 nodes, 3 spells)
- [ ] Smite — mid-range targeted bolt
- [ ] Consecration — persistent AoE zone around self, damages enemies
- [ ] Divine Judgment — delayed single-target nuke, interruptible wind-up

### Protection Tree (~12 nodes, 3 spells)
- [ ] Holy Shield — damage absorption barrier on self
- [ ] Cleanse — removes DoTs and debuffs
- [ ] Retribution Aura — passive, reflects percentage of melee damage taken

### Valor Tree (~4 nodes, 1 spell)
- [ ] Holy Charge — gap closer dash with stun on impact

### Balance Triangle
- Paladin vs Mage: Sustain and Cleanse counter DoTs/zones. Mage range forces Paladin to close distance.
- Paladin vs Rogue: Retribution Aura and Holy Shield punish melee burst. Smoke Bomb counters Paladin's slow wind-ups.

---

## Phase 6: Matchmaking & Ranked Queue (Future)

Depends on player base and how Phases 1–5 shape the game.

- [ ] Matchmaking queue — ELO-based, tolerance widens over time
- [ ] Class preference in queue
- [ ] Seasons — soft reset, placement matches, seasonal cosmetic rewards
- [ ] 2v2 / 3v3 team modes — leveraging Paladin's ally-targeting spells
- [ ] Anti-cheat / reporting system
- [ ] Spectator mode
