# Movement Smoothness: Client-Side Prediction + Time-Based Interpolation

## Problem

Player movement feels subtly jittery for both the local player and remote players. Root causes:

- `StateBuffer` interpolates at a fixed `t=0.5` between snapshots n-2 and n-1, producing static positions between server ticks that jump on each snapshot arrival.
- No client-side prediction — local player movement is delayed by 2-3 ticks (~33-50ms) plus network round-trip.
- No adaptive jitter buffering — variable packet arrival times cause micro-stutters.

## Approach

Industry-standard ARPG netcode (Diablo 2, Path of Exile, League of Legends pattern):

- **Local player:** client-side prediction with server reconciliation
- **Remote players:** time-based interpolation with adaptive jitter buffer
- **Server remains authoritative** for all game state

## Section 1: Time-Based Interpolation (Remote Players)

Replace the fixed `t=0.5` interpolation with proper timestamp-based interpolation.

- Each snapshot gets a **client-received timestamp** (`performance.now()`).
- Compute average interval between snapshots to estimate server tick rate dynamically.
- Set a **render delay** of ~2 tick intervals behind the latest snapshot (time-based, not frame-count-based).
- Each render frame, compute `renderTime = now - renderDelay`, find the two bracketing snapshots, and lerp with `t = (renderTime - older.time) / (newer.time - older.time)`.
- Late packets are naturally absorbed because rendering is in the past.
- Increase buffer size from 10 to 20 snapshots for larger jitter spikes.
- Interpolate **positions and facing angles** (currently only positions are lerped).

**Adaptive jitter buffer:** Track variance of snapshot arrival times. If jitter increases, widen render delay. If jitter is low, tighten it. Keeps delay minimal while preventing stutters.

## Section 2: Client-Side Prediction (Local Player)

**Local movement simulation:**

- On movement input, immediately apply the same movement logic the server uses (speed, delta, pillar collision, arena bounds).
- Render local player at the **predicted position** instead of the interpolated server position.
- Each input frame gets a **sequence number** sent alongside the input.

**Server reconciliation:**

- Server tags each `game-state` broadcast with the **last processed input sequence number** per player.
- Client compares server's authoritative position against what it predicted for that input sequence.
- Match (within 0.5 unit tolerance): no correction.
- Diverge: snap to server position and **re-simulate** all unacknowledged inputs (rewind and replay).

**Smooth correction:**

- Instead of hard-snapping, lerp toward corrected position over ~100ms.
- Should be rare given simple physics, but handles edge cases (players near pillars).

**Tuning values** (starting points, adjust during testing): 0.5 unit reconciliation tolerance, 100ms correction lerp duration, 2-tick render delay, 20-snapshot buffer size.

**Not predicted:** Spell casting, damage, HP/mana, other players' positions.

## Section 3: Input Buffer & Network Changes

**Client-side input buffer:**

- Each `InputFrame` gets a monotonically increasing sequence number.
- Client maintains buffer of unacknowledged inputs (sent but not confirmed).
- On server acknowledgment, discard inputs up to that sequence.
- Buffer is replayed during reconciliation.

**Server-side changes:**

- Track `lastProcessedSeq` per player.
- Each `game-state` includes `ack: Record<string, number>` mapping player ID to last processed input sequence.

**Wire format:**

- `InputFrame`: add `seq: number`
- `GameState`: add `ack: Record<string, number>`
- Minimal bandwidth increase.

## Section 4: Shared Physics Module

Extract movement logic to shared package for identical client/server physics.

**Move to `shared/src/physics.ts`:**

- `movePlayer()` from `server/src/physics/Movement.ts`
- `resolvePlayerPillarCollisions()` from `server/src/physics/Movement.ts`
- `clampToArena()` from `server/src/physics/Movement.ts`
- `circleHitsAABB()` from `server/src/physics/Collision.ts`

These functions are pure — position + input in, new position out.

**Server refactor:**

- `StateAdvancer.ts` imports from shared module.
- `server/src/physics/Movement.ts` removed or becomes thin re-export.
- `server/src/physics/Collision.ts` keeps server-only collision logic, re-exports shared `circleHitsAABB`.

**Already shared:** `PLAYER_SPEED`, `DELTA`, `ARENA_SIZE`, `PLAYER_HALF_SIZE`, `PILLARS` in `shared/src/types.ts`.

## Section 5: Integration & Render Loop

**New module: `client/src/network/Predictor.ts`**

- Owns local player's predicted state (position, facing).
- Holds unacknowledged input buffer.
- `applyInput(input, delta)` — runs shared physics, stores input.
- `reconcile(serverState, ackSeq)` — compares, replays if diverged, smooth correction.
- Tracks correction offset for lerp-to-server over ~100ms.

**Render loop changes (`main.ts`):**

- Build input frame (unchanged).
- Send input to server with sequence number.
- Call `predictor.applyInput(input, delta)` for local movement.
- Call `stateBuffer.getInterpolated(now)` for remote players (time-based).
- Render local player at predictor's position.
- Render remote players at interpolated positions.
- On server state received: call `predictor.reconcile()`.

**Camera:** Follows predicted position, not interpolated. Critical to avoid reintroducing delay.

**Animation:** Local player velocity from predicted movement. Remote players from interpolated deltas (unchanged).

## Section 6: Edge Cases

- **Tab-away / focus loss:** Clear unacked buffer on `visibilitychange`, snap to server position.
- **High latency spike:** If unacked buffer exceeds ~30 inputs (~500ms), hard-snap to server.
- **Disconnect/reconnect:** Clear predictor state, re-initialize from first server snapshot.
- **Missed snapshot:** Clamp `renderTime` to available snapshot range. Hold last position briefly.
- **Player joins mid-game:** Render at first known position until second snapshot arrives.

## Testing

- **Unit tests (shared physics):** Port existing server physics tests to shared module. Verify identical results.
- **Unit tests (StateBuffer):** Time-based interpolation with simulated timings — regular, jittery, missing ticks, single snapshot, out-of-range render time.
- **Unit tests (Predictor):** Reconciliation accuracy, buffer overflow snap, replay correctness.
- **Manual testing:** Local play with simulated latency (0ms, 50ms, 100ms, 200ms RTT) via Chrome DevTools throttling.
