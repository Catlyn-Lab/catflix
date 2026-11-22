/**
 * Discourages casual inspection of the page: no right-click menu (except in text fields, so
 * copy and paste still work) and no developer-tools or view-source shortcuts.
 *
 * This is a deterrent, not security: anything a browser shows can be inspected by other means.
 * What must stay private (keys, accounts, other viewers' data) lives on Catflix's server.
 */

const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function blockedShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (event.key === "F12") return true;
  const command = event.ctrlKey || event.metaKey;
  // Ctrl+Shift+I/J/C (Windows, Linux), Cmd+Option+I/J/C (Mac): the developer tools.
  if (command && (event.shiftKey || event.altKey) && ["i", "j", "c"].includes(key)) return true;
  // Ctrl+U / Cmd+Option+U: view source.
  if (command && key === "u") return true;
  return false;
}

export function installGuard() {
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!editable(event.target)) event.preventDefault();
    },
    { capture: true },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (blockedShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true },
  );
}
