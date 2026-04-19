// client/src/network/SocketClient.ts  — full file
import { io, Socket } from 'socket.io-client';
import { GameState, InputFrame } from '@arena/shared';

export type RoomJoinedPayload = { roomId: string; yourId: string; players: Record<string, string> };
export type ChatMessagePayload = { senderId: string; displayName: string; text: string };

export class SocketClient {
  private socket: Socket;

  constructor() {
    this.socket = io({ autoConnect: false });
  }

  connect(): void { this.socket.connect(); }
  disconnect(): void { this.socket.disconnect(); }

  joinRoom(roomId: string, displayName: string, accessToken?: string): void {
    this.socket.emit('join-room', { roomId, displayName, accessToken });
  }

  ready(): void { this.socket.emit('player-ready'); }
  sendInput(input: InputFrame): void { this.socket.emit('input', input); }
  rematch(): void { this.socket.emit('rematch'); }
  sendChatMessage(text: string): void { this.socket.emit('chat-message', { text }); }

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
  onDuelEnded(cb: (payload: { winnerId: string }) => void): void {
    this.socket.off('duel-ended');
    this.socket.on('duel-ended', cb);
  }
  onRematchReady(cb: () => void): void {
    this.socket.off('rematch-ready');
    this.socket.on('rematch-ready', cb);
  }
  onOpponentDisconnected(cb: () => void): void {
    this.socket.off('opponent-disconnected');
    this.socket.on('opponent-disconnected', cb);
  }
  onRoomNotFound(cb: () => void): void { this.socket.once('room-not-found', cb); }
  onChatMessage(cb: (payload: ChatMessagePayload) => void): void {
    this.socket.off('chat-message');
    this.socket.on('chat-message', cb);
  }
  onPlayerReadyAck(cb: (payload: { playerId: string }) => void): void {
    this.socket.off('player-ready-ack');
    this.socket.on('player-ready-ack', cb);
  }
}
