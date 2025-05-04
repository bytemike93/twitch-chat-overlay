const config = require('./config.secret.json');
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const CLIENT_ID = config.client_id;
const CLIENT_SECRET = config.client_secret;
const TOKEN_FILE = path.join(__dirname, 'twitch_token.json');

async function refreshToken() {
    try {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`;
        const response = await fetch(url, { method: 'POST' });
        const data = await response.json();

        if (!response.ok) {
            console.error("Fehler beim Holen des Tokens:", data);
            process.exit(1);
        }

        const result = {
            access_token: data.access_token,
            expires_in: data.expires_in,
            created_at: new Date().toISOString()
        };

        fs.writeFileSync(TOKEN_FILE, JSON.stringify(result, null, 2));
        console.log("Neues Token gespeichert.");
    } catch (err) {
        console.error("Fehler beim Aktualisieren des Tokens:", err);
        process.exit(1);
    }
}

refreshToken();
