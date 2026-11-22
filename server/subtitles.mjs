// Generated subtitles: a title's existing subtitle, translated into another language by the
// machine translator or by AI in a chosen tone. Results are shared by everyone and kept in the
// database. Each viewer (all guests together count as one) makes at most one translator subtitle
// per language and one AI subtitle per language and tone for a title, across its subtitle files.
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { aiReady, config } from "./config.mjs";
import { db } from "./db.mjs";
import { TONES, languageName, translateWithAi } from "./ai.mjs";
import { translateLines } from "./translate.mjs";
import { allow, clientIp, fail, readJson, send } from "./http.mjs";

/** Languages offered in the "Create subtitle" menu (codes the translators understand). */
export const LANGUAGES = [
  "id",
  "en",
  "ms",
  "tl",
  "ja",
  "ko",
  "zh-CN",
  "th",
  "vi",
  "ar",
  "hi",
  "es",
  "fr",
  "de",
  "pt",
  "ru",
];

const BATCH = { translate: 40, ai: 20 };
/** The line some sites put into their subtitle files when they are shown outside their own pages. */
const NOTICE = /surreptitiously using content|support the original site/i;
const MAX_SOURCE = 3 * 1024 * 1024;
const today = () => new Date().toISOString().slice(0, 10);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

/* ------------------------------------------------------------- the source file */

const privateAddress = (address) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:127.") ||
    lower === "::"
  );
};

/** Fetch a subtitle file from the public internet only: never this server's own network. */
async function fetchSource(url) {
  const target = new URL(url);
  if (!["https:", "http:"].includes(target.protocol)) throw new Error("not a web address");
  const addresses = await dns.lookup(target.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) {
    throw new Error("that address is not allowed");
  }
  const response = await fetch(target, { signal: AbortSignal.timeout(20_000), redirect: "error" });
  if (!response.ok) throw new Error(`the subtitle answered ${response.status}`);
  const text = await response.text();
  if (text.length > MAX_SOURCE) throw new Error("the subtitle file is too large");
  return text;
}

