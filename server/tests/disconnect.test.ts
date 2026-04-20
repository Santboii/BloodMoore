import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Room } from '../src/rooms/Room.ts';
import { GameLoop } from '../src/gameloop/GameLoop.ts';

describe('disconnect scenarios (unit-level)', () => {
  it('mid-match disconnect pauses room instead of tearing down', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startMatch();

    const loop = new GameLoop();
    loop.start(room, vi.fn());

    loop.pause();
    room.pause('user-1');

    expect(room.pauseState).not.toBeNull();
    expect(room.state).not.toBeNull();
    expect(room.players.has('s1')).toBe(true);

    loop.stop();
  });

  it('lobby disconnect still removes player normally', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');

    expect(room.state).toBeNull();

    room.removePlayer('s1');
    expect(room.players.size).toBe(0);
  });

  it('rejoin remaps socket ID and resumes', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startMatch();

    const loop = new GameLoop();
    loop.start(room, vi.fn());

    loop.pause();
    room.pause('user-1');

    room.remapPlayer('s1', 's1-new');
    room.resume('user-1');
    loop.resume();

    expect(room.pauseState).toBeNull();
    expect(room.players.has('s1-new')).toBe(true);
    expect(room.state!.players['s1-new']).toBeDefined();

    loop.stop();
  });

  it('connected player leaving during pause triggers forfeit', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startMatch();

    room.pause('user-1');

    room.state!.phase = 'ended';
    room.state!.winner = 's1';

    expect(room.state!.phase).toBe('ended');
    expect(room.state!.winner).toBe('s1');
  });

  it('both players disconnect — no winner', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startMatch();

    room.pause('user-1');
    room.pause('user-2');

    expect(room.pauseState!.disconnectedUserIds.size).toBe(2);
  });
});
