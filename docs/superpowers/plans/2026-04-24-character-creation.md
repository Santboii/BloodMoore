# Character Creation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Diablo-inspired character system where players create named characters of a class, each with its own XP, level, skill points, and skill tree unlocks.

**Architecture:** New `characters` Supabase table with per-character `skill_unlocks`. Existing user-scoped skill point fields migrate off `profiles` onto `characters`. A new `CharacterSelectUI` screen sits between auth and the lobby. The server loads skills per-character and awards XP per-character after matches.

**Tech Stack:** TypeScript, Supabase (PostgreSQL + RPCs), Socket.io, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `shared/src/character.ts` | Character types, XP formula, class definitions |
| Modify | `shared/src/index.ts` | Re-export character module |
| Create | `server/src/skills/xp.ts` | XP/level-up calculation logic (pure functions) |
| Modify | `server/src/skills/loadSkills.ts` | Load skills per-character instead of per-user; new `creditMatchResult` signature |
| Modify | `server/src/rooms/Room.ts` | Add `characterIds` map |
| Modify | `server/src/index.ts` | Pass `characterId` through join/rejoin/match-end flow |
| Create | `client/src/character/CharacterSelectUI.ts` | Character select screen with create/delete |
| Modify | `client/src/supabase.ts` | Add `fetchCharacters`, remove skill_points from `UserProfile` |
| Modify | `client/src/main.ts` | Insert character select into auth→lobby flow |
| Modify | `client/src/lobby/LobbyUI.ts` | Show character info in profile bar, add "Switch Character" callback |
| Modify | `client/src/skills/SkillTreeUI.ts` | Load/unlock skills per-character |
| Modify | `client/src/network/SocketClient.ts` | Pass `characterId` in `joinRoom` |
| Create | `server/tests/xp.test.ts` | XP formula + level-up tests |
| Create | `server/tests/character-flow.test.ts` | Room characterIds mapping tests |

---

### Task 1: Shared character types and XP formula

**Files:**
- Create: `shared/src/character.ts`
- Modify: `shared/src/index.ts`
- Create: `server/src/skills/xp.ts`
- Create: `server/tests/xp.test.ts`

- [ ] **Step 1: Write XP formula tests**

Create `server/tests/xp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { xpToNextLevel, computeLevelUp } from '../src/skills/xp.ts';

describe('xpToNextLevel', () => {
  it('requires 100 XP to go from level 1 to level 2', () => {
    expect(xpToNextLevel(1)).toBe(100);
  });

  it('requires 283 XP to go from level 2 to level 3', () => {
    expect(xpToNextLevel(2)).toBe(283);
  });

  it('scales with diminishing returns', () => {
    const l5 = xpToNextLevel(5);
    const l10 = xpToNextLevel(10);
    expect(l10).toBeGreaterThan(l5);
    expect(l10).toBe(3162);
  });
});

describe('computeLevelUp', () => {
  it('returns no level-up when XP is below threshold', () => {
    const result = computeLevelUp(1, 50, 40);
    expect(result.newLevel).toBe(1);
    expect(result.newXp).toBe(90);
    expect(result.levelsGained).toBe(0);
  });

  it('levels up once when XP crosses one threshold', () => {
    // 50 + 80 = 130, threshold for level 1 is 100 → level 2 with 30 leftover
    const result = computeLevelUp(1, 50, 80);
    expect(result.newLevel).toBe(2);
    expect(result.newXp).toBe(30);
    expect(result.levelsGained).toBe(1);
  });

  it('levels up multiple times if XP is large enough', () => {
    // Level 1 threshold: 100, level 2 threshold: 283
    // 0 + 400 = 400 → level 1 needs 100, leftover 300; level 2 needs 283, leftover 17
    const result = computeLevelUp(1, 0, 400);
    expect(result.newLevel).toBe(3);
    expect(result.newXp).toBe(17);
    expect(result.levelsGained).toBe(2);
  });

  it('does not level up if XP exactly equals zero remaining', () => {
    const result = computeLevelUp(1, 0, 99);
    expect(result.newLevel).toBe(1);
    expect(result.newXp).toBe(99);
    expect(result.levelsGained).toBe(0);
  });

  it('levels up exactly at threshold', () => {
    const result = computeLevelUp(1, 0, 100);
    expect(result.newLevel).toBe(2);
    expect(result.newXp).toBe(0);
    expect(result.levelsGained).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run server/tests/xp.test.ts`
Expected: FAIL — module `../src/skills/xp.ts` does not exist.

- [ ] **Step 3: Create shared character types**

Create `shared/src/character.ts`:

```typescript
export type CharacterClass = 'mage';

export type CharacterRecord = {
  id: string;
  user_id: string;
  name: string;
  class: CharacterClass;
  xp: number;
  level: number;
  skill_points_available: number;
  skill_points_total: number;
  created_at: string;
};

export const MAX_CHARACTERS_PER_ACCOUNT = 6;

export const CHARACTER_CLASSES: { id: CharacterClass; label: string; enabled: boolean }[] = [
  { id: 'mage', label: 'Mage', enabled: true },
];

export const XP_PER_MATCH_BASE = 50;
export const XP_PER_MATCH_WIN_BONUS = 100;

export function xpToNextLevel(currentLevel: number): number {
  return Math.floor(100 * Math.pow(currentLevel, 1.5));
}
```

- [ ] **Step 4: Re-export from shared index**

In `shared/src/index.ts`, add:

```typescript
export * from './character.js';
```

- [ ] **Step 5: Implement XP formula**

Create `server/src/skills/xp.ts`:

```typescript
import { xpToNextLevel } from '@arena/shared';

export { xpToNextLevel };

export function computeLevelUp(
  currentLevel: number,
  currentXp: number,
  xpGained: number,
): { newLevel: number; newXp: number; levelsGained: number } {
  let level = currentLevel;
  let xp = currentXp + xpGained;
  let levelsGained = 0;

  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level++;
    levelsGained++;
  }

  return { newLevel: level, newXp: xp, levelsGained };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run server/tests/xp.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/src/character.ts shared/src/index.ts server/src/skills/xp.ts server/tests/xp.test.ts
git commit -m "feat: add character types and XP level-up formula with tests"
```

---

