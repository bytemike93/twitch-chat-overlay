'use strict';

const introWrapper  = document.getElementById('intro-wrapper');
const chatWrapper   = document.getElementById('chat-wrapper');
const chatContainer = document.getElementById('chat-container');
const statusBanner  = document.createElement('div');
statusBanner.id = 'status-banner';
statusBanner.setAttribute('role', 'alert');
statusBanner.hidden = true;
if (chatWrapper) chatWrapper.prepend(statusBanner);

const params    = new URLSearchParams(window.location.search);
const isPreview = params.get('preview') === 'yes';

/* ---------- Utils ---------- */
function injectStyle(css){
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
}
function escapeRegExp(str){ return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const isSixHex  = (hex) => /^[0-9a-fA-F]{6}$/.test(hex || '');
const hexToCss  = (hex) => `#${hex}`;
function hexToRgba(hex, alpha){
  const s = String(hex).replace(/^#/, '');
  const r = parseInt(s.slice(0,2),16);
  const g = parseInt(s.slice(2,4),16);
  const b = parseInt(s.slice(4,6),16);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r},${g},${b},${isFinite(a) ? a : 1})`;
}

// eingehende 7TV-Farben sicher auf #RRGGBB normalisieren
function normalizeCssColor(val){
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return '#' + (val & 0xFFFFFF).toString(16).padStart(6,'0');
  const s = String(val).trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(s)) return '#' + s.slice(2);
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
  return null;
}

injectStyle(`
  #status-banner{
    display:none;
    padding:12px;
    margin:8px;
    border-radius:8px;
    font-weight:600;
    text-align:center;
    background:rgba(220,53,69,0.85);
    color:#fff;
    box-shadow:0 0 12px rgba(220,53,69,0.4);
  }
  #status-banner.is-visible{ display:block; }
`);

/* ---------- Intro ---------- */
if (isPreview) {
  introWrapper.style.display = 'none';
  startChat();
} else {
  introWrapper.addEventListener('animationend', () => {
    introWrapper.style.display = 'none';
    startChat();
  });
}

/* ---------- WS URL Auto-Erkennung ---------- */
function computeWsUrl() {
  const override = params.get('ws');
  if (override) return override;

  const host = location.hostname;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';

  if (location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1') {
    return 'ws://localhost:3010';
  }
  const m = host.match(/^chat(\..+)$/);
  if (m) return `${proto}://chatbackend${m[1]}`;
  return `${proto}://${location.host}`;
}

