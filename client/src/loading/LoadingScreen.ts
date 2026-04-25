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
