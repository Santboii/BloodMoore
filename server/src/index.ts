import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.ts';
import { GameLoop } from './gameloop/GameLoop.ts';
import { InputFrame } from '@arena/shared';
import type { GameModeType } from '@arena/shared';
import { DISCONNECT_TIMEOUT_MS } from '@arena/shared';
import { loadSkillsForToken, creditMatchResult } from './skills/loadSkills.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const roomManager = new RoomManager();
const loops: Map<string, GameLoop> = new Map();
const pauseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

app.use(express.json());

app.post('/rooms', (req, res) => {
  const mode = (req.body?.mode as GameModeType) ?? '1v1';
  const room = roomManager.createRoom(mode);
  res.json({ roomId: room.id, mode });
});

app.get('/rooms', (_req, res) => {
  res.json({ rooms: roomManager.listOpenRooms() });
});

app.get('/rooms/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  res.json({ exists: !!room, full: room?.isFull ?? false });
});

app.post('/paused-match', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) { res.status(401).json({ roomId: null }); return; }
  const result = await loadSkillsForToken(token);
  if (!result.ok) { res.status(401).json({ roomId: null }); return; }
  const room = roomManager.findPausedMatchForUser(result.userId);
  res.json({ roomId: room?.id ?? null });
});

io.on('connection', socket => {
  let currentRoomId: string | null = null;

  socket.on('join-room', async ({ roomId, displayName, accessToken, teamId }: {
    roomId: string;
    displayName: string;
    accessToken?: string;
    teamId?: string;
  }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('room-not-found'); return; }

    const result = room.addPlayer(socket.id, displayName, teamId);
    if (result === 'full') { socket.emit('room-full'); return; }
    if (result === 'team-full') { socket.emit('team-full'); return; }

    if (accessToken) {
      const skillResult = await loadSkillsForToken(accessToken);
      if (skillResult.ok) {
        room.skillSets.set(socket.id, skillResult.skills);
        room.userIds.set(socket.id, skillResult.userId);
      }
    }

    socket.join(roomId);
    currentRoomId = roomId;

    socket.emit('room-joined', {
      roomId,
      yourId: socket.id,
      players: Object.fromEntries([...room.players.entries()].map(([id, p]) => [id, p.displayName])),
      mode: room.mode.type,
      teams: Object.fromEntries(room.teamAssignments),
    });
    socket.to(roomId).emit('player-joined', {
      id: socket.id,
      displayName,
      teamId: room.teamAssignments.get(socket.id),
    });
    if (room.isFull) io.to(roomId).emit('game-ready');
  });

  socket.on('chat-message', ({ text }: { text: string }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    if (room.state !== null) return;
    const sanitized = String(text).trim().slice(0, 80);
    if (!sanitized) return;
    io.to(currentRoomId).emit('chat-message', {
      senderId: socket.id,
      displayName: player.displayName,
      text: sanitized,
    });
  });

  socket.on('player-ready', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    const readyPlayer = room.players.get(socket.id);
    if (!readyPlayer || readyPlayer.ready) return;
    room.setReady(socket.id);

    io.to(currentRoomId).emit('player-ready-ack', { playerId: socket.id });

    if (room.allReady) {
      room.startMatch();
      const loop = new GameLoop();
      const roomId = currentRoomId;
      loops.set(roomId, loop);
      loop.start(room, async state => {
        io.to(roomId).emit('game-state', state);
        if (state.phase === 'ended') {
          io.to(roomId).emit('duel-ended', { winnerId: state.winner, gameMode: state.gameMode });
          for (const [socketId, userId] of room.userIds.entries()) {
            let won: boolean;
            if (state.gameMode === '2v2') {
              const playerTeam = room.teamAssignments.get(socketId);
              won = state.winner === playerTeam;
            } else {
              won = state.winner === socketId;
            }
            creditMatchResult(userId, won).catch(console.error);
          }
        }
      });
    }
  });

  socket.on('input', (input: InputFrame) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    room?.queueInput(socket.id, input);
  });

  socket.on('rematch', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    loops.get(currentRoomId)?.stop();
    loops.delete(currentRoomId);
    room.reset();
    io.to(currentRoomId).emit('rematch-ready');
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    const isMidMatch = room.state !== null && room.state.phase !== 'ended';

    if (isMidMatch) {
      const userId = room.userIds.get(socket.id);
      if (!userId) return;

      if (room.mode.type === '1v1') {
        // 1v1 pause logic
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
          pauseTimers.delete(roomId);
          roomManager.deleteRoom(roomId);
        }, 60_000);

        pauseTimers.set(roomId, pauseTimer);
      } else {
        // FFA / 2v2: don't pause, start elimination timer
        const roomId = currentRoomId;
        const disconnectedSocketId = socket.id;
        const timer = setTimeout(() => {
          const r = roomManager.getRoom(roomId);
          if (r?.state && r.state.players[disconnectedSocketId]) {
            r.state.players[disconnectedSocketId].hp = 0;
          }
          pauseTimers.delete(`${roomId}:${disconnectedSocketId}`);
        }, DISCONNECT_TIMEOUT_MS);
        pauseTimers.set(`${roomId}:${disconnectedSocketId}`, timer);

        // Remove from active players but don't delete room
        room.removePlayer(socket.id);
        socket.to(roomId).emit('player-disconnected', { playerId: socket.id });
      }
    } else {
      // Lobby phase or ended phase — original behavior
      room.removePlayer(socket.id);
      loops.get(currentRoomId)?.stop();
      loops.delete(currentRoomId);
      io.to(currentRoomId).emit('opponent-disconnected');
      if (room.players.size === 0) roomManager.deleteRoom(currentRoomId);
    }
  });

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

    // Re-check after await — timer may have fired during the Supabase call
    if (!roomManager.getRoom(roomId) || !room.pauseState) {
      socket.emit('rejoin-failed', { reason: 'Match already ended' });
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
    const remappedPlayer = room.players.get(socket.id);
    const playersMap = Object.fromEntries(
      [...room.players.entries()].map(([id, p]) => [id, p.displayName])
    );
    socket.emit('rejoin-accepted', {
      yourId: socket.id,
      colorIndex: remappedPlayer?.colorIndex ?? 0,
      players: playersMap,
    });
    if (room.state) {
      socket.emit('game-state', room.state);
    }

    // Notify the other player
    if (!room.pauseState) {
      socket.to(roomId).emit('game-resumed');
    }
  });

  socket.on('leave-paused-match', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room || !room.pauseState || !room.state) return;

    // The leaving player concedes — the disconnected player wins
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
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => console.log(`Arena server running on :${PORT}`));
