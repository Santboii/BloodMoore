import { GameState, SpellId, SPELL_CONFIG, MAX_HP, MAX_MANA } from '@arena/shared';

const SPELL_NAMES: Record<number, string> = { 1: 'FB', 2: 'FW', 3: 'MT' };

export class HUD {
  private el: HTMLElement;
  private myId = '';

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <style>
        .hud-panel{position:fixed;bottom:0;left:0;right:0;height:72px;background:rgba(0,0,0,0.85);border-top:2px solid #4a3000;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
        .orb{width:52px;height:52px;border-radius:50%;position:relative;border:2px solid}
        .orb-fill{position:absolute;bottom:0;left:0;right:0;border-radius:50%;transition:height .1s}
        .orb-hp{border-color:#aa1111}.orb-hp .orb-fill{background:radial-gradient(circle at 40% 30%,#ff4444,#880000)}
        .orb-mp{border-color:#1133aa}.orb-mp .orb-fill{background:radial-gradient(circle at 40% 30%,#4488ff,#001888)}
        .spells{display:flex;gap:6px}
        .spell-slot{width:44px;height:44px;border:2px solid #555;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;color:#ccc;position:relative;overflow:hidden;cursor:pointer}
        .spell-slot.active{border-color:#ffaa00;color:#ffcc66}
        .spell-slot .cd-overlay{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);transition:height .1s}
        .enemy-bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);text-align:center;min-width:160px}
        .enemy-name{font-size:12px;color:#ffcc44;margin-bottom:4px}
        .enemy-hp-track{height:8px;background:#330000;border-radius:4px;overflow:hidden;width:160px}
        .enemy-hp-fill{height:100%;background:#cc2222;border-radius:4px;transition:width .1s}
      </style>
      <div class="enemy-bar">
        <div class="enemy-name" id="hud-enemy-name">—</div>
        <div class="enemy-hp-track"><div class="enemy-hp-fill" id="hud-enemy-hp" style="width:100%"></div></div>
      </div>
      <div class="hud-panel">
        <div class="orb orb-hp"><div class="orb-fill" id="hud-hp" style="height:100%"></div></div>
        <div class="spells" id="hud-spells"></div>
        <div class="orb orb-mp"><div class="orb-fill" id="hud-mp" style="height:100%"></div></div>
      </div>
    `;
    container.appendChild(this.el);
    this.buildSpellSlots();
  }

  private buildSpellSlots(): void {
    const spells = this.el.querySelector('#hud-spells')!;
    for (const key of [1, 2, 3]) {
      const slot = document.createElement('div');
      slot.className = 'spell-slot';
      slot.id = `spell-slot-${key}`;
      slot.innerHTML = `<span>${SPELL_NAMES[key]}</span><span style="font-size:9px;color:#888">${key}</span><div class="cd-overlay" id="cd-${key}" style="height:0%"></div>`;
      spells.appendChild(slot);
    }
  }

  init(myId: string): void { this.myId = myId; }

  update(state: GameState, activeSpell: 1 | 2 | 3): void {
    const me = state.players[this.myId];
    if (!me) return;

    // HP / MP orbs
    (this.el.querySelector('#hud-hp') as HTMLElement).style.height = `${(me.hp / MAX_HP) * 100}%`;
    (this.el.querySelector('#hud-mp') as HTMLElement).style.height = `${(me.mana / MAX_MANA) * 100}%`;

    // Spell slots
    for (const key of [1, 2, 3] as SpellId[]) {
      const slot = this.el.querySelector(`#spell-slot-${key}`) as HTMLElement;
      slot.classList.toggle('active', key === activeSpell);
      const cd = me.cooldowns[key] ?? 0;
      const maxCd = SPELL_CONFIG[key].cooldownTicks;
      (this.el.querySelector(`#cd-${key}`) as HTMLElement).style.height = `${(cd / maxCd) * 100}%`;
    }

    // Enemy bar
    const enemyId = Object.keys(state.players).find(id => id !== this.myId);
    if (enemyId) {
      const enemy = state.players[enemyId];
      (this.el.querySelector('#hud-enemy-name') as HTMLElement).textContent = enemy.displayName;
      (this.el.querySelector('#hud-enemy-hp') as HTMLElement).style.width = `${(enemy.hp / MAX_HP) * 100}%`;
    }
  }

  show(): void { this.el.style.display = ''; }
  hide(): void { this.el.style.display = 'none'; }
}
