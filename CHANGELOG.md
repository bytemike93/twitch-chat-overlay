# Changelog

## [1.6.0] – 2026-01-25
### Added
- Chat history storage with SQLite and a public history endpoint for restoring recent messages.
- Frontend history preload to restore chat after scene switches (configurable via URL params).

## [1.5.4] – 2026-01-18
### Changed
- Fonts are now loaded via the backend with local caching

## [1.5.3] – 2025-12-24
### Fixed
- Added exponential backoff with cooldown for join retries to avoid spam when channels are unavailable.
- Throttled join failure logs to at most once per minute per channel.

## [1.5.2] – 2025-11-01
### Fixed
- `paintAnim=yes` no longer adds an extra overlay animation to 7TV paints based on images (e.g., GIF/APNG). Intrinsically animated paints now render unchanged.

## [1.5.1] – 2025-10-31
### Changed
- ignore= now works independently of bots=no. Your custom ignore list is always enforced, even when global bot filtering is off.

### Fixed

- ignore entries are now trimmed and case-insensitive (e.g., &ignore=Bot1, bot2 ,BOT3 all match correctly).
- Resolved a logic issue where ignore had no effect unless &bots=no was present.

## [1.5.0] – 2025-10-29
### Added
- Full FFZ and BTTV Support (Emotes + Badges)

## [1.4.0] – 2025-09-06
### Added
- Wrapper (whole chat box) styling via URL params:
  - `boxBg` (`no` or 6-hex) with optional `boxAlpha` (0–1 or 0–100).
  - `boxBlur` (px), `boxRadius` (px).
  - Border: `boxBorderColor`, `boxBorderWidth`, `boxBorderStyle`.
  - Outer glow: `boxShadow=HEX,BLUR[,SPREAD]` or `boxShadowColor` + `boxShadowPx` [+ `boxShadowSpread`].
- Message auto-hide (TTL): `ttl={seconds}`.
- Compact layout controls: `compact=yes` plus fine-tuning overrides `pad`, `gap`, `padMsg`.
- Preview mode: `preview=yes` skips intro and renders dummy chat.

### Changed
- Right-aligned + small mode refined (shrink-to-content, cleaner spacing).
- Mention highlighting and 7TV paints improved; optional `paintAnim=yes` for subtle animation.
- Overflow pruning made smoother when `flow` is not enabled.

### Fixed
- `boxShadow` parsing supports both combined and separate forms.
- More robust removal on moderator events (`clear_user_messages`, `clear_message_id`, `clear_all`).

## [1.3.1] – 2025-08-25
### Changed
- changed entry animation of messages

## [1.3.0] – 2025-08-24
### Added
- New URL parameter `ttl` for removing messages after x seconds

## [1.2.1] – 2025-08-17
### Fixed
- 7TV Connection Error
- Slow picture loading in preview mode (now local images)
- Various design fixes

## [1.2.0] – 2025-08-15
### Added
- New Overlay Builder sections: **Display name color**, **Border** (color/width/style), and **Glow** with live preview.
- New URL params: `name`, `borderColor`, `borderWidth`, `borderStyle` (`solid|dashed|dotted|none`), `glowColor`, `glowPx`, `glow=none`, `prune=off` and `shadow=none`.

### Changed
- **Presets are now applied as-is.** Modifications are only added to the URL if the user explicitly changes them (dirty flags). Switching presets clears previous overrides.

## [1.1.11] – 2025-06-21
### Fixed
- Showing channel sub badges instead of global sub badges now

## [1.1.10] – 2025-05-31
### Changed
- Fixed word wrap in align right mode

## [1.1.9] – 2025-05-25
### Changed
- Implemented removal of deleted messages

## [1.1.8] – 2025-05-23
### Fixed
- Fixed color codes in style.css
- Fixed word wrap after emotes

## [1.1.7] – 2025-05-22
### Changed
- Implemented Timeout for 7TV API, Fixed Gap after/before mention

## [1.1.6] – 2025-05-19
### Fixed
- Fixed align=right, CSS cleanup

## [1.1.5] – 2025-05-17
### Fixed
- Fixed message flow in small mode

## [1.1.4] – 2025-05-16
### Changed
- Changed margin-left of chatter name to 2px
- Minimized gap between messages in small mode without background

## [1.1.3] – 2025-05-12
### Changed
- Fixed half-visible messages

## [1.1.2] – 2025-05-09
### Added
- Added URL parameter for ignoring custom bots
- Added sery_bot to known bots

## [1.1.1] – 2025-05-08
### Added
- Added URL parameter for border radius

## [1.1.0] – 2025-05-07
### Added
- Added Styles "Pixel", "Glitch" and "Retro"
- Cleaned up style.css, added Google Fonts

## [1.0.2-preview] – 2025-05-05
### Changed
- Added `?preview=yes` support for testing without intro animation
- Loads dummy messages instead of live WebSocket data
- Skips introWrapper animation in preview mode

## [1.0.2] – 2025-05-05
### Changed
- Changed default message size to 24px
- Removed gap between badges and chatter name

## [1.0.1] – 2025-05-05
### Added
- Performance Improvements

## [1.0.0] – 2025-05-04
### Added
- Released Version 1.0.0
