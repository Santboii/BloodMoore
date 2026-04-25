export class LoadingScreen {
  private el: HTMLElement;
  private hidden = false;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:#0a0a12;z-index:300;font-family:"Cinzel",serif;transition:opacity 0.6s ease;';

    this.el.innerHTML = `
      <style>
        @keyframes ls-flameCore {
          0%   { height: 0;     border-radius: 0 0 55px 55px; opacity: 0.9; }
          15%  { height: 40px;  border-radius: 0 0 55px 55px; opacity: 1; }
          40%  { height: 95px;  border-radius: 40px 40px 55px 55px; opacity: 0.95; }
          55%  { height: 110px; border-radius: 55px; opacity: 1; }
          70%  { height: 105px; border-radius: 55px; opacity: 0.9; }
          80%  { height: 80px;  border-radius: 45px 45px 55px 55px; opacity: 0.85; }
          100% { height: 0;     border-radius: 0 0 55px 55px; opacity: 0.9; }
        }
        @keyframes ls-flameInner {
          0%   { height: 0;     opacity: 0; }
          20%  { height: 30px;  opacity: 0.8; }
          45%  { height: 80px;  opacity: 1; }
          60%  { height: 90px;  opacity: 0.9; }
          75%  { height: 70px;  opacity: 0.7; }
          100% { height: 0;     opacity: 0; }
        }
        @keyframes ls-flameWhite {
          0%   { height: 0;     opacity: 0; }
          30%  { height: 20px;  opacity: 0.6; }
          50%  { height: 50px;  opacity: 0.8; }
          65%  { height: 40px;  opacity: 0.5; }
          100% { height: 0;     opacity: 0; }
        }
        @keyframes ls-flicker {
          0%, 100% { transform: translateX(-50%) scaleX(1); }
          25%  { transform: translateX(-50%) scaleX(0.96); }
          50%  { transform: translateX(-50%) scaleX(1.03); }
          75%  { transform: translateX(-50%) scaleX(0.98); }
        }
        @keyframes ls-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,100,0,0.15), 0 0 40px rgba(255,60,0,0.08); }
          30%  { box-shadow: 0 0 30px rgba(255,120,0,0.25), 0 0 60px rgba(255,60,0,0.12); }
          60%  { box-shadow: 0 0 25px rgba(255,100,0,0.2), 0 0 50px rgba(255,60,0,0.1); }
        }
        @keyframes ls-emberFloat {
          0%   { bottom: 30%; opacity: 1; transform: scale(1) translateX(0); }
          50%  { opacity: 0.8; transform: scale(0.7) translateX(8px); }
          100% { bottom: 95%; opacity: 0; transform: scale(0.2) translateX(-5px); }
        }
        @keyframes ls-emberFloat2 {
          0%   { bottom: 35%; opacity: 1; transform: scale(1) translateX(0); }
          50%  { opacity: 0.7; transform: scale(0.6) translateX(-10px); }
          100% { bottom: 100%; opacity: 0; transform: scale(0.15) translateX(6px); }
        }
        @keyframes ls-pulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        @keyframes ls-ringGlow {
          0%, 100% { border-color: #3a2710; }
          50%  { border-color: #5a3a15; }
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
        <!-- Outer ring with glow -->
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #3a2710;
                    animation:ls-glow 3s ease-in-out infinite, ls-ringGlow 3s ease-in-out infinite"></div>
        <!-- Flame core (dark red/orange base) -->
        <div style="position:absolute;bottom:5px;left:50%;width:108px;height:0;transform:translateX(-50%);
                    background:radial-gradient(ellipse at center bottom,#cc4400,#991100 50%,#550800 85%);
                    animation:ls-flameCore 3s ease-in-out infinite, ls-flicker 0.8s ease-in-out infinite;
                    overflow:hidden;filter:blur(1px)">
        </div>
        <!-- Flame inner (bright orange layer) -->
        <div style="position:absolute;bottom:5px;left:50%;width:80px;height:0;transform:translateX(-50%);
                    background:radial-gradient(ellipse at center bottom,#ff8800,#ff5500 40%,#cc2200 80%);
                    animation:ls-flameInner 3s ease-in-out infinite 0.1s, ls-flicker 0.6s ease-in-out infinite 0.2s;
                    overflow:hidden;filter:blur(0.5px);border-radius:0 0 40px 40px">
        </div>
        <!-- Flame hot core (yellow-white center) -->
        <div style="position:absolute;bottom:5px;left:50%;width:44px;height:0;transform:translateX(-50%);
                    background:radial-gradient(ellipse at center bottom,#ffdd66,#ffaa22 50%,#ff6600 90%);
                    animation:ls-flameWhite 3s ease-in-out infinite 0.2s, ls-flicker 0.5s ease-in-out infinite 0.1s;
                    overflow:hidden;border-radius:0 0 22px 22px">
        </div>
        <!-- Ember particles -->
        <div style="position:absolute;inset:-20px;pointer-events:none">
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffbb44;
                      box-shadow:0 0 6px 2px #ff6600;left:28%;animation:ls-emberFloat 2.2s ease-out infinite"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff9933;
                      box-shadow:0 0 4px 1px #ff4400;left:48%;animation:ls-emberFloat2 1.8s ease-out infinite 0.3s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffcc55;
                      box-shadow:0 0 6px 2px #ff6600;left:68%;animation:ls-emberFloat 2.5s ease-out infinite 0.7s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff8833;
                      box-shadow:0 0 5px 1px #ff3300;left:38%;animation:ls-emberFloat2 2s ease-out infinite 1.1s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffaa33;
                      box-shadow:0 0 6px 2px #ff5500;left:58%;animation:ls-emberFloat 1.9s ease-out infinite 1.5s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ffdd66;
                      box-shadow:0 0 4px 1px #ff7700;left:22%;animation:ls-emberFloat2 2.3s ease-out infinite 0.5s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff7722;
                      box-shadow:0 0 5px 1px #ff4400;left:75%;animation:ls-emberFloat 2.1s ease-out infinite 1.8s"></div>
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
    if (this.hidden) return Promise.resolve();
    this.hidden = true;
    return new Promise(resolve => {
      this.el.addEventListener('transitionend', () => {
        this.el.remove();
        resolve();
      }, { once: true });
      this.el.style.opacity = '0';
    });
  }
}
