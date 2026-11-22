/**
 * Anime and Asian-drama catalogue clients.
 *
 * Neither source belongs to Catflix's own API: anime come from aniwaves.tv through its public
 * JSON bridge, Asian dramas from kissasia.biz (a WordPress REST API plus its Blogger playlist
 * feed). Both are proxied through Catflix's own hosts where the source has no CORS, and both
 * answer in their own shape, so they are normalised to `Item`, `Details`, `Season` and `Episode`
 * here and nowhere else.
 */

import {
  params,
  SAME_ORIGIN,
  url as apiUrl,
  type Details,
  type Episode,
  type Item,
  type Season,
  type Streams,
} from "./api";
import { isNative, nativeGet, relayedUrl } from "./native";

const HOSTS = [
  "https://api.framextv.xyz",
  "https://api.framextv.cc",
  "https://api.framextv.tech",
  "https://api.framextv.pro",
];

/** The aniwaves bridge (Cloudflare worker): catalogue, detail and playback in one place. */
const ANIME = "https://worker8652.appleflux.workers.dev/api/aniwaves";
/** The site itself: its filter page is the only listing that honours genre and status. */
const ANIWAVES = "https://aniwaves.tv";
const KISSASIA = "https://kissasia.biz";
const KISSASIA_REFERER = "https://kissasia.biz/";
/** The two Blogger feeds kissasia keeps its playlists in (from the site's player settings). */
const PLAYLIST_BLOGS = ["4927638411765974267", "401665521700938130"];
/** Media hosts that answer the app directly; the rest only play through the proxy. */
const DIRECT_HOSTS = /(sooplive\.com|imostatic\.com|rumble\.cloud|1a-1791\.com)$/;
/** Media hosts that only answer kissasia's referer: the app relays them (see `native.ts`). */
const REFERER_HOSTS = /(flixfile\.top|cdnvideo\.autos)$/;

const TIMEOUT = 25_000;

async function attempt(url: string, accept = "application/json"): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function json<T>(url: string): Promise<T> {
  const response = await attempt(url);
  if (!response.ok) throw new Error(`the source answered ${response.status}`);
  return (await response.json()) as T;
}

/**
 * kissasia.biz answers Cloudflare challenges to some egress addresses. The public Reader service
 * has its own egress and hands the body back as `data.content`, so it is the second reader.
 */
const READER = "https://r.jina.ai/";

/**
 * Read a URL as JSON: the app's own request first, then the Reader, then Catflix's proxy (which
 * kissasia usually challenges, so it comes last).
 */
async function readJson<T>(target: string): Promise<T> {
  return JSON.parse(await readText(target)) as T;
}