### Task 2: Supabase migration — characters table and skill_unlocks migration

**Files:**
- Supabase dashboard or migration SQL

This task creates the database schema. These SQL statements must be run in the Supabase SQL editor or via a migration file.

- [ ] **Step 1: Create the characters table**

Run the following SQL in the Supabase SQL editor:

```sql
CREATE TABLE characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  class text NOT NULL DEFAULT 'mage',
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  skill_points_available integer NOT NULL DEFAULT 0,
  skill_points_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name),
  CHECK (char_length(name) BETWEEN 1 AND 20),
  CHECK (class IN ('mage'))
);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own characters"
  ON characters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own characters"
  ON characters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own characters"
  ON characters FOR DELETE
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Migrate skill_unlocks to use character_id**

```sql
ALTER TABLE skill_unlocks ADD COLUMN character_id uuid REFERENCES characters(id) ON DELETE CASCADE;

-- Drop old unique constraint (user_id, node_id) and create new one
ALTER TABLE skill_unlocks DROP CONSTRAINT IF EXISTS skill_unlocks_user_id_node_id_key;
ALTER TABLE skill_unlocks ADD CONSTRAINT skill_unlocks_character_id_node_id_key UNIQUE (character_id, node_id);

-- After data migration is complete, drop user_id column:
-- ALTER TABLE skill_unlocks DROP COLUMN user_id;
-- (Do this after verifying everything works — keep user_id temporarily for safety)
```

- [ ] **Step 3: Remove skill_points columns from profiles**

```sql
-- Keep these columns temporarily — remove after verifying character system works.
-- ALTER TABLE profiles DROP COLUMN skill_points_available;
-- ALTER TABLE profiles DROP COLUMN skill_points_total;
```

- [ ] **Step 4: Create the create_character RPC**

```sql
CREATE OR REPLACE FUNCTION create_character(p_user_id uuid, p_name text, p_class text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*) INTO v_count FROM characters WHERE user_id = p_user_id;
  IF v_count >= 6 THEN
    RAISE EXCEPTION 'Maximum 6 characters per account';
  END IF;

  INSERT INTO characters (user_id, name, class)
  VALUES (p_user_id, p_name, p_class)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
