import { InputFrame } from '@arena/shared';
import { Scene } from '../renderer/Scene';

export class InputHandler {
  private keys = new Set<string>();
  private activeSpell: 1 | 2 | 3 = 1;
  private mouseWorld = { x: 400, y: 400 };
  private fireWallDragStart: { x: number; y: number } | null = null;
  private pendingCast: { spell: 1 | 2 | 3; aimTarget: { x: number; y: number }; aimTarget2?: { x: number; y: number } } | null = null;

  constructor(private scene: Scene, private canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup', this.onMouseUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Digit1') this.activeSpell = 1;
    if (e.code === 'Digit2') this.activeSpell = 2;
    if (e.code === 'Digit3') this.activeSpell = 3;
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private onMouseMove = (e: MouseEvent) => {
    this.mouseWorld = this.scene.screenToWorld(e.clientX, e.clientY);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.activeSpell === 2) {
      this.fireWallDragStart = this.scene.screenToWorld(e.clientX, e.clientY);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (this.activeSpell === 2 && this.fireWallDragStart) {
      const end = this.scene.screenToWorld(e.clientX, e.clientY);
      this.pendingCast = { spell: 2, aimTarget: this.fireWallDragStart, aimTarget2: end };
      this.fireWallDragStart = null;
    } else {
      this.pendingCast = { spell: this.activeSpell, aimTarget: this.mouseWorld };
    }
  };

  buildInputFrame(): InputFrame {
    const move = { x: 0, y: 0 };
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    move.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  move.y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  move.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.x += 1;

    const frame: InputFrame = { move, castSpell: null, aimTarget: this.mouseWorld };

    if (this.pendingCast) {
      frame.castSpell = this.pendingCast.spell;
      frame.aimTarget = this.pendingCast.aimTarget;
      frame.aimTarget2 = this.pendingCast.aimTarget2;
      this.pendingCast = null;
    }

    return frame;
  }

  getActiveSpell(): 1 | 2 | 3 { return this.activeSpell; }
  getFireWallDragStart(): { x: number; y: number } | null { return this.fireWallDragStart; }
  getCurrentMouseWorld(): { x: number; y: number } { return this.mouseWorld; }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
  }
}
