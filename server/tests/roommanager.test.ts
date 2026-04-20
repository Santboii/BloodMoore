import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/rooms/RoomManager.ts';

describe('RoomManager.listOpenRooms', () => {
  it('returns only rooms that have at least one player and are not full', () => {
    const rm = new RoomManager();
    const r1 = rm.createRoom(); r1.addPlayer('s1', 'Alice');
    const r2 = rm.createRoom(); r2.addPlayer('s2', 'Bob'); r2.addPlayer('s3', 'Carol');
    rm.createRoom(); // empty room

    const open = rm.listOpenRooms();
    expect(open).toHaveLength(1);
    expect(open[0].roomId).toBe(r1.id);
    expect(open[0].creatorName).toBe('Alice');
    expect(open[0].playerCount).toBe(1);
    expect(open[0].maxPlayers).toBe(2);
    expect(open[0].mode).toBe('1v1');
  });

  it('excludes rooms where the game has already started', () => {
    const rm = new RoomManager();
    const r1 = rm.createRoom(); r1.addPlayer('s1', 'Alice');
    const r2 = rm.createRoom(); r2.addPlayer('s2', 'Bob'); r2.addPlayer('s3', 'Carol');
    r2.startMatch();

    const open = rm.listOpenRooms();
    expect(open).toHaveLength(1);
    expect(open[0].roomId).toBe(r1.id);
  });

  it('returns empty array when no open rooms exist', () => {
    const rm = new RoomManager();
    expect(rm.listOpenRooms()).toEqual([]);
  });
});
