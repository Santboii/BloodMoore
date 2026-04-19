import { GameState, SpellId, SPELL_CONFIG, MAX_HP, MAX_MANA } from '@arena/shared';
import { Minimap } from './Minimap';

const SPELL_NAMES: Record<number, string> = { 1: 'FB', 2: 'FW', 3: 'MT', 4: 'TP' };

export class HUD {
  private el: HTMLElement;
  private minimap: Minimap;
  private myId = '';

  constructor(container: HTMLElement) {
    this.minimap = new Minimap(container);
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <style>
        .hud-panel{position:fixed;bottom:0;left:0;right:0;height:72px;background:rgba(0,0,0,0.85);border-top:2px solid #4a3000;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
        .orb{width:52px;height:52px;border-radius:50%;position:relative;border:2px solid;overflow:hidden}
        .orb-fill{position:absolute;inset:0;transition:transform .1s}
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
        <div class="orb orb-hp"><div class="orb-fill" id="hud-hp" style="transform:translateY(0%)"></div></div>
        <div class="spells" id="hud-spells"></div>
        <div class="orb orb-mp"><div class="orb-fill" id="hud-mp" style="transform:translateY(0%)"></div></div>
      </div>
    `;
    container.appendChild(this.el);
  }

  init(myId: string): void { this.myId = myId; }

  buildSpellSlots(ownedSpells: Set<SpellId>): void {
    const spells = this.el.querySelector('#hud-spells')!;
    spells.innerHTML = '';
    for (const key of [1, 2, 3, 4] as SpellId[]) {
      if (!ownedSpells.has(key)) continue;
      const slot = document.createElement('div');
      slot.className = 'spell-slot';
      slot.id = `spell-slot-${key}`;
      slot.innerHTML = `<span>${SPELL_NAMES[key]}</span><span style="font-size:9px;color:#888">${key}</span><div class="cd-overlay" id="cd-${key}" style="height:0%"></div>`;
      spells.appendChild(slot);
    }
  }

  update(state: GameState, activeSpell: SpellId): void {
    const me = state.players[this.myId];
    if (!me) return;

    (this.el.querySelector('#hud-hp') as HTMLElement).style.transform = `translateY(${(1 - me.hp / MAX_HP) * 100}%)`;
    (this.el.querySelector('#hud-mp') as HTMLElement).style.transform = `translateY(${(1 - me.mana / MAX_MANA) * 100}%)`;

    for (const key of [1, 2, 3, 4] as SpellId[]) {
      const slot = this.el.querySelector(`#spell-slot-${key}`) as HTMLElement | null;
      if (!slot) continue;
      slot.classList.toggle('active', key === activeSpell);
      const cd = me.cooldowns[key] ?? 0;
      const maxCd = SPELL_CONFIG[key].cooldownTicks;
      const pct = maxCd > 0 ? (cd / maxCd) * 100 : 0;
      (this.el.querySelector(`#cd-${key}`) as HTMLElement).style.height = `${pct}%`;
    }

    const enemyId = Object.keys(state.players).find(id => id !== this.myId);
    if (enemyId) {
      const enemy = state.players[enemyId];
      (this.el.querySelector('#hud-enemy-name') as HTMLElement).textContent = enemy.displayName;
      (this.el.querySelector('#hud-enemy-hp') as HTMLElement).style.width = `${(enemy.hp / MAX_HP) * 100}%`;
      this.minimap.update(me, enemy);
    } else {
      this.minimap.update(me, undefined);
    }
  }

  show(): void { this.el.style.display = ''; this.minimap.show(); }
  hide(): void { this.el.style.display = 'none'; this.minimap.hide(); }
}
