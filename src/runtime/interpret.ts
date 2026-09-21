/**
 * Reading a tree's conditions and actions — the half `emit.ts` writes as JavaScript.
 *
 * Every branch here has a counterpart in the emitter, and the two must agree
 * exactly: `emitCondition` produces `state.has(...)` and this calls
 * `state.has(...)`; the emitter's `and` over an empty list is `true` and
 * `every` over an empty array is `true`. The tests hold both to the same
 * fixtures, because "the tree renders slightly differently" is a bug that hides
 * for months and then shows up as one funnel converting worse than the other.
 *
 * **No React, no DOM, no `ui`.** Which is the point: a native runtime gets this
 * file unchanged, and only the drawing differs. Nothing here is an interpreter
 * in the expensive sense either — the vocabulary is eleven conditions and a
 * handful of actions, closed, so this is a switch, not a language.
 */
import type { SourceAction, SourceCondition, SourceValue } from "./compiler/source";
import { pathGet } from "./data";
import { call, check, compare } from "./functions";
import { openLink } from "./link";
import { durationOf, ease, playFrames } from "./motion";
import type { TimerBook } from "./timers";
import type { VariableValue } from "./types";
import type { request } from "./request";
import { analytics, track, type AnalyticsProperties } from "./track";

/** The reading half of the store — everything a condition can ask. */
export type ConditionState = {
  get: (name: string) => VariableValue;
  has: (name: string, value: string) => boolean;
  count: (name: string) => number;
  isSet: (name: string) => boolean;
  isEmpty: (name: string) => boolean;
  atMax: (name: string) => boolean;
  meetsMin: (name: string) => boolean;
  /**
   * What is true of the visitor, rather than of anything they answered.
   *
   * **Three helpers rather than one reader**, and that is §9.8a's rule applied
   * where it matters most. The hard part of a visitor test is never the
   * comparison — it is the edges: a host that cannot answer, a fact that is
   * present but empty, whether `has` may coerce a number to a string. Handing
   * out the raw value would put those decisions in the emitted module, frozen
   * into every artifact ever published; behind helpers they are one file here,
   * patchable centrally, and identical in every funnel.
   *
   * It is also what keeps this file and `emitCondition` honest. The emitter
   * writes `state.visitorEq(...)` and `evaluate` calls `state.visitorEq(...)`,
   * so the tree renderer and the compiled module cannot disagree about an edge
   * — which is exactly the class of bug the parity fixtures exist to catch and
   * the one that hides for months.
   *
   * **The host answers all three, not the store.** Everything else in here
   * reads answers the visitor gave, which the funnel owns. Where somebody came
   * from, what they are on, which campaign brought them are the *page's* to
   * know — they arrive on the request, in the URL, or from the device — and an
   * artifact that fetched them itself would need an address and a key it must
   * not carry (§9.6a).
   */
  visitorIsSet: (property: string) => boolean;
  visitorEq: (property: string, value: unknown) => boolean;
  visitorHas: (property: string, value: unknown) => boolean;
  /**
   * A visitor fact's raw value, for a function to read — `lower(visitor.os)`.
   *
   * Optional, so a host state written before functions existed still type-checks;
   * without it a fact reads as unknown, which is what `visitorIsSet` says too.
   */
  visitorValue?: (property: string) => string | number | boolean | null;
  /**
   * Mark a request's progress — `$req.<id>.status`. Optional, so a host state
   * written before requests had a status still runs; without it the status
   * simply stays `idle`.
   */
  setStatus?: (id: string, status: "idle" | "pending" | "success" | "error", error?: string) => void;
  /** A request's progress, for `waitFor`. Optional like `setStatus`. */
  status?: (id: string) => "idle" | "pending" | "success" | "error";
  /**
   * A timer's whole seconds — `{ timer: id }`. Optional, so a host state
   * written before timers existed still type-checks; without it a timer reads
   * as nothing.
   */
  timer?: (id: string) => number | null;
  /** The clock, for `{ now }`. Optional: without it the device's own is read. */
  now?: () => number;
};

