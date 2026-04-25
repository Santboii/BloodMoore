import { fetchCharacters, createCharacter, deleteCharacter } from '../supabase';
import type { CharacterRecord } from '@arena/shared';
import { MAX_CHARACTERS_PER_ACCOUNT, CHARACTER_CLASSES, xpToNextLevel } from '@arena/shared';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type CharacterSelectCallbacks = {
  onSelectCharacter: (character: CharacterRecord) => void;
  onLogout: () => void;
};

const STYLES = `
.cs-overlay{position:fixed;inset:0;z-index:100;background:radial-gradient(ellipse at center,#1a0a04 0%,#0a0a12 60%,#050510 100%);}
.cs-ui{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 24px;font-family:'Crimson Text',Georgia,serif;color:#ccc;}
.cs-title{font-family:'Cinzel',serif;font-size:48px;font-weight:900;color:#c8860a;text-shadow:0 0 20px rgba(200,100,0,0.9),0 0 60px rgba(150,60,0,0.5),2px 2px 0 #3a1500;letter-spacing:8px;text-transform:uppercase;margin-bottom:4px;}
.cs-subtitle{font-family:'Cinzel',serif;font-size:13px;color:#7a5a20;letter-spacing:6px;text-transform:uppercase;margin-bottom:36px;}
.cs-divider{display:flex;align-items:center;gap:12px;width:100%;max-width:700px;margin-bottom:28px;}
.cs-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#5a3a10,transparent);}
.cs-divider-gem{width:10px;height:10px;background:#c8860a;transform:rotate(45deg);box-shadow:0 0 8px rgba(200,130,10,0.6);}
.cs-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%;max-width:700px;margin-bottom:24px;}
.cs-slot{background:linear-gradient(160deg,rgba(10,8,4,0.92),rgba(6,4,2,0.95));border:1px solid rgba(90,60,16,0.6);border-top:2px solid rgba(120,80,20,0.8);border-radius:2px;padding:20px;cursor:pointer;transition:all 0.15s;min-height:140px;display:flex;flex-direction:column;}
.cs-slot:hover{border-color:#c8860a;box-shadow:0 0 12px rgba(200,130,10,0.2);}
.cs-slot-empty{align-items:center;justify-content:center;border-style:dashed;border-top-style:dashed;}
.cs-slot-empty:hover{background:rgba(20,14,4,0.95);}
.cs-char-name{font-family:'Cinzel',serif;font-size:18px;color:#d4a840;margin-bottom:4px;}
.cs-char-class{font-family:'Cinzel',serif;font-size:10px;color:#7a5a20;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;}
.cs-char-level{font-size:13px;color:#8a7040;margin-bottom:8px;}
.cs-xp-bar{width:100%;height:6px;background:#1a1208;border:1px solid #3a2710;border-radius:1px;overflow:hidden;margin-bottom:8px;}
.cs-xp-fill{height:100%;background:linear-gradient(90deg,#c8860a,#e8a020);transition:width 0.3s;}
.cs-xp-text{font-size:10px;color:#5a4a20;margin-bottom:auto;}
.cs-slot-actions{display:flex;gap:8px;margin-top:12px;}
.cs-btn-select{flex:1;padding:8px;background:linear-gradient(180deg,#1a4010,#0e2808);color:#88dd44;border:1px solid #2a6010;font-family:'Cinzel',serif;font-size:11px;font-weight:700;letter-spacing:2px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.cs-btn-delete{padding:8px 12px;background:transparent;color:#884040;border:1px solid #3a1010;font-family:'Cinzel',serif;font-size:11px;cursor:pointer;border-radius:1px;}
.cs-btn-delete:hover{border-color:#cc2222;color:#cc4444;}
.cs-empty-text{font-family:'Cinzel',serif;font-size:13px;color:#3a2a08;letter-spacing:2px;}
.cs-empty-plus{font-size:32px;color:#5a3a10;margin-bottom:8px;}
.cs-create-panel{background:linear-gradient(160deg,rgba(10,8,4,0.92),rgba(6,4,2,0.95));border:1px solid rgba(90,60,16,0.6);border-top:2px solid rgba(120,80,20,0.8);border-radius:2px;padding:28px;width:100%;max-width:400px;}
.cs-label{font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;color:#7a5a20;text-transform:uppercase;margin-bottom:6px;}
.cs-input{width:100%;background:rgba(2,2,8,0.9);border:1px solid rgba(60,42,8,0.8);border-bottom:1px solid rgba(106,74,16,0.9);color:#e8c060;font-family:'Cinzel',serif;font-size:15px;padding:9px 12px;outline:none;letter-spacing:1px;margin-bottom:16px;border-radius:1px;box-sizing:border-box;}
.cs-input::placeholder{color:#3a2a08;}
.cs-input:focus{border-color:#c8860a;box-shadow:0 0 10px rgba(200,130,10,0.25);}
.cs-class-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:20px;}
.cs-class-option{padding:12px;background:rgba(4,4,12,0.9);border:1px solid rgba(40,28,6,0.8);color:#5a4a20;font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;border-radius:1px;text-align:center;transition:all 0.15s;}
.cs-class-option.active{background:rgba(22,14,0,0.95);border-color:#c8860a;color:#ffcc66;box-shadow:0 0 10px rgba(200,130,10,0.2);}
.cs-class-option.disabled{opacity:0.4;cursor:not-allowed;position:relative;}
.cs-class-option.disabled::after{content:'Coming Soon';position:absolute;top:50%;right:12px;transform:translateY(-50%);font-size:9px;color:#5a4010;}
.cs-btn-create{width:100%;padding:12px;background:linear-gradient(180deg,#7a1500,#4a0d00,#3a0800);color:#ffcc88;border:1px solid rgba(140,40,0,0.9);font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;cursor:pointer;border-radius:1px;}
.cs-btn-cancel{width:100%;padding:10px;background:transparent;border:1px solid #3a2710;color:#7a5a20;font-family:'Cinzel',serif;font-size:11px;letter-spacing:2px;cursor:pointer;border-radius:1px;margin-top:8px;}
.cs-error{color:#cc4444;font-size:12px;margin-bottom:12px;text-align:center;}
.cs-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:400;}
.cs-confirm-panel{background:linear-gradient(160deg,rgba(16,12,6,0.98),rgba(8,6,2,0.99));border:1px solid #5a3010;border-top:2px solid rgba(200,134,10,0.6);border-radius:2px;padding:28px 32px;max-width:380px;text-align:center;}
.cs-confirm-title{font-family:'Cinzel',serif;font-size:18px;color:#cc2222;letter-spacing:2px;margin-bottom:12px;}
.cs-confirm-text{font-size:14px;color:#c8a870;margin-bottom:16px;line-height:1.6;}
.cs-confirm-input{width:100%;background:rgba(2,2,8,0.9);border:1px solid rgba(60,42,8,0.8);color:#e8c060;font-family:'Cinzel',serif;font-size:14px;padding:9px 12px;outline:none;margin-bottom:16px;border-radius:1px;box-sizing:border-box;}
.cs-confirm-buttons{display:flex;gap:12px;justify-content:center;}
.cs-confirm-delete{padding:9px 24px;background:linear-gradient(180deg,#7a1500,#4a0d00);color:#ffcc88;border:1px solid rgba(140,40,0,0.9);font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:2px;cursor:pointer;border-radius:1px;text-transform:uppercase;opacity:0.4;pointer-events:none;}
.cs-confirm-delete.enabled{opacity:1;pointer-events:auto;}
.cs-confirm-cancel{padding:9px 24px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;font-family:'Cinzel',serif;font-size:12px;cursor:pointer;border-radius:1px;}
.cs-btn-logout{position:absolute;top:24px;right:24px;background:transparent;border:1px solid rgba(80,40,10,0.6);color:#5a3a10;font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;padding:6px 12px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.cs-btn-logout:hover{border-color:#cc2222;color:#cc6644;}
`;

