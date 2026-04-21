# Teleport Animation Design

## Overview

Add a client-side visual effect for the existing teleport spell (spell ID 4). The teleport is already functional server-side — the character instantly moves to the target position. This spec covers the visual animation only; no server changes required.

## Theme & Style

- **Theme:** Arcane/electrical
- **Palette:** Gold/white — bright white-hot core flash, golden lightning lines, golden spark particles
- **Animation type:** Instant flash (~200ms total duration)
- **Particle style:** Hybrid electric scatter — layered lightning lines + golden spark particles + expanding ground ring + point light flash
- **Plays identically for all players** — no reduced version for opponents

## Architecture

### File Changes

1. **Rename `client/src/renderer/FireParticles.ts` → `client/src/renderer/ParticleSystem.ts`**
   - Update all imports across the client codebase
   - Add `emitTeleportSparks(position: {x: number, y: number, z: number})` method
   - Emits 20-30 golden particles with randomized outward velocity + gravity falloff
   - Particle color: gold core (`#FFD700`) fading to white (`#FFFFFF`)
   - Particle lifetime: ~150ms
   - Uses existing 4096-particle pool — no new allocations

2. **New file: `client/src/renderer/TeleportEffect.ts`**
   - Orchestrates the full teleport animation at a single world position
   - Creates and manages:
     - **Lightning lines:** 8-12 `LineSegments` (Three.js `BufferGeometry` + `LineBasicMaterial`), gold color, random forking angles, disposed after ~80ms
     - **Ground ring:** Single flat torus `Mesh`, thin, scales outward from 0 to ~60 units radius, opacity fades to 0 over ~150ms. Geometry shared across instances via static reference.
     - **Point light:** `PointLight` (white-gold, intensity ~2), intensity decays to 0 over ~120ms, then removed from scene
     - **Sparks:** Calls `ParticleSystem.emitTeleportSparks()` at spawn time
   - Exposes `update(delta: number): void` to advance animations each frame
   - Exposes `done: boolean` flag — true when all sub-effects have completed (~200ms)
   - `dispose(): void` cleans up all Three.js objects from the scene

3. **Modify `client/src/renderer/SpellRenderer.ts` or `client/src/main.ts`**
   - Add teleport detection and effect management
   - Maintains a list of active `TeleportEffect` instances
   - Each frame: calls `update(delta)` on active effects, removes those marked `done`

### Teleport Detection

Detected client-side by comparing player positions between consecutive interpolated states.

- **Threshold:** Position delta > `PLAYER_SPEED * 2 * TICK_DELTA` (~6.67 world units) in a single frame
- **Location:** In the render loop, after interpolating state from `StateBuffer`, before updating `CharacterMesh` positions
- **On detection:** Capture `originPos` (previous position) and `destPos` (new position), spawn two `TeleportEffect` instances — one at each position
- **Edge case — player join:** Ignore the first position update for a newly joined player to avoid a false flash at (0,0) or spawn point

## Effect Timeline

Each teleport produces two effects (origin + destination), both spawned at t=0:

| Time | Event |
|------|-------|
| 0ms | Lightning lines created, ground ring spawned, PointLight added, sparks emitted |
| 80ms | Lightning lines disposed |
| 120ms | PointLight removed |
| 150ms | Ground ring disposed, spark particles have faded |
| 200ms | Effect marked `done`, manager removes instance |

## Performance Budget

Hard constraint: no frame drops below 60fps during teleport animations.

- **Particles:** 20-30 per effect, 40-60 per teleport (origin + destination). Drawn from existing 4096 pool.
- **Lightning lines:** 8-12 `LineSegments` per effect. Simple `BufferGeometry` with 2-3 vertices each. Created and disposed (not pooled — teleports are too infrequent to justify a pool).
- **PointLights:** 1 per effect, 2 per teleport. Active for ~120ms. Scene already has directional + torch point lights.
- **Ground ring:** 1 mesh per effect. Static shared geometry (torus), only the mesh instance is created/disposed.
- **Worst case (4-player FFA, all teleport same frame):** 8 effects = ~240 particles + ~96 line segments, all resolved within 200ms.

## Testing

- **Unit test:** Teleport detection threshold logic — verify position delta calculation correctly identifies teleports vs normal movement
- **Visual test:** Manual in-browser verification — teleport and confirm effects render at both origin and destination with correct timing and cleanup
- **Performance test:** Rapid teleports in FFA — monitor frame time, confirm sustained 60fps
- **Edge cases:**
  - Teleport clamped to pillar — effect plays at clamped destination, not the aim target
  - Multiple simultaneous teleports — all effects render without particle pool exhaustion
  - Player joining mid-game — no false teleport flash on initial position
