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
 * in the expensive sense either — the vocabulary is eleven conditions and six
 * actions, closed, so this is a switch, not a language.
 */
import type { SourceAction, SourceCondition, SourceValue } from "./compiler/source";
import { call, check, compare } from "./functions";
import type { VariableValue } from "./types";
import type { request } from "./request";

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
};

/** A value a function or a comparison reads, resolved against the state. */
export function valueOf(value: SourceValue, state: ConditionState): unknown {
  if ("var" in value) return state.get(value.var);
  if ("lit" in value) return value.lit;
  if ("visitor" in value) return state.visitorValue?.(value.visitor) ?? null;
  if ("fn" in value) return call(value.fn, value.args.map((arg) => valueOf(arg, state)));
  return null;
}

export type ActionContext = {
  state: ConditionState & {
    set: (name: string, value: VariableValue) => void;
    select: (name: string, value: string) => void;
  };
  nav: {
    show: (target: string, presentation?: Record<string, unknown>) => void;
    close: () => void;
    /** See `FunnelNav.wait`. Optional, so a host that has none still runs. */
    wait?: (seconds: number) => Promise<boolean>;
  };
  req: typeof request;
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
  position?: "center" | "bottom" | "top" | "side";
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
        ctx.state.set(action.variable, action.value);
        break;

      case "close":
        ctx.nav.close();
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
        try {
          const payload: Record<string, unknown> = {};
          Object.entries(action.fields ?? {}).forEach(([key, variable]) => {
            // Read at click time, so no answer is baked into the artifact.
            payload[key] = ctx.state.get(variable);
          });

          // eslint-disable-next-line no-await-in-loop
          const response = await ctx.req(action.action, payload);

          Object.entries(action.into ?? {}).forEach(([variable, field]) => {
            ctx.state.set(variable, (response[field] ?? null) as VariableValue);
          });
          // eslint-disable-next-line no-await-in-loop
          if (!(await run(action.onSuccess ?? [], ctx))) return false;
        } catch (failure) {
          if (action.errorInto) {
            const message = failure instanceof Error ? failure.message : String(failure);
            ctx.state.set(action.errorInto, message);
          }
          // eslint-disable-next-line no-await-in-loop
          if (!(await run(action.onError ?? [], ctx))) return false;
        }
        break;
      }

      case "wait":
        // eslint-disable-next-line no-await-in-loop
        if (!(await pause(ctx, secondsOf(action.seconds)))) return false;
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
