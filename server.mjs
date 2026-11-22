// Serves the built web app (dist/) for hosting Catflix as a website, e.g. behind nginx:
//   npm ci && npm run build && node server.mjs        (PORT, default 8110)
//
// Besides the files, it forwards `/api/*` catalogue requests to the API hosts (the same list and
// failover as src/lib/api.ts). The API only allows the app's own origins, so a browser on another
// domain is refused; asking this server instead keeps every request on the site's own origin.
// Media is not forwarded: the app fetches it from the hosts' `/api/proxy`, which allows any origin.
//
// The one exception is `/stream?url=&referer=`: drama videos on hosts that only answer their own
// site's referer (which a browser can't send). Those are relayed with that referer, range by range;
// the desktop app does the same itself. Only the hosts in LOCKED are relayed.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";

const root = path.join(import.meta.dirname, "dist");
const port = process.env.PORT || 8110;

const HOSTS = [
  "https://api.framextv.xyz",
  "https://api.framextv.cc",
  "https://api.framextv.tech",
  "https://api.framextv.pro",
];
const TIMEOUT = 25_000;
let preferred = 0;

/** Video hosts relayed by `/stream`. */
const LOCKED = /(^|\.)(flixfile\.top|cdnvideo\.autos)$/;
/** Safari's own user agent: these hosts refuse imitations of Chrome and plain HTTP clients. */
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

/** Forward one API request, trying each host in turn as the app does. */
async function forward(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let last = { status: 502, text: "the catalogue could not be reached" };
  for (let step = 0; step < HOSTS.length; step++) {
    const index = (preferred + step) % HOSTS.length;
    try {
      const response = await fetch(HOSTS[index] + req.url, {
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
  res.writeHead(last.status, { "Content-Type": "text/plain; charset=utf-8" }).end(last.text);
}

/**
 * Relay one range of a locked video. Plain `https` rather than `fetch`: fetch adds headers of its
 * own that these hosts take for a bot.
 */
function relay(req, res) {
  const query = new URL(req.url, "http://x").searchParams;
  let target;
  try {
    target = new URL(query.get("url") ?? "");
  } catch {
    res.writeHead(400).end("missing url");
    return;
  }
  if (target.protocol !== "https:" || !LOCKED.test(target.hostname)) {
    res.writeHead(403).end("not a relayed host");
    return;
  }
  const headers = { "user-agent": USER_AGENT, accept: "*/*" };
  const referer = query.get("referer");
  if (referer) headers.referer = referer;
  if (req.headers.range) headers.range = req.headers.range;

  const upstream = https.get(target, { headers, timeout: TIMEOUT }, (answer) => {
    const out = { "Cache-Control": "no-store", "Accept-Ranges": "bytes" };
    for (const name of ["content-type", "content-length", "content-range"]) {
      if (answer.headers[name]) out[name] = answer.headers[name];
    }
    res.writeHead(answer.statusCode ?? 502, out);
    answer.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502).end();
    else res.destroy();
  });
  // The viewer seeked or left: stop downloading the rest of this range.
  res.on("close", () => upstream.destroy());
}

function serveFile(req, res) {
  const pathname = path
    .normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
    .replace(/^(\.\.[/\\])+/, "");
  let file = path.join(root, pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(root, "index.html");
  }
  res.writeHead(200, {
    "Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/stream?")) {
      relay(req, res);
    } else if (req.url.startsWith("/api/")) {
      forward(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(502).end();
      });
    } else {
      serveFile(req, res);
    }
  })
  .listen(port, "127.0.0.1", () => console.log("catflix on", port));
