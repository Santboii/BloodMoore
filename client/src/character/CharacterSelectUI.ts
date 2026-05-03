import { fetchCharacters, createCharacter, deleteCharacter } from '../supabase';
import type { CharacterRecord } from '@arena/shared';
import { MAX_CHARACTERS_PER_ACCOUNT, CHARACTER_CLASSES, xpToNextLevel } from '@arena/shared';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CLASS_ICONS: Record<string, string> = {
  mage: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="18" height="18"><path d="M335.656 19.53c-24.51.093-48.993 5.235-71.062 15.626-22.46 10.577-43.112 34.202-58.375 62.563-15.264 28.36-25.182 61.262-27.69 88.75-7.487 82.112-51.926 155.352-159.78 252.56l-.188 21.44C89.216 403.443 139.915 346.632 176.313 290l.063.03c-9.293 32.473-22.623 63.18-43.594 87.97-31.47 35.584-69.222 71.1-114.468 106.53l-.062 8.25 25 .064h.47l1.28-1.156c24.405-16.498 48.607-31.488 72.594-41.5l.187.187-46.436 42.5 28.937.063c48.372-41.685 94.714-90.58 129.626-137 33.587-44.658 56.02-87.312 60.688-116.844-1.268-2.32-2.552-4.628-3.656-7.094-18.833-42.06-4.273-96.424 40.218-116.063 32.73-14.45 74.854-3.165 90.438 31.344.15.333.324.634.47.97 13.302 24.062 6.175 49.48-9.345 61.97-7.866 6.328-18.442 9.528-28.75 6.56-10.31-2.966-19.043-11.772-24.5-25.124l17.28-7.062c3.992 9.764 8.667 13.15 12.375 14.22 3.708 1.066 7.767.148 11.875-3.158 8.216-6.61 14.282-21.91 4.406-39.03l-.28-.47-.22-.5c-10.7-24.82-41.96-33.333-66.22-22.625-34.063 15.037-45.594 58.052-30.686 91.345 20.527 45.846 77.97 61.177 122.375 40.875 60.157-27.5 80.13-103.328 53.094-161.813-24.737-53.503-81.41-82.484-138.908-83.843-1.633-.04-3.272-.07-4.906-.063zm-25.75 26.72c3.238.035 6.363.348 9.406.906 10.343 1.898 19.946 6.753 29.032 13.25-30.623-5.437-58.324 4.612-80.78 24.782-22.44 20.152-39.16 50.59-45.783 84.718-4.655-11.358-7.166-21.462-6.686-31.72.296-6.343 1.715-12.956 4.78-20.217 9.094-18.016 21.032-33.946 35.22-46.69 7.824-7.026 16.39-13.07 25.53-17.905 10.932-5.212 20.522-7.22 29.282-7.125zm122.938 62.313c22.583 13.167 34.365 41.86 32.937 70.656-.564 11.395-3.466 22.975-8.905 33.624-12.48 18.937-35.53 25.51-49.97 20.875l-.092-.25c27.943-10.365 39.18-32.377 40.312-55.19.124-2.5.115-4.994-.03-7.468 1.447-13.31-.412-28.793-5.47-43.437-2.244-6.496-5.15-12.89-8.844-18.72l.064-.093zm-135.563 1.312c-20.97 19.342-29.406 35.252-33.25 51.25-3.848 16.023-2.788 32.84-2.905 52.875-.14 23.79-2.56 51.542-18.438 85.688-.005.012-.025.018-.03.03-21.095 26.753-45.276 52.25-68.907 67.376l-.063-.03c64.195-71.545 68.527-114.792 68.75-153.19.112-19.197-1.253-37.594 3.438-57.124a98.095 98.095 0 0 1 2-7.125h.03c8.098-17.036 16.572-26.058 25.47-31.563 7.18-4.44 15.035-6.697 23.906-8.187z" fill="#a478e8"/></svg>`,
  amazon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="18" height="18"><path d="m257.313 15.688-50.375 87.53 28.156-8.53 22.28-38.72 22.407 38.782 28.126 8.47-50.594-87.532zm-138.938 77.75 18.5 99.28 14.156-22.093L141.595 120l48.97 17.313 23.124-10.157-95.313-33.72zm278.72 0-95.314 33.718 23.876 10.5L375.562 120l-9.812 52.688 12.844 20.03 18.5-99.28zm-139.72 2.03-9.344 2.844v104.47l9.69 11.343 9-10.5V98.28l-9.345-2.81zm81.22 52.032-54.345 63.688.344.28-14.563 17 12.033 14.063 71.093-83.343-4.75-7.375-9.812-4.312zm-161.25.53-8.595 3.782-5.47 8.532 255.5 299.469L433 447.688l-8.094-9.47 22.688-10.03 11.47-5.063-8.158-9.53-44.125-51.783-2.31-2.718-3.564-.47-49.562-6.655-174-203.94zm56.06 123.22-62.218 72.688-.125-.094-6.625 7.75-49.718 6.687-3.564.47-2.312 2.72-44.28 51.936-8.158 9.563 11.5 5.06 22.75 10.064-8.187 9.594 14.218 12.156L245.594 285.28l-12.188-14.03zm24.376 28.125-9.75 11.28v178.75h18.69v-15.092l24.874 7.437 12.03 3.594v-87l-2.374-2.656-34.53-38.47v-47.5l-8.94-10.343zm-111.5 73.5-42.936 50.375L86.906 416l33.844-39.688 25.53-3.437zm223.22.375 25.406 3.438 33.656 39.468-16.312 7.22-42.75-50.126zm-140.03 4.375-16.064 18.094-2.344 2.655v87.031l12.063-3.656 6.344-1.906v-102.22zm37.25 7.563 18.217 20.312v54.75l-18.218-5.438v-69.625zm-87.75 5.406-64.564 74.687 3.5 5.44 6.813 10.592 8.155-9.593 44.28-51.94 2.314-2.686-.064-3.563-.437-22.936zm157.905.156-.438 22.97-.093 3.53 2.312 2.72 44.125 51.75 8.19 9.592 6.78-10.625 3.53-5.5-64.405-74.437z" fill="#c8a870"/></svg>`,
};

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
.cs-char-class{font-family:'Cinzel',serif;font-size:10px;color:#7a5a20;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:6px;}
.cs-char-class svg{flex-shrink:0;}
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
.cs-class-option{padding:12px;background:rgba(4,4,12,0.9);border:1px solid rgba(40,28,6,0.8);color:#5a4a20;font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;border-radius:1px;text-align:center;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:8px;}
.cs-class-option svg{flex-shrink:0;}
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
          <div class="cs-char-class">${CLASS_ICONS[char.class] ?? ''} ${esc(char.class)}</div>
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
      return `<div class="cs-class-option ${activeClass} ${disabledClass}" data-class="${c.id}">${CLASS_ICONS[c.id] ?? ''} ${esc(c.label)}</div>`;
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
