# Stackable Skill Modifiers

Certain modifier nodes in the skill tree become rankable: players can invest multiple skill points to increase their effect. This gives players finer-grained control over builds and enables more diverse playstyles.

## Design Decisions

- **Soft cap with incremental cost ramp (per-node):** Each stackable node has its own soft cap. Ranks up to the cap cost the node's base cost. Past the cap, purchasing rank R costs `baseCost + (R - softCap)` points. No hard limit — players can always invest more, but it gets expensive.
- **Diminishing returns via power curve:** Effect scales as `baseEffect * rank^0.7`. Early ranks are impactful; later ranks are incremental.
- **Per-node soft caps and base effects:** Each stackable node defines its own soft cap and base effect value, tuned to its power level and gameplay impact.
- **Binary nodes unchanged:** Nodes with inherently on/off effects (Blind Strike, Molten Impact, Ethereal Form, Phantom Step) remain single-point purchases.

## Stackable vs Binary Nodes

### Stackable

| Node | Soft Cap | Base Cost | Base Effect (rank 1) | What Scales |
|------|----------|-----------|----------------------|-------------|
| Seeking Flame | 5 | 1 | homing strength 25 | Turn acceleration per tick |
| Volatile Ember | 5 | 1 | +8% radius | Explosion radius multiplier |
| Hellfire | 3 | 2 | scaling factor 1.0 (see below) | Size & damage up, speed down |
| Pyroclasm | 3 | 2 | +1 split projectile | Split count (floored) |
| Enduring Flames | 5 | 1 | +10% duration | Fire wall duration multiplier |
| Searing Heat | 5 | 2 | +8% damage | Fire wall damage multiplier |
| Phase Shift | 5 | 2 | +8% range | Teleport range multiplier |

### Binary (unchanged)

| Node | Cost | Effect |
|------|------|--------|
| Blind Strike | 2 | Meteor indicator hidden from enemies |
| Molten Impact | 2 | Meteor leaves burning crater for 3s |
| Ethereal Form | 2 | 0.5s invulnerability after teleport |
| Phantom Step | 3 | Next cast free within 2s of teleport |

Spells (Fireball, Fire Wall, Meteor, Teleport) remain single-point unlocks.

### Multi-Parameter Nodes (Hellfire)

Hellfire scales three parameters simultaneously. Its `baseEffect` is a generic scaling factor (1.0). The per-parameter ratios are shared constants used by both `buildSpellModifiers` and the UI tooltip:

- `radius *= 1 + 0.5 * effectAtRank(1.0, rank)` → rank 1: +50%, rank 3: +108%
- `damageMin/Max *= 1 + 0.3 * effectAtRank(1.0, rank)` → rank 1: +30%, rank 3: +65%
- `speed *= 1 - 0.15 * effectAtRank(1.0, rank)` → rank 1: -15%, rank 3: -32%

These ratios (0.5, 0.3, 0.15) are defined as shared constants alongside SKILL_NODES so the client can compute tooltip previews. At high ranks, the speed penalty makes the fireball very slow — this is the intended tradeoff.

## Scaling Formula

All stackable nodes share the same diminishing returns exponent:

```
DIMINISHING_POWER = 0.7

effect(rank) = baseEffect * rank ^ DIMINISHING_POWER
```

Example for Seeking Flame (baseEffect = 25, softCap = 5):

| Rank | Effect | Cost This Rank | Total Spent |
|------|--------|----------------|-------------|
| 1 | 25.0 | 1 | 1 |
| 2 | 40.6 | 1 | 2 |
| 3 | 53.8 | 1 | 3 |
| 4 | 65.5 | 1 | 4 |
| 5 | 76.1 | 1 | 5 |
| 6 | 85.9 | 2 | 7 |
| 7 | 95.0 | 3 | 10 |
| 8 | 103.7 | 4 | 14 |

Cost past soft cap: `baseCost + (rank - softCap)`, so rank 6 = 1+1 = 2, rank 7 = 1+2 = 3, etc.

## Data Model Changes

### Shared Types (shared/src/skills.ts)

Add `StackableConfig` to `SkillNode`:

```typescript
type StackableConfig = {
  softCap: number;
  baseEffect: number;
};

type SkillNode = {
  id: NodeId;
  name: string;
  tree: SkillTree;
  tier: number;
  cost: number;          // base cost per rank
  isSpell: boolean;
  description: string;
  stackable?: StackableConfig;
};
```

Add shared helpers:

```typescript
const DIMINISHING_POWER = 0.7;

function rankUpCost(node: SkillNode, currentRank: number): number;
function effectAtRank(baseEffect: number, rank: number): number;
function totalSpentForRanks(node: SkillNode, rank: number): number;
function isStackable(node: SkillNode): boolean;
```

### Ownership Representation

Throughout the codebase, skill ownership changes from `Set<NodeId>` to `Map<NodeId, number>`:

- `Room.skillSets: Record<string, Map<NodeId, number>>`
- `loadSkillsForCharacter` returns `Map<NodeId, number>`
- `advanceState` accepts `Record<string, Map<NodeId, number>>`
- `buildSpellModifiers` accepts `Map<string, number>`

Binary nodes have rank 1 when owned. Stackable nodes have rank 1+.

### Database (skill_unlocks table)

Migration:

