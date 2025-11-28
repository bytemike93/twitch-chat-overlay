// dummy-messages.js – finale Version mit funktionierenden Emotes, Badges, Profilbildern

window.DUMMY_MESSAGES = [
{
    type: 'chat',
    username: 'streamqueen',
    displayName: 'StreamQueen',
    message: 'Hallo zusammen! 💜 Willkommen im Stream!',
    badges: ['/preview/badges/streamer.png'],
    profileImageUrl: '/preview/profiles/streamqueen.jpg',
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
    badges: ['/preview/badges/mod.png'],
    profileImageUrl: '/preview/profiles/gigauser.jpg',
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
    badges: ['/preview/badges/tool.png'],
    profileImageUrl: '/preview/profiles/emotegod.jpg',
    twitchEmotes: [
        {
            code: 'Kappa',
            url: '/preview/emotes/kappa.0',
            start: 0,
            end: 4
        },
        {
            code: 'Keepo',
            url: '/preview/emotes/keepo.0',
            start: 6,
            end: 10
        },
        {
            code: 'Kappa',
            url: '/preview/emotes/kappa2.0',
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
    profileImageUrl: '/preview/profiles/rainbowbot.jpg',
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
    badges: ['/preview/badges/vip.png'],
    profileImageUrl: '/preview/profiles/emotesolo.jpg',
    twitchEmotes: [
        {
            code: 'Sure',
            url: '/preview/emotes/sure.avif',
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
    profileImageUrl: '/preview/profiles/lurky.jpg',
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
    badges: ['/preview/badges/mod.png'],
    profileImageUrl: '/preview/profiles/modkatze.jpg',
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
    profileImageUrl: '/preview/profiles/emotestorm.jpg',
    twitchEmotes: [
        {
            code: 'BOOBA',
            url: '/preview/emotes/booba.avif',
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
    profileImageUrl: '/preview/profiles/paintfan.jpg',
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
    profileImageUrl: '/preview/profiles/nightowl.jpg',
    twitchEmotes: [],
    sevenTvEmotes: [],
    sevenTvColor: '#bbbbff',
    sevenTvPaint: null
}
];
