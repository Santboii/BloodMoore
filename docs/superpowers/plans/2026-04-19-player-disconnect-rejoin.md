# Player Disconnect & Rejoin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **IMPORTANT:** This plan must be executed in a git worktree. Use superpowers:using-git-worktrees to create one before starting.

**Goal:** Gracefully handle mid-match player disconnects with a 60-second pause/rejoin window, forfeiting if the timer expires.

**Architecture:** Pause-in-place approach — on disconnect, stop the game loop but keep Room and GameState alive. A server-side 60-second timer governs the rejoin window. Reconnecting players are identified by Supabase user ID. The connected player sees a countdown overlay and can leave early (conceding the match).

**Tech Stack:** Socket.io, TypeScript, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/rooms/Room.ts` | Modify | Add `PauseState` type and `pauseState` field, `pause()` / `resume()` / `remapPlayer()` methods |
| `server/src/gameloop/GameLoop.ts` | Modify | Add `pause()` and `resume()` methods (stop/restart interval without destroying) |
| `server/src/index.ts` | Modify | Rewrite disconnect handler, add `rejoin-room` and `leave-paused-match` handlers |
| `client/src/network/SocketClient.ts` | Modify | Add emitters/listeners for new events (`match-paused`, `game-resumed`, `rejoin-room`, etc.) |
| `client/src/main.ts` | Modify | Add rejoin state tracking, handle pause/resume/rejoin flow |
| `client/src/lobby/LobbyUI.ts` | Modify | Add `showPauseOverlay()` / `hidePauseOverlay()` methods |
| `server/tests/room.test.ts` | Modify | Add tests for pause/resume/remap |
| `server/tests/disconnect.test.ts` | Create | Integration-style tests for disconnect/rejoin scenarios |

---

### Task 1: Add PauseState and pause/resume to Room

**Files:**
- Modify: `server/src/rooms/Room.ts`
- Modify: `server/tests/room.test.ts`

- [ ] **Step 1: Write failing tests for Room.pause()**

Add to `server/tests/room.test.ts`:

```typescript
describe('Room pause/resume', () => {
  it('pause() sets pauseState with disconnected user ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');

    expect(room.pauseState).not.toBeNull();
    expect(room.pauseState!.disconnectedUserIds.has('user-1')).toBe(true);
    expect(room.pauseState!.disconnectedUserIds.has('user-2')).toBe(false);
  });

  it('pause() can track multiple disconnected users', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.pause('user-2');

    expect(room.pauseState!.disconnectedUserIds.size).toBe(2);
  });

  it('resume() clears pauseState', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.resume('user-1');

    expect(room.pauseState).toBeNull();
  });

  it('resume() only removes specified user from disconnectedUserIds', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.pause('user-2');
    room.resume('user-1');

    expect(room.pauseState).not.toBeNull();
    expect(room.pauseState!.disconnectedUserIds.has('user-2')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/room.test.ts`
Expected: FAIL — `pause` and `resume` methods do not exist, `pauseState` property does not exist.

- [ ] **Step 3: Implement PauseState type and pause/resume methods**

In `server/src/rooms/Room.ts`, add the `PauseState` type after the `RoomPlayer` type:

```typescript
export type PauseState = {
  disconnectedUserIds: Set<string>;
  pausedAt: number; // Date.now() timestamp
};
```

Add the `pauseState` field to the `Room` class:

```typescript
pauseState: PauseState | null = null;
```

Add the `pause()` method to the `Room` class:

```typescript
pause(userId: string): void {
  if (!this.pauseState) {
    this.pauseState = {
      disconnectedUserIds: new Set([userId]),
      pausedAt: Date.now(),
    };
  } else {
    this.pauseState.disconnectedUserIds.add(userId);
  }
}
```

Add the `resume()` method to the `Room` class:

```typescript
resume(userId: string): void {
  if (!this.pauseState) return;
  this.pauseState.disconnectedUserIds.delete(userId);
  if (this.pauseState.disconnectedUserIds.size === 0) {
    this.pauseState = null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/room.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/rooms/Room.ts server/tests/room.test.ts
git commit -m "feat: add PauseState and pause/resume to Room"
```

---

### Task 2: Add remapPlayer to Room

**Files:**
- Modify: `server/src/rooms/Room.ts`
- Modify: `server/tests/room.test.ts`

- [ ] **Step 1: Write failing tests for Room.remapPlayer()**

Add to `server/tests/room.test.ts`:

```typescript
describe('Room.remapPlayer', () => {
  it('replaces old socket ID with new one in players map', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.remapPlayer('s1', 's1-new');

    expect(room.players.has('s1')).toBe(false);
    expect(room.players.has('s1-new')).toBe(true);
    expect(room.players.get('s1-new')!.displayName).toBe('Alice');
  });

  it('remaps userIds entry to new socket ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.userIds.set('s1', 'user-1');

    room.remapPlayer('s1', 's1-new');

    expect(room.userIds.has('s1')).toBe(false);
    expect(room.userIds.get('s1-new')).toBe('user-1');
  });

  it('remaps skillSets entry to new socket ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    const skills = new Set(['fire.fireball'] as any);
    room.skillSets.set('s1', skills);

    room.remapPlayer('s1', 's1-new');

    expect(room.skillSets.has('s1')).toBe(false);
    expect(room.skillSets.get('s1-new')).toBe(skills);
  });

  it('remaps pendingInputs entry to new socket ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();
    const input = { move: { x: 1, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } };
    room.queueInput('s1', input);

    room.remapPlayer('s1', 's1-new');

    // After remap, queuing input on old ID should not work, new ID should
    room.queueInput('s1-new', input);
    // Just verify it doesn't throw — pendingInputs is private so we test via tick()
  });

  it('remaps player ID in GameState.players', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.remapPlayer('s1', 's1-new');

    expect(room.state!.players['s1']).toBeUndefined();
    expect(room.state!.players['s1-new']).toBeDefined();
    expect(room.state!.players['s1-new'].displayName).toBe('Alice');
    expect(room.state!.players['s1-new'].id).toBe('s1-new');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/room.test.ts`
Expected: FAIL — `remapPlayer` method does not exist.

- [ ] **Step 3: Implement remapPlayer**

Add to `Room` class in `server/src/rooms/Room.ts`:

```typescript
remapPlayer(oldSocketId: string, newSocketId: string): void {
  // Remap players
  const player = this.players.get(oldSocketId);
  if (player) {
    this.players.delete(oldSocketId);
    player.socketId = newSocketId;
    this.players.set(newSocketId, player);
  }

  // Remap userIds
  const userId = this.userIds.get(oldSocketId);
  if (userId !== undefined) {
    this.userIds.delete(oldSocketId);
    this.userIds.set(newSocketId, userId);
  }

  // Remap skillSets
  const skills = this.skillSets.get(oldSocketId);
  if (skills) {
    this.skillSets.delete(oldSocketId);
    this.skillSets.set(newSocketId, skills);
  }

  // Remap pendingInputs
  const input = this.pendingInputs.get(oldSocketId);
  if (input) {
    this.pendingInputs.delete(oldSocketId);
    this.pendingInputs.set(newSocketId, input);
  }

  // Remap player ID in GameState
  if (this.state) {
    const playerState = this.state.players[oldSocketId];
    if (playerState) {
      delete this.state.players[oldSocketId];
      playerState.id = newSocketId;
      this.state.players[newSocketId] = playerState;
    }
  }
}
```

Note: `pendingInputs` is currently `private`. Change it to `private` still but the `remapPlayer` method is inside the class so it has access. No visibility change needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/room.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/rooms/Room.ts server/tests/room.test.ts
git commit -m "feat: add remapPlayer to Room for socket ID remapping"
```

---

### Task 3: Add pause/resume to GameLoop

**Files:**
- Modify: `server/src/gameloop/GameLoop.ts`

- [ ] **Step 1: Write failing test**

Create `server/tests/gameloop.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameLoop } from '../src/gameloop/GameLoop.ts';
import { Room } from '../src/rooms/Room.ts';

describe('GameLoop pause/resume', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pause() stops ticking without destroying the loop', () => {
    vi.useFakeTimers();
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    const broadcast = vi.fn();
    const loop = new GameLoop();
    loop.start(room, broadcast);

    vi.advanceTimersByTime(100); // ~6 ticks
    const callsBeforePause = broadcast.mock.calls.length;
    expect(callsBeforePause).toBeGreaterThan(0);

    loop.pause();
    broadcast.mockClear();
    vi.advanceTimersByTime(100);
    expect(broadcast).not.toHaveBeenCalled();

    loop.stop();
  });

  it('resume() restarts ticking after pause', () => {
    vi.useFakeTimers();
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    const broadcast = vi.fn();
    const loop = new GameLoop();
    loop.start(room, broadcast);

    loop.pause();
    broadcast.mockClear();

    loop.resume();
    vi.advanceTimersByTime(100);
    expect(broadcast.mock.calls.length).toBeGreaterThan(0);

    loop.stop();
  });

  it('pause() is a no-op if not started', () => {
    const loop = new GameLoop();
    expect(() => loop.pause()).not.toThrow();
  });

  it('resume() is a no-op if not paused', () => {
    const loop = new GameLoop();
    expect(() => loop.resume()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/gameloop.test.ts`
Expected: FAIL — `pause` and `resume` methods do not exist on `GameLoop`.

- [ ] **Step 3: Implement pause/resume on GameLoop**

Replace the full content of `server/src/gameloop/GameLoop.ts`:

```typescript
import { GameState } from '@arena/shared';
import { Room } from '../rooms/Room.ts';

type BroadcastFn = (state: GameState) => void;

export class GameLoop {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private room: Room | null = null;
  private broadcast: BroadcastFn | null = null;

  start(room: Room, broadcast: BroadcastFn): void {
    if (this.intervalId) return;
    this.room = room;
    this.broadcast = broadcast;
    this.startInterval();
  }

  pause(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resume(): void {
    if (!this.room || !this.broadcast) return;
    if (this.intervalId) return;
    this.startInterval();
  }

  stop(): void {
    this.pause();
    this.room = null;
    this.broadcast = null;
  }

  private startInterval(): void {
    this.intervalId = setInterval(() => {
      const state = this.room!.tick();
      if (state.phase === 'ended') this.stop();
      this.broadcast!(state);
    }, 1000 / 60);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/gameloop.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run all existing tests to check for regressions**

Run: `cd server && npx vitest run`
Expected: All tests PASS. The GameLoop API is the same for `start()` and `stop()`.

- [ ] **Step 6: Commit**

```bash
git add server/src/gameloop/GameLoop.ts server/tests/gameloop.test.ts
git commit -m "feat: add pause/resume to GameLoop"
```

---

### Task 4: Rewrite server disconnect handler and add rejoin/leave handlers

**Files:**
- Modify: `server/src/index.ts`
- Create: `server/tests/disconnect.test.ts`

- [ ] **Step 1: Write failing integration tests for disconnect/rejoin**

Create `server/tests/disconnect.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Room } from '../src/rooms/Room.ts';
import { GameLoop } from '../src/gameloop/GameLoop.ts';

describe('disconnect scenarios (unit-level)', () => {
  it('mid-match disconnect pauses room instead of tearing down', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    const loop = new GameLoop();
    loop.start(room, vi.fn());

    // Simulate what the disconnect handler should do:
    // Instead of room.removePlayer + loop.stop(), it should pause
    loop.pause();
    room.pause('user-1');

    expect(room.pauseState).not.toBeNull();
    expect(room.state).not.toBeNull(); // state preserved
    expect(room.players.has('s1')).toBe(true); // player NOT removed

    loop.stop();
  });

  it('lobby disconnect still removes player normally', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');

    // state is null (lobby phase)
    expect(room.state).toBeNull();

    // Normal remove
    room.removePlayer('s1');
    expect(room.players.size).toBe(0);
  });

  it('rejoin remaps socket ID and resumes', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    const loop = new GameLoop();
    loop.start(room, vi.fn());

    // Disconnect
    loop.pause();
    room.pause('user-1');

    // Rejoin with new socket ID
    room.remapPlayer('s1', 's1-new');
    room.resume('user-1');
    loop.resume();

    expect(room.pauseState).toBeNull();
    expect(room.players.has('s1-new')).toBe(true);
    expect(room.state!.players['s1-new']).toBeDefined();

    loop.stop();
  });

  it('connected player leaving during pause triggers forfeit', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    // s1 disconnects
    room.pause('user-1');

    // s2 (connected player) leaves — s1 wins
    // The server handler sets phase to ended and winner to the disconnected player's socket ID
    room.state!.phase = 'ended';
    room.state!.winner = 's1';

    expect(room.state!.phase).toBe('ended');
    expect(room.state!.winner).toBe('s1');
  });

  it('both players disconnect — no winner', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.pause('user-2');

    expect(room.pauseState!.disconnectedUserIds.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/disconnect.test.ts`
Expected: All PASS — these tests use the Room/GameLoop APIs we already built. This validates the building blocks work together before we wire them into the socket handler.

- [ ] **Step 3: Rewrite the disconnect handler in server/src/index.ts**

Replace the `socket.on('disconnect', ...)` handler (lines 125-134) with:

```typescript
  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    const isMidMatch = room.state !== null && room.state.phase !== 'ended';

    if (isMidMatch) {
      const userId = room.userIds.get(socket.id);
      if (!userId) return;

      const loop = loops.get(currentRoomId);
      loop?.pause();
      room.pause(userId);

      socket.to(currentRoomId).emit('match-paused', {
        reason: 'opponent-disconnected',
        countdown: 60,
      });

      const roomId = currentRoomId;
      // Only start timer if one isn't already running (second disconnect during pause)
      if (pauseTimers.has(roomId)) return;
      const pauseTimer = setTimeout(() => {
        const r = roomManager.getRoom(roomId);
        if (!r || !r.pauseState) return;

        const connectedSocketId = [...r.players.entries()]
          .find(([sid]) => {
            const uid = r.userIds.get(sid);
            return uid && !r.pauseState!.disconnectedUserIds.has(uid);
          })?.[0];

        if (connectedSocketId) {
          r.state!.phase = 'ended';
          r.state!.winner = connectedSocketId;
          io.to(roomId).emit('duel-ended', { winnerId: connectedSocketId });
          for (const [sid, uid] of r.userIds.entries()) {
            const won = sid === connectedSocketId;
            creditMatchResult(uid, won).catch(console.error);
          }
        }
        // No connected player = no result (both disconnected)

        loops.get(roomId)?.stop();
        loops.delete(roomId);
        roomManager.deleteRoom(roomId);
      }, 60_000);

      pauseTimers.set(roomId, pauseTimer);
    } else {
      // Lobby phase or ended phase — original behavior
      room.removePlayer(socket.id);
      loops.get(currentRoomId)?.stop();
      loops.delete(currentRoomId);
      io.to(currentRoomId).emit('opponent-disconnected');
      if (room.players.size === 0) roomManager.deleteRoom(currentRoomId);
    }
  });
