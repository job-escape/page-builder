import { evaluate, type ConditionState } from "../interpret";

import type {
  EventFilter,
  FilterValue,
  HeardEvent,
  PopupRule,
  RuleCondition,
  RuleGroup,
  RuleNode,
  VisitorFacts,
} from "./types";

/**
 * Whether a popup rule's conditions hold, from what this page knows.
 *
 * - **Something they did** (`subject.of === "event"`): the event was heard in
 *   this session, by an occurrence whose properties pass every `where` test.
 *   How many times and over what period are not evaluated yet — any one
 *   matching occurrence satisfies the condition.
 * - **About the visitor** (`of === "user"`): compared against the visitor facts
 *   (GrowthBook attributes — country, os, utm_*, language…). Case-insensitive,
 *   because country codes and campaign tags arrive in either case.
 * - **An answer they gave** (`of === "variable"`): there are no funnel answers
 *   outside a funnel, so it never matches.
 *
 * An empty group matches: a rule with no conditions matches every time, which
 * is what the editor says about it.
 */

const isGroup = (node: RuleNode): node is RuleGroup => "all" in node || "any" in node;

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim().toLowerCase();

/** The fact names the editor offers, and the names the host actually has. */
const FACT_ALIASES: Record<string, string[]> = {
  country: ["country", "country_code"],
  country_code: ["country_code", "country"],
};

