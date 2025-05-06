// dummy-messages.js – finale Version mit funktionierenden Emotes, Badges, Profilbildern

window.DUMMY_MESSAGES = [
    {
        type: 'chat',
        username: 'streamqueen',
        displayName: 'StreamQueen',
        message: 'Hallo zusammen! 💜 Willkommen im Stream!',
        badges: ['https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/3'],
        profileImageUrl: 'https://picsum.photos/id/1011/40/40',
        twitchEmotes: [],
        sevenTvEmotes: [],
        sevenTvColor: '#ff66cc',
        sevenTvPaint: null
    },
{
    type: 'chat',
    username: 'gigauser',
    displayName: 'GigaUser',
    message: '@streamqueen das Overlay sieht richtig nice aus 😎',
    badges: ['https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3'],
    profileImageUrl: 'https://picsum.photos/id/1005/40/40',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#33ccff',
    sevenTvPaint: null
},
{
    type: 'chat',
    username: 'emotegod',
    displayName: 'EmoteGod',
    message: 'Kappa Keepo Kappa',
    badges: ['https://static-cdn.jtvnw.net/badges/v1/d97c37bd-a6f5-4c38-8f57-4e4bef88af34/1'],
    profileImageUrl: 'https://picsum.photos/id/1012/40/40',
    twitchEmotes: [
        {
            code: 'Kappa',
            url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0',
            start: 0,
            end: 4
        },
        {
            code: 'Keepo',
            url: 'https://static-cdn.jtvnw.net/emoticons/v2/1902/default/dark/3.0',
            start: 6,
            end: 10
        },
        {
            code: 'Kappa',
            url: 'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0',
            start: 12,
            end: 16
        }
    ],
    sevenTvEmotes: [],
    sevenTvColor: '#ffcc00',
    sevenTvPaint: null
},
{
    type: 'chat',
    username: 'rainbowbot',
    displayName: 'RainbowBot',
    message: 'Paints machen alles schöner 🌈',
    badges: [],
    profileImageUrl: 'https://picsum.photos/id/1013/40/40',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#ffffff',
    sevenTvPaint: {
        function: 'LINEAR_GRADIENT',
        angle: 45,
        repeat: true,
        stops: [
            { at: 0.0, color: 0xff0000ff },
            { at: 0.25, color: 0xffff00ff },
            { at: 0.5, color: 0x00ff00ff },
            { at: 0.75, color: 0x0000ffff },
            { at: 1.0, color: 0xff00ffff }
        ],
        shadows: [
            { x_offset: 1, y_offset: 1, radius: 1, color: 0x000000ff }
        ]
    }
},
{
    type: 'chat',
    username: 'emotesolo',
    displayName: 'SoloEmote',
    message: 'Sure',
    badges: ['https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/3'],
    profileImageUrl: 'https://picsum.photos/id/1014/40/40',
    twitchEmotes: [
        {
            code: 'Sure',
            url: 'https://cdn.7tv.app/emote/01GMTDJ83R000E68X75B8CJGAZ/4x.avif',
            start: 0,
            end: 4
        }
    ],
    sevenTvEmotes: [],
    sevenTvColor: '#ffffff',
    sevenTvPaint: null
},
{
    type: 'chat',
    username: 'lurky',
    displayName: 'Lurky',
    message: 'Bin nur kurz da, viel Spaß euch!',
    badges: [],
    profileImageUrl: 'https://picsum.photos/id/1016/40/40',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#999999',
    sevenTvPaint: null
},
{
    type: 'chat',
    username: 'modkatze',
    displayName: 'ModKatze',
    message: '@gigauser nicht spammen pls 😅',
    badges: ['https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/3'],
    profileImageUrl: 'https://picsum.photos/id/1019/40/40',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#66ff66',
    sevenTvPaint: null
},
{
    type: 'chat',
    username: 'emotestorm',
    displayName: 'EmoteStorm',
    message: 'BOOBA',
    badges: [],
    profileImageUrl: 'https://picsum.photos/id/1018/40/40',
    twitchEmotes: [
        {
            code: 'BOOBA',
            url: 'https://cdn.7tv.app/emote/01F6N31ETR0004P7N4A9PKS5X9/4x.avif',
            start: 0,
            end: 4
        }
    ],
    sevenTvEmotes: [],
    sevenTvColor: '#ff9900',
    sevenTvPaint: null
},
{
    type: 'chat',
    username: 'paintfan',
    displayName: 'PaintFan',
    message: 'Ich liebe diese Farben!',
    badges: [],
    profileImageUrl: 'https://picsum.photos/id/1020/40/40',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#ffffff',
    sevenTvPaint: {
        function: 'RADIAL_GRADIENT',
        shape: 'circle',
        repeat: false,
        stops: [
            { at: 0.0, color: 0xff66ccff },
            { at: 0.5, color: 0x6600ccff },
            { at: 1.0, color: 0x000000ff }
        ],
        shadows: [
            { x_offset: 1, y_offset: 1, radius: 1, color: 0x000000ff }
        ]
    }
},
{
    type: 'chat',
    username: 'nightowl',
    displayName: 'NightOwl',
    message: 'Gute Nacht allerseits 💤',
    badges: [],
    profileImageUrl: 'https://picsum.photos/id/1021/40/40',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#bbbbff',
    sevenTvPaint: null
}
];
