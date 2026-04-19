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

const container = document.getElementById('canvas-container')!;
const uiOverlay = document.getElementById('ui-overlay')!;

const scene = new Scene(container);
const arena = new Arena();
arena.addToScene(scene.scene);

const hud = new HUD(uiOverlay);
hud.hide();

const stateBuffer = new StateBuffer();
const socket = new SocketClient();

let myId = '';
let playerMeshes = new Map<string, CharacterMesh>();
let spellRenderer: SpellRenderer | null = null;
let inputHandler: InputHandler | null = null;
let opponentName = '';
let handlersRegistered = false;

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
    lobby.show();
    lobby.showHome(username, profile?.skill_points_available);
  },
});

const lobby = new LobbyUI(uiOverlay, {
  onCreateRoom: async (displayName) => {
    const res = await fetch('/rooms', { method: 'POST' });
    const { roomId } = await res.json();
    const shareUrl = `${location.origin}?room=${roomId}`;
    socket.connect();
    socket.joinRoom(roomId, displayName, accessToken);
    socket.onRoomJoined(({ yourId }) => {
      myId = yourId;
      myColorIndex = 0;
      hud.init(myId);
      lobby.showWaiting(shareUrl);
    });
    setupSocketHandlers(displayName);
  },
  onJoinRoom: (roomId, displayName) => {
    socket.connect();
    socket.joinRoom(roomId, displayName, accessToken);
    socket.onRoomJoined(({ yourId, players }) => {
      myId = yourId;
      myColorIndex = 1;
      hud.init(myId);
      // Set opponent name from existing players
      const opponentEntry = Object.entries(players).find(([id]) => id !== yourId);
      if (opponentEntry) opponentName = opponentEntry[1];
      if (Object.keys(players).length >= 2) lobby.showReady();
    });
    setupSocketHandlers(displayName);
  },
  onReady: () => socket.ready(),
  onRematch: () => socket.rematch(),
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

  socket.onPlayerJoined(({ displayName }) => {
    opponentName = displayName;
    lobby.showReady();
  });

  socket.onGameReady(() => lobby.showReady());

  socket.onGameState((state: GameState) => {
    if (!spellRenderer) {
      stateBuffer.clear();
      startGame();
      lobby.hide();
    }
    stateBuffer.push(state);
  });

  socket.onDuelEnded(({ winnerId }) => {
    const won = winnerId === myId;
    stopGame();
    lobby.showResult(won, opponentName);
    lobby.show();
  });

  socket.onRematchReady(() => {
    stateBuffer.clear();
    startGame();
    lobby.hide();
  });

  socket.onOpponentDisconnected(() => {
    stopGame();
    lobby.showDisconnected();
    lobby.show();
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

  spellRenderer = new SpellRenderer(scene.scene);
  spellRenderer.setMyId(myId);
  inputHandler = new InputHandler(scene, scene.renderer.domElement);

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
      const mesh = new CharacterMesh(PLAYER_COLORS[colorIndex], player.displayName, uiOverlay);
      scene.scene.add(mesh.group);
      playerMeshes.set(id, mesh);
    }
    const mesh = playerMeshes.get(id)!;
    mesh.setPosition(player.position.x, player.position.y);
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
