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
        @keyframes ls-rise {
          0%   { transform: translateY(100%); }
          45%  { transform: translateY(10%); }
          55%  { transform: translateY(0%); }
          70%  { transform: translateY(5%); }
          85%  { transform: translateY(50%); }
          100% { transform: translateY(100%); }
        }
        @keyframes ls-riseInner {
          0%   { transform: translateY(120%); }
          15%  { transform: translateY(120%); }
          50%  { transform: translateY(15%); }
          60%  { transform: translateY(5%); }
          75%  { transform: translateY(20%); }
          90%  { transform: translateY(70%); }
          100% { transform: translateY(120%); }
        }
        @keyframes ls-riseHot {
          0%   { transform: translateY(140%); }
          25%  { transform: translateY(140%); }
          55%  { transform: translateY(20%); }
          65%  { transform: translateY(10%); }
          78%  { transform: translateY(35%); }
          92%  { transform: translateY(90%); }
          100% { transform: translateY(140%); }
        }
        @keyframes ls-flicker {
          0%, 100% { transform: scaleX(1); }
          20%  { transform: scaleX(0.97); }
          40%  { transform: scaleX(1.02); }
          60%  { transform: scaleX(0.98); }
          80%  { transform: scaleX(1.01); }
        }
        @keyframes ls-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,100,0,0.15), 0 0 40px rgba(255,60,0,0.08); }
          30%  { box-shadow: 0 0 35px rgba(255,120,0,0.3), 0 0 70px rgba(255,60,0,0.15); }
          60%  { box-shadow: 0 0 25px rgba(255,100,0,0.2), 0 0 50px rgba(255,60,0,0.1); }
        }
        @keyframes ls-ringGlow {
          0%, 100% { border-color: #3a2710; }
          50%  { border-color: #5a3a15; }
        }
        @keyframes ls-ember1 {
          0%   { bottom: 25%; opacity: 0; transform: translateX(0) scale(1); }
          10%  { opacity: 1; }
          60%  { opacity: 0.6; transform: translateX(6px) scale(0.6); }
          100% { bottom: 105%; opacity: 0; transform: translateX(-3px) scale(0.1); }
        }
        @keyframes ls-ember2 {
          0%   { bottom: 30%; opacity: 0; transform: translateX(0) scale(1); }
          10%  { opacity: 1; }
          50%  { opacity: 0.7; transform: translateX(-8px) scale(0.7); }
          100% { bottom: 110%; opacity: 0; transform: translateX(4px) scale(0.15); }
        }
        @keyframes ls-ember3 {
          0%   { bottom: 20%; opacity: 0; transform: translateX(0) scale(1); }
          15%  { opacity: 0.9; }
          55%  { opacity: 0.5; transform: translateX(10px) scale(0.5); }
          100% { bottom: 100%; opacity: 0; transform: translateX(-6px) scale(0.1); }
        }
        @keyframes ls-ember4 {
          0%   { bottom: 35%; opacity: 0; transform: translateX(0) scale(1); }
          8%   { opacity: 1; }
          45%  { opacity: 0.8; transform: translateX(-5px) scale(0.8); }
          100% { bottom: 108%; opacity: 0; transform: translateX(7px) scale(0.2); }
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
        <!-- Outer ring with glow -->
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #3a2710;
                    animation:ls-glow 3s ease-in-out infinite, ls-ringGlow 3s ease-in-out infinite"></div>
        <!-- Circular clipping container -->
        <div style="position:absolute;inset:3px;border-radius:50%;overflow:hidden;
                    animation:ls-flicker 0.6s ease-in-out infinite">
          <!-- Flame base (dark red — rises from below) -->
          <div style="position:absolute;left:-20%;width:140%;height:140%;border-radius:50%;
                      background:radial-gradient(circle at 50% 40%,#cc4400,#991100 35%,#550800 60%,#220400 80%);
                      animation:ls-rise 3s ease-in-out infinite;
                      filter:blur(3px)">
          </div>
          <!-- Flame middle (bright orange — rises slightly later) -->
          <div style="position:absolute;left:-5%;width:110%;height:110%;border-radius:50%;
                      background:radial-gradient(circle at 50% 40%,#ff8800,#ff5500 30%,#cc2200 55%,#880800 80%);
                      animation:ls-riseInner 3s ease-in-out infinite;
                      filter:blur(1.5px)">
          </div>
          <!-- Flame hot core (yellow — rises last) -->
          <div style="position:absolute;left:10%;width:80%;height:80%;border-radius:50%;
                      background:radial-gradient(circle at 50% 40%,#ffee88,#ffcc44 25%,#ff8800 50%,#ff5500 75%);
                      animation:ls-riseHot 3s ease-in-out infinite;
                      filter:blur(0.5px)">
          </div>
        </div>
        <!-- Ember particles -->
        <div style="position:absolute;inset:-24px;pointer-events:none">
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffcc44;box-shadow:0 0 6px 2px #ff6600;left:26%;animation:ls-ember1 1.8s ease-out infinite 0s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff9933;box-shadow:0 0 4px 1px #ff4400;left:42%;animation:ls-ember2 2.1s ease-out infinite 0.2s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffbb33;box-shadow:0 0 5px 2px #ff5500;left:58%;animation:ls-ember3 1.9s ease-out infinite 0.5s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ffdd66;box-shadow:0 0 4px 1px #ff7700;left:70%;animation:ls-ember4 2.3s ease-out infinite 0.3s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff8833;box-shadow:0 0 5px 1px #ff3300;left:34%;animation:ls-ember3 2.0s ease-out infinite 0.8s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffaa22;box-shadow:0 0 6px 2px #ff6600;left:50%;animation:ls-ember1 2.2s ease-out infinite 1.0s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ffcc55;box-shadow:0 0 4px 1px #ff5500;left:64%;animation:ls-ember2 1.7s ease-out infinite 1.3s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ff7722;box-shadow:0 0 5px 2px #ff4400;left:38%;animation:ls-ember4 2.4s ease-out infinite 0.6s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ffee77;box-shadow:0 0 4px 1px #ffaa00;left:46%;animation:ls-ember1 1.6s ease-out infinite 1.5s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffbb44;box-shadow:0 0 6px 2px #ff6600;left:54%;animation:ls-ember3 2.1s ease-out infinite 1.8s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff9944;box-shadow:0 0 4px 1px #ff3300;left:30%;animation:ls-ember2 1.9s ease-out infinite 0.4s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ffdd44;box-shadow:0 0 5px 1px #ff7700;left:66%;animation:ls-ember4 1.8s ease-out infinite 1.1s"></div>
          <div style="position:absolute;width:3px;height:3px;border-radius:50%;background:#ffaa33;box-shadow:0 0 5px 2px #ff5500;left:22%;animation:ls-ember1 2.5s ease-out infinite 0.7s"></div>
          <div style="position:absolute;width:2px;height:2px;border-radius:50%;background:#ff8844;box-shadow:0 0 4px 1px #ff4400;left:74%;animation:ls-ember3 2.0s ease-out infinite 1.6s"></div>
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
