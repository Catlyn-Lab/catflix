// Catflix's server: the built web app, plus a small backend for accounts, sync and subtitles.
//   npm ci && npm run build && node server/index.mjs      (settings in `.env`)
//
//   /api/*         catalogue calls, forwarded to the catalogue hosts (they only allow the app's
//                  own origins, so a browser on this site would be refused)
//   /stream        relays video from hosts that only answer their own site's referer
//   /translate     description translation
//   /auth/*        Google sign-in and sessions
//   /sync/*        watch progress, history and preferences
//   /subtitles/*   generated subtitles
//   anything else  the web app (dist/)
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import { config, root } from "./config.mjs";
import "./db.mjs";
import { currentUser, handleAuth } from "./auth.mjs";
import { cors, fail, send } from "./http.mjs";
import { handleSubtitles } from "./subtitles.mjs";
import { handleSync } from "./sync.mjs";
import { translateText } from "./translate.mjs";

const dist = path.join(root, "dist");
const TIMEOUT = 25_000;
/** Safari's own user agent: the locked video hosts refuse imitations of Chrome and plain clients. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
};

let preferred = 0;

/** Forward one catalogue request, trying each host in turn as the app does. */
async function forward(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return fail(res, 405, "read only");
  const hosts = config.catalogueHosts;
  let last = { status: 502, text: "the catalogue could not be reached" };
  for (let step = 0; step < hosts.length; step++) {
    const index = (preferred + step) % hosts.length;
    try {
      const response = await fetch(hosts[index] + req.url, {
        method: req.method,
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (response.status >= 500 || response.status === 429) {
        last = { status: response.status, text: `the API answered ${response.status}` };
        continue;
      }
      preferred = index;
      res.writeHead(response.status, {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      });
      if (response.body && req.method === "GET") Readable.fromWeb(response.body).pipe(res);
      else res.end();
      return;
    } catch (error) {
      last = { status: 502, text: `network: ${error.message}` };
    }
  }
  send(res, last.status, last.text);
}

const locked = (hostname) =>
  config.lockedHosts.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));

/** Relay one range of a locked video. Plain `https`: fetch adds headers these hosts flag as a bot. */
function relay(req, res, url) {
  let target;
  try {
    target = new URL(url.searchParams.get("url") ?? "");
  } catch {
    return fail(res, 400, "missing url");
  }
  if (target.protocol !== "https:" || !locked(target.hostname)) return fail(res, 403, "not a relayed host");
  const headers = { "user-agent": USER_AGENT, accept: "*/*" };
  if (config.lockedReferer) headers.referer = config.lockedReferer;
  if (req.headers.range) headers.range = req.headers.range;

  const upstream = https.get(target, { headers, timeout: TIMEOUT }, (answer) => {
    const out = { "Cache-Control": "no-store", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
    for (const name of ["content-type", "content-length", "content-range"]) {
      if (answer.headers[name]) out[name] = answer.headers[name];
    }
    res.writeHead(answer.statusCode ?? 502, out);
    answer.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
  upstream.on("error", () =>
    res.headersSent ? res.destroy() : fail(res, 502, "the video host did not answer"),
  );
  // The viewer seeked or left: stop downloading the rest of this range.
  res.on("close", () => upstream.destroy());
}

function serveFile(req, res, url) {
  const pathname = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = path.join(dist, pathname);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Cache-Control": file.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
  });
  fs.createReadStream(file).pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url, "http://catflix");
  const at = url.pathname;

  if (at.startsWith("/api/")) return forward(req, res);
  if (at === "/stream") return relay(req, res, url);

  const backend = ["/auth/", "/sync", "/subtitles", "/translate"].some((prefix) => at.startsWith(prefix));
  if (!backend) return serveFile(req, res, url);
  if (!cors(req, res)) return;

  if (at.startsWith("/auth/")) return handleAuth(req, res, url);
  const user = currentUser(req);
  if (at.startsWith("/sync")) return handleSync(req, res, url, user);
  if (at.startsWith("/subtitles")) return handleSubtitles(req, res, url, user);

  if (at === "/translate") {
    const text = (url.searchParams.get("q") ?? "").slice(0, 5000);
    const to = url.searchParams.get("to") ?? "";
    if (!text || !/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(to)) return fail(res, 400, "nothing to translate");
    return send(res, 200, { text: await translateText(text, to) });
  }
  return fail(res, 404, "not found");
}

http
  .createServer((req, res) => {
    route(req, res).catch((error) => {
      if (error.status) return void (!res.headersSent && fail(res, error.status, error.message));
      console.error(req.method, req.url, error);
      if (!res.headersSent) fail(res, 500, "something went wrong");
      else res.destroy();
    });
  })
  .listen(config.port, "127.0.0.1", () => console.log("catflix on", config.port));
