# Twitch Chat Overlay

A modern, customizable Twitch chat overlay supporting emotes (Twitch + 7TV), paint styles, mentions, bot filtering, and more. The project consists of a lightweight backend (Express) that proxies Twitch chat events and a static frontend overlay.

➡️ Try the web-based overlay configurator: **[bytemike.de/chat-overlay](https://bytemike.de/chat-overlay)**

## Features

- Twitch, 7TV, FFZ, and BTTV emotes  
- 7TV Paint Styles and colors (incl. animated paints)  
- Profile pictures and badges (Twitch + Chatterino/FFZ/BTTV/7TV badge)  
- Highlighted @mentions  
- Optional bot/ignore filters  
- Auto removal of timed-out/banned messages  
- Visual styles: Glassmorphism, Neon, Cyberpunk, Darkglass, Pixel, Retro, Glitch  
- Compact mode for tight layouts  
- Custom font, size, colors, alignment, borders, glow, and box styling  

## Usage

Add the overlay URL as a **browser source** in OBS. Example:

```
https://chat.bytemike.de/?streamer=yourname
```

## Local Development

### Backend API

```bash
cd backend
npm install

# copy env template and fill in your Twitch app credentials
cp .env.example .env

# development start
node server.js
```

Important env vars:

- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` – OAuth app used for Chat + Helix calls
- `ALLOWED_ORIGINS` – comma separated list for CORS (defaults to local dev)
- `USE_LOCAL_FRONTEND` – when `true`, serves the `frontend/` directory directly

### Frontend Overlay

The overlay is purely static. During development you can serve `frontend/` via your favourite static server (e.g. `npx serve frontend`) or let the backend host it when `USE_LOCAL_FRONTEND=true`.

## Parameters

| Parameter        | Description                                                                                     |
|------------------|-------------------------------------------------------------------------------------------------|
| `streamer`       | **Required**: Twitch channel name (without @)                                                   |
| `style`          | Design style: `glass`, `neon`, `cyberpunk`, `darkglass`, `pixel`, `retro`, `glitch`, or `no`    |
| `bg`             | Bubble background HEX (`ff0000`) or `no` for transparent + freestanding layout                  |
| `text`           | Message text color HEX                                                                           |
| `name`           | Username color HEX override                                                                     |
| `font`           | Font name, e.g. `Roboto`, `Orbitron`                                                            |
| `size`           | Font size in px                                                                                 |
| `align`          | `right` to right-align the chat                                                                 |
| `small`          | Compact mode: `yes`                                                                             |
| `avatar`         | Profile pictures: `yes` / `no` (only applies when `small=yes`)                                  |
| `bots`           | Hide known bots: use `no` to filter them out                                                    |
| `ignore`         | Custom bot/usernames to ignore, comma-separated                                                 |
| `border`         | Bubble border radius in px                                                                      |
| `glow`, `glowColor`, `glowPx`, `glowOff` | Bubble glow controls (hex, blur px, or disable)                         |
| `shadow`         | Text shadow control: `off` / `none`                                                             |
| `ttl`            | Auto-hide messages after N seconds (e.g. `ttl=15`, `0` to disable)                             |
| `flow` / `prune` | `flow=yes` or `prune=off` disables auto-pruning when the box overflows                          |
| `preview`        | Dummy preview messages: `yes`                                                                   |
| `ws`             | Custom WebSocket URL (self-hosted backend override)                                             |
| `paintAnim`      | Animate 7TV paint styles: `yes`                                                                 |
| `boxBg`, `boxAlpha` (`boxBgAlpha`, `boxA`) | Wrapper background color (+ optional alpha 0–1 or 0–100)              |
| `boxRadius`      | Wrapper border radius in px                                                                     |
| `boxBorderWidth`, `boxBorderStyle`, `boxBorderColor` | Wrapper border controls                                     |
| `boxBlur`        | Wrapper backdrop blur in px                                                                     |
| `boxMargin` (`boxPadOuter`,`outer`) | Outer margin for glow/spacing                                                |
| `boxShadow` (`hex,blur[,spread]`), `boxShadowColor`, `boxShadowPx`, `boxShadowSpread` | Wrapper shadow              |
| `compact`        | Force compact layout even with backgrounds: `yes`                                               |
| `pad`, `gap`, `padMsg` | Override wrapper padding, message gap, and bubble padding                                |

## Example

```
https://chat.bytemike.de?streamer=mychannel&style=glass&bg=000000&text=00ffcc&font=Orbitron&size=22&small=yes&avatar=yes&bots=no
```

## Repository Structure

```
/backend   # Express server, Twitch auth helpers
/frontend  # Static overlay assets (HTML/CSS/JS)
```

Use `.gitignore` at the root plus `backend/.env.example` to keep secrets out of version control.
