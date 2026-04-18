# BloodMoore

A browser-based real-time PvP dueling game inspired by Diablo 2 Resurrected duels. Two players face off as Fire Sorceresses in an isometric stone arena.

No accounts, no progression — just pick a name, share a link, and duel.

---

## Gameplay

- **Movement:** WASD or arrow keys
- **Spell selection:** `1` / `2` / `3`
- **Cast:** Left-click (aim at cursor)
- **Fire Wall:** Press `2`, then click-and-drag to set wall direction and length

### Spells

| Key | Spell | Damage | Mana | Cooldown |
|-----|-------|--------|------|----------|
| 1 | Fireball | 80–120 | 25 | 0.5s |
| 2 | Fire Wall | 40/sec | 60 | 3s |
| 3 | Meteor | 200–280 AoE | 100 | 5s |

Fireballs and Fire Walls are blocked by pillars. Meteor falls from the sky and bypasses them.

---

## Running Locally

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Terminal 1 — start the game server
cd server && npm run dev

# Terminal 2 — start the client
cd client && npm run dev
```

Open [http://localhost:5173](http://localhost:5173), enter a name, click **Create Room**, and share the URL with your opponent.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Client | Vite + TypeScript + Three.js |
| Rendering | Orthographic isometric camera |
| Server | Node.js + Express + Socket.io |
| Networking | WebSockets, 60-tick authoritative server loop |
| Tests | Vitest (server-side) |

The server is the single source of truth — all physics, collision, and damage run server-side. Clients send raw inputs and render interpolated state snapshots.

---

## Project Structure

```
BloodMoore/
├── shared/src/types.ts        # Shared types and game constants
├── server/src/
│   ├── index.ts               # Express + Socket.io entry point
│   ├── rooms/                 # Room lifecycle (Room, RoomManager)
│   ├── gameloop/              # 60-tick loop, state advancer
│   ├── spells/                # Fireball, Fire Wall, Meteor logic
│   └── physics/               # Movement, collision, line-of-sight
└── client/src/
    ├── main.ts                # Full game wiring
    ├── renderer/              # Three.js scene, arena, character meshes, spell FX
    ├── network/               # Socket client, state interpolation buffer
    ├── input/                 # Keyboard + mouse input handler
    ├── hud/                   # D2-style HP/MP orbs, spell slots
    └── lobby/                 # Create/join/waiting/ready/result screens
```
