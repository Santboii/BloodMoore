import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.ts';
import { GameLoop } from './gameloop/GameLoop.ts';
import { InputFrame } from '@arena/shared';
import type { GameModeType } from '@arena/shared';
import { DISCONNECT_TIMEOUT_MS, REMATCH_COUNTDOWN_MS } from '@arena/shared';
import { loadSkillsForCharacter, creditMatchResult, loadUserFromToken } from './skills/loadSkills.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const roomManager = new RoomManager();
const loops: Map<string, GameLoop> = new Map();
const pauseTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const rematchVotes: Map<string, Set<string>> = new Map();
const rematchTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

app.use(cors());
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
  const result = await loadUserFromToken(token);
  if (!result.ok) { res.status(401).json({ roomId: null }); return; }
  const room = roomManager.findPausedMatchForUser(result.userId);
  res.json({ roomId: room?.id ?? null });
});

io.on('connection', socket => {
  let currentRoomId: string | null = null;

  socket.on('join-room', async ({ roomId, displayName, accessToken, teamId, characterId }: {
    roomId: string;
    displayName: string;
    accessToken?: string;
    teamId?: string;
    characterId?: string;
  }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('room-not-found'); return; }

    const result = room.addPlayer(socket.id, displayName, teamId);
    if (result === 'full') { socket.emit('room-full'); return; }
    if (result === 'team-full') { socket.emit('team-full'); return; }

    if (accessToken && characterId) {
      const skillResult = await loadSkillsForCharacter(accessToken, characterId);
      if (skillResult.ok) {
        room.skillSets.set(socket.id, skillResult.skills);
        room.userIds.set(socket.id, skillResult.userId);
        room.characterIds.set(socket.id, characterId);
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
      readyPlayerIds: [...room.players.entries()].filter(([, p]) => p.ready).map(([id]) => id),
    });
    socket.to(roomId).emit('player-joined', {
      id: socket.id,
      displayName,
      teamId: room.teamAssignments.get(socket.id),
    });
    if (room.players.size >= room.mode.minPlayers) io.to(roomId).emit('game-ready');
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
    if (room.state?.phase !== 'ended') return;

    const roomId = currentRoomId;
    if (!rematchVotes.has(roomId)) rematchVotes.set(roomId, new Set());
    const votes = rematchVotes.get(roomId)!;
    if (votes.has(socket.id)) return;
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

  socket.on('disconnect', () => {
    if (!currentRoomId) return;

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
              const cid = r.characterIds.get(sid);
              if (!cid) continue;
              const won = sid === connectedSocketId;
              creditMatchResult(uid, cid, won).catch(console.error);
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

        // Keep player in room so tick() still generates idle inputs for them
        socket.to(roomId).emit('player-disconnected', { playerId: socket.id });
      }
    } else {
      // Lobby phase or ended phase
      const leavingId = socket.id;
      room.removePlayer(leavingId);
      loops.get(currentRoomId)?.stop();
      loops.delete(currentRoomId);
      io.to(currentRoomId).emit('player-left', { playerId: leavingId });
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

    const result = await loadUserFromToken(accessToken);
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
        const cid = room.characterIds.get(sid);
        if (!cid) continue;
        const won = sid === disconnectedSocketId;
        creditMatchResult(uid, cid, won).catch(console.error);
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