/** Read a URL as text through the same chain as `readJson`. Subtitle files use it too. */
export async function readText(target: string): Promise<string> {
  const attempts: (() => Promise<string>)[] = [
    ...(isNative() ? [async () => (await nativeGet(target, KISSASIA_REFERER)).body] : []),
    async () => {
      const response = await attempt(`${READER}${target}`, "application/json");
      if (!response.ok) throw new Error(`the reader answered ${response.status}`);
      const payload = (await response.json()) as { data?: { content?: string } };
      if (!payload.data?.content) throw new Error("the reader returned nothing");
      return payload.data.content;
    },
    async () => (await proxied(target)).text(),
  ];
  let lastError: Error = new Error("the source could not be read");
  for (const read of attempts) {
    try {
      const text = await read();
      if (text.trim()) return text;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError;
}

/** kissasia's uploads refuse hot-linking, so posters load through Catflix's proxy. */
const poster = (url?: string | null) => (url ? apiUrl(`/api/proxy?${params({ url })}`) : null);

/** The aniwaves bridge only allows `http://localhost:1420`, so it is read through our proxy. */
async function bridged<T>(path: string): Promise<T> {
  const response = await proxied(`${ANIME}${path}`);
  return (await response.json()) as T;
}

function hostOrder() {
  const start = Math.floor(Math.random() * HOSTS.length);
  return [...HOSTS.slice(start), ...HOSTS.slice(0, start)];
}

/** Fetch through Catflix's own `/api/proxy`, failing over between hosts. */
async function proxied(target: string, accept = "application/json"): Promise<Response> {
  const path = `/api/proxy?${params({ url: target })}`;
  let lastError: Error = new Error("the proxy could not be reached");
  for (const host of hostOrder()) {
    try {
      const response = await attempt(`${host}${path}`, accept);
      if (response.ok) return response;
      lastError = new Error(`the proxy answered ${response.status}`);
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError;
}

/* ------------------------------------------------------------------- anime */

export type AnimeMode = "trending" | "updated" | "newest" | "az";

type BridgeItem = {
  id: number | string;
  slug?: string;
  title: string;
  image?: string | null;
  type?: string;
  rating?: string | number | null;
  year?: string | number | null;
};

type BridgePage = { ok: boolean; totalPages?: number; results?: BridgeItem[] };

/** aniwaves.tv's own genre ids (its filter form), the common ones first. */
export const ANIME_GENRES: { id: number; name: string }[] = [
  { id: 1, name: "Action" },
  { id: 10, name: "Adventure" },
  { id: 4, name: "Comedy" },
  { id: 30, name: "Drama" },
  { id: 5, name: "Fantasy" },
  { id: 23, name: "Romance" },
  { id: 8, name: "Slice of Life" },
  { id: 44, name: "Sci-Fi" },
  { id: 12, name: "Isekai" },
  { id: 13, name: "Reincarnation" },
  { id: 19, name: "Supernatural" },
  { id: 272, name: "Mystery" },
  { id: 138, name: "Suspense" },
  { id: 139, name: "Psychological" },
  { id: 188, name: "Horror" },
  { id: 106, name: "School" },
  { id: 96, name: "Sports" },
  { id: 45, name: "Mecha" },
  { id: 55, name: "Military" },
  { id: 180, name: "Historical" },
  { id: 209, name: "Martial Arts" },
  { id: 6, name: "Super Power" },
  { id: 317, name: "Music" },
  { id: 241, name: "Mahou Shoujo" },
  { id: 7, name: "Shounen" },
  { id: 25, name: "Shoujo" },
  { id: 17, name: "Seinen" },
  { id: 298, name: "Josei" },
  { id: 93, name: "Kids" },
];

const animeItem = (entry: BridgeItem): Item => ({
  id: String(entry.id),
  title: decode(entry.title),
  type: "anime",
  image: entry.image ?? null,
  poster: entry.image ?? null,
  rating: entry.rating != null ? String(entry.rating) : null,
  year: entry.year != null ? String(entry.year) : null,
});

/** How each Catflix ordering maps onto the site's filter form. */
const FILTERS: Record<AnimeMode, { sort: string; status?: number }> = {
  trending: { sort: "members" },
  updated: { sort: "members", status: 0 },
  newest: { sort: "created_at" },
  az: { sort: "title" },
};

/** The site's filter page, read by the app itself and taken apart into items. */
async function animeFilter(mode: AnimeMode, page: number, genre?: number) {
  const filter = FILTERS[mode];
  const query = new URLSearchParams({ sort_by: filter.sort, page: String(page) });
  if (genre) query.append("genre[]", String(genre));
  if (filter.status !== undefined) query.append("status[]", String(filter.status));
  const html = (await nativeGet(`${ANIWAVES}/filter?${query}`)).body;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items: Item[] = [];
  for (const card of doc.querySelectorAll("#list-items .item")) {
    const link = card.querySelector<HTMLAnchorElement>("a.name");
    const id = /-(\d+)$/.exec(link?.getAttribute("href") ?? "")?.[1];
    const title = link?.textContent?.trim();
    if (!id || !title) continue;
    const image = card.querySelector("img")?.getAttribute("src") ?? null;
    const score = card.querySelector(".m-item.rated span")?.textContent?.trim() ?? "";
    items.push({
      id,
      title: decode(title),
      type: "anime",
      image,
      poster: image,
      rating: /^\d+(\.\d+)?$/.test(score) ? score : null,
    });
  }
  const last = Math.max(
    page,
    ...[...doc.querySelectorAll<HTMLAnchorElement>(".pagination a")].map((link) =>
      Number(/[?&]page=(\d+)/.exec(link.getAttribute("href") ?? "")?.[1] ?? 0),
    ),
  );
  return { items, pages: Math.min(last, 200) };
}

export async function animeList(mode: AnimeMode, page = 1, genre?: number) {
  // In the app the site's own filter is read, so genre and "ongoing" really filter. Elsewhere,
  // or if that page fails, the bridge's lists stand in (they ignore the genre).
  if (isNative()) {
    try {
      const result = await animeFilter(mode, page, genre);
      if (result.items.length) return result;
    } catch {
      /* fall through to the bridge */
    }
  }
  const payload = await bridged<BridgePage>(`/list?${params({ mode, page, genre })}`);
  const items = (payload.results ?? []).map(animeItem);
  return { items, pages: Math.min(payload.totalPages ?? 1, 200) };
}

export async function animeSearch(term: string) {
  const payload = await bridged<{ results?: BridgeItem[] }>(`/search?${params({ q: term })}`);
  return (payload.results ?? []).map(animeItem);
}

type BridgeDetail = BridgeItem & {
  coverUrl?: string | null;
  status?: string;
  quality?: string;
  synopsis?: string;
  genres?: string[];
  aired?: string;
  duration?: string;
  country?: string;
  studios?: string;
  totalEps?: number;
  episodes?: { ep: number; sub?: boolean; dub?: boolean }[];
};

/** Detail and episodes come from the same answer: ask the bridge once per title. */
const animeRecords = new Map<string, Promise<BridgeDetail>>();

function animeRecord(id: string) {
  let pending = animeRecords.get(id);
  if (!pending) {
    pending = bridged<BridgeDetail>(`/detail?${params({ id, slug: "-" })}`);
    animeRecords.set(id, pending);
    pending.catch(() => animeRecords.delete(id));
  }
  return pending;
}

/** New titles come without artwork in their detail; the search listing has their poster. */
async function animePoster(id: string, title: string) {
  const found = await animeSearch(title).catch(() => []);
  return found.find((entry) => entry.id === id)?.image ?? found[0]?.image ?? null;
}

export async function animeDetails(id: string): Promise<Details> {
  const payload = await animeRecord(id);
  if (!payload?.id) throw new Error("that anime is not listed");
  const title = decode(payload.title);
  const image = payload.image ?? (await animePoster(id, title));
  const year =
    /\b(19|20)\d{2}\b/.exec(payload.aired ?? "")?.[0] ?? (payload.year != null ? String(payload.year) : null);
  return {
    success: true,
    id: String(payload.id),
    title,
    type: "anime",
    overview: payload.synopsis ? decode(payload.synopsis) : null,
    poster: image,
    backdrop: payload.coverUrl ?? image,
    genres: payload.genres ?? [],
    rating: payload.rating != null ? String(payload.rating) : null,
    year,
    release_date: year,
    runtime: payload.duration ? Number(payload.duration.replace(/[^\d]/g, "")) || null : null,
  };
}

/**
 * The episode list, in the shape the detail page already draws. The source has no per-episode
 * pictures, so each episode shows the series' own art.
 */
export async function animeEpisodes(id: string): Promise<Season & { episodes: Episode[] }> {
  const [payload, details] = await Promise.all([animeRecord(id), animeDetails(id).catch(() => null)]);
  const still = details?.backdrop ?? details?.poster ?? null;
  const episodes = payload.episodes ?? [];
  return {
    id: 1,
    season_number: 1,
    name: "Episodes",
    episode_count: episodes.length,
    episodes: episodes.map((entry) => ({
      id: entry.ep,
      episode_number: entry.ep,
      season_number: 1,
      name: `Episode ${entry.ep}`,
      still,
    })),
  };
}

type BridgeSource = {
  ok: boolean;
  playUrl?: string;
  quality?: string;
  serverName?: string;
  subtitles?: { url: string; label?: string; type?: string }[];
};

/**
 * Resolve one episode to a playable source. `proxy=1` would wrap it in the bridge, which refuses
 * the app's origin, so Catflix's own proxy carries it instead.
 */
export async function animeStreams(id: string, episode: number): Promise<Streams> {
  const payload = await bridged<BridgeSource>(`/resolve?${params({ id, ep: episode, sv: 12 })}`);
  if (!payload.ok || !payload.playUrl) return { success: true, sources: [], subtitles: [] };
  return {
    success: true,
    provider: "aniwaves",
    sources: [
      {
        url: payload.playUrl,
        quality: payload.quality && payload.quality !== "auto" ? payload.quality : "auto",
        type: "hls",
        server: payload.serverName ?? "aniwaves",
        // The CDN sends no CORS headers, so the playlist and its segments go through the proxy.
        skipProxy: false,
      },
    ],
    subtitles: (payload.subtitles ?? []).map((entry) => ({
      url: entry.url,
      label: entry.label ?? "Subtitles",
      format: entry.type,
    })),
  };
}

/* ------------------------------------------------------------------- drama */

/** kissasia category ids (WordPress), the regions and two states of the site. */
export const DRAMA_REGIONS: { id: number; name: string }[] = [
  { id: 5, name: "China" },
  { id: 6, name: "South Korea" },
  { id: 7, name: "Philippines" },
  { id: 37, name: "Thailand" },
  { id: 16, name: "Japan" },
  { id: 14, name: "Hong Kong" },
  { id: 15, name: "Hollywood" },
];

export const DRAMA_KINDS: { id: number; name: string }[] = [
  { id: 4, name: "Series" },
  { id: 9, name: "Film" },
];

export const DRAMA_STATES: { id: number; name: string }[] = [
  { id: 12, name: "Ongoing" },
  { id: 8, name: "Completed" },
];

type WpPost = {
  id: number;
  slug: string;
  title: { rendered: string };
  date: string;
  featured_media?: number;
  categories?: number[];
  meta?: { episode_or_runtime?: string; release_year?: string; release_status?: string };
};

/** Every HTML entity, named or numeric, decoded by the browser's own parser. */
const decode = (text: string) =>
  text.includes("&") ? (new DOMParser().parseFromString(text, "text/html").body.textContent ?? text) : text;

const strip = (html: string) =>
  decode(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** One post as an `Item`; the region shown is the first regional category. */
const dramaItem = (post: WpPost, posters: Map<number, string>): Item => {
  const region = DRAMA_REGIONS.find((entry) => post.categories?.includes(entry.id))?.name;
  const image = post.featured_media ? poster(posters.get(post.featured_media)) : null;
  return {
    id: post.slug,
    title: decode(strip(post.title.rendered)),
    type: "drama",
    image,
    poster: image,
    year: post.meta?.release_year ?? post.date.slice(0, 4),
    rating: null,
    overview: region ?? null,
  };
};

/** Media ids → image URLs, in one request (the WP list only carries the id). */
async function postersFor(ids: number[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<number, string>();
  const records = await readJson<{ id: number; source_url: string }[]>(
    `${KISSASIA}/wp-json/wp/v2/media?${params({
      per_page: unique.length,
      include: unique.join(","),
      _fields: "id,source_url",
    })}`,
  ).catch(() => []);
  return new Map(records.map((record) => [record.id, record.source_url]));
}

export async function dramaList(page = 1, region?: number, kind?: number, state?: number) {
  const categories = [region, kind, state].filter(Boolean).join(",");
  // 40 a page: the Reader folds the whole answer into one JSON string, so smaller pages travel better.
  const posts = await readJson<WpPost[]>(
    `${KISSASIA}/wp-json/wp/v2/posts?${params({
      per_page: 40,
      page,
      categories,
      _fields: "id,slug,title,date,featured_media,categories,meta",
    })}`,
  );
  const posters = await postersFor(posts.map((post) => post.featured_media ?? 0));
  // The relayed answer carries no total count, so a full page means "there may be one more".
  const pages = posts.length < 40 ? page : page + 1;
  return { items: posts.map((post) => dramaItem(post, posters)), pages };
}

export async function dramaSearch(term: string) {
  const posts = await readJson<WpPost[]>(
    `${KISSASIA}/wp-json/wp/v2/posts?${params({
      per_page: 30,
      search: term,
      _fields: "id,slug,title,date,featured_media,categories,meta",
    })}`,
  );
  const posters = await postersFor(posts.map((post) => post.featured_media ?? 0));
  return posts.map((post) => dramaItem(post, posters));
}

/**
 * The Blogger playlist a kissasia post points at: one `url|languages|subtitle files` entry per
 * episode, separated by `;`.
 */
async function playlists(postId: string) {
  let content = "";
  for (const blog of PLAYLIST_BLOGS) {
    // Blogger sends no CORS headers, so the feed is read through the same chain as kissasia.
    const entry = await readJson<{ entry?: { content?: { $t?: string } } }>(
      `https://www.blogger.com/feeds/${blog}/posts/default/${postId}?alt=json`,
    ).catch(() => null);
    content = entry?.entry?.content?.$t ?? "";
    if (content) break;
  }
  return content
    .split(";")
    .map((chunk) => chunk.trim())
    .filter((chunk) => /^https?:\/\//.test(chunk))
    .map((chunk) => {
      const [url, labels, files] = chunk.split("|");
      const names = (labels ?? "").split(",");
      return {
        url: url.trim(),
        subtitles: (files ?? "")
          .split(",")
          .map((file, index) => {
            // Labels come as typed on the site ("indonesian"): capitalise them for the menu.
            const name = names[index]?.trim() || "Subtitles";
            return { url: file.trim(), label: name[0].toUpperCase() + name.slice(1) };
          })
          .filter((entry) => /^https?:\/\//.test(entry.url)),
      };
    });
}

type WpDetail = WpPost & {
  content: { rendered: string };
};

/** Detail, episodes and playback all need the same post: read it once per title. */
const posts = new Map<string, Promise<WpDetail>>();

function dramaPost(slug: string) {
  let pending = posts.get(slug);
  if (!pending) {
    pending = readPost(slug);
    posts.set(slug, pending);
    pending.catch(() => posts.delete(slug));
  }
  return pending;
}

async function readPost(slug: string) {
  const posts = await readJson<WpDetail[]>(
    `${KISSASIA}/wp-json/wp/v2/posts?${params({
      slug,
      _fields: "id,slug,title,date,featured_media,categories,meta,content",
    })}`,
  );
  if (!posts[0]) throw new Error("that drama is not listed");
  return posts[0];
}

export async function dramaDetails(slug: string): Promise<Details> {
  const post = await dramaPost(slug);
  const posters = await postersFor([post.featured_media ?? 0]);
  // The body is an accordion; the description is its first real paragraph.
  const paragraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(post.content.rendered)?.[1] ?? "";
  const synopsis = strip(paragraph);
  const region = DRAMA_REGIONS.filter((entry) => post.categories?.includes(entry.id)).map(
    (entry) => entry.name,
  );
  return {
    success: true,
    id: post.slug,
    title: decode(strip(post.title.rendered)),
    type: "drama",
    overview: synopsis || null,
    poster: post.featured_media ? poster(posters.get(post.featured_media)) : null,
    backdrop: post.featured_media ? poster(posters.get(post.featured_media)) : null,
    genres: region,
    year: post.meta?.release_year ?? post.date.slice(0, 4),
    release_date: post.date,
  };
}

/** Episode count from the post body (`Total 10`) or its meta, as a one-season list. */
export async function dramaEpisodes(slug: string): Promise<Season & { episodes: Episode[] }> {
  const post = await dramaPost(slug);
  // No per-episode pictures here either: each episode shows the title's poster.
  const posters = await postersFor([post.featured_media ?? 0]);
  const still = post.featured_media ? poster(posters.get(post.featured_media)) : null;
  const total =
    Number(post.meta?.episode_or_runtime ?? 0) ||
    Number(/Total\s+(\d+)/i.exec(post.content.rendered)?.[1] ?? 0) ||
    1;
  return {
    id: 1,
    season_number: 1,
    name: "Episodes",
    episode_count: total,
    episodes: Array.from({ length: Math.min(total, 200) }, (_, index) => ({
      id: index + 1,
      episode_number: index + 1,
      season_number: 1,
      name: `Episode ${index + 1}`,
      still,
    })),
  };
}

export async function dramaStreams(slug: string, episode: number): Promise<Streams> {
  const post = await dramaPost(slug);
  const postId = /data-post-id="(\d+)"/.exec(post.content.rendered)?.[1];
  if (!postId) return { success: true, sources: [], subtitles: [] };
  const sources = await playlists(postId);
  const chosen = sources[episode - 1];
  if (!chosen) return { success: true, sources: [], subtitles: [] };
  const host = new URL(chosen.url).hostname;
  // Referer-locked hosts play through a relay: the app's own, or the website's server
  // (`server.mjs`). In local development in a plain browser there is none, and they can't play.
  const locked = REFERER_HOSTS.test(host);
  return {
    success: true,
    provider: "kissasia",
    sources: [
      {
        url: !locked
          ? chosen.url
          : isNative()
            ? relayedUrl(chosen.url, KISSASIA_REFERER)
            : SAME_ORIGIN
              ? `${location.origin}/stream?${params({ url: chosen.url, referer: KISSASIA_REFERER })}`
              : chosen.url,
        type: chosen.url.includes(".m3u8") ? "hls" : "mp4",
        server: "kissasia",
        skipProxy: locked || DIRECT_HOSTS.test(host),
      },
    ],
    subtitles: chosen.subtitles.map((entry) => ({ ...entry })),
  };
}
