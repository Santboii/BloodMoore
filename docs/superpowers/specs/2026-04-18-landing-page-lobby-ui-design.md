# Landing Page & Lobby UI Design

**Date:** 2026-04-18  
**Scope:** Landing page + lobby UI redesign. Multi-player game modes (2v2, 3v3, FFA) are out of scope — covered in a separate backend rehaul spec.

---

## Overview

Replace the existing `LobbyUI.ts` with a redesigned, Diablo-esque landing and lobby experience for **Blood Moor**. Players choose a session display name, browse or create lobbies, wait in a lobby room with chat, ready up, and enter the game.

Authentication (persistent usernames) is handled in a separate session — this spec treats the display name as session-only.

---

## Screen Flow

```
Landing → Lobby (waiting room) → Game → Result
                                       ↘ Disconnected
```

Five screens total, all rendered inside `#ui-overlay` via the rewritten `LobbyUI.ts`:

1. **Landing** — name entry, game mode selector, lobby browser, join-by-code
2. **Lobby** — player slots with ready status, invite code, pre-game chat, ready button
3. **Game** — existing arena (no changes to game rendering)
4. **Result** — victory/defeat, rematch button (existing, restyled)
5. **Disconnected** — opponent left (existing, restyled)

---

## Visual Design

### Background (Blood Moor atmosphere)

Procedural CSS/SVG — no external image assets required:

- **Sky:** multi-stop dark gradient (`#060208` → `#1a0a0e` → `#2a100a`)
- **Moon:** radial gradient glow, top-center, 60% opacity
- **Trees:** SVG silhouettes, dead/bare, flanking left and right edges
- **Ground:** layered dark gradients with SVG mud ridges and blood pool ellipses
- **Fog:** three animated `div` layers with `blur(40px)`, slow horizontal drift
- **Grain:** CSS `feTurbulence` SVG texture tile at 6% opacity over the whole scene
- **Vignette:** radial gradient overlay darkening corners

### Panels

Semi-transparent dark glass over the background:
- Background: `rgba(10,8,4,0.92)` with `backdrop-filter: blur(6px)`
- Border: `1px solid rgba(90,60,16,0.6)`, top `2px solid rgba(120,80,20,0.8)`
- Top highlight: linear gradient pseudo-element `rgba(200,134,10,0.5)`
- Shadow: `0 4px 32px rgba(0,0,0,0.6)`

### Typography & Colour

| Element | Font | Colour |
|---|---|---|
| Game title | Cinzel 900 72px | `#c8860a` with orange text-shadow glow |
| Panel titles | Cinzel 10px, 3px letter-spacing | `#7a5a20` |
| Field labels | Cinzel 10px, 2px letter-spacing | `#7a5a20` |
| Input values | Cinzel 15px | `#e8c060` |
| Body text / chat | Crimson Text 14px | `#9a8a60` |
| Player names | Cinzel 13px | `#d4a840` |

Buttons follow Diablo-style bevel gradients — red for primary CTA, blue for secondary, green for ready.

---

## Screen 1 — Landing

**Layout:** Two-column. Left panel (280px fixed) + right panel (flex).

### Left Panel — Challenger

- **Display name input** — Cinzel font, gold text, dark background. Session-only; no persistence.
- **Game mode selector** — 2×2 grid of toggle buttons:
  - `1v1` — active, selectable
  - `2v2`, `3v3`, `FFA` — locked, "Soon" badge, `opacity: 0.4`, `cursor: not-allowed`
- **Create Lobby button** — full-width, dark red bevel gradient (`#7a1500` → `#3a0800`)
- **Separator** — "or"
- **Join by Code** — short text input (room code) + blue "Join" button side by side

### Right Panel — Open Lobbies

- **Header:** "Open Lobbies" label + pulsing green dot (live indicator)
- **Lobby rows** — one row per open room:
  - Creator display name
  - "Waiting for players" status line
  - Colour-coded mode tag (`1v1` gold, `2v2` green, `FFA` red, `3v3` blue)
  - Player count (`1 / 2`)
  - Green "Join" button
