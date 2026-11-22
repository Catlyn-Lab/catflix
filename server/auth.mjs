// Google sign-in (OAuth code flow, done by this server) and sessions.
//
// Website: /auth/google/start?return=<page> → Google → /auth/google/callback → session cookie
// (HttpOnly) → back to the page.
// Desktop app: it opens /auth/google/start?device=<random id> in the system browser and polls
// /auth/device/<id>; once the callback has run, that call hands the app its token once.
// Android app: Google's own account picker gives it an ID token for the web client; it posts it
// to /auth/google/idtoken and gets its token back.
import crypto from "node:crypto";
import { config, googleReady } from "./config.mjs";
import { db } from "./db.mjs";
import { allow, clientIp, cookies, fail, readJson, send } from "./http.mjs";

const COOKIE = "catflix_session";
const DAY = 86_400_000;
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const random = () => crypto.randomBytes(32).toString("base64url");

/** OAuth `state` values and device logins in flight, for ten minutes at most. */
const pending = new Map();
const devices = new Map();
const sweep = () => {
  const now = Date.now();
  for (const [key, entry] of pending) if (entry.expires < now) pending.delete(key);
  for (const [key, entry] of devices) if (entry.expires < now) devices.delete(key);
};

const userRow = db.prepare("SELECT id, email, name, avatar_url AS avatar FROM users WHERE id = ?");

/** The signed-in user for a request (cookie on the website, bearer token in the app), or null. */
export function currentUser(req) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookies(req)[COOKIE];
  if (!token) return null;
  const session = db
    .prepare("SELECT user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?")
    .get(hash(token));
  if (!session || session.expires_at < Date.now()) return null;
  if (Date.now() - session.last_seen_at > DAY) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(Date.now(), hash(token));
  }
  return userRow.get(session.user_id) ?? null;
}

function createSession(userId, device) {
  const token = random();
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, device, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(hash(token), userId, device, now, now, now + config.sessionDays * DAY);
  return token;
}

const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secureCookies ? "; Secure" : ""}`;

/** Only send people back to Catflix's own pages. */
function safeReturn(value) {
  try {
    const url = new URL(value);
    return config.allowedOrigins.has(url.origin) ? url.toString() : config.publicUrl;
  } catch {
    return config.publicUrl;
  }
}

const page = (res, status, title, text) =>
  send(
    res,
    status,
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>` +
      `<body style="background:#09080f;color:#eee;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center">` +
      `<div><h1 style="font-size:22px">${title}</h1><p style="color:#aaa">${text}</p></div>`,
    { "Content-Type": "text/html; charset=utf-8" },
  );

/** Add or update the Google account's user, and return its id. */
function upsertUser(claims) {
  db.prepare(
    `INSERT INTO users (google_sub, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url`,
  ).run(claims.sub, claims.email ?? null, claims.name ?? null, claims.picture ?? null, Date.now());
  return db.prepare("SELECT id FROM users WHERE google_sub = ?").get(claims.sub).id;
}

/**
 * An ID token the Android app got from Google's account picker. It did not come from Google
 * directly, so Google's tokeninfo endpoint checks its signature; it must be for our web client.
 */
async function verifyIdToken(idToken) {
  const answer = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?${new URLSearchParams({ id_token: idToken })}`,
    { signal: AbortSignal.timeout(10_000) },
  ).catch(() => null);
  const claims = answer?.ok ? await answer.json() : null;
  const valid =
    claims &&
    claims.aud === config.google.clientId &&
    ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) &&
    Number(claims.exp) * 1000 > Date.now() &&
    String(claims.email_verified) === "true" &&
    claims.sub;
  return valid ? claims : null;
}

export async function handleAuth(req, res, url) {
  const route = url.pathname;

  if (route === "/auth/me") {
    const user = currentUser(req);
    // The web client id is public: the Android app asks Google's account picker for a token
    // made out to it.
    const google = googleReady();
    const client = google ? config.google.clientId : null;
    return user ? send(res, 200, { user, google, client }) : send(res, 401, { user: null, google, client });
  }

  if (route === "/auth/google/idtoken" && req.method === "POST") {
    if (!googleReady()) return fail(res, 503, "sign-in is not set up yet");
    if (!allow(`idtoken:${clientIp(req)}`, 30, 10 * 60_000))
      return fail(res, 429, "too many attempts, try again in a few minutes");
    const body = await readJson(req);
    const idToken = typeof body.idToken === "string" ? body.idToken : "";
    if (!idToken || idToken.length > 8192) return fail(res, 400, "missing sign-in token");
    const claims = await verifyIdToken(idToken);
    if (!claims) return fail(res, 401, "Google did not confirm the sign-in");
    return send(res, 200, { token: createSession(upsertUser(claims), "app") });
  }

  if (route === "/auth/logout" && req.method === "POST") {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : cookies(req)[COOKIE];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
    return send(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (route === "/auth/google/start") {
    if (!googleReady())
      return page(
        res,
        503,
        "Sign-in is not set up yet",
        "Google sign-in has not been configured on this server.",
      );
    if (!allow(`start:${clientIp(req)}`, 30, 10 * 60_000))
      return page(res, 429, "Too many attempts", "Try again in a few minutes.");
    sweep();
    const state = random();
    const device = url.searchParams.get("device");
    pending.set(state, {
      returnTo: safeReturn(url.searchParams.get("return") ?? ""),
      device: device && /^[\w-]{32,64}$/.test(device) ? device : null,
      expires: Date.now() + 10 * 60_000,
    });
    const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    google.search = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: `${config.publicUrl}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    res.writeHead(302, { Location: google.toString() });
    return res.end();
  }

  if (route === "/auth/google/callback") {
    const flow = pending.get(url.searchParams.get("state") ?? "");
    pending.delete(url.searchParams.get("state") ?? "");
    const code = url.searchParams.get("code");
    if (!flow || !code)
      return page(res, 400, "Sign-in expired", "Please start signing in again from Catflix.");

    // The token comes straight from Google over HTTPS, authenticated with our client secret,
    // so it is genuine (OpenID Connect §3.1.3.7); its audience and expiry are still checked.
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: `${config.publicUrl}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    }).catch(() => null);
    const tokens = exchange?.ok ? await exchange.json() : null;
    const claims = tokens?.id_token
      ? JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"))
      : null;
    const valid =
      claims &&
      claims.aud === config.google.clientId &&
      ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) &&
      claims.exp * 1000 > Date.now() &&
      claims.sub;
    if (!valid)
      return page(res, 502, "Sign-in failed", "Google did not confirm the sign-in. Please try again.");

    const now = Date.now();
    const user = { id: upsertUser(claims) };

    if (flow.device) {
      devices.set(flow.device, { token: createSession(user.id, "app"), expires: now + 10 * 60_000 });
      return page(
        res,
        200,
        "Signed in to Catflix",
        "Go back to Catflix on your app or TV: it continues by itself. You can close this page.",
      );
    }
    const token = createSession(user.id, "web");
    res.writeHead(302, {
      Location: flow.returnTo,
      "Set-Cookie": sessionCookie(token, config.sessionDays * 86_400),
    });
    return res.end();
  }

  const device = /^\/auth\/device\/([\w-]{32,64})$/.exec(route)?.[1];
  if (device) {
    sweep();
    const entry = devices.get(device);
    if (!entry) return send(res, 202, { pending: true });
    devices.delete(device);
    return send(res, 200, { token: entry.token });
  }

  return fail(res, 404, "not found");
}
