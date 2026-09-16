/**
 * Design data in, design data out — the same compile, emitting a tree.
 *
 * `emit.ts` turns frames into JavaScript, on the stated grounds that conditions
 * should become real `if`s rather than something interpreted. That reasoning is
 * sound and it still holds — for a target whose engine can evaluate code it was
 * handed. React Native's Hermes cannot: `eval` and `new Function` throw, so a
 * funnel published as JavaScript modules is a funnel a phone cannot open at all.
 *
 * So this is the second emitter, not a replacement. Same traversal, same sort,
 * same manifest; the difference is only what comes out the end. Conditions and
 * actions are already declarative data in `source.ts` — `emit.ts` converts them
 * into JavaScript, and a native runtime would have to convert them back, so this
 * simply declines to do the round trip.
 *
 * What is deliberately *not* here: an interpreter. This emits; the renderer
 * walks. Keeping them apart is what lets web keep using compiled modules while a
 * second platform reads the tree, with both artifacts provably from one source.
 *
 * The vocabulary is closed and small — four frame kinds, eleven conditions, six
 * actions. That is what makes walking it a few hundred lines rather than a
 * language runtime, and it is the property to defend: an arithmetic operator or
 * a string template here is the first step toward a bad programming language
 * encoded in JSON, which no two renderers implement identically.
 */
import { buildManifest, sortedScreens, type FunnelManifest } from "./manifest";
import type {
  SourceAction,
  SourceBinding,
  SourceCondition,
  SourceEvent,
  SourceFrame,
  SourceFunnel,
  SourceScreen,
  SourceValue,
} from "./source";

/**
 * The format version, and it is not `manifest.version`.
 *
 * That one is the funnel's *content* version, and `persistence.ts` discards a
 * visitor's saved answers when it changes. A format bump sharing the field would
 * silently wipe the answers of everyone mid-funnel — data loss caused by a
 * change that had nothing to do with content.
 *
 * Additive changes move the minor and a reader must ignore keys it does not
 * know; a removal moves the major and a reader must refuse. A published artifact
 * outlives the app binary that reads it, in both directions.
 */
/*
  1.3 — values: `repeat` on a frame, `params` on a text node, value bindings,
  `slot` nodes and their `triggers`, `set` from a value, a `submit`'s `values`,
  path `into` and `id`. All additive: a 1.2 reader ignores the keys and draws a
  repeated frame's template once, a slot as nothing.

  1.4 — `onSelect` on a group of options: what runs once an answer is given,
  carried out by the option that was tapped. Additive, and deliberately
  redundant: the same actions still travel in the group's own `on`, so a 1.3
  reader keeps reaching them the way it always did — by a click bubbling up to
  the group. A 1.4 reader takes `onSelect` and ignores that node's `on`, which
  is what keeps the actions from running twice in a browser.

  1.5 — time: `animate`, `timer` and `waitFor` steps, `wait: false` on a
  `submit`, `{ timer }` values, the `add` / `subtract` / `min` / `max` /
  `clamp` / `format` functions, and a frame's `transition`, `motion` and
  `motionKey` props with sizes in percent. All additive: a 1.4 reader skips a
  step it does not know, reads an unknown value as nothing and ignores the props
  — so an older app draws the funnel still, only without its motion.
*/
export const TREE_SCHEMA = "1.5";

type TreeNodeBase = {
  id: string;
  /** Static props, passed through exactly as the JavaScript emitter passes them. */
  props?: Record<string, unknown>;
  /** Props decided per render. The condition travels as data, unevaluated. */
  bindings?: Record<string, SourceBinding>;
  /**
   * Whether this node is rendered at all — the condition, unevaluated.
   *
   * Travels as data for the same reason `bindings` does: the tree is one
   * artifact read by two renderers, and a presence resolved at compile time
   * would be a different artifact per context, which is the build matrix this
   * format exists to avoid.
   */
  when?: SourceCondition;
  /**
   * What happens when this node is activated.
   *
   * Flattened from `interactions` because `emitHandler` flattens too — one
   * handler per node, every action in order. Doing it here rather than in each
   * renderer is one less thing two platforms can do differently.
   *
   * The tap only — `click`, or an interaction written before events existed.
   */
  on?: SourceAction[];
  /**
   * A field's other two events: every keystroke, and leaving it. Beside `on`
   * rather than folded into it, so a 1.0 reader — which ignores keys it does
   * not know — keeps treating a field exactly as it always did.
   */
  onChange?: SourceAction[];
  onLeave?: SourceAction[];
  /**
   * What this node does when it *appears* — a `load` on something nested.
   *
   * A screen's `load` is the funnel's moment and stays where it was, in
   * `ScreenIndex.enter`: opening a screen is not a node rendering. A frame
   * inside one is the other question that name asks, and it now has an answer —
   * a loader that starts its own animation, a card that reports itself seen.
   *
   * Run by the walk when the node mounts, which is exactly when it becomes
   * visible: a node behind a `when` is not rendered at all until the condition
   * holds, so its steps wait for that, and run again if it comes back. Beside
   * `on` rather than folded into it, so a reader that does not know this key
   * ignores it and draws the node as it always did.
   */
  onLoad?: SourceAction[];
  /**
   * What answering this group's question does, carried out by the option that
   * was tapped rather than by this node.
   *
   * On a group of options and nowhere else. The option writes the answer and
   * then runs this, so a condition here reads the answer just given. It exists
   * because the alternative — a tap on the option reaching the group — is a
   * browser's bubbling, which React Native does not have.
   *
   * The same actions also stay in this node's `on` for a 1.3 reader; see the
   * schema note above for why that is not a double run.
   */
  onSelect?: SourceAction[];
};

