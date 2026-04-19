import { supabase, fetchProfile, UserProfile } from '../supabase';
import { SKILL_NODES, GATES, canUnlock, NodeId, SkillNode } from '@arena/shared';

const NODE_ICONS: Record<NodeId, string> = {
  'fire.fireball':        'fa-fire',
  'fire.volatile_ember':  'fa-circle-dot',
  'fire.seeking_flame':   'fa-crosshairs',
  'fire.hellfire':        'fa-skull',
  'fire.pyroclasm':       'fa-code-fork',
  'fire.fire_wall':       'fa-fire-flame-simple',
  'fire.enduring_flames': 'fa-hourglass-half',
  'fire.searing_heat':    'fa-temperature-high',
  'fire.meteor':          'fa-meteor',
  'fire.molten_impact':   'fa-burst',
  'fire.blind_strike':    'fa-eye-slash',
  'utility.teleport':     'fa-wand-magic',
  'utility.phase_shift':  'fa-maximize',
  'utility.ethereal_form':'fa-ghost',
  'utility.phantom_step': 'fa-person-running',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type NodePos = { x: number; y: number };

const FIRE_POSITIONS: Partial<Record<NodeId, NodePos>> = {
  'fire.fireball':        { x: 50, y: 0 },
  'fire.volatile_ember':  { x: 30, y: 90 },
  'fire.seeking_flame':   { x: 70, y: 90 },
  'fire.hellfire':        { x: 30, y: 180 },
  'fire.pyroclasm':       { x: 70, y: 180 },
  'fire.fire_wall':       { x: 50, y: 270 },
  'fire.enduring_flames': { x: 30, y: 360 },
  'fire.searing_heat':    { x: 70, y: 360 },
  'fire.meteor':          { x: 50, y: 450 },
  'fire.molten_impact':   { x: 30, y: 540 },
  'fire.blind_strike':    { x: 70, y: 540 },
};

const UTIL_POSITIONS: Partial<Record<NodeId, NodePos>> = {
  'utility.teleport':      { x: 15, y: 0 },
  'utility.phase_shift':   { x: 45, y: -20 },
  'utility.ethereal_form': { x: 45, y: 20 },
  'utility.phantom_step':  { x: 80, y: 0 },
};

const STYLES = `
.st-overlay{position:fixed;inset:0;background:#0a0704;overflow-y:auto;z-index:150;display:none;}
.st-vignette{position:fixed;inset:0;background:radial-gradient(ellipse 80% 80% at 50% 50%,transparent 40%,rgba(0,0,0,0.85) 100%);pointer-events:none;z-index:151;}
.st-ui{position:relative;z-index:152;display:flex;flex-direction:column;align-items:center;padding:32px 24px;font-family:'Crimson Text',Georgia,serif;color:#c8a870;}
.st-header{display:flex;justify-content:space-between;align-items:center;width:100%;max-width:600px;margin-bottom:20px;}
.st-title{font-family:'Cinzel Decorative',Cinzel,serif;font-size:1.3rem;color:#ddb84a;letter-spacing:0.14em;}
.st-points{font-family:'Cinzel',serif;font-size:0.62rem;color:#6a5228;letter-spacing:0.2em;text-transform:uppercase;margin-top:2px;}
.st-points b{color:#90a870;}
.st-btn{padding:7px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.1em;transition:all 0.15s;}
.st-btn:hover{border-color:#c8860a;color:#ddb84a;}
.st-tree-label{font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;color:#d86030;text-align:center;margin-bottom:8px;}
.st-tree-container{position:relative;width:100%;max-width:600px;height:600px;}
.st-tree-svg{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;}
.st-node{position:absolute;display:flex;flex-direction:column;align-items:center;cursor:pointer;transform:translateX(-50%);}
.st-node-circle{border-radius:50%;display:flex;align-items:center;justify-content:center;transition:filter 0.14s,transform 0.14s;}
.st-node-spell{width:58px;height:58px;}
.st-node-mod{width:44px;height:44px;}
.st-node-owned .st-node-circle{border:2.5px solid #e86020;background:radial-gradient(circle at 38% 38%,#2a0c00,#0e0400);}
.st-node-owned.st-node-is-spell .st-node-circle{box-shadow:0 0 12px rgba(232,96,32,0.25);}
.st-node-owned .st-node-icon{color:#e87040;}
.st-node-owned .st-node-name{color:#d86040;}
.st-node-purchasable .st-node-circle{border:2px dashed #c8860a;background:radial-gradient(circle at 38% 38%,#160800,#0a0400);}
.st-node-purchasable .st-node-icon{color:#c8860a;}
.st-node-purchasable .st-node-name{color:#c8860a;}
.st-node-locked .st-node-circle{border:1.5px solid #444;background:#151515;}
.st-node-locked .st-node-icon{color:#555;}
.st-node-locked .st-node-name{color:#555;}
.st-node-name{font-size:0.56rem;text-align:center;max-width:72px;margin-top:4px;line-height:1.2;font-family:'Cinzel',serif;}
.st-node-cost{font-size:0.48rem;color:#4a3620;margin-top:2px;letter-spacing:0.08em;}
.st-divider{display:flex;align-items:center;gap:12px;width:100%;max-width:600px;margin:24px 0;}
.st-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#5a3a10,transparent);}
.st-divider-gem{width:10px;height:10px;background:#c8860a;transform:rotate(45deg);box-shadow:0 0 8px rgba(200,130,10,0.6);}
.st-util-label{font-size:0.58rem;letter-spacing:0.22em;color:#5a4420;text-transform:uppercase;text-align:center;margin-bottom:12px;}
.st-util-container{position:relative;width:100%;max-width:600px;height:80px;}
.st-util-svg{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;}
.st-tooltip{display:none;position:fixed;background:#1a1208;border:1px solid #3a2710;padding:10px 14px;border-radius:2px;max-width:220px;font-size:0.68rem;line-height:1.5;color:#c8a870;z-index:300;pointer-events:none;}
`;

export class SkillTreeUI {
  private el: HTMLElement;
  private owned = new Set<NodeId>();
  private profile: UserProfile | null = null;

  constructor(container: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'st-overlay';
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'block';
    await this.reload();
  }

  hide(): void { this.el.style.display = 'none'; }

  private async reload(): Promise<void> {
    this.profile = await fetchProfile();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('skill_unlocks').select('node_id').eq('user_id', user.id);
      this.owned = new Set((data ?? []).map((r: { node_id: string }) => r.node_id as NodeId));
    }
    this.render();
  }

  private render(): void {
    const pts = this.profile?.skill_points_available ?? 0;
    const fireNodes = SKILL_NODES.filter(n => n.tree === 'fire');
    const utilNodes = SKILL_NODES.filter(n => n.tree === 'utility');

    this.el.innerHTML = `
      <div class="st-vignette"></div>
      <div class="st-ui">
        <div class="st-header">
          <div>
            <div class="st-title">Sorceress Skills</div>
            <div class="st-points">Points Available: <b>${pts}</b></div>
          </div>
          <div style="display:flex;gap:10px">
            <button id="st-respec" class="st-btn">Reset Skills</button>
            <button id="st-close" class="st-btn">Back to Lobby</button>
          </div>
        </div>

        <div class="st-tree-label">Fire</div>
        <div class="st-tree-container">
          <svg id="st-fire-svg" class="st-tree-svg"></svg>
          ${fireNodes.map(n => this.renderNode(n, pts, FIRE_POSITIONS[n.id]!)).join('')}
        </div>

        <div class="st-divider"><div class="st-divider-line"></div><div class="st-divider-gem"></div><div class="st-divider-line"></div></div>

        <div class="st-util-label">Shared Utility</div>
        <div class="st-util-container">
          <svg id="st-util-svg" class="st-util-svg"></svg>
          ${utilNodes.map(n => this.renderNode(n, pts, UTIL_POSITIONS[n.id]!)).join('')}
        </div>

        <div id="st-tooltip" class="st-tooltip"></div>
      </div>
    `;

    this.el.querySelector('#st-close')!.addEventListener('click', () => this.hide());
    this.el.querySelector('#st-respec')!.addEventListener('click', () => this.handleRespec());

    this.drawConnections('st-fire-svg', FIRE_POSITIONS, fireNodes, pts);
    this.drawConnections('st-util-svg', UTIL_POSITIONS, utilNodes, pts);
    this.attachNodeListeners(pts);
  }

  private renderNode(node: SkillNode, pts: number, pos: NodePos): string {
    const isOwned = this.owned.has(node.id);
    const canBuy = !isOwned && canUnlock(node.id, this.owned) && pts >= node.cost;
    const stateClass = isOwned ? 'st-node-owned' : (canBuy ? 'st-node-purchasable' : 'st-node-locked');
    const spellClass = node.isSpell ? 'st-node-is-spell' : '';
    const sizeClass = node.isSpell ? 'st-node-spell' : 'st-node-mod';
    const icon = NODE_ICONS[node.id] ?? 'fa-star';
    const state = isOwned ? 'owned' : (canBuy ? 'purchasable' : 'locked');
    const costText = isOwned ? 'Owned' : `${node.cost} pt${node.cost > 1 ? 's' : ''}`;

    return `<div class="st-node ${stateClass} ${spellClass}" data-id="${node.id}" data-state="${state}"
      style="left:${pos.x}%;top:${pos.y}px;">
      <div class="st-node-circle ${sizeClass}">
        <i class="fa ${icon} fa-fw st-node-icon" style="font-size:${node.isSpell ? '1.25rem' : '1.05rem'}"></i>
      </div>
      <div class="st-node-name">${esc(node.name)}</div>
      <div class="st-node-cost">${costText}</div>
    </div>`;
  }

  private drawConnections(svgId: string, positions: Partial<Record<NodeId, NodePos>>, nodes: SkillNode[], pts: number): void {
    const svg = this.el.querySelector(`#${svgId}`) as SVGElement | null;
    if (!svg) return;

    let lines = '';
    for (const node of nodes) {
      const gate = GATES[node.id];
      if (!gate) continue;
      const childPos = positions[node.id];
      if (!childPos) continue;

      const isOwned = this.owned.has(node.id);
      const canBuy = !isOwned && canUnlock(node.id, this.owned) && pts >= node.cost;
      const color = isOwned ? '#e86020' : (canBuy ? '#c8860a' : '#333');
      const opacity = isOwned ? 0.6 : (canBuy ? 0.4 : 0.3);

      if (gate.requiresAll) {
        for (const parentId of gate.requiresAll) {
          const parentPos = positions[parentId];
          if (!parentPos) continue;
          lines += `<line x1="${parentPos.x}%" y1="${parentPos.y + 30}" x2="${childPos.x}%" y2="${childPos.y}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2"/>`;
        }
      }
      if (gate.requiresAny) {
        for (const parentId of gate.requiresAny) {
          const parentPos = positions[parentId];
          if (!parentPos) continue;
          lines += `<line x1="${parentPos.x}%" y1="${parentPos.y + 30}" x2="${childPos.x}%" y2="${childPos.y}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
        }
      }
    }
    svg.innerHTML = lines;
  }

  private attachNodeListeners(pts: number): void {
    const tooltip = this.el.querySelector('#st-tooltip') as HTMLElement;

    this.el.querySelectorAll('.st-node').forEach(el => {
      const id = el.getAttribute('data-id') as NodeId;
      const node = SKILL_NODES.find(n => n.id === id)!;

      el.addEventListener('mouseenter', e => {
        const isOwned = this.owned.has(id);
        const canBuy = !isOwned && canUnlock(id, this.owned) && pts >= node.cost;
        const gateBlocked = !isOwned && !canUnlock(id, this.owned);

        let statusLine = '';
        if (isOwned) {
          statusLine = '<span style="color:#90a870;font-size:0.6rem">Owned</span>';
        } else if (gateBlocked) {
          const gate = GATES[id];
          const missing: string[] = [];
          if (gate?.requiresAll) {
            for (const req of gate.requiresAll) {
              if (!this.owned.has(req)) {
                const reqNode = SKILL_NODES.find(n => n.id === req);
                if (reqNode) missing.push(reqNode.name);
              }
            }
          }
          if (gate?.requiresAny) {
            const hasAny = gate.requiresAny.some(r => this.owned.has(r));
            if (!hasAny) {
              const names = gate.requiresAny
                .map(r => SKILL_NODES.find(n => n.id === r)?.name)
                .filter(Boolean);
              missing.push(`one of: ${names.join(', ')}`);
            }
          }
          statusLine = `<span style="color:#884020;font-size:0.6rem">Requires: ${esc(missing.join(', '))}</span>`;
        } else if (canBuy) {
          statusLine = '<span style="color:#60a840;font-size:0.6rem">Click to unlock</span>';
        } else {
          statusLine = '<span style="color:#884020;font-size:0.6rem">Not enough points</span>';
        }

        tooltip.innerHTML = `
          <strong style="color:#ddb84a">${esc(node.name)}</strong><br>
          <span style="color:#c8a870">${esc(node.description)}</span><br>
          <span style="color:#7a6030;font-size:0.6rem">Cost: ${node.cost} pt${node.cost > 1 ? 's' : ''}</span><br>
          ${statusLine}
        `;
        tooltip.style.display = 'block';
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top = `${me.clientY - 10}px`;
      });

      el.addEventListener('mousemove', e => {
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top = `${me.clientY - 10}px`;
      });

      el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

      el.addEventListener('click', () => {
        const canBuy = !this.owned.has(id) && canUnlock(id, this.owned) && pts >= node.cost;
        if (canBuy) this.handleUnlock(id, node.cost);
      });
    });
  }

  private async handleUnlock(id: NodeId, cost: number): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.rpc('unlock_skill_node', {
      p_user_id: user.id,
      p_node_id: id,
      p_cost: cost,
    });
    if (error) { console.error('Unlock failed:', error.message); return; }
    await this.reload();
  }

  private async handleRespec(): Promise<void> {
    if (!confirm('Reset all skills? Points will be refunded.')) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.rpc('respec_skills', { p_user_id: user.id });
    if (error) { console.error('Respec failed:', error.message); return; }
    await this.reload();
  }
}
