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
  SourceFrame,
  SourceFunnel,
  SourceScreen,
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
export const TREE_SCHEMA = "1.0";

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
   * renderer is one less thing two platforms can do differently, and there is
   * exactly one event today.
   */
  on?: SourceAction[];
};

export type TreeNode =
  | (TreeNodeBase & { kind: "frame"; children: TreeNode[] })
  | (TreeNodeBase & { kind: "text"; textKey: string })
  | (TreeNodeBase & { kind: "image"; src: string })
  | (TreeNodeBase & { kind: "input"; variable: string });

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

function baseOf(frame: SourceFrame): TreeNodeBase {
  const actions = frame.interactions?.flatMap((interaction) => interaction.do) ?? [];

  return {
    id: frame.id,
    ...(frame.props && Object.keys(frame.props).length ? { props: frame.props } : {}),
    ...(frame.bindings && Object.keys(frame.bindings).length ? { bindings: frame.bindings } : {}),
    ...(frame.when ? { when: frame.when } : {}),
    ...(actions.length ? { on: actions } : {}),
  };
}

/**
 * Total, like the JavaScript emitter: every document the editor can produce
 * emits. An unrecognised kind becomes a frame rather than failing the build — a
 * compiler that can reject its own editor's output is a support queue.
 */
function nodeOf(frame: SourceFrame, all: SourceFrame[]): TreeNode {
  const base = baseOf(frame);

  if (frame.kind === "text") return { ...base, kind: "text", textKey: frame.textKey ?? "" };
  if (frame.kind === "image") return { ...base, kind: "image", src: frame.src ?? "" };
  if (frame.kind === "input") return { ...base, kind: "input", variable: frame.variable ?? "" };

  return {
    ...base,
    kind: "frame",
    children: childrenOf(frame, all).map((child) => nodeOf(child, all)),
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