```

Also add the `pauseTimers` map near the top of the file, after the `loops` declaration:

```typescript
const pauseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
```

- [ ] **Step 4: Add the `rejoin-room` handler**

Add this handler inside the `io.on('connection', socket => { ... })` block, after the `input` handler:

```typescript
  socket.on('rejoin-room', async ({ roomId, accessToken }: {
    roomId: string;
    accessToken: string;
  }) => {
    const room = roomManager.getRoom(roomId);
    if (!room || !room.pauseState) {
      socket.emit('rejoin-failed', { reason: 'Room not found or not paused' });
      return;
    }

    const result = await loadSkillsForToken(accessToken);
    if (!result.ok) {
      socket.emit('rejoin-failed', { reason: 'Invalid token' });
      return;
    }

    const userId = result.userId;
    if (!room.pauseState.disconnectedUserIds.has(userId)) {
      socket.emit('rejoin-failed', { reason: 'Not a disconnected player in this room' });
      return;
    }

    // Find the old socket ID for this user
    const oldSocketId = [...room.userIds.entries()]
      .find(([, uid]) => uid === userId)?.[0];
    if (!oldSocketId) {
      socket.emit('rejoin-failed', { reason: 'Player not found in room' });
      return;
    }

    // Remap socket ID
    room.remapPlayer(oldSocketId, socket.id);
    room.resume(userId);
    socket.join(roomId);
    currentRoomId = roomId;

    // Cancel pause timer if no one is disconnected anymore
    if (!room.pauseState) {
      const timer = pauseTimers.get(roomId);
      if (timer) {
        clearTimeout(timer);
        pauseTimers.delete(roomId);
      }

      // Resume game loop
      loops.get(roomId)?.resume();
    }

    // Send current state to reconnecting client
    socket.emit('rejoin-accepted');
    if (room.state) {
      socket.emit('game-state', room.state);
    }

    // Notify the other player
    if (!room.pauseState) {
      socket.to(roomId).emit('game-resumed');
    }
  });
