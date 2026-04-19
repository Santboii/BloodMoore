# Spell Particle Effects — FireWall & Meteor

**Date:** 2026-04-19
**Branch:** `feature/spell-particle-effects`
**Worktree:** `.worktrees/feature/spell-particle-effects`

## Goal

Make FireWall and Meteor visually readable so players can see and react to them in time. Performance is imperative — single draw call for all fire particles.

---

## Architecture

### FireParticles (replaces FireballParticles)

Rename `FireballParticles` → `FireParticles`. Pool size bumps from 2048 → 4096 to handle all active effects simultaneously. Shader, buffer layout, update loop, and additive blending are unchanged.

New emit methods added:

| Method | Called by |
|---|---|
| `emitFireballTrail()` | unchanged |
| `emitFireballExplosion()` | unchanged |
| `emitWall(segments)` | each frame per active FireWall |
| `emitMeteorTrail(x, y, z)` | each frame per active Meteor while falling |
| `emitMeteorImpact(x, y, z)` | once on Meteor detonation |

Single draw call for all fire particle types. One `THREE.Points` object in the scene.

### SpellRenderer changes

- Rename `fireballParticles` → `fireParticles`
- `syncFireWalls()` — replace flat `PlaneGeometry` with floor `Line` mesh + `emitWall()` each frame
- `syncMeteors()` — replace static ring-only with animated ring + falling rock + particle emissions

---

## FireWall

### What changes

Remove the flat `PlaneGeometry` / `MeshBasicMaterial` wall mesh entirely.

Replace with:

**1. Floor line**
- `THREE.Line` along each segment at `y=1`
- `LineBasicMaterial`: color `#ff4400`, opacity `0.4`, transparent
- Created once on spawn, removed on expiry
- Indicates collision zone to the player

**2. emitWall(segments) — called every frame**
- For each segment: spawn ~3 particles at random positions along the line
- Velocity: `vy: -(40 + rand*40)` (upward), `vx/vz: ±15` (slight lateral jitter)
- Lifetime: `0.4–0.7s`
- Size: `3–6px`
- Same color uniform as fireball (`0xff6600`) — no shader change

---

## Meteor

### What changes

The `MeteorState` already has `{ id, ownerId, target, strikeAt }`. Client derives spawn time as `strikeAt - METEOR_DELAY_TICKS`. Progress ratio `t = 1 - (strikeAt - state.tick) / METEOR_DELAY_TICKS` drives all animations (clamped 0→1). `state.tick` is already available in `SpellRenderer.update(state)`.

**1. Warning ring** (existing ring, now animated)
- `RingGeometry` at `y=2` over `target`
- Each frame: scale lerps from `1.0` → `0.6` as `t` increases
- Opacity pulses via `Math.sin(elapsed * pulseFreq) * 0.3 + 0.5` where `pulseFreq` lerps from `1Hz` → `4Hz` as `t` increases
- Zero allocations per frame — just updating existing mesh uniforms

**2. Falling rock**
- `SphereGeometry(6, 4, 4)` — low-poly
- `MeshBasicMaterial`: bright orange-red `#ff4400` (no emissive needed — additive scene lighting makes it glow naturally)
- Spawns at Three.js world position `(target.x, 500, target.y)`, moves to `y=0` interpolated by `t`
- Removed on detonation
- One draw call, no particles

**3. emitMeteorTrail(x, y, z) — called every frame while falling**
- 2–3 ember particles per frame
- Velocity: downward `vy: +(20 + rand*20)`, small radial spread `±10`
- Lifetime: `0.2–0.3s` — very short, stays tight to the rock
- Size: `2–4px`

**4. emitMeteorImpact(x, y, z) — called once on detonation**
- Single burst of `50–70` particles
- Same as `emitFireballExplosion` but larger: speed `80–200 u/s`, radial spread
- Lifetime: `0.5–0.8s`
- Size: `4–8px`

The meteors map stores `{ ring: THREE.Mesh, rock: THREE.Mesh }` per meteor ID. Both are removed together on detonation.

---

## Performance notes

- All fire particles share one `THREE.Points` draw call
- Pool size 4096 handles: ~5 fireball trails (15p/frame) + 2 firewalls (6p/frame) + 2 meteor trails (6p/frame) comfortably
- Ring animation is free — uniform updates only, no geometry changes
- Falling rock is one low-poly mesh per active meteor
- `emitMeteorImpact` is a one-shot burst, zero ongoing cost

---

## Files affected

| File | Change |
|---|---|
| `client/src/renderer/FireballParticles.ts` | Rename → `FireParticles.ts`, add `emitWall`, `emitMeteorTrail`, `emitMeteorImpact`, increase pool to 4096 |
| `client/src/renderer/SpellRenderer.ts` | Update import, rename reference, rewrite `syncFireWalls`, rewrite `syncMeteors` |
