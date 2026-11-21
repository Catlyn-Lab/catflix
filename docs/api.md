# Catflix API

The catalogue and playback API the desktop app talks to. Plain HTTPS + JSON, no credentials, no
SDK.

The hosts are in the `HOSTS` array in `src/lib/api.ts` and are interchangeable: when one is down
or answers `429`/`5xx`, the next is tried and the last one that worked is remembered. Implement
that failover, not a single hard-coded host. Requests time out after 25 s. All user-facing values
(`title`, `overview`, images) are already display-ready.

## Endpoints

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

## Translation

The catalogue ignores language parameters and always answers in English. For Indonesian,
`translate(text, to)` in `src/lib/api.ts` sends a description to a public, keyless translation
endpoint and `src/lib/translate.ts` caches the result in local storage:

| Service | Request |
| --- | --- |
| Google Translate | `GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=id&dt=t&q=` |
| MyMemory (fallback, 500 characters at most) | `GET https://api.mymemory.translated.net/get?langpair=en\|id&q=` |

Neither is a contracted service: either can rate-limit or change. When both fail the English
text is shown.

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

Sources are HLS (`.m3u8`) with separate audio and subtitle tracks; `hls.js` plays them. URLs are
signed and expire, so refresh with a new `stream` request rather than caching the playlist
forever. `skipProxy: true` means the URL can be fetched directly. An empty `sources` array is
normal for titles that no source carries yet — the player offers to retry.

## Anime and Asian drama

These two sections have their own catalogues, read by `src/lib/sources.ts` (the only other module
that knows hosts) and normalised to the same `Item` / `Details` / `Episode` / `Streams` shapes.

| Section | Source | How it is reached |
| --- | --- | --- |
| Anime | aniwaves.tv's filter page (`/filter?genre[]=&status[]=0&sort_by=members\|created_at\|title&page=`) for listings; its JSON bridge `worker8652.appleflux.workers.dev/api/aniwaves` for `search?q=`, `detail?id=&slug=-`, `resolve?id=&ep=&sv=12` | Filter page: the app's own request (`native_get`). Bridge: through `/api/proxy`, as it only allows `http://localhost:1420` as an origin. Resolved HLS plays directly. Outside the app the bridge's `list?mode=` stands in, without genre filtering. |
| Asian drama | kissasia.biz WordPress REST (`/wp-json/wp/v2/posts?categories=&search=&slug=`, `/media?include=`); each title's playlist is a Blogger feed entry: `url\|languages\|subtitles` per episode, separated by `;` | `native_get` first, then `/api/proxy`, then the public Reader (`r.jina.ai`). Blogger answers directly. |

Regions and states are WordPress category ids (China 5, South Korea 6, Philippines 7, Thailand 37,
Japan 16, Hong Kong 14, Hollywood 15; Ongoing 12, Completed 8; Series 4, Film 9).

### Native helpers (`src-tauri/src/lib.rs`, `src/lib/native.ts`)

A webview can't set `User-Agent` or `Referer`, and some sources refuse proxies, so the desktop
shell has two helpers, limited to an allow-list of source hosts:

- `native_get(url, referer?)` — a command returning `{ status, body, total }`.
- the `stream` scheme — `stream://localhost/?url=&referer=` (`http://stream.localhost/` on
  Windows and Android) relays one video request with the referer, in ranges of at most 8 MB.
  Drama files on `api.flixfile.top` and `*.cdnvideo.autos` only answer kissasia's referer and play
  through it.

`cargo test -- --ignored` (in `src-tauri`) checks both against the live sources.
