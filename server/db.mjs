// SQLite (node:sqlite, built into Node 22+): users, sessions, sync and generated subtitles.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.mjs";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");

/** Each entry runs once, in order; `PRAGMA user_version` records how far the file has got. */
const MIGRATIONS = [
  `
  CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    google_sub  TEXT NOT NULL UNIQUE,
    email       TEXT,
    name        TEXT,
    avatar_url  TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash    TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device        TEXT,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE progress (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    position_s  REAL NOT NULL,
    duration_s  REAL NOT NULL,
    title       TEXT,
    poster      TEXT,
    deleted     INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX progress_since ON progress(user_id, updated_at);

  -- One row per title (a film, or a whole series), newest first.
  CREATE TABLE history (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title_key   TEXT NOT NULL,
    last_key    TEXT NOT NULL,
    title       TEXT,
    poster      TEXT,
    watched_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, title_key)
  );
  CREATE INDEX history_recent ON history(user_id, watched_at DESC);

  CREATE TABLE prefs (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    json        TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  -- Generated subtitles are shared with everyone who watches the same file.
  CREATE TABLE subtitles (
    id           INTEGER PRIMARY KEY,
    source_hash  TEXT NOT NULL,
    source_url   TEXT NOT NULL,
    source_label TEXT,
    target_lang  TEXT NOT NULL,
    method       TEXT NOT NULL CHECK (method IN ('translate', 'ai')),
    tone         TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL CHECK (status IN ('working', 'ready', 'failed')),
    cues_done    INTEGER NOT NULL DEFAULT 0,
    cues_total   INTEGER NOT NULL DEFAULT 0,
    cues_json    TEXT,
    error        TEXT,
    model        TEXT,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    UNIQUE (source_hash, target_lang, method, tone)
  );
  CREATE INDEX subtitles_source ON subtitles(source_hash);

  CREATE TABLE ai_usage (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    characters  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
  `,
  // 2: each viewer may make their own subtitle in a language (all guests together count as one).
  `
  CREATE TABLE subtitles_new (
    id           INTEGER PRIMARY KEY,
    source_hash  TEXT NOT NULL,
    source_url   TEXT NOT NULL,
    source_label TEXT,
    target_lang  TEXT NOT NULL,
    method       TEXT NOT NULL CHECK (method IN ('translate', 'ai')),
    tone         TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL CHECK (status IN ('working', 'ready', 'failed')),
    cues_done    INTEGER NOT NULL DEFAULT 0,
    cues_total   INTEGER NOT NULL DEFAULT 0,
    cues_json    TEXT,
    error        TEXT,
    model        TEXT,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  INSERT INTO subtitles_new SELECT * FROM subtitles;
  DROP TABLE subtitles;
  ALTER TABLE subtitles_new RENAME TO subtitles;
  CREATE INDEX subtitles_source ON subtitles(source_hash);
  CREATE UNIQUE INDEX subtitles_one_each
    ON subtitles(source_hash, target_lang, method, tone, IFNULL(created_by, 0));
  `,
];

const current = db.prepare("PRAGMA user_version").get().user_version;
for (let version = current; version < MIGRATIONS.length; version++) {
  db.exec("BEGIN");
  try {
    db.exec(MIGRATIONS[version]);
    db.exec(`PRAGMA user_version = ${version + 1}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Jobs that were running when the server stopped will not finish: let them be asked for again.
db.prepare("UPDATE subtitles SET status = 'failed', error = 'interrupted' WHERE status = 'working'").run();
