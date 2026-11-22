// Watch progress, history and preferences for signed-in users. Each item keeps its own time and
// the newer one wins, so devices can sync in any order.
import { db } from "./db.mjs";
import { fail, readJson, send } from "./http.mjs";

const MAX_ITEMS = 500;
const text = (value, max = 500) => (typeof value === "string" ? value.slice(0, max) : null);

/** "episode:drama:slug:1:2" → "drama:slug"; "movie:42" → "movie:42"; "episode:123:1:2" → "tv:123". */
function titleKey(key) {
  const parts = key.split(":");
  if (parts[0] === "movie") return key;
  if (parts[0] !== "episode") return key;
  return parts[1] === "anime" || parts[1] === "drama" ? `${parts[1]}:${parts[2]}` : `tv:${parts[1]}`;
}

const upsertProgress = db.prepare(`
  INSERT INTO progress (user_id, key, position_s, duration_s, title, poster, deleted, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET
    position_s = excluded.position_s, duration_s = excluded.duration_s,
    title = COALESCE(excluded.title, progress.title), poster = COALESCE(excluded.poster, progress.poster),
    deleted = excluded.deleted, updated_at = excluded.updated_at
  WHERE excluded.updated_at > progress.updated_at`);

const upsertHistory = db.prepare(`
  INSERT INTO history (user_id, title_key, last_key, title, poster, watched_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id, title_key) DO UPDATE SET
    last_key = excluded.last_key, title = COALESCE(excluded.title, history.title),
    poster = COALESCE(excluded.poster, history.poster), watched_at = excluded.watched_at
  WHERE excluded.watched_at > history.watched_at`);

export async function handleSync(req, res, url, user) {
  if (!user) return fail(res, 401, "sign in to sync");
  const route = url.pathname;

  if (route === "/sync" && req.method === "GET") {
    const since = Number(url.searchParams.get("since")) || 0;
    const progress = db
      .prepare(
        `SELECT key, position_s AS position, duration_s AS duration, title, poster, deleted, updated_at AS updatedAt
         FROM progress WHERE user_id = ? AND updated_at > ? ORDER BY updated_at`,
      )
      .all(user.id, since)
      .map((row) => ({ ...row, deleted: Boolean(row.deleted) }));
    const prefs = db
      .prepare("SELECT json, updated_at AS updatedAt FROM prefs WHERE user_id = ?")
      .get(user.id);
    return send(res, 200, {
      now: Date.now(),
      progress,
      prefs: prefs ? { value: JSON.parse(prefs.json), updatedAt: prefs.updatedAt } : null,
    });
  }

  if (route === "/sync/progress" && req.method === "PUT") {
    const body = await readJson(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    db.exec("BEGIN");
    try {
      for (const item of items) {
        const key = text(item.key, 200);
        const updatedAt = Math.min(Number(item.updatedAt) || 0, Date.now() + 60_000);
        if (!key || !updatedAt) continue;
        const position = Math.max(0, Number(item.position) || 0);
        const duration = Math.max(0, Number(item.duration) || 0);
        upsertProgress.run(
          user.id,
          key,
          position,
          duration,
          text(item.title),
          text(item.poster, 1000),
          item.deleted ? 1 : 0,
          updatedAt,
        );
        if (position > 0 || item.deleted) {
          upsertHistory.run(
            user.id,
            titleKey(key),
            key,
            text(item.title),
            text(item.poster, 1000),
            updatedAt,
          );
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return send(res, 200, { ok: true, count: items.length });
  }

  if (route === "/sync/prefs" && req.method === "PUT") {
    const body = await readJson(req);
    const updatedAt = Math.min(Number(body.updatedAt) || Date.now(), Date.now() + 60_000);
    const json = JSON.stringify(body.value ?? {});
    if (json.length > 10_000) return fail(res, 413, "preferences too large");
    db.prepare(
      `INSERT INTO prefs (user_id, json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
       WHERE excluded.updated_at > prefs.updated_at`,
    ).run(user.id, json, updatedAt);
    return send(res, 200, { ok: true });
  }

  if (route === "/sync/history" && req.method === "GET") {
    const rows = db
      .prepare(
        `SELECT title_key AS titleKey, last_key AS lastKey, title, poster, watched_at AS watchedAt
         FROM history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 200`,
      )
      .all(user.id);
    return send(res, 200, { items: rows });
  }

  if (route === "/sync/history" && req.method === "DELETE") {
    db.prepare("DELETE FROM history WHERE user_id = ?").run(user.id);
    return send(res, 200, { ok: true });
  }

  return fail(res, 404, "not found");
}
