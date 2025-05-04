const config = require('./config.secret.json');
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const compression = require('compression');

const CLIENT_ID = config.client_id;
const app = express();
const port = process.env.PORT || 3000;

// Token nur einmal laden
const tokenData = JSON.parse(fs.readFileSync(path.join(__dirname, 'twitch_token.json'), 'utf8'));
let token = tokenData.access_token;
function getToken() {
    return token;
}

// Cache-Konfiguration
const CACHE_TTL = 15 * 60 * 1000;
const badgeCache = { global: null, channels: {} };
const sevenTvEmoteCache = { global: null, channels: {} };
const sevenTvStyleCache = { users: {} };

// Middleware
app.use(compression());
const USE_LOCAL_FRONTEND = false; // ← auf false setzen für Live-Server

if (USE_LOCAL_FRONTEND) {
    app.use(express.static(path.join(__dirname, '../frontend')));
}

// HTTP-Server & WebSocket-Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
server.listen(port, () => console.log(`Backend läuft auf Port ${port}`));
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Promise Rejection]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]', err);
});

// State
const twitchClients = new Map();
const channelSubscribers = new Map();

// Helper: Broadcast
function broadcastToOverlay(channel, data) {
    const streamer = channel.replace(/^#/, '').toLowerCase();
    const clients = channelSubscribers.get(streamer);
    if (!clients) return;
    clients.forEach(ws => {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        } catch (e) {
            console.warn('[WebSocket Send Fehler]', e);
        }
    });
}

