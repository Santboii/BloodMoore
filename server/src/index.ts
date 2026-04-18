import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.ts';
import { GameLoop } from './gameloop/GameLoop.ts';
import { InputFrame } from '@arena/shared';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const roomManager = new RoomManager();
const loops: Map<string, GameLoop> = new Map();

app.use(express.json());

// Create room endpoint
app.post('/rooms', (_req, res) => {
  const room = roomManager.createRoom();
  res.json({ roomId: room.id });
});

// Room exists check
app.get('/rooms/:id', (req, res) => {
  const room = roomManager.getRoom(req.params.id);
  res.json({ exists: !!room, full: room?.isFull ?? false });
});

io.on('connection', socket => {
  let currentRoomId: string | null = null;

  socket.on('join-room', ({ roomId, displayName }: { roomId: string; displayName: string }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) { socket.emit('room-not-found'); return; }
    if (room.isFull) { socket.emit('room-full'); return; }

    room.addPlayer(socket.id, displayName);
    socket.join(roomId);
    currentRoomId = roomId;

    socket.emit('room-joined', {
      roomId,
      yourId: socket.id,
      players: Object.fromEntries([...room.players.entries()].map(([id, p]) => [id, p.displayName])),
    });
    socket.to(roomId).emit('player-joined', { id: socket.id, displayName });

    if (room.isFull) {
      io.to(roomId).emit('game-ready');
    }
  });

  socket.on('player-ready', () => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;
    room.setReady(socket.id);

    if (room.allReady) {
      room.startDuel();
      const loop = new GameLoop();
      const roomId = currentRoomId;
      loops.set(roomId, loop);
      loop.start(room, state => {
        io.to(roomId).emit('game-state', state);
        if (state.phase === 'ended') {
          io.to(roomId).emit('duel-ended', { winnerId: state.winner });
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
    room.removePlayer(socket.id);
    loops.get(currentRoomId)?.stop();
    loops.delete(currentRoomId);
    io.to(currentRoomId).emit('opponent-disconnected');
    if (room.players.size === 0) roomManager.deleteRoom(currentRoomId);
  });
});

const PORT = process.env.PORT ?? 3000;
httpServer.listen(PORT, () => console.log(`Arena server running on :${PORT}`));
