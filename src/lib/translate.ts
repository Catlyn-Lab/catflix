/** Descriptions in the viewer's language: translated once, then kept on this machine. */

import { createEffect, createSignal, onCleanup } from "solid-js";
import { translate as request } from "./api";
import { language, type Language } from "./i18n";

const CACHE_KEY = "catflix:translations";
const CACHE_LIMIT = 500;
const PARALLEL = 4;

type Cache = Record<string, string>;

let cache: Cache | null = null;
let saveTimer = 0;
const pending = new Map<string, Promise<string>>();
const queue: (() => void)[] = [];
let running = 0;

function load(): Cache {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Cache;
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const store = load();
    // Oldest entries go first once the cache is full.
    const keys = Object.keys(store);
    for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) delete store[key];
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch {
      /* storage full: translations are simply fetched again next time */
    }
  }, 400);
}

/** Short, stable key for a piece of text. */
function hash(text: string) {
  let value = 5381;
  for (let index = 0; index < text.length; index++)
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  return `${(value >>> 0).toString(36)}${text.length.toString(36)}`;
}

const keyOf = (text: string, to: Language) => `${to}:${hash(text)}`;

/** A few requests at a time, so a season of episodes does not fire twenty at once. */
function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < PARALLEL) run();
    else queue.push(run);
  });
}

/** A translation that is already on this machine, if any. */
export function cachedTranslation(text: string, to: Language) {
  return load()[keyOf(text, to)];
}

export function translateText(text: string, to: Language): Promise<string> {
  const key = keyOf(text, to);
  const known = load()[key];
  if (known) return Promise.resolve(known);

  let job = pending.get(key);
  if (!job) {
    job = schedule(() => request(text, to))
      .then((result) => {
        load()[key] = result;
        save();
        return result;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

/**
 * English text from the catalogue, shown in the viewer's language. The original shows straight
 * away and is swapped once the translation arrives; it stays if translation is unavailable.
 */
export function useTranslated(source: () => string | null | undefined) {
  const [result, setResult] = createSignal<{ from: string; to: Language; text: string } | null>(null);

  createEffect(() => {
    const text = source();
    const to = language();
    if (!text || to === "en") return;

    const known = cachedTranslation(text, to);
    if (known) {
      setResult({ from: text, to, text: known });
      return;
    }

    let current = true;
    onCleanup(() => (current = false));
    translateText(text, to)
      .then((translated) => current && setResult({ from: text, to, text: translated }))
      .catch(() => undefined);
  });

  return () => {
    const text = source() ?? "";
    const to = language();
    const ready = result();
    return to !== "en" && ready && ready.from === text && ready.to === to ? ready.text : text;
  };
}
