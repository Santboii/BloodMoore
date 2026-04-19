import { GameState } from '@arena/shared';
import { Room } from '../rooms/Room.ts';

type BroadcastFn = (state: GameState) => void;

export class GameLoop {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private room: Room | null = null;
  private broadcast: BroadcastFn | null = null;

  start(room: Room, broadcast: BroadcastFn): void {
    if (this.intervalId) return;
    this.room = room;
    this.broadcast = broadcast;
    this.startInterval();
  }

  pause(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  resume(): void {
    if (!this.room || !this.broadcast) return;
    if (this.intervalId) return;
    this.startInterval();
  }

  stop(): void {
    this.pause();
    this.room = null;
    this.broadcast = null;
  }

  private startInterval(): void {
    this.intervalId = setInterval(() => {
      const state = this.room!.tick();
      if (state.phase === 'ended') this.stop();
      this.broadcast!(state);
    }, 1000 / 60);
  }
}