export type TreeNode =
  | (TreeNodeBase & {
      kind: "frame";
      children: TreeNode[];
      /** Children drawn once per entry — see `SourceFrame.repeat`. */
      repeat?: { list: SourceValue };
    })
  | (TreeNodeBase & {
      kind: "text";
      textKey: string;
      /** What the copy's placeholders are filled with — see `SourceFrame.params`. */
      params?: Record<string, SourceValue>;
    })
  | (TreeNodeBase & { kind: "image"; src: string })
  | (TreeNodeBase & { kind: "input"; variable: string })
  | (TreeNodeBase & {
      kind: "slot";
      /** The host component asked for — `"checkout"`. */
      name: string;
      /** What runs when the component reports, by report name. */
      triggers?: Record<string, SourceAction[]>;
    });

export type ScreenTree = {
  id: string;
  roots: TreeNode[];
};

export type CompiledTree = {
  manifest: FunnelManifest & { schema: string };
  /** Screen id → its tree. Split per screen for the same reason modules are. */
  screens: Record<string, ScreenTree>;
};

// ─── Tree ─────────────────────────────────────────────────────────────────────

function childrenOf(frame: SourceFrame, all: SourceFrame[]): SourceFrame[] {
  return all
    .filter((candidate) => candidate.parent === frame.id)
    .sort((a, b) => (a.pos ?? "").localeCompare(b.pos ?? ""));
}

/** A frame's actions for one event, in order. A missing event is a tap. */
export function actionsFor(frame: SourceFrame, event: SourceEvent): SourceAction[] {
  return (
    frame.interactions
      ?.filter((interaction) => (interaction.on?.event ?? "click") === event)
      .flatMap((interaction) => interaction.do) ?? []
  );
}

function baseOf(frame: SourceFrame): TreeNodeBase {
  const actions = actionsFor(frame, "click");
  const change = actionsFor(frame, "change");
  const leave = actionsFor(frame, "leave");
  const select = actionsFor(frame, "select");
  /*
    Only what is nested. A top-level frame's `load` is the screen's own, read
    into `ScreenIndex.enter` by the manifest — carrying it here as well would
    run a screen's opening steps twice, once by each route.
  */
  const load = frame.parent === null ? [] : actionsFor(frame, "load");

  return {
    id: frame.id,
    ...(frame.props && Object.keys(frame.props).length ? { props: frame.props } : {}),
    ...(frame.bindings && Object.keys(frame.bindings).length ? { bindings: frame.bindings } : {}),
    ...(frame.when ? { when: frame.when } : {}),
    ...(actions.length ? { on: actions } : {}),
    ...(change.length ? { onChange: change } : {}),
    ...(leave.length ? { onLeave: leave } : {}),
    ...(load.length ? { onLoad: load } : {}),
    ...(select.length ? { onSelect: select } : {}),
  };
}

/**
 * Total, like the JavaScript emitter: every document the editor can produce
 * emits. An unrecognised kind becomes a frame rather than failing the build — a
 * compiler that can reject its own editor's output is a support queue.
 */
function nodeOf(frame: SourceFrame, all: SourceFrame[]): TreeNode {
  const base = baseOf(frame);

  if (frame.kind === "text") {
    return {
      ...base,
      kind: "text",
      textKey: frame.textKey ?? "",
      ...(frame.params && Object.keys(frame.params).length ? { params: frame.params } : {}),
    };
  }
  if (frame.kind === "slot") {
    // Every interaction that is not one of a frame's own events is a report
    // the component makes, run by name.
    const own = new Set(["click", "change", "leave", "load"]);
    const triggers: Record<string, SourceAction[]> = {};
    (frame.interactions ?? []).forEach((interaction) => {
      const event = interaction.on?.event ?? "click";
      if (own.has(event)) return;
      triggers[event] = [...(triggers[event] ?? []), ...interaction.do];
    });
    return {
      ...base,
      kind: "slot",
      name: frame.slot ?? "",
      ...(Object.keys(triggers).length ? { triggers } : {}),
    };
  }
  if (frame.kind === "image") return { ...base, kind: "image", src: frame.src ?? "" };
  if (frame.kind === "input") return { ...base, kind: "input", variable: frame.variable ?? "" };

  return {
    ...base,
    kind: "frame",
    children: childrenOf(frame, all).map((child) => nodeOf(child, all)),
    ...(frame.repeat ? { repeat: frame.repeat } : {}),
  };
}

export function emitScreenTree(screen: SourceScreen): ScreenTree {
  const roots = screen.frames
    .filter((frame) => frame.parent === null)
    .sort((a, b) => (a.pos ?? "").localeCompare(b.pos ?? ""));

  return { id: screen.id, roots: roots.map((frame) => nodeOf(frame, screen.frames)) };
}

export function compileToTree(funnel: SourceFunnel): CompiledTree {
  // The shared builder, so the two artifacts cannot disagree about entry,
  // variables, reachability or overlay defaults — the half a renderer trusts
  // before it has fetched a single screen.
  const manifest = buildManifest(funnel);
  const screens: Record<string, ScreenTree> = {};

  sortedScreens(funnel).forEach((screen) => {
    screens[screen.id] = emitScreenTree(screen);
  });

  return { manifest: { ...manifest, schema: TREE_SCHEMA }, screens };
}
