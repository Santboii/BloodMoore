import { Scene } from './renderer/Scene';
import { Arena } from './renderer/Arena';
import { CharacterMesh } from './renderer/CharacterMesh';
import { SpellRenderer } from './renderer/SpellRenderer';
import { StateBuffer } from './network/StateBuffer';
import { SocketClient } from './network/SocketClient';
import { InputHandler } from './input/InputHandler';
import { HUD } from './hud/HUD';
import { LobbyUI } from './lobby/LobbyUI';
import { AuthUI } from './auth/AuthUI';
import { SkillTreeUI } from './skills/SkillTreeUI';
import { supabase, fetchProfile } from './supabase';
import { GameState, NodeId, SpellId } from '@arena/shared';
import { AssetLoader } from './renderer/AssetLoader';
import type { LoadedAssets } from './renderer/AssetLoader';

const container = document.getElementById('canvas-container')!;
const uiOverlay = document.getElementById('ui-overlay')!;

const scene = new Scene(container);

const hud = new HUD(uiOverlay);
hud.hide();

const stateBuffer = new StateBuffer();
const socket = new SocketClient();

let myId = '';
let currentRoomId = '';
let currentPlayers: Record<string, string> = {};
let playerMeshes = new Map<string, CharacterMesh>();
let spellRenderer: SpellRenderer | null = null;
let inputHandler: InputHandler | null = null;
let opponentName = '';
let handlersRegistered = false;
let pendingRejoin: { roomId: string } | null = null;

let accessToken = '';
let ownedSpells = new Set<SpellId>();

function spellsFromNodes(nodes: Set<NodeId>): Set<SpellId> {
  const map: [NodeId, SpellId][] = [
    ['fire.fireball', 1], ['fire.fire_wall', 2], ['fire.meteor', 3], ['utility.teleport', 4],
  ];
  const result = new Set<SpellId>();
  for (const [nodeId, spellId] of map) {
    if (nodes.has(nodeId)) result.add(spellId);
  }
  return result;
}

const PLAYER_COLORS: Record<number, number> = { 0: 0xc8a000, 1: 0xc00030 };
let myColorIndex = 0;
let assets: LoadedAssets;

let myDisplayName = '';

const skillTreeUI = new SkillTreeUI(uiOverlay);

