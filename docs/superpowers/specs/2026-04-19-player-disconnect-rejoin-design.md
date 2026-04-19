# Player Disconnect & Rejoin Design

## Overview

Gracefully handle a player disconnecting mid-match by pausing the game, giving them 60 seconds to reconnect, and resuming seamlessly if they do. If they don't, the connected player wins by forfeit.

## Scope

Mid-match only. Lobby-phase disconnects retain current behavior (immediate removal, no rejoin window).

## Approach: Pause-in-Place

On disconnect, stop the game loop but keep the Room and GameState alive in server memory. A 60-second server timer governs the rejoin window. The disconnected player is identified on reconnect by their Supabase user ID.

## Section 1: Server-Side Pause & Rejoin State Machine

When a player disconnects mid-match (`room.state !== null` and `state.phase !== 'ended'`), the server transitions the room into a paused state instead of tearing it down:

- **Room gets a new `pauseState` field** — tracks whether the room is paused, who disconnected (by Supabase user ID), and the server-side timer handle.
- **Game loop stops ticking** but is NOT destroyed. The `GameState` stays in memory as-is (projectiles frozen mid-flight, cooldowns frozen, HP/mana unchanged).
- **A 60-second server timer starts.** If it expires:
  - The disconnected player forfeits — `state.phase` set to `'ended'`, winner is the connected player.
  - `duel-ended` emitted with the connected player as winner.
  - Match result credited to Supabase for both players.
  - Room cleaned up normally.
- **Connected player can leave during pause.** If they do:
  - Same forfeit logic, but reversed — the disconnected player wins.
  - Match result credited, room cleaned up.
- **On rejoin**, the returning player is identified by Supabase user ID (looked up from `room.userIds`). Their new socket ID replaces the old one in `room.players`, `room.skillSets`, `room.userIds`, and `room.pendingInputs`. The pause timer is cancelled, and the game loop resumes.

## Section 2: Reconnection Flow

### New Event: `rejoin-room`

The client sends `{ roomId, accessToken }` when attempting to reconnect. The server decodes the access token to get the Supabase user ID and checks if that user ID exists in the room's `userIds` map and the room is currently paused.

### How the Client Knows to Rejoin

When a connected player gets disconnected mid-match, the client stores `{ roomId, userId }` in memory (not localStorage — if they close the tab, they've abandoned the match). On Socket.io reconnect, the client checks if it has a pending rejoin and sends `rejoin-room` instead of going back to the lobby screen.

### Server Rejoin Validation

- Room still exists? (hasn't been cleaned up by timer expiry)
- Room is paused?
- Supabase user ID matches the disconnected player?
- If all pass: remap socket ID, cancel timer, emit `game-resumed` to both clients, restart game loop.
- If any fail: reject with `rejoin-failed`, client falls back to lobby.

### State Sync on Rejoin

The server sends the full `GameState` snapshot to the reconnecting client via a `game-state` event before resuming the loop. This lets the client's `StateBuffer` reinitialize from a known state rather than starting empty.

### Socket.io Room Membership

The new socket must `socket.join(roomId)` so it receives subsequent broadcasts. The old socket ID is no longer in the Socket.io room (it was cleaned up on disconnect).

## Section 3: Client-Side Pause UI & Reconnect Logic

### Connected Player's Experience (Opponent Disconnected)

1. Server emits `match-paused` with `{ reason: 'opponent-disconnected', countdown: 60 }`.
2. Client shows a fullscreen overlay on top of the frozen game — "Opponent disconnected" with a live countdown timer (client-side, ticking down from 60).
3. A "Leave Match" button is visible. Clicking it emits `leave-paused-match` to the server, which triggers the forfeit flow (connected player concedes, disconnected player wins).
4. When the server emits `game-resumed`, the overlay is removed and gameplay continues seamlessly.
5. If the server emits `duel-ended` while paused (timer expired), the normal win screen is shown.

### Disconnected Player's Experience (They Lost Connection)

1. Socket.io fires its `disconnect` event on the client. The client stores `{ roomId, userId }` in a module-level variable.
2. Socket.io will auto-reconnect (this is default behavior). On the `connect` event, the client checks for the stored rejoin info.
3. If rejoin info exists, client emits `rejoin-room` with the room ID and access token.
4. On success (`rejoin-accepted`), the client receives a full `GameState` snapshot, reinitializes the `StateBuffer`, and resumes rendering. The game picks up exactly where it left off.
5. On failure (`rejoin-failed`), the client clears the rejoin info and returns to the lobby with a message like "Could not rejoin — match ended."
6. If the player manually navigates away or closes the tab (no Socket.io reconnect), the server timer handles it — they forfeit after 60 seconds.

## Section 4: Edge Cases & Invariants

### Both Players Disconnect Simultaneously

Each disconnect triggers a pause. The room stores both user IDs as disconnected. The 60-second timer still runs. First player to reconnect unpauses for their side; if the second reconnects too, the match resumes. If neither reconnects, the timer expires and the match is voided (no result credited to either player — since there's no connected player to award the win to).

### Disconnect During End Phase

If `state.phase === 'ended'`, the existing behavior applies — no pause, just clean up. The match result has already been determined.

### Rapid Disconnect/Reconnect (Flicker)

If a player disconnects and reconnects within the same tick or before the pause event is processed, the server still goes through the full pause → rejoin flow. No special fast path — keeping one code path avoids subtle bugs.

### Connected Player Disconnects While Paused

Now both are disconnected. Same as the "both disconnect" case above. Timer keeps running from the original pause start (not reset).

### Disconnected Player Tries to Join a Different Room

The `join-room` handler works as normal. The paused room's timer will expire and forfeit them. No special blocking needed — the player chose to abandon.

### Multiple Disconnects in One Match

Each reconnect resets the pause. A player could disconnect and rejoin multiple times, each time getting a fresh 60-second window. The connected player can always leave if they're frustrated.

## New Socket Events Summary

| Event | Direction | Payload | When |
|---|---|---|---|
| `match-paused` | Server → Client | `{ reason, countdown }` | Opponent disconnected mid-match |
| `game-resumed` | Server → Client | (none) | Disconnected player rejoined |
| `rejoin-room` | Client → Server | `{ roomId, accessToken }` | Client reconnects with pending rejoin |
| `rejoin-accepted` | Server → Client | (none, followed by `game-state`) | Rejoin validation passed |
| `rejoin-failed` | Server → Client | `{ reason }` | Rejoin validation failed |
| `leave-paused-match` | Client → Server | (none) | Connected player leaves during pause |

## Files to Modify

- `server/src/rooms/Room.ts` — add `pauseState` field, pause/resume methods
- `server/src/index.ts` — new disconnect logic (pause vs teardown), `rejoin-room` handler, `leave-paused-match` handler
- `server/src/gameloop/GameLoop.ts` — add pause/resume capability (stop ticking without destroying)
- `client/src/network/SocketClient.ts` — new event listeners/emitters for pause/rejoin events
- `client/src/main.ts` — rejoin logic on reconnect, store pending rejoin info
- `client/src/lobby/LobbyUI.ts` — pause overlay with countdown and leave button
- `shared/src/types.ts` — shared type for `match-paused` payload if needed