/* ---------- Start ---------- */
function startChat() {
  let ws;
  let __enterCounter = 0;
  let reconnectAllowed = true;

  if (statusBanner) {
    statusBanner.textContent = '';
    statusBanner.classList.remove('is-visible');
    statusBanner.hidden = true;
  }

  function handleJoinStatusMessage(message) {
    if (!statusBanner || !message) return;
    const status = (message.status || '').toLowerCase();
    if (status === 'error') {
      const base = message.message || 'Fehler beim Verbinden mit dem Twitch-Chat.';
      const details = message.details && !base.toLowerCase().includes(String(message.details).toLowerCase())
        ? ` (${message.details})`
        : (message.details && base !== message.details ? ` (${message.details})` : '');
      statusBanner.textContent = `${base}${details || ''}`;
      statusBanner.classList.add('is-visible');
      statusBanner.hidden = false;
      console.warn('Join-Fehler:', message.code || 'unknown', message.details || base);
      return;
    }
    if (status === 'joined') {
      statusBanner.textContent = '';
      statusBanner.classList.remove('is-visible');
      statusBanner.hidden = true;
      return;
    }
  }

  const userMessages = new Map();  // username -> Set<elements>
  const messageQueue = [];
  const pendingDeleteIds = new Set();
  const noPrune =
    params.get('flow') === 'yes' ||
    (params.get('prune') || '').toLowerCase() === 'off';

  // --- Auto-Hide (TTL, ohne Hover) ---
  const ttlSec = (() => {
    const v = parseInt(params.get('ttl') || '', 10);
    return Number.isFinite(v) && v > 0 ? v : 0; // 0 = aus
  })();
  const ttlTimers = new Map(); // Element -> timeoutId

  function clearTtl(el) {
    const id = ttlTimers.get(el);
    if (id) { clearTimeout(id); ttlTimers.delete(el); }
  }

  function removeMessage(el, reason = 'generic') {
    clearTtl(el);

    // aus Queue entfernen
    const idx = messageQueue.indexOf(el);
    if (idx > -1) messageQueue.splice(idx, 1);

    // aus User-Map entfernen
    const uname = (el.getAttribute('data-username') || '').toLowerCase();
    if (uname && userMessages.has(uname)) {
      const set = userMessages.get(uname);
      set.delete(el);
      if (set.size === 0) userMessages.delete(uname);
    }

    // sanft ausblenden + DOM entfernen
    if (el.parentNode === chatContainer) {
      el.classList.add('leaving');
      el.addEventListener('animationend', () => {
        if (el.parentNode === chatContainer) chatContainer.removeChild(el);
      }, { once:true });
    }
  }

  function scheduleTtl(el) {
    if (!ttlSec) return;
    clearTtl(el);
    const id = setTimeout(() => removeMessage(el, 'ttl'), ttlSec * 1000);
    ttlTimers.set(el, id);
  }

  // --- Bots/Ignore ---
  const knownBots = [
    'nightbot','streamelements','streamlabs','moobot','wizebot','fossabot','own3d','coebot','phantombot',
    'deepbot','scorpbot','xanbot','anotherttvviewer','stay_hydrated_bot','supibot','vivbot','mixitupbot',
    'muxybot','soundalerts','soundalerts_bot','apulxd','sery_bot','cloudbot'
  ];
  const hideBots = params.get('bots') === 'no';
  const ignoreParam = params.get('ignore');
  const userIgnoredBots = ignoreParam
    ? ignoreParam.split(',').map(b => b.trim().toLowerCase()).filter(Boolean)
    : [];

  // --- Layout Flags ---
  const isSmallMode = params.get('small') === 'yes';
  if (isSmallMode) document.body.setAttribute('data-small', 'yes');

  const avatarParam = params.get('avatar');
  if (!isSmallMode) {
    document.body.setAttribute('data-avatar', avatarParam === 'no' ? 'no' : 'yes');
  } else {
    document.body.setAttribute('data-avatar', avatarParam === 'yes' ? 'yes' : 'no');
  }

  const alignParam = params.get('align');
  if (alignParam === 'right') document.body.setAttribute('data-align', 'right');

  // --- Preset / BG (per-bubble) ---
  const styleParam = params.get('style');
  if (styleParam) document.body.setAttribute('data-style', styleParam);
  else document.body.removeAttribute('data-style');

  const bgParam = params.get('bg'); // "no" | 6HEX
  const bgNo = (bgParam?.toLowerCase() === 'no');
  const useCustomBg = isSixHex(bgParam);

  if (bgNo) {
    injectStyle(`
      .chat-message, body[data-align="right"] .chat-message{
        background:transparent!important; background-color:transparent!important; border-color:transparent;
      }
    `);
    document.body.setAttribute('data-style', 'no');
  } else if (styleParam === 'glass' && useCustomBg) {
    const r = parseInt(bgParam.slice(0,2),16), g = parseInt(bgParam.slice(2,4),16), b = parseInt(bgParam.slice(4,6),16);
    const overlay = `rgba(${r},${g},${b},0.35)`;
    const gradient = bgParam !== '000000'
      ? `linear-gradient(to bottom right, rgba(255,255,255,0.08), ${overlay})`
      : overlay;
    injectStyle(`
      body[data-style="glass"] .chat-message,
      body[data-align="right"][data-style="glass"] .chat-message{
        background:${gradient}!important; background-color:${gradient}!important;
      }
    `);
  } else if (useCustomBg) {
    injectStyle(`
      .chat-message, body[data-align="right"] .chat-message{
        background:${hexToCss(bgParam)}!important; background-color:${hexToCss(bgParam)}!important;
      }
    `);
  }

  // --- Wrapper (whole chat box) via URL params ---
  (() => {
    const cleanHex = (v) => (v || '').trim().replace(/^#/, '');
    const isHex6   = (v) => /^[0-9a-fA-F]{6}$/.test(v);
    const isNum    = (v) => /^\d+$/.test(String(v || ''));

    // Background (HEX) + optional alpha (0–1 oder 0–100)
    const boxBgRaw = params.get('boxBg');
    const boxBg    = cleanHex(boxBgRaw);

    const alphaStrRaw = params.get('boxAlpha') ?? params.get('boxBgAlpha') ?? params.get('boxA');
    let alpha = null;
    if (alphaStrRaw !== null && alphaStrRaw !== undefined && String(alphaStrRaw).trim() !== '') {
      let v = parseFloat(String(alphaStrRaw).replace(',', '.'));
      if (Number.isFinite(v)) {
        if (v > 1) v = v / 100;
        alpha = Math.max(0, Math.min(1, v));
      }
    }

    if (boxBgRaw && String(boxBgRaw).toLowerCase() === 'no') {
      chatWrapper.style.setProperty('--box-bg', 'transparent');
    } else if (isHex6(boxBg)) {
      const val = alpha !== null ? hexToRgba(boxBg, alpha) : `#${boxBg}`;
      chatWrapper.style.setProperty('--box-bg', val);
    }

    // Border radius + border parts
    const boxRadius = params.get('boxRadius');
    if (isNum(boxRadius)) chatWrapper.style.setProperty('--box-radius', `${parseInt(boxRadius,10)}px`);

    const bw = params.get('boxBorderWidth');
    if (isNum(bw)) chatWrapper.style.setProperty('--box-border-width', `${parseInt(bw,10)}px`);

    const bs = params.get('boxBorderStyle');
    if (['none','solid','dashed','dotted','double','groove','ridge','inset','outset'].includes(String(bs)))
      chatWrapper.style.setProperty('--box-border-style', bs);

    const bcRaw = params.get('boxBorderColor');
    const bc    = cleanHex(bcRaw);
    if (isHex6(bc)) chatWrapper.style.setProperty('--box-border-color', `#${bc}`);

    // Backdrop blur (px)
    const blur = params.get('boxBlur');
    if (isNum(blur)) {
      const px = Math.max(0, Math.min(100, parseInt(blur,10)));
      chatWrapper.style.setProperty('--box-blur', `${px}px`);
    }

    // Außenabstand für sichtbaren äußeren Glow
    const boxMargin = params.get('boxMargin') ?? params.get('boxPadOuter') ?? params.get('outer');
    if (isNum(boxMargin)) chatWrapper.style.setProperty('--box-margin', `${parseInt(boxMargin,10)}px`);

    // boxShadow (Combo "hex,blur[,spread]" ODER Einzel-Parameter)
    const bsCombined = params.get('boxShadow');
    const bsColorRaw = params.get('boxShadowColor');
    const bsColor    = cleanHex(bsColorRaw);
    const bsPx       = params.get('boxShadowPx');
    const bsSpread   = params.get('boxShadowSpread');

    let shadowCss = '';

    if (bsCombined && bsCombined.includes(',')) {
      const parts    = bsCombined.split(',').map(s => s.trim());
      const hex      = cleanHex(parts[0]);
      const blurPx   = parts[1];
      const spreadPx = parts[2];
      if (isHex6(hex) && isNum(blurPx)) {
        const b = Math.min(200, parseInt(blurPx,10));
        const s = isNum(spreadPx) ? parseInt(spreadPx,10) : 0;
        shadowCss = `0 0 ${b}px ${s}px #${hex}`;
      }
    } else if (isHex6(bsColor) && isNum(bsPx)) {
      const b = Math.min(200, parseInt(bsPx,10));
      const s = isNum(bsSpread) ? parseInt(bsSpread,10) : 0;
      shadowCss = `0 0 ${b}px ${s}px #${bsColor}`;
    }

    if (shadowCss) chatWrapper.style.setProperty('--box-shadow', shadowCss);
  })();

  // --- Auto-Dichte / Freistehend-Layout (param-only, robust) --------------
  (() => {
    const bgParam = params.get('bg');                 // "no" | 6HEX
    const bgNo    = (bgParam && bgParam.toLowerCase() === 'no');
    const styleIsNo = (params.get('style') === 'no') || (document.body.getAttribute('data-style') === 'no');

    // Border direkt aus Parametern ableiten (ohne Fremd-Variablen)
    const borderColor = params.get('borderColor');
    const borderWidth = params.get('borderWidth');
    const borderStyle = params.get('borderStyle');
    const hasBorder = (
      (borderStyle && borderStyle !== 'none') ||
      (/^\d+$/.test(borderWidth || '')) ||
      isSixHex(borderColor)
    );

    // Glow direkt aus Parametern ableiten
    const glowOff   = (params.get('glowOff') === 'yes' || (params.get('glow') || '').toLowerCase() === 'off');
    const glowCombo = params.get('glow');
    const glowHex   = params.get('glowColor');
    const glowPx    = params.get('glowPx');
    const hasGlow   = !glowOff && (
      (glowCombo && glowCombo.includes(',')) || isSixHex(glowHex) || /^\d+$/.test(glowPx || '')
    );

    // Manuell erzwingen: &compact=yes
    const compactExplicit = params.get('compact') === 'yes';

    // Automatik: freistehend + kein Rand + kein Glow -> super kompakt
    const compactAuto = (bgNo || styleIsNo) && !hasBorder && !hasGlow;
    const compact = compactExplicit || compactAuto;

    document.body.setAttribute('data-compact', compact ? 'yes' : 'no');

    // Freistehend, aber mit Rahmen/Glow -> leicht kompakt
    const frameOnly = (bgNo || styleIsNo) && !compact;

    // optionale Overrides &pad=&gap=&padMsg=
    const toInt = (k) => {
      const v = params.get(k); const n = parseInt(v || '', 10);
      return Number.isFinite(n) ? n : null;
    };
    const padOuter = toInt('pad')    ?? (compact ? 6 : frameOnly ? 6 : null);
    const gapY     = toInt('gap')    ?? (compact ? 0 : frameOnly ? 4 : null);
    const padMsg   = toInt('padMsg') ?? (compact ? 0 : frameOnly ? 8 : null);

    let css = '';
    if (padOuter !== null) css += `#chat-wrapper{padding:${padOuter}px!important}`;
    if (gapY     !== null) css += `#chat-container{gap:${gapY}px!important}`;
    if (padMsg   !== null) css += `.chat-message{padding:${padMsg}px!important}`;

    if (compact) {
      css += `
        .chat-message{
          border:none!important;
          border-radius:0!important;
          box-shadow:none!important;
          background:transparent!important;
        }
        .first-line{ margin-bottom:0!important; }
      `;
    } else if (frameOnly) {
      css += `.first-line{ margin-bottom:2px!important; }`;
    }

    if (css) injectStyle(css);
  })();

  // --- Textfarbe (body) ---
  const textParam = params.get('text');
  if (isSixHex(textParam)) injectStyle(`.message-text{ color:${hexToCss(textParam)}!important }`);

  // --- Username-Farbe Override ---
  const nameParam = params.get('name');
  const nameOverride = isSixHex(nameParam) ? hexToCss(nameParam) : null;

  // --- Schrift + Größe ---
  const fontParam = params.get('font');
  const sizeParam = params.get('size');
  const toTitleCase = (n) => (n||'').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

  if (fontParam) {
    const raw = decodeURIComponent(fontParam).replace(/['"]/g,'').trim();
    const first = raw.split(',')[0].trim();
    const normalized = toTitleCase(first);
    const family = encodeURIComponent(normalized).replace(/%20/g,'+');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
    document.head.appendChild(link);
    injectStyle(`
      .message-text{ font-family:'${normalized}',sans-serif!important; ${sizeParam ? `font-size:${parseInt(sizeParam,10)}px!important;` : ''} }
    `);
  } else if (sizeParam) {
    injectStyle(`.message-text{ font-size:${parseInt(sizeParam,10)}px!important }`);
  }

  if (isSmallMode) {
    const base = sizeParam ? parseInt(sizeParam,10) : 22;
    injectStyle(`
      body[data-small="yes"] .chat-message{ font-size:${base}px!important; gap:${Math.round(base*0.25)}px!important; }
      body[data-small="yes"] .badge, body[data-small="yes"] .profile-image{ width:${base}px!important; height:${base}px!important; }
      body[data-small="yes"][data-avatar="yes"] .profile-image{ display:inline-block!important; margin-right:${Math.round(base*0.25)}px!important; border-radius:50%!important; }
      body[data-small="yes"][data-avatar="no"]  .profile-image{ display:none!important; }
      body[data-small="yes"] .chatter-name, body[data-small="yes"] .seven-tv-paint, body[data-small="yes"] .message-text{ font-size:${base}px!important; line-height:1.4!important; }
      body[data-small="yes"] .twitch-emote, body[data-small="yes"] .seventv-emote{ height:${Math.round(base*1.2)}px!important; }
    `);
  }

  // --- Border-Radius + Border-Overrides (per-bubble) ---
  const radius = params.get('border');
  if (radius && /^\d+$/.test(radius)) injectStyle(`.chat-message{ border-radius:${radius}px!important }`);

  const borderColor = params.get('borderColor'); // 6HEX
  const borderWidth = params.get('borderWidth'); // px
  const borderStyle = params.get('borderStyle'); // solid|dashed|dotted|none|(empty)
  if (isSixHex(borderColor) || /^\d+$/.test(borderWidth||'') || (borderStyle && ['solid','dashed','dotted','none'].includes(borderStyle))) {
    const parts = [];
    if (borderStyle === 'none') {
      parts.push('border:none!important');
    } else {
      if (borderWidth && /^\d+$/.test(borderWidth)) parts.push(`border-width:${parseInt(borderWidth,10)}px!important`);
      if (borderStyle) parts.push(`border-style:${borderStyle}!important`);
      if (isSixHex(borderColor)) parts.push(`border-color:${hexToCss(borderColor)}!important`);
    }
    if (parts.length) injectStyle(`.chat-message{ ${parts.join(';')} }`);
  }

  // --- Glow (Box-Shadow) ---
  const glowVal = (params.get('glow') || '').toLowerCase();
  const glowOff = params.get('glowOff') === 'yes' || glowVal === 'off' || glowVal === 'none';
  let glowColHex = null, glowPxNum = null;

  const glowCombo = params.get('glow');
  if (glowCombo && glowCombo.includes(',')) {
    const [h, p] = glowCombo.split(',');
    if (isSixHex(h)) glowColHex = h;
    const num = parseInt(p,10);
    if (!Number.isNaN(num)) glowPxNum = num;
  } else {
    const gHex = params.get('glowColor');
    const gPx  = params.get('glowPx');
    if (isSixHex(gHex)) glowColHex = gHex;
    const num = parseInt(gPx || '',10);
    if (!Number.isNaN(num)) glowPxNum = num;
  }

  if (glowOff) {
    injectStyle(`.chat-message{ box-shadow:none!important }`);
  } else if (glowColHex && glowPxNum) {
    const c = hexToCss(glowColHex);
    const px = Math.max(4, Math.min(80, glowPxNum));
    injectStyle(`
      .chat-message{
        box-shadow: 0 0 ${Math.round(px*0.6)}px ${c}, 0 0 ${px}px ${c}, 0 0 ${Math.round(px*1.6)}px ${c} !important;
        border-color: ${c} !important;
      }
    `);
  }

  // --- Textschatten-Flag ---
  const shadowParam = (params.get('shadow') || '').toLowerCase();
  if (shadowParam === 'none' || shadowParam === 'off') {
    injectStyle(`.message-text, .chatter-name { text-shadow:none!important; filter:none!important; }`);
  }

  // --- Emote-Solo-Größe ---
  injectStyle(`.twitch-emote.solo-emote, .seventv-emote.solo-emote { height:4em!important; margin-top:8px; }`);

  // --- WebSocket ---
  function initWebSocket(){
    const wsUrl = computeWsUrl();
    ws = new WebSocket(wsUrl);

    ws.addEventListener('open', () => {
      const streamerParam = params.get('streamer');
      const streamerName = streamerParam ? streamerParam.trim() : '';
      if (!streamerName || !/^[a-zA-Z0-9_]{3,25}$/.test(streamerName)) {
        console.error('Ungültiger Streamername. Overlay nicht geladen.');
        handleJoinStatusMessage({ status: 'error', message: 'Ungültiger Streamername. Prüfe die URL (&streamer=).' });
        reconnectAllowed = false;
        try { ws.close(1008, 'invalid_streamer'); } catch {}
        return;
      }
      ws.send(JSON.stringify({ streamerName }));
      pendingDeleteIds.clear();
      handleJoinStatusMessage({ status: 'joined' });
    });

    ws.addEventListener('message', async (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'join_status') {
        handleJoinStatusMessage(message);
        return;
      }

      if (message.type === 'clear_user_messages' && message.username) {
       const key = (message.username || '').toLowerCase();
       const elements = userMessages.get(key);
        if (elements) {
          elements.forEach(el => {
            const idx = messageQueue.indexOf(el);
            if (idx > -1) messageQueue.splice(idx, 1);
            removeMessage(el, 'mod-clear');
          });
          userMessages.delete(key);
        }
        return;
      }

     if (message.type === 'clear_message_id' && message.id) {
       const el = chatContainer.querySelector(`[data-msgid="${message.id}"]`);
       if (el) {
         const idx = messageQueue.indexOf(el);
         if (idx > -1) messageQueue.splice(idx, 1);
         const uname = (el.getAttribute('data-username') || '').toLowerCase();
         if (uname && userMessages.has(uname)) {
           const set = userMessages.get(uname);
           set.delete(el);
           if (set.size === 0) userMessages.delete(uname);
         }
         removeMessage(el, 'mod-clear-id');
       } else {
        pendingDeleteIds.add(message.id);
       }
       return;
     }

     if (message.type === 'clear_all') {
       // alle TTLs stoppen
       ttlTimers.forEach((id) => clearTimeout(id));
       ttlTimers.clear();

       chatContainer.innerHTML = '';
       messageQueue.length = 0;
       userMessages.clear();
       pendingDeleteIds.clear();
       return;
     }

      if (message.type !== 'chat') return;
      const sender = (message.username || '').toLowerCase();
      if ((hideBots && knownBots.includes(sender)) || userIgnoredBots.includes(sender)) return;

      // **Sicherheit**: eingehende sevenTvColor normalisieren
      if (message && 'sevenTvColor' in message) {
        message.sevenTvColor = normalizeCssColor(message.sevenTvColor);
      }
      await renderMessage(message);
    });

    ws.addEventListener('close', () => {
      console.warn('WebSocket-Verbindung verloren, versuche erneut...');
      if (reconnectAllowed) setTimeout(initWebSocket, 3000);
    });

    ws.addEventListener('error', (err) => {
      console.error('WebSocket Fehler:', err);
    });
  }

  if (isPreview) {
    const script = document.createElement('script');
    script.src = 'dummy-messages.js';
    script.onload = () => {
      if (Array.isArray(window.DUMMY_MESSAGES)) {
        // Normalisieren – falls Dummy-Zahlen
        window.DUMMY_MESSAGES.forEach(m => { m.sevenTvColor = normalizeCssColor(m.sevenTvColor); });
        window.DUMMY_MESSAGES.forEach((msg, i) => setTimeout(() => { renderMessage(msg); }, i * 800));
      }
    };
    script.onerror = () => console.error('Konnte Dummy-Nachrichten nicht laden.');
    document.head.appendChild(script);
  } else {
    initWebSocket();
  }

  if (chatWrapper) chatWrapper.style.display = 'flex';

  // ---------- Rendering ----------
  function appendTextWithMentions(text, container, message) {
    const mentionRegex = /@(\w+)/g;
    let match; let lastIndex = 0;

    while ((match = mentionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const mentionedName = match[1];
      const mentionSpan = document.createElement('span');
      mentionSpan.textContent = `@${mentionedName}`;
      mentionSpan.style.fontWeight = 'bold';

      // Eigene @Mention farblich hervorheben
      if (mentionedName.toLowerCase() === (message.username || '').toLowerCase()) {
        if (nameOverride) {
          mentionSpan.style.color = nameOverride;
        } else if (message.sevenTvPaint) {
          applyPaintStyle(
            mentionSpan,
            message.sevenTvPaint,
            (message.sevenTvColor || message.twitchColor || '#fff')
          );
        } else if (message.sevenTvColor) {
          mentionSpan.style.color = message.sevenTvColor;
        } else if (message.twitchColor) {
          mentionSpan.style.color = message.twitchColor;
        } else {
          mentionSpan.style.color = '#fff';
        }
      }

      container.appendChild(mentionSpan);
      lastIndex = mentionRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function decimalToRGBAString(num) {
    const r = (num >>> 24) & 0xff;
    const g = (num >>> 16) & 0xff;
    const b = (num >>> 8) & 0xff;
    const a = num & 0xff;
    return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  }

  function applyPaintStyle(el, paint, fallbackColor = null) {
    if (!paint) { if (fallbackColor) el.style.color = fallbackColor; return; }
    let background = '';
    const rep = paint.repeat ? 'repeating-' : '';

    if (paint.function === 'LINEAR_GRADIENT' || paint.function === 'RADIAL_GRADIENT') {
      const stops = paint.stops.map(s => `${decimalToRGBAString(s.color)} ${s.at * 100}%`);
      background = paint.function === 'LINEAR_GRADIENT'
        ? `${rep}linear-gradient(${paint.angle ?? 270}deg, ${stops.join(',')})`
        : `${rep}radial-gradient(${paint.shape ?? 'circle'}, ${stops.join(',')})`;
    } else if (paint.function === 'URL') {
      background = `url(${paint.image_url})`;
    }

    el.style.backgroundImage = background;
    el.style.backgroundSize  = '100% 100%';
    el.style.backgroundClip  = 'text';
    el.style.webkitBackgroundClip = 'text';
    el.style.color = 'transparent';
    el.style.webkitTextFillColor = 'transparent';

    if (Array.isArray(paint.shadows)) {
      const f = paint.shadows.map(sh => `drop-shadow(${sh.x_offset}px ${sh.y_offset}px ${sh.radius}px ${decimalToRGBAString(sh.color)})`).join(' ');
      el.style.filter = f;
    }
    el.classList.add('seven-tv-paint');

    const wantAnim =
      params.get('paintAnim') === 'yes' ||
      (paint.function === 'URL' && /\.(gif|apng)$/i.test(paint.image_url || ''));
    if (wantAnim) el.classList.add('animated');
  }

  async function renderMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    if (message.messageId) messageElement.dataset.msgid = message.messageId;
    if (message.messageId && pendingDeleteIds.has(message.messageId)) {
      pendingDeleteIds.delete(message.messageId);
      return;
    }    
    const lowerUser = (message.username || '').toLowerCase();
    messageElement.setAttribute('data-username', lowerUser);

    const rawMessage = typeof message.message === 'string' ? message.message : '';
    const trimmedMessage = rawMessage.trim();
    const twitchEmotes = (message.twitchEmotes || []).map(e => ({ ...e, provider: 'twitch' }));
    const thirdPartyEmotes = [
      ...(message.sevenTvEmotes || []),
      ...(message.ffzEmotes || []),
      ...(message.bttvEmotes || []),
    ].map(e => ({ ...e, provider: e.provider || (e.url?.includes('7tv') ? '7tv' : 'third') }));
    const emotes = [...twitchEmotes, ...thirdPartyEmotes].sort((a,b)=>a.start-b.start);
    const onlyOneEmote = emotes.length === 1 && trimmedMessage === emotes[0].code;

    const textElement = document.createElement('span');
    textElement.className = 'message-text';

    let lastIndex = 0;
    emotes.forEach(emote => {
      if (emote.start > lastIndex) {
        const segment = rawMessage.slice(lastIndex, emote.start);
        appendTextWithMentions(segment, textElement, message);
      }
      const img = document.createElement('img');
      img.src = emote.url; img.alt = emote.code;
      const provider = emote.provider || (emote.url && emote.url.includes('twitch') ? 'twitch' : 'third');
      img.className = provider === 'twitch' ? 'twitch-emote' : 'seventv-emote';
      img.dataset.provider = provider;
      img.classList.add(onlyOneEmote ? 'solo-emote' : 'inline-emote');
      textElement.appendChild(img);
      lastIndex = emote.end + 1;
    });
    if (lastIndex < rawMessage.length) {
      appendTextWithMentions(rawMessage.slice(lastIndex), textElement, message);
    }

    if (isSmallMode) {
      const line = document.createElement('div');
      line.className = 'message-line';

      const full = document.createElement('span');
      full.className = 'full-line';

      if (message.profileImageUrl && document.body.getAttribute('data-avatar') === 'yes') {
        const profileImg = document.createElement('img');
        profileImg.src = message.profileImageUrl;
        profileImg.className = 'profile-image';
        full.appendChild(profileImg);
      }

      (message.badges || []).forEach(badgeData => {
        const info = typeof badgeData === 'string' ? { url: badgeData } : (badgeData || {});
        if (!info.url) return;
        const b = document.createElement('img');
        b.src = info.url;
        b.className = 'badge';
        if (info.provider) b.dataset.provider = info.provider;
        if (info.backgroundColor) {
          b.style.backgroundColor = info.backgroundColor;
          b.style.borderRadius = '4px';
          b.style.padding = '1px';
        }
        if (info.tooltip) b.title = info.tooltip;
        full.appendChild(b);
      });
      if ((message.badges || []).length === 0) full.classList.add('no-badge');

      const nameEl = document.createElement('span');
      nameEl.className = 'chatter-name';
      nameEl.textContent = message.displayName || message.username;

      if (nameOverride) {
        nameEl.style.color = nameOverride;
      } else if (message.sevenTvPaint) {
        applyPaintStyle(
          nameEl,
          message.sevenTvPaint,
          (message.sevenTvColor || message.twitchColor || '#fff')
        );
      } else if (message.sevenTvColor) {
        nameEl.style.color = message.sevenTvColor;
      } else if (message.twitchColor) {
        nameEl.style.color = message.twitchColor;
      } else {
        nameEl.style.color = '#fff';
      }

      full.appendChild(nameEl);
      full.appendChild(textElement);
      line.appendChild(full);
      messageElement.appendChild(line);
    } else {
      const firstLine = document.createElement('div');
      firstLine.className = 'first-line';

      if (message.profileImageUrl) {
        const profileImg = document.createElement('img');
        profileImg.src = message.profileImageUrl;
        profileImg.className = 'profile-image';
        firstLine.appendChild(profileImg);
      }

      (message.badges || []).forEach(badgeData => {
        const info = typeof badgeData === 'string' ? { url: badgeData } : (badgeData || {});
        if (!info.url) return;
        const b = document.createElement('img');
        b.src = info.url;
        b.className = 'badge';
        if (info.provider) b.dataset.provider = info.provider;
        if (info.backgroundColor) {
          b.style.backgroundColor = info.backgroundColor;
          b.style.borderRadius = '4px';
          b.style.padding = '1px';
        }
        if (info.tooltip) b.title = info.tooltip;
        firstLine.appendChild(b);
      });
      if ((message.badges || []).length === 0) firstLine.classList.add('no-badge');

      const nameEl = document.createElement('span');
      nameEl.className = 'chatter-name';
      nameEl.textContent = message.displayName || message.username;

      if (nameOverride) {
        nameEl.style.color = nameOverride;
      } else if (message.sevenTvPaint) {
        applyPaintStyle(
          nameEl,
          message.sevenTvPaint,
          (message.sevenTvColor || message.twitchColor || '#fff')
        );
      } else if (message.sevenTvColor) {
        nameEl.style.color = message.sevenTvColor;
      } else if (message.twitchColor) {
        nameEl.style.color = message.twitchColor;
      } else {
        nameEl.style.color = '#fff';
      }

      firstLine.appendChild(nameEl);
      messageElement.appendChild(firstLine);
      messageElement.appendChild(textElement);
    }

    // Einfügen + Tracking
    chatContainer.appendChild(messageElement);
    messageQueue.push(messageElement);

    if (!userMessages.has(lowerUser)) userMessages.set(lowerUser, new Set());
    userMessages.get(lowerUser).add(messageElement);

    // sanftes Staffel-Delay
    messageElement.style.setProperty('--stagger', (__enterCounter++ % 5));

    // Enter-Phase markieren
    messageElement.classList.add('is-entering');
    const clearEntering = () => messageElement.classList.remove('is-entering');
    messageElement.addEventListener('animationend', (e) => {
      if (e.animationName === 'msg-enter' || e.animationName === 'slideIn') clearEntering();
    });
    messageElement.addEventListener('animationcancel', clearEntering, { once: true });
    setTimeout(clearEntering, 1000);

    await new Promise(r => requestAnimationFrame(r));

    // TTL starten
    if (ttlSec) {
      const startAfterEnter = () => scheduleTtl(messageElement);

      if (messageElement.classList.contains('is-entering')) {
        const onEnterDone = (e) => {
          if (e.animationName === 'msg-enter' || e.animationName === 'slideIn') {
            messageElement.removeEventListener('animationend', onEnterDone);
            startAfterEnter();
          }
        };
        messageElement.addEventListener('animationend', onEnterDone);
        setTimeout(() => { if (!ttlTimers.has(messageElement)) startAfterEnter(); }, 1100);
      } else {
        startAfterEnter();
      }
    }

    if (!noPrune) {
      while (messageQueue.length > 0) {
        const first = messageQueue[0];
        if (first.classList.contains('is-entering')) break;

        const rect = first.getBoundingClientRect();
        const wrapperRect = chatWrapper.getBoundingClientRect();
        const compactBody = document.body.getAttribute('data-compact') === 'yes';
        const tol = compactBody ? 0 : 2;

        const fullyVisible =
          Math.floor(rect.top) >= Math.ceil(wrapperRect.top) + tol &&
          Math.ceil(rect.bottom) <= Math.floor(wrapperRect.bottom) - tol;

        if (!fullyVisible) {
          if (chatContainer.contains(first)) {
            removeMessage(first, 'prune');
          } else {
            const idx = messageQueue.indexOf(first);
            if (idx > -1) messageQueue.splice(idx, 1);
          }
        } else {
          break;
        }
      }
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  window.addEventListener('error', (e) => console.error('[Overlay Fehler]', e.message));
  window.addEventListener('unhandledrejection', (e) => console.warn('[Overlay Promise Fehler]', e.reason));
}
