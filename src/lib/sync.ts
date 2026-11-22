/**
 * Keeps a signed-in viewer's watch progress and preferences the same on every device.
 *
 * Local changes are sent a few seconds after they happen (and when the page is hidden); changes
 * from other devices are fetched on sign-in, on start-up and when the app comes back into view.
 * Each record carries its own time and the newer copy wins.
 */

import { account, call, onAccount, type User } from "./account";
import { setLanguage, language } from "./i18n";
import {
  allProgress,
  loadPrefs,
  mergeProgress,
  onChange,
  savePrefs,
  type Prefs,
  type WatchRecord,
} from "./store";

type Remote = {
  key: string;
  position: number;
  duration: number;
  title?: string | null;
  poster?: string | null;
  deleted: boolean;
  updatedAt: number;
};

const queue = new Map<string, Remote>();
let prefsDirty = false;
let timer = 0;

const cursorKey = (user: User) => `catflix:sync:${user.id}`;

const toRemote = (key: string, record: WatchRecord | null, updatedAt: number): Remote => ({
  key,
  position: record?.positionSeconds ?? 0,
  duration: record?.durationSeconds ?? 0,
  title: record?.title ?? null,
  poster: record?.poster ?? null,
  deleted: !record,
  updatedAt,
});

/** Send what changed. `keepalive` lets it finish while the page is closing. */
async function flush(keepalive = false) {
  clearTimeout(timer);
  if (!account()) return;
  const items = [...queue.values()];
  queue.clear();
  const sends: Promise<unknown>[] = [];
  if (items.length) {
    sends.push(call("/sync/progress", { method: "PUT", body: JSON.stringify({ items }), keepalive }));
  }
  if (prefsDirty) {
    prefsDirty = false;
    const { updatedAt, ...value } = loadPrefs();
    sends.push(call("/sync/prefs", { method: "PUT", body: JSON.stringify({ value, updatedAt }), keepalive }));
  }
  const results = await Promise.allSettled(sends);
  // Nothing is lost on a failed send: requeue and try again later.
  if (results.some((result) => result.status === "rejected")) {
    for (const item of items) if (!queue.has(item.key)) queue.set(item.key, item);
    schedule();
  }
}

const schedule = () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), 4000);
};

/** Fetch what other devices changed since the last time. */
async function pull() {
  const user = account();
  if (!user) return;
  const since = Number(localStorage.getItem(cursorKey(user)) ?? 0);
  const response = await call(`/sync?since=${since}`).catch(() => null);
  if (!response?.ok) return;
  const payload = (await response.json()) as {
    now: number;
    progress: Remote[];
    prefs: { value: Prefs; updatedAt: number } | null;
  };
  mergeProgress(
    payload.progress.map((item) => ({
      key: item.key,
      updatedAt: item.updatedAt,
      record: item.deleted
        ? null
        : {
            positionSeconds: item.position,
            durationSeconds: item.duration,
            updatedAt: item.updatedAt,
            title: item.title ?? undefined,
            poster: item.poster,
          },
    })),
  );
  const local = loadPrefs();
  if (payload.prefs && payload.prefs.updatedAt > (local.updatedAt ?? 0)) {
    savePrefs({ ...payload.prefs.value, updatedAt: payload.prefs.updatedAt }, true);
    const wanted = payload.prefs.value.language;
    if (wanted && wanted !== language()) setLanguage(wanted, true);
  } else if ((local.updatedAt ?? 0) > (payload.prefs?.updatedAt ?? 0)) {
    prefsDirty = true;
    schedule();
  }
  localStorage.setItem(cursorKey(user), String(payload.now));
}

/** After signing in on this device: send everything kept here (the server keeps the newer copies). */
async function uploadAll() {
  for (const [key, record] of Object.entries(allProgress())) {
    queue.set(key, toRemote(key, record, record.updatedAt));
  }
  prefsDirty = true;
  await flush();
}

export function startSync() {
  onChange((change) => {
    if (!account()) return;
    if (change.kind === "prefs") prefsDirty = true;
    else queue.set(change.key, toRemote(change.key, change.record, change.updatedAt));
    schedule();
  });

  onAccount((user) => {
    if (user) void uploadAll().then(pull);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
    else void pull();
  });
}
