/** What Catflix is running on: decides remote-control navigation and the 10-foot scale. */

const TV_AGENTS =
  /SMART-?TV|SmartTV|Tizen|Web0S|webOS|Android ?TV|GoogleTV|Google TV|BRAVIA|AFT[A-Z]|CrKey|HbbTV|NetCast|Roku|AppleTV|VIDAA|Philips ?TV/i;

const TV_KEY = "catflix:tv";

function forced(): boolean | null {
  try {
    const flag = new URLSearchParams(window.location.search).get("tv");
    if (flag !== null) localStorage.setItem(TV_KEY, flag === "0" ? "0" : "1");
    const stored = localStorage.getItem(TV_KEY);
    return stored === null ? null : stored === "1";
  } catch {
    return null;
  }
}

/** A television: detected from the user agent, or forced with `?tv=1` / `?tv=0`. */
export const isTv = forced() ?? TV_AGENTS.test(navigator.userAgent);

const query = (text: string) => window.matchMedia?.(text).matches ?? false;

/** No mouse or trackpad: arrow keys move focus instead of scrolling or changing volume. */
export const usesDpad = isTv || !query("(any-pointer: fine)");

/** Primary input is a finger. */
export const isTouch = !isTv && query("(pointer: coarse)");

export function markDevice() {
  const root = document.documentElement;
  root.dataset.device = isTv ? "tv" : isTouch ? "touch" : "desktop";
}
