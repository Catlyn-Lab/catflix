// Machine translation (no key): Google's batch endpoint first, MyMemory as a slower fallback.
// Both addresses come from `.env` (GOOGLE_TRANSLATE_URL, MYMEMORY_URL).
import { config } from "./config.mjs";

const TIMEOUT = 25_000;

async function google(lines, to, from) {
  if (!config.googleTranslateUrl) throw new Error("no Google translate URL");
  // Settings go in the address and only the lines in the body: settings in the body are refused.
  const query = new URLSearchParams({ client: "gtx", sl: from, tl: to, dt: "t" });
  const body = new URLSearchParams();
  for (const line of lines) body.append("q", line);
  const response = await fetch(`${config.googleTranslateUrl}?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!response.ok) throw new Error(`translator answered ${response.status}`);
  const payload = await response.json();
  // One line comes back as ["text", "lang"] (or "text"); several as [["text", "lang"], …].
  const rows = lines.length === 1 && !Array.isArray(payload[0]) ? [payload] : payload;
  const out = rows.map((row) => (Array.isArray(row) ? row[0] : row));
  if (out.length !== lines.length || out.some((line) => typeof line !== "string")) {
    throw new Error("translator returned a different number of lines");
  }
  return out;
}

async function myMemory(lines, to, from) {
  if (!config.myMemoryUrl) throw new Error("no MyMemory URL");
  const out = [];
  for (const line of lines) {
    // This service takes at most 500 characters per request.
    if (line.length > 500) throw new Error("line too long for the fallback translator");
    const query = new URLSearchParams({ langpair: `${from === "auto" ? "en" : from}|${to}`, q: line });
    const response = await fetch(`${config.myMemoryUrl}?${query}`, { signal: AbortSignal.timeout(TIMEOUT) });
    const payload = response.ok ? await response.json() : null;
    const text = payload?.responseData?.translatedText;
    if (payload?.responseStatus !== 200 || !text) throw new Error("translation unavailable");
    out.push(text);
  }
  return out;
}

const SERVICES = { google, mymemory: myMemory };

/** Translate several lines at once, keeping their order and count. */
export async function translateLines(lines, to, from = "auto") {
  let lastError = new Error("no translator configured");
  for (const name of config.translators) {
    const service = SERVICES[name];
    if (!service) continue;
    try {
      return await service(lines, to, from);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Descriptions are asked for again and again: keep the last answers in memory. */
const cache = new Map();
export async function translateText(text, to) {
  const key = `${to}\n${text}`;
  if (cache.has(key)) return cache.get(key);
  const [result] = await translateLines([text], to, "en");
  cache.set(key, result);
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return result;
}
