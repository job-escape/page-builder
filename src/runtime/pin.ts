/**
 * A frame fixed to the screen — it stays where it is while the rest scrolls.
 *
 * Stated on the frame as `props.pin`: how far from which edges of the screen
 * it sits, in the order CSS and Figma's constraints read them.
 *
 * - `top` or `bottom` is the edge it holds to. `top` wins when both are given;
 *   a pinned frame keeps its own height.
 * - `left` and `right` together stretch it between them; one of them anchors
 *   it to that side at its own width; neither centres it.
 * - `maxWidth` caps a stretched frame and centres it in the room that leaves —
 *   a button edge to edge on a phone, and no wider than its column on a desk.
 * - `reserve` says whether the screen keeps room for it, so content scrolls to
 *   end beside it rather than under it. A bar does; a floating badge does not.
 *   Absent, a frame stretched edge to edge reserves and anything else floats.
 *
 * **Anywhere on a screen but inside a repeat or a slot** — a button in a
 * footer as well as a bar at the top level. The insets are measured from the
 * screen, not from the frame it sits in, so what its parent's padding gave it
 * is already in the numbers. Lifted out, it keeps what decided whether it was
 * drawn at all: its ancestors' conditions, and their being hidden. Inside a
 * repeat it would lose the entry it draws, so a pin there is ignored and the
 * frame is drawn in place. A reader that does not know this key draws it in
 * place too — the artifact stays readable by an older app.
 *
 * The rule is read here once and drawn by each platform its own way: a sticky
 * layer in the browser (`client/pins`), a layer over the scroll view on a
 * phone (`native/pins`). The tree walk only finds them — see `splitPinned`.
 */
import type { SourceBinding, SourceCondition } from "./compiler/source";
import type { TreeNode } from "./compiler/tree";

export type Pin = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  /** The most a stretched frame grows to; past it, it is centred. */
  maxWidth?: number;
  reserve?: boolean;
};

export type PinEdge = "top" | "bottom";

/** A pinned frame as the walk hands it to a platform: drawn, and where it goes. */
export type DrawnPin = {
  id: string;
  pin: Pin;
  edge: PinEdge;
  /** Its distance from that edge. */
  inset: number;
  /** Whether the screen keeps room for it — see `Pin.reserve`. */
  reserves: boolean;
  element: unknown;
};

/** What a platform reports back: how much room each edge's pins need. */
export type ReserveReport = (edge: PinEdge, size: number) => void;

const numberOr = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** A frame's pin, or null when it has none — or one that says nothing usable. */
export function pinOf(props: Record<string, unknown> | undefined): Pin | null {
  const raw = props?.pin;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const held = raw as Record<string, unknown>;
  const pin: Pin = {};
  const top = numberOr(held.top);
  const bottom = numberOr(held.bottom);
  const left = numberOr(held.left);
  const right = numberOr(held.right);
  if (top !== undefined) pin.top = top;
  else if (bottom !== undefined) pin.bottom = bottom;
  // An edge is what a pin is: one that names neither holds to the bottom, where
  // nearly every fixed frame on a funnel — its button — lives.
  else pin.bottom = 0;
  if (left !== undefined) pin.left = left;
  if (right !== undefined) pin.right = right;
  const maxWidth = numberOr(held.maxWidth);
  if (maxWidth !== undefined && maxWidth > 0) pin.maxWidth = maxWidth;
  if (typeof held.reserve === "boolean") pin.reserve = held.reserve;
  return pin;
}

export const edgeOf = (pin: Pin): PinEdge => (pin.top !== undefined ? "top" : "bottom");

export const insetOf = (pin: Pin): number => pin.top ?? pin.bottom ?? 0;

export const stretches = (pin: Pin): boolean => pin.left !== undefined && pin.right !== undefined;

export const reservesRoom = (pin: Pin): boolean => pin.reserve ?? stretches(pin);

/** A pinned frame found in a screen's tree, ready to draw on its own. */
export type PinnedNode = { node: TreeNode; pin: Pin };

/** The keys a pinned frame's own box no longer answers — see `splitPinned`. */
const PLACED_KEYS = ["pin", "x", "y"] as const;

/** What the frames above a pinned one said about whether it is drawn. */
type Above = {
  conditions: SourceCondition[];
  /** An ancestor is never drawn. */
  hidden: boolean;
  /** The nearest ancestor's `hidden` decided per render — a device's layout. */
  hiddenBinding?: SourceBinding;
};

function below(node: TreeNode, above: Above): Above {
  const binding = node.bindings?.hidden;
  return {
    conditions: node.when ? [...above.conditions, node.when] : above.conditions,
    hidden: above.hidden || node.props?.hidden === true,
    hiddenBinding: binding ?? above.hiddenBinding,
  };
}

/** A pinned frame as it is drawn on its own: unplaced, and only where it was. */
function lifted(node: TreeNode, pin: Pin, above: Above): TreeNode {
  const props: Record<string, unknown> = { ...node.props };
  PLACED_KEYS.forEach((key) => delete props[key]);
  if (stretches(pin)) props.width = "fill";
  if (above.hidden) props.hidden = true;
  const conditions = node.when ? [...above.conditions, node.when] : above.conditions;
  const bindings =
    above.hiddenBinding && !node.bindings?.hidden
      ? { ...node.bindings, hidden: above.hiddenBinding }
      : node.bindings;
  return {
    ...node,
    props,
    ...(bindings ? { bindings } : {}),
    ...(conditions.length === 0
      ? {}
      : { when: conditions.length === 1 ? conditions[0]! : { op: "and" as const, of: conditions } }),
  };
}

/**
 * A screen's roots with their pinned frames taken out, and those frames.
 *
 * Done once per screen tree, not per render: which frames are pinned is a
 * fact of the artifact. A pinned frame loses `x` and `y` — where it sat is
 * what the pin now says — and, stretched between both sides, fills the room
 * the pin gives it whatever width it was drawn at. Not looked for inside a
 * repeat, whose entries it would leave behind, nor inside a slot.
 */
export function splitPinned(roots: readonly TreeNode[]): {
  roots: TreeNode[];
  pinned: PinnedNode[];
} {
  const pinned: PinnedNode[] = [];
  const walk = (node: TreeNode, above: Above): TreeNode => {
    if (node.kind !== "frame" || node.repeat) return node;
    const inside = below(node, above);
    let changed = false;
    const children: TreeNode[] = [];
    node.children.forEach((child) => {
      const pin = pinOf(child.props);
      if (pin) {
        pinned.push({ node: lifted(child, pin, inside), pin });
        changed = true;
        return;
      }
      const kept = walk(child, inside);
      if (kept !== child) changed = true;
      children.push(kept);
    });
    return changed ? { ...node, children } : node;
  };
  const kept = roots.map((root) => walk(root, { conditions: [], hidden: false }));
  return { roots: kept, pinned };
}

/**
 * What a pin is known to need before anything has been measured.
 *
 * A frame drawn at a number is that tall, so the first paint — the server's,
 * where nothing can be measured — already keeps the right room. One that hugs
 * its content is measured once it is on screen.
 */
export function estimatedReserve(pinned: readonly PinnedNode[]): Record<PinEdge, number> {
  const room: Record<PinEdge, number> = { top: 0, bottom: 0 };
  pinned.forEach(({ node, pin }) => {
    const height = node.props?.height;
    if (!reservesRoom(pin) || typeof height !== "number") return;
    const edge = edgeOf(pin);
    room[edge] = Math.max(room[edge], height + insetOf(pin));
  });
  return room;
}
