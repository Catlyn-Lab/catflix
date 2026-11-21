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
