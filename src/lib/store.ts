/** Local storage: preferences and per-title watch state. */

const WATCH_KEY = "catflix:watch";
const PREFS_KEY = "catflix:prefs";

export type Prefs = {
  preferredHeight?: number;
  volume?: number;
  muted?: boolean;
  /** Interface, description and subtitle language. Unset until the first-run question is answered. */
  language?: "en" | "id";
  /** True once the viewer has switched subtitles off; they stay off until picked again. */
  subtitlesOff?: boolean;
};

export type WatchRecord = {
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: number;
  /** Title and poster of the film or series, for the "Continue watching" rail. */
  title?: string;
  poster?: string | null;
};

export type WatchMeta = { title?: string; poster?: string | null };

type WatchMap = Record<string, WatchRecord>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full: playback still works */
  }
}

export const loadPrefs = () => read<Prefs>(PREFS_KEY, {});

export function savePrefs(patch: Prefs) {
  write(PREFS_KEY, { ...loadPrefs(), ...patch });
}

const key = (type: string, id: string) => `${type}:${id}`;

export function getProgress(type: string, id: string): WatchRecord | null {
  const record = read<WatchMap>(WATCH_KEY, {})[key(type, id)];
  if (!record) return null;
  if (record.durationSeconds > 0 && record.positionSeconds > record.durationSeconds - 25) return null;
  return record.positionSeconds > 20 ? record : null;
}

export function saveProgress(
  type: string,
  id: string,
  position: number,
  duration: number,
  meta: WatchMeta = {},
) {
  const map = read<WatchMap>(WATCH_KEY, {});
  const previous = map[key(type, id)];
  map[key(type, id)] = {
    positionSeconds: position,
    durationSeconds: duration,
    updatedAt: Date.now(),
    title: meta.title ?? previous?.title,
    poster: meta.poster ?? previous?.poster,
  };
  write(WATCH_KEY, map);
}

export function clearProgress(type: string, id: string) {
  const map = read<WatchMap>(WATCH_KEY, {});
  delete map[key(type, id)];
  write(WATCH_KEY, map);
}

/** Recently watched keys, newest first. */
export function recent() {
  return Object.entries(read<WatchMap>(WATCH_KEY, {}))
    .map(([compound, record]) => {
      const [type, ...rest] = compound.split(":");
      return { type, id: rest.join(":"), record };
    })
    .filter(({ record }) => record.durationSeconds === 0 || record.positionSeconds < record.durationSeconds - 25)
    .sort((a, b) => b.record.updatedAt - a.record.updatedAt);
}
