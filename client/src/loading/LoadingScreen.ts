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
        @keyframes ls-orbFill {
          0%   { transform: scale(0);   opacity: 0.8; }
          10%  { transform: scale(0.2); opacity: 0.9; }
          40%  { transform: scale(0.7); opacity: 1; }
          55%  { transform: scale(1);   opacity: 1; }
          70%  { transform: scale(1);   opacity: 0.9; }
          85%  { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(0);   opacity: 0.8; }
        }
        @keyframes ls-orbFillInner {
          0%   { transform: scale(0);   opacity: 0; }
          15%  { transform: scale(0);   opacity: 0; }
          25%  { transform: scale(0.2); opacity: 0.7; }
          45%  { transform: scale(0.7); opacity: 1; }
          60%  { transform: scale(1);   opacity: 0.9; }
          75%  { transform: scale(0.8); opacity: 0.7; }
          90%  { transform: scale(0.2); opacity: 0.3; }
          100% { transform: scale(0);   opacity: 0; }
        }
        @keyframes ls-orbFillHot {
          0%   { transform: scale(0);   opacity: 0; }
          25%  { transform: scale(0);   opacity: 0; }
          35%  { transform: scale(0.15); opacity: 0.5; }
          50%  { transform: scale(0.6); opacity: 0.9; }
          60%  { transform: scale(0.8); opacity: 1; }
          70%  { transform: scale(0.6); opacity: 0.7; }
          85%  { transform: scale(0.1); opacity: 0.2; }
          100% { transform: scale(0);   opacity: 0; }
        }
        @keyframes ls-flicker {
          0%, 100% { transform: scale(1) rotate(0deg); }
          25%  { transform: scale(0.97) rotate(1deg); }
          50%  { transform: scale(1.02) rotate(-1deg); }
          75%  { transform: scale(0.99) rotate(0.5deg); }
        }
        @keyframes ls-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,100,0,0.15), 0 0 40px rgba(255,60,0,0.08); }
          30%  { box-shadow: 0 0 35px rgba(255,120,0,0.3), 0 0 70px rgba(255,60,0,0.15); }
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
        <!-- Circular clipping container -->
        <div style="position:absolute;inset:3px;border-radius:50%;overflow:hidden;
                    animation:ls-flicker 0.7s ease-in-out infinite">
          <!-- Flame base (dark red — largest circle) -->
          <div style="position:absolute;bottom:-10%;left:-10%;width:120%;height:120%;border-radius:50%;
                      background:radial-gradient(circle at 50% 60%,#cc4400,#991100 40%,#550800 70%,#220400 90%);
                      transform:scale(0);transform-origin:center 70%;
                      animation:ls-orbFill 3s ease-in-out infinite;
                      filter:blur(2px)">
          </div>
          <!-- Flame middle (bright orange — medium circle) -->
          <div style="position:absolute;bottom:0;left:5%;width:90%;height:90%;border-radius:50%;
                      background:radial-gradient(circle at 50% 55%,#ff8800,#ff5500 35%,#cc2200 65%,#880800 90%);
                      transform:scale(0);transform-origin:center 65%;
                      animation:ls-orbFillInner 3s ease-in-out infinite;
                      filter:blur(1px)">
          </div>
          <!-- Flame hot core (yellow — smallest circle) -->
          <div style="position:absolute;bottom:10%;left:15%;width:70%;height:70%;border-radius:50%;
                      background:radial-gradient(circle at 50% 50%,#ffee88,#ffcc44 30%,#ff8800 60%,#ff5500 85%);
                      transform:scale(0);transform-origin:center 60%;
                      animation:ls-orbFillHot 3s ease-in-out infinite">
          </div>
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
