import { io, Socket } from 'socket.io-client';
import { GameState, InputFrame } from '@arena/shared';

export type RoomJoinedPayload = { roomId: string; yourId: string; players: Record<string, string> };

export class SocketClient {
  private socket: Socket;

  constructor() {
    this.socket = io({ autoConnect: false });
  }

  connect(): void { this.socket.connect(); }
  disconnect(): void { this.socket.disconnect(); }

  joinRoom(roomId: string, displayName: string): void {
    this.socket.emit('join-room', { roomId, displayName });
  }

  ready(): void { this.socket.emit('player-ready'); }
  sendInput(input: InputFrame): void { this.socket.emit('input', input); }
  rematch(): void { this.socket.emit('rematch'); }

  onRoomJoined(cb: (payload: RoomJoinedPayload) => void): void {
    this.socket.once('room-joined', cb);
  }
  onPlayerJoined(cb: (p: { id: string; displayName: string }) => void): void {
    this.socket.once('player-joined', cb);
  }
  onGameReady(cb: () => void): void { this.socket.once('game-ready', cb); }
  onGameState(cb: (state: GameState) => void): void {
    this.socket.off('game-state');
    this.socket.on('game-state', cb);
  }
  onDuelEnded(cb: (payload: { winnerId: string }) => void): void { this.socket.once('duel-ended', cb); }
  onRematchReady(cb: () => void): void { this.socket.once('rematch-ready', cb); }
  onOpponentDisconnected(cb: () => void): void { this.socket.once('opponent-disconnected', cb); }
  onRoomNotFound(cb: () => void): void { this.socket.once('room-not-found', cb); }
}