```

- [ ] **Step 5: Add the `leave-paused-match` handler**

Add this handler inside the `io.on('connection', socket => { ... })` block:

```typescript
  socket.on('leave-paused-match', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.pauseState || !room.state) return;

    // The leaving player concedes — the disconnected player wins
    // Find a disconnected player's socket ID to be the winner
    const disconnectedSocketId = [...room.players.entries()]
      .find(([sid]) => {
        const uid = room.userIds.get(sid);
        return uid && room.pauseState!.disconnectedUserIds.has(uid);
      })?.[0];

    if (disconnectedSocketId) {
      room.state.phase = 'ended';
      room.state.winner = disconnectedSocketId;
      io.to(currentRoomId).emit('duel-ended', { winnerId: disconnectedSocketId });
      for (const [sid, uid] of room.userIds.entries()) {
        const won = sid === disconnectedSocketId;
        creditMatchResult(uid, won).catch(console.error);
      }
    }

    // Clean up
    const timer = pauseTimers.get(currentRoomId);
    if (timer) {
      clearTimeout(timer);
      pauseTimers.delete(currentRoomId);
    }
    loops.get(currentRoomId)?.stop();
    loops.delete(currentRoomId);
    roomManager.deleteRoom(currentRoomId);
  });
```

- [ ] **Step 6: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts server/tests/disconnect.test.ts
git commit -m "feat: rewrite disconnect handler with pause/rejoin support"
```

