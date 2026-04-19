import { supabase } from '../supabase.ts';

type AuthCallbacks = {
  onAuthed: (username: string, accessToken: string) => void;
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class AuthUI {
  private el: HTMLElement;

  constructor(container: HTMLElement, private cb: AuthCallbacks) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);z-index:200;font-family:serif;color:#c8a870';
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
      <div style="text-align:center;max-width:320px;width:100%;padding:24px">
        <h1 style="color:#ddb84a;font-size:1.6rem;letter-spacing:0.15em;margin-bottom:4px">ARENA</h1>
        <p style="color:#6a5228;font-size:0.7rem;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:28px">Sign in to continue</p>
        ${error ? `<p style="color:#cc4444;font-size:0.75rem;margin-bottom:12px">${esc(error)}</p>` : ''}
        <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:8px;font-family:serif">
        <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:12px;font-family:serif">
        <button id="auth-signin" style="width:100%;padding:11px;background:#c85000;border:none;color:#fff;border-radius:2px;cursor:pointer;font-family:serif;letter-spacing:0.1em;margin-bottom:8px">Sign In</button>
        <button id="auth-register" style="width:100%;padding:11px;background:#333;border:1px solid #555;color:#c8a870;border-radius:2px;cursor:pointer;font-family:serif;letter-spacing:0.1em">Create Account</button>
      </div>
    `;
    this.el.querySelector('#auth-signin')!.addEventListener('click', () => this.handleSignIn());
    this.el.querySelector('#auth-register')!.addEventListener('click', () => this.showRegister());
  }

  private showRegister(error = ''): void {
    this.el.innerHTML = `
      <div style="text-align:center;max-width:320px;width:100%;padding:24px">
        <h1 style="color:#ddb84a;font-size:1.6rem;letter-spacing:0.15em;margin-bottom:28px">Create Account</h1>
        ${error ? `<p style="color:#cc4444;font-size:0.75rem;margin-bottom:12px">${esc(error)}</p>` : ''}
        <input id="auth-username" placeholder="Username" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:8px;font-family:serif">
        <input id="auth-email" type="email" placeholder="Email" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:8px;font-family:serif">
        <input id="auth-password" type="password" placeholder="Password" style="width:100%;padding:10px;background:#1a1208;border:1px solid #3a2710;color:#c8a870;border-radius:2px;margin-bottom:12px;font-family:serif">
        <button id="auth-submit" style="width:100%;padding:11px;background:#c85000;border:none;color:#fff;border-radius:2px;cursor:pointer;font-family:serif;letter-spacing:0.1em;margin-bottom:8px">Register</button>
        <button id="auth-back" style="width:100%;padding:11px;background:#333;border:1px solid #555;color:#c8a870;border-radius:2px;cursor:pointer;font-family:serif">Back</button>
      </div>
    `;
    this.el.querySelector('#auth-submit')!.addEventListener('click', () => this.handleRegister());
    this.el.querySelector('#auth-back')!.addEventListener('click', () => this.showLogin());
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
