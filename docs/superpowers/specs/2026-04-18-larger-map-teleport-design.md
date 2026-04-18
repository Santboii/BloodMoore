# Larger Map, Player Camera & Teleport Spell

**Date:** 2026-04-18
**Status:** Approved

## Summary

Three self-contained changes: expand the arena from 800×800 to 2000×2000 with scattered obstacles, replace the fixed camera with a Diablo 2-style player-following camera plus corner minimap, and add a mana-costed teleport spell that mirrors the fireball cast flow.

---

## 1. Map Expansion

### Dimensions
- `ARENA_SIZE`: 800 → **2000** (in `shared/src/types.ts`)
- Boundary clamp: `[PLAYER_HALF_SIZE, 2000 - PLAYER_HALF_SIZE]` on both axes

### Obstacles
- Replace the 5-pillar cross pattern with **10 pillars placed semi-randomly**
- Placement constraints:
  - No pillar within 200 units of any spawn point
  - No pillar within 150 units of arena edges
  - No two pillars closer than 200 units to each other
- Pillar dimensions unchanged (same size as current)
- Hardcode the 10 positions as a constant in `shared/src/types.ts` (same pattern as current `PILLARS` array)

### Spawn Positions
- Left spawn: `(200, 1000)`
- Right spawn: `(1800, 1000)`

### 3D Geometry
- `Arena.ts` `buildFloor()`, `buildBoundaryWalls()`, `buildPillars()` all derive dimensions from `ARENA_SIZE` and `PILLARS` constants — no hardcoded values, so updating the constants is sufficient

---

## 2. Player-Following Camera (Diablo 2 Style)

### Behavior
- Camera tracks the **local player's world position** each frame
- Opponent can leave the viewport entirely — no forced framing
- Fixed orthographic frustum: **±600 units** (shows ~1200×1200 of the 2000×2000 world)
- Camera position lerps toward the player each frame (smooth follow, no snapping)

### Implementation
- New file: `client/src/renderer/CameraController.ts`
- Owns the Three.js `OrthographicCamera` instance (extracted from `Scene.ts`)
- Exposes a single `update(playerX: number, playerZ: number, delta: number)` method called from the render loop
- Lerp factor: configurable constant (start at ~8, tune by feel)
- Camera offset from player: same isometric vector as current `(600, 600, 600)` offset, translated to track player position rather than arena center

### Interface with Scene
- `Scene.ts` passes camera ownership to `CameraController` at init
- Render loop calls `cameraController.update(localPlayer.x, localPlayer.z, delta)` each frame

---

## 3. Corner Minimap

### Visual
- **120×120px** canvas element, top-right corner of the game viewport
- Slight transparency (opacity ~0.85), dark background, gold border to match HUD style
- Draws:
  - Arena border outline
  - All pillar positions as small purple squares
  - Local player as a green dot
  - Opponent as a red dot
- Scales world coordinates to minimap pixel space: `minimapPx = (worldPos / ARENA_SIZE) * MINIMAP_SIZE`

### Implementation
- New file: `client/src/hud/Minimap.ts`
- DOM `<canvas>` element positioned as CSS overlay (absolute, top-right)
- No Three.js — plain 2D canvas draw calls
- `update(localPlayer, opponent)` called each frame from the game loop
- Integrated into `HUD.ts` alongside existing health/mana bars

---

## 4. Teleport Spell

### Behavior
- Teleports the caster instantly to the cursor's ground position
- Targeting: cursor → world XZ via existing `screenToWorld()` raycast (same as fireball targeting)
- Cost: **40 mana** (tunable constant)
- No separate cooldown — mana cost is the gate
- Target is clamped to arena bounds server-side before applying

### Shared Types (`shared/src/types.ts`)
- Add `TELEPORT` to the `SpellType` enum
- Add `TELEPORT_MANA_COST = 40` constant

### Client
- `InputHandler.ts`: bind teleport cast to key `E` (or whichever key is next in the spell bar)
- Cast message: `{ type: "TELEPORT", targetX: number, targetY: number }` — same shape as fireball
- HUD spell bar: add teleport slot with icon and mana cost label

### Server
- New handler in the spell processing logic (alongside fireball handler):
  1. Check player has ≥ 40 mana; reject silently if not
  2. Clamp `targetX`, `targetY` to `[PLAYER_HALF_SIZE, ARENA_SIZE - PLAYER_HALF_SIZE]`
  3. Set `player.x = targetX`, `player.y = targetY` directly
  4. Deduct mana

---

## Files Changed

| File | Change |
|---|---|
| `shared/src/types.ts` | `ARENA_SIZE`, `PILLARS`, `SPAWN_POSITIONS` updated; `SpellType.TELEPORT`, `TELEPORT_MANA_COST` added |
| `client/src/renderer/Scene.ts` | Extract camera to `CameraController`; call `cameraController.update()` in render loop |
| `client/src/renderer/CameraController.ts` | **New** — player-following orthographic camera |
| `client/src/hud/Minimap.ts` | **New** — 2D canvas minimap overlay |
| `client/src/hud/HUD.ts` | Integrate `Minimap`; add teleport spell slot to spell bar |
| `client/src/input/InputHandler.ts` | Bind teleport key; emit teleport cast with cursor world pos |
| `server/src/physics/Movement.ts` or spell handler | Add teleport spell handler |

---

## Out of Scope

- Teleport animation or VFX (can be added later)
- Named zones or biome theming
- Minimap fog-of-war
- Multiple local players
