/**
 * Safari (WebKit) lets a video start with sound only when play() was called on that very element
 * during a click or key press, and with "Never Auto-Play" not even muted. Catflix starts playback a
 * few seconds after the click, once the stream has been found, so the next player's video element
 * is made ahead of time and approved on every click and key press: play() and pause() on the still
 * empty element, which WebKit remembers for that element. Other browsers simply ignore it.
 */

let next: HTMLVideoElement | null = null;

const fresh = () => {
  const video = document.createElement("video");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  return video;
};

const approve = () => {
  next ??= fresh();
  if (next.dataset.approved) return;
  next.dataset.approved = "1";
  try {
    next.play()?.catch(() => undefined);
    next.pause();
  } catch {
    /* nothing to approve here */
  }
};

/** Once, at start-up. */
export function installMediaApproval() {
  next ??= fresh();
  for (const type of ["click", "keydown", "touchend"]) {
    document.addEventListener(type, approve, { capture: true });
  }
}

/** The video element for a new player (approved if the viewer clicked or pressed a key since). */
export function takeVideo() {
  const video = next ?? fresh();
  next = fresh();
  return video;
}
