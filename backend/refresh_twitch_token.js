'use strict';

/* ---------------------------------------------
   Einmaliger App-Token-Refresh für Helix-API
   - schreibt obtainmentTimestamp (ms since epoch)
   - identisches JSON-Format wie vom Backend erwartet
   --------------------------------------------- */

const path = require('path');
const fs = require('fs');

try { require('dotenv').config(); } catch (_) {}

const cfgPath = path.join(__dirname, 'config.secret.json');
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};

const CLIENT_ID = process.env.TWITCH_CLIENT_ID || cfg.client_id;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || cfg.client_secret;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET fehlen (ENV oder config.secret.json).');
  process.exit(1);
}

// Node 18+: global fetch
const fetch = global.fetch
  ? global.fetch.bind(global)
  : ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const TOKEN_FILE = path.join(__dirname, 'twitch_token.json');

(async function refreshToken(){
  try {
    const url = `https://id.twitch.tv/oauth2/token` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&client_secret=${encodeURIComponent(CLIENT_SECRET)}` +
      `&grant_type=client_credentials`;

    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();

    if (!response.ok || !data.access_token) {
      console.error('❌ Fehler beim Holen des Tokens:', data);
      process.exit(1);
    }

    const payload = {
      access_token: data.access_token,
      expires_in: data.expires_in,
      obtainmentTimestamp: Date.now()
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(payload, null, 2));
    console.log('✅ Neues App-Token gespeichert.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fehler beim Aktualisieren des Tokens:', err);
    process.exit(1);
  }
})();
