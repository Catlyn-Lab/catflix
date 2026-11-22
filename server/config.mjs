// Settings from `.env` (see `.env.example`). The server reads the web app's VITE_* source settings
// too, so each address is written once.
import fs from "node:fs";
import path from "node:path";

export const root = path.join(import.meta.dirname, "..");
const file = path.join(root, ".env");
if (fs.existsSync(file)) process.loadEnvFile(file);

const env = process.env;
const list = (value) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
const number = (value, fallback) =>
  Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback;
const trimSlash = (value) => (value ?? "").replace(/\/+$/, "");

const publicUrl = trimSlash(env.PUBLIC_URL) || `http://localhost:${env.PORT || 8110}`;

export const config = {
  port: number(env.PORT, 8110),
  publicUrl,
  secureCookies: publicUrl.startsWith("https://"),
  dbPath: path.resolve(root, env.DB_PATH || "data/catflix.db"),
  /** Pages allowed to call the account, sync and subtitle routes with credentials. */
  allowedOrigins: new Set([new URL(publicUrl).origin, ...list(env.ALLOWED_ORIGINS)]),
  sessionDays: number(env.SESSION_DAYS, 180),

  google: {
    clientId: env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
  },

  catalogueHosts: list(env.VITE_CATALOGUE_HOSTS),
  lockedHosts: list(env.VITE_LOCKED_HOSTS),
  lockedReferer: env.VITE_LOCKED_REFERER ?? "",

  /** Machine translation: `google` (batch endpoint) and `mymemory`, tried in order. */
  translators: list(env.TRANSLATORS || "google,mymemory"),
  googleTranslateUrl: env.GOOGLE_TRANSLATE_URL ?? "",
  myMemoryUrl: env.MYMEMORY_URL ?? "",
  guestJobsPerHour: number(env.GUEST_SUBTITLE_JOBS_PER_HOUR, 6),

  ai: {
    baseUrl: trimSlash(env.AI_BASE_URL),
    apiKey: env.AI_API_KEY ?? "",
    model: env.AI_MODEL ?? "",
    dailyCharacters: number(env.AI_DAILY_CHARACTERS, 200_000),
  },
};

export const googleReady = () => Boolean(config.google.clientId && config.google.clientSecret);
export const aiReady = () => Boolean(config.ai.baseUrl && config.ai.model);
