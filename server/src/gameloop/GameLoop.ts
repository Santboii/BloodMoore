import { Room } from '../rooms/Room.ts';

type BroadcastFn = (state: object) => void;

export class GameLoop {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  start(room: Room, broadcast: BroadcastFn): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      const state = room.tick();
      if (state.phase === 'ended') this.stop();
      broadcast(state);
    }, 1000 / 60);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
