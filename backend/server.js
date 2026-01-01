'use strict';

try { require('dotenv').config(); } catch (_) {}

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const compression = require('compression');
const WebSocket = require('ws');
const tmi = require('tmi.js');
const dns = require('dns');

try { dns.setDefaultResultOrder && dns.setDefaultResultOrder('ipv4first'); } catch {}

const DEBUG_TMI = String(process.env.DEBUG_TMI || 'false').toLowerCase() === 'true';

const tmiLogger = {
  info: () => {},
  warn: (...args) => {
    const msg = args.map(a => (typeof a === 'string' ? a : '')).join(' ');

    if (/ping timeout/i.test(msg)) return;
    if (/no response from twitch/i.test(msg)) return;

    console.warn('[tmi]', ...args);
  },
  error: (...args) => console.warn('[tmi]', ...args),
};

const RETRYABLE_CODES = new Set(['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENOTFOUND']);
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

const fetch = global.fetch
  ? global.fetch.bind(global)
  : ((...a)=>import('node-fetch').then(({default:f})=>f(...a)));

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 2500 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchJsonRetry(url, { method='GET', headers={}, body, timeout=5000, retries=2, backoff=300 } = {}) {
  let lastErr;
  for (let attempt=0; attempt<=retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { method, headers, body, timeout });
      if (!res.ok) { const err = new Error(`HTTP ${res.status}`); err.status = res.status; throw err; }
      return await res.json();
    } catch (err) {
      lastErr = err;
      const code = err?.cause?.code || err?.code || err?.name;
      if (attempt < retries && (code === 'AbortError' || RETRYABLE_CODES.has(code) || err?.status >= 500)) {
        await sleep(backoff * Math.pow(2, attempt) + Math.floor(Math.random()*100));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---- Config ----
const cfgPath = path.join(__dirname, 'config.secret.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
const CLIENT_ID = process.env.TWITCH_CLIENT_ID || cfg.client_id;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || cfg.client_secret;
if (!CLIENT_ID || !CLIENT_SECRET) { console.error('❌ TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET fehlen'); process.exit(1); }

const PORT = Number(process.env.PORT || 3010);
const USE_LOCAL_FRONTEND = String(process.env.USE_LOCAL_FRONTEND || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

// ---- App + HTTP/WS ----
const app = express();
app.use(compression());
if (USE_LOCAL_FRONTEND) app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ---- Token file + refresh ----
const TOKEN_FILE = path.join(__dirname, 'twitch_token.json');
let appToken = null;
let tokenMeta = { obtainmentTimestamp: null, expires_in: null };

function loadTokenFile() {
  try {
    const json = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    appToken = json.access_token || null;
    tokenMeta.obtainmentTimestamp = json.obtainmentTimestamp || json.created_at || null;
    tokenMeta.expires_in = json.expires_in || null;
    if (!appToken) throw new Error('access_token fehlt');
  } catch (e) { console.error('❌ twitch_token.json:', e.message); }
}
loadTokenFile();
if (!appToken) refreshAppTokenInline();
if (fs.existsSync(TOKEN_FILE)) {
  fs.watch(TOKEN_FILE, { persistent: false }, (evt) => { if (evt === 'change') setTimeout(loadTokenFile, 80); });
}

async function refreshAppTokenInline() {
  try {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}&grant_type=client_credentials`;
    const resp = await fetch(url, { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok || !data.access_token) throw new Error(`Token-Refresh: ${resp.status} ${JSON.stringify(data)}`);
    appToken = data.access_token;
    tokenMeta.expires_in = data.expires_in;
    tokenMeta.obtainmentTimestamp = Date.now();
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ access_token: appToken, expires_in: tokenMeta.expires_in, obtainmentTimestamp: tokenMeta.obtainmentTimestamp }, null, 2));
    console.log('🔁 App-Token erneuert');
  } catch (e) { console.error('❌ Token-Refresh:', e.message); }
}
const getToken = () => appToken;

// ---- Caches ----
const CACHE_TTL = 15 * 60 * 1000;
const USER_PROFILE_TTL = 6 * 60 * 60 * 1000;
const badgeCache = { global: null, channels: {} };
const sevenTvEmoteCache = { global: null, channels: {} };
const ffzEmoteCache = { global: null, channels: {} };
const bttvEmoteCache = { global: null, channels: {} };
const sevenTvStyleCache = { users: {} };
const userProfileCache = new Map();
const inflightUserReq = new Map();
const inflightBadges = new Map();
const inflightSeven = new Map();
const inflightFFZ = new Map();
const inflightBTTV = new Map();
const CHATTERINO_BADGES_TTL = 6 * 60 * 60 * 1000;
const FFZ_BADGES_TTL = 6 * 60 * 60 * 1000;
const BTTV_BADGES_TTL = 6 * 60 * 60 * 1000;
const ffzBadgeCache = new Map();
const inflightFfzBadges = new Map();
const bttvBadgeCache = new Map();
const bttvBadgeDefinitions = { map: null, fetchedAt: 0 };
const inflightBttvBadges = new Map();
let inflightBttvBadgeDefs = null;
let chatterinoBadges = { byUserId: null, fetchedAt: 0 };
let inflightChatterino = null;

// ---- Overlay subscribers ----
const channelSubscribers = new Map();
const streamerActivity = new Map();

function recordStreamerActivity(streamer, connected, subsCount) {
  const now = new Date().toISOString();
  let entry = streamerActivity.get(streamer);
  if (!entry) {
    entry = {
      streamer,
      first_seen_at: now,
      last_seen_at: now,
      last_connected_at: null,
      last_disconnected_at: null,
      connected: false,
      subscribers: 0,
    };
  } else {
    entry.last_seen_at = now;
  }
  if (connected && !entry.connected) entry.last_connected_at = now;
  if (!connected && entry.connected) entry.last_disconnected_at = now;
  entry.connected = connected;
  entry.subscribers = subsCount;
  streamerActivity.set(streamer, entry);
}

function broadcastToOverlay(channel, dataObj) {
  const streamer = channel.replace(/^#/, '').toLowerCase();
  const clients = channelSubscribers.get(streamer);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify(dataObj);
  clients.forEach(ws => { try { if (ws.readyState === WebSocket.OPEN) ws.send(payload); } catch (e) {} });
}

// ---- Single tmi client + join management ----
const wantedChannels = new Set();
const joinedChannels = new Set();
const joinQueue = [];
let joinTimer = null;
const permanentJoinFailures = new Map();
const joinRetryState = new Map();
const PERMANENT_JOIN_ERRORS = [
  'msg_channel_suspended',
  'msg_room_not_found',
  'msg_banned',
  'msg_invalid_user',
  'msg_channel_privacy_mode',
  'msg_login_failed',
];
const PERMANENT_JOIN_RESET_MS = 10 * 60 * 1000;
const JOIN_BACKOFF_BASE_MS = 3000;
const JOIN_BACKOFF_MAX_MS = 5 * 60 * 1000;
const JOIN_MAX_RETRIES = 8;
const JOIN_COOLDOWN_MS = 60 * 60 * 1000;
const JOIN_LOG_THROTTLE_MS = 60 * 1000;

function startJoinPump(intervalMs = 900) {
  if (joinTimer) return;
  joinTimer = setInterval(async () => {
    if (joinQueue.length === 0) { clearInterval(joinTimer); joinTimer = null; return; }
    const ch = joinQueue.shift();
    const streamer = ch.slice(1);
    const now = Date.now();
    const state = joinRetryState.get(streamer);
    if (state) {
      const nextAt = state.cooldownUntil || state.nextRetryAt;
      if (nextAt && now < nextAt) {
        const wait = Math.max(nextAt - now, 200);
        setTimeout(() => enqueueJoin(streamer), wait);
        return;
      }
    }
    try {
      await tmiClient.join(streamer);
      joinedChannels.add(ch);
      joinRetryState.delete(streamer);
      permanentJoinFailures.delete(streamer);
      if (DEBUG_TMI) console.log('[tmi] joined', ch);
      broadcastJoinStatus(streamer, { status: 'joined' });
    } catch (e) {
      const message = e?.message || e;
      const permanentCode = classifyJoinError(message);
      if (permanentCode) {
        joinRetryState.delete(streamer);
        recordPermanentJoinFailure(streamer, permanentCode, message);
      } else {
        const s = joinRetryState.get(streamer) || { failCount: 0, nextRetryAt: 0, cooldownUntil: 0, lastLogAt: 0 };
        s.failCount += 1;
        const delay = Math.min(JOIN_BACKOFF_BASE_MS * Math.pow(2, s.failCount - 1), JOIN_BACKOFF_MAX_MS);
        s.nextRetryAt = Date.now() + delay;
        if (s.failCount >= JOIN_MAX_RETRIES) {
          s.failCount = 0;
          s.cooldownUntil = Date.now() + JOIN_COOLDOWN_MS;
          s.nextRetryAt = s.cooldownUntil;
        }
        const logNow = !s.lastLogAt || (Date.now() - s.lastLogAt) >= JOIN_LOG_THROTTLE_MS;
        if (logNow) {
          s.lastLogAt = Date.now();
          console.warn('[tmi] join failed', ch, message);
        }
        joinRetryState.set(streamer, s);
        setTimeout(() => enqueueJoin(streamer), Math.max(200, s.nextRetryAt - Date.now()));
      }
    }
  }, intervalMs);
}
function enqueueJoin(streamer) {
  const s = String(streamer).trim().toLowerCase();
  const ch = `#${s}`;
  if (joinedChannels.has(ch) || joinQueue.includes(ch)) return;
  joinQueue.push(ch);
  startJoinPump();
}
function ensureJoined(streamer) {
  const s = String(streamer).trim().toLowerCase();
  if (!s) return;
  wantedChannels.add(s);
  if (permanentJoinFailures.has(s)) {
    const failure = permanentJoinFailures.get(s);
    broadcastJoinStatus(s, { status: 'error', code: failure.code, message: failure.message, details: failure.details });
    return;
  }
  enqueueJoin(s);
}
async function maybePart(streamer) {
  const s = String(streamer).trim().toLowerCase();
  const ch = `#${s}`;
  const subs = channelSubscribers.get(s);
  if (subs && subs.size > 0) return;
  wantedChannels.delete(s);
  if (!joinedChannels.has(ch)) return;
  try {
    await tmiClient.part(s);
    joinedChannels.delete(ch);
    if (DEBUG_TMI) console.log('[tmi] parted', ch);
  } catch (e) {
    const msg = e?.message || String(e || '');
    if (/no response from twitch/i.test(msg)) {
      joinedChannels.delete(ch);
      if (DEBUG_TMI) console.log('[tmi] part timeout, treating as success', ch);
    } else {
      console.warn('[tmi] part failed', ch, msg);
      setTimeout(() => {
        if (!wantedChannels.has(s) && joinedChannels.has(ch)) maybePart(s);
      }, 2000);
    }
  }
}

function classifyJoinError(err) {
  const msg = String(err || '').toLowerCase();
  if (!msg) return null;
  return PERMANENT_JOIN_ERRORS.find(code => msg.includes(code)) || null;
}

function joinErrorMessage(code) {
  switch (code) {
    case 'msg_channel_suspended': return 'Twitch hat den Kanal gesperrt.';
    case 'msg_room_not_found': return 'Twitch kennt diesen Kanal nicht (room not found).';
    case 'msg_banned': return 'Twitch hat diesen Kanal gebannt.';
    case 'msg_invalid_user': return 'Ungültiger Kanalname oder Benutzer existiert nicht.';
    case 'msg_channel_privacy_mode': return 'Der Kanal ist aktuell im Privacy Mode.';
    case 'msg_login_failed': return 'Login bei Twitch fehlgeschlagen, prüfe die Zugangsdaten.';
    default: return 'Konnte dem Twitch-Chat nicht beitreten.';
  }
}

function broadcastJoinStatus(streamer, payload) {
  const s = String(streamer).trim().toLowerCase();
  if (!s) return;
  const clients = channelSubscribers.get(s);
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify({ type: 'join_status', streamer: s, ...payload });
  clients.forEach(ws => { try { if (ws.readyState === WebSocket.OPEN) ws.send(data); } catch {} });
}

function recordPermanentJoinFailure(streamer, code, details) {
  const failure = {
    code,
    message: joinErrorMessage(code),
    details: String(details || ''),
    ts: Date.now(),
  };
  permanentJoinFailures.set(streamer, failure);
  broadcastJoinStatus(streamer, { status: 'error', code: failure.code, message: failure.message, details: failure.details });
  const timer = setTimeout(() => {
    const current = permanentJoinFailures.get(streamer);
    if (current && current.ts === failure.ts) {
      permanentJoinFailures.delete(streamer);
      if (wantedChannels.has(streamer)) enqueueJoin(streamer);
    }
  }, PERMANENT_JOIN_RESET_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

const tmiClient = new tmi.Client({
  options: { debug: false },
  connection: { secure: true, reconnect: true },
  logger: tmiLogger,
});

// ---- tmi events (minimal logs) ----
let reconnects = 0;
setInterval(() => { if (reconnects > 3) console.warn('[tmi] reconnects last 60m:', reconnects); reconnects = 0; }, 60 * 60 * 1000);

if (DEBUG_TMI) {
  tmiClient.on('connecting', (addr, port) => console.log(`[tmi] connecting ${addr}:${port}`));
  tmiClient.on('serverchange', (addr, port) => console.log(`[tmi] serverchange ${addr}:${port}`));
  tmiClient.on('notice', (_ch, type, msg) => console.warn('[tmi notice]', type, msg));
}

tmiClient.on('reconnect', () => reconnects++);
tmiClient.on('connected', (addr, port) => {
  console.log(`[tmi] connected @ ${addr}:${port}`);
  for (const s of wantedChannels) {
    if (permanentJoinFailures.has(s)) {
      const failure = permanentJoinFailures.get(s);
      broadcastJoinStatus(s, { status: 'error', code: failure.code, message: failure.message, details: failure.details });
      continue;
    }
    enqueueJoin(s);
  }
});
tmiClient.on('disconnected', (reason) => {
  const msg = String(reason || '');
  if (/ping timeout/i.test(msg) && !DEBUG_TMI) return;
  console.warn('[tmi] disconnected:', msg);
});
tmiClient.on('pong', (lat) => { if (lat > 4000) console.warn('[tmi] high latency:', lat, 'ms'); });

['timeout', 'ban'].forEach(evt =>
  tmiClient.on(evt, (channel, username) =>
    broadcastToOverlay(channel, { type: 'clear_user_messages', username: (username || '').toLowerCase() })
  )
);
tmiClient.on('clearchat', (channel) => broadcastToOverlay(channel, { type: 'clear_all' }));
tmiClient.on('messagedeleted', (channel, username, _m, userstate) => {
  const name = (userstate?.login || userstate?.username || username || '').toLowerCase();
  const id = userstate?.['target-msg-id'];
  if (id) broadcastToOverlay(channel, { type: 'clear_message_id', id, username: name });
  else if (name) broadcastToOverlay(channel, { type: 'clear_user_messages', username: name });
});
tmiClient.on('message', (channel, tags, text, self) => {
  if (self) return;
  setImmediate(() => enqueueWork(() => enqueueChannelWork(channel, () => handleIncomingMessage(channel, tags, text))));
});

tmiClient.connect().catch(err => console.error('❌ TMI connect:', err?.message || err));

// ---- WS server ----
wss.on('connection', (ws, req) => {
  const origin = (req.headers.origin || 'null');
  if (ALLOWED_ORIGINS.length && origin !== 'null' && !ALLOWED_ORIGINS.includes(origin)) { ws.close(1008, 'Origin not allowed'); return; }
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (msg) => {
    let parsed; try { parsed = JSON.parse(msg); } catch { return; }
    if (!parsed.streamerName) return;
    const streamer = String(parsed.streamerName || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,25}$/.test(streamer)) return;
    if (!channelSubscribers.has(streamer)) channelSubscribers.set(streamer, new Set());
    channelSubscribers.get(streamer).add(ws);
    recordStreamerActivity(streamer, true, channelSubscribers.get(streamer).size);
    ensureJoined(streamer);
  });
  ws.on('close', () => {
    channelSubscribers.forEach((subs, streamer) => {
      if (!subs.delete(ws)) return;
      if (subs.size === 0) {
        recordStreamerActivity(streamer, false, 0);
        maybePart(streamer);
      } else {
        recordStreamerActivity(streamer, true, subs.size);
      }
    });
  });
  ws.on('error', () => {}); // stumm
});

const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch {} });
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`🚀 Backend läuft auf Port ${PORT}  |  USE_LOCAL_FRONTEND=${USE_LOCAL_FRONTEND}`));

