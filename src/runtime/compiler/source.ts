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
  /**
   * A variable, or a place inside one.
   *
   * `path` reads into what a request returned — `{ var: "plan", path:
   * "price_amount" }`, `{ var: "plans", path: "[0].name" }` — and is data, dots
   * and indexes, never an expression (`runtime/data`). The names `$item`,
   * `$index`, `$event` and `$payment` are the renderer's scope, not variables:
   * the item a repeat is drawing, and what a slot's trigger reported.
   */
  | { var: string; path?: string }
  | { lit: string | number | boolean | null }
  | { visitor: string }
  | { fn: ValueFunction; args: SourceValue[] }
  /**
   * A timer's seconds — left on a countdown, gone by on an elapsed one; `null`
   * before a `timer` step has started it. See `SourceAction`'s `timer`.
   *
   * Its own shape rather than a variable, because it is not an answer: nothing
   * sets it, it moves on its own, and it survives a republish that resets every
   * answer. Schema 1.5 — a 1.4 reader reads it as nothing.
   */
  | { timer: string };

/**
 * Functions that answer a value — `length(name)`, `money(amount, currency)`.
 *
 * The arithmetic ones exist for one job and are kept to it: a plan card shows
 * a price per day, a saving, a price in the visitor's currency. `find` picks one
 * object out of a list by a field — the plan a designer means, by its id.
 */
export type ValueFunction =
  | "length"
  | "count"
  | "lower"
  | "trim"
  | "upper"
  | "concat"
  | "money"
  | "divide"
  | "multiply"
  | "round"
  | "first"
  | "find"
  /** Schema 1.5 — a loader's and a timer's arithmetic, and how its number reads. */
  | "add"
  | "subtract"
  | "min"
  | "max"
  | "clamp"
  | "format";

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

/**
 * How a value moves between two points in time — an animation's pace, and a
 * frame's `transition`. The CSS names, because both renderers can say them:
 * the browser natively, React Native through the same cubic curves.
 */
export type MotionEasing = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";

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
  /**
   * Put a value in a variable.
   *
   * `value` is a literal, as it always was. `from` is a value read when the step
   * runs — the plan a card is drawing (`{ var: "$item" }`), a field of a
   * response, a price computed from two others — and wins when both are given.
   */
  | {
      type: "set";
      variable: string;
      value?: string | number | boolean | null;
      from?: SourceValue;
    }
  | {
      type: "show";
      target: string;
      as?: "replace" | "overlay";
      position?: "center" | "bottom" | "top" | "side";
      dim?: boolean;
      closeOnOutside?: boolean;
    }
  | { type: "close" }
  /**
   * The back gesture, as a step: closes the top overlay if one is open, else
   * returns to the screen the visitor came from (entrance played in reverse).
   * On the first screen, with nothing open, it does nothing. Schema 1.6.
   */
  | { type: "back" }
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
      /**
       * Payload entries read from values rather than named variables — a
       * literal, a field of the selected plan, `$item`. Beside `fields`, which
       * stays as it was; a key in both takes this one.
       */
      values?: Record<string, SourceValue>;
      /**
       * What the response puts in which variable, by variable name.
       *
       * The field is a path (`runtime/data`): `"userId"`, `"plans"`,
       * `"data.items[0].id"`. An empty string is the whole response.
       */
      into?: Record<string, string>;
      /**
       * The name this request answers to in conditions — `$req.<id>.status` is
       * `pending` while it runs, then `success` or `error`, so a screen can
       * draw its own loading and failure states. Absent, the action's name.
       */
      id?: string;
      /** Run when it succeeds, and when it does not. Real branches, generated. */
      onSuccess?: SourceAction[];
      onError?: SourceAction[];
      /** Variable that receives the error message, so a screen can show it. */
      errorInto?: string;
      /**
       * What a refusal puts in which variable, by variable name — `into` for the
       * failure. The path reads the refusal's body with its HTTP `status` and
       * the `message` beside it: `"action"` is what a checkout should do next
       * (`continue`, `card_error`, …), `"error"` the machine code. A failure
       * nothing answered — a timeout — has only `status` 0 and the message.
       * Tree only: the JS emitter drops it.
       */
      errorFields?: Record<string, string>;
      /**
       * `false` starts the request and goes straight on to the next step — a
       * loader that counts while the plan is being built. The request still
       * belongs to the screen: `onSuccess` and `onError` do not run for a
       * visitor who has left it. `waitFor` joins it again later. Schema 1.5.
       */
      wait?: boolean;
    }
  /**
   * Move a number variable to a value over time — a loader's 0 → 100, a bar
   * filling, a price counting up.
   *
   * Every frame in between is drawn, and the variable ends on exactly `to`.
   * `from` defaults to what the variable holds now. It belongs to the screen it
   * started on, like `wait`: leaving the screen stops it where it is and runs
   * nothing after it. `wait: false` starts it and goes on at once, so two bars
   * can fill together or a request can be sent alongside. Schema 1.5.
   */
  | {
      type: "animate";
      variable: string;
      to: SourceValue;
      from?: SourceValue;
      /** Milliseconds, 0 – 600 000. */
      ms: number;
      easing?: MotionEasing;
      wait?: boolean;
    }
  /**
   * Start a timer — a countdown that ends, or a clock counting up.
   *
   * Read with `{ timer: id }`. **It remembers its deadline**: a timer that is
   * started again — the screen reopened, the page reloaded, the funnel
   * republished — carries on from where it was rather than starting over, so an
   * offer that expires in ten minutes expires in ten minutes. `restart` is the
   * exception for a timer that is meant to begin again each time.
   *
   * Never blocks. `onEnd` runs when a countdown reaches zero while the visitor
   * is still on the screen that started it — at once, for one that had already
   * ended. Schema 1.5.
   */
  | {
      type: "timer";
      id: string;
      /** A countdown's length. Ignored by `elapsed`. */
      seconds?: number;
      mode?: "countdown" | "elapsed";
      restart?: boolean;
      onEnd?: SourceAction[];
    }
  /**
   * Hold the rest of this list until a request sent with `wait: false` has
   * answered — `success` or `error` — or until `seconds` have passed. Leaving
   * the screen ends it like `wait`. A request that is not running goes straight
   * on. Schema 1.5.
   */
  | { type: "waitFor"; request: string; seconds?: number }
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
 *
 * `select` belongs to a group of options: what happens once an answer has been
 * given, stated on the frame that owns the question rather than repeated on
 * every option under it. The option writes the answer; the group says what
 * follows. Authored on the group, run by the option — which is the whole
 * reason it is its own event rather than a tap on the group: a tap reaches a
 * group by bubbling, and one of the two renderers has no such thing.
 */
