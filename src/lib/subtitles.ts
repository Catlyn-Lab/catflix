/** Generated subtitles, made by Catflix's server from a title's existing ones (see server/subtitles.mjs). */

import { call } from "./account";
import type { Subtitle } from "./api";

export type Tone = "formal" | "neutral" | "casual" | "kids" | "custom";
export type Options = {
  languages: { code: string; name: string }[];
  tones: Tone[];
  ai: boolean;
  signedIn: boolean;
};
export type Generated = {
  id: number;
  sourceUrl: string;
  targetLang: string;
  method: "translate" | "ai";
  tone: string;
  label: string;
  status: "working" | "ready" | "failed";
  cuesDone: number;
  cuesTotal: number;
  error?: string | null;
  url: string;
};

async function json<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `the server answered ${response.status}`);
  return payload;
}

export const subtitleOptions = async () => json<Options>(await call("/subtitles/options"));

export const generatedStatus = async (id: number) => json<Generated>(await call(`/subtitles/${id}`));

export async function createSubtitle(request: {
  sourceUrl: string;
  sourceLabel?: string;
  targetLang: string;
  /** All of the title's subtitle files: a language already made from any of them is refused. */
  titleSources?: string[];
  method: "translate" | "ai";
  tone?: Tone;
  customTone?: string;
}) {
  const response = await call("/subtitles", { method: "POST", body: JSON.stringify(request) });
  // The title already has this language (someone made it meanwhile): use that one.
  if (response.status === 409) {
    const payload = (await response.json().catch(() => ({}))) as { existing?: Generated; error?: string };
    if (payload.existing) return payload.existing;
    throw new Error(payload.error ?? "this language already exists");
  }
  return json<Generated>(response);
}

/** As a player subtitle entry. */
export const asSubtitle = (entry: Generated): Subtitle => ({
  url: entry.url,
  label: entry.label,
  lang: entry.targetLang,
  generated: {
    id: entry.id,
    status: entry.status,
    done: entry.cuesDone,
    total: entry.cuesTotal,
    method: entry.method,
    tone: entry.tone,
  },
});

/** Subtitles already made from any of these source files, by anyone. */
export async function generatedFor(sources: string[]): Promise<Subtitle[]> {
  if (!sources.length) return [];
  try {
    const { items } = await json<{ items: Generated[] }>(
      await call("/subtitles/lookup", { method: "POST", body: JSON.stringify({ sources }) }),
    );
    return items.map(asSubtitle);
  } catch {
    return [];
  }
}