/** A value a function or a comparison reads, resolved against the state. */
export function valueOf(value: SourceValue, state: ConditionState): unknown {
  if ("var" in value) return pathGet(state.get(value.var), value.path);
  if ("lit" in value) return value.lit;
  if ("visitor" in value) return state.visitorValue?.(value.visitor) ?? null;
  if ("fn" in value) return call(value.fn, value.args.map((arg) => valueOf(arg, state)));
  if ("timer" in value) return state.timer?.(value.timer) ?? null;
  if ("now" in value) return state.now?.() ?? Date.now();
  return null;
}

/**
 * An analytics step's properties, each read now — the answer this visitor gave,
 * not the one the designer saw. The emitter writes the same reads. A bare value
 * where a `SourceValue` belongs is sent as written rather than thrown on: a
 * property is never worth the rest of the list.
 */
export function propertiesOf(
  properties: Record<string, SourceValue> | undefined,
  state: ConditionState,
): AnalyticsProperties {
  const read: AnalyticsProperties = {};
  Object.entries(properties ?? {}).forEach(([name, value]) => {
    read[name] = value !== null && typeof value === "object" ? valueOf(value, state) : (value ?? null);
  });
  return read;
}

export type ActionContext = {
  state: ConditionState & {
    set: (name: string, value: VariableValue) => void;
    select: (name: string, value: string) => void;
    /** One frame of an `animate` — see `FunnelStore.setTransient`. Falls back to `set`. */
    setTransient?: (name: string, value: VariableValue) => void;
    /** The funnel's timers. Without them a `timer` step starts nothing. */
    timers?: TimerBook;
    /** A timer started or ended — redraw what reads it. */
    tick?: () => void;
  };
  nav: {
    show: (target: string, presentation?: Record<string, unknown>) => void;
    close: () => void;
    /** See `FunnelNav.back`. Optional: a host without it closes the top overlay instead. */
    back?: () => boolean;
    /** See `FunnelNav.wait`. Optional, so a host that has none still runs. */
    wait?: (seconds: number) => Promise<boolean>;
    /** See `FunnelNav.frames`. Optional: without it an `animate` still arrives, on a plain clock. */
    frames?: (ms: number, onFrame: (progress: number) => void) => Promise<boolean>;
    /** See `FunnelNav.alive`. Optional: without it anything started detached is assumed still wanted. */
    alive?: () => () => boolean;
  };
  req: typeof request;
  /**
   * Fires the pixels for a conversion. Optional: without it a `track` step goes
   * through the configured tracker (`configureTracking`) — the same one a
   * compiled module calls.
   */
  track?: (event: string) => void;
  /**
   * Sends an analytics event. Optional, like `track`: without it an `analytics`
   * step goes through the configured sender (`configureTracking`).
   */
  analytics?: (event: string, properties: AnalyticsProperties) => void;
};

/**
 * Never coerces. `"5"` is not `5` here, exactly as in the emitted `===` — the
 * compiler knows each variable's declared type and is responsible for emitting
 * correctly-typed literals, and a silently wrong branch in production is the
 * failure that rule exists to prevent.
 */
