# Rematch Countdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken rematch so both players must opt-in with a 10-second countdown before a new match starts.

**Architecture:** When a player clicks "Rematch", the server records their vote and starts a 10s timer. The opponent sees a countdown on their Rematch button. If both vote within 10s, the server resets the room, starts a proper new `GameLoop`, and emits `rematch-ready`. If the timer expires, non-voters are kicked. This mirrors the existing pause/reconnect countdown pattern.

**Tech Stack:** TypeScript, socket.io (server + client), DOM manipulation for countdown UI

---

### Task 1: Add shared constant and server-side rematch voting

**Files:**
- Modify: `shared/src/types.ts:146` (add constant after `DISCONNECT_TIMEOUT_MS`)
- Modify: `server/src/index.ts:16-17` (add rematch tracking maps next to `pauseTimers`)
- Modify: `server/src/index.ts:151-159` (rewrite `socket.on('rematch')` handler)

- [ ] **Step 1: Add `REMATCH_COUNTDOWN_MS` constant to shared types**

In `shared/src/types.ts`, after line 146 (`DISCONNECT_TIMEOUT_MS`), add:

```typescript
export const REMATCH_COUNTDOWN_MS = 10_000;
```

- [ ] **Step 2: Add rematch tracking maps in server**

In `server/src/index.ts`, after line 17 (`const pauseTimers`), add:

```typescript
const rematchVotes: Map<string, Set<string>> = new Map();
const rematchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
```

Also add the import for the new constant at line 9 — change:

```typescript
import { DISCONNECT_TIMEOUT_MS } from '@arena/shared';
```

to:

```typescript
import { DISCONNECT_TIMEOUT_MS, REMATCH_COUNTDOWN_MS } from '@arena/shared';
```

- [ ] **Step 3: Rewrite the `socket.on('rematch')` handler**

Replace the entire handler at lines 151-159 with:

```typescript
  socket.on('rematch', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    if (room.state?.phase !== 'ended') return;

    const roomId = currentRoomId;
    if (!rematchVotes.has(roomId)) rematchVotes.set(roomId, new Set());
    const votes = rematchVotes.get(roomId)!;
    votes.add(socket.id);

    const allVoted = [...room.players.keys()].every(id => votes.has(id));

    if (allVoted) {
      // All players agreed — start new match
      const timer = rematchTimers.get(roomId);
      if (timer) clearTimeout(timer);
      rematchTimers.delete(roomId);
      rematchVotes.delete(roomId);

      loops.get(roomId)?.stop();
      loops.delete(roomId);
      room.reset();
      for (const id of room.players.keys()) room.setReady(id);
      room.startMatch();

      const loop = new GameLoop();
      loops.set(roomId, loop);
      loop.start(room, async state => {
        io.to(roomId).emit('game-state', state);
        if (state.phase === 'ended') {
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
        }
      });

      io.to(roomId).emit('rematch-ready');
    } else {
      // First vote — start countdown, notify everyone
      io.to(roomId).emit('rematch-requested', {
        requesterId: socket.id,
        countdown: REMATCH_COUNTDOWN_MS / 1000,
      });

      const timer = setTimeout(() => {
        rematchTimers.delete(roomId);
        rematchVotes.delete(roomId);
        // Kick players who didn't vote
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom) return;
        for (const [id] of currentRoom.players) {
          if (!votes.has(id)) {
            io.sockets.sockets.get(id)?.disconnect(true);
          }
        }
      }, REMATCH_COUNTDOWN_MS);

      rematchTimers.set(roomId, timer);
    }
  });
```

- [ ] **Step 4: Clean up rematch state on disconnect**

In `server/src/index.ts`, inside the `socket.on('disconnect')` handler (line 161), add cleanup at the top of the handler body, right after `if (!currentRoomId) return;` and before the existing room check:

```typescript
    // Clean up any pending rematch vote for this player
    const votes = rematchVotes.get(currentRoomId);
    if (votes) {
      votes.delete(socket.id);
      if (votes.size === 0) {
        rematchVotes.delete(currentRoomId);
        const rTimer = rematchTimers.get(currentRoomId);
        if (rTimer) clearTimeout(rTimer);
        rematchTimers.delete(currentRoomId);
      }
    }
```

- [ ] **Step 5: Verify server compiles**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx tsc --noEmit -p server/tsconfig.json`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 6: Commit**

```bash
git add shared/src/types.ts server/src/index.ts
git commit -m "feat: server-side rematch voting with 10s countdown"
```

---

### Task 2: Add client socket event for rematch-requested

**Files:**
- Modify: `client/src/network/SocketClient.ts:49-52` (add new event handler after `onRematchReady`)

- [ ] **Step 1: Add `onRematchRequested` method to `SocketClient`**

In `client/src/network/SocketClient.ts`, after the `onRematchReady` method (line 52), add:

```typescript
  onRematchRequested(cb: (payload: { requesterId: string; countdown: number }) => void): void {
    this.socket.off('rematch-requested');
    this.socket.on('rematch-requested', cb);
  }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/network/SocketClient.ts
