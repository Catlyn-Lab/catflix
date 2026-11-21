/** Shared helpers: proxying, labels, small formatting. */

import { url as apiUrl, type Paged } from "./api";

/** Some stream hosts block hot-linking, so the API proxies them. */
export function proxied(url: string) {
  return apiUrl(`/api/proxy?url=${encodeURIComponent(url)}`);
}

export function needsProxy(source: { skipProxy?: boolean; url: string }) {
  return !source.skipProxy && /^https?:\/\//.test(source.url);
}

export function streamUrl(source: { skipProxy?: boolean; url: string }) {
  return needsProxy(source) ? proxied(source.url) : source.url;
}

export function year(date?: string | null) {
  return date ? date.slice(0, 4) : "";
}

export function runtime(minutes?: number | null) {
  if (!minutes || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

export function rating(value?: string | null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(1) : "";
}

export function episodeLabel(seasonNumber: number, episodeNumber: number) {
  return `S${seasonNumber}E${episodeNumber}`;
}

/** Keep only well-formed, de-duplicated items. */
export function clean(items?: unknown): Paged<any>["results"] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of items) {
    if (!item?.id || !item?.title) continue;
    const id = String(item.id);
    // A film and a series can share a number, so the type is part of what makes a title unique.
    const key = `${item.type ?? ""}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, id });
  }
  return out;
}

/** Client-side genre filter, for the browse page. */
export function sortByRating<T extends { rating?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0));
}
