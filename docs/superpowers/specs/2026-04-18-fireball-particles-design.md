# Fireball Particle Effects Design

**Date:** 2026-04-18  
**Status:** Approved

## Goal

Add an ember trail particle effect to fireballs while in flight, and an explosion burst when a fireball collides with anything (player, pillar, or boundary wall). Effects must stay performant at 60fps with any number of simultaneous fireballs and any map size.

## Visual Style

- **Trail:** Small glowing ember sparks scattered behind the fireball. Sparks drift backward, slightly outward, with a gentle upward then gravity-pulled arc. Orange/warm hue, fade out over ~0.4s.
- **Explosion:** 40–60 particles burst outward and upward from last known fireball position on any collision. Mix of larger (6px) and smaller (3px) particles, fade over 0.5–0.8s.
- Colors: `0xff6600` orange base, warm hue variation per particle.

## Collision Detection (Client-Side)

The client does not receive a collision event from the server. A collision is inferred when a fireball ID present in the previous frame is absent from the current frame's `GameState.projectiles`. The explosion fires at the last known world position of that fireball.

This approach is intentionally simple and handles all collision types (player hit, pillar hit, boundary exit) correctly. It remains valid as the map scales to 2000×2000 or beyond — particles live in world space and Three.js frustum culling suppresses off-screen rendering automatically.

## Architecture

### New file: `client/src/renderer/FireballParticles.ts`

Owns the entire particle system:

- A pre-allocated pool of **2048 particle slots** backed by `Float32Array` typed arrays: `posX`, `posY`, `posZ`, `velX`, `velY`, `velZ`, `life`, `maxLife`, `size`.
- A single `THREE.Points` object with `THREE.BufferGeometry` and `THREE.PointsMaterial`.
- An `activeCount: number` integer tracks live particles. Dead particles are swapped with the last active slot (no GC per frame).
- Exposes:
  - `emitTrail(x, y, z, dirX, dirZ)` — emits 3–5 trail particles (skipped if pool > 90% full)
  - `emitExplosion(x, y, z)` — emits 40–60 burst particles (always runs, not subject to soft cap)
  - `update(delta: number)` — advances simulation and flushes buffer attributes
  - `dispose()` — removes `THREE.Points` from scene, frees geometry

### Modified file: `client/src/renderer/SpellRenderer.ts`

Three additions:

1. **`FireballParticles` instance** constructed in the `SpellRenderer` constructor.
2. **`prevFireballPositions: Map<string, {x: number, y: number, z: number}>`** — stores each fireball's world position from the previous frame. Used to detect vanished IDs and retrieve their last position for the explosion burst.
3. **`clock: THREE.Clock`** — provides `delta` for the particle update loop.
4. `update(state)` calls `fireballParticles.update(delta)`, emits trail particles for each live fireball, and emits explosion bursts for any ID missing vs. the previous frame.
5. `dispose()` calls `fireballParticles.dispose()`.

## Particle Material

```
THREE.PointsMaterial({
  color: 0xff6600,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
  vertexColors: false,
})
```

Per-particle fade is achieved by writing a `size` `BufferAttribute` that shrinks linearly as `life` drains toward 0. This avoids the complexity of per-particle vertex colors while achieving a natural fade-out.

## Particle Parameters

| Parameter | Trail | Explosion |
|-----------|-------|-----------|
| Count per emit | 3–5 | 40–60 |
| Lifetime | 0.35–0.5s | 0.5–0.8s |
| Initial size | 4px | 3–6px (mixed) |
| Velocity | Backward + scatter | Spherical spread, upward bias |
| Gravity | `vy -= 80 * delta` | `vy -= 80 * delta` |
| Y world position | 30 (fireball height) | Last known fireball Y |

## Pool Sizing

2048 slots comfortably supports 20+ simultaneous fireballs with trails and several concurrent explosions. The array is allocated once at construction. At 9 floats per particle × 2048 × 4 bytes = ~72KB — negligible memory cost.

Soft cap: trail emission is skipped when `activeCount > 0.9 * 2048` (≈1843). Explosion emission always proceeds.

## Performance Properties

- **1 draw call** for all particles regardless of count (`THREE.Points`)
- **0 allocations per frame** (pool swap, no `new`, no GC)
- **Off-screen particles** are frustum-culled by Three.js automatically — correct behavior for large maps (2000×2000 branch)
- `depthWrite: false` prevents particle z-fighting with the arena floor

## Files Changed

| File | Change |
|------|--------|
| `client/src/renderer/FireballParticles.ts` | New — particle pool, `THREE.Points`, update loop |
| `client/src/renderer/SpellRenderer.ts` | Add `FireballParticles`, `prevFireballPositions`, `clock`; call `update()` and `dispose()` |

No changes to server, shared types, network layer, or `main.ts`.

## Testing

- Fire a fireball and confirm ember sparks trail behind it
- Confirm sparks fade and arc downward naturally (gravity)
- Hit a player — confirm explosion burst at impact point
- Hit a pillar — confirm explosion burst
- Fire into a boundary wall — confirm explosion burst at edge
- Fire multiple fireballs simultaneously — confirm no frame rate drop
- Confirm spell aiming and other spells are unaffected
