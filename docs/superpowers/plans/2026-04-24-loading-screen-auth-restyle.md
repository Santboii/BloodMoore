# Loading Screen & Auth Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fireball-orb loading screen during asset loading and restyle the auth screen with an atmospheric dark fantasy aesthetic.

**Architecture:** New `LoadingScreen` class injects into the existing `#ui-overlay` DOM overlay at z-index 300 (above auth at 200). It shows immediately and fades out when `AssetLoader.load()` resolves, revealing the restyled auth screen underneath. Auth screen gets atmospheric radial-gradient background, Bloodmoor branding, and fire-themed buttons. No logic changes — purely visual/DOM.

**Tech Stack:** TypeScript, DOM manipulation, CSS animations (inline `<style>` blocks, same pattern as existing LobbyUI/AuthUI)

---

### Task 1: Update Google Fonts Import

**Files:**
- Modify: `client/index.html:9`

The spec requires Cinzel weight 900 and Crimson Text italic, which aren't currently loaded.

- [ ] **Step 1: Update the font import link**

In `client/index.html`, replace line 9:

```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&display=swap" rel="stylesheet">
```

with:

```html
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Cinzel+Decorative:wght@700&family=Crimson+Text:ital@0;1&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "feat: add Cinzel 900 and Crimson Text italic font imports"
```

---

### Task 2: Create LoadingScreen Class

**Files:**
- Create: `client/src/loading/LoadingScreen.ts`

- [ ] **Step 1: Create the loading directory**

```bash
mkdir -p client/src/loading
```

- [ ] **Step 2: Write LoadingScreen.ts**

Create `client/src/loading/LoadingScreen.ts` with this content:

```typescript
export class LoadingScreen {
  private el: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:#0a0a12;z-index:300;font-family:"Cinzel",serif;transition:opacity 0.6s ease;';

    this.el.innerHTML = `
      <style>
        @keyframes ls-fillOrb {
          0%   { height: 0;     border-radius: 0 0 55px 55px; }
          50%  { height: 110px; border-radius: 55px; }
          70%  { height: 110px; border-radius: 55px; }
          100% { height: 0;     border-radius: 0 0 55px 55px; }
        }
        @keyframes ls-shimmer {
          0%   { opacity: 0.5; }
          100% { opacity: 1; }
        }
        @keyframes ls-emberFloat {
          0%   { bottom: 40%; opacity: 1; transform: scale(1); }
          100% { bottom: 90%; opacity: 0; transform: scale(0.3) translateX(10px); }
        }
        @keyframes ls-pulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
      </style>

      <div style="color:#ddb84a;font-size:2rem;font-weight:900;letter-spacing:0.2em;
                  text-shadow:0 0 30px rgba(200,100,0,0.3);margin-bottom:2px">
        BLOODMOOR
      </div>
      <div style="font-size:0.65rem;color:#6a5228;letter-spacing:0.3em;text-transform:uppercase;
                  margin-bottom:24px">
        Arena PvP
      </div>

      <div style="position:relative;width:120px;height:120px;margin-bottom:24px">
        <!-- Outer ring -->
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #3a2710;
                    box-shadow:0 0 20px rgba(200,100,0,0.1)"></div>
        <!-- Fire fill -->
        <div style="position:absolute;bottom:5px;left:50%;width:110px;height:0;transform:translateX(-50%);
                    background:radial-gradient(ellipse at center bottom,#ff6600,#cc3300 40%,#661100 80%);
                    animation:ls-fillOrb 3s ease-in-out infinite;overflow:hidden">
          <div style="position:absolute;inset:0;
                      background:radial-gradient(circle at 40% 30%,rgba(255,200,50,0.4),transparent 60%);
                      animation:ls-shimmer 1.5s ease-in-out infinite alternate"></div>
        </div>
        <!-- Ember particles -->
        <div style="position:absolute;inset:-20px;pointer-events:none">
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ff9933;
                      box-shadow:0 0 6px #ff6600;left:30%;animation:ls-emberFloat 2s ease-out infinite"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ff9933;
                      box-shadow:0 0 6px #ff6600;left:50%;animation:ls-emberFloat 2s ease-out infinite 0.4s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ff9933;
                      box-shadow:0 0 6px #ff6600;left:70%;animation:ls-emberFloat 2s ease-out infinite 0.8s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ff9933;
                      box-shadow:0 0 6px #ff6600;left:40%;animation:ls-emberFloat 2s ease-out infinite 1.2s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ff9933;
                      box-shadow:0 0 6px #ff6600;left:60%;animation:ls-emberFloat 2s ease-out infinite 1.6s"></div>
        </div>
      </div>

      <div style="font-size:0.7rem;color:#4a3a20;letter-spacing:0.2em;
                  font-family:'Crimson Text',serif;animation:ls-pulse 2s ease-in-out infinite">
        Forging the Arena...
      </div>
    `;

    container.appendChild(this.el);
  }

  hide(): Promise<void> {
    return new Promise(resolve => {
      this.el.addEventListener('transitionend', () => {
        this.el.remove();
        resolve();
      }, { once: true });
      this.el.style.opacity = '0';
    });
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors related to `LoadingScreen.ts`

- [ ] **Step 4: Commit**

```bash
git add client/src/loading/LoadingScreen.ts
git commit -m "feat: add LoadingScreen class with fireball orb animation"
```

---

### Task 3: Integrate LoadingScreen in main.ts

**Files:**
- Modify: `client/src/main.ts:1-19` (imports and early initialization)
- Modify: `client/src/main.ts:466-475` (assetsReady block)

- [ ] **Step 1: Add import**

At the top of `client/src/main.ts`, after the existing import block (after line 16), add:

```typescript
import { LoadingScreen } from './loading/LoadingScreen';
```

- [ ] **Step 2: Create LoadingScreen instance before other UI**

In `client/src/main.ts`, after line 19 (`const uiOverlay = ...`) and before line 21 (`const scene = ...`), add:

```typescript

const loadingScreen = new LoadingScreen(uiOverlay);
```

- [ ] **Step 3: Hide loading screen after assets load**

In `client/src/main.ts`, replace the `assetsReady` block (lines 467–475):

```typescript
const assetsReady: Promise<void> = (async () => {
  assets = await AssetLoader.load();
  const arena = new Arena(assets.textures);
  arena.addToScene(scene.scene);
  scene.initPostProcessing();
})().catch(err => {
  console.error('Asset load failed:', err);
  throw err;
});
```

with:

```typescript
const assetsReady: Promise<void> = (async () => {
  assets = await AssetLoader.load();
  const arena = new Arena(assets.textures);
  arena.addToScene(scene.scene);
  scene.initPostProcessing();
  await loadingScreen.hide();
})().catch(err => {
  console.error('Asset load failed:', err);
  throw err;
});
```

- [ ] **Step 4: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Visual verification**

Open `http://localhost:5174` in the browser (or whichever port Vite is running on). You should see:
1. The fireball orb loading screen appears immediately on page load
2. "BLOODMOOR" title with "Arena PvP" subtitle
3. Fire orb animation fills and empties with ember particles
4. "Forging the Arena..." text pulses
5. After assets load (1-3 seconds), the screen fades out over 600ms
6. Auth screen appears underneath

- [ ] **Step 6: Commit**

```bash
git add client/src/main.ts
git commit -m "feat: integrate loading screen into app initialization flow"
```

---

### Task 4: Restyle Auth Login View

**Files:**
- Modify: `client/src/auth/AuthUI.ts:14-16` (constructor root element styles)
- Modify: `client/src/auth/AuthUI.ts:30-43` (showLogin method)

- [ ] **Step 1: Update root container styles**

In `client/src/auth/AuthUI.ts`, replace line 16:

```typescript
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);z-index:200;font-family:serif;color:#c8a870';
```

with:

```typescript
    this.el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#1a0a04 0%,#0a0a12 60%,#050510 100%);z-index:200;font-family:"Crimson Text",serif;color:#c8a870';
```

- [ ] **Step 2: Add fire underglow child div**

In `client/src/auth/AuthUI.ts`, after `container.appendChild(this.el);` (line 17) and before `this.checkSession();` (line 18), add:

```typescript
    const glow = document.createElement('div');
    glow.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse at center bottom,rgba(255,80,0,0.06),transparent 60%);pointer-events:none';
    this.el.appendChild(glow);
```

- [ ] **Step 3: Replace showLogin HTML template**

In `client/src/auth/AuthUI.ts`, replace the entire `showLogin` method body (the `this.el.innerHTML = ...` template and event listeners) with:

```typescript
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
  }
```

- [ ] **Step 4: Add focus glow styles**

Since we can't use pseudo-classes with pure inline styles, add focus listeners. After the event listeners in `showLogin`, add:

```typescript
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
```

- [ ] **Step 5: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/auth/AuthUI.ts
git commit -m "feat: restyle auth login view with atmospheric Bloodmoor branding"
```

---

### Task 5: Restyle Auth Register View

**Files:**
- Modify: `client/src/auth/AuthUI.ts:46-59` (showRegister method)

- [ ] **Step 1: Replace showRegister HTML template**

In `client/src/auth/AuthUI.ts`, replace the entire `showRegister` method with:

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/auth/AuthUI.ts
git commit -m "feat: restyle auth register view with atmospheric Bloodmoor branding"
```

---

### Task 6: Full Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Hard refresh the app**

Open `http://localhost:5174` (or current Vite port) and do a hard refresh (Cmd+Shift+R).

Verify the full flow:

1. **Loading screen appears immediately** — dark background, "BLOODMOOR" title, "Arena PvP" subtitle, fireball orb animating with embers, "Forging the Arena..." pulsing
2. **Loading screen fades out** — smooth 600ms opacity transition after assets finish loading
3. **Auth login screen appears** — atmospheric radial gradient background with fire underglow, "BLOODMOOR" title with glow, "Arena PvP", italic tagline, diamond ornament, labeled inputs, "ENTER THE ARENA" fire button, ghost "Create Account" button
4. **Input focus states** — clicking an input should show gold border glow
5. **Create Account button** → navigates to register view with "CREATE ACCOUNT" title, "Join the arena" tagline, Username/Email/Password labeled inputs, "FORGE YOUR LEGACY" button, "Back" button
6. **Back button** → returns to login view
7. **Error states** — try signing in with bad credentials; error message should appear in `#cc4444` at 0.8rem

- [ ] **Step 2: Test with throttled network**

Open Chrome DevTools → Network tab → set throttling to "Slow 3G". Hard refresh. The loading screen should be visible for several seconds, giving a good look at the animation. Verify it looks smooth and the fade-out is clean.

- [ ] **Step 3: Commit any final adjustments**

If any visual tweaks are needed, make them and commit:

```bash
git add -A
git commit -m "fix: visual polish for loading screen and auth"
```