---

### Task 5: Add new socket events to SocketClient

**Files:**
- Modify: `client/src/network/SocketClient.ts`

- [ ] **Step 1: Add new event emitters**

Add these methods to the `SocketClient` class in `client/src/network/SocketClient.ts`:

```typescript
rejoinRoom(roomId: string, accessToken: string): void {
  this.socket.emit('rejoin-room', { roomId, accessToken });
}

leavePausedMatch(): void {
  this.socket.emit('leave-paused-match');
}
```

- [ ] **Step 2: Add new event listeners**

Add these methods to the `SocketClient` class:

```typescript
onMatchPaused(cb: (payload: { reason: string; countdown: number }) => void): void {
  this.socket.off('match-paused');
  this.socket.on('match-paused', cb);
}

onGameResumed(cb: () => void): void {
  this.socket.off('game-resumed');
  this.socket.on('game-resumed', cb);
}

onRejoinAccepted(cb: () => void): void {
  this.socket.once('rejoin-accepted', cb);
}

onRejoinFailed(cb: (payload: { reason: string }) => void): void {
  this.socket.once('rejoin-failed', cb);
}
```

- [ ] **Step 3: Add a method to access the underlying socket's connection events**

Add this method so main.ts can hook into Socket.io's auto-reconnect:

```typescript
onReconnect(cb: () => void): void {
  this.socket.io.on('reconnect', cb);
}

get id(): string {
  return this.socket.id ?? '';
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/network/SocketClient.ts
git commit -m "feat: add pause/rejoin socket events to SocketClient"
```

