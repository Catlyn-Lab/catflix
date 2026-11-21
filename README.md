# Catflix

A streaming app with its own catalogue: browse films and series, read about a title, pick an
episode and watch — in the app, with no ads, no pop-ups and no sponsor banners. It ships as a
native macOS app, and the same interface adapts to a phone, a browser window and a television.

![Catflix home](docs/home.png)

## What it does

- **Catalogue** — home rails, genre browsing and search-as-you-type, with posters and ratings.
- **Details** — overview, genres, cast, seasons and episodes, with your progress on each.
- **Player** — HLS via `hls.js`. Drag the timeline to scrub, skip 10 seconds either way, pick
  quality, subtitles, audio track, speed and source from one settings panel, resume where you
  left off, and roll into the next episode when one ends. Subtitles are drawn by the player.
- **English or Indonesian** — Catflix asks once, on first run, and remembers the answer; the
  globe button in the top bar changes it. In Indonesian the interface, genres and descriptions
  are in Indonesian, and Indonesian subtitles are switched on by default (English when a title
  has none). In English, English subtitles are on by default. Turn subtitles off in the player
  and they stay off.
- **No ads** — the app loads only the catalogue and playback API, never an ad slot, pop-under or
  sponsored pre-roll.
- **Local** — watch progress and preferences stay on the machine.

Built with Tauri 2 and SolidJS, so it is a small, fast desktop app rather than a browser tab.

## Screens and input

One layout, sized in `rem`, adapts to what it runs on:

| Where | What changes |
| --- | --- |
| Desktop | Top navigation, hover states, rail arrows, volume slider, picture in picture. |
| Phone / narrow window | Bottom tab bar, stacked detail page, swipeable genre row. In the player: tap to show controls, double-tap a side to skip 10 s, large centre play button, settings as a bottom sheet. |
| Television | 1.5× type and controls, a white focus ring, and remote-control navigation: arrows move focus, OK selects, Back goes back. In the player the arrows seek until you press up or down to reach the controls. |

A television is detected from its browser's user agent. To try that mode anywhere, open the app
with `?tv=1` (for example `http://localhost:1420/?tv=1`); `?tv=0` switches it back.

Player keys: `space`/`k` play, `←`/`→` or `j`/`l` skip 10 s, `↑`/`↓` volume, `m` mute,
`c` subtitles, `f` fullscreen, `n` next episode, `esc` back.

## How it works

`src/lib/api.ts` is the only module that talks to the network. It calls the catalogue and
playback API on interchangeable hosts, failing over between them when one is down or rate
limited and remembering the last one that worked. Playback asks `/api/stream` for sources
and hands the HLS playlist to the player; links are refreshed before they expire. The full
endpoint list is in [`docs/api.md`](docs/api.md).

The catalogue is in English only, so for Indonesian the descriptions are translated on request
by a public translation service (Google Translate, with MyMemory as a fallback) and cached on
the machine; only the description text is sent. Film titles and episode names are left as they
are.

Progress, preferences, cached translations and the remembered host live in local storage.

## Requirements

- macOS (the Tauri shell is configured for it), Node 20+ and a Rust toolchain with Xcode
  command line tools.

## Running

```sh
npm install
npm run tauri dev     # the desktop app
npm run dev           # the same interface in a browser, at http://localhost:1420
```

Built app:

```sh
npm run tauri build
# app:  src-tauri/target/release/bundle/macos/Catflix.app
# dmg:  src-tauri/target/release/bundle/dmg/Catflix_0.1.0_aarch64.dmg
```

The app icon source is `app-icon.png` (1024px); regenerate the icon set with `npx tauri icon app-icon.png`.

## Notes

- Metadata and artwork come from TMDB; films and series belong to their rights holders.
- If no source is available for a title, the player says so and offers to try again.
- The API hosts live in one array in `src/lib/api.ts`; everything else about the app is
  Catflix's own — the UI, navigation, player and layout.
