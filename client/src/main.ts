import { Scene } from './renderer/Scene';
import { Arena } from './renderer/Arena';
import { CharacterMesh } from './renderer/CharacterMesh';
import { SpellRenderer } from './renderer/SpellRenderer';
import { StateBuffer } from './network/StateBuffer';
import { SocketClient } from './network/SocketClient';
import { InputHandler } from './input/InputHandler';
import { HUD } from './hud/HUD';
import { LobbyUI } from './lobby/LobbyUI';
import { GameState } from '@arena/shared';

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
let currentRoomId = '';
let currentPlayers: Record<string, string> = {};
let playerMeshes = new Map<string, CharacterMesh>();
let spellRenderer: SpellRenderer | null = null;
let inputHandler: InputHandler | null = null;
let opponentName = '';
let handlersRegistered = false;

const PLAYER_COLORS: Record<number, number> = { 0: 0xc8a000, 1: 0xc00030 };
let myColorIndex = 0;

let myDisplayName = '';

const lobby = new LobbyUI(uiOverlay, {
  onCreateRoom: async (displayName) => {
    myDisplayName = displayName;
    const res = await fetch('/rooms', { method: 'POST' });
    const { roomId } = await res.json();
    socket.connect();
    socket.joinRoom(roomId, displayName);
    socket.onRoomJoined(({ yourId }) => {
      myId = yourId;
      currentRoomId = roomId;
      currentPlayers = { [yourId]: displayName };
      myColorIndex = 0;
      hud.init(myId);
      lobby.showWaiting(roomId, displayName);
    });
    setupSocketHandlers(displayName);
  },
  onJoinRoom: (roomId, displayName) => {
    myDisplayName = displayName;
    socket.connect();
    socket.joinRoom(roomId, displayName);
    socket.onRoomJoined(({ yourId, players }) => {
      myId = yourId;
      currentRoomId = roomId;
      currentPlayers = players;
      myColorIndex = 1;
      hud.init(myId);
      // Set opponent name from existing players
      const opponentEntry = Object.entries(players).find(([id]) => id !== yourId);
      if (opponentEntry) opponentName = opponentEntry[1];
      if (Object.keys(players).length >= 2) lobby.showReady(roomId, players, yourId);
    });
    setupSocketHandlers(displayName);
  },
  onReady: () => socket.ready(),
  onRematch: () => socket.rematch(),
  onSendChatMessage: (text) => socket.sendChatMessage(text),
});

function setupSocketHandlers(_myDisplayName: string): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  socket.onPlayerJoined(({ id, displayName }) => {
    opponentName = displayName;
    currentPlayers[id] = displayName;
    lobby.showReady(currentRoomId, currentPlayers, myId);
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