- **Empty state:** "No open lobbies — Be the first to enter the arena" with dashed border
- **Polling:** client calls `GET /rooms` every 3 seconds, re-renders rows

### Validation

- Name must be non-empty and ≤ 20 characters before Create/Join is allowed
- Join by code shows inline error if room not found or full

---

## Screen 2 — Lobby (Waiting Room)

**Layout:** Two-column. Left panel (280px) for players + right panel for chat.

### Left Panel — Combatants

- **Invite code block** — room code displayed in large Cinzel, "⎘ Copy Link" button copies full URL with `?room=<id>` to clipboard
- **Player slots** (one per expected player):
  - Avatar circle with first letter of name, coloured per player index
  - Display name
  - Status: `✓ Ready` (green) or `Waiting...` (muted gold)
  - Empty slot shown with dashed border and grey avatar
- **Ready button** — full-width green bevel. Once clicked:
  - Button becomes inactive (greyed, "✓ Ready" label, `cursor: default`)
  - Emits `player-ready` socket event
  - System message appears in chat: "[Name] is ready"
- **"Waiting for opponent..." subtext** — shown when local player is ready but opponent is not

### Right Panel — War Council (Chat)

- **Message list** — scrollable, `height: 300px`, dark inset background
  - System messages: italic, muted gold (`#5a4010`), e.g. "Grimshaw has entered the lobby"
  - Player messages: sender name in player colour, message text in `#9a8a60`
  - A `<hr>` separator divides system join messages from player chat
- **Input row** — text input + "Send" button; send on Enter or click
- **Message constraints:** max 80 characters per message; empty messages not sent

---

## Server Changes

### New HTTP endpoint

```
GET /rooms
→ 200 { rooms: Array<{ roomId: string, creatorName: string, playerCount: number, maxPlayers: number, mode: string }> }
```

Returns only rooms that are not full and have not started. `mode` is always `"1v1"` in this spec.

`RoomManager` stores `creatorName` (the first player's display name) at room creation time.

### New socket event

```
// Client → Server
socket.emit('chat-message', { text: string })   // text trimmed, max 80 chars enforced server-side

// Server → Room (broadcast)
socket.to(roomId).emit('chat-message', { senderId: string, displayName: string, text: string })
```

The server broadcasts back to all players in the room including the sender.

### Unchanged

All existing socket events (`join-room`, `player-joined`, `game-ready`, `player-ready`, `input`, `game-state`, `duel-ended`, `rematch`, `rematch-ready`, `opponent-disconnected`) are unchanged.

---

## Client Changes

### `LobbyUI.ts` — full rewrite

Replaces all existing screen methods with the new design. Public interface stays the same:

```typescript
class LobbyUI {
  constructor(container: HTMLElement, callbacks: LobbyCallbacks)
  showHome(): void           // → Landing screen
  showWaiting(roomId: string): void  // → Lobby screen, 1 player present, waiting for opponent
  showReady(players: Record<string, string>): void  // → Lobby screen, 2 players present, ready button active
  showResult(winner: string, myId: string): void
  showDisconnected(): void
  hide(): void
}
```

New internal methods:
- `startLobbyPolling(roomId)` — sets 3s interval on `GET /rooms` while on landing screen; clears on navigate away
- `renderLobbyRows(rooms)` — re-renders open rooms list
- `appendChatMessage(msg)` — adds a chat bubble to the War Council panel
- `appendSystemMessage(text)` — adds a system line to chat

### `SocketClient.ts` — additions

```typescript
sendChatMessage(text: string): void
onChatMessage(cb: (msg: { senderId, displayName, text }) => void): void
```

### `main.ts` — additions

Wire up `onChatMessage` → `lobbyUI.appendChatMessage(msg)` after joining a room.

---

## Assets

No external images or fonts downloaded at runtime beyond the existing Google Fonts import (`Cinzel`, `Crimson Text`). The background is fully procedural CSS/SVG. Add `.superpowers/` to `.gitignore` if not already present.

---

## Out of Scope

- Persistent usernames / authentication (separate session)
- 2v2, 3v3, FFA game modes (separate backend rehaul spec)
- Spectator mode
- Lobby password / private rooms
- Player statistics or profiles
