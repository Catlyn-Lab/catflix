/** Local storage: preferences and per-title watch state. Signed-in viewers also sync them. */

import { createSignal } from "solid-js";

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
  /** When these were last changed, so the newest copy wins between devices. */
  updatedAt?: number;
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

/** A change for the sync layer (see `sync.ts`). */
export type Change =
  { kind: "progress"; key: string; record: WatchRecord | null; updatedAt: number } | { kind: "prefs" };

let notify: (change: Change) => void = () => {};
/** Called by the sync layer; local changes are reported to it. */
export function onChange(listener: (change: Change) => void) {
  notify = listener;
}

/** Bumped when synced data arrives, so lists that read watch state refresh. */
const [revision, setRevision] = createSignal(0);
export const watchRevision = revision;

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

export function savePrefs(patch: Prefs, fromSync = false) {
  write(PREFS_KEY, { ...loadPrefs(), ...patch, updatedAt: patch.updatedAt ?? Date.now() });
  if (!fromSync) notify({ kind: "prefs" });
}

const key = (type: string, id: string) => `${type}:${id}`;

export function getProgress(type: string, id: string): WatchRecord | null {
  revision();
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
  const record = {
    positionSeconds: position,
    durationSeconds: duration,
    updatedAt: Date.now(),
    title: meta.title ?? previous?.title,
    poster: meta.poster ?? previous?.poster,
  };
  map[key(type, id)] = record;
  write(WATCH_KEY, map);
  notify({ kind: "progress", key: key(type, id), record, updatedAt: record.updatedAt });
}

export function clearProgress(type: string, id: string) {
  const map = read<WatchMap>(WATCH_KEY, {});
  delete map[key(type, id)];
  write(WATCH_KEY, map);
  notify({ kind: "progress", key: key(type, id), record: null, updatedAt: Date.now() });
}

/** Every local record, for the first upload after signing in. */
export const allProgress = () => read<WatchMap>(WATCH_KEY, {});

/** Records from another device: each replaces the local one only if it is newer. */
export function mergeProgress(items: { key: string; record: WatchRecord | null; updatedAt: number }[]) {
  if (!items.length) return;
  const map = read<WatchMap>(WATCH_KEY, {});
  for (const item of items) {
    if ((map[item.key]?.updatedAt ?? 0) >= item.updatedAt) continue;
    if (item.record) map[item.key] = item.record;
    else delete map[item.key];
  }
  write(WATCH_KEY, map);
  setRevision((value) => value + 1);
}

/** Recently watched keys, newest first. */
export function recent() {
  revision();
  return Object.entries(read<WatchMap>(WATCH_KEY, {}))
    .map(([compound, record]) => {
      const [type, ...rest] = compound.split(":");
      return { type, id: rest.join(":"), record };
    })
    .filter(
      ({ record }) => record.durationSeconds === 0 || record.positionSeconds < record.durationSeconds - 25,
    )
    .sort((a, b) => b.record.updatedAt - a.record.updatedAt);
}
