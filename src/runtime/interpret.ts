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
import type { SourceAction, SourceCondition } from "./compiler/source";
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
};

export type ActionContext = {
  state: ConditionState & {
    set: (name: string, value: VariableValue) => void;
    select: (name: string, value: string) => void;
  };
  nav: { show: (target: string, presentation?: Record<string, unknown>) => void; close: () => void };
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
export async function run(actions: SourceAction[], ctx: ActionContext): Promise<void> {
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
        const presentation: Record<string, unknown> = {};
        if (action.as) presentation.as = action.as;
        if (action.position) presentation.position = action.position;
        if (action.dim !== undefined) presentation.dim = action.dim;
        if (action.closeOnOutside !== undefined) presentation.closeOnOutside = action.closeOnOutside;
        ctx.nav.show(
          action.target,
          Object.keys(presentation).length ? presentation : undefined,
        );
        break;
      }

      case "conditional": {
        // First match wins and the rest are skipped — the emitted `if` /
        // `else if` chain, and a branch with no `when` is its `else`.
        const branch = action.branches.find((candidate) => {
          return !candidate.when || evaluate(candidate.when, ctx.state);
        });
        // eslint-disable-next-line no-await-in-loop
        if (branch) await run(branch.do, ctx);
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
          await run(action.onSuccess ?? [], ctx);
        } catch (failure) {
          if (action.errorInto) {
            const message = failure instanceof Error ? failure.message : String(failure);
            ctx.state.set(action.errorInto, message);
          }
          // eslint-disable-next-line no-await-in-loop
          await run(action.onError ?? [], ctx);
        }
        break;
      }

      default:
        // An action this build does not know is skipped, not thrown. A funnel
        // published against a newer schema must still run the parts this
        // renderer understands.
        break;
    }
  }
}