const auth = new AuthUI(uiOverlay, {
  onAuthed: async (username, token) => {
    accessToken = token;
    auth.hide();
    const profile = await fetchProfile();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('user_id', user.id);
      const nodeSet = new Set<NodeId>((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
      ownedSpells = spellsFromNodes(nodeSet);
      hud.buildSpellSlots(ownedSpells);
    }

    const pausedRoomId = await checkPausedMatch(token);
    if (pausedRoomId) {
      await attemptAutoRejoin(pausedRoomId, username, profile?.skill_points_available);
      return;
    }

    lobby.show();
    lobby.showHome(username, profile?.skill_points_available);
  },
});

async function checkPausedMatch(token: string): Promise<string | null> {
  try {
    const res = await fetch('/paused-match', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const { roomId } = await res.json();
    return roomId;
  } catch {
    return null;
  }
}

async function attemptAutoRejoin(
  roomId: string,
  username: string,
  skillPoints: number | undefined
): Promise<void> {
  try { await assetsReady; } catch { return; }

  myDisplayName = username;
  currentRoomId = roomId;
  setupSocketHandlers(username);
  socket.connect();

  socket.onRejoinAccepted(payload => {
    myId = payload.yourId;
    myColorIndex = payload.colorIndex;
    currentPlayers = payload.players;
    const opponentEntry = Object.entries(payload.players).find(([id]) => id !== payload.yourId);
    if (opponentEntry) opponentName = opponentEntry[1];
    hud.init(myId);
    lobby.hide();
  });
  socket.onRejoinFailed(() => {
    currentRoomId = '';
    myId = '';
    lobby.show();
    lobby.showHome(username, skillPoints);
  });
  socket.rejoinRoom(roomId, accessToken);
}

const lobby = new LobbyUI(uiOverlay, {
  onCreateRoom: async (displayName) => {
    myDisplayName = displayName;
    const res = await fetch('/rooms', { method: 'POST' });
    const { roomId } = await res.json();
    socket.connect();
    socket.joinRoom(roomId, displayName, accessToken);
    socket.onRoomJoined(({ yourId }) => {
      myId = yourId;
      currentRoomId = roomId;
      currentPlayers = { [yourId]: displayName };
      myColorIndex = 0;
      hud.init(myId);
      lobby.showWaiting(roomId, displayName);
      lobby.appendSystemMessage('You have entered the lobby');
    });
    setupSocketHandlers(displayName);
  },
  onJoinRoom: (roomId, displayName) => {
    myDisplayName = displayName;
    socket.connect();
    socket.joinRoom(roomId, displayName, accessToken);
    socket.onRoomJoined(({ yourId, players }) => {
      myId = yourId;
      currentRoomId = roomId;
      currentPlayers = players;
      myColorIndex = 1;
      hud.init(myId);
      // Set opponent name from existing players
      const opponentEntry = Object.entries(players).find(([id]) => id !== yourId);
      if (opponentEntry) opponentName = opponentEntry[1];
      if (Object.keys(players).length >= 2) {
        lobby.showReady(roomId, players, yourId);
      } else {
        lobby.showWaiting(roomId, displayName);
      }
      lobby.appendSystemMessage('You have entered the lobby');
    });
    setupSocketHandlers(displayName);
  },
  onReady: () => socket.ready(),
  onRematch: () => socket.rematch(),
  onReturnToLobby: () => {
    stopGame();
    socket.disconnect();
    handlersRegistered = false;
    currentRoomId = '';
    currentPlayers = {};
    opponentName = '';
    lobby.showHome(myDisplayName);
  },
  onSendChatMessage: (text) => socket.sendChatMessage(text),
  onLogout: async () => {
    try { await supabase.auth.signOut(); } catch { /* proceed anyway */ }
    stopGame();
    accessToken = '';
    handlersRegistered = false;
    myId = '';
    currentRoomId = '';
    currentPlayers = {};
    opponentName = '';
    ownedSpells = new Set();
    pendingRejoin = null;
    socket.disconnect();
    lobby.hide();
    auth.show();
  },
  onOpenSkills: async () => {
    lobby.hide();
    await skillTreeUI.show();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('user_id', user.id);
      const nodeSet = new Set<NodeId>((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
      ownedSpells = spellsFromNodes(nodeSet);
      hud.buildSpellSlots(ownedSpells);
    }
    const profile = await fetchProfile();
    lobby.show();
    lobby.showHome(undefined, profile?.skill_points_available);
  },
});
lobby.hide();

function setupSocketHandlers(_myDisplayName: string): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  socket.onChatMessage(({ senderId, displayName, text }) =>
    lobby.appendChatMessage(senderId, displayName, text)
  );

  socket.onPlayerJoined(({ id, displayName }) => {
    opponentName = displayName;
    currentPlayers[id] = displayName;
    lobby.showReady(currentRoomId, currentPlayers, myId);
    lobby.appendSystemMessage(`${displayName} has entered the lobby`);
  });

  socket.onGameReady(() => lobby.showReady(currentRoomId, currentPlayers, myId));

  socket.onGameState((state: GameState) => {
    if (!spellRenderer) {
      stateBuffer.clear();
      startGame();
      lobby.hide();
    }
    stateBuffer.push(state);
  });

  let duelEnded = false;

  socket.onDuelEnded(({ winnerId }) => {
    duelEnded = true;
    const won = winnerId === myId;
    lobby.hidePauseOverlay();
    stopGame();
    lobby.showResult(won, opponentName);
    lobby.show();
  });

  socket.onRematchReady(() => {
    duelEnded = false;
    stateBuffer.clear();
    startGame();
    lobby.hide();
  });

  socket.onOpponentDisconnected(() => {
    if (duelEnded) {
      lobby.disableRematch();
    } else {
      stopGame();
      lobby.showDisconnected();
      lobby.show();
    }
  });

  socket.onMatchPaused(({ countdown }) => {
    lobby.showPauseOverlay(countdown, () => {
      socket.leavePausedMatch();
    });
  });

  socket.onGameResumed(() => {
    lobby.hidePauseOverlay();
  });

  socket.onDisconnect(() => {
    if (spellRenderer && currentRoomId) {
      pendingRejoin = { roomId: currentRoomId };
    }
  });

  socket.onReconnect(() => {
    if (!pendingRejoin) return;
    socket.onRejoinAccepted(() => {
      pendingRejoin = null;
    });
    socket.onRejoinFailed(() => {
      pendingRejoin = null;
      stopGame();
      lobby.showDisconnected();
      lobby.show();
    });
    socket.rejoinRoom(pendingRejoin.roomId, accessToken);
  });

  socket.onRoomNotFound(() => {
    lobby.showHome();
  });
}

function startGame(): void {
  for (const mesh of playerMeshes.values()) mesh.dispose(uiOverlay);
  playerMeshes.clear();
  spellRenderer?.dispose();
  inputHandler?.dispose();

  spellRenderer = new SpellRenderer(scene.scene, myId);
  inputHandler = new InputHandler(scene, scene.renderer.domElement);

  hud.buildSpellSlots(ownedSpells);
  hud.show();
  lobby.hide();
}

function stopGame(): void {
  inputHandler?.dispose();
  inputHandler = null;
  spellRenderer?.dispose();
  spellRenderer = null;
  for (const mesh of playerMeshes.values()) mesh.dispose(uiOverlay);
  playerMeshes.clear();
  hud.hide();
  stateBuffer.clear();
}

let lastFrameTime = performance.now();

// Main render loop — runs always
scene.startRenderLoop(() => {
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1); // cap at 100ms to avoid jumps
  lastFrameTime = now;

  if (!inputHandler || !spellRenderer) return;

  const frame = inputHandler.buildInputFrame();
  socket.sendInput(frame);

  const state = stateBuffer.getInterpolated();
  if (!state) return;

  for (const [id, player] of Object.entries(state.players)) {
    if (!playerMeshes.has(id)) {
      const colorIndex = id === myId ? myColorIndex : 1 - myColorIndex;
      const gltf = colorIndex === 0 ? assets.characters.warrior : assets.characters.mage;
      const mesh = new CharacterMesh(gltf, PLAYER_COLORS[colorIndex], player.displayName, uiOverlay);
      scene.scene.add(mesh.group);
      playerMeshes.set(id, mesh);
    }
    const mesh = playerMeshes.get(id)!;
    mesh.setPosition(player.position.x, player.position.y, player.facing);
    mesh.update(delta, player.castingSpell !== null);
    if (player.hp <= 0) mesh.die();
    mesh.updateLabel(scene.camera, scene.renderer);
  }

  // Follow local player with camera
  const myPlayer = state.players[myId];
  if (myPlayer) {
    scene.updateCamera(myPlayer.position.x, myPlayer.position.y, delta);
  }

  spellRenderer.update(state);
  hud.update(state, inputHandler.getActiveSpell());
});

// Async init — load assets then build scene
const assetsReady: Promise<void> = (async () => {
  assets = await AssetLoader.load();
  const arena = new Arena(assets.textures);
  arena.addToScene(scene.scene);
  scene.initPostProcessing();
})().catch(err => {
  console.error('Asset load failed:', err);
  throw err;
});