export function evaluate(condition: SourceCondition, state: ConditionState): boolean {
  switch (condition.op) {
    case "has":
      return state.has(condition.variable, condition.value);
    case "eq":
      return state.get(condition.variable) === condition.value;
    case "neq":
      return state.get(condition.variable) !== condition.value;
    case "isSet":
      return state.isSet(condition.variable);
    case "isEmpty":
      return state.isEmpty(condition.variable);
    case "atMax":
      return state.atMax(condition.variable);
    case "meetsMin":
      return state.meetsMin(condition.variable);
    case "count": {
      const held = state.count(condition.variable);
      if (condition.cmp === "gte") return held >= condition.value;
      if (condition.cmp === "lte") return held <= condition.value;
      return held === condition.value;
    }
    // The same three calls the emitter writes, in the same order — see the note
    // on `visitorIsSet` above for why that is not a coincidence.
    case "visitor":
      if (condition.cmp === "isSet") return state.visitorIsSet(condition.property);
      if (condition.cmp === "isEmpty") return !state.visitorIsSet(condition.property);
      if (condition.cmp === "eq") return state.visitorEq(condition.property, condition.value);
      if (condition.cmp === "neq") return !state.visitorEq(condition.property, condition.value);
      return state.visitorHas(condition.property, condition.value);
    // The same functions the emitted module reaches through `state.check` and
    // `state.compare` — one definition, two callers. See `runtime/functions`.
    case "fn":
      return check(
        condition.fn,
        condition.args.map((arg) => valueOf(arg, state)),
      );
    case "cmp":
      return compare(valueOf(condition.left, state), condition.cmp, valueOf(condition.right, state));
    case "not":
      return !evaluate(condition.of, state);
    case "and":
      return condition.of.every((inner) => evaluate(inner, state));
    case "or":
      return condition.of.some((inner) => evaluate(inner, state));
    default:
      // Total, like the emitter: an unknown op is simply false rather than a
      // thrown error in front of a visitor.
      return false;
  }
}

/**
 * Run a node's actions, in order, awaiting anything that reaches a backend.
 *
 * Sequential rather than concurrent because the emitted handler is: a `set`
 * before a `show` has to happen before the navigation, and firing them together
 * would make the order a race.
 */
/**
 * How a `show` presents its screen — the four fields, or nothing at all.
 *
 * Lifted out of the switch because a text link says the same thing: a run
 * carrying `link` navigates exactly as a button carrying a `show` action does,
 * and the two reading the same fields through different code is how a link ends
 * up opening full-screen where the button opened a sheet. `TextLink` is
 * deliberately shaped to fit here.
 *
 * `undefined` rather than an empty object when nothing is set, because that is
 * what `nav.show` reads as "however this screen presents itself" — an empty
 * object would be an explicit answer of "no overlay" and would flatten one.
 */
export function showPresentation(link: {
  as?: "replace" | "overlay";
  position?: "center" | "bottom" | "top" | "side" | "fill";
  dim?: boolean;
  closeOnOutside?: boolean;
}): Record<string, unknown> | undefined {
  const presentation: Record<string, unknown> = {};
  if (link.as) presentation.as = link.as;
  if (link.position) presentation.position = link.position;
  if (link.dim !== undefined) presentation.dim = link.dim;
  if (link.closeOnOutside !== undefined) presentation.closeOnOutside = link.closeOnOutside;
  return Object.keys(presentation).length ? presentation : undefined;
}

/** Seconds as a timer can use them: never negative, never NaN. */
const secondsOf = (value: unknown): number => Math.max(0, Number(value) || 0);

/**
 * A `wait`, through the host's `nav.wait` when it has one.
 *
 * A host built before waits existed still waits, on a plain timer, rather than
 * skipping the pause and running what follows at once.
 */
function pause(ctx: ActionContext, seconds: number): Promise<boolean> {
  if (ctx.nav.wait) return ctx.nav.wait(seconds);
  return new Promise((resolve) => {
    setTimeout(() => resolve(true), seconds * 1000);
  });
}

/**
 * Resolves `false` when a `wait` found its screen gone — and then everything
 * after it, in this list and in every list around it, is left undone. That is
 * what the emitted `return` does, reached the same way.
 */
