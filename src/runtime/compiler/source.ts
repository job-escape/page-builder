/**
 * The source a funnel is compiled from — frames, interactions, variables.
 *
 * This mirrors what `funnel_backend` stores: `design_frame` rows with `parent`
 * and `pos` (already shipped), plus the interactions and bindings this feature
 * adds. It is the editor's model, not the runtime's — the runtime never sees any
 * of it, only the JavaScript emitted from it.
 *
 * Kept here rather than in the backend's language because the compiler is the
 * thing that has to read it, and a shape defined next to its only consumer stays
 * honest.
 */
import type { VariableDecl } from "../types";

/** A condition, as the editor stores it. Compiles to a helper call. */
export type SourceCondition =
  | { op: "has"; variable: string; value: string }
  | { op: "eq"; variable: string; value: string | number | boolean }
  | { op: "neq"; variable: string; value: string | number | boolean }
  | { op: "isSet"; variable: string }
  | { op: "isEmpty"; variable: string }
  | { op: "atMax"; variable: string }
  | { op: "meetsMin"; variable: string }
  | { op: "count"; variable: string; cmp: "gte" | "lte" | "eq"; value: number }
  | { op: "not"; of: SourceCondition }
  | { op: "and"; of: SourceCondition[] }
  | { op: "or"; of: SourceCondition[] };

export type SourceAction =
  | { type: "select"; variable: string; value: string }
  | { type: "set"; variable: string; value: string | number | boolean | null }
  | {
      type: "show";
      target: string;
      as?: "replace" | "overlay";
      position?: "center" | "bottom" | "top" | "side";
      dim?: boolean;
      closeOnOutside?: boolean;
    }
  | { type: "close" }
  | { type: "conditional"; branches: Array<{ when?: SourceCondition; do: SourceAction[] }> };

export type SourceInteraction = {
  on: { event: "click" };
  do: SourceAction[];
};

/**
 * A prop whose value is decided at render — the mechanism behind a "selected"
 * variant. `whenTrue` / `whenFalse` are the two appearances.
 */
export type SourceBinding = {
  when: SourceCondition;
  whenTrue: unknown;
  whenFalse: unknown;
};

export type SourceFrame = {
  id: string;
  name?: string;
  /** null at the top level of a screen. */
  parent: string | null;
  kind: "frame" | "text" | "image";
  /** Static props — layout, fill, radius, padding. */
  props?: Record<string, unknown>;
  /** Props computed per render from funnel state. */
  bindings?: Record<string, SourceBinding>;
  /** Locale key. `text` frames only; never a literal string. */
  textKey?: string;
  /** `image` frames only. */
  src?: string;
  interactions?: SourceInteraction[];
  /** Ordering among siblings — the fractional index from the node model. */
  pos?: string;
};

export type SourceScreen = {
  id: string;
  name?: string;
  frames: SourceFrame[];
  /** Presentation defaults when this frame is opened as an overlay. */
  overlay?: { position?: "center" | "bottom" | "top" | "side"; dim?: boolean; closeOnOutside?: boolean };
};

export type SourceFunnel = {
  id: string | number;
  version: string;
  entry: string;
  variables: VariableDecl[];
  screens: SourceScreen[];
};