// ---- Admin overlay stats (with secret) ----
const ADMIN_SECRET =
  (process.env.OVERLAY_ADMIN_SECRET ||
   (cfg && (cfg.overlay_admin_secret || cfg.admin_secret)) ||
   ''
  ).trim();

function getOverlayStats() {
  let subs = 0;
  const channels = {};
  for (const [streamer, set] of channelSubscribers.entries()) {
    channels[streamer] = set.size;
    subs += set.size;
  }
  return {
    time: new Date().toISOString(),
    total_ws_clients: wss.clients.size,
    overlay_subscribers: subs,
    connected_streamers: Object.keys(channels).length,
    channels,
    streamer_activity: Array.from(streamerActivity.values()),
    wanted_channels: wantedChannels.size,
    joined_channels: joinedChannels.size,
    join_queue: joinQueue.length,
    work_queue: workQueue.length,
    workers_active: activeWorkers,
  };
}

app.get('/_admin/overlay-stats', (req, res) => {
  const token = req.get('x-admin-secret') || req.query.secret;
  if (!ADMIN_SECRET || token !== ADMIN_SECRET) return res.status(401).json({ ok: false, error: 'unauthorized' });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, stats: getOverlayStats() });
});

app.get('/_admin/overlay', (req, res) => {
  const token = req.query.secret;
  if (!ADMIN_SECRET || token !== ADMIN_SECRET) return res.status(401).send('unauthorized');
  res.set('Cache-Control', 'no-store');
  res.type('html').send(`<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Overlay Live</title>
<style>
  body{font:14px system-ui;margin:24px;background:#0b0b0b;color:#ddd}
  h1{font-size:18px;margin:0 0 10px}
  pre{background:#111;padding:12px;border-radius:8px;overflow:auto}
  small{opacity:.7}
</style>
<h1>Overlay Live <small>(auto-refresh)</small></h1>
<div id="root">Loading…</div>
<script>
  const secret = new URLSearchParams(location.search).get('secret');
  async function poll(){
    const r = await fetch('/_admin/overlay-stats?secret=' + encodeURIComponent(secret));
    const j = await r.json();
    const s = j.stats;
    const summary = {
      time: s.time,
      total_ws_clients: s.total_ws_clients,
      overlay_subscribers: s.overlay_subscribers,
      connected_streamers: s.connected_streamers,
      wanted_channels: s.wanted_channels,
      joined_channels: s.joined_channels,
      join_queue: s.join_queue,
      work_queue: s.work_queue,
      workers_active: s.workers_active
    };
    const activity = (s.streamer_activity || []).slice().sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      const aSeen = a.last_seen_at || '';
      const bSeen = b.last_seen_at || '';
      return bSeen.localeCompare(aSeen);
    });
    const channelsSorted = {};
    for (const entry of activity) {
      channelsSorted[entry.streamer] = entry.connected
        ? (s.channels[entry.streamer] || 0)
        : 0;
    }
    for (const [streamer, count] of Object.entries(s.channels || {})) {
      if (!(streamer in channelsSorted)) channelsSorted[streamer] = count;
    }
    document.getElementById('root').innerHTML =
      '<pre>'+JSON.stringify(summary, null, 2)+'</pre>' +
      '<h1>By Channel</h1><pre>'+JSON.stringify(channelsSorted, null, 2)+'</pre>';
  }
  setInterval(poll, 2000);
  poll();
</script>`);
});

