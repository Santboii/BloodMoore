import { describe, it, expect } from 'vitest';
import { Room } from '../src/rooms/Room.ts';

describe('Room.characterIds', () => {
  it('stores characterId for a socket', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.characterIds.set('s1', 'char-uuid-1');
    expect(room.characterIds.get('s1')).toBe('char-uuid-1');
  });

  it('removePlayer clears characterId', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.characterIds.set('s1', 'char-uuid-1');
    room.removePlayer('s1');
    expect(room.characterIds.has('s1')).toBe(false);
  });

  it('remapPlayer moves characterId to new socket', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.characterIds.set('s1', 'char-uuid-1');
    room.startMatch();
    room.remapPlayer('s1', 's1-new');
    expect(room.characterIds.has('s1')).toBe(false);
    expect(room.characterIds.get('s1-new')).toBe('char-uuid-1');
  });
});
