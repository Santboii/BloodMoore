import { Scene } from './renderer/Scene';
import { Arena } from './renderer/Arena';

const container = document.getElementById('canvas-container')!;
const scene = new Scene(container);
const arena = new Arena();
arena.addToScene(scene.scene);
scene.startRenderLoop(() => {});
