/**
 * Catalogue and playback API client.
 *
 * The API runs several interchangeable hosts (`VITE_CATALOGUE_HOSTS`); if one fails or is rate
 * limited the others are tried in turn.
 */

import { config } from "./config";

const HOSTS = config.catalogueHosts;

const STORAGE_KEY = "catflix:host";

/**
 * Served as a website (not the app, not local development), Catflix asks its own server, which
 * forwards to the hosts above (see `server.mjs`): the API only allows the app's own origins, so
 * a browser on another domain would be refused. Media still goes to the hosts' proxy directly.
 */
export const SAME_ORIGIN =
  /^https?:$/.test(location.protocol) &&
  !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) &&
  !location.hostname.endsWith(".localhost");
const TIMEOUT = 25_000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function hostOrder() {
  const remembered = localStorage.getItem(STORAGE_KEY);
  const start = remembered ? HOSTS.indexOf(remembered) : 0;
  if (start <= 0) return HOSTS;
  return [...HOSTS.slice(start), ...HOSTS.slice(0, start)];
}

let active = localStorage.getItem(STORAGE_KEY) ?? HOSTS[0] ?? "";

function build(path: string, host: string) {
  return path.startsWith("http") && HOSTS[0] ? path.replace(HOSTS[0], host) : `${host}${path}`;
}

async function attempt(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** `GET` a path, failing over between hosts. Returns parsed JSON. */
export async function get<T>(path: string): Promise<T> {
  let lastError: Error = new ApiError("the API could not be reached", 0);

  for (const host of SAME_ORIGIN ? [location.origin] : hostOrder()) {
    let response: Response;
    try {
      response = await attempt(build(path, host));
    } catch (error) {
      lastError = new ApiError(`network: ${(error as Error).message}`, 0);
      continue;
    }

    if (response.status >= 500 || response.status === 429) {
      lastError = new ApiError(`the API answered ${response.status}`, response.status);
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ApiError(detail.slice(0, 200) || `HTTP ${response.status}`, response.status);
    }

    if (host !== active && HOSTS.includes(host)) {
      active = host;
      localStorage.setItem(STORAGE_KEY, host);
    }
    return (await response.json()) as T;
  }

  throw lastError;
}

/** Full URL for a path on the currently preferred host (no request made). */
export function url(path: string) {
  return build(path, active);
}

export function params(input: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

/* ---------------------------------------------------------------- shapes */

export type MediaType = "movie" | "tv";
/** Browse sections that have their own source — see `sources.ts`. */
export type ExtraType = "anime" | "drama";

export type Item = {
  id: string;
  title: string;
  overview?: string | null;
  backdrop?: string | null;
  type: MediaType | ExtraType;
  image?: string | null;
  poster?: string | null;
  year?: string | null;
  rating?: string | null;
};

export type Paged<T> = {
  success: boolean;
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
};

export type CastMember = { id?: number; name: string; character?: string | null; profile?: string | null };

export type Season = {
  id: number;
  season_number: number;
  name?: string;
  overview?: string;
  poster?: string | null;
  episode_count?: number;
  air_date?: string | null;
};

export type Episode = {
  id: number;
  episode_number: number;
  season_number: number;
  name?: string;
  overview?: string;
  still?: string | null;
  vote_average?: number | null;
  air_date?: string | null;
};

export type Details = {
  success: boolean;
  id: string;
  title: string;
  type: MediaType | ExtraType;
  tagline?: string | null;
  overview?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  logo?: string | null;
  genres?: string[];
  rating?: string | null;
  release_date?: string | null;
  year?: string | null;
  runtime?: number | null;
  number_of_seasons?: number | null;
  cast?: CastMember[];
  seasons?: Season[];
  recommendations?: Item[];
  similar?: Item[];
  trailers?: { key: string; name?: string; type?: string }[];
  trailer?: string | null;
};

export type Source = {
  url: string;
  quality?: string;
  type?: string;
  server?: string;
  audio?: string;
  skipProxy?: boolean;
};

export type Subtitle = {
  url: string;
  label?: string;
  lang?: string;
  language?: string;
  format?: string;
  /** A subtitle Catflix made from another one (see `subtitles.ts`). */
  generated?: {
    id: number;
    status: "working" | "ready" | "failed";
    done: number;
    total: number;
    method: "translate" | "ai";
    tone: string;
  };
};

export type Streams = {
  success: boolean;
  provider?: string;
  sources?: Source[];
  subtitles?: Subtitle[];
  alternates?: string[];
  errors?: { provider: string; code?: string; error?: string }[];
};

/* ------------------------------------------------------------- endpoints */

export const home = () =>
  get<{ hero?: Item; rails: Record<string, Paged<Item>> & { success?: boolean } }>("/api/home");

export type Genre = { id: number; name: string };

export const genres = () => get<{ genres: Genre[] }>("/api/genres");

export const discover = (type: MediaType, page: number, genre?: number) =>
  get<Paged<Item>>(`/api/discover?${params({ type, page, genre })}`);

export const search = (query: string, page = 1) =>
  get<Paged<Item>>(`/api/search?${params({ q: query, page })}`);

export const details = (type: MediaType, id: string) => get<Details>(`/api/details?${params({ type, id })}`);

export const season = (id: string, number: number) =>
  get<Season & { episodes: Episode[] }>(`/api/tv/${id}/season/${number}`);

export const streams = (type: MediaType, id: string, seasonNumber?: number, episodeNumber?: number) =>
  get<Streams>(
    `/api/stream?${params({
      type,
      id,
      season: seasonNumber,
      episode: episodeNumber,
    })}`,
  );

export const availability = (type: MediaType, id: string, provider: string) =>
  get<{ available: boolean; provider?: string; sources?: number; status?: string }>(
    `/api/stream/check?${params({ type, id, provider })}`,
  );

/* ----------------------------------------------------------- translation */

/** Catflix's own server: accounts, sync, subtitles and translation. */
export const backendUrl = (path: string) => `${config.backend || location.origin}${path}`;

/**
 * The catalogue only speaks English, so descriptions are translated on request by Catflix's
 * server (which keeps the translation services in its own settings).
 */
export async function translate(text: string, to: string): Promise<string> {
  const response = await attempt(backendUrl(`/translate?${params({ to, q: text })}`));
  if (!response.ok) throw new ApiError(`translation answered ${response.status}`, response.status);
  const payload = (await response.json()) as { text?: string };
  if (!payload.text?.trim()) throw new ApiError("translation unavailable", 0);
  return payload.text.trim();
}