```

- [ ] **Step 5: Create the delete_character RPC**

```sql
CREATE OR REPLACE FUNCTION delete_character(p_user_id uuid, p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM characters WHERE id = p_character_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;
END;
$$;
```

- [ ] **Step 6: Create the updated credit_match_result RPC**

```sql
CREATE OR REPLACE FUNCTION credit_match_result(
  p_user_id uuid,
  p_character_id uuid,
  p_won boolean,
  p_xp integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_char characters%ROWTYPE;
  v_new_level integer;
  v_new_xp integer;
  v_levels_gained integer;
  v_threshold integer;
BEGIN
  SELECT * INTO v_char FROM characters
  WHERE id = p_character_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found';
  END IF;

  -- Compute level-ups
  v_new_level := v_char.level;
  v_new_xp := v_char.xp + p_xp;
  v_levels_gained := 0;

  LOOP
    v_threshold := floor(100 * power(v_new_level, 1.5))::integer;
    EXIT WHEN v_new_xp < v_threshold;
    v_new_xp := v_new_xp - v_threshold;
    v_new_level := v_new_level + 1;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  UPDATE characters SET
    xp = v_new_xp,
    level = v_new_level,
    skill_points_available = skill_points_available + v_levels_gained,
    skill_points_total = skill_points_total + v_levels_gained
  WHERE id = p_character_id;

  -- Update profile match stats
  UPDATE profiles SET
    matches_played = matches_played + 1,
    matches_won = CASE WHEN p_won THEN matches_won + 1 ELSE matches_won END
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'xpGained', p_xp,
    'levelsGained', v_levels_gained,
    'newLevel', v_new_level,
    'newXp', v_new_xp
  );
END;
$$;
```

- [ ] **Step 7: Create the updated unlock_skill_node RPC**

```sql
CREATE OR REPLACE FUNCTION unlock_skill_node(
  p_character_id uuid,
  p_node_id text,
  p_cost integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_char characters%ROWTYPE;
BEGIN
  SELECT * INTO v_char FROM characters
  WHERE id = p_character_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found or unauthorized';
  END IF;

  IF v_char.skill_points_available < p_cost THEN
    RAISE EXCEPTION 'Not enough skill points';
  END IF;

  INSERT INTO skill_unlocks (character_id, node_id)
  VALUES (p_character_id, p_node_id)
  ON CONFLICT DO NOTHING;

  UPDATE characters SET
    skill_points_available = skill_points_available - p_cost
  WHERE id = p_character_id;
END;
$$;
```

- [ ] **Step 8: Create the updated respec_skills RPC**

```sql
CREATE OR REPLACE FUNCTION respec_skills(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_char characters%ROWTYPE;
BEGIN
  SELECT * INTO v_char FROM characters
  WHERE id = p_character_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character not found or unauthorized';
  END IF;

  DELETE FROM skill_unlocks WHERE character_id = p_character_id;

  UPDATE characters SET
    skill_points_available = skill_points_total
  WHERE id = p_character_id;
END;
$$;
```

- [ ] **Step 9: Verify by running a test query**

In Supabase SQL editor:

```sql
-- Verify table exists
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'characters';
```

---

### Task 3: Server-side — load skills per-character and update match result crediting

**Files:**
- Modify: `server/src/skills/loadSkills.ts`
- Modify: `server/src/rooms/Room.ts`
- Create: `server/tests/character-flow.test.ts`

- [ ] **Step 1: Write tests for Room.characterIds**

Create `server/tests/character-flow.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Room } from '../src/rooms/Room.ts';

describe('Room.characterIds', () => {
  it('stores characterId for a socket', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.characterIds.set('s1', 'char-uuid-1');

    expect(room.characterIds.get('s1')).toBe('char-uuid-1');
  });

  it('removePlayer clears characterId', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.characterIds.set('s1', 'char-uuid-1');

    room.removePlayer('s1');

    expect(room.characterIds.has('s1')).toBe(false);
  });

  it('remapPlayer moves characterId to new socket', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.characterIds.set('s1', 'char-uuid-1');
    room.startMatch();

    room.remapPlayer('s1', 's1-new');

    expect(room.characterIds.has('s1')).toBe(false);
    expect(room.characterIds.get('s1-new')).toBe('char-uuid-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run server/tests/character-flow.test.ts`
Expected: FAIL — `characterIds` property does not exist on Room.

- [ ] **Step 3: Add characterIds to Room**

In `server/src/rooms/Room.ts`, add the `characterIds` map alongside `userIds`:

Add to class properties (after line 19 `userIds: Map<string, string> = new Map();`):

```typescript
characterIds: Map<string, string> = new Map();
```

In `removePlayer` method, add after `this.userIds.delete(socketId);`:

```typescript
this.characterIds.delete(socketId);
```

In `remapPlayer` method, add a block to remap characterIds (after the userIds remap block):

```typescript
// Remap characterIds
const characterId = this.characterIds.get(oldSocketId);
if (characterId !== undefined) {
  this.characterIds.delete(oldSocketId);
  this.characterIds.set(newSocketId, characterId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run server/tests/character-flow.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 5: Also run existing Room tests to check for regressions**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run server/tests/room.test.ts`
Expected: All existing tests still PASS.

- [ ] **Step 6: Update loadSkills.ts**

Replace the contents of `server/src/skills/loadSkills.ts`:

```typescript
import { supabase } from '../supabase.ts';
import type { NodeId } from '@arena/shared';
import { XP_PER_MATCH_BASE, XP_PER_MATCH_WIN_BONUS } from '@arena/shared';
import { computeLevelUp } from './xp.ts';

export type SkillLoadResult =
  | { ok: true; userId: string; skills: Set<NodeId> }
  | { ok: false; error: string };

export async function loadSkillsForCharacter(
  accessToken: string,
  characterId: string,
): Promise<SkillLoadResult> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: authErr?.message ?? 'Invalid token' };

  // Verify character belongs to user
  const { data: charData, error: charErr } = await supabase
    .from('characters')
    .select('id')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();

  if (charErr || !charData) return { ok: false, error: 'Character not found or unauthorized' };

  const { data, error } = await supabase
    .from('skill_unlocks')
    .select('node_id')
    .eq('character_id', characterId);

  if (error) return { ok: false, error: error.message };

  const skills = new Set<NodeId>((data ?? []).map((row: { node_id: string }) => row.node_id as NodeId));
  return { ok: true, userId: user.id, skills };
}

export type MatchCreditResult = {
  xpGained: number;
  levelsGained: number;
  newLevel: number;
  newXp: number;
};

export async function creditMatchResult(
  userId: string,
  characterId: string,
  won: boolean,
): Promise<MatchCreditResult> {
  const xp = XP_PER_MATCH_BASE + (won ? XP_PER_MATCH_WIN_BONUS : 0);
  const { data, error } = await supabase.rpc('credit_match_result', {
    p_user_id: userId,
    p_character_id: characterId,
    p_won: won,
    p_xp: xp,
  });

  if (error) {
    console.error('credit_match_result failed:', error.message);
    return { xpGained: xp, levelsGained: 0, newLevel: 0, newXp: 0 };
  }

  return data as MatchCreditResult;
}

// Keep old function temporarily for paused-match endpoint auth check
export async function loadUserFromToken(
  accessToken: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: authErr?.message ?? 'Invalid token' };
  return { ok: true, userId: user.id };
}
```

- [ ] **Step 7: Commit**

```bash
git add server/src/rooms/Room.ts server/src/skills/loadSkills.ts server/tests/character-flow.test.ts
git commit -m "feat: add characterIds to Room and load skills per-character"
```

---

### Task 4: Server index.ts — wire characterId through join/rejoin/match-end

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Update imports**

In `server/src/index.ts`, replace the import line:

```typescript
import { loadSkillsForToken, creditMatchResult } from './skills/loadSkills.ts';
```

with:

```typescript
import { loadSkillsForCharacter, creditMatchResult, loadUserFromToken } from './skills/loadSkills.ts';
```

- [ ] **Step 2: Update paused-match endpoint**

Replace the `app.post('/paused-match', ...)` handler to use `loadUserFromToken` instead of `loadSkillsForToken`:

```typescript
app.post('/paused-match', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) { res.status(401).json({ roomId: null }); return; }
  const result = await loadUserFromToken(token);
  if (!result.ok) { res.status(401).json({ roomId: null }); return; }
  const room = roomManager.findPausedMatchForUser(result.userId);
  res.json({ roomId: room?.id ?? null });
});
```

- [ ] **Step 3: Update join-room handler**

In the `socket.on('join-room', ...)` handler, add `characterId` to the destructured parameters:

```typescript
socket.on('join-room', async ({ roomId, displayName, accessToken, teamId, characterId }: {
  roomId: string;
  displayName: string;
  accessToken?: string;
  teamId?: string;
  characterId?: string;
}) => {
```

Replace the `if (accessToken)` block with:

```typescript
    if (accessToken && characterId) {
      const skillResult = await loadSkillsForCharacter(accessToken, characterId);
      if (skillResult.ok) {
        room.skillSets.set(socket.id, skillResult.skills);
        room.userIds.set(socket.id, skillResult.userId);
        room.characterIds.set(socket.id, characterId);
      }
    }
```

- [ ] **Step 4: Update match-end crediting in player-ready handler**

In the `socket.on('player-ready', ...)` handler, inside the `if (state.phase === 'ended')` block, replace the `for` loop:

```typescript
          const matchResults: Record<string, { xpGained: number; levelsGained: number; newLevel: number }> = {};
          for (const [socketId, userId] of room.userIds.entries()) {
            const characterId = room.characterIds.get(socketId);
            if (!characterId) continue;
            let won: boolean;
            if (state.gameMode === '2v2') {
              const playerTeam = room.teamAssignments.get(socketId);
              won = state.winner === playerTeam;
            } else {
              won = state.winner === socketId;
            }
            const result = await creditMatchResult(userId, characterId, won);
            matchResults[socketId] = { xpGained: result.xpGained, levelsGained: result.levelsGained, newLevel: result.newLevel };
          }
          io.to(roomId).emit('duel-ended', { winnerId: state.winner, gameMode: state.gameMode, matchResults });
```

Note: Remove the separate `io.to(roomId).emit('duel-ended', ...)` line that was before this loop — the emit now happens after all results are computed.

- [ ] **Step 5: Update disconnect handler crediting**

In the `socket.on('disconnect', ...)` handler, inside the 1v1 pause timeout callback, update the crediting loop similarly:

```typescript
          for (const [sid, uid] of r.userIds.entries()) {
            const cid = r.characterIds.get(sid);
            if (!cid) continue;
            const won = sid === connectedSocketId;
            creditMatchResult(uid, cid, won).catch(console.error);
          }
```

- [ ] **Step 6: Update leave-paused-match crediting**

In `socket.on('leave-paused-match', ...)`, update the crediting loop:

```typescript
      for (const [sid, uid] of room.userIds.entries()) {
        const cid = room.characterIds.get(sid);
        if (!cid) continue;
        const won = sid === disconnectedSocketId;
        creditMatchResult(uid, cid, won).catch(console.error);
      }
```

- [ ] **Step 7: Update rejoin-room handler**

In `socket.on('rejoin-room', ...)`, replace `loadSkillsForToken` with `loadUserFromToken`:

```typescript
    const result = await loadUserFromToken(accessToken);
```

The rest of the rejoin logic stays the same — it uses `userId` to find the disconnected player.

- [ ] **Step 8: Run all server tests**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run`
Expected: All tests PASS (the index.ts changes are wiring-only and don't affect unit tests).

- [ ] **Step 9: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: wire characterId through join/rejoin/match-end server flow"
```

---

### Task 5: Client supabase helpers — fetch characters

**Files:**
- Modify: `client/src/supabase.ts`

- [ ] **Step 1: Update UserProfile type and add character helpers**

Replace the contents of `client/src/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { CharacterRecord } from '@arena/shared';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);

export type UserProfile = {
  username: string;
  matches_played: number;
  matches_won: number;
};

export async function fetchProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('username, matches_played, matches_won')
    .eq('user_id', user.id)
    .single();
  return data ?? null;
}

export async function fetchCharacters(): Promise<CharacterRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  return (data ?? []) as CharacterRecord[];
}

export async function createCharacter(name: string, charClass: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc('create_character', {
    p_user_id: user.id,
    p_name: name,
    p_class: charClass,
  });
  if (error) { console.error('create_character failed:', error.message); return null; }
  return data as string;
}

export async function deleteCharacter(characterId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.rpc('delete_character', {
    p_user_id: user.id,
    p_character_id: characterId,
  });
  if (error) { console.error('delete_character failed:', error.message); return false; }
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/supabase.ts
git commit -m "feat: add character CRUD helpers to client supabase module"
```

---

### Task 6: CharacterSelectUI — the character selection screen

**Files:**
- Create: `client/src/character/CharacterSelectUI.ts`

- [ ] **Step 1: Create the CharacterSelectUI**

Create `client/src/character/CharacterSelectUI.ts`:

```typescript
import { fetchCharacters, createCharacter, deleteCharacter } from '../supabase';
import type { CharacterRecord } from '@arena/shared';
import { MAX_CHARACTERS_PER_ACCOUNT, CHARACTER_CLASSES, xpToNextLevel } from '@arena/shared';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type CharacterSelectCallbacks = {
  onSelectCharacter: (character: CharacterRecord) => void;
  onLogout: () => void;
};

const STYLES = `
.cs-overlay{position:fixed;inset:0;z-index:100;background:radial-gradient(ellipse at center,#1a0a04 0%,#0a0a12 60%,#050510 100%);}
.cs-ui{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 24px;font-family:'Crimson Text',Georgia,serif;color:#ccc;}
.cs-title{font-family:'Cinzel',serif;font-size:48px;font-weight:900;color:#c8860a;text-shadow:0 0 20px rgba(200,100,0,0.9),0 0 60px rgba(150,60,0,0.5),2px 2px 0 #3a1500;letter-spacing:8px;text-transform:uppercase;margin-bottom:4px;}
.cs-subtitle{font-family:'Cinzel',serif;font-size:13px;color:#7a5a20;letter-spacing:6px;text-transform:uppercase;margin-bottom:36px;}
.cs-divider{display:flex;align-items:center;gap:12px;width:100%;max-width:700px;margin-bottom:28px;}
.cs-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#5a3a10,transparent);}
.cs-divider-gem{width:10px;height:10px;background:#c8860a;transform:rotate(45deg);box-shadow:0 0 8px rgba(200,130,10,0.6);}
.cs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%;max-width:700px;margin-bottom:24px;}
.cs-slot{background:linear-gradient(160deg,rgba(10,8,4,0.92),rgba(6,4,2,0.95));border:1px solid rgba(90,60,16,0.6);border-top:2px solid rgba(120,80,20,0.8);border-radius:2px;padding:20px;cursor:pointer;transition:all 0.15s;min-height:140px;display:flex;flex-direction:column;}
.cs-slot:hover{border-color:#c8860a;box-shadow:0 0 12px rgba(200,130,10,0.2);}
.cs-slot-empty{align-items:center;justify-content:center;border-style:dashed;border-top-style:dashed;}
.cs-slot-empty:hover{background:rgba(20,14,4,0.95);}
.cs-char-name{font-family:'Cinzel',serif;font-size:18px;color:#d4a840;margin-bottom:4px;}
.cs-char-class{font-family:'Cinzel',serif;font-size:10px;color:#7a5a20;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;}
.cs-char-level{font-size:13px;color:#8a7040;margin-bottom:8px;}
.cs-xp-bar{width:100%;height:6px;background:#1a1208;border:1px solid #3a2710;border-radius:1px;overflow:hidden;margin-bottom:8px;}
.cs-xp-fill{height:100%;background:linear-gradient(90deg,#c8860a,#e8a020);transition:width 0.3s;}
.cs-xp-text{font-size:10px;color:#5a4a20;margin-bottom:auto;}
.cs-slot-actions{display:flex;gap:8px;margin-top:12px;}
.cs-btn-select{flex:1;padding:8px;background:linear-gradient(180deg,#1a4010,#0e2808);color:#88dd44;border:1px solid #2a6010;font-family:'Cinzel',serif;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.cs-btn-delete{padding:8px 12px;background:transparent;color:#884040;border:1px solid #3a1010;font-family:'Cinzel',serif;font-size:11px;cursor:pointer;border-radius:1px;}
.cs-btn-delete:hover{border-color:#cc2222;color:#cc4444;}
.cs-empty-text{font-family:'Cinzel',serif;font-size:13px;color:#3a2a08;letter-spacing:2px;}
.cs-empty-plus{font-size:32px;color:#5a3a10;margin-bottom:8px;}
.cs-create-panel{background:linear-gradient(160deg,rgba(10,8,4,0.92),rgba(6,4,2,0.95));border:1px solid rgba(90,60,16,0.6);border-top:2px solid rgba(120,80,20,0.8);border-radius:2px;padding:28px;width:100%;max-width:400px;}
.cs-create-title{font-family:'Cinzel',serif;font-size:18px;color:#ddb84a;letter-spacing:3px;margin-bottom:20px;text-align:center;}
.cs-label{font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;color:#7a5a20;text-transform:uppercase;margin-bottom:6px;}
.cs-input{width:100%;background:rgba(2,2,8,0.9);border:1px solid rgba(60,42,8,0.8);border-bottom:1px solid rgba(106,74,16,0.9);color:#e8c060;font-family:'Cinzel',serif;font-size:15px;padding:9px 12px;outline:none;letter-spacing:1px;margin-bottom:16px;border-radius:1px;box-sizing:border-box;}
.cs-input::placeholder{color:#3a2a08;}
.cs-input:focus{border-color:#c8860a;box-shadow:0 0 10px rgba(200,130,10,0.25);}
.cs-class-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:20px;}
.cs-class-option{padding:12px;background:rgba(4,4,12,0.9);border:1px solid rgba(40,28,6,0.8);color:#5a4a20;font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;border-radius:1px;text-align:center;transition:all 0.15s;}
.cs-class-option.active{background:rgba(22,14,0,0.95);border-color:#c8860a;color:#ffcc66;box-shadow:0 0 10px rgba(200,130,10,0.2);}
.cs-class-option.disabled{opacity:0.4;cursor:not-allowed;position:relative;}
.cs-class-option.disabled::after{content:'Coming Soon';position:absolute;top:50%;right:12px;transform:translateY(-50%);font-size:9px;color:#5a4010;}
.cs-btn-create{width:100%;padding:12px;background:linear-gradient(180deg,#7a1500,#4a0d00,#3a0800);color:#ffcc88;border:1px solid rgba(140,40,0,0.9);font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;cursor:pointer;border-radius:1px;}
.cs-btn-cancel{width:100%;padding:10px;background:transparent;border:1px solid #3a2710;color:#7a5a20;font-family:'Cinzel',serif;font-size:11px;letter-spacing:2px;cursor:pointer;border-radius:1px;margin-top:8px;}
.cs-error{color:#cc4444;font-size:12px;margin-bottom:12px;text-align:center;}
.cs-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:400;}
.cs-confirm-panel{background:linear-gradient(160deg,rgba(16,12,6,0.98),rgba(8,6,2,0.99));border:1px solid #5a3010;border-top:2px solid rgba(200,134,10,0.6);border-radius:2px;padding:28px 32px;max-width:380px;text-align:center;}
.cs-confirm-title{font-family:'Cinzel',serif;font-size:18px;color:#cc2222;letter-spacing:2px;margin-bottom:12px;}
.cs-confirm-text{font-size:14px;color:#c8a870;margin-bottom:16px;line-height:1.6;}
.cs-confirm-input{width:100%;background:rgba(2,2,8,0.9);border:1px solid rgba(60,42,8,0.8);color:#e8c060;font-family:'Cinzel',serif;font-size:14px;padding:9px 12px;outline:none;margin-bottom:16px;border-radius:1px;box-sizing:border-box;}
.cs-confirm-buttons{display:flex;gap:12px;justify-content:center;}
.cs-confirm-delete{padding:9px 24px;background:linear-gradient(180deg,#7a1500,#4a0d00);color:#ffcc88;border:1px solid rgba(140,40,0,0.9);font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:2px;cursor:pointer;border-radius:1px;text-transform:uppercase;opacity:0.4;pointer-events:none;}
.cs-confirm-delete.enabled{opacity:1;pointer-events:auto;}
.cs-confirm-cancel{padding:9px 24px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;font-family:'Cinzel',serif;font-size:12px;cursor:pointer;border-radius:1px;}
.cs-btn-logout{position:absolute;top:24px;right:24px;background:transparent;border:1px solid rgba(80,40,10,0.6);color:#5a3a10;font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;padding:6px 12px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.cs-btn-logout:hover{border-color:#cc2222;color:#cc6644;}
`;

export class CharacterSelectUI {
  private el: HTMLElement;
  private ui: HTMLElement;
  private characters: CharacterRecord[] = [];
  private showingCreate = false;

  constructor(container: HTMLElement, private cb: CharacterSelectCallbacks) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'cs-overlay';

    this.ui = document.createElement('div');
    this.ui.className = 'cs-ui';
    this.el.appendChild(this.ui);
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'block';
    this.showingCreate = false;
    this.characters = await fetchCharacters();
    this.render();
  }

  hide(): void { this.el.style.display = 'none'; }

  private render(): void {
    if (this.showingCreate) {
      this.renderCreateForm();
      return;
    }

    const slotsHtml = this.characters.map((char, i) => {
      const xpNeeded = xpToNextLevel(char.level);
      const xpPercent = xpNeeded > 0 ? Math.min(100, (char.xp / xpNeeded) * 100) : 0;
      return `
        <div class="cs-slot" data-index="${i}">
          <div class="cs-char-name">${esc(char.name)}</div>
          <div class="cs-char-class">${esc(char.class)}</div>
          <div class="cs-char-level">Level ${char.level}</div>
          <div class="cs-xp-bar"><div class="cs-xp-fill" style="width:${xpPercent}%"></div></div>
          <div class="cs-xp-text">${char.xp} / ${xpNeeded} XP</div>
          <div class="cs-slot-actions">
            <button class="cs-btn-select" data-index="${i}">Select</button>
            <button class="cs-btn-delete" data-index="${i}">Delete</button>
          </div>
        </div>`;
    }).join('');

    const emptySlots = Math.max(0, MAX_CHARACTERS_PER_ACCOUNT - this.characters.length);
    const emptySlotsHtml = Array.from({ length: emptySlots }, () => `
      <div class="cs-slot cs-slot-empty" data-action="create">
        <div class="cs-empty-plus">+</div>
        <div class="cs-empty-text">Create Character</div>
      </div>`).join('');

    this.ui.innerHTML = `
      <button class="cs-btn-logout" id="cs-logout">Sign Out</button>
      <div class="cs-title">Blood Moor</div>
      <div class="cs-subtitle">Choose Your Champion</div>
      <div class="cs-divider"><div class="cs-divider-line"></div><div class="cs-divider-gem"></div><div class="cs-divider-line"></div></div>
      <div class="cs-grid">
        ${slotsHtml}
        ${emptySlotsHtml}
      </div>`;

    this.ui.querySelector('#cs-logout')!.addEventListener('click', () => this.cb.onLogout());

    this.ui.querySelectorAll('.cs-btn-select').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.index!);
        this.cb.onSelectCharacter(this.characters[idx]);
      });
    });

    this.ui.querySelectorAll('.cs-btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.index!);
        this.showDeleteConfirm(this.characters[idx]);
      });
    });

    this.ui.querySelectorAll('[data-action="create"]').forEach(slot => {
      slot.addEventListener('click', () => {
        this.showingCreate = true;
        this.render();
      });
    });
  }

  private renderCreateForm(error = ''): void {
    const classOptions = CHARACTER_CLASSES.map(c => {
      const activeClass = c.id === 'mage' ? 'active' : '';
      const disabledClass = !c.enabled ? 'disabled' : '';
      return `<div class="cs-class-option ${activeClass} ${disabledClass}" data-class="${c.id}">${esc(c.label)}</div>`;
    }).join('');

    this.ui.innerHTML = `
      <div class="cs-title" style="font-size:36px">Blood Moor</div>
      <div class="cs-subtitle">Create a New Champion</div>
      <div class="cs-divider"><div class="cs-divider-line"></div><div class="cs-divider-gem"></div><div class="cs-divider-line"></div></div>
      <div class="cs-create-panel">
        ${error ? `<div class="cs-error">${esc(error)}</div>` : ''}
        <div class="cs-label">Character Name</div>
        <input id="cs-name" class="cs-input" type="text" placeholder="Name your champion..." maxlength="20">
        <div class="cs-label">Class</div>
        <div class="cs-class-grid">${classOptions}</div>
        <button id="cs-create-btn" class="cs-btn-create">Forge Champion</button>
        <button id="cs-cancel-btn" class="cs-btn-cancel">Cancel</button>
      </div>`;

    let selectedClass = 'mage';

    this.ui.querySelectorAll('.cs-class-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const cls = (opt as HTMLElement).dataset.class!;
        const config = CHARACTER_CLASSES.find(c => c.id === cls);
        if (!config?.enabled) return;
        this.ui.querySelectorAll('.cs-class-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedClass = cls;
      });
    });

    this.ui.querySelector('#cs-create-btn')!.addEventListener('click', async () => {
      const name = (this.ui.querySelector('#cs-name') as HTMLInputElement).value.trim();
      if (!name) { this.renderCreateForm('Name is required'); return; }
      if (name.length > 20) { this.renderCreateForm('Name must be 20 characters or less'); return; }

      const id = await createCharacter(name, selectedClass);
      if (!id) { this.renderCreateForm('Failed to create character. Name may already be taken.'); return; }

      this.showingCreate = false;
      this.characters = await fetchCharacters();
      this.render();
    });

    this.ui.querySelector('#cs-cancel-btn')!.addEventListener('click', () => {
      this.showingCreate = false;
      this.render();
    });
  }

  private showDeleteConfirm(character: CharacterRecord): void {
    const overlay = document.createElement('div');
    overlay.className = 'cs-confirm-overlay';
    overlay.innerHTML = `
      <div class="cs-confirm-panel">
        <div class="cs-confirm-title">Delete Character</div>
        <div class="cs-confirm-text">
          This will permanently delete <strong style="color:#d4a840">${esc(character.name)}</strong>
          and all their progress.<br><br>
          Type the character's name to confirm:
        </div>
        <input class="cs-confirm-input" id="cs-delete-input" type="text" placeholder="${esc(character.name)}">
        <div class="cs-confirm-buttons">
          <button class="cs-confirm-delete" id="cs-delete-confirm">Delete Forever</button>
          <button class="cs-confirm-cancel" id="cs-delete-cancel">Cancel</button>
        </div>
      </div>`;

    this.el.appendChild(overlay);

    const input = overlay.querySelector('#cs-delete-input') as HTMLInputElement;
    const confirmBtn = overlay.querySelector('#cs-delete-confirm') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('#cs-delete-cancel')!;

    input.addEventListener('input', () => {
      if (input.value === character.name) {
        confirmBtn.classList.add('enabled');
      } else {
        confirmBtn.classList.remove('enabled');
      }
    });

    confirmBtn.addEventListener('click', async () => {
      if (input.value !== character.name) return;
      const success = await deleteCharacter(character.id);
      overlay.remove();
      if (success) {
        this.characters = await fetchCharacters();
        this.render();
      }
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/character/CharacterSelectUI.ts
git commit -m "feat: add CharacterSelectUI for character selection and creation"
```

---

### Task 7: Update main.ts — insert character select into the auth→lobby flow

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Add imports and state**

At the top of `client/src/main.ts`, add the import:

```typescript
import { CharacterSelectUI } from './character/CharacterSelectUI';
import type { CharacterRecord } from '@arena/shared';
```

After the existing `let accessToken = '';` line, add:

```typescript
let activeCharacter: CharacterRecord | null = null;
```

- [ ] **Step 2: Create the CharacterSelectUI instance**

After the `const skillTreeUI = new SkillTreeUI(uiOverlay);` line, add:

```typescript
const charSelect = new CharacterSelectUI(uiOverlay, {
  onSelectCharacter: (character) => {
    activeCharacter = character;
    charSelect.hide();
    lobby.show();
    lobby.showHome(character.name, character.skill_points_available, character.class, character.level);
  },
  onLogout: async () => {
    try { await supabase.auth.signOut(); } catch {}
    stopGame();
    accessToken = '';
    activeCharacter = null;
    handlersRegistered = false;
    myId = '';
    currentRoomId = '';
    currentPlayers = {};
    allPlayerNames = {};
    currentMode = '1v1';
    myTeamId = undefined;
    ownedSpells = new Set();
    pendingRejoin = null;
    socket.disconnect();
    lobby.hide();
    charSelect.hide();
    auth.show();
  },
});
charSelect.hide();
```

- [ ] **Step 3: Update the auth onAuthed callback**

Replace the `onAuthed` callback body to go to character select instead of lobby:

```typescript
  onAuthed: async (username, token) => {
    accessToken = token;
    auth.hide();

    const pausedRoomId = await checkPausedMatch(token);
    if (pausedRoomId) {
      const profile = await fetchProfile();
      await attemptAutoRejoin(pausedRoomId, username, profile?.skill_points_available);
      return;
    }

    await charSelect.show();
  },
```

- [ ] **Step 4: Update lobby callbacks to use activeCharacter**

Update `onCreateRoom` — pass `characterId` when joining:

In the `socket.joinRoom` call inside `onCreateRoom`, change:

```typescript
socket.joinRoom(roomId, displayName, accessToken);
```

to:

```typescript
socket.joinRoom(roomId, displayName, accessToken, undefined, activeCharacter?.id);
```

Similarly in `onJoinRoom`, change:

```typescript
socket.joinRoom(roomId, displayName, accessToken, teamId);
```

to:

```typescript
socket.joinRoom(roomId, displayName, accessToken, teamId, activeCharacter?.id);
```

- [ ] **Step 5: Add onSwitchCharacter callback to lobby**

In the lobby callbacks object, add:

```typescript
  onSwitchCharacter: async () => {
    lobby.hide();
    await charSelect.show();
  },
```

- [ ] **Step 6: Update onReturnToLobby to show character info**

In the `onReturnToLobby` callback, replace `lobby.showHome(myDisplayName)` with:

```typescript
    if (activeCharacter) {
      lobby.showHome(activeCharacter.name, activeCharacter.skill_points_available, activeCharacter.class, activeCharacter.level);
    } else {
      lobby.showHome(myDisplayName);
    }
```

- [ ] **Step 7: Update onLogout to clear activeCharacter**

In the existing `onLogout` callback, add `activeCharacter = null;` and show auth instead of lobby:

The existing onLogout already does most of this. Just add `activeCharacter = null;` after `accessToken = '';`.

- [ ] **Step 8: Update onOpenSkills to refresh character data**

Replace the `onOpenSkills` callback to use character-scoped data:

```typescript
  onOpenSkills: async () => {
    if (!activeCharacter) return;
    lobby.hide();
    await skillTreeUI.show(activeCharacter.id);
    // Refresh character data after skill changes
    const chars = await fetchCharacters();
    const updated = chars.find(c => c.id === activeCharacter!.id);
    if (updated) activeCharacter = updated;
    // Refresh owned spells
    const { data: { user } } = await supabase.auth.getUser();
    if (user && activeCharacter) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('character_id', activeCharacter.id);
      const nodeSet = new Set<NodeId>((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
      ownedSpells = spellsFromNodes(nodeSet);
      hud.buildSpellSlots(ownedSpells);
    }
    lobby.show();
    if (activeCharacter) {
      lobby.showHome(activeCharacter.name, activeCharacter.skill_points_available, activeCharacter.class, activeCharacter.level);
    }
  },
```

- [ ] **Step 9: Update duel-ended handler to show XP**

In the `socket.onDuelEnded` callback, update to handle `matchResults`:

```typescript
  socket.onDuelEnded(({ winnerId, gameMode, matchResults }) => {
    duelEnded = true;
    const mode = gameMode ?? currentMode;
    let won: boolean;
    if (mode === '2v2') {
      won = winnerId === myTeamId;
    } else {
      won = winnerId === myId;
    }
    lobby.hidePauseOverlay();
    stopGame();

    const myResult = matchResults?.[myId];
    if (mode === 'ffa' && !won) {
      const myDeathIndex = deathOrder.indexOf(myId);
      const totalPlayers = 4;
      const placement = myDeathIndex >= 0 ? totalPlayers - myDeathIndex : 1;
      lobby.showResult(won, mode, placement, myResult);
    } else {
      lobby.showResult(won, mode, undefined, myResult);
    }
    lobby.show();

    // Refresh active character XP/level
    if (activeCharacter && myResult) {
      activeCharacter = {
        ...activeCharacter,
        level: myResult.newLevel || activeCharacter.level,
        xp: myResult.newXp ?? activeCharacter.xp,
      };
    }
  });
```

- [ ] **Step 10: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: integrate CharacterSelectUI into auth→lobby flow"
```

---

### Task 8: Update LobbyUI — show character info and switch character button

**Files:**
- Modify: `client/src/lobby/LobbyUI.ts`

- [ ] **Step 1: Add onSwitchCharacter to LobbyCallbacks**

In `client/src/lobby/LobbyUI.ts`, add to the `LobbyCallbacks` type:

```typescript
  onSwitchCharacter: () => void;
```

- [ ] **Step 2: Update showHome signature**

Change the `showHome` method signature from:

```typescript
showHome(username?: string, points?: number): void {
```

to:

```typescript
showHome(username?: string, points?: number, charClass?: string, level?: number): void {
```

- [ ] **Step 3: Update the profile bar HTML**

In the `showHome` method, replace the `profileBarHtml` block:

```typescript
    const profileBarHtml = hasProfile
      ? `<div style="display:flex;justify-content:center;align-items:center;gap:20px;margin:-14px 0 18px;font-family:'Cinzel',serif;font-size:11px;letter-spacing:2px;text-transform:uppercase">
           ${username ? `<span style="color:#8a7040"><b style="color:#d4a840">${escapeHtml(username)}</b>${charClass ? ` <span style="color:#5a4a20;font-size:9px">the ${escapeHtml(charClass)}</span>` : ''}</span>` : ''}
           ${level !== undefined ? `<span style="color:#7a5a20">Lvl <b style="color:#ffcc66">${level}</b></span>` : ''}
           ${points !== undefined ? `<span style="color:#7a5a20">Skill Points: <b style="color:#ffcc66">${points}</b></span>` : ''}
           <button id="bm-skills" class="bm-btn-blue" style="padding:6px 14px">✦ Skills</button>
           <button id="bm-switch-char" class="bm-btn-blue" style="padding:6px 14px">⇄ Switch</button>
           <button id="bm-logout" class="bm-btn-logout">Sign Out</button>
         </div>`
      : '';
```

- [ ] **Step 4: Add event listener for Switch Character button**

After the existing `skillsBtn` event listener, add:

```typescript
    const switchCharBtn = this.ui.querySelector('#bm-switch-char');
    if (switchCharBtn) switchCharBtn.addEventListener('click', () => this.cb.onSwitchCharacter());
```

- [ ] **Step 5: Update showResult to display XP**

Change the `showResult` method signature from:

```typescript
showResult(won: boolean, mode?: string, placement?: number): void {
```

to:

```typescript
showResult(won: boolean, mode?: string, placement?: number, matchResult?: { xpGained: number; levelsGained: number; newLevel: number }): void {
```

After the `subtitle` assignment and before the `this.ui.innerHTML` template, add XP display HTML:

```typescript
    const xpHtml = matchResult
      ? `<div style="margin-top:16px;font-family:'Cinzel',serif;font-size:14px;color:#c8860a;letter-spacing:2px">
           +${matchResult.xpGained} XP
           ${matchResult.levelsGained > 0 ? `<br><span style="color:#88dd44;font-size:18px;letter-spacing:3px">LEVEL UP! → ${matchResult.newLevel}</span>` : ''}
         </div>`
      : '';
```

Then insert `${xpHtml}` in the result panel template, after the subtitle div and before the rematch button.

- [ ] **Step 6: Commit**

```bash
git add client/src/lobby/LobbyUI.ts
git commit -m "feat: show character info and XP results in lobby"
```

---

### Task 9: Update SkillTreeUI — load/unlock per character

**Files:**
- Modify: `client/src/skills/SkillTreeUI.ts`

- [ ] **Step 1: Update show() to accept characterId**

Change the `show` method signature:

```typescript
async show(characterId?: string): Promise<void> {
  this.characterId = characterId ?? null;
  this.el.style.display = 'block';
  await this.reload();
}
```

Add a class property:

```typescript
private characterId: string | null = null;
```

- [ ] **Step 2: Update reload() to fetch per-character data**

Replace the `reload` method body:

```typescript
private async reload(): Promise<void> {
  if (!this.characterId) return;

  const { data: charData } = await supabase
    .from('characters')
    .select('skill_points_available, name, class')
    .eq('id', this.characterId)
    .single();

  this.skillPoints = charData?.skill_points_available ?? 0;
  this.charName = charData?.name ?? 'Unknown';
  this.charClass = charData?.class ?? 'mage';

  const { data } = await supabase
    .from('skill_unlocks')
    .select('node_id')
    .eq('character_id', this.characterId);
  this.owned = new Set((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));

  this.render();
}
```

Add class properties:

```typescript
private skillPoints = 0;
private charName = '';
private charClass = '';
```

Remove the old `profile` property and `fetchProfile` import — replace with the new properties.

- [ ] **Step 3: Update the header in render()**

In the `render` method, replace `const pts = this.profile?.skill_points_available ?? 0;` with:

```typescript
const pts = this.skillPoints;
```

Replace the title line in the template:

```typescript
<div class="st-title">${esc(this.charName)} — ${esc(this.charClass)} Skills</div>
```

- [ ] **Step 4: Update handleUnlock to use characterId**

Replace the `handleUnlock` method:

```typescript
private async handleUnlock(id: NodeId, cost: number): Promise<void> {
  if (!this.characterId) return;
  const { error } = await supabase.rpc('unlock_skill_node', {
    p_character_id: this.characterId,
    p_node_id: id,
    p_cost: cost,
  });
  if (error) { console.error('Unlock failed:', error.message); return; }
  await this.reload();
}
```

- [ ] **Step 5: Update handleRespec to use characterId**

Replace the `handleRespec` method:

```typescript
private handleRespec(): void {
  this.showConfirm('Reset Skills', 'All unlocked skills will be removed and points refunded. Are you sure?', async () => {
    if (!this.characterId) return;
    const { error } = await supabase.rpc('respec_skills', { p_character_id: this.characterId });
    if (error) { console.error('Respec failed:', error.message); return; }
    await this.reload();
  });
}
```

- [ ] **Step 6: Remove unused imports**

Remove `fetchProfile, UserProfile` from the import line (keep `supabase`). The import should be:

```typescript
import { supabase } from '../supabase';
```

- [ ] **Step 7: Commit**

```bash
git add client/src/skills/SkillTreeUI.ts
git commit -m "feat: load and unlock skills per-character in SkillTreeUI"
```

---

### Task 10: Update SocketClient — pass characterId in joinRoom

**Files:**
- Modify: `client/src/network/SocketClient.ts`

- [ ] **Step 1: Update joinRoom method**

Change the `joinRoom` method signature:

```typescript
joinRoom(roomId: string, displayName: string, accessToken?: string, teamId?: string, characterId?: string): void {
  this.socket.emit('join-room', { roomId, displayName, accessToken, teamId, characterId });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/network/SocketClient.ts
git commit -m "feat: pass characterId in joinRoom socket event"
```

---

### Task 11: Final integration test — run all tests and verify build

**Files:** (none — verification only)

- [ ] **Step 1: Run all server tests**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Verify client builds**

Run: `cd /Users/danielgalvez/coding/bloodmoor/client && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Verify server builds**

Run: `cd /Users/danielgalvez/coding/bloodmoor/server && npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Start the dev server and test in browser**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npm run dev` (or however the dev server starts)

Manual test checklist:
1. Login → should see Character Select screen (not lobby)
2. Create a mage character → character appears in grid
3. Select character → lobby shows character name, class, level
4. "Switch Character" button → returns to character select
5. Delete character → type-name confirmation works
6. Skill tree → shows character-specific skills and points
7. Join a match → after match, XP is awarded to character
8. Sign out → returns to login

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration fixes for character creation system"
```
