# Character Creation System — Design Spec

## Overview

Add a Diablo-inspired character system to BloodMoor. Players create named characters of a given class. Each character has its own experience, level, skill points, and skill tree unlocks. Characters persist across matches and gain XP from playing. Only the "Mage" class is available initially.

## Constraints

- Max 6 characters per account
- Character names: 1-20 characters, unique per account
- Only class available: Mage (others grayed out as "Coming Soon")
- Skill builds are locked at match start — allocated beforehand
- XP is per-character, not per-account
- Each class has its own set of talent trees (Mage: fire, frost, lightning — only fire implemented now)

## Data Model

### New `characters` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `user_id` | uuid (FK → auth.users) | Owner |
| `name` | text | Player-chosen, unique per user, 1-20 chars |
| `class` | text | `'mage'` for now |
| `xp` | integer | Starts at 0 |
| `level` | integer | Starts at 1 |
| `skill_points_available` | integer | Unspent points |
| `skill_points_total` | integer | Lifetime earned |
| `created_at` | timestamptz | Default now() |

Unique constraint on `(user_id, name)`. Check constraint: count of characters per user_id <= 6 (enforced in RPC).

### `skill_unlocks` migration

- Add `character_id` column (uuid, FK → characters.id, ON DELETE CASCADE)
- Remove `user_id` foreign key — unlocks are now per-character
- Update unique constraint to `(character_id, node_id)`

### `profiles` migration

- Remove `skill_points_available` and `skill_points_total` columns
- Keep `matches_played`, `matches_won`, `username` as account-level stats

### XP formula (diminishing returns)

Characters start at level 1 with 0 XP. The XP threshold to reach the next level is:

```
xp_to_next_level(current_level) = floor(100 * current_level^1.5)
```

| Current Level | XP to reach next level | Cumulative XP at level |
|---------------|------------------------|------------------------|
| 1 | 100 | 0 |
| 2 | 283 | 100 |
| 5 | 1,118 | 1,497 |
| 10 | 3,162 | 10,540 |
| 15 | 5,809 | 29,498 |
| 20 | 8,944 | 60,498 |

XP per match: 50 base + 100 bonus for winning. Each level-up grants 1 skill point.

## Game Flow

### Updated flow

```
Login → Character Select → Lobby Home → Create/Join Room → Ready → Match → Result (with XP)
```

### Character Select screen (new, shown after login)

- Displays up to 6 character slots
- Each slot: character name, class ("Mage"), level, XP progress bar
- Empty slots: "Create Character" button
- Clicking an existing character sets it as the active character for the session
- Delete button per character: opens modal requiring the user to type the character's name to confirm
- No back button — must pick or create a character to proceed

### Create Character flow

- Name input (1-20 chars, validated for uniqueness per account)
- Class selector: only "Mage" enabled, others grayed out
- Confirm → creates character in Supabase → returns to character select

### Active character propagation

- Active character ID stored in client memory for the session
- Passed to `join-room` socket event
- Lobby header shows: character name, class, level, skill points
- Skill tree UI operates on the active character
- "Switch Character" button in lobby returns to character select

### Post-match XP

- Server awards XP to the active character after match ends
- Result screen shows XP gained and level-up notification if applicable
- `duel-ended` event payload extended with `xpGained` and `leveledUp` fields

## Server-Side Changes

### `loadSkills.ts`

- `loadSkillsForToken(accessToken)` → `loadSkillsForCharacter(accessToken, characterId)`
- Validates character belongs to authenticated user
- Loads skill unlocks where `character_id` matches
- Returns character level alongside skills

### `creditMatchResult`

- Signature: `creditMatchResult(userId, characterId, won)`
- Awards XP to character, checks for level-up, increments profile match stats
- Returns `{ xpGained, leveledUp }` so server can broadcast to client

### `server/index.ts`

- `join-room` event gains `characterId` field
- Room stores `characterIds` map (socket → character ID) alongside `userIds`
- Match end passes `characterId` to `creditMatchResult`
- `rejoin-room` validates character ownership

### New Supabase RPCs

| RPC | Parameters | Purpose |
|-----|-----------|---------|
| `create_character` | `p_user_id, p_name, p_class` | Creates character, enforces 6-max limit |
| `delete_character` | `p_user_id, p_character_id` | Hard deletes character, cascades to skill_unlocks |
| `credit_match_result` | `p_user_id, p_character_id, p_won, p_xp` | Awards XP, handles level-up, updates profile stats |
| `unlock_skill_node` | `p_character_id, p_node_id, p_cost` | Unlocks skill node for character |
| `respec_skills` | `p_character_id` | Refunds all skill points for character |

All RPCs verify character ownership via `auth.uid()`.

## Client-Side Changes

### New: `client/src/character/CharacterSelectUI.ts`

- Character select screen with Blood Moor aesthetic
- Fetches characters from Supabase
- Character slots with name, class, level, XP bar
- Create/delete character flows
- Callbacks: `onSelectCharacter(characterId)`, `onLogout()`

### Modified: `client/src/main.ts`

- After auth, show CharacterSelectUI before lobby
- Store `activeCharacterId` in session
- Pass `characterId` in `join-room` socket event
- "Switch Character" button returns to character select

### Modified: `client/src/skills/SkillTreeUI.ts`

- Fetch skill unlocks by `character_id` instead of `user_id`
- `handleUnlock()` and `handleRespec()` use `character_id`
- Header shows character name + class

### Modified: `client/src/lobby/LobbyUI.ts`

- `showHome()` receives character info (name, class, level, points)
- Profile bar shows character details + "Switch Character" button
- `LobbyCallbacks` gains `onSwitchCharacter`

### Modified: Result screen

- Shows XP gained and level-up notification
- Data from extended `duel-ended` event payload
