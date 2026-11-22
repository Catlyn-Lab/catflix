/**
 * The viewer's Catflix account (Google sign-in, handled by Catflix's server).
 *
 * Website: a session cookie, set by the server after Google; guests can browse without one.
 * Desktop app: a sign-in is required. The app opens Google in the system browser and waits for
 * the server to hand it a token, kept on this device.
 */

import { createSignal } from "solid-js";
import { backendUrl } from "./api";
import { isNative, openExternal } from "./native";

export type User = { id: number; email?: string | null; name?: string | null; avatar?: string | null };

const TOKEN_KEY = "catflix:token";
const [user, setUser] = createSignal<User | null>(null);
const [status, setStatus] = createSignal<"checking" | "ready" | "offline">("checking");
const [signInReady, setSignInReady] = createSignal(false);
const [waiting, setWaiting] = createSignal(false);

/** The signed-in viewer, or null for a guest. */
export const account = user;
/** Whether the server has been asked yet, and whether it answered. */
export const accountStatus = status;
/** Google sign-in is configured on the server. */
export const canSignIn = signInReady;
/** The desktop app is waiting for the browser sign-in to finish. */
export const signingIn = waiting;

const listeners: ((user: User | null) => void)[] = [];
/** Called with the viewer whenever they sign in or out (the sync layer starts and stops). */
export function onAccount(listener: (user: User | null) => void) {
  listeners.push(listener);
}
function setAccount(next: User | null) {
  setUser(next);
  for (const listener of listeners) listener(next);
}

/** A request to Catflix's server, carrying the session (cookie on the web, token in the app). */
export async function call(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(backendUrl(path), { ...init, headers, credentials: "include" });
}

/** Ask the server who is signed in. */
export async function loadAccount() {
  try {
    const response = await call("/auth/me");
    const payload = (await response.json()) as { user: User | null; google?: boolean };
    setSignInReady(Boolean(payload.google));
    if (response.status === 401 && localStorage.getItem(TOKEN_KEY)) localStorage.removeItem(TOKEN_KEY);
    setStatus("ready");
    setAccount(response.ok ? payload.user : null);
  } catch {
    setStatus("offline");
  }
}

const deviceId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Sign in with Google. On the web the page goes to Google and comes back signed in. */
export async function signIn() {
  if (!isNative()) {
    location.href = backendUrl(`/auth/google/start?return=${encodeURIComponent(location.href)}`);
    return;
  }
  const device = deviceId();
  await openExternal(backendUrl(`/auth/google/start?device=${device}`));
  setWaiting(true);
  try {
    // The browser sign-in takes a minute at most; give up quietly after ten.
    for (let attempt = 0; attempt < 300; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!waiting()) return;
      const response = await fetch(backendUrl(`/auth/device/${device}`)).catch(() => null);
      if (response?.status !== 200) continue;
      const { token } = (await response.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, token);
      await loadAccount();
      return;
    }
  } finally {
    setWaiting(false);
  }
}

export const cancelSignIn = () => setWaiting(false);

export async function signOut() {
  await call("/auth/logout", { method: "POST" }).catch(() => null);
  localStorage.removeItem(TOKEN_KEY);
  setAccount(null);
}
