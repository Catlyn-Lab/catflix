// Alternative subtitles for Asian drama, from subtitle services with a public API: SubDL first,
// OpenSubtitles as a backup. Used only when DRAMA_SUBTITLES=alternative. The keys stay on this
// server; every file is downloaded once and kept in the database, so the services' daily
// allowances go further.
//
//   GET /subtitles/external?title=&year=&season=&episode=   → { mode, items: [{ url, label, lang }] }
//   GET /subtitles/external/<id>                            → the subtitle file (SRT or WebVTT)
import zlib from "node:zlib";
import { config } from "./config.mjs";
import { db } from "./db.mjs";
import { allow, clientIp, fail, send } from "./http.mjs";

const TIMEOUT = 20_000;
const SEARCH_TTL = 12 * 60 * 60_000;
const MAX_FILE = 3 * 1024 * 1024;
const PER_LANGUAGE = 3;
const USER_AGENT = "Catflix v0.2";

const languageName = (code) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};
/** "EN", "english", "id", "indonesian", "pt-BR" → a two-letter code. */
const NAMES = Object.fromEntries(
  ["en", "id", "ms", "tl", "ja", "ko", "zh", "th", "vi", "ar", "hi", "es", "fr", "de", "pt", "ru"].map(
    (code) => [languageName(code).toLowerCase(), code],
  ),
);
const codeOf = (value) => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  return NAMES[text] ?? NAMES[text.split(/[\s(]/)[0]] ?? text.split(/[-_]/)[0];
};

export const alternativeReady = () =>
  config.dramaSubtitles === "alternative" && Boolean(config.subdl.apiKey || config.opensubtitles.apiKey);

/* ------------------------------------------------------------------ search */

