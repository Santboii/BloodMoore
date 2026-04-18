# Movement Screen Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rotate the movement input vector by -45° so arrow keys and WASD always move the character in the screen-perceived direction, regardless of the 45° isometric camera.

**Architecture:** A single 2D rotation is applied to the raw `move` vector in `InputHandler.buildInputFrame()` immediately after the key-reading block, before the frame is sent to the server. The server receives an already-corrected world-space direction and requires no changes.

**Tech Stack:** TypeScript, no test framework available on the client (vitest is server-only).

---

### Task 1: Apply isometric rotation to movement input

**Files:**
- Modify: `client/src/input/InputHandler.ts:50-67`

- [ ] **Step 1: Add the rotation transform after the key-reading block**

Open `client/src/input/InputHandler.ts`. Replace lines 50–67 (`buildInputFrame` method) with:

```ts
buildInputFrame(): InputFrame {
  const move = { x: 0, y: 0 };
  if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    move.y -= 1;
  if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  move.y += 1;
  if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  move.x -= 1;
  if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.x += 1;

  // Rotate input to align with screen-perceived directions.
  // Camera sits at 45° azimuth, so raw game-axis input feels rotated to the user.
  const ISO_ANGLE = -Math.PI / 4;
  const cos = Math.cos(ISO_ANGLE); // ≈  0.7071
  const sin = Math.sin(ISO_ANGLE); // ≈ -0.7071
  const rx = move.x * cos - move.y * sin;
  const ry = move.x * sin + move.y * cos;
  move.x = rx;
  move.y = ry;

  const frame: InputFrame = { move, castSpell: null, aimTarget: this.mouseWorld };

  if (this.pendingCast) {
    frame.castSpell = this.pendingCast.spell;
    frame.aimTarget = this.pendingCast.aimTarget;
    frame.aimTarget2 = this.pendingCast.aimTarget2;
    this.pendingCast = null;
  }

  return frame;
}
```

- [ ] **Step 2: Start the dev server and verify manually**

```bash
cd /Users/danielgalvez/coding/arena-game
npm run dev
```

Open the game in the browser and test each direction:

| Key | Expected visual movement |
|-----|--------------------------|
| ArrowUp / W | Character moves toward top of screen |
| ArrowDown / S | Character moves toward bottom of screen |
| ArrowLeft / A | Character moves toward left of screen |
| ArrowRight / D | Character moves toward right of screen |
| W+D (diagonal) | Character moves upper-right at same speed as cardinal |
| W+A (diagonal) | Character moves upper-left at same speed as cardinal |

Also confirm:
- Spell aiming (mouse cursor) is unaffected
- Movement speed feels the same as before

- [ ] **Step 3: Commit**

```bash
git add client/src/input/InputHandler.ts
git commit -m "fix: align arrow key movement with screen orientation

Camera is at 45deg isometric azimuth, causing raw game-axis input
to feel rotated. Rotate move vector by -PI/4 in buildInputFrame
to compensate."
```
