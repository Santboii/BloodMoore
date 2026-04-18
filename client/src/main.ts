import { Scene } from './renderer/Scene';

const container = document.getElementById('canvas-container')!;
const scene = new Scene(container);
scene.startRenderLoop(() => {});