export type SourceEvent = "click" | "change" | "leave" | "load" | "select";

/**
 * A slot's own triggers — whatever the component in it reports.
 *
 * A checkout says `purchase_click`, `success`, `decline`; a component the next
 * host provides will say something else. The names are the component's
 * contract with the design, so they are strings rather than a closed list here.
 */
export type SlotTrigger = string;

export type SourceInteraction = {
  on: { event: SourceEvent | SlotTrigger };
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
    }
  /**
   * The prop *is* a value — a card's image from `$item`, a badge's colour from
   * the plan. The third shape, and additive: a reader that predates it sees an
   * unknown binding and keeps the static prop.
   */
  | { value: SourceValue };

/** Narrow to the case-list shape. The one place the two are told apart. */
export function isCaseBinding(
  binding: SourceBinding,
): binding is { cases: Array<{ when: SourceCondition; value: unknown }>; default: unknown } {
  return Array.isArray((binding as { cases?: unknown }).cases);
}

/** Narrow to the value shape. */
export function isValueBinding(binding: SourceBinding): binding is { value: SourceValue } {
  return (
    typeof binding === "object" &&
    binding !== null &&
    "value" in binding &&
    !("when" in binding) &&
    !("cases" in binding)
  );
}

export type SourceFrame = {
  id: string;
  name?: string;
  /** null at the top level of a screen. */
  parent: string | null;
  /**
   * `slot` is the one kind the design does not draw: the host renders the
   * component `slot` names (a checkout) with the frame's props, and the
   * component's reports run the frame's interactions of the same name.
   */
  kind: "frame" | "text" | "image" | "input" | "slot";
  /** For a slot: the host component it asks for — `"checkout"`. */
  slot?: string;
  /**
   * For a frame: draw the children once per entry of a list.
   *
   * The list is a value — usually a variable a request filled. Inside, `$item`
   * is the entry and `$index` its position, in text params, bindings,
   * conditions and the interactions of everything under the frame. The frame
   * itself is drawn once, as the container.
   */
  repeat?: { list: SourceValue };
  /**
   * For a text frame: what its copy's `{placeholders}` are filled with.
   *
   * The words stay in the locale table — `"{price} per week"` — and only the
   * values come from here, so a translated card still shows the live price.
   */
  params?: Record<string, SourceValue>;
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
