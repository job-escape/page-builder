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
  | { type: "conditional"; branches: Array<{ when?: SourceCondition; do: SourceAction[] }> }
  /**
   * Call a named backend action with the visitor's answers.
   *
   * A *name*, never a URL: the compiled module is a public file, so the address
   * and the key stay on the funnel's own backend, which resolves the name. See
   * `runtime/request` — this is the one helper the compiler emits a call to.
   *
   * `fields` maps the payload key to the variable read for it, so
   * `{ email: "email" }` compiles to `{ email: state.get("email") }`.
   */
  | {
      type: "submit";
      action: string;
      fields?: Record<string, string>;
      /** Response fields written back into variables, by variable name. */
      into?: Record<string, string>;
      /** Run when it succeeds, and when it does not. Real branches, generated. */
      onSuccess?: SourceAction[];
      onError?: SourceAction[];
      /** Variable that receives the error message, so a screen can show it. */
      errorInto?: string;
    };

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
  kind: "frame" | "text" | "image" | "input";
  /** For an input: the declared variable it reads from and writes to. */
  variable?: string;
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

/**
 * How a screen behaves as a *surface*, as opposed to what is drawn on it.
 *
 * A funnel is not one kind of page. A paywall pins its call to action and must
 * not scroll; a loader is full bleed; an email form has to get out of the way of
 * a keyboard. Those differ per screen, so they travel per screen — and they
 * travel in the artifact rather than in app config, because the app cannot know
 * the screen ids of every funnel it might be asked to render.
 *
 * Everything here is stated as **design intent**, never as a platform API. "Does
 * this screen scroll" is a question a designer can answer about the web too;
 * "which KeyboardAvoidingView behavior" is not, and stays in the app's own
 * config where changing it does not mean republishing every funnel.
 */
export type SourceScreenPresentation = {
  /**
   * The surface scrolls when its content is taller than the viewport.
   *
   * Default. A screen that says `false` is fixed — the shape a paywall wants,
   * where the button stays put and content is not expected to overflow.
   */
  scroll?: boolean;
  /**
   * Content runs under the system chrome rather than clearing it.
   *
   * The background always bleeds; this is about the *content*. Off by default,
   * because text under a notch is a bug far more often than it is a splash.
   */
  bleed?: boolean;
  /**
   * Status bar contrast. `auto` derives it from the screen's own background,
   * which is right often enough to be the default and wrong rarely enough to be
   * worth overriding by hand.
   */
  statusBar?: "auto" | "light" | "dark";
};

export type SourceScreen = {
  id: string;
  name?: string;
  frames: SourceFrame[];
  /** How this screen behaves as a surface. Absent means every default. */
  presentation?: SourceScreenPresentation;
  /** Presentation defaults when this frame is opened as an overlay. */
  overlay?: { position?: "center" | "bottom" | "top" | "side"; dim?: boolean; closeOnOutside?: boolean };
};

export type SourceFunnel = {
  id: string | number;
  version: string;
  entry: string;
  variables: VariableDecl[];
  screens: SourceScreen[];
  /**
   * Copy, by locale: `{ en: { "51.text": "…" } }`.
   *
   * A frame carries a `textKey` and never the words. Keeping them apart is what
   * lets a translation change rewrite one small object and recompile nothing —
   * and it is why a compiled module contains no literal copy at all.
   */
  locales?: Record<string, Record<string, string>>;
};
