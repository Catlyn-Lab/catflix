/** Subtitle files (WebVTT or SubRip) parsed into cues the player draws itself. */

import { proxied } from "./format";
import { isNative } from "./native";
import { readText } from "./sources";

export type Cue = { start: number; end: number; text: string };

const STAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function seconds(stamp: string) {
  const match = STAMP.exec(stamp);
  if (!match) return NaN;
  const [, hours, minutes, secs, millis] = match;
  return (
    Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(secs) + Number(millis.padEnd(3, "0")) / 1000
  );
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};

/** Drop markup (`<i>`, `{\an8}`, voice tags) and keep the words. */
function plain(text: string) {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&(?:amp|lt|gt|nbsp|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

export function parseCues(source: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const [from, to] = lines[at].split("-->");
    const start = seconds(from);
    const end = seconds(to);
    const text = plain(lines.slice(at + 1).join("\n"));
    if (Number.isFinite(start) && Number.isFinite(end) && text) cues.push({ start, end, text });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** Fetch and parse a subtitle file, going through the proxy if the host refuses a direct request. */
/**
 * `ownServer`: a subtitle Catflix made itself. It is read from Catflix's server only, and an
 * empty file is fine: it is still being made and fills in as it goes.
 */
export async function loadCues(url: string, ownServer = false): Promise<Cue[]> {
  const read = async (target: string) => {
    const response = await fetch(target);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseCues(await response.text());
  };
  if (ownServer) return read(url);
  // The app reads a drama subtitle with a player's own headers first: a bare request gets a
  // notice file (no dialogue) from some hosts instead of the subtitles.
  if (isNative()) {
    try {
      const cues = parseCues(await readText(url, "subtitle"));
      if (cues.length) return cues;
    } catch {
      /* fall through to a plain request */
    }
  }
  try {
    const cues = await read(url);
    if (cues.length) return cues;
  } catch {
    /* no CORS headers: try the readers below */
  }
  try {
    // Some subtitle hosts send no CORS headers and challenge the proxy. The app reads them
    // itself, with the headers its own player element would send; in a browser, through the
    // Reader.
    const cues = parseCues(await readText(url, "subtitle"));
    if (cues.length) return cues;
  } catch {
    /* fall through to the proxy */
  }
  return read(proxied(url));
}

/** Text to show at a moment in the film, or "" between lines. */
export function cueAt(cues: Cue[], time: number) {
  let low = 0;
  let high = cues.length - 1;
  let last = -1;
  // Last cue that has started.
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (cues[middle].start <= time) {
      last = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const lines: string[] = [];
  // Overlapping cues are rare and short-lived, so a small look-back is enough.
  for (let index = Math.max(0, last - 3); index <= last; index++) {
    if (cues[index].end > time) lines.push(cues[index].text);
  }
  return lines.join("\n");
}
