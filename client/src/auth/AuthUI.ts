import { supabase } from '../supabase';

type AuthCallbacks = {
  onAuthed: (username: string, accessToken: string) => void;
  onShowLogin?: () => void;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class AuthUI {
  private el: HTMLElement;

  constructor(container: HTMLElement, private cb: AuthCallbacks) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#1a0a04 0%,#0a0a12 60%,#050510 100%);z-index:200;font-family:"Crimson Text",serif;color:#c8a870';
    container.appendChild(this.el);
    this.checkSession();
  }

  private async checkSession(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase.from('profiles').select('username').eq('user_id', session.user.id).single();
      if (profile) { this.cb.onAuthed(profile.username, session.access_token); return; }
    }
    this.showLogin();
  }

  private showLogin(error = ''): void {
    this.el.innerHTML = `
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center bottom,rgba(255,80,0,0.06),transparent 60%);pointer-events:none"></div>
      <div style="text-align:center;max-width:300px;width:100%;padding:24px;position:relative;z-index:1">
        <h1 style="font-family:'Cinzel',serif;font-weight:900;font-size:2.2rem;color:#ddb84a;letter-spacing:0.25em;text-shadow:0 0 60px rgba(255,100,0,0.4),0 2px 4px rgba(0,0,0,0.8);margin-bottom:2px">BLOODMOOR</h1>
        <p style="font-family:'Cinzel',serif;font-size:0.6rem;color:#7a5a28;letter-spacing:0.5em;text-transform:uppercase;margin-bottom:6px">Arena PvP</p>
        <p style="font-family:'Crimson Text',serif;font-style:italic;color:#4a3a20;font-size:0.75rem;letter-spacing:0.1em;margin-bottom:36px">Enter the blood-soaked arena</p>
        <div style="width:120px;height:1px;background:linear-gradient(90deg,transparent,#3a2710,transparent);margin:0 auto 28px;position:relative">
          <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:0.5rem;color:#c8860a;background:#0e0804;padding:0 8px">◆</span>
        </div>
        ${error ? `<p style="color:#cc4444;font-size:0.8rem;margin-bottom:16px">${esc(error)}</p>` : ''}
        <div style="margin-bottom:10px">
          <span style="display:block;font-family:'Cinzel',serif;font-size:0.6rem;color:#4a3a20;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;text-align:left">Email</span>
          <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:11px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;font-family:'Crimson Text',serif;font-size:0.85rem;outline:none">
        </div>
        <div style="margin-bottom:12px">
          <span style="display:block;font-family:'Cinzel',serif;font-size:0.6rem;color:#4a3a20;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;text-align:left">Password</span>
          <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:11px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;font-family:'Crimson Text',serif;font-size:0.85rem;outline:none">
        </div>
        <button id="auth-signin" style="width:100%;padding:13px;background:linear-gradient(180deg,#c85000,#8a2200);border:none;color:#ffcc88;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.85rem;font-weight:700;letter-spacing:0.2em;margin-bottom:12px;text-shadow:0 1px 3px rgba(0,0,0,0.7);box-shadow:0 2px 16px rgba(200,80,0,0.25),inset 0 1px 0 rgba(255,200,100,0.15)">ENTER THE ARENA</button>
        <button id="auth-register" style="width:100%;padding:11px;background:transparent;border:1px solid #2a1f10;color:#5a4a28;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.7rem;letter-spacing:0.1em">Create Account</button>
      </div>
    `;
    this.el.querySelector('#auth-signin')!.addEventListener('click', () => this.handleSignIn());
    this.el.querySelector('#auth-register')!.addEventListener('click', () => this.showRegister());
    this.el.querySelectorAll('input').forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = '#c8860a';
        input.style.boxShadow = '0 0 8px rgba(200,134,10,0.15)';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#3a2710';
        input.style.boxShadow = 'none';
      });
    });
    this.cb.onShowLogin?.();
  }

  private showRegister(error = ''): void {
    this.el.innerHTML = `
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at center bottom,rgba(255,80,0,0.06),transparent 60%);pointer-events:none"></div>
      <div style="text-align:center;max-width:300px;width:100%;padding:24px;position:relative;z-index:1">
        <h1 style="font-family:'Cinzel',serif;font-weight:900;font-size:1.8rem;color:#ddb84a;letter-spacing:0.25em;text-shadow:0 0 60px rgba(255,100,0,0.4),0 2px 4px rgba(0,0,0,0.8);margin-bottom:6px">CREATE ACCOUNT</h1>
        <p style="font-family:'Crimson Text',serif;font-style:italic;color:#4a3a20;font-size:0.75rem;letter-spacing:0.1em;margin-bottom:28px">Join the arena</p>
        <div style="width:120px;height:1px;background:linear-gradient(90deg,transparent,#3a2710,transparent);margin:0 auto 24px;position:relative">
          <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:0.5rem;color:#c8860a;background:#0e0804;padding:0 8px">◆</span>
        </div>
        ${error ? `<p style="color:#cc4444;font-size:0.8rem;margin-bottom:16px">${esc(error)}</p>` : ''}
        <div style="margin-bottom:10px">
          <span style="display:block;font-family:'Cinzel',serif;font-size:0.6rem;color:#4a3a20;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;text-align:left">Username</span>
          <input id="auth-username" placeholder="Username" style="width:100%;padding:11px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;font-family:'Crimson Text',serif;font-size:0.85rem;outline:none">
        </div>
        <div style="margin-bottom:10px">
          <span style="display:block;font-family:'Cinzel',serif;font-size:0.6rem;color:#4a3a20;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;text-align:left">Email</span>
          <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:11px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;font-family:'Crimson Text',serif;font-size:0.85rem;outline:none">
        </div>
        <div style="margin-bottom:12px">
          <span style="display:block;font-family:'Cinzel',serif;font-size:0.6rem;color:#4a3a20;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:4px;text-align:left">Password</span>
          <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:11px 14px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;font-family:'Crimson Text',serif;font-size:0.85rem;outline:none">
        </div>
        <button id="auth-submit" style="width:100%;padding:13px;background:linear-gradient(180deg,#c85000,#8a2200);border:none;color:#ffcc88;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.85rem;font-weight:700;letter-spacing:0.2em;margin-bottom:12px;text-shadow:0 1px 3px rgba(0,0,0,0.7);box-shadow:0 2px 16px rgba(200,80,0,0.25),inset 0 1px 0 rgba(255,200,100,0.15)">FORGE YOUR LEGACY</button>
        <button id="auth-back" style="width:100%;padding:11px;background:transparent;border:1px solid #2a1f10;color:#5a4a28;border-radius:2px;cursor:pointer;font-family:'Cinzel',serif;font-size:0.7rem;letter-spacing:0.1em">Back</button>
      </div>
    `;
    this.el.querySelector('#auth-submit')!.addEventListener('click', () => this.handleRegister());
    this.el.querySelector('#auth-back')!.addEventListener('click', () => this.showLogin());
    this.el.querySelectorAll('input').forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = '#c8860a';
        input.style.boxShadow = '0 0 8px rgba(200,134,10,0.15)';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#3a2710';
        input.style.boxShadow = 'none';
      });
    });
  }

  private async handleSignIn(): Promise<void> {
    const email    = (this.el.querySelector('#auth-email') as HTMLInputElement).value.trim();
    const password = (this.el.querySelector('#auth-password') as HTMLInputElement).value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) { this.showLogin(error?.message ?? 'Sign in failed'); return; }
    const { data: profile } = await supabase.from('profiles').select('username').eq('user_id', data.user.id).single();
    this.cb.onAuthed(profile?.username ?? email, data.session.access_token);
  }

  private async handleRegister(): Promise<void> {
    const username = (this.el.querySelector('#auth-username') as HTMLInputElement).value.trim();
    const email    = (this.el.querySelector('#auth-email') as HTMLInputElement).value.trim();
    const password = (this.el.querySelector('#auth-password') as HTMLInputElement).value;
    if (!username) { this.showRegister('Username is required'); return; }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } },
    });
    if (error || !data.session) { this.showRegister(error?.message ?? 'Registration failed'); return; }
    this.cb.onAuthed(username, data.session.access_token);
  }

  hide(): void { this.el.style.display = 'none'; }
  show(): void { this.el.style.display = 'flex'; }
}
