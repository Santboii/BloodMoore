import { ARENA_SIZE, PILLARS, PlayerState } from '@arena/shared';

const SIZE = 120;

// Camera sits at (+X, +Z) offset from player → isometric "up" = world (-X,-Z).
// Project to minimap using isometric axes so the minimap matches what players see.
function toMini(wx: number, wz: number): [number, number] {
  const mx = SIZE / 2 + (wx - wz) * SIZE / (2 * ARENA_SIZE);
  const my = (wx + wz) * SIZE / (2 * ARENA_SIZE);
  return [mx, my];
}

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

  update(localPlayer: PlayerState, others: PlayerState[]): void {
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
      const [px, py] = toMini(p.x, p.y);
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // Other players
    const ENEMY_COLORS = ['#ff5252', '#ff9800', '#ab47bc'];
    for (let i = 0; i < others.length; i++) {
      const other = others[i];
      if (other.hp <= 0) continue;
      const [ox, oy] = toMini(other.position.x, other.position.y);
      ctx.fillStyle = ENEMY_COLORS[i % ENEMY_COLORS.length];
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player
    const [lx, ly] = toMini(localPlayer.position.x, localPlayer.position.y);
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.arc(lx, ly, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  show(): void { this.canvas.style.display = ''; }
  hide(): void { this.canvas.style.display = 'none'; }
}