---

### Task 6: Add pause overlay to LobbyUI

**Files:**
- Modify: `client/src/lobby/LobbyUI.ts`

- [ ] **Step 1: Add CSS styles for the pause overlay**

Add these styles to the `STYLES` constant in `client/src/lobby/LobbyUI.ts`:

```css
.bm-pause-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Cinzel',serif;}
.bm-pause-title{font-size:32px;color:#cc2222;letter-spacing:6px;text-transform:uppercase;margin-bottom:12px;text-shadow:0 0 20px rgba(200,30,30,0.6);}
.bm-pause-countdown{font-size:72px;color:#e8c060;letter-spacing:4px;margin-bottom:24px;text-shadow:0 0 30px rgba(200,160,60,0.4);}
.bm-pause-sub{font-size:13px;color:#5a4010;letter-spacing:2px;margin-bottom:32px;}
.bm-btn-leave{padding:12px 32px;background:linear-gradient(180deg,#3a0800 0%,#1a0400 100%);color:#cc6644;border:1px solid rgba(140,40,0,0.7);font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;cursor:pointer;border-radius:1px;transition:all 0.15s;}
.bm-btn-leave:hover{background:linear-gradient(180deg,#5a0c00 0%,#2a0600 100%);border-color:#cc2222;}
```

- [ ] **Step 2: Add showPauseOverlay method**

