# Skill Tree UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal-style skill tree overlay with a full-screen dedicated view featuring connected node layout, clear owned/locked visual distinction, and proper scrolling.

**Architecture:** Single-file rewrite of `client/src/skills/SkillTreeUI.ts`. The view uses a `STYLES` constant (CSS class-based, like `LobbyUI`), positions nodes on a coordinate grid, and draws SVG connection lines derived from the exported `GATES` data in `shared/src/skills.ts`. One preliminary task exports `GATES` from shared since the UI needs it for connection lines.

**Tech Stack:** TypeScript, DOM manipulation (no framework), inline SVG for connection lines, Supabase RPCs for unlock/respec (unchanged).

**Spec:** `docs/superpowers/specs/2026-04-19-skill-tree-ui-redesign.md`

---

### Task 1: Export GATES from shared

**Files:**
- Modify: `shared/src/skills.ts:21-37`

The `GATES` object and `Gate` type are currently private. The UI needs them to derive connection lines.

- [ ] **Step 1: Export Gate type and GATES object**

In `shared/src/skills.ts`, change:

```typescript
type Gate = { requiresAll?: NodeId[]; requiresAny?: NodeId[] };

const GATES: Partial<Record<NodeId, Gate>> = {
```

to:

```typescript
export type Gate = { requiresAll?: NodeId[]; requiresAny?: NodeId[] };

export const GATES: Partial<Record<NodeId, Gate>> = {
```

- [ ] **Step 2: Verify build**

Run: `cd client && npx tsc --noEmit`
Expected: Clean (no errors). Existing consumers are unaffected — we only added exports.

- [ ] **Step 3: Commit**

```bash
git add shared/src/skills.ts
git commit -m "refactor: export Gate type and GATES from shared skills"
```

---

### Task 2: Rewrite SkillTreeUI — CSS, layout, and full-screen view structure

**Files:**
- Rewrite: `client/src/skills/SkillTreeUI.ts`

