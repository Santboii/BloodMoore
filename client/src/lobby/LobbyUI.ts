function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type LobbyCallbacks = {
  onCreateRoom: (displayName: string, mode: string) => void;
  onJoinRoom: (roomId: string, displayName: string, teamId?: string) => void;
  onReady: () => void;
  onRematch: () => void;
  onReturnToLobby: () => void;
  onSendChatMessage: (text: string) => void;
  onOpenSkills: () => void;
  onSwitchCharacter: () => void;
  onLogout: () => void;
};

interface OpenRoom {
  roomId: string;
  creatorName: string;
  playerCount: number;
  maxPlayers: number;
  mode: string;
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
.bm-overlay{position:fixed;inset:0;z-index:100;}
.bm-bg{position:absolute;inset:0;overflow:hidden;}
.bm-sky{position:absolute;inset:0;background:linear-gradient(180deg,#060208 0%,#0e0610 20%,#1a0a0e 45%,#2a100a 65%,#1e0c06 80%,#0e0804 100%);}
.bm-moon{position:absolute;top:6%;left:50%;transform:translateX(-50%);width:80px;height:80px;border-radius:50%;background:radial-gradient(circle,#e8d8a0 0%,#c8a850 30%,transparent 70%);box-shadow:0 0 40px 20px rgba(200,160,60,0.15);opacity:0.6;}
.bm-fog{position:absolute;left:-20%;right:-20%;border-radius:50%;filter:blur(40px);animation:bm-drift linear infinite;}
.bm-fog-1{bottom:28%;height:120px;background:radial-gradient(ellipse,rgba(180,140,100,0.5) 0%,transparent 70%);opacity:0.18;animation-duration:28s;}
.bm-fog-2{bottom:22%;height:80px;background:radial-gradient(ellipse,rgba(140,100,70,0.4) 0%,transparent 70%);opacity:0.14;animation-duration:38s;animation-delay:-12s;}
.bm-fog-3{bottom:32%;height:60px;background:radial-gradient(ellipse,rgba(160,120,80,0.3) 0%,transparent 70%);opacity:0.1;animation-duration:22s;animation-delay:-6s;}
@keyframes bm-drift{0%{transform:translateX(0)}50%{transform:translateX(8%)}100%{transform:translateX(0)}}
.bm-grain{position:absolute;inset:0;opacity:0.06;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:256px 256px;}
.bm-vignette{position:absolute;inset:0;background:radial-gradient(ellipse 90% 90% at 50% 50%,transparent 40%,rgba(0,0,0,0.85) 100%);}
.bm-ui{position:relative;z-index:1;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 24px;font-family:'Crimson Text',Georgia,serif;color:#ccc;}
.bm-title{font-family:'Cinzel',serif;font-size:72px;font-weight:900;color:#c8860a;text-shadow:0 0 20px rgba(200,100,0,0.9),0 0 60px rgba(150,60,0,0.5),2px 2px 0 #3a1500,4px 4px 0 #1a0800;letter-spacing:12px;text-transform:uppercase;margin-bottom:4px;}
.bm-subtitle{font-family:'Cinzel',serif;font-size:13px;color:#7a5a20;letter-spacing:6px;text-transform:uppercase;margin-bottom:36px;}
.bm-divider{display:flex;align-items:center;gap:12px;width:100%;max-width:940px;margin-bottom:28px;}
.bm-divider-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#5a3a10,transparent);}
.bm-divider-gem{width:10px;height:10px;background:#c8860a;transform:rotate(45deg);box-shadow:0 0 8px rgba(200,130,10,0.6);}
.bm-layout{display:flex;gap:20px;width:100%;max-width:940px;align-items:flex-start;}
.bm-panel{background:linear-gradient(160deg,rgba(10,8,4,0.92) 0%,rgba(6,4,2,0.95) 100%);border:1px solid rgba(90,60,16,0.6);border-top:2px solid rgba(120,80,20,0.8);border-radius:2px;padding:22px;position:relative;backdrop-filter:blur(6px);box-shadow:0 4px 32px rgba(0,0,0,0.6);}
.bm-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(200,134,10,0.5),transparent);}
.bm-panel-left{flex:0 0 280px;}
.bm-panel-right{flex:1;}
.bm-ptitle{font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#7a5a20;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid rgba(40,28,6,0.8);}
.bm-label{font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;color:#7a5a20;text-transform:uppercase;margin-bottom:6px;}
.bm-input{width:100%;background:rgba(2,2,8,0.9);border:1px solid rgba(60,42,8,0.8);border-bottom:1px solid rgba(106,74,16,0.9);color:#e8c060;font-family:'Cinzel',serif;font-size:15px;padding:9px 12px;outline:none;letter-spacing:1px;margin-bottom:20px;border-radius:1px;box-sizing:border-box;}
.bm-input::placeholder{color:#3a2a08;}
.bm-input:focus{border-color:#c8860a;box-shadow:0 0 10px rgba(200,130,10,0.25);}
.bm-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;}
.bm-mode{background:rgba(4,4,12,0.9);border:1px solid rgba(40,28,6,0.8);color:#5a4a20;font-family:'Cinzel',serif;font-size:11px;font-weight:700;letter-spacing:1px;padding:8px 6px;cursor:pointer;border-radius:1px;text-align:center;transition:all 0.15s;}
.bm-mode.active{background:rgba(22,14,0,0.95);border-color:#c8860a;color:#ffcc66;box-shadow:0 0 10px rgba(200,130,10,0.2);}
.bm-mode.locked{opacity:0.4;cursor:not-allowed;position:relative;}
.bm-mode.locked::after{content:'Soon';position:absolute;top:3px;right:4px;font-size:7px;color:#5a4010;letter-spacing:0.5px;}
.bm-mode-label{font-size:13px;display:block;margin-bottom:1px;}
.bm-mode-desc{font-size:9px;opacity:0.6;}
.bm-btn-red{width:100%;padding:11px 16px;background:linear-gradient(180deg,#7a1500 0%,#4a0d00 60%,#3a0800 100%);color:#ffcc88;border:1px solid rgba(140,40,0,0.9);border-bottom:2px solid #200500;font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;cursor:pointer;border-radius:1px;margin-bottom:10px;box-shadow:0 2px 12px rgba(100,20,0,0.5);transition:all 0.15s;}
.bm-btn-red:hover{background:linear-gradient(180deg,#9a1a00 0%,#6a1200 60%,#4a0a00 100%);}
.bm-sep{display:flex;align-items:center;gap:10px;margin:14px 0;}
.bm-sep-line{flex:1;height:1px;background:rgba(40,28,6,0.8);}
.bm-sep-text{color:#4a3010;font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;}
.bm-code-row{display:flex;gap:6px;}
.bm-code-input{flex:1;background:rgba(2,2,8,0.9);border:1px solid rgba(60,42,8,0.8);border-bottom:1px solid rgba(106,74,16,0.9);color:#e8c060;font-family:'Cinzel',serif;font-size:13px;padding:8px 10px;outline:none;letter-spacing:2px;border-radius:1px;}
.bm-code-input::placeholder{color:#3a2a08;font-size:11px;}
.bm-btn-blue{background:linear-gradient(180deg,#1a3a5a 0%,#0d2035 60%,#081525 100%);color:#88ccff;border:1px solid rgba(26,64,96,0.9);font-family:'Cinzel',serif;font-size:11px;font-weight:700;letter-spacing:2px;padding:8px 14px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.bm-lobby-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(40,28,6,0.8);}
.bm-lobby-label{font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;color:#7a5a20;text-transform:uppercase;}
.bm-pulse{width:6px;height:6px;border-radius:50%;background:#4a8a20;box-shadow:0 0 6px rgba(80,160,30,0.6);animation:bm-pulse 2s ease-in-out infinite;}
@keyframes bm-pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.bm-room-row{display:flex;align-items:center;padding:10px 12px;margin-bottom:6px;background:rgba(4,4,14,0.85);border:1px solid rgba(40,26,6,0.7);border-left:2px solid rgba(74,42,8,0.8);border-radius:1px;transition:all 0.15s;cursor:pointer;}
.bm-room-row:hover{background:rgba(10,10,24,0.9);border-left-color:#c8860a;}
.bm-room-info{flex:1;}
.bm-room-name{font-family:'Cinzel',serif;font-size:13px;color:#d4a840;}
.bm-room-meta{font-size:11px;color:#5a4a20;margin-top:1px;}
.bm-tag{font-family:'Cinzel',serif;font-size:10px;letter-spacing:1px;padding:3px 8px;border-radius:1px;margin-right:12px;text-transform:uppercase;background:rgba(26,14,4,0.9);border:1px solid #5a3010;color:#c8860a;}
.bm-players{font-size:11px;color:#5a4a20;margin-right:8px;white-space:nowrap;}
.bm-players b{color:#8a7040;}
.bm-btn-green-sm{background:linear-gradient(180deg,rgba(26,48,16,0.9) 0%,rgba(14,30,8,0.9) 100%);color:#88dd44;border:1px solid #2a4a10;font-family:'Cinzel',serif;font-size:10px;font-weight:700;letter-spacing:2px;padding:5px 12px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.bm-empty{padding:40px 20px;text-align:center;color:#3a2a08;font-family:'Cinzel',serif;font-size:12px;letter-spacing:1px;line-height:2;border:1px dashed rgba(40,28,6,0.6);border-radius:1px;}
.bm-code-block{background:rgba(2,2,8,0.9);border:1px solid rgba(40,28,6,0.7);border-radius:1px;padding:10px 12px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;}
.bm-code-label{font-family:'Cinzel',serif;font-size:9px;letter-spacing:2px;color:#5a4010;text-transform:uppercase;margin-bottom:2px;}
.bm-code-value{font-family:'Cinzel',serif;font-size:16px;color:#e8c060;letter-spacing:4px;}
.bm-copy-btn{background:rgba(14,14,28,0.9);border:1px solid rgba(58,42,8,0.8);color:#7a5a20;font-family:'Cinzel',serif;font-size:10px;letter-spacing:1px;padding:6px 10px;cursor:pointer;border-radius:1px;text-transform:uppercase;transition:all 0.15s;}
.bm-copy-btn:hover{border-color:#c8860a;color:#c8860a;}
.bm-slot{display:flex;align-items:center;gap:12px;padding:10px 12px;margin-bottom:8px;background:rgba(8,8,26,0.9);border:1px solid rgba(40,28,6,0.7);border-radius:1px;}
.bm-avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Cinzel',serif;font-size:13px;font-weight:700;flex-shrink:0;}
.bm-avatar-0{background:#3a0800;border:1px solid #8a2000;color:#ff8844;}
.bm-avatar-1{background:#001838;border:1px solid #004888;color:#4488ff;}
.bm-avatar-2{background:#003040;border:1px solid #0080c0;color:#0080c0;}
.bm-avatar-3{background:#003010;border:1px solid #00a040;color:#00a040;}
.bm-avatar-empty{background:rgba(10,10,24,0.9);border:1px dashed rgba(40,28,6,0.7);color:#3a2a08;}
.bm-slot-info{flex:1;}
.bm-slot-name{font-family:'Cinzel',serif;font-size:13px;color:#d4a840;}
.bm-slot-status{font-size:11px;margin-top:1px;}
.bm-status-ready{color:#44aa22;}
.bm-status-waiting{color:#5a4a20;}
.bm-status-empty{color:#2a1a08;font-style:italic;}
.bm-btn-green{width:100%;padding:13px;margin-top:20px;background:linear-gradient(180deg,#1a4010 0%,#0e2808 50%,#081c04 100%);color:#88dd44;border:1px solid #2a6010;border-bottom:2px solid #041000;font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:4px;text-transform:uppercase;cursor:pointer;border-radius:1px;box-shadow:0 2px 8px rgba(40,100,10,0.3);transition:all 0.15s;}
.bm-btn-green:hover{background:linear-gradient(180deg,#246018 0%,#163810 50%,#0c2808 100%);}
.bm-btn-green-done{width:100%;padding:13px;margin-top:20px;background:linear-gradient(180deg,#0a1a04 0%,#060e02 100%);color:#44aa22;border:1px solid #1a3a08;font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:4px;text-transform:uppercase;border-radius:1px;cursor:default;opacity:0.7;}
.bm-waiting-text{text-align:center;margin-top:10px;font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;color:#4a3010;text-transform:uppercase;}
.bm-chat-msgs{background:rgba(2,2,8,0.9);border:1px solid rgba(40,28,6,0.7);border-radius:1px;padding:12px;height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:10px;}
.bm-msg{display:flex;gap:8px;align-items:flex-start;}
.bm-msg-sender{font-family:'Cinzel',serif;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;margin-top:1px;}
.bm-msg-sender-0{color:#cc5522;}
.bm-msg-sender-1{color:#4466cc;}
.bm-msg-sender-sys{color:#6a4a10;font-style:italic;}
.bm-msg-text{font-size:14px;color:#9a8a60;line-height:1.4;}
.bm-msg-sys{font-family:'Cinzel',serif;font-size:11px;color:#5a4010;letter-spacing:1px;font-style:italic;}
.bm-chat-row{display:flex;gap:8px;}
.bm-chat-input{flex:1;background:rgba(2,2,8,0.9);border:1px solid rgba(58,42,8,0.8);border-bottom:1px solid rgba(106,74,16,0.9);color:#d4a840;font-family:'Crimson Text',serif;font-size:15px;padding:9px 12px;outline:none;border-radius:1px;}
.bm-chat-input::placeholder{color:#3a2a08;}
.bm-btn-send{background:linear-gradient(180deg,rgba(42,26,4,0.9) 0%,rgba(26,16,2,0.9) 100%);color:#c8860a;border:1px solid rgba(74,42,8,0.8);font-family:'Cinzel',serif;font-size:11px;font-weight:700;letter-spacing:2px;padding:9px 16px;cursor:pointer;border-radius:1px;text-transform:uppercase;}
.bm-result-panel{text-align:center;max-width:400px;}
.bm-result-title{font-family:'Cinzel',serif;font-size:56px;font-weight:900;letter-spacing:8px;text-transform:uppercase;margin-bottom:8px;}
.bm-result-sub{font-size:18px;color:#7a6040;margin-bottom:32px;}
.bm-btn-rematch{padding:12px 40px;background:linear-gradient(180deg,#7a1500 0%,#4a0d00 60%,#3a0800 100%);color:#ffcc88;border:1px solid rgba(140,40,0,0.9);font-family:'Cinzel',serif;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;cursor:pointer;border-radius:1px;}
.bm-disc-panel{text-align:center;max-width:360px;}
.bm-disc-title{font-family:'Cinzel',serif;font-size:28px;color:#cc2222;letter-spacing:4px;text-transform:uppercase;margin-bottom:12px;}
.bm-disc-sub{font-family:'Cinzel',serif;font-size:12px;color:#5a3010;letter-spacing:2px;}
.bm-btn-logout{background:transparent;border:1px solid rgba(80,40,10,0.6);color:#5a3a10;font-family:'Cinzel',serif;font-size:10px;letter-spacing:2px;padding:6px 12px;cursor:pointer;border-radius:1px;text-transform:uppercase;transition:all 0.15s;}
.bm-btn-logout:hover{border-color:#cc2222;color:#cc6644;}
.bm-char-card{display:flex;align-items:center;gap:16px;background:linear-gradient(160deg,rgba(10,8,4,0.88) 0%,rgba(6,4,2,0.92) 100%);border:1px solid rgba(90,60,16,0.5);border-left:3px solid #c8860a;border-radius:2px;padding:10px 20px;margin:-8px 0 20px;font-family:'Cinzel',serif;max-width:600px;backdrop-filter:blur(6px);}
.bm-char-icon{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#1a0a30 0%,#2a1040 100%);border:2px solid #6a3acc;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 0 10px rgba(106,58,204,0.3);}
.bm-char-details{flex:1;min-width:0;}
.bm-char-name{font-size:16px;color:#d4a840;letter-spacing:2px;}
.bm-char-meta{font-size:10px;color:#5a4a20;letter-spacing:2px;text-transform:uppercase;margin-top:2px;}
.bm-char-meta b{color:#ffcc66;}
.bm-char-actions{display:flex;gap:8px;align-items:center;}
.bm-btn-ghost{background:transparent;border:1px solid rgba(200,134,10,0.35);color:#a08040;font-family:'Cinzel',serif;font-size:10px;font-weight:700;letter-spacing:2px;padding:6px 14px;cursor:pointer;border-radius:1px;text-transform:uppercase;transition:all 0.15s;}
.bm-btn-ghost:hover{border-color:#c8860a;color:#e8c060;box-shadow:0 0 8px rgba(200,134,10,0.15);}
.bm-pause-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Cinzel',serif;}
.bm-pause-title{font-size:32px;color:#cc2222;letter-spacing:6px;text-transform:uppercase;margin-bottom:12px;text-shadow:0 0 20px rgba(200,30,30,0.6);}
.bm-pause-countdown{font-size:72px;color:#e8c060;letter-spacing:4px;margin-bottom:24px;text-shadow:0 0 30px rgba(200,160,60,0.4);}
.bm-pause-sub{font-size:13px;color:#5a4010;letter-spacing:2px;margin-bottom:32px;}
.bm-btn-leave{padding:12px 32px;background:linear-gradient(180deg,#3a0800 0%,#1a0400 100%);color:#cc6644;border:1px solid rgba(140,40,0,0.7);font-family:'Cinzel',serif;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;cursor:pointer;border-radius:1px;transition:all 0.15s;}
.bm-btn-leave:hover{background:linear-gradient(180deg,#5a0c00 0%,#2a0600 100%);border-color:#cc2222;}
`;

const BG_HTML = `
<div class="bm-bg">
  <div class="bm-sky"></div>
  <div class="bm-moon"></div>
  <svg viewBox="0 0 1400 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax slice" style="position:absolute;bottom:0;width:100%;height:auto;opacity:0.85">
    <defs>
      <linearGradient id="bm-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a0e04" stop-opacity="0.9"/>
        <stop offset="60%" stop-color="#0e0a02" stop-opacity="1"/>
        <stop offset="100%" stop-color="#080601" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect x="0" y="280" width="1400" height="220" fill="url(#bm-ground)"/>
    <ellipse cx="700" cy="330" rx="700" ry="40" fill="rgba(30,18,6,0.5)"/>
    <ellipse cx="420" cy="400" rx="70" ry="18" fill="rgba(90,4,4,0.5)"/>
    <ellipse cx="860" cy="420" rx="50" ry="12" fill="rgba(70,3,3,0.4)"/>
    <ellipse cx="1180" cy="390" rx="40" ry="10" fill="rgba(80,4,4,0.45)"/>
    <g opacity="0.18" fill="#0d0608">
      <rect x="0" y="200" width="18" height="120"/><rect x="60" y="190" width="14" height="130"/>
      <rect x="120" y="205" width="20" height="115"/><rect x="200" y="185" width="16" height="135"/>
      <rect x="500" y="188" width="14" height="132"/><rect x="700" y="192" width="16" height="128"/>
      <rect x="900" y="185" width="18" height="135"/><rect x="1060" y="190" width="20" height="130"/>
      <rect x="1260" y="188" width="14" height="132"/><rect x="1380" y="195" width="12" height="125"/>
    </g>
    <g fill="#100808">
      <rect x="48" y="120" width="12" height="200"/>
      <rect x="44" y="130" width="20" height="6" transform="rotate(-20 54 133)"/>
      <rect x="44" y="155" width="28" height="5" transform="rotate(15 58 157)"/>
      <rect x="44" y="175" width="22" height="4" transform="rotate(-10 55 177)"/>
      <rect x="110" y="100" width="16" height="230"/>
      <rect x="104" y="115" width="32" height="6" transform="rotate(-25 120 118)"/>
      <rect x="104" y="145" width="36" height="5" transform="rotate(18 122 147)"/>
      <rect x="104" y="165" width="26" height="4" transform="rotate(-15 117 167)"/>
      <rect x="116" y="130" width="30" height="5" transform="rotate(30 131 132)"/>
      <rect x="175" y="150" width="8" height="170"/>
      <rect x="171" y="165" width="18" height="4" transform="rotate(-18 180 167)"/>
      <rect x="171" y="188" width="22" height="4" transform="rotate(12 182 190)"/>
      <rect x="1200" y="110" width="18" height="220"/>
      <rect x="1193" y="125" width="36" height="6" transform="rotate(22 1209 128)"/>
      <rect x="1193" y="152" width="40" height="5" transform="rotate(-16 1213 154)"/>
      <rect x="1208" y="140" width="32" height="5" transform="rotate(-28 1224 142)"/>
      <rect x="1280" y="130" width="14" height="200"/>
      <rect x="1274" y="145" width="28" height="5" transform="rotate(-20 1287 147)"/>
      <rect x="1274" y="170" width="32" height="5" transform="rotate(14 1290 172)"/>
      <rect x="1355" y="140" width="9" height="180"/>
      <rect x="1350" y="155" width="20" height="4" transform="rotate(-15 1359 157)"/>
    </g>
    <g stroke="#1e1408" stroke-width="1.5" opacity="0.6">
      <line x1="240" y1="340" x2="244" y2="300"/><line x1="248" y1="338" x2="250" y2="305"/>
      <line x1="650" y1="335" x2="653" y2="305"/><line x1="657" y1="337" x2="659" y2="310"/>
      <line x1="980" y1="342" x2="983" y2="310"/><line x1="987" y1="340" x2="989" y2="316"/>
    </g>
    <rect x="0" y="430" width="1400" height="70" fill="rgba(6,4,1,0.8)"/>
  </svg>
  <div class="bm-fog bm-fog-1"></div>
  <div class="bm-fog bm-fog-2"></div>
  <div class="bm-fog bm-fog-3"></div>
  <div class="bm-grain"></div>
  <div class="bm-vignette"></div>
</div>`;

export class LobbyUI {
  private el: HTMLElement;
  private ui: HTMLElement;
  private pollTimer: number | null = null;
  private pauseOverlay: HTMLElement | null = null;
  private pauseCountdownTimer: number | null = null;

  constructor(container: HTMLElement, private cb: LobbyCallbacks) {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'bm-overlay';
    this.el.innerHTML = BG_HTML;

    this.ui = document.createElement('div');
    this.ui.className = 'bm-ui';
    this.el.appendChild(this.ui);
    container.appendChild(this.el);

    this.showHome();
  }

  showHome(username?: string, points?: number, charClass?: string, level?: number): void {
    this.stopPolling();
    const prefilledCode = new URLSearchParams(window.location.search).get('room') ?? '';
    const hasProfile = username !== undefined || points !== undefined;
    const mageStaffSvg = `<svg viewBox="0 0 32 32" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="8" r="5" stroke="#a478e8" stroke-width="1.5" fill="rgba(106,58,204,0.25)"/><circle cx="16" cy="8" r="2" fill="#c8a0ff" opacity="0.8"/><line x1="16" y1="13" x2="16" y2="30" stroke="#a478e8" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="12" x2="16" y2="15" stroke="#a478e8" stroke-width="1.2" stroke-linecap="round"/><line x1="20" y1="12" x2="16" y2="15" stroke="#a478e8" stroke-width="1.2" stroke-linecap="round"/></svg>`;
    const classIcon: Record<string, string> = { mage: mageStaffSvg };
    const icon = classIcon[charClass ?? ''] ?? '⚔';
    const profileBarHtml = hasProfile
      ? `<div class="bm-char-card">
           <div class="bm-char-icon">${icon}</div>
           <div class="bm-char-details">
             <div class="bm-char-name">${escapeHtml(username ?? '')}</div>
             <div class="bm-char-meta">${charClass ? `${escapeHtml(charClass)}` : ''}${level !== undefined ? ` · Lvl <b>${level}</b>` : ''}${points !== undefined ? ` · <b>${points}</b> Skill Pts` : ''}</div>
           </div>
           <div class="bm-char-actions">
             <button id="bm-skills" class="bm-btn-ghost">✦ Skills</button>
             <button id="bm-switch-char" class="bm-btn-ghost">⇄ Switch</button>
             <button id="bm-logout" class="bm-btn-logout">Sign Out</button>
           </div>
         </div>`
      : '';
    const nameValue = username ? escapeHtml(username) : '';
    this.ui.innerHTML = `
      <div class="bm-title">Blood Moor</div>
      <div class="bm-subtitle">Enter the Arena · Choose Your Fate</div>
      ${profileBarHtml}
      <div class="bm-divider"><div class="bm-divider-line"></div><div class="bm-divider-gem"></div><div class="bm-divider-line"></div></div>
      <div class="bm-layout">
        <div class="bm-panel bm-panel-left">
          <div class="bm-ptitle">Challenger</div>
          <input id="bm-name" type="hidden" value="${nameValue}">
          <div class="bm-label">Game Mode</div>
          <div class="bm-mode-grid" id="mode-grid">
            <div class="bm-mode active" data-mode="1v1"><span class="bm-mode-label">1v1</span><span class="bm-mode-desc">Duel · 2 players</span></div>
            <div class="bm-mode" data-mode="ffa"><span class="bm-mode-label">FFA</span><span class="bm-mode-desc">Free-for-All · 4p</span></div>
            <div class="bm-mode" data-mode="2v2"><span class="bm-mode-label">2v2</span><span class="bm-mode-desc">Teams · 4 players</span></div>
          </div>
          <button id="bm-create" class="bm-btn-red">⚔ Create Lobby</button>
          <div class="bm-sep"><div class="bm-sep-line"></div><div class="bm-sep-text">or</div><div class="bm-sep-line"></div></div>
          <div class="bm-label">Join by Code</div>
          <div class="bm-code-row">
            <input id="bm-code" class="bm-code-input" type="text" placeholder="ROOM CODE" value="${escapeHtml(prefilledCode)}" maxlength="12">
            <button id="bm-join-code" class="bm-btn-blue">Join</button>
          </div>
        </div>
        <div class="bm-panel bm-panel-right">
          <div class="bm-lobby-header">
            <div class="bm-lobby-label">Open Lobbies</div>
            <div class="bm-pulse"></div>
          </div>
          <div id="bm-rooms"></div>
        </div>
      </div>`;

    const skillsBtn = this.ui.querySelector('#bm-skills');
    if (skillsBtn) skillsBtn.addEventListener('click', () => this.cb.onOpenSkills());

    const switchCharBtn = this.ui.querySelector('#bm-switch-char');
    if (switchCharBtn) switchCharBtn.addEventListener('click', () => this.cb.onSwitchCharacter());

    const logoutBtn = this.ui.querySelector('#bm-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.cb.onLogout());

    const modeGrid = this.ui.querySelector('#mode-grid')!;
    let selectedMode = '1v1';
    modeGrid.querySelectorAll('.bm-mode').forEach(el => {
      el.addEventListener('click', () => {
        modeGrid.querySelectorAll('.bm-mode').forEach(m => m.classList.remove('active'));
        el.classList.add('active');
        selectedMode = (el as HTMLElement).dataset.mode!;
      });
    });

    this.ui.querySelector('#bm-create')!.addEventListener('click', () => {
      const name = (this.ui.querySelector('#bm-name') as HTMLInputElement).value.trim();
      if (name) this.cb.onCreateRoom(name, selectedMode);
    });
    this.ui.querySelector('#bm-join-code')!.addEventListener('click', () => {
      const name = (this.ui.querySelector('#bm-name') as HTMLInputElement).value.trim();
      const code = (this.ui.querySelector('#bm-code') as HTMLInputElement).value.trim();
      if (name && code) this.cb.onJoinRoom(code, name);
    });
    (this.ui.querySelector('#bm-code') as HTMLInputElement)
      .addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') (this.ui.querySelector('#bm-join-code') as HTMLButtonElement).click();
      });

    this.pollLobbies();
    this.pollTimer = window.setInterval(() => this.pollLobbies(), 3000);

    if (prefilledCode) {
      (this.ui.querySelector('#bm-name') as HTMLInputElement).focus();
    }
  }

  showWaiting(roomId: string, myDisplayName: string, mode?: string): void {
    this.stopPolling();
    this.renderLobby(roomId, [{ name: myDisplayName, index: 0, ready: false }], mode);
  }

  showReady(roomId: string, players: Record<string, string>, _myId: string, mode?: string, readyIds?: Set<string>): void {
    this.stopPolling();
    const slots = Object.entries(players).map(([id, name], i) => ({ name, index: i, ready: readyIds?.has(id) ?? false }));
    this.renderLobby(roomId, slots, mode);
  }

  showResult(won: boolean, mode?: string, placement?: number, matchResult?: { xpGained: number; levelsGained: number; newLevel: number }): void {
    this.stopPolling();
    let title: string;
    let subtitle: string;
    if (mode === '2v2') {
      title = won ? 'Your Team Wins' : 'Your Team Loses';
      subtitle = won ? 'Your team dominated the arena' : 'Your team has fallen';
    } else if (mode === 'ffa') {
      title = won ? 'Victory' : 'Defeated';
      if (won) {
        subtitle = 'You are the last one standing';
      } else if (placement) {
        const ordinal = placement === 2 ? '2nd' : placement === 3 ? '3rd' : `${placement}th`;
        subtitle = `Defeated \u2014 ${ordinal} place`;
      } else {
        subtitle = 'You have been eliminated';
      }
    } else {
      title = won ? 'Victory' : 'Defeat';
      subtitle = won ? 'You are victorious' : 'You have been slain';
    }
    const xpHtml = matchResult
      ? `<div style="margin-top:16px;font-family:'Cinzel',serif;font-size:14px;color:#c8860a;letter-spacing:2px">
           +${matchResult.xpGained} XP
           ${matchResult.levelsGained > 0 ? `<br><span style="color:#88dd44;font-size:18px;letter-spacing:3px">LEVEL UP! → ${matchResult.newLevel}</span>` : ''}
         </div>`
      : '';
    this.ui.innerHTML = `
      <div class="bm-title" style="font-size:42px;letter-spacing:8px">Blood Moor</div>
      <div class="bm-divider" style="max-width:500px"><div class="bm-divider-line"></div><div class="bm-divider-gem"></div><div class="bm-divider-line"></div></div>
      <div class="bm-panel bm-result-panel">
        <div class="bm-result-title" style="color:${won ? '#c8860a' : '#cc2222'}">${title}</div>
        <div class="bm-result-sub">${subtitle}</div>
        ${xpHtml}
        <button id="bm-rematch" class="bm-btn-rematch">⚔ Rematch</button>
        <button id="bm-return-lobby" class="bm-btn-rematch" style="margin-top:8px;background:transparent;border:1px solid #554422;color:#998866">Return to Lobby</button>
      </div>`;
    this.ui.querySelector('#bm-rematch')!.addEventListener('click', () => this.cb.onRematch());
    this.ui.querySelector('#bm-return-lobby')!.addEventListener('click', () => this.cb.onReturnToLobby());
  }

  disableRematch(): void {
    const btn = this.ui.querySelector('#bm-rematch') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      btn.style.cursor = 'default';
      btn.textContent = 'Opponent left';
    }
  }

  showDisconnected(): void {
    this.stopPolling();
    this.ui.innerHTML = `
      <div class="bm-title" style="font-size:42px;letter-spacing:8px">Blood Moor</div>
      <div class="bm-divider" style="max-width:500px"><div class="bm-divider-line"></div><div class="bm-divider-gem"></div><div class="bm-divider-line"></div></div>
      <div class="bm-panel bm-disc-panel">
        <div class="bm-disc-title">Opponent Fled</div>
        <div class="bm-disc-sub">The coward has left the arena.<br>Refresh to seek new prey.</div>
      </div>`;
  }

  appendChatMessage(senderId: string, senderName: string, text: string): void {
    const msgs = this.ui.querySelector('#bm-chat-msgs');
    if (!msgs) return;
    const colorClass = this.getSenderColorClass(senderId);
    const div = document.createElement('div');
    div.className = 'bm-msg';
    div.innerHTML = `<span class="bm-msg-sender ${colorClass}">${escapeHtml(senderName)}</span><span class="bm-msg-text">${escapeHtml(text)}</span>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  appendSystemMessage(text: string): void {
    const msgs = this.ui.querySelector('#bm-chat-msgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'bm-msg';
    div.innerHTML = `<span class="bm-msg-sender bm-msg-sender-sys">—</span><span class="bm-msg-sys">${escapeHtml(text)}</span>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  hide(): void { this.stopPolling(); this.el.style.display = 'none'; }
  show(): void { this.el.style.display = ''; }

  showPauseOverlay(countdown: number, onLeave: () => void): void {
    this.hidePauseOverlay();

    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'bm-pause-overlay';
    this.pauseOverlay.innerHTML = `
      <div class="bm-pause-title">Opponent Disconnected</div>
      <div class="bm-pause-countdown" id="bm-pause-timer">${countdown}</div>
      <div class="bm-pause-sub">Waiting for opponent to rejoin...</div>
      <button class="bm-btn-leave" id="bm-pause-leave">Leave Match</button>`;

    this.el.parentElement!.appendChild(this.pauseOverlay);

    this.pauseOverlay.querySelector('#bm-pause-leave')!
      .addEventListener('click', onLeave);

    let remaining = countdown;
    const timerEl = this.pauseOverlay.querySelector('#bm-pause-timer')!;
    this.pauseCountdownTimer = window.setInterval(() => {
      remaining--;
      timerEl.textContent = String(Math.max(0, remaining));
      if (remaining <= 0 && this.pauseCountdownTimer !== null) {
        clearInterval(this.pauseCountdownTimer);
        this.pauseCountdownTimer = null;
      }
    }, 1000);
  }

  hidePauseOverlay(): void {
    if (this.pauseCountdownTimer !== null) {
      clearInterval(this.pauseCountdownTimer);
      this.pauseCountdownTimer = null;
    }
    if (this.pauseOverlay) {
      this.pauseOverlay.remove();
      this.pauseOverlay = null;
    }
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async pollLobbies(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.VITE_SERVER_URL ?? ''}/rooms`);
      const { rooms } = (await res.json()) as { rooms: OpenRoom[] };
      this.renderRoomRows(rooms);
    } catch { /* network error — silently ignore */ }
  }

  private renderRoomRows(rooms: OpenRoom[]): void {
    const container = this.ui.querySelector('#bm-rooms');
    if (!container) return;
    if (rooms.length === 0) {
      container.innerHTML = `<div class="bm-empty">No open lobbies<br>Be the first to enter the arena</div>`;
      return;
    }
    container.innerHTML = rooms.map(r => {
      const joinButtons = r.mode === '2v2'
        ? `<button class="bm-btn-green-sm" data-team="team1">Join T1</button>
           <button class="bm-btn-green-sm" data-team="team2" style="margin-left:4px">Join T2</button>`
        : `<button class="bm-btn-green-sm">Join</button>`;
      return `
      <div class="bm-room-row" data-room-id="${escapeHtml(r.roomId)}" data-mode="${escapeHtml(r.mode)}">
        <div class="bm-room-info">
          <div class="bm-room-name">${escapeHtml(r.creatorName)}</div>
          <div class="bm-room-meta">Waiting for players</div>
        </div>
        <span class="bm-tag">${escapeHtml(r.mode)}</span>
        <div class="bm-players"><b>${r.playerCount}</b> / ${r.maxPlayers}</div>
        ${joinButtons}
      </div>`;
    }).join('');

    container.querySelectorAll('.bm-room-row').forEach(row => {
      row.querySelectorAll('.bm-btn-green-sm').forEach(btn => {
        btn.addEventListener('click', () => {
          const roomId = (row as HTMLElement).dataset.roomId!;
          const name = (this.ui.querySelector('#bm-name') as HTMLInputElement | null)?.value.trim() ?? '';
          const teamId = (btn as HTMLElement).dataset.team;
          if (name) this.cb.onJoinRoom(roomId, name, teamId);
        });
      });
    });
  }

  private renderLobby(roomId: string, slots: Array<{ name: string; index: number; ready: boolean }>, mode?: string): void {
    const shareUrl = `${location.origin}?room=${roomId}`;
    const maxPlayers = (mode === 'ffa' || mode === '2v2') ? 4 : 2;
    const minPlayers = (mode === '2v2') ? 4 : 2;
    const canStart = slots.length >= minPlayers;

    const modeLabels: Record<string, string> = { '1v1': '1v1 Duel', 'ffa': 'Free-for-All', '2v2': '2v2 Teams' };
    const modeLabel = modeLabels[mode ?? '1v1'] ?? '1v1 Duel';

    const slotHtml = (slot: { name: string; index: number; ready: boolean } | undefined, fallback: string) =>
      slot
        ? `<div class="bm-slot" style="${slot.ready ? 'border-color:#44aa22;box-shadow:0 0 6px rgba(68,170,34,0.3);' : ''}">
             <div class="bm-avatar bm-avatar-${slot.index % 4}">${escapeHtml((slot.name[0] ?? '?').toUpperCase())}</div>
             <div class="bm-slot-info">
               <div class="bm-slot-name">${escapeHtml(slot.name)}</div>
               <div class="bm-slot-status ${slot.ready ? 'bm-status-ready' : 'bm-status-waiting'}">${slot.ready ? '✓ Ready' : 'Waiting...'}</div>
             </div>
           </div>`
        : `<div class="bm-slot">
             <div class="bm-avatar bm-avatar-empty">?</div>
             <div class="bm-slot-info">
               <div class="bm-slot-name" style="color:#3a2a08">${fallback}</div>
               <div class="bm-slot-status bm-status-empty">Waiting for challenger...</div>
             </div>
           </div>`;

    let slotsHtml = '';
    for (let i = 0; i < maxPlayers; i++) {
      slotsHtml += slotHtml(slots[i], `Slot ${i + 1}`);
    }

    const readyBtn = canStart
      ? `<button id="bm-ready" class="bm-btn-green">⚔ Ready</button>`
      : `<button class="bm-btn-green" style="opacity:0.4;cursor:not-allowed" disabled>⚔ Ready</button>
         <div class="bm-waiting-text">Waiting for players...</div>`;

    this.ui.innerHTML = `
      <div class="bm-title" style="font-size:42px;letter-spacing:8px">Blood Moor</div>
      <div class="bm-subtitle">⚔ Lobby — ${modeLabel}</div>
      <div class="bm-divider"><div class="bm-divider-line"></div><div class="bm-divider-gem"></div><div class="bm-divider-line"></div></div>
      <div class="bm-layout">
        <div class="bm-panel bm-panel-left">
          <div class="bm-ptitle">Combatants</div>
          <div class="bm-code-block">
            <div>
              <div class="bm-code-label">Invite Code</div>
              <div class="bm-code-value">${escapeHtml(roomId.toUpperCase())}</div>
            </div>
            <button id="bm-copy" class="bm-copy-btn">⎘ Copy Link</button>
          </div>
          ${slotsHtml}
          ${readyBtn}
          <button id="bm-leave" class="bm-btn-leave" style="margin-top:12px;background:transparent;border:1px solid #5a3a1a;color:#a08060;padding:14px 28px;cursor:pointer;font-family:inherit;font-size:15px;width:100%;letter-spacing:2px;">← Leave Lobby</button>
        </div>
        <div class="bm-panel bm-panel-right" style="display:flex;flex-direction:column;">
          <div class="bm-ptitle">War Council</div>
          <div id="bm-chat-msgs" class="bm-chat-msgs"></div>
          <div class="bm-chat-row">
            <input id="bm-chat-input" class="bm-chat-input" type="text" placeholder="Speak your mind, warrior..." maxlength="80">
            <button id="bm-chat-send" class="bm-btn-send">Send</button>
          </div>
        </div>
      </div>`;

    this.ui.querySelector('#bm-copy')!.addEventListener('click', () => {
      navigator.clipboard.writeText(shareUrl);
    });

    this.ui.querySelector('#bm-leave')!.addEventListener('click', () => {
      this.cb.onReturnToLobby();
    });

    const readyBtnEl = this.ui.querySelector('#bm-ready');
    if (readyBtnEl) {
      readyBtnEl.addEventListener('click', () => {
        readyBtnEl.replaceWith(
          Object.assign(document.createElement('button'), {
            className: 'bm-btn-green-done',
            textContent: '✓ Ready',
          })
        );
        this.cb.onReady();
      });
    }

    const sendMsg = () => {
      const input = this.ui.querySelector('#bm-chat-input') as HTMLInputElement;
      const text = input.value.trim();
      if (text) { this.cb.onSendChatMessage(text); input.value = ''; }
    };
    this.ui.querySelector('#bm-chat-send')!.addEventListener('click', sendMsg);
    (this.ui.querySelector('#bm-chat-input') as HTMLInputElement)
      .addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') sendMsg(); });
  }

  private getSenderColorClass(senderId: string): string {
    const sum = senderId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return sum % 2 === 0 ? 'bm-msg-sender-0' : 'bm-msg-sender-1';
  }
}
