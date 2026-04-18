import { describe, it, expect } from 'vitest';
import { advanceState, makeInitialState } from '../src/gameloop/StateAdvancer.ts';
import { SPELL_CONFIG, MAX_HP, MAX_MANA, MANA_REGEN_PER_TICK, FIREWALL_DAMAGE_PER_TICK } from '@arena/shared';
import { spawnFireWall } from '../src/spells/FireWall.ts';

function twoPlayerState() {
  return makeInitialState([
    { id: 'p1', displayName: 'Alice', spawnPos: { x: 80, y: 400 } },
    { id: 'p2', displayName: 'Bob', spawnPos: { x: 720, y: 400 } },
  ]);
}

describe('makeInitialState', () => {
  it('creates state with two players at spawn positions', () => {
    const state = twoPlayerState();
    expect(state.players['p1'].position).toEqual({ x: 80, y: 400 });
    expect(state.players['p2'].position).toEqual({ x: 720, y: 400 });
    expect(state.phase).toBe('dueling');
  });

  it('creates state with full HP, full mana, empty spells', () => {
    const state = twoPlayerState();
    expect(state.players['p1'].hp).toBe(MAX_HP);
    expect(state.players['p1'].mana).toBe(MAX_MANA);
    expect(state.players['p1'].cooldowns).toEqual({});
    expect(state.players['p1'].castingSpell).toBeNull();
    expect(state.projectiles).toHaveLength(0);
    expect(state.fireWalls).toHaveLength(0);
    expect(state.meteors).toHaveLength(0);
  });
});

describe('advanceState — movement', () => {
  it('moves p1 right when move input is {x:1, y:0}', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 1, y: 0 }, castSpell: null, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].position.x).toBeGreaterThan(80);
  });
});

describe('advanceState — mana regen', () => {
  it('regens mana by MANA_REGEN_PER_TICK per tick', () => {
    const state = twoPlayerState();
    state.players['p1'].mana = MAX_MANA - 10;
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 400, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].mana).toBe(MAX_MANA - 10 + MANA_REGEN_PER_TICK);
  });
});

describe('advanceState — fireball cast', () => {
  it('spawns a fireball and deducts mana when p1 casts spell 1', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.projectiles.length).toBe(1);
    expect(next.players['p1'].mana).toBe(MAX_MANA - SPELL_CONFIG[1].manaCost);
  });

  it('does not cast when mana is insufficient', () => {
    const state = twoPlayerState();
    state.players['p1'].mana = 0;
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.projectiles.length).toBe(0);
  });
});

describe('advanceState — cooldowns', () => {
  it('sets cooldown after casting fireball and blocks immediate re-cast', () => {
    const state = twoPlayerState();
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: 1 as const, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].cooldowns[1]).toBeGreaterThan(0);

    // immediate re-cast is blocked by cooldown
    const next2 = advanceState(next, inputs);
    expect(next2.projectiles.length).toBe(next.projectiles.length); // no new fireball added
  });
});

describe('advanceState — win condition', () => {
  it('sets phase to ended and winner when a player reaches 0 hp', () => {
    const state = twoPlayerState();
    state.players['p2'].hp = 1;
    // Place a fireball right on p2
    state.projectiles.push({
      id: 'fb_test',
      ownerId: 'p1',
      type: 'fireball',
      position: { x: 720, y: 400 },
      velocity: { x: 400, y: 0 },
    });
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBe('p1');
  });
});

describe('advanceState — fire wall damage', () => {
  it('stacks damage from two overlapping fire walls', () => {
    const state = twoPlayerState();
    const playerPos = state.players['p1'].position; // { x: 80, y: 400 }
    const fw1 = spawnFireWall('p2', { x: 60, y: 400 }, { x: 100, y: 400 }, 0);
    const fw2 = spawnFireWall('p2', { x: 60, y: 400 }, { x: 100, y: 400 }, 0);
    state.fireWalls.push(fw1, fw2);
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.players['p1'].hp).toBeCloseTo(MAX_HP - FIREWALL_DAMAGE_PER_TICK * 2, 10);
  });
});

describe('advanceState — simultaneous death', () => {
  it('sets winner to null when both players die in the same tick', () => {
    const state = twoPlayerState();
    state.players['p1'].hp = 1;
    state.players['p2'].hp = 1;
    // Two fireballs: p2's fireball hits p1, p1's fireball hits p2
    state.projectiles.push(
      { id: 'fb1', ownerId: 'p2', type: 'fireball', position: { x: 80, y: 400 }, velocity: { x: 400, y: 0 } },
      { id: 'fb2', ownerId: 'p1', type: 'fireball', position: { x: 720, y: 400 }, velocity: { x: -400, y: 0 } },
    );
    const inputs = {
      p1: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 720, y: 400 } },
      p2: { move: { x: 0, y: 0 }, castSpell: null, aimTarget: { x: 80, y: 400 } },
    };
    const next = advanceState(state, inputs);
    expect(next.phase).toBe('ended');
    expect(next.winner).toBeNull();
  });
});
