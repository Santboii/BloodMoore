# Skill Tree UI Redesign

**Date:** 2026-04-19
**Status:** Draft

## Goal

Replace the current modal-style skill tree overlay with a dedicated full-screen view. Fix three core UX problems: (1) the modal feel with Blood Moor bleeding through, (2) poor scrolling and cramped layout, (3) unclear distinction between owned and locked nodes.

## What Changes

Only `client/src/skills/SkillTreeUI.ts` is rewritten. Everything else stays:
- `shared/src/skills.ts` — node data, gate logic, types unchanged
- Supabase RPCs (`unlock_skill_node`, `respec_skills`) — unchanged
- `main.ts` — existing `onOpenSkills` callback already does `lobby.hide()` / `lobby.show()`, no structural change
- `LobbyUI.ts` — Skills button and callback unchanged
- Server-side skill loading — untouched

## View Structure

The skill tree becomes a full-screen view, same pattern as `LobbyUI` and `AuthUI`. When opened, the lobby hides completely. When closed, the lobby returns.

**Background:** solid dark (`#0a0704`) with a subtle radial vignette. No Blood Moor fog, moon, or SVG landscape. Dark and focused.

**Layout (top to bottom, scrolls naturally):**

1. **Header bar** — fixed or top-of-scroll
   - Left: "Sorceress Skills" title (Cinzel Decorative, gold `#ddb84a`)
   - Center: "Points Available: N" display
   - Right: "Reset Skills" button + "Back to Lobby" button (same style as current)

2. **Fire tree** — centered, full width it needs
   - Nodes arranged vertically by tier (1→7) with SVG connection lines
   - Tree flows top-to-bottom: Fireball at top, Molten Impact / Blind Strike at bottom
   - Each tier row is horizontally centered
   - Generous vertical spacing between tiers (~80-100px)

3. **Divider** — horizontal line with diamond gem (matching lobby divider style)

4. **Utility strip** — horizontal row of 4 utility nodes, centered
   - Same connection line treatment: Teleport → Phase Shift / Ethereal Form → Phantom Step
   - Laid out left-to-right instead of top-to-bottom

## Node Layout: Fire Tree

Based on the `GATES` dependency structure in `shared/src/skills.ts`, the connections are:

- Fireball → Volatile Ember, Seeking Flame, Hellfire, Pyroclasm (all require `fire.fireball`)
- Fire Wall requires `fire.fireball` (requiresAll) AND one of Volatile Ember or Seeking Flame (requiresAny)
- Enduring Flames, Searing Heat → require Fire Wall
- Meteor requires `fire.fire_wall` (requiresAll) AND one of Enduring Flames or Searing Heat (requiresAny)
- Molten Impact, Blind Strike → require Meteor

Visual layout (centered spells, modifiers fan left/right):

```
                Tier 1:        [Fireball]
                            /   |      |   \
                Tier 2:  [Volatile]    [Seeking]
                         |  \    \    /   /  |
                Tier 3:  [Hellfire] [Pyroclasm]
                          :    \    /    :
                Tier 4:       [Fire Wall]
                               /        \
                Tier 5:  [Enduring]    [Searing]
                               \        /
                Tier 6:        [Meteor]
                               /      \
                Tier 7:  [Molten]    [Blind]
```

Solid lines = `requiresAll` connections. Tier 2/3 nodes all have a solid line from Fireball. Dotted/thinner lines = `requiresAny` connections (Volatile/Seeking → Fire Wall, Enduring/Searing → Meteor).

To keep the visual clean, Hellfire and Pyroclasm are positioned on the left/right at tier 3 even though they only require Fireball (no tier 2 prereqs). The layout uses position to suggest progression, not strict dependency — the connection lines are the source of truth.

## Node Layout: Utility Strip

```
  [Teleport] → [Phase Shift]  → [Phantom Step]
             → [Ethereal Form] ↗
```

Horizontal layout, Teleport on the left, Phantom Step on the right. Phase Shift and Ethereal Form are vertically stacked in the middle column with lines converging on Phantom Step.

## Node Visual States

Three states, designed to be distinguishable at a glance:

### Owned
- Border: bright orange-red `#e86020`, 2.5px solid
- Fill: warm radial gradient (`#2a0c00` center → `#0e0400` edge)
- Icon: vivid fire color `#e87040`
- Label: warm `#d86040`
- Spells get an outer glow ring: `box-shadow: 0 0 12px rgba(232, 96, 32, 0.25)`
- Cost display: "Owned" in `#d86040`

### Purchasable (requirements met, have enough points)
- Border: gold `#c8860a`, 2px dashed
- Fill: slightly warm dark (`#160800` center → `#0a0400` edge)
- Icon: gold `#c8860a`
- Label: gold `#c8860a`
- No outer glow
- Cost display: "2 pts" in gold `#c8860a`

### Locked (requirements not met or insufficient points)
- Border: gray `#444`, 1.5px solid
- Fill: neutral dark gray `#151515`
- Icon: gray `#555`
- Label: gray `#555`
- No glow, no warmth
- Cost display: "2 pts" in `#444`

### Size
- Spells (`isSpell: true`): 58px diameter circles
- Modifiers (`isSpell: false`): 44px diameter circles

## Connection Lines

Drawn as an SVG element layered behind the node elements.

**Line coloring follows the downstream node's state:**
- Line to an owned node: `#e86020` at 60% opacity, 2px
- Line to a purchasable node: `#c8860a` at 40% opacity, 2px
- Line to a locked node: `#333` at 30% opacity, 1.5px

**`requiresAll` lines:** solid
**`requiresAny` lines:** thinner (1px) and slightly more transparent, to visually communicate "any one of these" without clutter

Lines are straight segments from parent circle edge to child circle edge (no curves).

## Hidden Locked Trees

Lightning and Frost columns are removed entirely. No "Coming Soon" placeholders. The Fire tree and Utility strip occupy the full view. When Lightning/Frost are implemented, they'll be added as additional tree sections.

## Interactions

### Tooltip (hover)
Same follow-cursor tooltip as today, better formatted:
- **Name** (bold, gold `#ddb84a`)
- **Description** (standard text `#c8a870`)
- **Cost** ("Cost: 2 pts" in `#7a6030`)
- **Status line:** one of:
  - Owned: nothing extra
  - Purchasable: "Click to unlock" in green `#60a840`
  - Locked: "Requires: Fireball" in red `#884020` (list the missing prereqs)

### Unlock (click)
- Click a purchasable node → calls `unlock_skill_node` RPC → `reload()` re-renders
- The visual state change from purchasable (gold dashed) to owned (vivid orange glow) provides the feedback
- No additional animations

### Reset Skills
- Click "Reset Skills" → `confirm('Reset all skills? Points will be refunded.')` → calls `respec_skills` RPC → `reload()`
- The confirm dialog prevents accidental resets

### Back to Lobby
- Click "Back to Lobby" → `hide()` → lobby restores via existing `onOpenSkills` callback flow in `main.ts`

## CSS Approach

Continue using inline styles in TypeScript (matching the codebase pattern). The `STYLES` constant pattern from `LobbyUI.ts` is cleaner — define a `<style>` block with class-based rules rather than per-element inline styles. The rewrite should adopt this pattern for maintainability.

## Out of Scope

- Lightning/Frost tree implementation
- Unlock animations or particle effects
- Pan/zoom or canvas rendering
- Keyboard navigation
- Mobile responsiveness
