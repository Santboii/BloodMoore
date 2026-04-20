import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameLoop } from '../src/gameloop/GameLoop.ts';
import { Room } from '../src/rooms/Room.ts';

describe('GameLoop pause/resume', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pause() stops ticking without destroying the loop', () => {
    vi.useFakeTimers();
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startMatch();

    const broadcast = vi.fn();
    const loop = new GameLoop();
    loop.start(room, broadcast);

    vi.advanceTimersByTime(100); // ~6 ticks
    const callsBeforePause = broadcast.mock.calls.length;
    expect(callsBeforePause).toBeGreaterThan(0);

    loop.pause();
    broadcast.mockClear();
    vi.advanceTimersByTime(100);
    expect(broadcast).not.toHaveBeenCalled();

    loop.stop();
  });

  it('resume() restarts ticking after pause', () => {
    vi.useFakeTimers();
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startMatch();

    const broadcast = vi.fn();
    const loop = new GameLoop();
    loop.start(room, broadcast);

    loop.pause();
    broadcast.mockClear();

    loop.resume();
    vi.advanceTimersByTime(100);
    expect(broadcast.mock.calls.length).toBeGreaterThan(0);

    loop.stop();
  });

  it('pause() is a no-op if not started', () => {
    const loop = new GameLoop();
    expect(() => loop.pause()).not.toThrow();
  });

  it('resume() is a no-op if not paused', () => {
    const loop = new GameLoop();
    expect(() => loop.resume()).not.toThrow();
  });
});