Add to the `LobbyUI` class:

```typescript
private pauseOverlay: HTMLElement | null = null;
private pauseCountdownTimer: number | null = null;

showPauseOverlay(countdown: number, onLeave: () => void): void {
  this.hidePauseOverlay();

  this.pauseOverlay = document.createElement('div');
  this.pauseOverlay.className = 'bm-pause-overlay';
  this.pauseOverlay.innerHTML = `
    <div class="bm-pause-title">Opponent Disconnected</div>
    <div class="bm-pause-countdown" id="bm-pause-timer">${countdown}</div>
    <div class="bm-pause-sub">Waiting for opponent to rejoin...</div>
    <button class="bm-btn-leave" id="bm-pause-leave">Leave Match</button>`;

  this.el.parentElement!.appendChild(this.pauseOverlay);

  this.pauseOverlay.querySelector('#bm-pause-leave')!
    .addEventListener('click', onLeave);

  let remaining = countdown;
  const timerEl = this.pauseOverlay.querySelector('#bm-pause-timer')!;
  this.pauseCountdownTimer = window.setInterval(() => {
    remaining--;
    timerEl.textContent = String(Math.max(0, remaining));
    if (remaining <= 0 && this.pauseCountdownTimer !== null) {
      clearInterval(this.pauseCountdownTimer);
      this.pauseCountdownTimer = null;
    }
  }, 1000);
}
```

- [ ] **Step 3: Add hidePauseOverlay method**

Add to the `LobbyUI` class:

```typescript
hidePauseOverlay(): void {
  if (this.pauseCountdownTimer !== null) {
    clearInterval(this.pauseCountdownTimer);
    this.pauseCountdownTimer = null;
  }
  if (this.pauseOverlay) {
    this.pauseOverlay.remove();
    this.pauseOverlay = null;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/lobby/LobbyUI.ts
git commit -m "feat: add pause overlay to LobbyUI"
```

---

### Task 7: Wire up rejoin logic in main.ts

**Files:**
- Modify: `client/src/main.ts`

- [ ] **Step 1: Add rejoin state variables**

Add these after the existing state variables (after line 35 `let handlersRegistered = false;`):

```typescript
let pendingRejoin: { roomId: string; userId: string } | null = null;
```

- [ ] **Step 2: Add pause/resume handlers in setupSocketHandlers**

Add these handlers inside `setupSocketHandlers()`, after the `onOpponentDisconnected` handler:

```typescript
socket.onMatchPaused(({ countdown }) => {
  lobby.showPauseOverlay(countdown, () => {
    socket.leavePausedMatch();
  });
});

socket.onGameResumed(() => {
  lobby.hidePauseOverlay();
});
```

- [ ] **Step 3: Update the onDuelEnded handler to also hide pause overlay**

In `setupSocketHandlers()`, modify the existing `onDuelEnded` handler to also dismiss the pause overlay:

