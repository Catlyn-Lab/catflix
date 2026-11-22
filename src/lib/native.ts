/**
 * The desktop shell's two network helpers (see `src-tauri/src/lib.rs`). Outside the app, in a
 * plain browser during development, neither exists and callers fall back to the proxy.
 */

type Internals = { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };

const internals = () => (window as unknown as { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__;

/** True inside the Catflix app. */
export const isNative = () => internals() !== undefined;

export type NativePage = { status: number; body: string; total: number | null };

/**
 * What kind of thing is being read: a page or JSON document, a subtitle file, or a media file.
 * Subtitles and media are asked for with the headers a browser's own element sends; some drama
 * hosts answer a bare request with a notice file instead of the real subtitles.
 */
export type NativeKind = "page" | "subtitle" | "media";

/** Read a page, document or file from a Catflix source the way a browser would. */
export async function nativeGet(
  url: string,
  referer?: string,
  kind: NativeKind = "page",
): Promise<NativePage> {
  const shell = internals();
  if (!shell) throw new Error("only available in the app");
  const page = (await shell.invoke("native_get", {
    url,
    referer: referer ?? null,
    kind,
  })) as NativePage;
  if (page.status >= 400) throw new Error(`the source answered ${page.status}`);
  return page;
}

/**
 * A video file relayed by the app with the referer its host requires. Windows and Android serve
 * custom schemes as `http://<scheme>.localhost`, macOS and Linux as `<scheme>://localhost`.
 */
export function relayedUrl(url: string, referer: string) {
  const query = new URLSearchParams({ url, referer }).toString();
  return /Windows|Android/i.test(navigator.userAgent)
    ? `http://stream.localhost/?${query}`
    : `stream://localhost/?${query}`;
}

/** Open a page of Catflix's own server in the system browser (desktop sign-in). */
export async function openExternal(url: string) {
  const shell = internals();
  if (!shell) throw new Error("only available in the app");
  await shell.invoke("open_external", { url });
}
