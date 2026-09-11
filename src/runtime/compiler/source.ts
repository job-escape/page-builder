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

/**
 * Something a function or a comparison reads.
 *
 * An answer, a literal, a fact about the visitor, or a value computed from one
 * of those by a function the runtime knows. Data, never an expression: a
 * published funnel is a public file read by two renderers, and a string of code
 * in it would be a language each of them implements a little differently. The
 * functions are a closed list (`runtime/functions`) and adding one is a release
 * of this package, which is the point.
 */
export type SourceValue =
  | { var: string }
  | { lit: string | number | boolean | null }
  | { visitor: string }
  | { fn: ValueFunction; args: SourceValue[] };

/** Functions that answer a value — `length(name)`. */
export type ValueFunction = "length" | "count" | "lower" | "trim";

/** Functions that answer yes or no — `validEmail(email)`. */
export type CheckFunction =
  | "validEmail"
  | "validPhone"
  | "validUrl"
  | "isNumber"
  | "isFilled"
  | "isEmpty"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "matches";

/** How two values are compared. Ordering reads numbers, numeric text included. */
export type Comparison = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";

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
  /**
   * Something true of the visitor rather than of anything they answered.
   *
   * Every other leaf reads a **variable** — a value the visitor produced by
   * using the funnel. This one reads a *fact about them* that was true before
   * they arrived: where they came from, what they are on, which campaign
   * brought them. A funnel cannot ask for those, so they are not variables and
   * giving them a variable's name would mean a screen could `set` one.
   *
   * **One op rather than a second spelling of `eq`, `neq` and `has`.** The
   * alternative — the same three ops with a `visitor` field where `variable`
   * goes — would make every reader of a leaf (this file, the emitter, the
   * interpreter, the manifest walk) ask which of the two it was holding, at
   * each of them. One op asks once.
   *
   * `property` is a column name, and never a value the artifact interprets: the
   * host is what knows how to answer it. See `ConditionState.visitor`.
   */
  | {
      op: "visitor";
      property: string;
      cmp: "eq" | "neq" | "has" | "isSet" | "isEmpty";
      value?: string | number | boolean;
    }
  /**
   * A check the runtime knows how to make — `validEmail(email)`,
   * `contains(goal, "career")`. See `runtime/functions` for what each means,
   * which is the one place it is decided.
   */
  | { op: "fn"; fn: CheckFunction; args: SourceValue[] }
  /** Two values compared — `length(name) >= 2`, `age > 17`. */
  | { op: "cmp"; cmp: Comparison; left: SourceValue; right: SourceValue }
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
    }
  /**
   * Hold the rest of this list for a number of seconds.
   *
   * It belongs to the screen it started on. If the visitor has left that screen
   * by the time it is up, nothing after it runs: a loader that waits and then
   * moves on must not move somebody on from a screen they already left. The
   * host's `nav.wait` is what knows, which is why this is a step and not a timer
   * a renderer schedules for itself.
   */
  | { type: "wait"; seconds: number }
  /**
   * Tell the ad platforms a conversion happened — `lead`, `purchase`.
   *
   * A conversion's *key*, never a pixel id: the ids are the host's (see
   * `runtime/track`), so the artifact carries no account of anybody's. Fired
   * and not awaited — nothing after it waits on an ad platform.
   */
  | { type: "track"; event: string }
  /**
   * Send the funnel's own analytics an event, and what it carries.
   *
   * Each property is a value as a condition reads one — a variable, a literal,
   * a visitor fact — resolved when the step runs, so `goal: { var: "goal" }`
   * sends the answer this visitor gave rather than one frozen into the artifact.
   * Where it goes is the host's (see `runtime/track`); fired and not awaited,
   * like `track`.
   */
  | { type: "analytics"; event: string; properties?: Record<string, SourceValue> };

/**
 * What sets an interaction off.
 *
 * `click` is a tap, on anything. `change` and `leave` belong to a field: every
 * keystroke, and the moment the visitor moves on from it — which is when a
 * form checks what was typed. An event a frame cannot raise is simply never
 * raised, so a `leave` on a picture does nothing rather than failing.
 *
 * `load` belongs to a screen's own frame: the moment the screen opens, every
 * time it does. It travels in the manifest rather than in the screen — see
 * `ScreenIndex.enter` — because opening is the funnel's moment, not a node's.
 */
export type SourceEvent = "click" | "change" | "leave" | "load";

export type SourceInteraction = {
  on: { event: SourceEvent };
  do: SourceAction[];
};

/**
 * A prop whose value is decided at render — the mechanism behind a "selected"
 * variant, and behind a design drawn differently per device, platform or
 * language.
 *
 * Two shapes, and the pair is the whole point.
 *
 * `{ when, whenTrue, whenFalse }` is the original and is not going anywhere:
 * every artifact published before this exists carries it, and a published
 * artifact outlives the application that authored it. Readers must keep
 * understanding it forever.
 *
 * `{ cases, default }` is what one condition per prop could not say. A funnel
 * whose heading is one size on iOS, another in German and a third in German on
 * iOS has three answers for one key, and a ternary has room for one — so the
 * editor had to pick which override shipped and drop the rest. Cases are tried
 * in order and the first match wins, which makes the *editor* the thing that
 * decides precedence rather than the format deciding it by having no room.
 */
export type SourceBinding =
  | { when: SourceCondition; whenTrue: unknown; whenFalse: unknown }
  | {
      /** Tried in order; the first whose condition holds decides the value. */
      cases: Array<{ when: SourceCondition; value: unknown }>;
      /** What the prop is when no case matches. The unconditional value. */
      default: unknown;
    };

/** Narrow to the case-list shape. The one place the two are told apart. */
export function isCaseBinding(
  binding: SourceBinding,
): binding is { cases: Array<{ when: SourceCondition; value: unknown }>; default: unknown } {
  return Array.isArray((binding as { cases?: unknown }).cases);
}

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
  /**
   * Whether this frame is rendered at all.
   *
   * Presence, as a condition — the thing a bound prop cannot express. A paywall
   * shows native purchase rows on iOS and a card form on the web; both live on
   * one artboard in the editor, and each context hides what it does not use.
   * Before this the editor could draw that and the preview could run it, but
   * publishing quietly resolved it away, so the funnel shipped both.
   *
   * A frame that is not rendered takes its children with it, which falls out of
   * the tree rather than being arranged: nothing draws inside something that is
   * not drawn. Absent means "always", so nothing that never had one changes.
   */
  when?: SourceCondition;
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
  /**
   * How this screen arrives when it is navigated to — see `ScreenTransition`.
   * Absent is `none`: the screen swaps at once, as every funnel did before.
   */
  transition?: ScreenTransition;
};

/**
 * A screen's entrance. `fade` fades it in; `slide` moves it a short way and
 * fades; `push` slides it in from the edge. Going back plays `slide` and `push`
 * the other way, so a visitor can feel which way they went.
 */
export type ScreenTransition = "none" | "fade" | "slide" | "push";

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