/** "1:05,247" / "00:01:05.247" → "00:01:05.247". */
function timestamp(value) {
  const parts = value.trim().replace(",", ".").split(":");
  while (parts.length < 3) parts.unshift("00");
  const [hours, minutes, rest] = parts;
  const [seconds, fraction = "000"] = rest.split(".");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}.${fraction.padEnd(3, "0").slice(0, 3)}`;
}

/** WebVTT or SRT → cues with plain text (tags and styling removed). */
export function parseCues(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const [start, end] = lines[at].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const body = lines
      .slice(at + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\{\\[^}]*\}/g, "")
      .trim();
    if (start && end && body)
      cues.push({ start: timestamp(start), end: timestamp(end), text: null, source: body });
  }
  return cues;
}

const toVtt = (cues) =>
  "WEBVTT\n\n" +
  cues
    .filter((cue) => cue.text)
    .map((cue) => `${cue.start} --> ${cue.end}\n${cue.text}`)
    .join("\n\n") +
  "\n";

/* -------------------------------------------------------------------- jobs */

const save = db.prepare("UPDATE subtitles SET cues_json = ?, cues_done = ?, updated_at = ? WHERE id = ?");
const finish = db.prepare("UPDATE subtitles SET status = ?, error = ?, updated_at = ? WHERE id = ?");

async function run(id, cues, row) {
  const size = BATCH[row.method];
  const batches = [];
  for (let from = 0; from < cues.length; from += size) batches.push(from);
  const translate = async (from) => {
    const batch = cues.slice(from, from + size);
    const lines = batch.map((cue) => cue.source);
    const done =
      row.method === "ai"
        ? await translateWithAi(
            lines,
            cues.slice(Math.max(0, from - 4), from).map((cue) => cue.source),
            row.target_lang,
            row.tone.startsWith("custom:") ? "custom" : row.tone,
            row.tone.slice(7),
          )
        : await translateLines(lines, row.target_lang);
    batch.forEach((cue, index) => (cue.text = done[index].trim() || cue.source));
    save.run(JSON.stringify(cues), cues.filter((cue) => cue.text).length, Date.now(), id);
  };
  // AI is slow per request, so several batches run at once; workers take them in order, so the
  // start of the film is ready first. The translator is quick and goes one batch at a time.
  let next = 0;
  let stopped = false;
  const worker = async () => {
    try {
      while (!stopped && next < batches.length) await translate(batches[next++]);
    } catch (error) {
      stopped = true;
      throw error;
    }
  };
  try {
    const workers = row.method === "ai" ? config.ai.concurrency : 1;
    await Promise.all(Array.from({ length: Math.min(workers, batches.length) }, worker));
    finish.run("ready", null, Date.now(), id);
  } catch (error) {
    finish.run("failed", String(error.message ?? error).slice(0, 300), Date.now(), id);
  }
}

const authorName = db.prepare("SELECT name FROM users WHERE id = ?");

/** "Indonesian (Arif Translated)", "Indonesian (Arif AI · Casual)"; without a name for guests. */
const label = (row) => {
  const language = languageName(row.target_lang);
  const author = row.created_by ? String(authorName.get(row.created_by)?.name ?? "").split(/\s+/)[0] : "";
  const how =
    row.method === "translate"
      ? "Translated"
      : `AI · ${row.tone.startsWith("custom:") ? "Custom" : row.tone[0].toUpperCase() + row.tone.slice(1)}`;
  return `${language} (${author ? `${author} ` : ""}${how})`;
};

/** `mine`: made by this viewer (a guest's "mine" is every guest's). */
const describe = (row, user) => ({
  id: row.id,
  mine: (row.created_by ?? null) === (user?.id ?? null),
  sourceUrl: row.source_url,
  targetLang: row.target_lang,
  method: row.method,
  tone: row.tone.startsWith("custom:") ? "custom" : row.tone,
  label: label(row),
  status: row.status,
  cuesDone: row.cues_done,
  cuesTotal: row.cues_total,
  error: row.error,
  url: `${config.publicUrl}/subtitles/${row.id}.vtt`,
});

/* ------------------------------------------------------------------ routes */

export async function handleSubtitles(req, res, url, user) {
  const route = url.pathname;

  if (route === "/subtitles/options") {
    return send(res, 200, {
      languages: LANGUAGES.map((code) => ({ code, name: languageName(code) })),
      tones: [...Object.keys(TONES), "custom"],
      ai: aiReady(),
      signedIn: Boolean(user),
    });
  }

  if (route === "/subtitles/lookup" && req.method === "POST") {
    const body = await readJson(req);
    const sources = (Array.isArray(body.sources) ? body.sources : [])
      .slice(0, 50)
      .filter((entry) => typeof entry === "string");
    if (!sources.length) return send(res, 200, { items: [] });
    const rows = db
      .prepare(
        `SELECT * FROM subtitles WHERE source_hash IN (${sources.map(() => "?").join(",")}) AND status != 'failed' ORDER BY target_lang, method, tone`,
      )
      .all(...sources.map(sha));
    return send(res, 200, { items: rows.map((row) => describe(row, user)) });
  }

  if (route === "/subtitles" && req.method === "POST") {
    const body = await readJson(req);
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
    const target = LANGUAGES.includes(body.targetLang) ? body.targetLang : null;
    const method = body.method === "ai" ? "ai" : "translate";
    if (!sourceUrl || !target) return fail(res, 400, "choose a subtitle and a language");

    let tone = "";
    if (method === "ai") {
      if (!user) return fail(res, 401, "sign in to create subtitles with AI");
      if (!aiReady()) return fail(res, 503, "AI subtitles are not set up yet");
      if (body.tone === "custom") {
        const custom = String(body.customTone ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);
        if (!custom) return fail(res, 400, "describe the tone you want");
        tone = `custom:${custom}`;
      } else tone = Object.hasOwn(TONES, body.tone) ? body.tone : "neutral";
    }

    const hash = sha(sourceUrl);
    // Not twice per viewer and title (same language, method and tone), across its subtitle files.
    const hashes = [
      hash,
      ...(Array.isArray(body.titleSources) ? body.titleSources : [])
        .filter((entry) => typeof entry === "string")
        .slice(0, 50)
        .map(sha),
    ];
    const made = db
      .prepare(
        `SELECT * FROM subtitles WHERE source_hash IN (${hashes.map(() => "?").join(",")}) AND target_lang = ? AND method = ? AND tone = ? AND IFNULL(created_by, 0) = ? ORDER BY status = 'failed', id`,
      )
      .all(...hashes, target, method, tone, user?.id ?? 0);
    const ready = made.find((row) => row.status !== "failed");
    if (ready) {
      return send(res, 409, {
        error:
          method === "ai"
            ? `you already made a ${languageName(target)} AI subtitle in that tone for this title`
            : `you already made a ${languageName(target)} subtitle for this title`,
        existing: describe(ready, user),
      });
    }

    const key = user ? `user:${user.id}` : `ip:${clientIp(req)}`;
    if (!allow(`subtitle:${key}`, user ? 30 : config.guestJobsPerHour, 60 * 60_000)) {
      return fail(res, 429, "too many subtitles for now, try again later");
    }

    let cues;
    try {
      cues = parseCues(await fetchSource(sourceUrl));
    } catch (error) {
      return fail(res, 422, `could not read that subtitle: ${error.message}`);
    }
    if (!cues.length) return fail(res, 422, "that subtitle has no lines");
    // Some sites give other apps a file that is only their notice: there is nothing to translate.
    const notices = cues.filter((cue) => NOTICE.test(cue.source)).length;
    if (notices >= cues.length * 0.9) {
      return fail(res, 422, "that subtitle only contains a notice from its site, choose another one");
    }

    if (method === "ai") {
      const characters = cues.reduce((sum, cue) => sum + cue.source.length, 0);
      const used =
        db.prepare("SELECT characters FROM ai_usage WHERE user_id = ? AND day = ?").get(user.id, today())
          ?.characters ?? 0;
      const everyone =
        db.prepare("SELECT COALESCE(SUM(characters), 0) AS total FROM ai_usage WHERE day = ?").get(today())
          .total ?? 0;
      if (everyone + characters > config.ai.globalDailyCharacters) {
        return fail(res, 429, "AI subtitles are busy today, try the translator or come back tomorrow");
      }
      if (used + characters > config.ai.dailyCharacters) {
        return fail(
          res,
          429,
          "today's AI subtitle allowance is used up, try the translator or come back tomorrow",
        );
      }
      db.prepare(
        `INSERT INTO ai_usage (user_id, day, characters) VALUES (?, ?, ?)
         ON CONFLICT(user_id, day) DO UPDATE SET characters = characters + excluded.characters`,
      ).run(user.id, today(), characters);
    }

    const now = Date.now();
    // Earlier attempts at this language failed: make room for the new one.
    for (const row of made) db.prepare("DELETE FROM subtitles WHERE id = ?").run(row.id);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO subtitles (source_hash, source_url, source_label, target_lang, method, tone, status, cues_total, cues_json, model, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'working', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hash,
        sourceUrl,
        String(body.sourceLabel ?? "").slice(0, 80),
        target,
        method,
        tone,
        cues.length,
        JSON.stringify(cues),
        method === "ai" ? config.ai.model : null,
        user?.id ?? null,
        now,
        now,
      );
    const row = db.prepare("SELECT * FROM subtitles WHERE id = ?").get(lastInsertRowid);
    void run(row.id, cues, row);
    return send(res, 202, describe(row, user));
  }

  const file = /^\/subtitles\/(\d+)\.vtt$/.exec(route);
  if (file) {
    const row = db.prepare("SELECT cues_json FROM subtitles WHERE id = ?").get(Number(file[1]));
    if (!row) return fail(res, 404, "no such subtitle");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return send(res, 200, toVtt(JSON.parse(row.cues_json ?? "[]")), {
      "Content-Type": "text/vtt; charset=utf-8",
    });
  }

  const status = /^\/subtitles\/(\d+)$/.exec(route);
  if (status) {
    const row = db.prepare("SELECT * FROM subtitles WHERE id = ?").get(Number(status[1]));
    return row ? send(res, 200, describe(row, user)) : fail(res, 404, "no such subtitle");
  }

  return fail(res, 404, "not found");
}
