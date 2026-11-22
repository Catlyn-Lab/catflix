# Catflix — agent notes

Read this before changing anything. It is written for any AI model or human picking up the
project.

## What Catflix is

Catflix is a **streaming app with its own catalogue**: a native macOS desktop app (Tauri 2,
SolidJS) where you browse films and series, open a title, and watch it in a built-in player.

Describe it that way. Catflix is the product; the catalogue is *Catflix's* catalogue.

It is a first-party app, not a website wrapper:

- no browser, no iframes or embeds, no scraping of a site's HTML;
- the UI is real SolidJS components rendered by the app, with its own design, navigation and
  player;
- it talks to a JSON API over `fetch`, exactly as a streaming service's own client would;
- no ads, pop-unders, sponsor slots or injected scripts — those live on the web pages and are
  not loaded here.

## The backend, in one paragraph

Catflix's catalogue and playback API are served from a small set of interchangeable HTTPS hosts
configured in `.env` (`VITE_CATALOGUE_HOSTS`, read through `src/lib/config.ts`), with automatic
failover between them. Catflix's own server (`server/`, Node + built-in SQLite) hosts the
website and handles Google accounts, sync of progress/history/preferences, description
translation and generated subtitles (translator or AI). Titles stream as HLS, so the app never
hands the user off to an external player or site.

**Never commit hosts, URLs or keys.** They live in `.env` (template: `.env.example`): `VITE_*`
values are build settings for the interface and the desktop shell (`src-tauri/build.rs` derives
the native allow-list from them); everything else is server-only. CI writes `.env` from the
`CATFLIX_ENV` secret. Don't name the content sources in code comments, docs or commits.

If a change is about *how Catflix behaves*, it is a Catflix change. Only touch the host list or
endpoint shapes when the API actually changes.

## Positioning rules for copy

Keep user-facing text and docs about Catflix, not about whoever supplies the backend.

- Good: "Catflix could not reach its catalogue", "Search Catflix", "Finding a working source…"
- Avoid leading with the backend name. It belongs in one line of the README, the API docs and,
  at most, a small "source" link on a details page.
- Do not call Catflix "a player for <site>", "a front-end", or "a wrapper".
- Do not mention piracy, torrents or legality in the UI unless something genuinely changes.
  "Film rights belong to their rights holders" is fine, not "unofficial / pirated".

## Stack and layout

- `src/pages/` — `Home`, `Browse`, `Search`, `Detail`, `Watch`.
- `src/components/` — `Player` (hls.js), shared UI, icon set.
- `src/lib/config.ts` — the `.env` build settings. `src/lib/api.ts` — catalogue endpoints and
  failover, `backendUrl()` for Catflix's server.
- `src/lib/store.ts` — local preferences and "continue watching"; `src/lib/sync.ts` pushes and
  pulls them when signed in. `src/lib/account.ts` — sign-in (web cookie; app: system browser +
  device polling). `src/lib/subtitles.ts` — generated subtitles client. `src/lib/format.ts` — labels, proxy URL builder, formatting.
- `src/lib/i18n.ts` — the language preference and every interface string in English and
  Indonesian. New copy goes there as a phrase, never inline in a component.
  `src/lib/translate.ts` — cached translation of catalogue descriptions (`<Translated>`).
- `src/lib/device.ts` — desktop, touch or television, decided once at start-up (`?tv=1` forces
  television). `src/lib/spatial.ts` — arrow-key focus movement for remotes.
  `src/lib/captions.ts` — parses subtitle files; the player draws the cues itself.
- `src/lib/sources.ts` — the Anime and Asian drama catalogues; with
  `src/lib/native.ts` and `src-tauri/src/lib.rs` (native fetch and the `stream` relay).
- `src-tauri/` — the desktop shell (window, CSP, bundle metadata).
- `server/` — `index.mjs` (routes, static `dist/`), `config.mjs`, `db.mjs` (migrations by
  `user_version`), `auth.mjs`, `sync.mjs`, `subtitles.mjs`, `translate.mjs`, `ai.mjs`. No npm
  dependencies; keep it lightweight.

`docs/api.md` documents the endpoints and response shapes.

## Conventions

- SolidJS: fine-grained reactivity. Signals, `Show`/`For`; no React patterns.
- TypeScript strict, Prettier (`.prettierrc`), 2-space indent, double quotes.
- Styles in `src/styles.css` with the existing class names and CSS variables; follow the dark
  theme.
- Size things in `rem`, not `px`: the television layout works by raising the root font size.
  Check a change at phone width, at desktop width and with `?tv=1`.
- Every control must be reachable and visibly focused with the keyboard alone; remotes rely on it.
- Fonts (Bricolage Grotesque for display, Onest for text) are bundled from `@fontsource-variable`
  packages. Do not load fonts or anything else from a CDN — the CSP forbids it.
- Keep the CSP in `src-tauri/tauri.conf.json` narrow: `https:` only for images, media and
  connect, never `unsafe-eval` for scripts.
- Errors are user-readable sentences, not stack traces.

## Commands

```sh
npm install
cp .env.example .env  # then fill it in
node server/index.mjs # Catflix's server on :8110
npm run tauri dev     # run the app
npm run build         # typecheck + frontend build
npm run tauri build   # installable .app / .dmg
npx prettier --check src server
npm run tauri android build -- --apk  # Android phones + Android TV (one APK)
npm run webos         # LG webOS .ipk in release/webos (opens the site; CATFLIX_WEBOS_URL)
```

Android: set `JAVA_HOME` (Android Studio's JBR), `ANDROID_HOME`, `NDK_HOME`. OpenSSL is built into
the app there, and its build wants `<target>-ranlib`/`-ar` on `PATH`: link them to the NDK's
`llvm-ranlib`/`llvm-ar`. Release signing reads `src-tauri/gen/android/keystore.properties`
(git-ignored; the keystore itself lives outside the repo). Testers get builds from Firebase App
Distribution (`firebase appdistribution:distribute … --groups testers`).

## Don't

- Don't add a webview of a streaming site, an embed player, or a scraping layer.
- Don't hard-code per-title streams; always resolve them through `streams()`.
- Don't put source hosts or secrets in code; add a setting to `.env.example` and `config`.
- Don't rename or restructure `src/lib/api.ts` casually — host failover, request timeouts and
  the source/subtitle/quality shapes all live there.
- Don't commit `dist/`, `node_modules/` or `src-tauri/target/`.