export class CharacterSelectUI {
  private el: HTMLElement;
  private ui: HTMLElement;
  private characters: CharacterRecord[] = [];
  private showingCreate = false;

  constructor(container: HTMLElement, private cb: CharacterSelectCallbacks) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'cs-overlay';

    this.ui = document.createElement('div');
    this.ui.className = 'cs-ui';
    this.el.appendChild(this.ui);
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'block';
    this.showingCreate = false;
    this.characters = await fetchCharacters();
    this.render();
  }

  hide(): void { this.el.style.display = 'none'; }

  private render(): void {
    if (this.showingCreate) {
      this.renderCreateForm();
      return;
    }

    const slotsHtml = this.characters.map((char, i) => {
      const xpNeeded = xpToNextLevel(char.level);
      const xpPercent = xpNeeded > 0 ? Math.min(100, (char.xp / xpNeeded) * 100) : 0;
      return `
        <div class="cs-slot" data-index="${i}">
          <div class="cs-char-name">${esc(char.name)}</div>
          <div class="cs-char-class">${esc(char.class)}</div>
          <div class="cs-char-level">Level ${char.level}</div>
          <div class="cs-xp-bar"><div class="cs-xp-fill" style="width:${xpPercent}%"></div></div>
          <div class="cs-xp-text">${char.xp} / ${xpNeeded} XP</div>
          <div class="cs-slot-actions">
            <button class="cs-btn-select" data-index="${i}">Select</button>
            <button class="cs-btn-delete" data-index="${i}">Delete</button>
          </div>
        </div>`;
    }).join('');

    const emptySlots = Math.max(0, MAX_CHARACTERS_PER_ACCOUNT - this.characters.length);
    const emptySlotsHtml = Array.from({ length: emptySlots }, () => `
      <div class="cs-slot cs-slot-empty" data-action="create">
        <div class="cs-empty-plus">+</div>
        <div class="cs-empty-text">Create Character</div>
      </div>`).join('');

    this.ui.innerHTML = `
      <button class="cs-btn-logout" id="cs-logout">Sign Out</button>
      <div class="cs-title">Blood Moor</div>
      <div class="cs-subtitle">Choose Your Champion</div>
      <div class="cs-divider"><div class="cs-divider-line"></div><div class="cs-divider-gem"></div><div class="cs-divider-line"></div></div>
      <div class="cs-grid">
        ${slotsHtml}
        ${emptySlotsHtml}
      </div>`;

    this.ui.querySelector('#cs-logout')!.addEventListener('click', () => this.cb.onLogout());

    this.ui.querySelectorAll('.cs-btn-select').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.index!);
        this.cb.onSelectCharacter(this.characters[idx]);
      });
    });

    this.ui.querySelectorAll('.cs-btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.index!);
        this.showDeleteConfirm(this.characters[idx]);
      });
    });

    this.ui.querySelectorAll('[data-action="create"]').forEach(slot => {
      slot.addEventListener('click', () => {
        this.showingCreate = true;
        this.render();
      });
    });
  }

  private renderCreateForm(error = ''): void {
    const classOptions = CHARACTER_CLASSES.map(c => {
      const activeClass = c.id === 'mage' ? 'active' : '';
      const disabledClass = !c.enabled ? 'disabled' : '';
      return `<div class="cs-class-option ${activeClass} ${disabledClass}" data-class="${c.id}">${esc(c.label)}</div>`;
    }).join('');

    this.ui.innerHTML = `
      <div class="cs-title" style="font-size:36px">Blood Moor</div>
      <div class="cs-subtitle">Create a New Champion</div>
      <div class="cs-divider"><div class="cs-divider-line"></div><div class="cs-divider-gem"></div><div class="cs-divider-line"></div></div>
      <div class="cs-create-panel">
        ${error ? `<div class="cs-error">${esc(error)}</div>` : ''}
        <div class="cs-label">Character Name</div>
        <input id="cs-name" class="cs-input" type="text" placeholder="Name your champion..." maxlength="20">
        <div class="cs-label">Class</div>
        <div class="cs-class-grid">${classOptions}</div>
        <button id="cs-create-btn" class="cs-btn-create">Forge Champion</button>
        <button id="cs-cancel-btn" class="cs-btn-cancel">Cancel</button>
      </div>`;

    let selectedClass = 'mage';

    this.ui.querySelectorAll('.cs-class-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const cls = (opt as HTMLElement).dataset.class!;
        const config = CHARACTER_CLASSES.find(c => c.id === cls);
        if (!config?.enabled) return;
        this.ui.querySelectorAll('.cs-class-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedClass = cls;
      });
    });

    this.ui.querySelector('#cs-create-btn')!.addEventListener('click', async () => {
      const name = (this.ui.querySelector('#cs-name') as HTMLInputElement).value.trim();
      if (!name) { this.renderCreateForm('Name is required'); return; }
      if (name.length > 20) { this.renderCreateForm('Name must be 20 characters or less'); return; }
      const id = await createCharacter(name, selectedClass);
      if (!id) { this.renderCreateForm('Failed to create character. Name may already be taken.'); return; }
      this.showingCreate = false;
      this.characters = await fetchCharacters();
      this.render();
    });

    this.ui.querySelector('#cs-cancel-btn')!.addEventListener('click', () => {
      this.showingCreate = false;
      this.render();
    });
  }

  private showDeleteConfirm(character: CharacterRecord): void {
    const overlay = document.createElement('div');
    overlay.className = 'cs-confirm-overlay';
    overlay.innerHTML = `
      <div class="cs-confirm-panel">
        <div class="cs-confirm-title">Delete Character</div>
        <div class="cs-confirm-text">
          This will permanently delete <strong style="color:#d4a840">${esc(character.name)}</strong>
          and all their progress.<br><br>
          Type the character's name to confirm:
        </div>
        <input class="cs-confirm-input" id="cs-delete-input" type="text" placeholder="${esc(character.name)}">
        <div class="cs-confirm-buttons">
          <button class="cs-confirm-delete" id="cs-delete-confirm">Delete Forever</button>
          <button class="cs-confirm-cancel" id="cs-delete-cancel">Cancel</button>
        </div>
      </div>`;

    this.el.appendChild(overlay);

    const input = overlay.querySelector('#cs-delete-input') as HTMLInputElement;
    const confirmBtn = overlay.querySelector('#cs-delete-confirm') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('#cs-delete-cancel')!;

    input.addEventListener('input', () => {
      if (input.value === character.name) {
        confirmBtn.classList.add('enabled');
      } else {
        confirmBtn.classList.remove('enabled');
      }
    });

    confirmBtn.addEventListener('click', async () => {
      if (input.value !== character.name) return;
      const success = await deleteCharacter(character.id);
      overlay.remove();
      if (success) {
        this.characters = await fetchCharacters();
        this.render();
      }
    });

    cancelBtn.addEventListener('click', () => overlay.remove());
  }
}