export async function run(actions: SourceAction[], ctx: ActionContext): Promise<boolean> {
  for (const action of actions) {
    switch (action.type) {
      case "select":
        ctx.state.select(action.variable, action.value);
        break;

      case "set":
        // A value read now wins over the literal — see `SourceAction`'s `set`.
        ctx.state.set(
          action.variable,
          (action.from ? valueOf(action.from, ctx.state) : (action.value ?? null)) as VariableValue,
        );
        break;

      case "close":
        ctx.nav.close();
        break;

      case "link":
        // Opened now, from the tap, and never in the way of what follows —
        // see `runtime/link`.
        openLink(action.url, action.as, (name) => ctx.state.get(name));
        break;

      case "back":
        if (ctx.nav.back) ctx.nav.back();
        else ctx.nav.close();
        break;

      case "show": {
        ctx.nav.show(action.target, showPresentation(action));
        break;
      }

      case "conditional": {
        // First match wins and the rest are skipped — the emitted `if` /
        // `else if` chain, and a branch with no `when` is its `else`.
        const branch = action.branches.find((candidate) => {
          return !candidate.when || evaluate(candidate.when, ctx.state);
        });
        // eslint-disable-next-line no-await-in-loop
        if (branch && !(await run(branch.do, ctx))) return false;
        break;
      }

      case "submit": {
        if (action.wait === false) {
          /*
            Sent, and not waited on. What follows it runs now; what hangs off it
            runs when it answers — but only for a visitor still on this screen,
            the same promise a `wait` makes about what comes after it.
          */
          const alive = ctx.nav.alive?.() ?? (() => true);
          void send(action, ctx, alive);
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        if (!(await send(action, ctx, () => true))) return false;
        break;
      }

      case "animate": {
        const moving = animateValue(action, ctx);
        if (action.wait === false) {
          void moving;
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        if (!(await moving)) return false;
        break;
      }

      case "timer":
        // Never blocks — see `SourceAction`'s `timer`.
        void startTimer(action, ctx);
        break;

      case "waitFor": {
        // eslint-disable-next-line no-await-in-loop
        if (!(await waitForRequest(action, ctx))) return false;
        break;
      }

      case "waitUntil": {
        // eslint-disable-next-line no-await-in-loop
        if (!(await waitUntilTrue(action, ctx))) return false;
        break;
      }

      case "wait":
        // eslint-disable-next-line no-await-in-loop
        if (!(await pause(ctx, secondsOf(action.seconds)))) return false;
        break;

      case "track":
        // Not awaited, and never in the way: see `runtime/track`.
        (ctx.track ?? track)(action.event);
        break;

      case "analytics":
        // Read now, sent without waiting — see `runtime/track`.
        (ctx.analytics ?? analytics)(action.event, propertiesOf(action.properties, ctx.state));
        break;

      default:
        // An action this build does not know is skipped, not thrown. A funnel
        // published against a newer schema must still run the parts this
        // renderer understands.
        break;
    }
  }
  return true;
}

/**
 * A `submit`, sent — resolves `false` when a step it ran found its screen gone.
 *
 * `alive` is asked before anything that hangs off the answer runs: always yes
 * for a request that was waited on (the screen cannot have changed under a
 * handler that is still awaiting it), and the screen's own answer for one sent
 * with `wait: false`.
 */
async function send(
  action: Extract<SourceAction, { type: "submit" }>,
  ctx: ActionContext,
  alive: () => boolean,
): Promise<boolean> {
  const requestId = action.id ?? action.action;
  try {
    const payload: Record<string, unknown> = {};
    Object.entries(action.fields ?? {}).forEach(([key, variable]) => {
      // Read at click time, so no answer is baked into the artifact.
      payload[key] = ctx.state.get(variable);
    });
    Object.entries(action.values ?? {}).forEach(([key, value]) => {
      payload[key] = valueOf(value, ctx.state);
    });

    ctx.state.setStatus?.(requestId, "pending");
    const response = await ctx.req(action.action, payload);

    Object.entries(action.into ?? {}).forEach(([variable, field]) => {
      // A path into the response; an empty one is the response itself.
      ctx.state.set(variable, pathGet(response, field) as VariableValue);
    });
    ctx.state.setStatus?.(requestId, "success");
    if (!alive()) return false;
    return await run(action.onSuccess ?? [], ctx);
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    ctx.state.setStatus?.(requestId, "error", message);
    if (action.errorInto) {
      ctx.state.set(action.errorInto, message);
    }
    if (action.errorFields) {
      const refused = failure as { body?: unknown; status?: unknown };
      const body =
        refused.body !== null && typeof refused.body === "object" ? (refused.body as Record<string, unknown>) : {};
      const answer = { ...body, status: typeof refused.status === "number" ? refused.status : 0, message };
      Object.entries(action.errorFields).forEach(([variable, field]) => {
        ctx.state.set(variable, (pathGet(answer, field) ?? null) as VariableValue);
      });
    }
    if (!alive()) return false;
    return run(action.onError ?? [], ctx);
  }
}

/** A value read as a number, or `fallback`. */
const numberOf = (value: unknown, fallback: number): number => {
  const read = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(read) ? read : fallback;
};

/**
 * An `animate`, played — `true` when it arrived, `false` when its screen went.
 *
 * Every frame goes through `setTransient` and the arrival through `set`, so the
 * answers cookie and the host hear about one value rather than sixty a second.
 */
async function animateValue(action: Extract<SourceAction, { type: "animate" }>, ctx: ActionContext): Promise<boolean> {
  const { variable } = action;
  const from = numberOf(action.from ? valueOf(action.from, ctx.state) : ctx.state.get(variable), 0);
  const to = numberOf(valueOf(action.to, ctx.state), from);
  const ms = durationOf(action.ms);
  const frame = (progress: number): void => {
    const value = from + (to - from) * ease(action.easing, progress);
    if (progress >= 1) return;
    (ctx.state.setTransient ?? ctx.state.set)(variable, value);
  };
  const arrived = ctx.nav.frames ? await ctx.nav.frames(ms, frame) : await playFrames(ms, frame).done;
  if (!arrived) return false;
  ctx.state.set(variable, to);
  return true;
}

/**
 * A `timer`, started — or found already running and left to it.
 *
 * The book decides whether it exists (see `TimerBook.start`); this schedules
 * `onEnd` against the screen that asked, through `nav.wait`, so a countdown that
 * ends after the visitor has moved on runs nothing.
 */
async function startTimer(action: Extract<SourceAction, { type: "timer" }>, ctx: ActionContext): Promise<void> {
  const book = ctx.state.timers;
  if (!book || !action.id) return;
  const alive = ctx.nav.alive?.() ?? (() => true);
  await book.ready;
  if (!alive()) return;
  book.start(action.id, { mode: action.mode, seconds: action.seconds, restart: action.restart });
  ctx.state.tick?.();
  if (action.mode === "elapsed" || !action.onEnd?.length) return;
  const left = book.remainingMs(action.id) ?? 0;
  if (left > 0 && !(await pause(ctx, left / 1000))) return;
  ctx.state.tick?.();
  await run(action.onEnd, ctx);
}

/**
 * A `waitUntil` — `false` if the screen went while it was waiting.
 *
 * Polled rather than subscribed: what it asks may read the clock, which changes
 * without anything being written, and a tenth of a second is finer than any
 * countdown a visitor can read.
 */
async function waitUntilTrue(action: Extract<SourceAction, { type: "waitUntil" }>, ctx: ActionContext): Promise<boolean> {
  const limit = action.seconds === undefined ? Infinity : Math.max(0, Number(action.seconds) || 0) * 1000;
  let waited = 0;
  const step = 0.1;
  while (!evaluate(action.when, ctx.state) && waited < limit) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await pause(ctx, step))) return false;
    waited += step * 1000;
  }
  return true;
}

/** A `waitFor` — `false` if the screen went while it was waiting. */
async function waitForRequest(action: Extract<SourceAction, { type: "waitFor" }>, ctx: ActionContext): Promise<boolean> {
  const limit = action.seconds === undefined ? Infinity : Math.max(0, Number(action.seconds) || 0) * 1000;
  let waited = 0;
  const step = 0.05;
  while (ctx.state.status?.(action.request) === "pending" && waited < limit) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await pause(ctx, step))) return false;
    waited += step * 1000;
  }
  return true;
}
