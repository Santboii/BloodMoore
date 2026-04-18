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
    this.socket.on('room-joined', cb);
  }
  onPlayerJoined(cb: (p: { id: string; displayName: string }) => void): void {
    this.socket.on('player-joined', cb);
  }
  onGameReady(cb: () => void): void { this.socket.on('game-ready', cb); }
  onGameState(cb: (state: GameState) => void): void { this.socket.on('game-state', cb); }
  onDuelEnded(cb: (payload: { winnerId: string }) => void): void { this.socket.on('duel-ended', cb); }
  onRematchReady(cb: () => void): void { this.socket.on('rematch-ready', cb); }
  onOpponentDisconnected(cb: () => void): void { this.socket.on('opponent-disconnected', cb); }
  onRoomNotFound(cb: () => void): void { this.socket.on('room-not-found', cb); }
}
