# Arena Dueling Game — Design Spec
_Date: 2026-04-18_

## Overview

A browser-based real-time PvP arena dueling game inspired by Diablo 2 Resurrected duels. Two players face off in an isometric arena as Fire Sorceresses. No accounts, no progression — just pick a name, share a link, and duel.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Client | Vite + TypeScript + Three.js |
| Rendering | Three.js orthographic camera (isometric projection) |
| Server | Node.js + Express + Socket.io |
| Networking | WebSockets (Socket.io), 60-tick authoritative server loop |
| Deployment | Single Node.js process serving both the static client and WebSocket server |

---

## Lobby & Matchmaking

- Player A visits the app, enters a display name, clicks **Create Room** → receives a shareable URL with a room ID (e.g. `/duel/abc123`)
- Player B opens the URL, enters a display name, clicks **Join**
- Once both players are in the room and both click **Ready**, the server starts the duel
- No authentication — display names are ephemeral and scoped to the session
- Rooms are destroyed when the duel ends or either player disconnects

---

## Arena

- Single fixed-size map (~800×800 world units)
- Isometric stone floor rendered with Three.js
- **5 pillars** in a symmetric cross layout: one at each corner quadrant + one at the center
- Pillars are solid 3D objects with collision boxes
- Pillars block line-of-sight for projectiles (Fireball, Fire Wall) — calculated server-side
- Meteor bypasses pillars (falls from above)
- Arena boundary walls prevent players from leaving the map

---

## Character — Fire Sorceress

Both players play the same class with identical stats.

### Stats
| Stat | Value |
|---|---|
| Max HP | 500 |
| Max Mana | 300 |
| Mana regen | 10 / second |
| Movement speed | 200 units / second |

### Spells

#### 1 — Fireball
- **Input:** Press `1` to select, left-click to fire toward cursor
- **Mechanic:** Straight-line projectile traveling at 400 units/sec
- **Damage:** 80–120 fire damage on hit
- **Mana cost:** 25
- **Cooldown:** 0.5s
- **Pillar interaction:** Collides and destroys on contact

#### 2 — Fire Wall
- **Input:** Press `2` to select, click+drag to set wall direction and length (max 200 units)
- **Mechanic:** Persistent wall of flame on the ground lasting 4 seconds; deals damage per second to any player standing in it
- **Damage:** 40 fire damage / second while inside
- **Mana cost:** 60
- **Cooldown:** 3s
- **Pillar interaction:** A pillar in the drag path splits the wall into two separate segments; the pillar cell itself is never filled

#### 3 — Meteor
- **Input:** Press `3` to select, left-click to target a ground location
- **Mechanic:** After a 1.5s delay a meteor strikes the targeted location; a visible warning indicator shows the impact zone during the delay
- **Damage:** 200–280 fire damage in a small AoE radius (60 units)
- **Mana cost:** 100
- **Cooldown:** 5s
- **Pillar interaction:** Bypasses pillars entirely (falls from sky)

---

## Networking Architecture

### Authoritative Server Model
- All game logic (movement, collision, spell physics, damage) runs on the server
- Clients send **input frames** each tick: `{ move: {x, y}, castSpell: 1|2|3|null, aimTarget: {x, y} }`
- Server processes inputs, advances game state, broadcasts the full state snapshot to both clients at 60Hz
- Clients never self-calculate damage or collision — server is the source of truth

### Client-Side
- Client sends input on every frame (not throttled)
- Received state snapshots are buffered; positions are interpolated between the two most recent snapshots for smooth rendering
- Visual-only effects (particle trails, impact flashes) are spawned client-side on spell events from the server

### State Snapshot Shape (per tick)
```ts
type GameState = {
  tick: number;
  players: {
    [id: string]: {
      position: { x: number; y: number };
      hp: number;
      mana: number;
      facing: number; // radians
      castingSpell: number | null;
    };
  };
  projectiles: {
    id: string;
    type: 'fireball';
    position: { x: number; y: number };
    velocity: { x: number; y: number };
  }[];
  fireWalls: {
    id: string;
    segments: { x1: number; y1: number; x2: number; y2: number }[];
    expiresAt: number;
  }[];
  meteors: {
    id: string;
    target: { x: number; y: number };
    strikeAt: number; // server tick
  }[];
  phase: 'waiting' | 'countdown' | 'dueling' | 'ended';
  winner: string | null;
};
```

---

## HUD

D2-style bottom panel:

- **Left:** Large circular HP orb (red), filled proportionally to current HP
- **Right:** Large circular MP orb (blue), filled proportionally to current mana
- **Center:** Three spell slots labeled `1`, `2`, `3` (Fireball, Fire Wall, Meteor); active spell highlighted; cooldown overlay shown as a draining fill
- **Top-center (floating):** Opponent's display name + HP bar

---

## Win Condition

- First player to reduce the opponent's HP to 0 wins
- Server emits a `duel-ended` event with the winner's ID
- Both clients show a victory/defeat screen with a **Rematch** button (resets the room to waiting state)

---

## Project Structure

```
arena-game/
├── client/               # Vite + TypeScript + Three.js
│   ├── src/
│   │   ├── main.ts       # Entry point, Three.js scene setup
│   │   ├── renderer/     # Isometric camera, arena, character sprites
│   │   ├── input/        # Keyboard + mouse input handler
│   │   ├── network/      # Socket.io client, state interpolation
│   │   ├── hud/          # DOM-based HUD overlay
│   │   └── spells/       # Client-side visual effects per spell
│   └── index.html
├── server/               # Node.js + Express + Socket.io
│   ├── src/
│   │   ├── index.ts      # Server entry, Express + Socket.io setup
│   │   ├── rooms/        # Room lifecycle management
│   │   ├── gameloop/     # 60-tick loop, state advancement
│   │   ├── spells/       # Server-side spell logic and collision
│   │   └── physics/      # Movement, collision, line-of-sight
│   └── tsconfig.json
├── shared/               # Types shared between client and server
│   └── types.ts          # GameState, InputFrame, SpellType, etc.
└── package.json          # Monorepo root (npm workspaces)
```

---

## Out of Scope (v1)

- Multiple character classes
- Item system or progression
- Matchmaking queue (random opponents)
- Spectator mode
- Sound effects and music
- Mobile / touch support