// Fetch-Twitch-Badges
async function fetchBadges(url) {
    try {
        const res = await fetch(url, {
            headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        return data.data ?? [];
    } catch (err) {
        console.warn('[Badge API Fehler]', err);
        return [];
    }
}

// Nachrichtenevents
wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async msg => {
        let parsed;
        try {
            parsed = JSON.parse(msg);
        } catch {
            return;
        }
        if (!parsed.streamerName) return;

        const streamer = parsed.streamerName.toLowerCase();
        if (!channelSubscribers.has(streamer)) {
            channelSubscribers.set(streamer, new Set());
        }
        channelSubscribers.get(streamer).add(ws);

        if (!twitchClients.has(streamer)) {
            const client = new tmi.Client({
                options: { debug: false },
                connection: { secure: true, reconnect: true },
                identity: { username: 'justinfan12345', password: `oauth:${token}` },
                clientId: CLIENT_ID
            });

            twitchClients.set(streamer, client);
            client.connect().then(() => client.join(streamer));

            ['timeout','ban'].forEach(evt => {
                client.on(evt, (channel, username) => {
                    broadcastToOverlay(channel, { type: 'clear_user_messages', username: username.toLowerCase() });
                });
            });

            client.on('message', async (channel, tags, text, self) => {
                if (self) return;
                const lowerCh = channel.slice(1).toLowerCase();
                const subs = channelSubscribers.get(lowerCh);
                if (!subs) return;

                // Profilbild
                let profileImageUrl = null;
                if (tags['user-id']) {
                    try {
                        const userRes = await fetch(
                            `https://api.twitch.tv/helix/users?id=${tags['user-id']}`,
                            { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${getToken()}` } }
                        );
                        const userData = await userRes.json();
                        profileImageUrl = userData.data?.[0]?.profile_image_url ?? null;
                    } catch (err) {
                        console.warn('[Twitch User API Fehler]', err);
                    }
                }

                // Badges
                const broadcasterId = tags['room-id'];
                let globalBadges = badgeCache.global;
                let channelBadges = badgeCache.channels[broadcasterId];
                if (!globalBadges || !channelBadges) {
                    try {
                        [globalBadges, channelBadges] = await Promise.all([
                            globalBadges ?? fetchBadges('https://api.twitch.tv/helix/chat/badges/global'),
                                                                          channelBadges ?? fetchBadges(
                                                                              `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`
                                                                          )
                        ]);
                        badgeCache.global = globalBadges;
                        badgeCache.channels[broadcasterId] = channelBadges;
                    } catch (e) {
                        console.warn('[Twitch Badges Fehler]', e);
                    }
                }
                const badgeUrls = parseBadges(tags['badges-raw'], globalBadges, channelBadges);

                // 7TV Style
                let sevenStyle = null;
                try {
                    sevenStyle = await fetchSevenTvStyle(tags['user-id']);
                } catch (e) {
                    console.warn('[7TV Style Error]', e);
                }
                if (sevenStyle?.badge) badgeUrls.push(sevenStyle.badge);

                // 7TV Emotes
                let chanEmotes = [];
                let globEmotes = [];
                try {
                    chanEmotes = await fetchSevenTvEmotes(tags['room-id']);
                    globEmotes = await fetchSevenTvGlobalEmotes();
                } catch (e) {
                    console.warn('[7TV Emotes Error]', e);
                }
                const sevenEmotes = parseSevenTvEmotes([...chanEmotes, ...globEmotes], text);

                // Twitch Emotes
                const twEmotes = parseTwitchEmotes(tags.emotes, text);

                // Nachricht-Daten
                const msgData = {
                    type: 'chat',
                    username: tags.username,
                    displayName: tags['display-name'],
                    message: text,
                    badges: badgeUrls,
                    profileImageUrl,
                    twitchEmotes: twEmotes,
                    sevenTvEmotes: sevenEmotes,
                    sevenTvColor: sevenStyle?.color ?? tags.color ?? null,
                    sevenTvPaint: sevenStyle?.paint ?? null
                };

                subs.forEach(s => {
                    try {
                        if (s.readyState === WebSocket.OPEN) {
                            s.send(JSON.stringify(msgData));
                        }
                    } catch (err) {
                        console.warn('[WebSocket Send Fehler]', err);
                    }
                });
            });
        }
    });

    ws.on('close', () => {
        channelSubscribers.forEach((subs, streamer) => {
            subs.delete(ws);
            if (subs.size === 0 && twitchClients.has(streamer)) {
                twitchClients.get(streamer).disconnect();
                twitchClients.delete(streamer);
            }
        });
    });
});

// Heartbeat
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(interval));

// Hilfsfunktionen und Caches

function parseBadges(raw, globalSets, channelSets) {
    const badges = [];
    (raw?.split(',') ?? []).forEach(b => {
        const [name, version] = b.split('/');
        const find = sets => sets
        .find(s => s.set_id === name)
        ?.versions.find(v => v.id === version)
        ?.image_url_1x;
        badges.push(find(globalSets) || find(channelSets));
    });
    return badges.filter(Boolean);
}

function parseTwitchEmotes(emotes, text) {
    const arr = [];
    Object.entries(emotes || {}).forEach(([id, posList]) => {
        const url = `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/3.0`;
        posList.forEach(p => {
            const [s, e] = p.split('-').map(Number);
            arr.push({ code: text.slice(s, e+1), url, start: s, end: e });
        });
    });
    return arr.sort((a, b) => a.start - b.start);
}

// 7TV Emotes
async function fetchSevenTvEmotes(channelId) {
    try {
        const cache = sevenTvEmoteCache.channels[channelId];
        if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
            return cache.data;
        }

        const res = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
        if (res.status === 404) {
            return []; // kein Account bei 7TV → normal
        }
        if (!res.ok) {
            throw new Error(`7TV v3 API returned ${res.status}`);
        }

        const data = await res.json();
        const emotes = data.emote_set?.emotes.map(e => ({
            code: e.name,
            url: `https:${e.data.host.url}/3x.webp`
        })) || [];

        sevenTvEmoteCache.channels[channelId] = { data: emotes, fetchedAt: Date.now() };
        return emotes;
    } catch (err) {
        console.warn('[fetchSevenTvEmotes Fehler]', err);
        return [];
    }
}

async function fetchSevenTvGlobalEmotes() {
    try {
        const cache = sevenTvEmoteCache.global;
        if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
            return cache.data;
        }

        const res = await fetch('https://7tv.io/v3/emote-sets/global');
        if (!res.ok) throw new Error(`7TV Global API returned ${res.status}`);

        const data = await res.json();
        const emotes = data.emotes.map(e => ({
            code: e.name,
            url: `https:${e.data.host.url}/3x.webp`
        }));

        sevenTvEmoteCache.global = { data: emotes, fetchedAt: Date.now() };
        return emotes;
    } catch (err) {
        console.warn('[fetchSevenTvGlobalEmotes Fehler]', err);
        return [];
    }
}

function parseSevenTvEmotes(emotes, text) {
    const found = [];
    const taken = new Set();
    emotes.sort((a, b) => b.code.length - a.code.length);
    emotes.forEach(e => {
        const esc = escapeRegExp(e.code);
        const rx = new RegExp(`(?<!\\S)${esc}(?!\\S)`, 'g');
        let m;
        while ((m = rx.exec(text)) != null) {
            const s = m.index, end = s + e.code.length - 1;
            if ([...Array(end-s+1)].some((_, i) => taken.has(s+i))) continue;
            for (let i=s;i<=end;i++) taken.add(i);
            found.push({ code: e.code, url: e.url, start: s, end });
        }
    });
    return found;
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 7TV Style
async function fetchSevenTvStyle(userId) {
    try {
        const cache = sevenTvStyleCache.users[userId];
        if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
            return cache.data;
        }
        const res = await fetch(`https://7tv.io/v3/users/twitch/${userId}`);
        if (!res.ok) return null;
        const data = await res.json();
        const style = data.user?.style ?? {};

        let paintResult = null;
        if (style.paint_id) {
            paintResult = await fetchSevenTvPaint(style.paint_id);
        }

        let colorResult = null;
        if (typeof style.color === 'number') {
            colorResult = `#${(style.color >>> 0).toString(16).padStart(6, '0')}`;
        }

        let badgeResult = null;
        if (style.badge_id) {
            badgeResult = `https://cdn.7tv.app/badge/${style.badge_id}/3x`;
        }

        const result = { paint: paintResult, color: colorResult, badge: badgeResult };
        sevenTvStyleCache.users[userId] = { data: result, fetchedAt: Date.now() };
        return result;
    } catch (err) {
        console.warn('[7TV Style Fehler]', err);
        return null;
    }
}

async function fetchSevenTvPaint(paintId) {
    try {
        const res = await fetch('https://7tv.io/v3/gql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                operationName: 'GetPaint',
                variables: { list: [String(paintId)] },
                                 query: `
                                 query GetPaint($list: [ObjectID!]) {
                                     cosmetics(list: $list) {
                                         paints { id name color function angle shape image_url repeat stops { at color } shadows { x_offset y_offset radius color } }
                                     }
                                 }
                                 `
            })
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.data?.cosmetics?.paints?.[0] ?? null;
    } catch (err) {
        console.warn('[7TV Paint Fehler]', err);
        return null;
    }
}
