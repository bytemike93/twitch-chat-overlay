# Twitch Chat Overlay

Ein modernes, anpassbares Twitch-Chat-Overlay mit Support für Emotes (Twitch + 7TV), Paint Styles, Mentions, Bot-Filter, u.v.m.

## Features

- Twitch- und 7TV-Emotes
- 7TV Paint Styles & Farben
- @Mentions mit Hervorhebung
- Bot-Filter (optional)
- Auto-Entfernung gelöschter Nachrichten (Timeout/Ban)
- Glassmorphism-, Neon- und Cyberpunk-Stile
- Dynamisch kompakter Modus (&small=yes)

## Verwendung

Binde die Overlay-URL in OBS als Browser-Quelle ein, z. B.:

```
https://chat.bytemike.de/?streamer=deinname
```

## Parameter

| Parameter     | Beschreibung                                                                 |
|---------------|-------------------------------------------------------------------------------|
| `streamer`    | **Pflichtfeld**: Twitch-Name des Channels (ohne @)                           |
| `style`       | Designstil: `glass`, `neon`, `cyberpunk`, `darkglass`                        |
| `bg`          | Hintergrundfarbe als HEX (z. B. `ff0000`) oder `no` für transparent          |
| `text`        | Textfarbe als HEX (z. B. `ffffff`)                                           |
| `font`        | Schriftartname, z. B. `Roboto` oder `Orbitron`                               |
| `size`        | Textgröße in Pixeln                                                          |
| `align`       | Textausrichtung: `right` (optional)                                          |
| `small`       | Kompaktmodus aktivieren: `yes`                                               |
| `avatar`      | Profilbild anzeigen (nur bei `small=yes` relevant): `yes` oder `no`          |
| `bots`        | Botnachrichten ausblenden: `no`                                              |

## Beispiel

```
https://chat.bytemike.de?streamer=mychannel&style=glass&bg=000000&text=00ffcc&font=Orbitron&size=22&small=yes&bots=no
```