/** [{ provider, ref, lang, release }] where ref is what the provider needs to download the file. */
async function searchSubdl({ title, year, season, episode }) {
  if (!config.subdl.apiKey) return [];
  const query = (extra) =>
    new URLSearchParams({
      api_key: config.subdl.apiKey,
      film_name: title,
      languages: config.alternativeLanguages.map((code) => code.toUpperCase()).join(","),
      subs_per_page: "30",
      unpack: "1",
      client: "custom_integration",
      ...(year ? { year: String(year) } : {}),
      ...extra,
    });
  const ask = async (extra) => {
    const response = await fetch(`${config.subdl.apiUrl}?${query(extra)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const payload = await response.json().catch(() => ({}));
    return payload.status ? (payload.subtitles ?? []) : [];
  };
  let found = await ask({ type: "tv", season_number: String(season), episode_number: String(episode) });
  if (!found.length && episode === 1) found = await ask({ type: "movie" });

  const out = [];
  for (const entry of found) {
    const lang = codeOf(entry.language ?? entry.lang);
    // A season pack: take the file for this episode from inside it.
    const inside = (entry.unpack_files ?? []).find(
      (file) => Number(file.episode) === episode && (!file.season || Number(file.season) === season),
    );
    if (entry.full_season && !inside) continue;
    if (!entry.full_season && entry.episode && Number(entry.episode) !== episode) continue;
    out.push({
      provider: "subdl",
      ref: inside?.url ?? entry.url,
      lang: inside ? codeOf(inside.language) || lang : lang,
      release: inside?.release_name ?? entry.release_name ?? "",
    });
  }
  return out;
}

let openSubtitlesToken = { value: "", until: 0 };
async function openSubtitlesHeaders(withLogin = false) {
  const headers = {
    "Api-Key": config.opensubtitles.apiKey,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const { username, password } = config.opensubtitles;
  if (withLogin && username && password) {
    if (openSubtitlesToken.until < Date.now()) {
      const response = await fetch(`${config.opensubtitles.apiUrl}/login`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const payload = await response.json().catch(() => ({}));
      openSubtitlesToken = { value: payload.token ?? "", until: Date.now() + 12 * 60 * 60_000 };
    }
    if (openSubtitlesToken.value) headers.Authorization = `Bearer ${openSubtitlesToken.value}`;
  }
  return headers;
}

async function searchOpenSubtitles({ title, year, season, episode }) {
  if (!config.opensubtitles.apiKey) return [];
  const ask = async (extra) => {
    const query = new URLSearchParams({
      query: title,
      languages: config.alternativeLanguages.join(","),
      ...(year ? { year: String(year) } : {}),
      ...extra,
    });
    const response = await fetch(`${config.opensubtitles.apiUrl}/subtitles?${query}`, {
      headers: await openSubtitlesHeaders(),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const payload = await response.json().catch(() => ({}));
    return payload.data ?? [];
  };
  let found = await ask({ type: "episode", season_number: String(season), episode_number: String(episode) });
  if (!found.length && episode === 1) found = await ask({ type: "movie" });
  return found
    .map((entry) => entry.attributes ?? {})
    .filter((entry) => entry.files?.[0]?.file_id)
    .map((entry) => ({
      provider: "opensubtitles",
      ref: String(entry.files[0].file_id),
      lang: codeOf(entry.language),
      release: entry.release ?? "",
    }));
}

const searches = new Map();

/** Up to a few files per language, SubDL's first; OpenSubtitles only when SubDL found nothing. */
async function search(request) {
  const key = JSON.stringify(request);
  const cached = searches.get(key);
  if (cached && cached.until > Date.now()) return cached.items;

  let found = await searchSubdl(request).catch((error) => {
    console.warn(`[subtitles] SubDL: ${error.message}`);
    return [];
  });
  if (!found.length) {
    found = await searchOpenSubtitles(request).catch((error) => {
      console.warn(`[subtitles] OpenSubtitles: ${error.message}`);
      return [];
    });
  }
  const wanted = new Set(config.alternativeLanguages);
  const counts = {};
  const items = found.filter((entry) => {
    if (!wanted.has(entry.lang) || !entry.ref) return false;
    counts[entry.lang] = (counts[entry.lang] ?? 0) + 1;
    return counts[entry.lang] <= PER_LANGUAGE;
  });
  searches.set(key, { items, until: Date.now() + SEARCH_TTL });
  if (searches.size > 2000) searches.delete(searches.keys().next().value);
  return items;
}

/* ---------------------------------------------------------------- download */

/** Text of a subtitle file in UTF-8, or Windows-1252 when it is not valid UTF-8. */
function decode(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The subtitle file inside a ZIP (the one for `episode` when there are several). */
function fromZip(buffer, episode) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a zip file");
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = [];
  for (let index = 0; index < count && buffer.readUInt32LE(at) === 0x02014b50; index++) {
    const method = buffer.readUInt16LE(at + 10);
    const size = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extra = buffer.readUInt16LE(at + 30);
    const comment = buffer.readUInt16LE(at + 32);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    files.push({ name, method, size, local });
    at += 46 + nameLength + extra + comment;
  }
  const subtitles = files.filter((file) => /\.(srt|vtt)$/i.test(file.name) && file.size < MAX_FILE);
  const pattern = new RegExp(`(e|ep|episode|x)\\s*0*${episode}(?!\\d)`, "i");
  const file = subtitles.find((entry) => pattern.test(entry.name)) ?? subtitles[0];
  if (!file) throw new Error("no subtitle file in the archive");
  const start = file.local + 30 + buffer.readUInt16LE(file.local + 26) + buffer.readUInt16LE(file.local + 28);
  const data = buffer.subarray(start, start + file.size);
  if (file.method === 0) return data;
  if (file.method === 8) return zlib.inflateRawSync(data);
  throw new Error("unsupported compression in the archive");
}

async function download({ provider, ref, episode }) {
  if (provider === "subdl") {
    const response = await fetch(`${config.subdl.downloadUrl}${ref.startsWith("/") ? "" : "/"}${ref}`, {
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) throw new Error(`SubDL answered ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_FILE * 4) throw new Error("the file is too large");
    return decode(bytes[0] === 0x50 && bytes[1] === 0x4b ? fromZip(bytes, episode) : bytes);
  }
  const response = await fetch(`${config.opensubtitles.apiUrl}/download`, {
    method: "POST",
    headers: await openSubtitlesHeaders(true),
    body: JSON.stringify({ file_id: Number(ref) }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const payload = await response.json().catch(() => ({}));
  if (!payload.link) throw new Error(payload.message ?? `OpenSubtitles answered ${response.status}`);
  const file = await fetch(payload.link, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!file.ok) throw new Error(`OpenSubtitles answered ${file.status}`);
  return decode(Buffer.from(await file.arrayBuffer()));
}

/** "subdl~<ref>~<episode>" as a URL-safe id, and back. */
const encodeId = (entry, episode) =>
  Buffer.from(`${entry.provider}~${entry.ref}~${episode}`).toString("base64url");
const decodeId = (id) => {
  const [provider, ref, episode] = Buffer.from(id, "base64url").toString("utf8").split("~");
  if (!["subdl", "opensubtitles"].includes(provider) || !ref) return null;
  if (provider === "subdl" && !/^\/?subtitle\/[\w./-]+$/.test(ref)) return null;
  if (provider === "opensubtitles" && !/^\d+$/.test(ref)) return null;
  return { provider, ref, episode: Number(episode) || 1 };
};

const readCached = db.prepare("SELECT body FROM external_subtitles WHERE key = ?");
const keep = db.prepare("INSERT OR REPLACE INTO external_subtitles (key, body, fetched_at) VALUES (?, ?, ?)");

/** The file for an id from GET /subtitles/external, fetched once and then kept. */
export async function externalFile(id) {
  const cached = readCached.get(id);
  if (cached) return cached.body;
  const target = decodeId(id);
  if (!target) throw new Error("no such subtitle");
  const body = await download(target);
  if (!body.includes("-->")) throw new Error("that file has no subtitles");
  keep.run(id, body, Date.now());
  return body;
}

/** The id inside one of this server's own alternative-subtitle URLs, or null. */
export const externalIdOf = (url) => {
  const prefix = `${config.publicUrl}/subtitles/external/`;
  return typeof url === "string" && url.startsWith(prefix) ? url.slice(prefix.length) : null;
};

/* ------------------------------------------------------------------ routes */

export async function handleExternal(req, res, url) {
  if (url.pathname === "/subtitles/external") {
    if (!alternativeReady()) return send(res, 200, { mode: "original", items: [] });
    const title = (url.searchParams.get("title") ?? "").trim().slice(0, 160);
    const year = Number(url.searchParams.get("year")) || null;
    const season = Math.max(1, Number(url.searchParams.get("season")) || 1);
    const episode = Math.max(1, Number(url.searchParams.get("episode")) || 1);
    if (!title) return fail(res, 400, "which title?");
    if (!allow(`external:${clientIp(req)}`, 120, 60 * 60_000)) {
      return fail(res, 429, "too many subtitle searches for now, try again later");
    }
    const found = await search({ title, year, season, episode });
    const seen = {};
    return send(res, 200, {
      mode: "alternative",
      items: found.map((entry) => {
        seen[entry.lang] = (seen[entry.lang] ?? 0) + 1;
        const provider = entry.provider === "subdl" ? "SubDL" : "OpenSubtitles";
        return {
          url: `${config.publicUrl}/subtitles/external/${encodeId(entry, episode)}`,
          lang: entry.lang,
          label: `${languageName(entry.lang)} · ${provider}${seen[entry.lang] > 1 ? ` ${seen[entry.lang]}` : ""}`,
          release: entry.release,
        };
      }),
    });
  }

  const id = /^\/subtitles\/external\/([\w-]+)$/.exec(url.pathname)?.[1];
  if (!id) return fail(res, 404, "not found");
  try {
    const body = await externalFile(id);
    res.setHeader("Access-Control-Allow-Origin", "*");
    return send(res, 200, body, {
      "Content-Type": body.trimStart().startsWith("WEBVTT")
        ? "text/vtt; charset=utf-8"
        : "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    });
  } catch (error) {
    return fail(res, 404, `could not get that subtitle: ${error.message}`);
  }
}
