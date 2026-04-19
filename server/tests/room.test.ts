import { describe, it, expect } from 'vitest';
import { Room } from '../src/rooms/Room.ts';

describe('Room.creatorName', () => {
  it('stores the first player added as creator', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Grimshaw');
    expect(room.creatorName).toBe('Grimshaw');
  });

  it('does not overwrite creatorName when second player joins', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Grimshaw');
    room.addPlayer('s2', 'Darkbane');
    expect(room.creatorName).toBe('Grimshaw');
  });

  it('creatorName is empty string before any player joins', () => {
    const room = new Room('r1');
    expect(room.creatorName).toBe('');
  });
});

describe('Room pause/resume', () => {
  it('pause() sets pauseState with disconnected user ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');

    expect(room.pauseState).not.toBeNull();
    expect(room.pauseState!.disconnectedUserIds.has('user-1')).toBe(true);
    expect(room.pauseState!.disconnectedUserIds.has('user-2')).toBe(false);
  });

  it('pause() can track multiple disconnected users', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.pause('user-2');

    expect(room.pauseState!.disconnectedUserIds.size).toBe(2);
  });

  it('resume() clears pauseState', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.resume('user-1');

    expect(room.pauseState).toBeNull();
  });

  it('resume() only removes specified user from disconnectedUserIds', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.pause('user-1');
    room.pause('user-2');
    room.resume('user-1');

    expect(room.pauseState).not.toBeNull();
    expect(room.pauseState!.disconnectedUserIds.has('user-2')).toBe(true);
  });
});
