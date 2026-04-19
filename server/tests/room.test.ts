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
