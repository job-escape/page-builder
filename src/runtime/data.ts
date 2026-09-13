/**
 * Reading into a value the backend handed back — `plans[0].price_amount`.
 *
 * A funnel's answers are scalars, and until a request could return a list of
 * plans nothing needed more. A plan is an object and a catalogue is a list of
 * them, and a design has to be able to say "this card shows the plan's price"
 * without the artifact carrying code. So a value is read by a *path*, and a path
 * is data: dots and indexes, nothing that evaluates.
 *
 * No React and no DOM, like the rest of the semantics, so native reads it too.
 */

/** A step in a path: a key into an object, or an index into a list. */
type Step = string | number;

/** `data.plans[0].price` → `["data", "plans", 0, "price"]`. `a.0` reads an index too. */
export function pathSteps(path: string): Step[] {
  const steps: Step[] = [];
  path.split(".").forEach((segment) => {
    if (segment === "") return;
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment);
    if (!match) {
      steps.push(segment);
      return;
    }
    const [, key, indexes] = match;
    if (key) steps.push(/^\d+$/.test(key) ? Number(key) : key);
    (indexes.match(/\d+/g) ?? []).forEach((index) => steps.push(Number(index)));
  });
  return steps;
}

/**
 * The value at a path, or `null` when any step is missing.
 *
 * `null` rather than `undefined` because that is what an unanswered variable
 * reads as everywhere else, and a card whose price is missing should draw the
 * same as a question nobody answered — never throw in front of a visitor.
 * An empty path is the value itself.
 */
export function pathGet(value: unknown, path: string | undefined): unknown {
  if (!path) return value ?? null;
  let current: unknown = value;
  for (const step of pathSteps(path)) {
    if (current === null || current === undefined) return null;
    if (typeof step === "number") {
      if (!Array.isArray(current)) return null;
      current = current[step];
    } else {
      if (typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[step];
    }
  }
  return current ?? null;
}

/**
 * The names a renderer answers itself, never the store.
 *
 * `$item` and `$index` inside a repeat; `$event` (and `$payment`, its name on a
 * checkout) inside a slot's trigger. They are scope, not state: nothing sets
 * them, nothing persists them, and they mean something only while the node that
 * provides them is being drawn or its trigger is running.
 */
export const SCOPE_NAMES = ["$item", "$index", "$event", "$payment"] as const;

export type Scope = Partial<Record<(typeof SCOPE_NAMES)[number], unknown>>;

export const isScopeName = (name: string): name is (typeof SCOPE_NAMES)[number] =>
  (SCOPE_NAMES as readonly string[]).includes(name);
