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
  disconnect(): void { this.socket.removeAllListeners(); this.socket.disconnect(); }

  joinRoom(roomId: string, displayName: string, accessToken?: string): void {
    this.socket.emit('join-room', { roomId, displayName, accessToken });
  }

  ready(): void { this.socket.emit('player-ready'); }
  sendInput(input: InputFrame): void { this.socket.emit('input', input); }
  rematch(): void { this.socket.emit('rematch'); }
  sendChatMessage(text: string): void { this.socket.emit('chat-message', { text }); }
  rejoinRoom(roomId: string, accessToken: string): void {
    this.socket.emit('rejoin-room', { roomId, accessToken });
  }
  leavePausedMatch(): void {
    this.socket.emit('leave-paused-match');
  }

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
  onMatchPaused(cb: (payload: { reason: string; countdown: number }) => void): void {
    this.socket.off('match-paused');
    this.socket.on('match-paused', cb);
  }
  onGameResumed(cb: () => void): void {
    this.socket.off('game-resumed');
    this.socket.on('game-resumed', cb);
  }
  onRejoinAccepted(cb: () => void): void {
    this.socket.once('rejoin-accepted', cb);
  }
  onRejoinFailed(cb: (payload: { reason: string }) => void): void {
    this.socket.once('rejoin-failed', cb);
  }
  onReconnect(cb: () => void): void {
    this.socket.io.on('reconnect', cb);
  }
  onDisconnect(cb: () => void): void {
    this.socket.on('disconnect', cb);
  }
  get id(): string {
    return this.socket.id ?? '';
  }
}
