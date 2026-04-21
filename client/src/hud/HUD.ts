import { GameState, PlayerState, SpellId, SPELL_CONFIG, MAX_HP, MAX_MANA } from '@arena/shared';
import { Minimap } from './Minimap';

const SPELL_NAMES: Record<number, string> = { 1: 'FB', 2: 'FW', 3: 'MT', 4: 'TP' };

export class HUD {
  private el: HTMLElement;
  private minimap: Minimap;
  private myId = '';
  private prevHp: Record<string, number> = {};

  constructor(container: HTMLElement) {
    this.minimap = new Minimap(container);
    this.el = document.createElement('div');
    this.el.innerHTML = `
      <style>
        .hud-panel{position:fixed;bottom:0;left:0;right:0;height:72px;background:rgba(0,0,0,0.85);border-top:2px solid #4a3000;display:flex;align-items:center;justify-content:space-between;padding:0 20px}
        .orb{width:80px;height:80px;border-radius:50%;position:relative;border:3px solid;overflow:hidden;margin-bottom:16px}
        .orb-fill{position:absolute;inset:0;transition:transform .1s}
        .orb-hp{border-color:#aa1111}.orb-hp .orb-fill{background:radial-gradient(circle at 40% 30%,#ff4444,#880000)}
        .orb-mp{border-color:#1133aa}.orb-mp .orb-fill{background:radial-gradient(circle at 40% 30%,#4488ff,#001888)}
        .spells{display:flex;gap:6px}
        .spell-slot{width:44px;height:44px;border:2px solid #555;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;color:#ccc;position:relative;overflow:hidden;cursor:pointer}
        .spell-slot.active{border-color:#ffaa00;color:#ffcc66}
        .spell-slot .cd-overlay{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);transition:height .1s}
        .hud-enemies{position:fixed;top:12px;right:140px;display:flex;flex-direction:column;gap:6px;min-width:160px}
        .hud-enemy-entry{text-align:center}
        .hud-enemy-entry .enemy-name{font-size:12px;color:#ffcc44;margin-bottom:2px}
        .hud-enemy-entry .enemy-hp-track{height:8px;background:#330000;border-radius:4px;overflow:hidden;width:160px}
        .hud-enemy-entry .enemy-hp-fill{height:100%;background:#cc2222;border-radius:4px;transition:width .1s}
        .hud-elim{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-family:'Cinzel',serif;font-size:24px;color:#cc2222;letter-spacing:4px;text-transform:uppercase;text-shadow:0 0 20px rgba(200,30,30,0.6);pointer-events:none;animation:hud-elim-fade 2s forwards}
        @keyframes hud-elim-fade{0%{opacity:1;transform:translate(-50%,-50%) scale(1)}70%{opacity:1}100%{opacity:0;transform:translate(-50%,-80%) scale(0.9)}}
      </style>
      <div id="hud-enemies" class="hud-enemies"></div>
      <div class="hud-panel">
        <div class="orb orb-hp"><div class="orb-fill" id="hud-hp" style="transform:translateY(0%)"></div></div>
        <div class="spells" id="hud-spells"></div>
        <div class="orb orb-mp"><div class="orb-fill" id="hud-mp" style="transform:translateY(0%)"></div></div>
      </div>
    `;
    container.appendChild(this.el);
  }

  init(myId: string): void { this.myId = myId; this.prevHp = {}; }

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

    // Render all enemy HP bars
    const enemiesContainer = this.el.querySelector('#hud-enemies') as HTMLElement;
    const others = Object.entries(state.players).filter(([id]) => id !== this.myId);
    const otherStates: PlayerState[] = [];

    // Build enemy bars HTML
    let enemyHtml = '';
    for (const [id, player] of others) {
      const hpPct = (player.hp / MAX_HP) * 100;
      const opacity = player.hp <= 0 ? '0.3' : '1';
      enemyHtml += `<div class="hud-enemy-entry" style="opacity:${opacity}">
        <div class="enemy-name">${player.displayName}</div>
        <div class="enemy-hp-track"><div class="enemy-hp-fill" style="width:${hpPct}%"></div></div>
      </div>`;
      otherStates.push(player);

      // Detect death for elimination notification
      const prev = this.prevHp[id];
      if (prev !== undefined && prev > 0 && player.hp <= 0) {
        this.showElimination(player.displayName);
      }
    }
    enemiesContainer.innerHTML = enemyHtml;

    // Track HP for next frame
    const newPrevHp: Record<string, number> = {};
    for (const [id, player] of Object.entries(state.players)) {
      newPrevHp[id] = player.hp;
    }
    this.prevHp = newPrevHp;

    this.minimap.update(me, otherStates);
  }

  showElimination(name: string): void {
    const el = document.createElement('div');
    el.className = 'hud-elim';
    el.textContent = `${name} eliminated`;
    this.el.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  show(): void { this.el.style.display = ''; this.minimap.show(); }
  hide(): void { this.el.style.display = 'none'; this.minimap.hide(); }
}
