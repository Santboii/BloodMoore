import { describe, it, expect } from 'vitest';
import { RoomManager } from '../src/rooms/RoomManager.ts';
import { DUEL_MODE, FFA_MODE, TEAM_DUEL_MODE } from '@arena/shared';

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

describe('RoomManager with modes', () => {
  it('creates room with specified mode', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('ffa');
    expect(room.mode).toBe(FFA_MODE);
  });

  it('defaults to 1v1 mode', () => {
    const rm = new RoomManager();
    const room = rm.createRoom();
    expect(room.mode).toBe(DUEL_MODE);
  });

  it('listOpenRooms reports correct mode and maxPlayers', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('2v2');
    room.addPlayer('s1', 'Alice', 'team1');
    const list = rm.listOpenRooms();
    expect(list).toHaveLength(1);
    expect(list[0].mode).toBe('2v2');
    expect(list[0].maxPlayers).toBe(4);
  });
});