**Reference files (read but don't modify):**
- `client/src/lobby/LobbyUI.ts` — reference for STYLES constant pattern, divider markup, button styles
- `shared/src/skills.ts` — `SKILL_NODES`, `GATES`, `canUnlock`, `NodeId`, `SkillNode`, `Gate`
- `client/src/supabase.ts` — `supabase`, `fetchProfile`, `UserProfile`

This task replaces the entire `SkillTreeUI.ts` file. The new version has: a `STYLES` constant with all CSS classes, a full-screen view (not a centered modal), a header bar, the fire tree with positioned nodes and SVG connection lines, a utility strip, and tooltips.

- [ ] **Step 1: Write the STYLES constant and NODE_ICONS map**

Replace the entire file. Start with imports, the icon map, and the CSS:

```typescript
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

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;700;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');

.st-overlay{position:fixed;inset:0;z-index:150;background:#0a0704;overflow-y:auto;}
.st-vignette{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 80% at 50% 40%,transparent 30%,rgba(0,0,0,0.7) 100%);}
.st-ui{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:28px 24px 48px;font-family:'Crimson Text',Georgia,serif;color:#c8a870;}

.st-header{display:flex;justify-content:space-between;align-items:center;width:100%;max-width:600px;margin-bottom:28px;}
.st-title{font-family:'Cinzel Decorative',Cinzel,serif;font-size:1.3rem;font-weight:700;color:#ddb84a;letter-spacing:0.14em;}
.st-points{font-family:'Cinzel',serif;font-size:0.68rem;color:#6a5228;letter-spacing:0.15em;text-transform:uppercase;}
.st-points b{color:#90a870;}
.st-header-buttons{display:flex;gap:10px;}
.st-btn{padding:7px 14px;background:#2a1808;border:1px solid #5a3010;color:#c8a870;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.1em;transition:border-color 0.15s;}
.st-btn:hover{border-color:#c8860a;}
.st-btn-close{background:#1a1208;border-color:#3a2710;}

.st-tree-container{position:relative;width:100%;max-width:600px;}
.st-tree-svg{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;}
.st-tree-label{font-family:'Cinzel',serif;font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:700;color:#d86030;text-align:center;margin-bottom:16px;padding-bottom:6px;border-bottom:1px solid rgba(216,96,48,0.2);}

.st-tier{display:flex;justify-content:center;gap:32px;margin-bottom:16px;position:relative;z-index:1;}

.st-node{display:flex;flex-direction:column;align-items:center;cursor:pointer;transition:opacity 0.15s;}
.st-node[data-state="locked"]{cursor:default;}
.st-node-circle{border-radius:50%;display:flex;align-items:center;justify-content:center;transition:filter 0.14s,transform 0.14s;}
.st-node-circle:hover{transform:scale(1.08);}
.st-node[data-state="locked"] .st-node-circle:hover{transform:none;}

.st-node-spell{width:58px;height:58px;}
.st-node-mod{width:44px;height:44px;}

.st-node-owned .st-node-circle{border:2.5px solid #e86020;background:radial-gradient(circle at 38% 38%,#2a0c00,#0e0400);}
.st-node-owned.st-node-is-spell .st-node-circle{box-shadow:0 0 12px rgba(232,96,32,0.25);}
.st-node-owned .st-node-icon{color:#e87040;}
.st-node-owned .st-node-name{color:#d86040;}
.st-node-owned .st-node-cost{color:#d86040;}

.st-node-purchasable .st-node-circle{border:2px dashed #c8860a;background:radial-gradient(circle at 38% 38%,#160800,#0a0400);}
.st-node-purchasable .st-node-icon{color:#c8860a;}
.st-node-purchasable .st-node-name{color:#c8860a;}
.st-node-purchasable .st-node-cost{color:#c8860a;}

.st-node-locked .st-node-circle{border:1.5px solid #444;background:#151515;}
.st-node-locked .st-node-icon{color:#555;}
.st-node-locked .st-node-name{color:#555;}
.st-node-locked .st-node-cost{color:#444;}

.st-node-icon{font-size:1.05rem;transition:color 0.15s;}
.st-node-is-spell .st-node-icon{font-size:1.25rem;}
.st-node-name{font-family:'Cinzel',serif;font-size:0.56rem;font-weight:400;text-align:center;max-width:72px;margin-top:5px;line-height:1.2;transition:color 0.15s;}
.st-node-is-spell .st-node-name{font-size:0.62rem;font-weight:600;}
.st-node-cost{font-size:0.48rem;margin-top:2px;letter-spacing:0.08em;transition:color 0.15s;}

.st-divider{display:flex;align-items:center;gap:12px;width:100%;max-width:600px;margin:28px 0;}
.st-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#5a3a10,transparent);}
.st-divider-gem{width:10px;height:10px;background:#c8860a;transform:rotate(45deg);box-shadow:0 0 8px rgba(200,130,10,0.6);}

.st-util-label{font-family:'Cinzel',serif;font-size:0.58rem;letter-spacing:0.22em;color:#5a4420;text-transform:uppercase;text-align:center;margin-bottom:16px;}
.st-util-container{position:relative;width:100%;max-width:600px;}
.st-util-svg{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;}
.st-util-row{display:flex;justify-content:center;gap:24px;position:relative;z-index:1;}
.st-util-col{display:flex;flex-direction:column;align-items:center;gap:12px;}

.st-tooltip{display:none;position:fixed;background:#1a1208;border:1px solid #3a2710;padding:10px 14px;border-radius:2px;max-width:220px;font-size:0.68rem;line-height:1.5;color:#c8a870;z-index:300;pointer-events:none;}
`;
```

- [ ] **Step 2: Write the node position map**

The fire tree needs hardcoded x,y positions for each node so SVG lines can connect them. Positions are percentages of the container width (x) and fixed pixel offsets (y). Add this below the STYLES constant:

```typescript
type NodePos = { x: number; y: number };

const FIRE_POSITIONS: Record<string, NodePos> = {
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

const UTIL_POSITIONS: Record<string, NodePos> = {
  'utility.teleport':      { x: 15, y: 0 },
  'utility.phase_shift':   { x: 45, y: -20 },
  'utility.ethereal_form': { x: 45, y: 20 },
  'utility.phantom_step':  { x: 80, y: 0 },
};
```

- [ ] **Step 3: Write the SkillTreeUI class — constructor, show, hide, reload**

```typescript
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
    this.el.style.display = 'none';
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = '';
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
```

- [ ] **Step 4: Write the render() method — header, fire tree, divider, utility strip, tooltip**

```typescript
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
          </div>
          <div class="st-points">Points Available: <b id="st-pts">${pts}</b></div>
          <div class="st-header-buttons">
            <button id="st-respec" class="st-btn">Reset Skills</button>
            <button id="st-close" class="st-btn st-btn-close">Back to Lobby</button>
          </div>
        </div>

        <div class="st-tree-label">Fire</div>
        <div class="st-tree-container" id="st-fire-tree" style="height:600px">
          <svg class="st-tree-svg" id="st-fire-svg"></svg>
          ${fireNodes.map(n => this.renderNode(n, pts, FIRE_POSITIONS[n.id])).join('')}
        </div>

        <div class="st-divider"><div class="st-divider-line"></div><div class="st-divider-gem"></div><div class="st-divider-line"></div></div>

        <div class="st-util-label">Shared Utility</div>
        <div class="st-util-container" id="st-util-tree" style="height:80px">
          <svg class="st-util-svg" id="st-util-svg"></svg>
          ${utilNodes.map(n => this.renderNode(n, pts, UTIL_POSITIONS[n.id])).join('')}
        </div>

        <div class="st-tooltip" id="st-tooltip"></div>
      </div>
    `;

    this.el.querySelector('#st-close')!.addEventListener('click', () => this.hide());
    this.el.querySelector('#st-respec')!.addEventListener('click', () => this.handleRespec());
    this.drawConnections('st-fire-svg', FIRE_POSITIONS, fireNodes, pts);
    this.drawConnections('st-util-svg', UTIL_POSITIONS, utilNodes, pts);
    this.attachNodeListeners(pts);
  }
```

- [ ] **Step 5: Write renderNode() — positioned node element**

```typescript
  private renderNode(node: SkillNode, pts: number, pos: NodePos | undefined): string {
    if (!pos) return '';
    const isOwned = this.owned.has(node.id);
    const canBuy = !isOwned && canUnlock(node.id, this.owned) && pts >= node.cost;
    const gateBlocked = !isOwned && !canUnlock(node.id, this.owned);

    const stateClass = isOwned ? 'st-node-owned' : (canBuy ? 'st-node-purchasable' : 'st-node-locked');
    const sizeClass = node.isSpell ? 'st-node-spell' : 'st-node-mod';
    const spellClass = node.isSpell ? 'st-node-is-spell' : '';
    const state = isOwned ? 'owned' : (canBuy ? 'purchasable' : 'locked');
    const icon = NODE_ICONS[node.id] ?? 'fa-star';
    const costText = isOwned ? 'Owned' : `${node.cost} pt${node.cost > 1 ? 's' : ''}`;

    return `
      <div class="st-node ${stateClass} ${spellClass}" data-id="${node.id}" data-state="${state}" style="
        position:absolute;left:${pos.x}%;top:${pos.y}px;transform:translateX(-50%);
      ">
        <div class="st-node-circle ${sizeClass}">
          <i class="fa ${icon} fa-fw st-node-icon"></i>
        </div>
        <div class="st-node-name">${node.name}</div>
        <div class="st-node-cost">${costText}</div>
      </div>
    `;
  }
```

- [ ] **Step 6: Write drawConnections() — SVG lines between nodes based on GATES**

```typescript
  private drawConnections(svgId: string, positions: Record<string, NodePos>, nodes: SkillNode[], pts: number): void {
    const svg = this.el.querySelector(`#${svgId}`);
    if (!svg) return;

    const lines: string[] = [];
    for (const node of nodes) {
      const gate = GATES[node.id];
      if (!gate) continue;
      const childPos = positions[node.id];
      if (!childPos) continue;

      const isOwned = this.owned.has(node.id);
      const canBuy = !isOwned && canUnlock(node.id, this.owned) && pts >= node.cost;

      let stroke: string;
      let opacity: number;
      let width: number;
      if (isOwned) { stroke = '#e86020'; opacity = 0.6; width = 2; }
      else if (canBuy) { stroke = '#c8860a'; opacity = 0.4; width = 2; }
      else { stroke = '#333'; opacity = 0.3; width = 1.5; }

      const allParents = gate.requiresAll ?? [];
      for (const parentId of allParents) {
        const parentPos = positions[parentId];
        if (!parentPos) continue;
        lines.push(`<line x1="${parentPos.x}%" y1="${parentPos.y + 30}" x2="${childPos.x}%" y2="${childPos.y}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}"/>`);
      }

      const anyParents = gate.requiresAny ?? [];
      for (const parentId of anyParents) {
        const parentPos = positions[parentId];
        if (!parentPos) continue;
        lines.push(`<line x1="${parentPos.x}%" y1="${parentPos.y + 30}" x2="${childPos.x}%" y2="${childPos.y}" stroke="${stroke}" stroke-width="${Math.max(1, width - 1)}" opacity="${opacity * 0.7}" stroke-dasharray="4 3"/>`);
      }
    }
    svg.innerHTML = lines.join('');
  }
```

- [ ] **Step 7: Write attachNodeListeners() — tooltip and click handlers**

```typescript
  private attachNodeListeners(pts: number): void {
    const tooltip = this.el.querySelector('#st-tooltip') as HTMLElement;

    this.el.querySelectorAll('.st-node').forEach(el => {
      const id = el.getAttribute('data-id') as NodeId;
      const node = SKILL_NODES.find(n => n.id === id)!;

      el.addEventListener('mouseenter', e => {
        const isOwned = this.owned.has(id);
        const canBuy = !isOwned && canUnlock(id, this.owned) && pts >= node.cost;
        const gateBlocked = !isOwned && !canUnlock(id, this.owned);

        let statusHtml = '';
        if (canBuy) {
          statusHtml = '<span style="color:#60a840;font-size:0.6rem">Click to unlock</span>';
        } else if (gateBlocked) {
          const gate = GATES[id];
          const missingNames: string[] = [];
          for (const r of (gate?.requiresAll ?? [])) {
            if (!this.owned.has(r)) missingNames.push(SKILL_NODES.find(n => n.id === r)?.name ?? r);
          }
          if (gate?.requiresAny && gate.requiresAny.every(r => !this.owned.has(r))) {
            const anyNames = gate.requiresAny.map(r => SKILL_NODES.find(n => n.id === r)?.name ?? r);
            missingNames.push(`one of: ${anyNames.join(', ')}`);
          }
          statusHtml = `<span style="color:#884020;font-size:0.6rem">Requires: ${esc(missingNames.join(', '))}</span>`;
        }

        tooltip.innerHTML = `
          <strong style="color:#ddb84a">${esc(node.name)}</strong><br>
          <span style="color:#c8a870">${esc(node.description)}</span><br>
          <span style="color:#7a6030;font-size:0.6rem">Cost: ${node.cost} pt${node.cost > 1 ? 's' : ''}</span>
          ${statusHtml ? '<br>' + statusHtml : ''}
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
```

- [ ] **Step 8: Write handleUnlock() and handleRespec() — Supabase RPC calls**

```typescript
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
```

- [ ] **Step 9: Verify build**

Run: `cd client && npx tsc --noEmit`
Expected: Clean (no errors).

- [ ] **Step 10: Commit**

```bash
git add client/src/skills/SkillTreeUI.ts
git commit -m "feat: rewrite SkillTreeUI — full-screen view, connected tree, clear node states"
```

---

### Task 3: Visual smoke test

**Files:** None (manual browser testing)

This task cannot be automated — it requires a human to open the game in a browser and verify the skill tree visually.

- [ ] **Step 1: Start the dev server**

Run from the worktree root:
```bash
npm run dev
```

- [ ] **Step 2: Open the game and navigate to the skill tree**

1. Open browser to the dev server URL
2. Log in (or auto-session)
3. Click "Skills" button on the lobby home screen

- [ ] **Step 3: Verify layout**

Check:
- Full-screen view (no Blood Moor visible behind)
- Dark background with subtle vignette
- Header bar with title, points, Reset/Back buttons
- Fire tree with nodes positioned in a diamond/tree pattern
- Utility strip below a divider
- Natural scrolling if the tree exceeds viewport height

- [ ] **Step 4: Verify node visual states**

Check:
- Owned nodes: vivid orange-red borders, warm fill, bright icons
- Purchasable nodes: gold dashed borders, gold icons
- Locked nodes: fully grayscale — gray borders, gray fill, gray icons
- Spells are larger (58px) than modifiers (44px)
- Spells with glow ring when owned

- [ ] **Step 5: Verify connection lines**

Check:
- SVG lines connect parent → child nodes
- Lines to owned nodes: bright orange
- Lines to purchasable nodes: gold
- Lines to locked nodes: dim gray
- `requiresAny` lines are dashed and thinner than `requiresAll` lines

- [ ] **Step 6: Verify interactions**

Check:
- Hover shows tooltip with name, description, cost, status
- Locked nodes show "Requires: X" in red
- Purchasable nodes show "Click to unlock" in green
- Clicking a purchasable node unlocks it (node changes to owned state)
- Points counter decrements
- "Reset Skills" shows confirm dialog, then resets all nodes
- "Back to Lobby" returns to lobby view

- [ ] **Step 7: Check no console errors**

Open browser dev tools console. Should be clean (no errors during any interaction).
