const config = require('./config.secret.json');
const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const tmi = require('tmi.js');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const CLIENT_ID = config.client_id;
const app = express();
const port = process.env.PORT || 3000;

// Token nur einmal laden
const tokenData = JSON.parse(fs.readFileSync(path.join(__dirname, 'twitch_token.json'), 'utf8'));
let token = tokenData.access_token;
function getToken() {
    return token;
}

// Compression-Middleware
app.use(compression());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// STAGING
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => res.send('Backend läuft'));
server.listen(port, () => console.log(`Backend läuft auf Port ${port}`));

const twitchClients = new Map();
const channelSubscribers = new Map();
const badgeCache = { global: null, channels: {} };
const sevenTvCache = { global: null, channels: {}, users: {} };
const CACHE_TTL = 15 * 60 * 1000;

wss.on('connection', ws => {
    console.log('Client verbunden');

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async msg => {
        const parsed = JSON.parse(msg);
        if (!parsed.streamerName) return;

        const streamer = parsed.streamerName.toLowerCase();
        if (!channelSubscribers.has(streamer)) channelSubscribers.set(streamer, new Set());
        channelSubscribers.get(streamer).add(ws);

        if (!twitchClients.has(streamer)) {
            const client = new tmi.Client({
                options: { debug: false },
                connection: { secure: true, reconnect: true },
                identity: { username: 'justinfan12345', password: 'password' },
                clientId: CLIENT_ID
            });

            twitchClients.set(streamer, client);
            client.connect().then(() => client.join(streamer));

            client.on('timeout', (channel, username) => {
                broadcastToOverlay(channel, { type: 'clear_user_messages', username: username.toLowerCase() });
            });
            client.on('ban', (channel, username) => {
                broadcastToOverlay(channel, { type: 'clear_user_messages', username: username.toLowerCase() });
            });

            client.on('message', async (channel, tags, text, self) => {
                if (self) return;
                const lowerChannel = channel.slice(1).toLowerCase();
                const subscribers = channelSubscribers.get(lowerChannel);
                if (!subscribers) return;

                const token = getToken();
                if (!token) return;

                let profileImageUrl = null;
                if (tags['user-id']) {
                    const userRes = await fetch(`https://api.twitch.tv/helix/users?id=${tags['user-id']}`, {
                        headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${token}` }
                    });
                    const userData = await userRes.json();
                    profileImageUrl = userData.data?.[0]?.profile_image_url ?? null;
                }

                const broadcasterId = tags['room-id'];
                const [globalBadges, channelBadges] = await Promise.all([
                    badgeCache.global ?? fetchBadges('https://api.twitch.tv/helix/chat/badges/global', token),
                                                                        fetchBadges(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`, token)
                ]);
                badgeCache.global = globalBadges;
                badgeCache.channels[broadcasterId] = channelBadges;

                const badgeUrls = parseBadges(tags['badges-raw'], globalBadges, channelBadges);

                const sevenTvStyle = await fetchSevenTvStyle(tags['user-id']);
                if (sevenTvStyle?.badge) badgeUrls.push(sevenTvStyle.badge);

                const sevenTvChannelEmotes = await fetchSevenTvEmotes(tags['room-id']);
                const sevenTvGlobalEmotes = await fetchSevenTvGlobalEmotes();
                const sevenTvEmotes = parseSevenTvEmotes([...sevenTvChannelEmotes, ...sevenTvGlobalEmotes], text);

                const twitchEmotes = parseTwitchEmotes(tags.emotes, text);

                const msgData = {
                    type: 'chat', username: tags.username,
                    displayName: tags['display-name'], message: text,
                    badges: badgeUrls, profileImageUrl,
                    twitchEmotes, sevenTvEmotes,
                    sevenTvColor: sevenTvStyle?.color ?? tags.color ?? null,
                    sevenTvPaint: sevenTvStyle?.paint ?? null
                };

                subscribers.forEach(s => s.readyState === WebSocket.OPEN && s.send(JSON.stringify(msgData)));
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

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(interval));

function broadcastToOverlay(channel, data) {
    const streamer = channel.replace(/^#/, '').toLowerCase();
    const clients = channelSubscribers.get(streamer);
    if (!clients) return;
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data));
    });
}

async function fetchBadges(url, token) {
    try {
        const res = await fetch(url, { headers: { 'Client-Id': CLIENT_ID, 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        return data.data ?? [];
    } catch {
        return [];
    }
}

function parseBadges(raw, globalBadges, channelBadges) {
    const badges = [];
    (raw?.split(',') ?? []).forEach(b => {
        const [name, version] = b.split('/');
        const findBadge = (sets) => sets.find(set => set.set_id === name)?.versions.find(v => v.id === version)?.image_url_1x;
        badges.push(findBadge(globalBadges) || findBadge(channelBadges));
    });
    return badges.filter(Boolean);
}

function parseTwitchEmotes(emotes, text) {
    const emoteArray = [];
    Object.entries(emotes || {}).forEach(([emoteId, positions]) => {
        const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/3.0`;
        positions.forEach(position => {
            const [start, end] = position.split('-');
            emoteArray.push({ code: text.substring(+start, +end + 1), url: emoteUrl, start: +start, end: +end });
        });
    });
    return emoteArray.sort((a, b) => a.start - b.start);
}

async function fetchSevenTvEmotes(channelId) {
    const res = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.emote_set?.emotes.map(e => ({ code: e.name, url: `https:${e.data.host.url}/3x.webp` })) || [];
}

async function fetchSevenTvGlobalEmotes() {
    const res = await fetch(`https://7tv.io/v3/emote-sets/global`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.emotes.map(e => ({ code: e.name, url: `https:${e.data.host.url}/3x.webp` }));
}

function parseSevenTvEmotes(emotes, text) {
    const found = [];
    const taken = new Set();

    // Längere Emotes zuerst prüfen
    emotes.sort((a, b) => b.code.length - a.code.length);

    emotes.forEach(emote => {
        const escapedCode = escapeRegExp(emote.code);
        const regex = new RegExp(`(?<!\\S)${escapedCode}(?!\\S)`, 'g'); // Nur ganze Wörter (zwischen Leerzeichen o.ä.)
    let match;
    while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + emote.code.length - 1;

        // Wenn schon belegt → überspringen
        if ([...Array(end - start + 1)].some((_, i) => taken.has(start + i))) continue;

        // Belege Positionen
        for (let i = start; i <= end; i++) taken.add(i);

        found.push({ code: emote.code, url: emote.url, start, end });
    }
    });

    return found;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchSevenTvStyle(userId) {
    // Wenn Cache existiert und nicht abgelaufen ist → verwende ihn
    if (sevenTvCache.users[userId] && (Date.now() - sevenTvCache.users[userId].fetchedAt) < CACHE_TTL) {
        return sevenTvCache.users[userId].data;
    }

    // Andernfalls: neuen Style von der 7TV API holen
    const res = await fetch(`https://7tv.io/v3/users/twitch/${userId}`);
    if (!res.ok) return null;

    const data = await res.json();
    const style = data.user?.style ?? {};

    const result = { paint: null, color: null, badge: null };

    // Paint laden, falls vorhanden
    if (style.paint_id) {
        result.paint = await fetchSevenTvPaint(style.paint_id);
    }

    // Farbe unabhängig von Paint setzen (auch wenn Paint existiert)
    if (typeof style.color === "number") {
        result.color = `#${(style.color >>> 0).toString(16).padStart(6, '0')}`;
    }

    // Badge, falls vorhanden
    if (style.badge_id) {
        result.badge = `https://cdn.7tv.app/badge/${style.badge_id}/3x`;
    }

    // Im Cache speichern mit Timestamp
    sevenTvCache.users[userId] = {
        data: result,
        fetchedAt: Date.now()
    };

    return result;
}

async function fetchSevenTvPaint(paintId) {
    const res = await fetch('https://7tv.io/v3/gql', {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            operationName: "GetPaint",
            variables: { list: [String(paintId)] },
                             query: `
                             query GetPaint($list: [ObjectID!]) {
                                 cosmetics(list: $list) {
                                     paints {
                                         id
                                         name
                                         color
                                         function
                                         angle
                                         shape
                                         image_url
                                         repeat
                                         stops { at color }
                                         shadows { x_offset y_offset radius color }
                                     }
                                 }
                             }
                             `
        })
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data?.data?.cosmetics?.paints?.[0] ?? null;
}
