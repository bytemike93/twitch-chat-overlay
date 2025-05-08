const introWrapper = document.getElementById('intro-wrapper');
const chatWrapper  = document.getElementById('chat-wrapper');
const params = new URLSearchParams(window.location.search);
const isPreview = params.get('preview') === 'yes';

if (isPreview) {
    introWrapper.style.display = 'none';
    startChat();
} else {
    introWrapper.addEventListener('animationend', () => {
        introWrapper.style.display = 'none';
        startChat();
    });
}

function startChat() {

    let ws;
    function initWebSocket() {
        ws = new WebSocket('wss://chatbackend.bytemike.de'); // ← Live
        // ws = new WebSocket('ws://localhost:3000'); // ← Staging

        ws.addEventListener('open', () => {
            const streamerName = params.get('streamer');
            if (!streamerName || !/^[a-zA-Z0-9_]{4,25}$/.test(streamerName)) {
                console.error("Ungültiger Streamername. Overlay nicht geladen.");
                return;
            }
            ws.send(JSON.stringify({ streamerName }));
        });

        ws.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);

            if (message.type === 'clear_user_messages' && message.username) {
                const elements = userMessages.get(message.username);
                if (elements) {
                    elements.forEach(el => el.remove());
                    userMessages.delete(message.username);
                }
                return;
            }

            if (message.type !== 'chat') return;
            if (hideBots && knownBots.includes(message.username.toLowerCase())) return;
            await renderMessage(message);
        });

        ws.addEventListener('close', () => {
            console.warn("WebSocket-Verbindung verloren, versuche erneut...");
            setTimeout(initWebSocket, 3000); // automatisch reconnect
        });

        ws.addEventListener('error', (error) => {
            console.error("WebSocket Fehler:", error);
        });
    }

    if (isPreview) {
        const script = document.createElement('script');
        script.src = 'dummy-messages.js';
        script.onload = () => {
            if (Array.isArray(window.DUMMY_MESSAGES)) {
                window.DUMMY_MESSAGES.forEach(renderMessage);
            }
        };
        script.onerror = () => {
            console.error('Konnte Dummy-Nachrichten nicht laden.');
        };
        document.head.appendChild(script);
    } else {
        initWebSocket();
    }

    chatWrapper.style.display = 'flex';

    const chatContainer = document.getElementById('chat-container');
    const wrapper = document.getElementById('chat-wrapper');
    const messageQueue = [];
    const bgHex = params.get('bg');
    const styleParam = params.get('style');
    const isHex = hex => /^[0-9a-fA-F]{6}$/.test(hex);

    const userMessages = new Map();
    const isSmallMode = params.get('small') === 'yes';
    if (isSmallMode) {
        document.body.setAttribute('data-small', 'yes');
    }
    const showAvatarInSmall = params.get('avatar') === 'yes';
    const alignParam = params.get('align');
    const hideBots = params.get('bots') === 'no';
    const knownBots = [
        'nightbot',
        'streamelements',
        'streamlabs',
        'moobot',
        'wizebot',
        'fossabot',
        'own3d',
        'coebot',
        'phantombot',
        'deepbot',
        'scorpbot',
        'xanbot',
        'anotherttvviewer',
        'stay_hydrated_bot',
        'supibot',
        'vivbot',
        'mixitupbot',
        'muxybot',
        'soundalerts',
        'soundalerts_bot',
        'apulxd',
        'cloudbot'
    ];

    if (!isSmallMode) {
        document.body.setAttribute("data-avatar", params.get('avatar') === 'no' ? 'no' : 'yes');
    }

    if (alignParam === 'right') {
        document.body.setAttribute('data-align', 'right');
    }

    const radius = params.get('rand');
    if (radius && /^\d+$/.test(radius)) {
        const style = document.createElement('style');
        style.textContent = `
        .chat-message {
            border-radius: ${radius}px !important;
        }
        `;
        document.head.appendChild(style);
    }

    const bgNo = bgHex?.toLowerCase() === 'no';
    const useCustomBg = bgHex && isHex(bgHex);

    if (bgNo) {
        document.body.setAttribute('data-style', 'no');
    } else if (styleParam) {
        document.body.setAttribute('data-style', styleParam);
    }

    if (styleParam === 'glass' && useCustomBg) {
        const r = parseInt(bgHex.slice(0, 2), 16);
        const g = parseInt(bgHex.slice(2, 4), 16);
        const b = parseInt(bgHex.slice(4, 6), 16);
        const overlay = `rgba(${r}, ${g}, ${b}, 0.35)`;

        const gradient = bgHex !== '000000'
        ? `linear-gradient(to bottom right, rgba(255,255,255,0.08), ${overlay})`
        : overlay;

        const style = document.createElement('style');
        style.textContent = `
        body[data-style="glass"] .chat-message {
            background: ${gradient};
        }
        `;
        document.head.appendChild(style);
    }

    if (!styleParam && useCustomBg) {
        const style = document.createElement('style');
        style.textContent = `
        .chat-message {
            background-color: #${bgHex};
        }
        `;
        document.head.appendChild(style);
    }

    const textHex = params.get('text');
    if (textHex && /^[0-9a-fA-F]{6}$/.test(textHex)) {
        const r = parseInt(textHex.slice(0, 2), 16);
        const g = parseInt(textHex.slice(2, 4), 16);
        const b = parseInt(textHex.slice(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        const shadowColor = brightness > 128
        ? 'rgba(0, 0, 0, 0.6)'
        : 'rgba(255, 255, 255, 0.6)';

        const style = document.createElement('style');
        style.textContent = `
        .message-text {
            color: #${textHex} !important;
            text-shadow: 1px 1px 2px ${shadowColor} !important;
        }
        `;
        document.head.appendChild(style);
    }

    const fontParam = params.get('font');
    const size = params.get('size');

    if (fontParam) {
        const fontName = decodeURIComponent(fontParam).replace(/['"]/g, '');
        const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`;

        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = fontUrl;
        document.head.appendChild(fontLink);

        const style = document.createElement('style');
        style.textContent = `
        .message-text {
            font-family: '${fontName}', sans-serif !important;
            ${size ? `font-size: ${parseInt(size, 10)}px !important;` : ''}
        }
        `;
        document.head.appendChild(style);
    } else if (size) {

        const style = document.createElement('style');
        style.textContent = `
        .message-text {
            font-size: ${parseInt(size, 10)}px !important;
        }
        `;
        document.head.appendChild(style);
    }

    if (isSmallMode) {
        const baseSize = size ? parseInt(size, 10) : 22;
        const style = document.createElement('style');
        style.textContent = `
        body[data-small="yes"] .chat-message {
            font-size: ${baseSize}px !important;
            gap: ${Math.round(baseSize * 0.25)}px !important;
        }

        body[data-small="yes"] .badge,
        body[data-small="yes"] .profile-image {
            width: ${baseSize}px !important;
            height: ${baseSize}px !important;
        }

        body[data-small="yes"][data-avatar="yes"] .profile-image {
            display: inline-block !important;
            margin-right: ${Math.round(baseSize * 0.25)}px !important;
            vertical-align: middle;
            border-radius: 50% !important;
        }

        body[data-small="yes"][data-avatar="no"] .profile-image {
            display: none !important;
        }

        body[data-small="yes"] .chatter-name,
        body[data-small="yes"] .seven-tv-paint,
        body[data-small="yes"] .message-text {
            font-size: ${baseSize}px !important;
            line-height: 1.4 !important;
        }

        body[data-small="yes"] .twitch-emote,
        body[data-small="yes"] .seventv-emote {
            height: ${Math.round(baseSize * 1.2)}px !important;
        }
        `;
        document.head.appendChild(style);

        document.body.setAttribute("data-avatar", showAvatarInSmall ? "yes" : "no");
    }

    const soloStyle = document.createElement('style');
    soloStyle.textContent = `
    .twitch-emote.solo-emote,
    .seventv-emote.solo-emote {
        height: 4em !important;
        margin-top: 8px;
    }
    `;
    document.head.appendChild(soloStyle);

    function appendStyledText(text, container, message) {
        const username = message.username;
        const regex = new RegExp(`(@${username})`, 'gi');
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const mentionSpan = document.createElement('span');
            mentionSpan.textContent = match[0];
            mentionSpan.style.fontWeight = 'bold';

            if (message.sevenTvPaint) {
                applyPaintStyle(mentionSpan, message.sevenTvPaint, message.sevenTvColor ?? message.twitchColor ?? '#fff');
            } else {
                mentionSpan.style.color = message.sevenTvColor ?? message.twitchColor ?? '#fff';
            }

            container.appendChild(mentionSpan);
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            container.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
    }

    async function renderMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';

        const messageContent = message.message.trim();
        const emotes = [...(message.twitchEmotes || []), ...(message.sevenTvEmotes || [])];
        emotes.sort((a, b) => a.start - b.start);

        const onlyOneEmote = emotes.length === 1 && messageContent === emotes[0].code;

        const textElement = document.createElement('span');
        textElement.className = 'message-text';

        let lastIndex = 0;

        emotes.forEach(emote => {
            if (emote.start > lastIndex) {
                const segment = messageContent.slice(lastIndex, emote.start);
                appendTextWithMentions(segment, textElement, message);
            }

            const emoteImg = document.createElement('img');
            emoteImg.src = emote.url;
            emoteImg.alt = emote.code;
            emoteImg.className = emote.url.includes('7tv') ? 'seventv-emote' : 'twitch-emote';

            if (onlyOneEmote) {
                emoteImg.classList.add('solo-emote');
            } else {
                emoteImg.classList.add('inline-emote');
            }

            textElement.appendChild(emoteImg);

            lastIndex = emote.end + 1;
        });

        if (lastIndex < messageContent.length) {
            const segment = messageContent.slice(lastIndex);
            appendTextWithMentions(segment, textElement, message);
        }

        if (isSmallMode) {
            const line = document.createElement('div');
            line.className = 'message-line';

            const fullLine = document.createElement('span');
            fullLine.className = 'full-line';

            if (message.profileImageUrl && showAvatarInSmall) {
                const profileImg = document.createElement('img');
                profileImg.src = message.profileImageUrl;
                profileImg.className = 'profile-image';
                fullLine.appendChild(profileImg);
            }

            (message.badges || []).forEach(badgeUrl => {
                const badge = document.createElement('img');
                badge.src = badgeUrl;
                badge.className = 'badge';
                fullLine.appendChild(badge);
            });

            if ((message.badges || []).length === 0) {
                fullLine.classList.add('no-badge');
            }

            const usernameElement = document.createElement('span');
            usernameElement.className = 'chatter-name';
            usernameElement.textContent = message.displayName || message.username;

            if (message.sevenTvPaint) {
                applyPaintStyle(usernameElement, message.sevenTvPaint, message.sevenTvColor ?? message.twitchColor ?? "#fff");
            } else if (message.sevenTvColor) {
                usernameElement.style.color = message.sevenTvColor;
            } else {
                usernameElement.style.color = message.twitchColor ?? "#fff";
            }

            fullLine.appendChild(usernameElement);
            fullLine.appendChild(textElement);

            line.appendChild(fullLine);
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

            (message.badges || []).forEach(badgeUrl => {
                const badge = document.createElement('img');
                badge.src = badgeUrl;
                badge.className = 'badge';
                firstLine.appendChild(badge);
            });

            if ((message.badges || []).length === 0) {
                firstLine.classList.add('no-badge');
            }

            const usernameElement = document.createElement('span');
            usernameElement.className = 'chatter-name';
            usernameElement.textContent = message.displayName || message.username;

            if (message.sevenTvPaint) {
                applyPaintStyle(usernameElement, message.sevenTvPaint, message.sevenTvColor ?? message.twitchColor ?? "#fff");
            } else if (message.sevenTvColor) {
                usernameElement.style.color = message.sevenTvColor;
            } else {
                usernameElement.style.color = message.twitchColor ?? "#fff";
            }

            firstLine.appendChild(usernameElement);
            messageElement.appendChild(firstLine);
            messageElement.appendChild(textElement);
        }

        const frag = document.createDocumentFragment();
        frag.appendChild(messageElement);
        chatContainer.appendChild(frag);
        messageQueue.push(messageElement);

        if (!userMessages.has(message.username)) {
            userMessages.set(message.username, new Set());
        }
        userMessages.get(message.username).add(messageElement);

        await new Promise(r => requestAnimationFrame(r));

        while (messageQueue.length > 0) {
            const first = messageQueue[0];
            const rect = first.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();

            if (rect.top < wrapperRect.top) {
                chatContainer.removeChild(first);
                messageQueue.shift();
            } else {
                break;
            }
        }

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function appendTextWithMentions(text, container, message) {
        const mentionRegex = /@(\w+)/g;
        let match;
        let lastIndex = 0;

        while ((match = mentionRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            const mentionedName = match[1];
            const mentionSpan = document.createElement('span');
            mentionSpan.textContent = `@${mentionedName}`;
            mentionSpan.style.fontWeight = 'bold';

            if (mentionedName.toLowerCase() === message.username.toLowerCase()) {
                if (message.sevenTvPaint) {
                    applyPaintStyle(mentionSpan, message.sevenTvPaint, message.sevenTvColor ?? message.twitchColor ?? "#fff");
                } else if (message.sevenTvColor) {
                    mentionSpan.style.color = message.sevenTvColor;
                } else if (message.twitchColor) {
                    mentionSpan.style.color = message.twitchColor;
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
        return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    }

    function applyPaintStyle(element, paint, fallbackColor = null) {
        if (!paint) {
            if (fallbackColor) {
                element.style.color = fallbackColor;
            }
            return;
        }

        let background = "";
        const repeatPrefix = paint.repeat ? "repeating-" : "";

        switch (paint.function) {
            case "LINEAR_GRADIENT":
                const linearStops = paint.stops.map(stop =>
                `${decimalToRGBAString(stop.color)} ${stop.at * 100}%`
                );
                background = `${repeatPrefix}linear-gradient(${paint.angle ?? 270}deg, ${linearStops.join(', ')})`;
                break;

            case "RADIAL_GRADIENT":
                const radialStops = paint.stops.map(stop =>
                `${decimalToRGBAString(stop.color)} ${stop.at * 100}%`
                );
                background = `${repeatPrefix}radial-gradient(${paint.shape ?? 'circle'}, ${radialStops.join(', ')})`;
                break;

            case "URL":
                background = `url(${paint.image_url})`;
                break;

            default:
                break;
        }

        element.style.backgroundImage = background;
        element.style.backgroundSize = '100% 100%';
        element.style.backgroundClip = 'text';
        element.style.webkitBackgroundClip = 'text';
        element.style.color = 'transparent';
        element.style.webkitTextFillColor = 'transparent';

        if (paint.shadows && Array.isArray(paint.shadows)) {
            const shadows = paint.shadows.map(shadow =>
            `drop-shadow(${shadow.x_offset}px ${shadow.y_offset}px ${shadow.radius}px ${decimalToRGBAString(shadow.color)})`
            ).join(' ');
            element.style.filter = shadows;
        }

        element.classList.add('seven-tv-paint');
        if (paint.repeat) {
            element.classList.add('animated');
        }
    }

    window.addEventListener("error", (e) => {
        console.error("[Overlay Fehler]", e.message);
    });

    window.addEventListener("unhandledrejection", (e) => {
        console.warn("[Overlay Promise Fehler]", e.reason);
    });
}