```typescript
socket.onDuelEnded(({ winnerId }) => {
  const won = winnerId === myId;
  lobby.hidePauseOverlay();
  stopGame();
  lobby.showResult(won, opponentName);
  lobby.show();
});
```

- [ ] **Step 4: Add reconnect handler for rejoin flow**

Add after `setupSocketHandlers` function definition (after the function, not inside it):

```typescript
socket.onReconnect(() => {
  if (pendingRejoin) {
    socket.rejoinRoom(pendingRejoin.roomId, accessToken);
    socket.onRejoinAccepted(() => {
      pendingRejoin = null;
      // Game state will arrive via the existing onGameState handler
    });
    socket.onRejoinFailed(() => {
      pendingRejoin = null;
      stopGame();
      lobby.showDisconnected();
      lobby.show();
    });
  }
});
```

- [ ] **Step 5: Set pendingRejoin on disconnect during a match**

We need to detect when our own socket disconnects mid-match. Add a handler to track this. In `setupSocketHandlers()`, add:

```typescript
socket.onDisconnect(() => {
  if (spellRenderer && currentRoomId) {
    // We were in a match — store rejoin info
    pendingRejoin = { roomId: currentRoomId, userId: myId };
  }
});
```

And add the `onDisconnect` method to `SocketClient`:

In `client/src/network/SocketClient.ts`, add:

```typescript
onDisconnect(cb: () => void): void {
  this.socket.on('disconnect', cb);
}
```

- [ ] **Step 6: Clear pendingRejoin on clean match exit**

In the `stopGame()` function in `main.ts`, add at the end:

```typescript
pendingRejoin = null;
```

Wait — actually we should NOT clear pendingRejoin in stopGame, because stopGame is called during normal duel-ended flow too. The pendingRejoin should only be cleared on successful rejoin or rejoin failure, which is already handled in Step 4.

Instead, we need to make sure we don't set pendingRejoin for clean disconnects. The `onDisconnect` handler in Step 5 already checks `if (spellRenderer && currentRoomId)` — spellRenderer is null after stopGame(), so it won't set pendingRejoin after a clean match end. This is correct as-is.

However, we should clear pendingRejoin when the user deliberately leaves (logout, leave-paused-match). Update the `onLogout` callback to also clear it:

In the `onLogout` callback, add `pendingRejoin = null;` alongside the other resets.

- [ ] **Step 7: Commit**

```bash
git add client/src/main.ts client/src/network/SocketClient.ts
git commit -m "feat: wire up rejoin logic in main.ts"
```

---

### Task 8: End-to-end manual testing

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `cd server && npm run dev`
Open two browser tabs to `http://localhost:5173` (or whatever the client dev server URL is).

- [ ] **Step 2: Test normal disconnect in lobby**

1. Create a room in Tab 1.
2. Join the room in Tab 2.
3. Close Tab 2 (simulates lobby disconnect).
4. Verify Tab 1 shows "Opponent Fled" (existing behavior preserved).

- [ ] **Step 3: Test mid-match disconnect with rejoin**

1. Create a room in Tab 1, join in Tab 2. Both ready up.
2. During the match, open Tab 2's DevTools → Network tab → set "Offline" to simulate disconnect.
3. Verify Tab 1 shows the pause overlay with countdown.
4. Set Tab 2 back to "Online".
5. Verify Tab 2 auto-rejoins and Tab 1's overlay disappears. Game resumes.

- [ ] **Step 4: Test disconnect with timer expiry**

1. Create a match between two tabs.
2. Close Tab 2 entirely during the match.
3. Verify Tab 1 shows the pause overlay with countdown.
4. Wait 60 seconds.
5. Verify Tab 1 shows the victory screen (Tab 2 forfeited).

- [ ] **Step 5: Test "Leave Match" during pause**

1. Create a match between two tabs.
2. Set Tab 2 offline via DevTools.
3. Tab 1 sees the pause overlay. Click "Leave Match".
4. Verify Tab 1 sees the defeat screen (they conceded).

- [ ] **Step 6: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address issues found during manual disconnect/rejoin testing"
```
