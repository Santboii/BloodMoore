import { supabase, fetchProfile, UserProfile } from '../supabase.ts';
import { SKILL_NODES, canUnlock, NodeId, SkillNode } from '@arena/shared';

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

export class SkillTreeUI {
  private el: HTMLElement;
  private owned = new Set<NodeId>();
  private profile: UserProfile | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);z-index:150;overflow-y:auto';
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'flex';
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
    const fireTiers = [1,2,3,4,5,6,7];
    const utilityNodes = SKILL_NODES.filter(n => n.tree === 'utility');

    this.el.innerHTML = `
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&display=swap" rel="stylesheet">
      <div id="skill-tree-panel" style="
        background:#0f0b05;border:1px solid #3a2710;border-radius:2px;
        box-shadow:0 0 0 1px #1e1408,0 8px 40px #000000a0;
        padding:28px 24px 24px;max-width:720px;width:100%;margin:20px;
        font-family:'Cinzel',Georgia,serif;color:#c8a870;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <div style="font-family:'Cinzel Decorative',Cinzel,serif;font-size:1.3rem;color:#ddb84a;letter-spacing:0.14em">Sorceress Skills</div>
            <div style="font-size:0.62rem;color:#6a5228;letter-spacing:0.2em;text-transform:uppercase;margin-top:2px">Points Available: <span style="color:#90a870" id="pts-display">${pts}</span></div>
          </div>
          <div style="display:flex;gap:10px">
            <button id="skill-respec" style="padding:7px 14px;background:#2a1808;border:1px solid #5a3010;color:#c8a870;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.1em">Reset Skills</button>
            <button id="skill-close" style="padding:7px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.1em">Close</button>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:20px">
          ${this.renderTreeColumn('fire', fireTiers, pts)}
          <div style="opacity:0.3;cursor:not-allowed;flex:1">${this.renderLockedColumn('Lightning')}</div>
          <div style="opacity:0.3;cursor:not-allowed;flex:1">${this.renderLockedColumn('Frost')}</div>
        </div>

        <div style="border-top:1px solid #2a1e0c;padding-top:16px">
          <div style="font-size:0.58rem;letter-spacing:0.22em;color:#5a4420;text-transform:uppercase;text-align:center;margin-bottom:12px">Shared Utility</div>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            ${utilityNodes.map(n => this.renderNode(n, pts)).join('')}
          </div>
        </div>

        <div id="skill-tooltip" style="display:none;position:fixed;background:#1a1208;border:1px solid #3a2710;padding:10px 14px;border-radius:2px;max-width:220px;font-size:0.68rem;line-height:1.5;color:#c8a870;z-index:300;pointer-events:none"></div>
      </div>
    `;

    this.el.querySelector('#skill-close')!.addEventListener('click', () => this.hide());
    this.el.querySelector('#skill-respec')!.addEventListener('click', () => this.handleRespec());
    this.attachNodeListeners(pts);
  }

  private renderTreeColumn(tree: string, tiers: number[], pts: number): string {
    const nodes = SKILL_NODES.filter(n => n.tree === tree);
    const label = tree.charAt(0).toUpperCase() + tree.slice(1);
    let html = `<div style="flex:1">
      <div style="font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;
        padding:5px 0;border-bottom:1px solid;color:${tree === 'fire' ? '#d86030' : '#40b0d0'};
        border-color:${tree === 'fire' ? '#d8603030' : '#40b0d030'};text-align:center;margin-bottom:12px">${label}</div>`;
    for (const tier of tiers) {
      const tierNodes = nodes.filter(n => n.tier === tier);
      if (!tierNodes.length) continue;
      html += `<div style="font-size:0.44rem;letter-spacing:0.18em;color:#3a2810;text-transform:uppercase;text-align:center;margin-bottom:5px">Tier ${tier}</div>`;
      html += `<div style="display:flex;gap:6px;justify-content:center;margin-bottom:8px">`;
      for (const n of tierNodes) html += this.renderNode(n, pts);
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  private renderLockedColumn(label: string): string {
    return `<div style="flex:1">
      <div style="font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;
        padding:5px 0;border-bottom:1px solid #88888830;color:#888;text-align:center;margin-bottom:12px">${label}</div>
      <div style="text-align:center;font-size:0.58rem;color:#3a3020;margin-top:30px;letter-spacing:0.1em">Coming Soon</div>
    </div>`;
  }

  private renderNode(node: SkillNode, pts: number): string {
    const isOwned    = this.owned.has(node.id);
    const canBuy     = !isOwned && canUnlock(node.id, this.owned) && pts >= node.cost;
    const gateBlocked = !isOwned && !canUnlock(node.id, this.owned);

    const treeColors: Record<string, { border: string; glow: string; icon: string }> = {
      fire:    { border: isOwned ? '#e86020' : (canBuy ? '#903010' : '#3a1808'), glow: '#e8602040', icon: isOwned ? '#e87040' : (canBuy ? '#b04020' : '#3a1808') },
      utility: { border: isOwned ? '#e0a030' : (canBuy ? '#907020' : '#3a2808'), glow: '#e0a03040', icon: isOwned ? '#c89030' : (canBuy ? '#8a6020' : '#3a2808') },
    };
    const c = treeColors[node.tree] ?? treeColors.utility;
    const bgGrad = isOwned
      ? `radial-gradient(circle at 38% 38%, ${node.tree === 'fire' ? '#2a0c00' : '#1a1008'}, #0e0400)`
      : `radial-gradient(circle at 38% 38%, #160800, #0a0400)`;
    const outerRing = node.isSpell
      ? `box-shadow:0 0 0 3px ${isOwned ? '#0f0302' : '#0e0a00'},0 0 0 5px ${c.border}${isOwned ? '60' : '20'},0 0 ${isOwned ? '12px' : '4px'} ${c.glow};`
      : (isOwned ? `box-shadow:0 0 8px ${c.glow};` : '');
    const icon = NODE_ICONS[node.id] ?? 'fa-star';
    const size = node.isSpell ? '58px' : '50px';

    return `
      <div class="skill-node" data-id="${node.id}" data-owned="${isOwned}" data-canbuy="${canBuy}" style="
        display:flex;flex-direction:column;align-items:center;cursor:${gateBlocked ? 'default' : 'pointer'};
        opacity:${gateBlocked ? '0.3' : '1'};
      ">
        <div style="
          width:${size};height:${size};border-radius:50%;border:2px solid ${c.border};
          background:${bgGrad};display:flex;align-items:center;justify-content:center;
          transition:filter 0.14s,transform 0.14s;${outerRing}
        ">
          <i class="fa ${icon} fa-fw" style="color:${c.icon};font-size:${node.isSpell ? '1.25rem' : '1.05rem'}"></i>
        </div>
        <div style="font-size:${node.isSpell ? '0.62rem' : '0.56rem'};font-weight:${node.isSpell ? '600' : '400'};
          color:${node.tree === 'fire' ? (isOwned ? '#d86040' : '#7a3828') : (isOwned ? '#c09828' : '#6a5018')};
          text-align:center;max-width:66px;margin-top:4px;line-height:1.2">${node.name}</div>
        <div style="font-size:0.48rem;color:#4a3620;margin-top:2px;letter-spacing:0.08em">${isOwned ? 'Owned' : `${node.cost} pt${node.cost > 1 ? 's' : ''}`}</div>
      </div>
    `;
  }

  private attachNodeListeners(pts: number): void {
    const tooltip = this.el.querySelector('#skill-tooltip') as HTMLElement;

    this.el.querySelectorAll('.skill-node').forEach(el => {
      const id = el.getAttribute('data-id') as NodeId;
      const node = SKILL_NODES.find(n => n.id === id)!;

      el.addEventListener('mouseenter', e => {
        const canBuy = !this.owned.has(id) && canUnlock(id, this.owned) && pts >= node.cost;
        const gateBlocked = !this.owned.has(id) && !canUnlock(id, this.owned);
        tooltip.innerHTML = `
          <strong style="color:#ddb84a">${node.name}</strong><br>
          <span style="color:#c8a870">${node.description}</span><br>
          <span style="color:#7a6030;font-size:0.6rem">Cost: ${node.cost} pt${node.cost > 1 ? 's' : ''}</span>
          ${gateBlocked ? '<br><span style="color:#884020;font-size:0.6rem">Requirements not met</span>' : ''}
          ${canBuy ? '<br><span style="color:#60a840;font-size:0.6rem">Click to unlock</span>' : ''}
        `;
        tooltip.style.display = 'block';
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top  = `${me.clientY - 10}px`;
      });

      el.addEventListener('mousemove', e => {
        const me = e as MouseEvent;
        tooltip.style.left = `${me.clientX + 14}px`;
        tooltip.style.top  = `${me.clientY - 10}px`;
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.rpc('respec_skills', { p_user_id: user.id });
    if (error) { console.error('Respec failed:', error.message); return; }
    await this.reload();
  }
}
