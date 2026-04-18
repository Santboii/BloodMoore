import { ARENA_SIZE, PILLARS, PlayerState } from '@arena/shared';

const SIZE = 120;
const SCALE = SIZE / ARENA_SIZE;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      opacity: '0.85',
      border: '1px solid #b8860b',
      borderRadius: '3px',
      zIndex: '100',
      display: 'none',
    });
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  update(localPlayer: PlayerState, opponent: PlayerState | undefined): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Arena border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, SIZE, SIZE);

    // Pillars
    ctx.fillStyle = '#6c63ff';
    for (const p of PILLARS) {
      const pw = Math.max(2, p.halfSize * 2 * SCALE);
      ctx.fillRect(p.x * SCALE - pw / 2, p.y * SCALE - pw / 2, pw, pw);
    }

    // Opponent (drawn first so local player renders on top if they overlap)
    if (opponent) {
      ctx.fillStyle = '#ff5252';
      ctx.beginPath();
      ctx.arc(opponent.position.x * SCALE, opponent.position.y * SCALE, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.arc(localPlayer.position.x * SCALE, localPlayer.position.y * SCALE, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  show(): void { this.canvas.style.display = ''; }
  hide(): void { this.canvas.style.display = 'none'; }
}
