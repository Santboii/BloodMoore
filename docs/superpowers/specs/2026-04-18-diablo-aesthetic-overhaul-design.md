# Visual Overhaul — Diablo III Stylized 3D Aesthetic

**Date:** 2026-04-18
**Status:** Approved

## Summary

Replace the current primitive-geometry rendering (capsule characters, flat-color arena) with a Diablo III-style dark fantasy aesthetic: GLTF character models with skeletal animation, PBR stone textures on the arena, atmospheric torch lighting, and bloom post-processing. The fireball particle system, camera controller, minimap, and teleport spell are already implemented and out of scope.

## Scope

### In scope

| File | Change |
|---|---|
| `client/src/renderer/CharacterMesh.ts` | Replace CapsuleGeometry with GLTFLoader + AnimationMixer; delegate animation state to CharacterAnimator |
| `client/src/renderer/CharacterAnimator.ts` *(new)* | idle / walk / cast animation state machine |
| `client/src/renderer/Arena.ts` | Swap MeshLambertMaterial for MeshStandardMaterial + PBR stone textures; add torch PointLights on pillars |
| `client/src/renderer/Scene.ts` | Overhaul lighting setup; add EffectComposer (bloom + vignette) replacing bare renderer.render() |
| `client/src/renderer/AssetLoader.ts` *(new)* | Singleton that preloads all GLTF + textures before game start; gates the lobby UI |

### Out of scope (already done)

- Fireball particles (`FireballParticles.ts`) ✓
- Player-following camera (`CameraController.ts`) ✓
- Minimap (`Minimap.ts`) ✓
- Teleport spell ✓

## Assets

All assets are CC0 (no attribution required, free to use commercially).

### Characters
- **Source:** [Quaternius](https://quaternius.com) — Ultimate Animated Character Pack or equivalent
- **Format:** `.glb` with embedded skeleton and named animation clips
- **Required clips:** `idle`, `walk`, `attack` (used for cast)
- **Two distinct models:** one per player slot (e.g., Warrior for player 0, Mage/Rogue for player 1)
- **Committed to:** `client/public/assets/characters/`

### Textures
- **Source:** [Poly Haven](https://polyhaven.com) — CC0 PBR texture sets
- **Floor:** cobblestone or dungeon stone set — diffuse, normal, roughness maps at 1K resolution
- **Pillars/Walls:** castle stone or brick set — diffuse, normal, roughness maps at 1K resolution
- **Committed to:** `client/public/assets/textures/`

## Architecture

### AssetLoader

Singleton loaded once at app startup. Returns typed handles so the rest of the code never deals with raw Three.js loaders.

```ts
interface LoadedAssets {
  characters: { warrior: GLTF; mage: GLTF };
  textures: {
    floor: { map: Texture; normalMap: Texture; roughnessMap: Texture };
    stone: { map: Texture; normalMap: Texture; roughnessMap: Texture };
  };
}

class AssetLoader {
  static async load(): Promise<LoadedAssets>
}
```

`main.ts` awaits `AssetLoader.load()` before constructing Arena or CharacterMesh. A simple loading screen (existing lobby UI overlay) gates the user during asset fetch.

### CharacterAnimator

Owns `THREE.AnimationMixer` and named `AnimationAction` handles. Drives crossfade transitions between states.

**States:** `idle` | `walk` | `cast`

**Transitions:**
- `idle ↔ walk`: driven by caller passing velocity magnitude each frame
- `any → cast`: triggered by caller on spell-cast event; one-shot clip, crossfades back to `idle`/`walk` on clip end
- Crossfade duration: 200ms (`crossFadeTo(next, 0.2, true)`)

```ts
class CharacterAnimator {
  constructor(mixer: AnimationMixer, clips: AnimationClip[])
  update(delta: number, velocityMag: number, isCasting: boolean): void  // velocityMag from CharacterMesh position delta
  transitionTo(state: 'idle' | 'walk' | 'cast'): void
}
```

`CharacterMesh` creates the animator after the GLTF is loaded and calls `animator.update()` each frame.

### CharacterMesh (revised)

- Loads from pre-loaded GLTF handle (passed in, not fetched internally)
- Scales model to match current capsule footprint (~50 units tall)
- Keeps existing DOM name label and ground ring
- `setPosition(x, y)` stores previous position and computes velocity magnitude internally each frame — no external velocity tracking needed
- `update(delta, isCasting)` drives the animator; velocity magnitude is derived from the position delta computed in `setPosition()`

### Arena (revised)

- All materials upgraded from `MeshLambertMaterial` → `MeshStandardMaterial`
- Floor: tiled PBR cobblestone, `repeat` set to `(ARENA_SIZE / 200, ARENA_SIZE / 200)` for 2000×2000 arena
- Pillars + walls: castle stone PBR material
- Adds one `PointLight(0xff6600, 3, 450, 2)` per pillar, positioned 60 units above pillar top

### Scene (revised)

**Lighting:**

| Light | Value | Role |
|---|---|---|
| `AmbientLight` | `0x110a08`, intensity 0.3 | Near-black warm base |
| `HemisphereLight` | sky `0x001122`, ground `0x220800`, 0.3 | Cool sky / blood-red ground gradient |
| `DirectionalLight` | `0x4455aa`, intensity 0.25 | Dim cool moonlight, still casts shadows |
| `PointLight` × N (one per pillar) | `0xff6600`, distance 450, decay 2 | Per-pillar torch — primary scene illumination |

**Post-processing pipeline** (replaces bare `renderer.render()`):

```
RenderPass → UnrealBloomPass → ShaderPass(vignette) → screen
```

- `UnrealBloomPass`: threshold `0.3`, strength `0.5`, radius `0.4`
- Vignette: custom GLSL ShaderPass, darkens screen edges ~30%
- `composer.render()` called in `startRenderLoop` instead of `renderer.render()`
- `composer.setSize()` called in `onResize`

## Data Flow

```
main.ts
  └─ await AssetLoader.load()
       ├─ Arena(assets.textures)      — textured floor + pillars + torch lights
       ├─ Scene.initPostProcessing()  — EffectComposer setup
       └─ on player join:
            CharacterMesh(assets.characters.warrior | .mage, ...)
              └─ CharacterAnimator(mixer, clips)

render loop:
  CharacterMesh.setPosition(x, y)        — stores prev pos, computes velocityMag
  CharacterMesh.update(delta, isCasting)
    └─ CharacterAnimator.update(delta, velocityMag, isCasting)
  Scene.composer.render()
```

## Error Handling

- Asset load failures surface as a thrown error from `AssetLoader.load()` — caught in `main.ts` and shown as a lobby error message. No silent fallbacks; a missing GLTF produces a visible error rather than an invisible character.
- If a requested animation clip name isn't found in the GLTF, `CharacterAnimator` logs a warning and stays in `idle`. Game remains playable.

## Testing

- No unit tests for rendering code — Three.js objects don't meaningfully run in jsdom.
- Visual verification: run dev server, confirm idle/walk/cast animations trigger correctly, confirm bloom is visible on torch lights, confirm textures tile without seams on 2000×2000 floor.
- Performance check: confirm stable 60fps in Chrome DevTools with two characters + particles active.
