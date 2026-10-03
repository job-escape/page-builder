/**
 * **Scroll into view** — the `scrollTo` step: bring a frame on this screen
 * into the visitor's view.
 *
 * The frame is named by id, and only a frame some step scrolls to is marked:
 * the compiler sets `props.anchor` on exactly those (`markAnchors`), so a
 * screen nobody scrolls carries nothing new. Each platform finds the mark its
 * own way — a `data-anchor` attribute in a browser, a registered view on a
 * phone (`native/scroll-anchor`) — and this module only says which to scroll
 * to and where in the window it should end up.
 *
 * Never blocks and never fails: a frame not drawn right now (behind a `when`)
 * is simply not scrolled to.
 */
import type { TreeNode } from "./compiler/tree";

export type ScrollAlign = "start" | "center" | "end";

/** The prop the compiler marks a scroll target with — the frame's own id. */
export const ANCHOR_PROP = "anchor";

type Scroller = (target: string, align: ScrollAlign) => void;

/** A browser's: the marked element, scrolled to — smoothly, unless the visitor asked for less motion. */
const webScroller: Scroller = (target, align) => {
  if (typeof document === "undefined") return;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(target) : target.replace(/"/g, '\\"');
  const element = document.querySelector(`[data-anchor="${escaped}"]`);
  if (!element) return;
  const still =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: still ? "auto" : "smooth", block: align });
};

let scroller: Scroller = webScroller;

/** For a platform with no document — React Native sets its own. */
export function configureScroll(next: Scroller): void {
  scroller = next;
}

export function scrollToAnchor(target: string, align: ScrollAlign = "start"): void {
  if (target) scroller(target, align);
}

/** Every frame a `scrollTo` step names, anywhere in some actions — found by shape. */
export function scrollTargetsIn(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => scrollTargetsIn(entry, into));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const held = value as Record<string, unknown>;
  if (held.type === "scrollTo" && typeof held.target === "string" && held.target) into.add(held.target);
  Object.values(held).forEach((entry) => scrollTargetsIn(entry, into));
}

/** A screen's nodes with every scroll target marked — see `ANCHOR_PROP`. */
export function markAnchors(roots: TreeNode[], targets: ReadonlySet<string>): TreeNode[] {
  if (targets.size === 0) return roots;
  const mark = (node: TreeNode): TreeNode => {
    const children = "children" in node && node.children ? node.children.map(mark) : undefined;
    const marked = targets.has(node.id) ? { ...node, props: { ...node.props, [ANCHOR_PROP]: node.id } } : node;
    return children ? ({ ...marked, children } as TreeNode) : marked;
  };
  return roots.map(mark);
}