// ---- Light work queue ----
const WORK_CONCURRENCY = 8;
const workQueue = [];
let activeWorkers = 0;
const channelPipelines = new Map();

function enqueueWork(fn) { workQueue.push(fn); drainWork(); }
function drainWork() {
  while (activeWorkers < WORK_CONCURRENCY && workQueue.length > 0) {
    const fn = workQueue.shift();
    activeWorkers++;
    Promise.resolve().then(fn).catch(() => {}).finally(() => {
      activeWorkers--;
      if (workQueue.length > 0) setImmediate(drainWork);
    });
  }
}

function enqueueChannelWork(channel, task) {
  const key = channel.replace(/^#/, '').toLowerCase();
  const prev = channelPipelines.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(task);
  let wrapped;
  wrapped = run.catch(err => {
    console.warn('[tmi] channel work error', key, err?.message || err);
  }).finally(() => {
    if (channelPipelines.get(key) === wrapped) channelPipelines.delete(key);
  });
  channelPipelines.set(key, wrapped);
  return wrapped;
}

// ---- Message handler ----
async function handleIncomingMessage(channel, tags, text) {
  const lowerCh = channel.slice(1).toLowerCase();
  const subs = channelSubscribers.get(lowerCh);
  if (!subs || subs.size === 0) return;

  const messageText = typeof text === 'string' ? text : String(text ?? '');

  const uid = tags['user-id'];
  const login = (tags['login'] || tags['username'] || '').toLowerCase();
  let profileImageUrl = await getTwitchUserProfile({ uid, login });

  const broadcasterId = tags['room-id'];
  try { await ensureBadges(broadcasterId); } catch {}

  const badgeUrls = parseBadges(tags['badges-raw'], badgeCache.global || [], badgeCache.channels[broadcasterId] || []);

  // Chatterino Supporter/Contributor Badge ergänzen
  try { await ensureChatterinoBadges(); } catch {}
  const ciBadge = getChatterinoBadgeUrlForUser(uid);
  if (ciBadge) badgeUrls.push(ciBadge);  

  const [sevenStyle, ffzBadgeUrls, bttvBadgeUrls] = await Promise.all([
    fetchSevenTvStyle(uid).catch(() => null),
    fetchFfzBadges({ userId: uid, login }).catch(() => []),
    fetchBttvBadges(uid).catch(() => []),
  ]);
  if (Array.isArray(ffzBadgeUrls) && ffzBadgeUrls.length) badgeUrls.push(...ffzBadgeUrls);
  if (Array.isArray(bttvBadgeUrls) && bttvBadgeUrls.length) badgeUrls.push(...bttvBadgeUrls);
  if (sevenStyle?.badge) badgeUrls.push(sevenStyle.badge);

  const twColorRaw = typeof tags.color === 'string' ? tags.color : null;
  const twColor = (twColorRaw && /^#[0-9a-fA-F]{6}$/.test(twColorRaw)) ? twColorRaw : null;
  const twDefault = twColor ? null : pickTwitchDefaultColor(uid || login);
  const sevenColor = normalizeSevenTvHex(sevenStyle?.color);

  await Promise.allSettled([
    ensureSevenTv(broadcasterId),
    ensureFFZ(broadcasterId),
    ensureBTTV(broadcasterId),
  ]);

  const sevenChan = sevenTvEmoteCache.channels[broadcasterId]?.data || [];
  const sevenGlob = sevenTvEmoteCache.global?.data || [];
  const ffzChan = ffzEmoteCache.channels[broadcasterId]?.data || [];
  const ffzGlob = ffzEmoteCache.global?.data || [];
  const bttvChan = bttvEmoteCache.channels[broadcasterId]?.data || [];
  const bttvGlob = bttvEmoteCache.global?.data || [];

  const externalEmotesRaw = [
    ...sevenChan, ...sevenGlob,
    ...ffzChan, ...ffzGlob,
    ...bttvChan, ...bttvGlob,
  ];
  const thirdPartyEmotes = externalEmotesRaw.length
    ? parseThirdPartyEmotes(externalEmotesRaw, messageText)
    : [];
  const sevenEmotes = thirdPartyEmotes.filter(e => e.provider === '7tv');
  const ffzEmotes = thirdPartyEmotes.filter(e => e.provider === 'ffz');
  const bttvEmotes = thirdPartyEmotes.filter(e => e.provider === 'bttv');
  const twEmotes = parseTwitchEmotes(tags.emotes, messageText);

  const msgData = {
    type: 'chat',
    username: tags.username,
    displayName: tags['display-name'],
    message: messageText,
    messageId: tags['id'],
    badges: badgeUrls,
    profileImageUrl,
    twitchEmotes: twEmotes,
    sevenTvEmotes: sevenEmotes,
    ffzEmotes,
    bttvEmotes,
    sevenTvColor: sevenColor || null,
    twitchColor: twColor || twDefault || null,
    sevenTvPaint: sevenStyle?.paint || null
  };

  const payload = JSON.stringify(msgData);
  subs.forEach(s => { try { if (s.readyState === WebSocket.OPEN) s.send(payload); } catch {} });
}

// ---- Badges / 7TV helpers ----
async function ensureBadges(broadcasterId) {
  const needGlobal = !badgeCache.global;
  const needChan = !badgeCache.channels[broadcasterId];
  if (!needGlobal && !needChan) return;
  if (!inflightBadges.has(broadcasterId)) {
    inflightBadges.set(broadcasterId, (async () => {
      const [g, c] = await Promise.all([
        badgeCache.global ?? fetchBadges('https://api.twitch.tv/helix/chat/badges/global'),
        badgeCache.channels[broadcasterId] ?? fetchBadges(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`)
      ]);
      badgeCache.global = g;
      badgeCache.channels[broadcasterId] = c;
    })().finally(() => inflightBadges.delete(broadcasterId)));
  }
  return inflightBadges.get(broadcasterId);
}

async function ensureSevenTv(channelId) {
  const needGlobal = !sevenTvEmoteCache.global || Date.now() - sevenTvEmoteCache.global.fetchedAt >= CACHE_TTL;
  const needChan = !sevenTvEmoteCache.channels[channelId] || Date.now() - sevenTvEmoteCache.channels[channelId].fetchedAt >= CACHE_TTL;
  const keyGlobal = 'global', keyChan = String(channelId);
  const tasks = [];
  if (needGlobal && !inflightSeven.has(keyGlobal)) inflightSeven.set(keyGlobal, (async () => {
    const data = await fetchSevenTvGlobalEmotes(); sevenTvEmoteCache.global = { data, fetchedAt: Date.now() };
  })().finally(() => inflightSeven.delete(keyGlobal)));
  if (needChan && !inflightSeven.has(keyChan)) inflightSeven.set(keyChan, (async () => {
    const data = await fetchSevenTvEmotes(channelId); sevenTvEmoteCache.channels[channelId] = { data, fetchedAt: Date.now() };
  })().finally(() => inflightSeven.delete(keyChan)));
  if (inflightSeven.has(keyGlobal)) tasks.push(inflightSeven.get(keyGlobal));
  if (inflightSeven.has(keyChan)) tasks.push(inflightSeven.get(keyChan));
  if (tasks.length) await Promise.allSettled(tasks);
}

async function ensureFFZ(channelId) {
  const needGlobal = !ffzEmoteCache.global || Date.now() - ffzEmoteCache.global.fetchedAt >= CACHE_TTL;
  const needChan = !ffzEmoteCache.channels[channelId] || Date.now() - ffzEmoteCache.channels[channelId].fetchedAt >= CACHE_TTL;
  const keyGlobal = 'global', keyChan = String(channelId);
  const tasks = [];
  if (needGlobal && !inflightFFZ.has(keyGlobal)) inflightFFZ.set(keyGlobal, (async () => {
    const data = await fetchFFZGlobalEmotes();
    ffzEmoteCache.global = { data, fetchedAt: Date.now() };
  })().finally(() => inflightFFZ.delete(keyGlobal)));
  if (needChan && !inflightFFZ.has(keyChan)) inflightFFZ.set(keyChan, (async () => {
    const data = await fetchFFZChannelEmotes(channelId);
    ffzEmoteCache.channels[channelId] = { data, fetchedAt: Date.now() };
  })().finally(() => inflightFFZ.delete(keyChan)));
  if (inflightFFZ.has(keyGlobal)) tasks.push(inflightFFZ.get(keyGlobal));
  if (inflightFFZ.has(keyChan)) tasks.push(inflightFFZ.get(keyChan));
  if (tasks.length) await Promise.allSettled(tasks);
}

async function ensureBTTV(channelId) {
  const needGlobal = !bttvEmoteCache.global || Date.now() - bttvEmoteCache.global.fetchedAt >= CACHE_TTL;
  const needChan = !bttvEmoteCache.channels[channelId] || Date.now() - bttvEmoteCache.channels[channelId].fetchedAt >= CACHE_TTL;
  const keyGlobal = 'global', keyChan = String(channelId);
  const tasks = [];
  if (needGlobal && !inflightBTTV.has(keyGlobal)) inflightBTTV.set(keyGlobal, (async () => {
    const data = await fetchBTTVGlobalEmotes();
    bttvEmoteCache.global = { data, fetchedAt: Date.now() };
  })().finally(() => inflightBTTV.delete(keyGlobal)));
  if (needChan && !inflightBTTV.has(keyChan)) inflightBTTV.set(keyChan, (async () => {
    const data = await fetchBTTVChannelEmotes(channelId);
    bttvEmoteCache.channels[channelId] = { data, fetchedAt: Date.now() };
  })().finally(() => inflightBTTV.delete(keyChan)));
  if (inflightBTTV.has(keyGlobal)) tasks.push(inflightBTTV.get(keyGlobal));
  if (inflightBTTV.has(keyChan)) tasks.push(inflightBTTV.get(keyChan));
  if (tasks.length) await Promise.allSettled(tasks);
}

function parseBadges(raw, globalSets, channelSets) {
  const badges = [];
  (raw?.split(',') ?? []).forEach(b => {
    const [name, version] = b.split('/');
    const find = (sets) => (sets || []).find(s => s.set_id === name)?.versions.find(v => v.id === version)?.image_url_1x;
    badges.push(find(channelSets) || find(globalSets));
  });
  return badges.filter(Boolean);
}

function parseTwitchEmotes(emotes, text) {
  const arr = [];
  Object.entries(emotes || {}).forEach(([id, posList]) => {
    const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`;
    posList.forEach(p => { const [s, e] = p.split('-').map(Number); arr.push({ code: text.slice(s, e + 1), url, start: s, end: e }); });
  });
  return arr.sort((a, b) => a.start - b.start);
}

async function fetchBadges(url) {
  try {
    let res = await fetchWithTimeout(url, { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` }, timeout: 2500 });
    if (res.status === 401 || res.status === 403) {
      await refreshAppTokenInline();
      res = await fetchWithTimeout(url, { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` }, timeout: 2500 });
    }
    if (!res.ok && res.status >= 500) {
      await sleep(200);
      res = await fetchWithTimeout(url, { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` }, timeout: 2500 });
    }
    const data = await res.json();
    return data.data ?? [];
  } catch { return []; }
}

// ---- Colors / 7TV API ----
const TWITCH_DEFAULT_HEX = ['#0000FF','#FF7F50','#1E90FF','#00FF7F','#9ACD32','#008000','#FF4500','#FF0000','#DAA520','#FF69B4','#5F9EA0','#2E8B57','#D2691E','#8A2BE2','#B22222'];
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h >>> 0; }
function pickTwitchDefaultColor(seedStr) { const seed = hashStr(seedStr || ''); return TWITCH_DEFAULT_HEX[seed % TWITCH_DEFAULT_HEX.length]; }
function normalizeSevenTvHex(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return '#' + (val & 0xFFFFFF).toString(16).padStart(6, '0');
  const s = String(val).trim().replace(/^#/, '');
  if (/^[0-9a-f]{8}$/i.test(s)) return '#' + s.slice(2);
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s;
  return null;
}

async function fetchSevenTvEmotes(channelId) {
  try {
    const cache = sevenTvEmoteCache.channels[channelId];
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.data;
    const res = await fetchWithTimeout(`https://7tv.io/v3/users/twitch/${channelId}`, { timeout: 2000 });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`7TV v3 ${res.status}`);
    const data = await res.json();
    return data.emote_set?.emotes.map(e => ({ code: e.name, url: `https:${e.data.host.url}/3x.webp`, provider: '7tv' })) || [];
  } catch (err) {
    if ((err?.name || '') === 'AbortError') {
      if (
        DEBUG_TMI &&
        (!global.last7tvAbortLog || Date.now() - global.last7tvAbortLog > 30000)
      ) {
        console.warn('[7TV Timeout] channel');
        global.last7tvAbortLog = Date.now();
      }
    }
    return [];
  }
}

function pickFFZUrl(urls) {
  if (!urls || typeof urls !== 'object') return null;
  const keys = ['4x', '4', 4, '2x', '2', 2, '1x', '1', 1, '0'];
  for (const key of keys) {
    if (urls[key]) {
      const candidate = urls[key];
      if (typeof candidate === 'string') {
        if (candidate.startsWith('//')) return 'https:' + candidate;
        if (candidate.startsWith('/')) return `https://cdn.frankerfacez.com${candidate}`;
        return candidate;
      }
    }
  }
  if (Array.isArray(urls)) {
    for (let i = urls.length - 1; i >= 0; i--) {
      const candidate = urls[i];
      if (typeof candidate === 'string') {
        if (candidate.startsWith('//')) return 'https:' + candidate;
        if (candidate.startsWith('/')) return `https://cdn.frankerfacez.com${candidate}`;
        return candidate;
      }
    }
  }
  for (const value of Object.values(urls)) {
    if (typeof value === 'string' && value) {
      if (value.startsWith('//')) return 'https:' + value;
      if (value.startsWith('/')) return `https://cdn.frankerfacez.com${value}`;
      return value;
    }
  }
  return null;
}

async function fetchFFZGlobalEmotes() {
  try {
    const json = await fetchJsonRetry('https://api.frankerfacez.com/v1/set/global', { timeout: 5000, retries: 2 });
    const sets = json?.sets || {};
    const defaultSets = Array.isArray(json?.default_sets) ? json.default_sets : [];
    const out = [];
    for (const id of defaultSets) {
      const set = sets[String(id)];
      const list = Array.isArray(set?.emoticons) ? set.emoticons : [];
      for (const em of list) {
        const url = pickFFZUrl(em?.urls || em?.url);
        if (!url || !em.name) continue;
        out.push({ code: em.name, url, provider: 'ffz' });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchFFZChannelEmotes(channelId) {
  try {
    const json = await fetchJsonRetry(`https://api.frankerfacez.com/v1/room/id/${channelId}`, { timeout: 5000, retries: 2 });
    const sets = json?.sets || {};
    const roomSets = Array.isArray(json?.room?.sets) ? json.room.sets : [];
    const out = [];
    for (const id of roomSets) {
      const set = sets[String(id)];
      const list = Array.isArray(set?.emoticons) ? set.emoticons : [];
      for (const em of list) {
        const url = pickFFZUrl(em?.urls || em?.url);
        if (!url || !em.name) continue;
        out.push({ code: em.name, url, provider: 'ffz' });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchFfzBadges({ userId, login }) {
  const lookupKey = userId ? `id:${userId}` : (login ? `login:${login.toLowerCase()}` : null);
  if (!lookupKey) return [];
  const cached = ffzBadgeCache.get(lookupKey);
  if (cached) {
    const ttl = cached.data && cached.data.length ? FFZ_BADGES_TTL : 60 * 1000;
    if (Date.now() - cached.fetchedAt < ttl) return cached.data;
  }
  if (inflightFfzBadges.has(lookupKey)) return inflightFfzBadges.get(lookupKey);

  const task = (async () => {
    const badgeDefs = new Map();
    const badgeOutputs = new Map();
    const badgeFetches = new Map();

    const normalizeColor = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') {
        return '#' + (value & 0xffffff).toString(16).padStart(6, '0');
      }
      if (Array.isArray(value)) {
        const [r, g, b] = value;
        if ([r, g, b].every(v => Number.isFinite(v))) {
          const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
          return '#' + [clamp(r), clamp(g), clamp(b)].map(v => v.toString(16).padStart(2, '0')).join('');
        }
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) {
          if (trimmed.length === 4) {
            return '#' + trimmed.slice(1).split('').map(c => c + c).join('');
          }
          if (trimmed.length === 7) return trimmed;
          if (trimmed.length === 9) return '#' + trimmed.slice(1, 7);
        }
        if (/^[0-9a-f]{6}$/i.test(trimmed)) return '#' + trimmed;
      }
      return null;
    };

    const addBadgeOutput = (badge) => {
      if (!badge) return;
      let url = null;
      if (badge.urls) url = pickFFZUrl(badge.urls);
      url = url || badge.url || badge.image || badge.small || badge.large || badge.high_res || badge.svg;
      if (!url && Array.isArray(badge.images) && badge.images.length) url = badge.images[badge.images.length - 1];
      if (!url && typeof badge === 'object') {
        url = badge['4x'] || badge['4'] || badge[4] || badge['2x'] || badge['2'] || badge[2] || badge['1x'] || badge['1'] || badge[1] || null;
      }
      if (typeof url !== 'string' || !url) return;
      if (url.startsWith('//')) url = 'https:' + url;
      else if (url.startsWith('/')) url = `https://cdn.frankerfacez.com${url}`;

      const descriptor = {
        url,
        provider: 'ffz',
      };
      const colorCandidate =
        normalizeColor(badge.background_color) ||
        normalizeColor(badge.background) ||
        normalizeColor(badge.color) ||
        normalizeColor(badge.colour) ||
        normalizeColor(badge.fill) ||
        normalizeColor(badge.tint);
      if (colorCandidate) descriptor.backgroundColor = colorCandidate;

      const tooltip = badge.tooltip || badge.title || badge.name;
      if (tooltip) descriptor.tooltip = tooltip;

      badgeOutputs.set(url, descriptor);
    };

    const rememberBadgeDef = (badge) => {
      if (!badge || typeof badge !== 'object') return;
      const id = badge.id ?? badge._id ?? badge.badge_id ?? badge.badge ?? badge.value;
      if (id === undefined || id === null) return;
      const key = String(id);
      if (!badgeDefs.has(key)) badgeDefs.set(key, badge);
      addBadgeOutput(badge);
    };

    const ensureBadgeDef = async (id) => {
      const key = String(id);
      if (badgeDefs.has(key)) return badgeDefs.get(key);
      if (badgeFetches.has(key)) return badgeFetches.get(key);
      const p = (async () => {
        try {
          const json = await fetchJsonRetry(`https://api.frankerfacez.com/v1/badges/ids/${encodeURIComponent(key)}`, { timeout: 5000, retries: 2 });
          const list = Array.isArray(json?.badges) ? json.badges : Object.values(json?.badges || {});
          let found = null;
          for (const badge of list) {
            rememberBadgeDef(badge);
            if (!found) {
              const badgeId = badge.id ?? badge._id ?? badge.badge_id ?? badge.badge ?? badge.value;
              if (badgeId !== undefined && String(badgeId) === key) found = badge;
            }
          }
          return found || null;
        } catch {
          return null;
        }
      })().finally(() => badgeFetches.delete(key));
      badgeFetches.set(key, p);
      return p;
    };

    const normalizeUserEntries = (entries) => {
      if (!entries) return [];
      if (Array.isArray(entries)) return entries;
      if (typeof entries === 'object') {
        const arr = [];
        if (entries.badge) arr.push(entries.badge);
        if (Array.isArray(entries.badges)) arr.push(...entries.badges);
        if (Array.isArray(entries.badge_ids)) arr.push(...entries.badge_ids);
        if (entries.id !== undefined) arr.push(entries.id);
        return arr;
      }
      return [entries];
    };

    const endpoints = new Set();
    if (userId) {
      endpoints.add(`https://api.frankerfacez.com/v1/badges/users/${userId}`);
      endpoints.add(`https://api.frankerfacez.com/v1/badges/users/twitch/${userId}`);
      endpoints.add(`https://api.frankerfacez.com/v1/user/id/${userId}`);
    }
    if (login) {
      const lower = login.toLowerCase();
      endpoints.add(`https://api.frankerfacez.com/v1/badges/users/${login}`);
      endpoints.add(`https://api.frankerfacez.com/v1/badges/users/${lower}`);
      endpoints.add(`https://api.frankerfacez.com/v1/badges/users/twitch/${login}`);
      endpoints.add(`https://api.frankerfacez.com/v1/user/${login}`);
      endpoints.add(`https://api.frankerfacez.com/v1/user/${lower}`);
    }

    for (const url of endpoints) {
      let json = null;
      try {
        json = await fetchJsonRetry(url, { timeout: 5000, retries: 2 });
      } catch {
        continue;
      }

      const badgesField = json?.badges;
      if (Array.isArray(badgesField)) badgesField.forEach(rememberBadgeDef);
      else if (badgesField && typeof badgesField === 'object') {
        Object.values(badgesField).forEach(rememberBadgeDef);
      }

      const userCandidates = [];
      if (userId !== undefined && userId !== null) {
        userCandidates.push(json?.users?.[String(userId)]);
        userCandidates.push(json?.users?.[Number(userId)]);
        if (json?.user && (json.user.id === Number(userId) || String(json.user.id) === String(userId))) {
          userCandidates.push(json.user.badges);
          userCandidates.push(json.user.badge_ids);
        }
      }
      if (login) {
        const lower = login.toLowerCase();
        userCandidates.push(json?.users?.[login]);
        userCandidates.push(json?.users?.[lower]);
        if (json?.user && (json.user.name?.toLowerCase() === lower || json.user.display_name?.toLowerCase() === lower)) {
          userCandidates.push(json.user.badges);
          userCandidates.push(json.user.badge_ids);
        }
      }
      if (json?.user?.badges) userCandidates.push(json.user.badges);
      if (json?.user?.badge_ids) userCandidates.push(json.user.badge_ids);

      const flattened = userCandidates.flatMap(normalizeUserEntries);
      for (const entry of flattened) {
        if (entry === null || entry === undefined) continue;
        if (typeof entry === 'object') {
          rememberBadgeDef(entry);
        } else {
          const id = String(entry);
          rememberBadgeDef(badgeDefs.get(id));
          await ensureBadgeDef(id);
        }
      }

      if (badgeOutputs.size > 0) break;
    }

    const result = Array.from(badgeOutputs.values());
    ffzBadgeCache.set(lookupKey, { data: result, fetchedAt: Date.now() });
    return result;
  })().catch(() => {
    ffzBadgeCache.set(lookupKey, { data: [], fetchedAt: Date.now() });
    return [];
  }).finally(() => inflightFfzBadges.delete(lookupKey));

  inflightFfzBadges.set(lookupKey, task);
  return task;
}

async function ensureBttvBadgeDefinitions() {
  const now = Date.now();
  if (bttvBadgeDefinitions.map && now - bttvBadgeDefinitions.fetchedAt < BTTV_BADGES_TTL) {
    return bttvBadgeDefinitions.map;
  }
  if (inflightBttvBadgeDefs) return inflightBttvBadgeDefs;

  inflightBttvBadgeDefs = (async () => {
    try {
      const list = await fetchJsonRetry('https://api.betterttv.net/3/badges', { timeout: 5000, retries: 2 });
      const map = new Map();
      if (Array.isArray(list)) {
        for (const entry of list) {
          const id = entry?.id || entry?._id;
          const url =
            entry?.badgeImageUrl ||
            entry?.image ||
            entry?.badgeImage ||
            entry?.badgeImage1x ||
            entry?.badgeImage2x ||
            entry?.badgeImage3x ||
            entry?.badge;
          if (id && typeof url === 'string' && url) {
            map.set(String(id), url);
          }
        }
      }
      bttvBadgeDefinitions.map = map;
      bttvBadgeDefinitions.fetchedAt = Date.now();
      return map;
    } catch {
      if (!bttvBadgeDefinitions.map) bttvBadgeDefinitions.map = new Map();
      bttvBadgeDefinitions.fetchedAt = Date.now() - (BTTV_BADGES_TTL - 60_000);
      return bttvBadgeDefinitions.map;
    } finally {
      inflightBttvBadgeDefs = null;
    }
  })();

  return inflightBttvBadgeDefs;
}

async function fetchBttvBadges(userId) {
  if (!userId) return [];
  const key = String(userId);
  const cached = bttvBadgeCache.get(key);
  if (cached && (Date.now() - cached.fetchedAt) < BTTV_BADGES_TTL) return cached.data;
  if (inflightBttvBadges.has(key)) return inflightBttvBadges.get(key);

  const task = (async () => {
    try {
      const defs = await ensureBttvBadgeDefinitions();
      const json = await fetchJsonRetry(`https://api.betterttv.net/3/badges/users/${key}`, { timeout: 5000, retries: 2 });
      let badgeIds = [];
      if (Array.isArray(json)) badgeIds = json;
      else if (Array.isArray(json?.badges)) badgeIds = json.badges;
      else if (Array.isArray(json?.data)) badgeIds = json.data;
      const out = [];
      for (const rawId of badgeIds) {
        const id = String(rawId);
        const url = defs.get(id);
        if (url) out.push(url);
      }
      bttvBadgeCache.set(key, { data: out, fetchedAt: Date.now() });
      return out;
    } catch {
      bttvBadgeCache.set(key, { data: [], fetchedAt: Date.now() - (BTTV_BADGES_TTL - 60_000) });
      return [];
    }
  })().finally(() => inflightBttvBadges.delete(key));

  inflightBttvBadges.set(key, task);
  return task;
}

function bttvCdnUrl(id) {
  if (!id) return null;
  return `https://cdn.betterttv.net/emote/${id}/3x`;
}

async function fetchBTTVGlobalEmotes() {
  try {
    const list = await fetchJsonRetry('https://api.betterttv.net/3/cached/emotes/global', { timeout: 5000, retries: 2 });
    if (!Array.isArray(list)) return [];
    return list
      .map(e => ({ code: e.code, url: bttvCdnUrl(e.id), provider: 'bttv' }))
      .filter(e => e.code && e.url);
  } catch {
    return [];
  }
}

async function fetchBTTVChannelEmotes(channelId) {
  try {
    const json = await fetchJsonRetry(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`, { timeout: 5000, retries: 2 });
    const channelEmotes = Array.isArray(json?.channelEmotes) ? json.channelEmotes : [];
    const sharedEmotes = Array.isArray(json?.sharedEmotes) ? json.sharedEmotes : [];
    const combined = [...channelEmotes, ...sharedEmotes];
    return combined
      .map(e => ({ code: e.code, url: bttvCdnUrl(e.id), provider: 'bttv' }))
      .filter(e => e.code && e.url);
  } catch {
    return [];
  }
}

// ---- Chatterino Badges -----------------------------------------------------
async function ensureChatterinoBadges() {
  const now = Date.now();
  if (chatterinoBadges.byUserId && now - chatterinoBadges.fetchedAt < CHATTERINO_BADGES_TTL) return;
  if (!inflightChatterino) {
    inflightChatterino = (async () => {
      try {
        const json = await fetchJsonRetry('https://api.chatterino.com/badges', { timeout: 5000, retries: 2 });
        const map = new Map();
        // Erwartete Form: { badges: [ { tooltip, image1..image4, users: [<id>|{userID}|{user_id}|{id}] } ] }
        const list = Array.isArray(json?.badges) ? json.badges : [];
        for (const b of list) {
          const img =
            b.image1 ||
            (b.images && (b.images['1x'] || b.images['2x'] || b.images['3x'] || b.images['4x'])) ||
            b.image2 || b.image3 || b.image4 || b.image || null;
          if (!img) continue;
          const users = Array.isArray(b.users) ? b.users : [];
          for (const u of users) {
            const id = typeof u === 'string'
              ? u
              : (u?.userID || u?.user_id || u?.id || u?.twitch_id || u?.twitchId || null);
            if (!id) continue;
            const key = String(id);
            if (!map.has(key)) map.set(key, { url: img, tooltip: b.tooltip || 'Chatterino Badge' });
          }
        }
        chatterinoBadges = { byUserId: map, fetchedAt: Date.now() };
      } catch (err) {
        // Soft-fail: Merker setzen, damit nicht gespammt wird
        chatterinoBadges = {
          byUserId: chatterinoBadges.byUserId || new Map(),
          fetchedAt: Date.now() - (CHATTERINO_BADGES_TTL - 60_000)
        };
        console.warn('[chatterino] badge fetch failed:', err?.message || err);
      }
    })().finally(() => { inflightChatterino = null; });
  }
  return inflightChatterino;
}

function getChatterinoBadgeUrlForUser(userId) {
  if (!userId || !chatterinoBadges.byUserId) return null;
  const entry = chatterinoBadges.byUserId.get(String(userId));
  return entry?.url || null;
}

async function fetchSevenTvGlobalEmotes() {
  try {
    const cache = sevenTvEmoteCache.global;
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.data;
    const res = await fetchWithTimeout('https://7tv.io/v3/emote-sets/global', { timeout: 2000 });
    if (!res.ok) throw new Error(`7TV global ${res.status}`);
    const data = await res.json();
    return data.emotes.map(e => ({ code: e.name, url: `https:${e.data.host.url}/3x.webp`, provider: '7tv' }));
  } catch (err) {
    if ((err?.name || '') === 'AbortError') {
      if (
        DEBUG_TMI &&
        (!global.last7tvAbortLog || Date.now() - global.last7tvAbortLog > 30000)
      ) {
        console.warn('[7TV Timeout] global');
        global.last7tvAbortLog = Date.now();
      }
    }
    return [];
  }
}

async function fetchSevenTvStyle(userId) {
  if (!userId) return null;
  try {
    const cache = sevenTvStyleCache.users[userId];
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.data;
    const data = await fetchJsonRetry(`https://7tv.io/v3/users/twitch/${userId}`, { timeout: 5000, retries: 2 });
    const style = data.user?.style ?? {};
    let paintResult = null; if (style.paint_id) paintResult = await fetchSevenTvPaint(style.paint_id);
    let colorResult = normalizeSevenTvHex(style.color);
    let badgeResult = null; if (style.badge_id) badgeResult = `https://cdn.7tv.app/badge/${style.badge_id}/3x`;
    const result = { paint: paintResult, color: colorResult, badge: badgeResult };
    sevenTvStyleCache.users[userId] = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (err) {
    if (err?.status === 404 || String(err?.message||'').includes('HTTP 404')) {
      const NEG = 6 * 60 * 60 * 1000;
      sevenTvStyleCache.users[userId] = { data: null, fetchedAt: Date.now() + NEG - CACHE_TTL };
      return null;
    }
    const ERROR_COOLDOWN = 60_000;
    sevenTvStyleCache.users[userId] = { data: null, fetchedAt: Date.now() - (CACHE_TTL - ERROR_COOLDOWN) };
    return null;
  }
}
async function fetchSevenTvPaint(paintId) {
  try {
    const json = await fetchJsonRetry('https://7tv.io/v3/gql', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 5000, retries: 2,
      body: JSON.stringify({ operationName: 'GetPaint', variables: { list: [String(paintId)] },
        query: `query GetPaint($list: [ObjectID!]){cosmetics(list:$list){paints{id name color function angle shape image_url repeat stops{at color} shadows{x_offset y_offset radius color}}}}` })
    });
    return json.data?.cosmetics?.paints?.[0] ?? null;
  } catch { return null; }
}

async function getTwitchUserProfile({ uid, login }) {
  const key = uid || login; if (!key) return null;
  const now = Date.now(); const cached = userProfileCache.get(key);
  if (cached && (now - cached.ts) < USER_PROFILE_TTL) return cached.url || null;
  if (inflightUserReq.has(key)) { try { return await inflightUserReq.get(key); } catch {} }
  const p = (async () => {
    const q = uid ? `id=${encodeURIComponent(uid)}` : `login=${encodeURIComponent(login)}`;
    const url = `https://api.twitch.tv/helix/users?${q}`;
    let res = await fetchWithTimeout(url, { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` }, timeout: 2500 });
    if (res.status === 401 || res.status === 403) {
      await refreshAppTokenInline();
      res = await fetchWithTimeout(url, { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` }, timeout: 2500 });
    }
    if (!res.ok) throw new Error(`Helix /users -> ${res.status}`);
    const json = await res.json();
    const urlOut = json.data?.[0]?.profile_image_url || null;
    userProfileCache.set(key, { url: urlOut, ts: Date.now() });
    return urlOut;
  })().catch(() => { userProfileCache.set(key, { url: null, ts: Date.now() - (USER_PROFILE_TTL - 60_000) }); return null; })
    .finally(() => inflightUserReq.delete(key));
  inflightUserReq.set(key, p);
  return p;
}

function parseThirdPartyEmotes(emotes, text) {
  const found = [], taken = new Set();
  const sorted = [...emotes].sort((a, b) => b.code.length - a.code.length);
  for (const e of sorted) {
    if (!text.includes(e.code)) continue;
    const esc = e.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(`(?<!\\S)${esc}(?!\\S)`, 'g');
    let m; while ((m = rx.exec(text)) != null) {
      const s = m.index, end = s + e.code.length - 1;
      let overlaps = false; for (let i = s; i <= end; i++) { if (taken.has(i)) { overlaps = true; break; } }
      if (overlaps) continue;
      for (let i = s; i <= end; i++) taken.add(i);
      found.push({ code: e.code, url: e.url, start: s, end, provider: e.provider || 'third' });
    }
  }
  return found;
}
