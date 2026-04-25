# Loading Screen & Auth Restyle Design

## Overview

Add a themed loading screen during asset loading and restyle the auth screen to match the game's dark fantasy aesthetic. The flow becomes: Loading Screen → Auth → Lobby.

## Loading Screen — Fireball Orb Fill

### Timing & Lifecycle

- Shows immediately on page load, before any async work begins
- Hides with a 600ms opacity fade-out when `AssetLoader.load()` resolves
- After fade completes, element is removed from DOM
- Auth UI is created but hidden behind the loading screen (z-index layering), so it's ready when loading finishes

### Visual Design

- **Background:** Full-screen `#0a0a12` with `position:fixed;inset:0`
- **z-index:** 300 (above auth's 200)
- **Title:** "BLOODMOOR" — Cinzel 900, ~2rem, color `#ddb84a`, `text-shadow: 0 0 30px rgba(200,100,0,0.3)`, `letter-spacing: 0.2em`
- **Subtitle:** "Arena PvP" — 0.65rem, color `#6a5228`, `letter-spacing: 0.3em`, uppercase
- **Orb container:** 120×120px centered below title
  - Outer ring: 2px solid `#3a2710` circle, subtle `box-shadow`
  - Fire fill: Div that animates `height` from 0 to full over ~3s with `ease-in-out`, loops infinitely. `border-radius` transitions from half-circle to full circle as it fills. Background is `radial-gradient(ellipse at center bottom, #ff6600, #cc3300 40%, #661100 80%)`. Inner `::after` pseudo-element adds a shimmer highlight
  - Ember particles: 5 small `3px` circles with `#ff9933` background and `#ff6600` box-shadow, positioned absolutely, animating upward with fade-out on staggered delays
- **Loading text:** "Forging the Arena..." — 0.7rem, color `#4a3a20`, `letter-spacing: 0.2em`, pulsing opacity animation (0.4 → 1.0 over 2s)

### Implementation

- New file: `client/src/loading/LoadingScreen.ts`
- Class `LoadingScreen` with:
  - `constructor(container: HTMLElement)` — creates and appends the DOM element with all inline styles and CSS (via a `<style>` tag injected into the element for animations)
  - `hide(): Promise<void>` — triggers fade-out transition, returns a promise that resolves after transition ends, then removes element from DOM
- All CSS animations defined in a `<style>` block within the loading screen's root element (same pattern as LobbyUI)

### Integration in main.ts

```
// Before any other UI
const loadingScreen = new LoadingScreen(uiOverlay);

// ... existing scene, hud, socket, auth, lobby setup ...

// After assetsReady resolves
assetsReady.then(() => loadingScreen.hide());
```

The auth UI still creates itself on construction (as it does today), but the loading screen sits on top (z-index 300 vs auth's 200). When assets finish, the loading screen fades away revealing auth underneath.

## Auth Screen — Atmospheric Restyle

### Changes to AuthUI.ts

All changes are to inline styles and HTML template strings. No logic changes.

### Root Container

- Replace flat `background:rgba(0,0,0,0.92)` with `background: radial-gradient(ellipse at center, #1a0a04 0%, #0a0a12 60%, #050510 100%)`
- Add `::before` pseudo-element (or a child div) for subtle fire underglow: `radial-gradient(ellipse at center bottom, rgba(255,80,0,0.06), transparent 60%)`

### Login View

- **Title:** Change "ARENA" → "BLOODMOOR" — Cinzel 900, 2.2rem, color `#ddb84a`, `text-shadow: 0 0 60px rgba(255,100,0,0.4), 0 2px 4px rgba(0,0,0,0.8)`, `letter-spacing: 0.25em`
- **Subtitle:** "Arena PvP" — 0.6rem, color `#7a5a28`, `letter-spacing: 0.5em`, uppercase
- **Tagline:** "Enter the blood-soaked arena" — Crimson Text italic, 0.75rem, color `#4a3a20`, `letter-spacing: 0.1em`
- **Ornament divider:** 120px wide, 1px height, `linear-gradient(90deg, transparent, #3a2710, transparent)` with a centered `◆` character in `#c8860a` on a matching background
- **Input labels:** Small uppercase Cinzel labels ("EMAIL", "PASSWORD") above each input — 0.6rem, color `#4a3a20`, `letter-spacing: 0.15em`
- **Inputs:** Same dark styling but with focus state: `border-color: #c8860a; box-shadow: 0 0 8px rgba(200,134,10,0.15)`
- **Sign In button:** Text "ENTER THE ARENA" — Cinzel 700, 0.85rem, `letter-spacing: 0.2em`. Background `linear-gradient(180deg, #c85000, #8a2200)`. Color `#ffcc88`. `box-shadow: 0 2px 16px rgba(200,80,0,0.25), inset 0 1px 0 rgba(255,200,100,0.15)`. `text-shadow: 0 1px 3px rgba(0,0,0,0.7)`
- **Create Account button:** Ghost style — transparent background, `border: 1px solid #2a1f10`, color `#5a4a28`, Cinzel 0.7rem

### Register View

- Same atmospheric background (inherited from root container)
- **Title:** "CREATE ACCOUNT" — same Cinzel 900 style but 1.8rem
- **Subtitle:** "Join the arena" — replaces the "ARENA" subtitle, same style as login tagline
- **Fields:** Username, Email, Password — all with labels
- **Register button:** "FORGE YOUR LEGACY" — same fire gradient style as login
- **Back button:** Same ghost style as "Create Account"

### Error Display

- Same `#cc4444` color
- Slightly larger: 0.8rem
- 16px margin-bottom for more breathing room

## Files Changed

| File | Change |
|------|--------|
| `client/src/loading/LoadingScreen.ts` | New file — loading screen class |
| `client/src/main.ts` | Import LoadingScreen, create instance, hide after assetsReady |
| `client/src/auth/AuthUI.ts` | Restyle login/register views, update copy |

## Files NOT Changed

- Server code — no changes
- Shared types — no changes  
- LobbyUI, HUD, game logic — no changes
- index.html — no changes (loading screen injects into existing `#ui-overlay`)
