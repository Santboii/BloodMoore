export type LobbyCallbacks = {
  onCreateRoom: (displayName: string) => void;
  onJoinRoom: (roomId: string, displayName: string) => void;
  onReady: () => void;
  onRematch: () => void;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class LobbyUI {
  private el: HTMLElement;

  constructor(container: HTMLElement, private cb: LobbyCallbacks) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);z-index:100;font-family:sans-serif;color:#fff';
    container.appendChild(this.el);
    this.showHome();
  }

  showHome(): void {
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) { this.showJoin(roomId); return; }
    this.render(`
      <div style="text-align:center;max-width:320px">
        <h1 style="color:#ffaa00;margin-bottom:8px">ARENA</h1>
        <p style="color:#888;margin-bottom:24px">Fire Sorceress Duels</p>
        <input id="name-input" placeholder="Your name" style="width:100%;padding:10px;background:#1a1a2e;border:1px solid #555;color:#fff;border-radius:4px;margin-bottom:12px;font-size:14px">
        <button id="create-btn" style="width:100%;padding:12px;background:#c85000;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold">Create Room</button>
      </div>
    `);
    this.el.querySelector('#create-btn')!.addEventListener('click', () => {
      const name = (this.el.querySelector('#name-input') as HTMLInputElement).value.trim();
      if (name) this.cb.onCreateRoom(name);
    });
  }

  showJoin(roomId: string): void {
    this.render(`
      <div style="text-align:center;max-width:320px">
        <h1 style="color:#ffaa00;margin-bottom:8px">JOIN DUEL</h1>
        <p style="color:#888;margin-bottom:24px">Room: <code style="color:#aaa">${escapeHtml(roomId)}</code></p>
        <input id="name-input" placeholder="Your name" style="width:100%;padding:10px;background:#1a1a2e;border:1px solid #555;color:#fff;border-radius:4px;margin-bottom:12px;font-size:14px">
        <button id="join-btn" style="width:100%;padding:12px;background:#005080;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold">Join Room</button>
      </div>
    `);
    this.el.querySelector('#join-btn')!.addEventListener('click', () => {
      const name = (this.el.querySelector('#name-input') as HTMLInputElement).value.trim();
      if (name) this.cb.onJoinRoom(roomId, name);
    });
  }

  showWaiting(shareUrl: string): void {
    this.render(`
      <div style="text-align:center;max-width:360px">
        <h2 style="color:#ffaa00;margin-bottom:12px">Waiting for opponent...</h2>
        <p style="color:#888;margin-bottom:8px">Share this link:</p>
        <div style="background:#1a1a2e;padding:10px;border-radius:4px;word-break:break-all;color:#adf;font-size:12px;margin-bottom:16px">${escapeHtml(shareUrl)}</div>
        <button id="copy-btn" style="padding:8px 20px;background:#333;border:1px solid #555;color:#fff;border-radius:4px;cursor:pointer">Copy Link</button>
      </div>
    `);
    this.el.querySelector('#copy-btn')!.addEventListener('click', () => navigator.clipboard.writeText(shareUrl));
  }

  showReady(): void {
    this.render(`
      <div style="text-align:center">
        <h2 style="color:#ffaa00;margin-bottom:20px">Opponent joined!</h2>
        <button id="ready-btn" style="padding:14px 40px;background:#008800;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:16px;font-weight:bold">READY</button>
      </div>
    `);
    this.el.querySelector('#ready-btn')!.addEventListener('click', () => this.cb.onReady());
  }

  showResult(won: boolean, opponentName: string): void {
    const escapedName = escapeHtml(opponentName);
    this.render(`
      <div style="text-align:center">
        <h1 style="color:${won ? '#ffaa00' : '#cc2222'};margin-bottom:8px">${won ? 'VICTORY' : 'DEFEAT'}</h1>
        <p style="color:#888;margin-bottom:24px">${won ? `You defeated ${escapedName}` : `${escapedName} defeated you`}</p>
        <button id="rematch-btn" style="padding:12px 32px;background:#c85000;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:15px;font-weight:bold">Rematch</button>
      </div>
    `);
    this.el.querySelector('#rematch-btn')!.addEventListener('click', () => this.cb.onRematch());
  }

  showDisconnected(): void {
    this.render(`<div style="text-align:center"><h2 style="color:#cc2222">Opponent disconnected</h2><p style="color:#888;margin-top:8px">Refresh to start a new room</p></div>`);
  }

  hide(): void { this.el.style.display = 'none'; }
  show(): void { this.el.style.display = 'flex'; }

  private render(html: string): void {
    this.el.innerHTML = html;
  }
}