```sql
ALTER TABLE skill_unlocks ADD COLUMN rank INTEGER NOT NULL DEFAULT 1;
ALTER TABLE skill_unlocks ADD COLUMN total_spent INTEGER NOT NULL DEFAULT 0;

-- Backfill total_spent for existing rows (all are rank 1).
-- Must match base costs from SKILL_NODES: fireball=1, volatile_ember=1,
-- seeking_flame=1, hellfire=2, pyroclasm=2, fire_wall=2, enduring_flames=1,
-- searing_heat=2, meteor=3, molten_impact=2, blind_strike=2, teleport=1,
-- phase_shift=2, ethereal_form=2, phantom_step=3.
UPDATE skill_unlocks SET total_spent = CASE node_id
  WHEN 'fire.fireball' THEN 1
  WHEN 'fire.volatile_ember' THEN 1
  WHEN 'fire.seeking_flame' THEN 1
  WHEN 'fire.hellfire' THEN 2
  WHEN 'fire.pyroclasm' THEN 2
  WHEN 'fire.fire_wall' THEN 2
  WHEN 'fire.enduring_flames' THEN 1
  WHEN 'fire.searing_heat' THEN 2
  WHEN 'fire.meteor' THEN 3
  WHEN 'fire.molten_impact' THEN 2
  WHEN 'fire.blind_strike' THEN 2
  WHEN 'utility.teleport' THEN 1
  WHEN 'utility.phase_shift' THEN 2
  WHEN 'utility.ethereal_form' THEN 2
  WHEN 'utility.phantom_step' THEN 3
  ELSE 1
END;
```

### RPC Changes

**`unlock_skill_node(p_character_id, p_node_id, p_cost)`:**

- No existing row: INSERT with rank 1, total_spent = p_cost. Deduct p_cost from skill_points_available.
- Existing row + stackable node: INCREMENT rank, total_spent += p_cost. Deduct p_cost.
- Existing row + binary node: Reject (already owned).

Client computes correct p_cost via `rankUpCost()`. Server validates p_cost matches expected cost for the node's current rank.

**`respec_skills(p_character_id)`:**

Refunds `SUM(total_spent)` from all skill_unlocks rows. Deletes all rows. The `total_spent` column avoids duplicating the cost formula in SQL.

### loadSkillsForCharacter (server)

Selects `node_id, rank` instead of just `node_id`. Returns `Map<NodeId, number>`.

## SpellModifiers Changes

### buildSpellModifiers (server/src/skills/SpellModifiers.ts)

Signature: `buildSpellModifiers(skills: Map<string, number>): SpellModifiers`

Helper: `const rank = (id: string) => skills.get(id) ?? 0;`

Each stackable modifier calls `effectAtRank(baseEffect, rank(nodeId))` to compute its scaled value. Binary modifiers use `rank(id) > 0`.

### FireballModifiers type change

```typescript
type FireballModifiers = {
  speed: number;
  radius: number;
  damageMin: number;
  damageMax: number;
  homingStrength: number;  // was: homing: boolean
  split: number;
};
```

### Fireball.ts homing change

`Projectile.homing` changes from `boolean` to `number`. The `advanceFireball` function uses it as the acceleration strength directly instead of the hardcoded `60`.

### Projectile type change (shared/src/types.ts)

```typescript
// Projectile.homing: boolean → number
homing?: number;  // 0 or undefined = no homing, positive = turn acceleration
```

## Skill Tree UI Changes

### Ring Segments + Number Badge

Stackable nodes get a radial progress ring around the circle border:
- Each segment = one rank
- Up to soft cap: orange segments (#e86020)
- Past soft cap: gold segments (#ddb84a)
- Rank number displayed centered inside the node, below the icon

Binary nodes render exactly as they do today.

### Node States (stackable)

- **Unowned:** Same as today (dashed if purchasable, grey if locked)
- **Owned, rank < soft cap:** Orange glow + partial ring + rank number. Clickable to rank up.
- **Owned, rank = soft cap:** Full orange ring, subtle visual signal that more ranks are possible.
- **Owned, rank > soft cap:** Orange ring (soft cap segments) + gold ring (overflow segments).

### Click Behavior

Clicking an owned stackable node opens the confirm dialog:
- Shows current rank and effect
- Shows next rank cost and effect
- "Rank Up" / "Cancel" buttons

Reuses existing `showConfirm` pattern.

### Tooltip

Stackable node tooltip shows:
- Current rank / soft cap (e.g., "Rank 3 / 5")
- Current effect value (e.g., "Homing strength: 53")
- Next rank: effect and cost (e.g., "Next: 65 — 1 pt")
- Past soft cap: cost emphasized (e.g., "Next: 86 — 2 pts")

Binary node tooltips unchanged.

### Respec

"Reset Skills" refunds the correct total. The `total_spent` column in the database makes this a simple `SUM(total_spent)` query.

## Files Changed

| File | Change |
|------|--------|
| `shared/src/skills.ts` | Add StackableConfig, stackable field to nodes, helper functions, DIMINISHING_POWER |
| `shared/src/types.ts` | Projectile.homing: boolean → number |
| `server/src/skills/SpellModifiers.ts` | Accept Map, use effectAtRank(), homingStrength |
| `server/src/skills/loadSkills.ts` | Return Map<NodeId, number>, select rank column |
| `server/src/spells/Fireball.ts` | Use numeric homing strength from projectile |
| `server/src/gameloop/StateAdvancer.ts` | skillSets type change, pass homingStrength |
| `server/src/rooms/Room.ts` | skillSets type change |
| `client/src/skills/SkillTreeUI.ts` | Ring segments, rank badge, rank-up click, updated tooltip |
| `server/tests/skills.test.ts` | Update tests for Map-based API, add rank scaling tests |
| Database migration | Add rank and total_spent columns, update RPCs |
