# Twitch Chat Overlay

A modern, customizable Twitch chat overlay supporting emotes (Twitch + 7TV), paint styles, mentions, bot filtering, and more.

## Features

- Twitch and 7TV emote support  
- 7TV Paint Styles and colors  
- Highlighted @mentions  
- Optional bot message filter  
- Automatic removal of timed-out or banned messages  
- Visual styles: Glassmorphism, Neon, Cyberpunk, Darkglass  
- Responsive compact mode (`&small=yes`)  
- Animated solo emotes  
- Profile pictures and badges  
- Custom font, size, colors, and alignment  

## Usage

Add the overlay URL as a **browser source** in OBS. Example:

```
https://yourserver.tld/?streamer=yourname
```

## Parameters

| Parameter     | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| `streamer`    | **Required**: Twitch channel name (without @)                               |
| `style`       | Design style: `glass`, `neon`, `cyberpunk`, `darkglass`, `pixel`, `retro`, `glitch`, or `no` for none |
| `bg`          | Background color as HEX (`ff0000`) or `no` for transparent                  |
| `text`        | Text color as HEX (`ffffff`)                                                |
| `font`        | Font name, e.g. `Roboto`, `Orbitron`                                        |
| `size`        | Font size in pixels (e.g. `22`)                                             |
| `align`       | Align chat right: use `right`                                               |
| `small`       | Enable compact mode: `yes`                                                  |
| `avatar`      | Show profile pictures: `yes` or `no` (only applies when `small=yes`)        |
| `bots`        | Hide bot messages: `no` (hides known bots)                                  |
| `ignore`      | Custom bot names to ignore (comma-separated), e.g. `mybot,foobarbot`        |
| `rand`        | Border radius in pixels, e.g. `6`                                           |
| `preview`     | Show dummy messages: `yes` (for static preview in browser)                  |

## Example

```
https://yourserver.tld?streamer=mychannel&style=glass&bg=000000&text=00ffcc&font=Orbitron&size=22&small=yes&avatar=yes&bots=no&rand=8
```
