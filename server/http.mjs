// Small request/response helpers shared by the routes.
import { config } from "./config.mjs";

const MAX_BODY = 1024 * 1024;

/**
 * Headers a browser sends for a subresource (a subtitle track, a media file) but not for a page.
 * Some drama hosts answer a bare request with a notice file instead of the real subtitle.
 */
export function subresourceHeaders(dest = "track") {
  return {
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": dest,
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site",
    ...(config.lockedReferer
      ? { referer: config.lockedReferer, origin: new URL(config.lockedReferer).origin }
      : {}),
  };
}

export function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(json);
}

export const fail = (res, status, message) => send(res, status, { error: message });

export function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("that request is too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(Object.assign(new Error("that request is not valid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

/**
 * CORS for the account, sync and subtitle routes: only the listed origins (the site, the desktop
 * app, local development), with credentials. Returns false when a preflight was answered.
 */
export function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return false;
  }
  return true;
}

/** A simple in-memory counter per key and window (guests' subtitle jobs, sign-in attempts). */
const windows = new Map();
export function allow(key, limit, windowMs) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now - entry.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export const clientIp = (req) =>
  (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
    .toString()
    .split(",")[0]
    .trim();
