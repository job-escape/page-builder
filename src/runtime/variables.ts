/**
 * What a variable's declared type *means*.
 *
 * Compiled funnel modules never contain these rules — they call in. A screen
 * emits `select("goal", "build_muscle")` and has no idea whether that assigns or
 * toggles; the declaration decides. So the single-select and multi-select
 * versions of a screen compile to byte-identical output, and a question can be
 * switched between them by editing one field in the manifest.
 *
 * Everything here is pure: same inputs, same output, no state, no side effects.
 * The stateful half (the store, persistence, analytics) sits above it.
 *
 * **No coercion, deliberately.** `"5"` never equals `5` here. JavaScript's
 * coercion rules are exactly wrong for this — a wrong branch in production is
 * the failure they produce, and it is silent. The compiler knows each variable's
 * declared type and is responsible for emitting correctly-typed literals, which
 * is a check it can make at build time rather than one a user discovers.
 */
import { isListType, type VariableDecl, type VariableValue } from "./types";

/** The empty value for a type: unanswered scalars are `null`, lists are `[]`. */
export function emptyFor(decl: VariableDecl): VariableValue {
  return isListType(decl) ? [] : null;
}

/** What a variable holds before anyone has answered anything. */
export function defaultFor(decl: VariableDecl): VariableValue {
  if (decl.default === undefined) return emptyFor(decl);
  // A declared default of `[]` must not be shared between funnels or sessions.
  return Array.isArray(decl.default) ? [...decl.default] : decl.default;
}

/** A list variable's current selections, tolerating null/undefined/wrong shapes. */
function asList(current: VariableValue | undefined): string[] {
  return Array.isArray(current) ? current : [];
}

/**
 * How many selections a list variable holds. `0` for anything else, including
 * unanswered — `count` is asked in conditions, and throwing there would turn a
 * missing answer into a broken funnel.
 */
export function count(current: VariableValue | undefined): number {
  return asList(current).length;
}

/**
 * Is `value` among the chosen ones — the `in` operator.
 *
 * This is what unifies single and multi select. A `string` variable is a set
 * holding at most one value; a `list` holds up to `max`. "Is my value among the
 * chosen ones" is the same question for both, so an option component asks it
 * once and is correct either way.
 */
export function has(
  decl: VariableDecl,
  current: VariableValue | undefined,
  value: string,
): boolean {
  if (isListType(decl)) return asList(current).includes(value);
  return current === value;
}

/** The selection cap is reached — no further values may be added. */
export function atMax(decl: VariableDecl, current: VariableValue | undefined): boolean {
  if (!isListType(decl) || decl.max === undefined) return false;
  return count(current) >= decl.max;
}

/** Enough selections to proceed. Drives a Continue button's disabled state. */
export function meetsMin(decl: VariableDecl, current: VariableValue | undefined): boolean {
  if (!isListType(decl)) return isSet(decl, current);
  return count(current) >= (decl.min ?? 0);
}

/** Answered at all. An empty string counts as unanswered; `false` and `0` do not. */
export function isSet(decl: VariableDecl, current: VariableValue | undefined): boolean {
  if (isListType(decl)) return count(current) > 0;
  if (current === null || current === undefined) return false;
  return current !== "";
}

export function isEmpty(decl: VariableDecl, current: VariableValue | undefined): boolean {
  return !isSet(decl, current);
}

/**
 * Apply a selection, returning the next value. Never mutates its input.
 *
 * - **string** — assign. Picking a different option replaces the answer, which
 *   is why nothing has to un-select the others: their `has` comparison simply
 *   stops matching.
 * - **list** — toggle. Tapping a chosen option removes it, which single-select
 *   cannot do and multi-select must.
 *
 * **Removing always works, even at the cap.** Otherwise a user who fills the
 * last slot is stuck with no way to change their mind.
 *
 * Selection order is preserved rather than sorted. It is occasionally meaningful
 * ("your primary equipment"), and a caller that wants order-insensitive
 * comparison can sort on read; sorting here would throw the information away.
 */
export function select(
  decl: VariableDecl,
  current: VariableValue | undefined,
  value: string,
): VariableValue {
  if (!isListType(decl)) return value;

  const chosen = asList(current);
  if (chosen.includes(value)) return chosen.filter((entry) => entry !== value);
  if (atMax(decl, chosen)) return chosen;
  return [...chosen, value];
}

/**
 * Seed every declared variable. Undeclared names are absent rather than
 * `undefined`, so a typo in a compiled module is visibly missing rather than
 * quietly falsy.
 */
export function initialState(table: Record<string, VariableDecl>): Record<string, VariableValue> {
  const state: Record<string, VariableValue> = {};
  Object.values(table).forEach((decl) => {
    state[decl.name] = defaultFor(decl);
  });
  return state;
}
