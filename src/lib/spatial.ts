/** Arrow-key (remote control) focus movement between whatever is on screen. */

export type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE =
  'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

const KEYS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

export const directionOf = (key: string): Direction | undefined => KEYS[key];

function visible(node: HTMLElement) {
  if (node.offsetParent === null && getComputedStyle(node).position !== "fixed") return false;
  const box = node.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return false;
  const style = getComputedStyle(node);
  return style.visibility !== "hidden" && style.pointerEvents !== "none";
}

function candidates(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

function inViewport(box: DOMRect) {
  return box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
}

const SCROLLS = /auto|scroll/;

/**
 * Focus a control and centre it in whatever scrolls around it: its row sideways, the page
 * vertically. `scrollIntoView` is not used because it also drags the page sideways.
 */
function reveal(node: HTMLElement) {
  node.focus({ preventScroll: true });
  const box = node.getBoundingClientRect();
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const frame = parent.getBoundingClientRect();
    if (SCROLLS.test(style.overflowX) && parent.scrollWidth > parent.clientWidth) {
      parent.scrollBy({
        left: box.left + box.width / 2 - (frame.left + frame.width / 2),
        behavior: "smooth",
      });
    }
    // Vertically, leave things alone while the control sits comfortably on screen.
    const margin = frame.height * 0.16;
    const comfortable = box.top >= frame.top + margin && box.bottom <= frame.bottom - margin;
    if (!comfortable && SCROLLS.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
      parent.scrollBy({
        top: box.top + box.height / 2 - (frame.top + frame.height / 2),
        behavior: "smooth",
      });
    }
  }
}

/**
 * Move focus one step in a direction, to the nearest control that lies that way.
 * Returns false when there is nothing further in that direction.
 */
export function moveFocus(direction: Direction, root: ParentNode = document): boolean {
  const nodes = candidates(root);
  if (!nodes.length) return false;

  const current = document.activeElement as HTMLElement | null;
  const inside = current && current !== document.body && nodes.includes(current);
  if (!inside) {
    // Nothing focused yet: start on the page's content rather than its navigation.
    const onScreen = nodes.filter((node) => inViewport(node.getBoundingClientRect()));
    const first = onScreen.find((node) => node.closest("main")) ?? onScreen[0] ?? nodes[0];
    reveal(first);
    return true;
  }

  const from = current.getBoundingClientRect();
  const horizontal = direction === "left" || direction === "right";
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const node of nodes) {
    if (node === current) continue;
    const to = node.getBoundingClientRect();

    // How far the candidate lies in the direction of travel, edge to edge.
    const ahead =
      direction === "right"
        ? to.left - from.right
        : direction === "left"
          ? from.left - to.right
          : direction === "down"
            ? to.top - from.bottom
            : from.top - to.bottom;
    const centreAhead =
      direction === "right"
        ? to.left + to.width / 2 > from.left + from.width / 2
        : direction === "left"
          ? to.left + to.width / 2 < from.left + from.width / 2
          : direction === "down"
            ? to.top + to.height / 2 > from.top + from.height / 2
            : to.top + to.height / 2 < from.top + from.height / 2;
    if (!centreAhead || ahead < -Math.min(from.width, from.height) / 2) continue;

    // Sideways drift: zero when the two boxes overlap on the cross axis.
    const drift = horizontal
      ? Math.max(0, to.top - from.bottom, from.top - to.bottom)
      : Math.max(0, to.left - from.right, from.left - to.right);
    const centreDrift = horizontal
      ? Math.abs(to.top + to.height / 2 - (from.top + from.height / 2))
      : Math.abs(to.left + to.width / 2 - (from.left + from.width / 2));

    const score = Math.max(0, ahead) + drift * 4 + centreDrift * 0.3;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }

  if (!best) return false;
  reveal(best);
  return true;
}

/** Page-level remote navigation; the player handles its own keys. */
export function installSpatialNavigation(isBlocked: () => boolean) {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isBlocked()) return;
    const direction = directionOf(event.key);
    if (!direction) return;

    const target = event.target as HTMLElement | null;
    const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    // Left and right move the caret while typing.
    if (typing && (direction === "left" || direction === "right")) return;

    if (moveFocus(direction)) event.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
