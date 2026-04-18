# Movement Screen Alignment Fix

**Date:** 2026-04-18  
**Status:** Approved

## Problem

Arrow keys and WASD move the character along the game's world axes (X and Y), but the isometric camera is rotated 45° azimuth. This means pressing "up" moves the character toward the upper-right of the screen — not visually upward — which feels unintuitive.

## Goal

Arrow keys and WASD must always move the character in the screen-perceived direction, regardless of the grid's world-space orientation.

## Root Cause

`InputHandler.buildInputFrame()` maps keys directly to raw game-world vectors:

- `ArrowUp` / `KeyW` → `move.y -= 1`
- `ArrowDown` / `KeyS` → `move.y += 1`
- `ArrowLeft` / `KeyA` → `move.x -= 1`
- `ArrowRight` / `KeyD` → `move.x += 1`

The camera sits at `(600, 600, 600)` looking at `(400, 0, 400)` — a fixed 45° azimuth isometric view. Game X maps to Three.js X, game Y maps to Three.js Z. A raw `move.y -= 1` therefore moves the character in the Three.js -Z direction, which appears as upper-right on screen, not upward.

## Solution

Apply a -45° (−π/4) rotation to the `move` vector in `buildInputFrame()` before it is sent to the server. This converts screen-perceived directions into the correct world-space directions.

**Rotation formula:**
```ts
const ISO_ANGLE = -Math.PI / 4;
const cos = Math.cos(ISO_ANGLE); // 1/√2
const sin = Math.sin(ISO_ANGLE); // -1/√2
const rx = move.x * cos - move.y * sin;
const ry = move.x * sin + move.y * cos;
move.x = rx;
move.y = ry;
```

The server's `movePlayer()` already normalizes the input vector, so diagonal movement magnitude is unaffected.

## Constraints

- Camera angle is fixed at 45° for the lifetime of the game — no dynamic recalculation needed.
- No changes to the server, shared types, or any other client file.

## Affected File

| File | Change |
|------|--------|
| `client/src/input/InputHandler.ts` | Add rotation transform after key-reading block in `buildInputFrame()` |

## Testing

- Press each arrow key / WASD direction individually and confirm the character moves in the visually expected screen direction.
- Press diagonal combinations and confirm movement speed is the same as cardinal movement.
- Confirm spell aiming (mouse-based) is unaffected.