git commit -m "feat: add onRematchRequested socket event handler"
```

---

### Task 3: Add rematch countdown UI to LobbyUI

**Files:**
- Modify: `client/src/lobby/LobbyUI.ts:443-444` (update rematch button click handler in `showResult`)
- Modify: `client/src/lobby/LobbyUI.ts:447-455` (expand `disableRematch` area with new methods)

- [ ] **Step 1: Add CSS for countdown styling**

In `client/src/lobby/LobbyUI.ts`, find the `STYLES` constant. Add the following CSS rules at the end of the string, just before the closing backtick:

```css
.bm-btn-rematch.waiting{opacity:0.6;cursor:default;pointer-events:none;}
.bm-rematch-countdown{font-family:'Cinzel',serif;font-size:11px;color:#ffaa44;letter-spacing:2px;margin-top:6px;text-align:center;animation:bm-pulse 1s ease-in-out infinite;}
@keyframes bm-pulse{0%,100%{opacity:1}50%{opacity:0.5}}
```

- [ ] **Step 2: Add `showRematchCountdown` method**

In `client/src/lobby/LobbyUI.ts`, after the `disableRematch()` method (line 455), add:

```typescript
  private rematchInterval: ReturnType<typeof setInterval> | null = null;

  showRematchCountdown(countdown: number, isRequester: boolean): void {
    if (this.rematchInterval) clearInterval(this.rematchInterval);
    const btn = this.ui.querySelector('#bm-rematch') as HTMLButtonElement | null;
    if (!btn) return;

    let remaining = countdown;

    if (isRequester) {
      btn.classList.add('waiting');
      btn.textContent = `Waiting... (${remaining}s)`;
    } else {
      btn.textContent = `⚔ Rematch (${remaining}s)`;
    }

    // Add or update countdown label below buttons
    let label = this.ui.querySelector('.bm-rematch-countdown') as HTMLElement | null;
    if (!label) {
      label = document.createElement('div');
      label.className = 'bm-rematch-countdown';
      const btnContainer = this.ui.querySelector('.bm-result-buttons');
      if (btnContainer) btnContainer.appendChild(label);
    }
    label.textContent = isRequester ? 'Waiting for opponent...' : 'Opponent wants a rematch!';

    this.rematchInterval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        if (this.rematchInterval) clearInterval(this.rematchInterval);
        this.rematchInterval = null;
        if (isRequester) {
          this.disableRematch();
        }
        return;
      }
      if (btn) {
        if (isRequester) {
          btn.textContent = `Waiting... (${remaining}s)`;
        } else {
          btn.textContent = `⚔ Rematch (${remaining}s)`;
        }
    }, 1000);
  }
```

- [ ] **Step 3: Update `disableRematch` to also clear the countdown interval**

Replace the `disableRematch()` method with:

```typescript
  disableRematch(): void {
    if (this.rematchInterval) {
      clearInterval(this.rematchInterval);
      this.rematchInterval = null;
    }
    const btn = this.ui.querySelector('#bm-rematch') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('waiting');
      btn.style.opacity = '0.4';
      btn.style.cursor = 'default';
      btn.textContent = 'Opponent left';
    }
    const label = this.ui.querySelector('.bm-rematch-countdown');
    if (label) label.remove();
  }
```

- [ ] **Step 4: Verify client compiles**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx tsc --noEmit -p client/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/lobby/LobbyUI.ts
git commit -m "feat: rematch countdown UI with timer and waiting states"
```

---

### Task 4: Wire up rematch countdown in main.ts

**Files:**
- Modify: `client/src/main.ts:216` (update `onRematch` callback)
- Modify: `client/src/main.ts:354-359` (keep `onRematchReady` handler as-is)
- Modify: `client/src/main.ts:277-297` (add `onRematchRequested` handler in `setupSocketHandlers`)

- [ ] **Step 1: Add `onRematchRequested` handler in `setupSocketHandlers`**

In `client/src/main.ts`, inside `setupSocketHandlers()`, after the `socket.onPlayerReadyAck` block (after line 297), add:

```typescript
  socket.onRematchRequested(({ requesterId, countdown }) => {
    const isRequester = requesterId === myId;
    lobby.showRematchCountdown(countdown, isRequester);
  });
```

- [ ] **Step 2: Verify client compiles**

Run: `cd /Users/danielgalvez/coding/bloodmoor && npx tsc --noEmit -p client/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: wire rematch-requested event to countdown UI"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start the server and client**

```bash
cd /Users/danielgalvez/coding/bloodmoor && npm run dev
```

- [ ] **Step 2: Test the happy path**

1. Open two browser tabs, create a 1v1 room, join with both players
2. Ready up, play a match until it ends
3. In Tab A: click "Rematch" — verify button changes to "Waiting... (10s)" and starts counting down
4. In Tab B: verify button changes to "⚔ Rematch (10s)" with "Opponent wants a rematch!" label
5. In Tab B: click "Rematch" within 10s — verify a new match starts for both players
6. Verify the new match is playable (spells work, movement works, game ends properly)

- [ ] **Step 3: Test the timeout path**

1. Play another match to completion
2. In Tab A: click "Rematch"
3. In Tab B: do NOT click anything, wait 10s
4. Verify Tab B gets disconnected
5. Verify Tab A shows "Opponent left" on the rematch button

- [ ] **Step 4: Test return-to-lobby during countdown**

1. Play a match to completion
2. In Tab A: click "Rematch"
3. In Tab B: click "Return to Lobby" instead
4. Verify Tab B goes to lobby cleanly
5. Verify Tab A sees "Opponent left" (via the existing disconnect → `disableRematch` flow)

- [ ] **Step 5: Commit any fixes if needed**

```bash
git add -A && git commit -m "fix: rematch countdown adjustments from smoke test"
```
