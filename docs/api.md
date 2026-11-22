# Catflix API

Two APIs: the **catalogue and playback API** the interface reads titles and streams from, and
**Catflix's own server** (`server/`), which hosts the website, keeps accounts and sync, and makes
subtitles.

## Configuration

Hosts and keys are not in the repository. They live in `.env` (copy `.env.example`):

- `VITE_*` values are build settings, read by `src/lib/config.ts` and baked into the interface
  (and, for the native allow-list, into the desktop shell by `src-tauri/build.rs`). They are
  public by nature: anything shipped to a browser can be read.
- Everything else is read only by the server (`server/config.mjs`): Google sign-in, the AI
  model, translators, limits. Never prefix a secret with `VITE_`.

Release builds write `.env` from the `CATFLIX_ENV` repository secret.

## Catalogue and playback

Plain HTTPS + JSON, no credentials. The hosts (`VITE_CATALOGUE_HOSTS`) are interchangeable: when
one is down or answers `429`/`5xx`, the next is tried and the last one that worked is
remembered. Requests time out after 25 s. Hosted as a website, the interface asks its own server
(`/api/*`), which forwards with the same failover.

| Path | Purpose |
| --- | --- |
| `GET /api/home` | Home feed: `hero` plus `rails` of paged rows |
| `GET /api/genres` | `{ genres: [{ id, name }] }` |
| `GET /api/discover?type=movie\|tv&page=&genre=` | Paged browse results |
| `GET /api/search?q=&page=` | Paged search results |
| `GET /api/details?type=&id=` | Full details: overview, cast, seasons, trailers, recommendations |
| `GET /api/tv/{id}/season/{number}` | A season with its `episodes` |
| `GET /api/stream?type=&id=&season=&episode=` | Playback sources + subtitles |
| `GET /api/stream/check?type=&id=&provider=` | Per-provider availability probe |
| `GET /api/proxy?url=` | CORS/hot-link proxy; wraps stream, image and subtitle URLs |

### Page

```json
{ "success": true, "page": 1, "totalPages": 120, "totalResults": 2394, "results": [Item] }
```

### Item

```json
{ "id": "27205", "title": "Inception", "type": "movie", "poster": "https://…",
  "backdrop": "https://…", "overview": "…", "year": "2010", "rating": "8.4" }
```

`type` is `movie`, `tv` or `anime`.

### Streams

```json
{ "success": true,
  "sources": [{ "url": "https://…/master.m3u8", "quality": "1080p", "type": "hls",
                "server": "…", "audio": "en", "skipProxy": false }],
  "subtitles": [{ "url": "https://…/sub.vtt", "label": "English", "lang": "en" }],
  "alternates": ["https://…/watch/…"],
  "errors": [{ "provider": "…", "code": "…", "error": "…" }] }
```

Sources are HLS with separate audio and subtitle tracks; `hls.js` plays them. URLs are signed and
expire, so refresh with a new `stream` request. An empty `sources` array is normal for titles no
source carries yet — the player offers to retry.

### Anime and Asian drama

These sections have their own catalogues, read by `src/lib/sources.ts` (configured by
`VITE_ANIME_*`, `VITE_DRAMA_*`, `VITE_READER_URL`, `VITE_DIRECT_HOSTS`, `VITE_LOCKED_*`) and
normalised to the same `Item` / `Details` / `Episode` / `Streams` shapes.

### Native helpers (`src-tauri/src/lib.rs`, `src/lib/native.ts`)

A webview can't set `User-Agent` or `Referer`, so the desktop shell has helpers limited to an
allow-list of hosts fixed at build time (derived from `.env`):

- `native_get(url, referer?)` — returns `{ status, body, total }`.
- the `stream` scheme — `stream://localhost/?url=&referer=` (`http://stream.localhost/` on
  Windows and Android) relays one video request with the referer, in ranges of at most 8 MB.
- `open_external(url)` — opens a page of Catflix's own server in the system browser (sign-in).

`cargo test -- --ignored` (in `src-tauri`) checks them live; it reads `CATFLIX_TEST_*` variables.

## Catflix server

`node server/index.mjs` — no dependencies beyond Node 22.5+ (`node:sqlite`). Data is one SQLite
file (`DB_PATH`, default `data/catflix.db`). Responses are JSON; errors are
`{ "error": "a readable sentence" }`. Cross-origin calls (the desktop app) are allowed only from
`ALLOWED_ORIGINS`, with credentials.

### Accounts (Google)

| Path | Purpose |
| --- | --- |
| `GET /auth/google/start?return=/path` | Website sign-in: redirects to Google, then back with a `catflix_session` cookie |
| `GET /auth/google/start?device=<id>` | Desktop sign-in, opened in the system browser |
| `GET /auth/device/<id>` | The app polls this; answers `{ token }` once the browser sign-in finishes |
| `GET /auth/google/callback` | Google's redirect target (`PUBLIC_URL` + this path) |
| `GET /auth/me` | `{ user: { id, name, email, picture }, google: true }`, `401` when signed out |
| `POST /auth/logout` | Ends the session |

The website uses the HttpOnly cookie; the app sends `Authorization: Bearer <token>`. Guests can
use the website without an account; the desktop app asks to sign in.

### Sync

| Path | Purpose |
| --- | --- |
| `GET /sync?since=<ms>` | Progress and preferences changed since the cursor, plus a new cursor |
| `PUT /sync/progress` | `{ items: [Progress] }`; the newest `updatedAt` wins; also updates history |
| `PUT /sync/prefs` | `{ prefs, updatedAt }` |
| `GET /sync/history` / `DELETE /sync/history` | Watch history (one row per title), or clear it |

On sign-in, everything watched as a guest on that device is uploaded and merged.

### Subtitles

New subtitles are made from a title's existing subtitle file, with a translator or an AI model,
and shared with everyone who watches the same file.

| Path | Purpose |
| --- | --- |
| `GET /subtitles/options` | `{ languages: [{ code, name }], tones, ai, signedIn }` |
| `POST /subtitles/lookup` | `{ sources: [url] }` → `{ items: [Generated] }` already made from those files |
| `POST /subtitles` | `{ sourceUrl, sourceLabel, targetLang, method: "translate"\|"ai", tone?, customTone? }` → `Generated` |
| `GET /subtitles/<id>` | Status: `{ id, status: "working"\|"ready"\|"failed", cuesDone, cuesTotal, url, … }` |
| `GET /subtitles/<id>.vtt` | The cues made so far, as WebVTT |

- Translator: guests may use it, `GUEST_SUBTITLE_JOBS_PER_HOUR` per address.
- AI: signed-in viewers only, `AI_DAILY_CHARACTERS` per day. Tones: `formal`, `neutral`,
  `casual` (gaul), `kids`, `custom` (free text). Any OpenAI-compatible endpoint (`AI_BASE_URL`,
  `AI_API_KEY`, `AI_MODEL`).
- Source files are fetched by the server, which refuses private and local addresses.

### Other

| Path | Purpose |
| --- | --- |
| `GET /translate?to=&q=` | Translates a catalogue description (cached) |
| `GET /stream?url=` | Relays a video from hosts that need a referer (`VITE_LOCKED_HOSTS`) |
