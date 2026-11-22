/**
 * Every outside address Catflix uses, read from `.env` at build time (see `.env.example`).
 * These values end up in the built app, so they are public: secrets belong in the server's own
 * settings, never here.
 */

const env = import.meta.env;

const list = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/** A host list as a matcher: `a.com,b.org` matches those domains and their subdomains. */
const hosts = (value?: string) => {
  const names = list(value).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return names.length ? new RegExp(`(^|\\.)(${names.join("|")})$`, "i") : /$^/;
};

const trimSlash = (value?: string) => (value ?? "").replace(/\/+$/, "");

export const config = {
  /** Catflix's own server (accounts, sync, subtitles). Empty means the site's own origin. */
  backend: trimSlash(env.VITE_BACKEND_URL),
  /** Catalogue and playback API hosts, tried in turn. */
  catalogueHosts: list(env.VITE_CATALOGUE_HOSTS),
  /** Anime: the JSON bridge and the site itself. */
  animeBridge: trimSlash(env.VITE_ANIME_BRIDGE),
  animeSite: trimSlash(env.VITE_ANIME_SITE),
  /** Asian drama: the catalogue site and the feeds its player reads. */
  dramaSite: trimSlash(env.VITE_DRAMA_SITE),
  dramaPlaylists: list(env.VITE_DRAMA_PLAYLISTS),
  /** Public reader service used when a source refuses proxies. */
  reader: env.VITE_READER_URL ?? "",
  /** Video hosts that answer the app directly, and the ones that need the relay. */
  directHosts: hosts(env.VITE_DIRECT_HOSTS),
  lockedHosts: hosts(env.VITE_LOCKED_HOSTS),
  /** Referer the locked hosts expect; the relays send it. */
  lockedReferer: env.VITE_LOCKED_REFERER ?? "",
};