function factOf(facts: VisitorFacts, property: string): unknown {
  const names = FACT_ALIASES[property] ?? [property];
  for (const name of names) {
    const value = facts[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function compare(
  op: EventFilter["op"] | RuleCondition["op"],
  actual: unknown,
  expected: FilterValue,
) {
  const left = text(actual);
  const right = text(expected);
  if (op === "has") return right === "" ? left !== "" : left.includes(right);
  if (op === "eq") return left === right;
  if (op === "neq") return left !== right;
  return false;
}

function passesFilter(filter: EventFilter, props: Record<string, unknown>): boolean {
  const actual = props[filter.property];
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  if (values.length === 0 || (values.length === 1 && text(values[0]) === "")) return true;
  // `is not` over several values is "none of"; everything else is "any of".
  if (filter.op === "neq") return values.every(value => compare("neq", actual, value));
  return values.some(value => compare(filter.op, actual, value));
}

function holds(
  condition: RuleCondition,
  facts: VisitorFacts,
  heard: readonly HeardEvent[],
) {
  const subject = condition.subject ?? {
    of: "variable" as const,
    name: condition.variable ?? "",
  };

  if (subject.of === "event") {
    return heard.some(
      event =>
        event.name === subject.event &&
        (subject.where ?? []).every(filter => passesFilter(filter, event.props)),
    );
  }

  if (subject.of === "user") {
    const actual = factOf(facts, subject.property);
    if (condition.op === "isSet") return text(actual) !== "";
    if (condition.op === "isEmpty") return text(actual) === "";
    if (condition.op === "count") return false;
    return compare(condition.op, actual, condition.value ?? "");
  }

  return false;
}

export function evaluateNode(
  node: RuleNode,
  facts: VisitorFacts,
  heard: readonly HeardEvent[],
): boolean {
  if (!isGroup(node)) return holds(node, facts, heard);
  if ("all" in node) return node.all.every(child => evaluateNode(child, facts, heard));
  return (
    node.any.length === 0 || node.any.some(child => evaluateNode(child, facts, heard))
  );
}

/**
 * What a rule's `if` reads, as the state page-builder's `evaluate` asks.
 *
 * Three names and nothing else. `user` is the user's facts — `visitor` too,
 * which is what console called them before — `subscription` is their
 * subscription record put back together from the flat `subscription.*` facts,
 * and `event` is the event that woke the rule: its properties, and its `name`.
 * The name is what console's field writes an event as now,
 * `event.name == "pr_webapp_homepage_view"`. On load no event woke it, so
 * `event` is `{}` and a condition about one does not hold.
 *
 * `subscription` is left undefined when no subscription fact is present, and
 * that is deliberate: the facts leave it out while the account's subscription
 * is still loading, and a comparison against undefined is false — so a rule
 * about the subscription cannot hold for a visitor whose subscription is not
 * yet known. An account with none arrives as `{ status: "inactive" }`.
 */
export function conditionState(
  facts: VisitorFacts,
  eventProps: Readonly<Record<string, unknown>>,
  eventName: string | null = null,
): ConditionState {
  const visitor: Record<string, unknown> = {};
  let subscription: Record<string, unknown> | undefined;
  Object.entries(facts).forEach(([key, fact]) => {
    if (!key.startsWith("subscription.")) {
      visitor[key] = fact;
      return;
    }
    if (fact === undefined) return;
    subscription ??= {};
    const steps = key.slice("subscription.".length).split(".");
    let into = subscription;
    steps.slice(0, -1).forEach(step => {
      into[step] ??= {};
      into = into[step] as Record<string, unknown>;
    });
    into[steps[steps.length - 1]!] = fact;
  });

  const event = eventName === null ? eventProps : { ...eventProps, name: eventName };
  const names: Record<string, unknown> = { visitor, user: visitor, subscription, event };
  const get = (name: string) => names[name] as never;
  const filled = (held: unknown) =>
    held !== undefined && held !== null && held !== "" && !(Array.isArray(held) && !held.length);

  return {
    get,
    has: (name, value) => {
      const held = names[name];
      return Array.isArray(held) ? held.map(String).includes(value) : String(held ?? "") === value;
    },
    count: name => {
      const held = names[name];
      return Array.isArray(held) ? held.length : filled(held) ? 1 : 0;
    },
    isSet: name => filled(names[name]),
    isEmpty: name => !filled(names[name]),
    atMax: () => false,
    meetsMin: () => true,
    visitorIsSet: property => filled(factOf(facts, property)),
    visitorEq: (property, value) => text(factOf(facts, property)) === text(value),
    visitorHas: (property, value) => text(factOf(facts, property)).includes(text(value)),
    visitorValue: property => (factOf(facts, property) ?? null) as string | number | boolean | null,
  };
}

/** Whether a rule's condition holds, in whichever language it was sent. */
export function ruleHolds(
  rule: PopupRule,
  facts: VisitorFacts,
  heard: readonly HeardEvent[],
  eventProps: Readonly<Record<string, unknown>>,
  /** The event that woke it, or null on load. */
  eventName: string | null = null,
): boolean {
  if (rule.if !== undefined) {
    if (rule.if === null) return true;
    // Total, like the runtime it comes from: a condition this build cannot read
    // is a popup that does not open, never an error in front of a visitor.
    try {
      return evaluate(rule.if, conditionState(facts, eventProps, eventName));
    } catch {
      return false;
    }
  }
  return evaluateNode(rule.when, facts, heard);
}

/**
 * Every rule this moment should open, in the order served.
 *
 * **All of them, not the first.** A popup opens whenever its condition is met;
 * another popup's condition being met at the same moment is no reason for it
 * not to. Which of them is *on screen* first is the queue's business
 * (`popup-rules.model`), not a reason to drop the rest.
 *
 * `event` is what just happened, or null for the evaluation on load. A rule is
 * asked on the events it listens for (`on`). One that names none is asked on
 * load and on every event when it has an `if` — console writes the events into
 * the condition now, as `event.name == …`, so the condition is what decides —
 * and only on load when it predates `if`, which is what `on: []` meant then.
 */
function asked(rule: PopupRule, event: string | null): boolean {
  if (rule.on.length > 0) return event !== null && rule.on.includes(event);
  if (rule.if !== undefined) return true;
  return event === null;
}

type MatchInput = {
  rules: readonly PopupRule[];
  event: string | null;
  /** The properties of `event`, which a rule's `if` reads as `event.*`. */
  eventProps?: Readonly<Record<string, unknown>>;
  facts: VisitorFacts;
  heard: readonly HeardEvent[];
  /** Whether the rule's cap still lets it fire. */
  allowed: (rule: PopupRule) => boolean;
};

export function allMatches({
  rules,
  event,
  eventProps = {},
  facts,
  heard,
  allowed,
}: MatchInput): PopupRule[] {
  return rules.filter(
    rule =>
      asked(rule, event) && allowed(rule) && ruleHolds(rule, facts, heard, eventProps, event),
  );
}

/** The first of them — what a caller asking about a single rule reads. */
export function firstMatch(input: MatchInput): PopupRule | null {
  return allMatches(input)[0] ?? null;
}
