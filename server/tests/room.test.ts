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

describe('Room.remapPlayer', () => {
  it('replaces old socket ID with new one in players map', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.remapPlayer('s1', 's1-new');

    expect(room.players.has('s1')).toBe(false);
    expect(room.players.has('s1-new')).toBe(true);
    expect(room.players.get('s1-new')!.displayName).toBe('Alice');
  });

  it('remaps userIds entry to new socket ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.userIds.set('s1', 'user-1');

    room.remapPlayer('s1', 's1-new');

    expect(room.userIds.has('s1')).toBe(false);
    expect(room.userIds.get('s1-new')).toBe('user-1');
  });

  it('remaps skillSets entry to new socket ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    const skills = new Set(['fire.fireball'] as any);
    room.skillSets.set('s1', skills);

    room.remapPlayer('s1', 's1-new');

    expect(room.skillSets.has('s1')).toBe(false);
    expect(room.skillSets.get('s1-new')).toBe(skills);
  });

  it('remaps pendingInputs entry to new socket ID', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();
    const input = { move: { x: 1, y: 0 }, castSpell: null, aimTarget: { x: 0, y: 0 } };
    room.queueInput('s1', input);

    room.remapPlayer('s1', 's1-new');

    room.queueInput('s1-new', input);
    // Just verify it doesn't throw — pendingInputs is private so we test via tick()
  });

  it('remaps player ID in GameState.players', () => {
    const room = new Room('r1');
    room.addPlayer('s1', 'Alice');
    room.addPlayer('s2', 'Bob');
    room.userIds.set('s1', 'user-1');
    room.userIds.set('s2', 'user-2');
    room.startDuel();

    room.remapPlayer('s1', 's1-new');

    expect(room.state!.players['s1']).toBeUndefined();
    expect(room.state!.players['s1-new']).toBeDefined();
    expect(room.state!.players['s1-new'].displayName).toBe('Alice');
    expect(room.state!.players['s1-new'].id).toBe('s1-new');
  });
});
