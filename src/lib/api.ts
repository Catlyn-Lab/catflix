/**
 * Catalogue and playback API client.
 *
 * The API runs several interchangeable hosts; if one fails or is rate
 * limited the others are tried in turn.
 */

const HOSTS = [
  "https://api.framextv.xyz",
  "https://api.framextv.cc",
  "https://api.framextv.tech",
  "https://api.framextv.pro",
];

const STORAGE_KEY = "catflix:host";
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

let active = localStorage.getItem(STORAGE_KEY) ?? HOSTS[0];

function build(path: string, host: string) {
  return path.startsWith("http") ? path.replace(HOSTS[0], host) : `${host}${path}`;
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

  for (const host of hostOrder()) {
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

    if (host !== active) {
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

export type Item = {
  id: string;
  title: string;
  overview?: string | null;
  backdrop?: string | null;
  type: MediaType | "anime";
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
  type: MediaType | "anime";
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

export type Subtitle = { url: string; label?: string; lang?: string; language?: string; format?: string };

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

export const details = (type: MediaType, id: string) =>
  get<Details>(`/api/details?${params({ type, id })}`);

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

/**
 * The catalogue only speaks English, so descriptions are translated on request. Two public,
 * keyless services are tried in turn; both answer with CORS headers.
 */
const TRANSLATORS: ((text: string, to: string) => Promise<string>)[] = [
  async (text, to) => {
    const query = params({ client: "gtx", sl: "en", tl: to, dt: "t", q: text });
    const response = await attempt(`https://translate.googleapis.com/translate_a/single?${query}`);
    if (!response.ok) throw new ApiError(`translation answered ${response.status}`, response.status);
    const payload = (await response.json()) as [[string, string][]];
    return payload[0].map((segment) => segment[0]).join("");
  },
  async (text, to) => {
    // This service takes at most 500 characters per request.
    if (text.length > 500) throw new ApiError("text too long for the fallback translator", 0);
    const query = params({ langpair: `en|${to}`, q: text });
    const response = await attempt(`https://api.mymemory.translated.net/get?${query}`);
    if (!response.ok) throw new ApiError(`translation answered ${response.status}`, response.status);
    const payload = (await response.json()) as {
      responseStatus: number;
      responseData?: { translatedText?: string };
    };
    const result = payload.responseData?.translatedText;
    if (payload.responseStatus !== 200 || !result) throw new ApiError("translation unavailable", 0);
    return result;
  },
];

/** Translate English text into another language. Rejects when no service answers. */
export async function translate(text: string, to: string): Promise<string> {
  let lastError: Error = new ApiError("translation unavailable", 0);
  for (const service of TRANSLATORS) {
    try {
      const result = (await service(text, to)).trim();
      if (result) return result;
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError;
}
