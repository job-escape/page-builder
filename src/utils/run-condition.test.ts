/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node"]}
 */

// Unlike the sibling condition tests, this one runs the *real* json-rules-engine
// rather than stubbing it — branch selection, priority and operator behaviour
// are what is under test here, and a stub would only assert that the stub works.
//
// json-rules-engine depends on jsonpath-plus, whose exports map offers ESM under
// the "browser" condition that jsdom selects by default, and CJS under "node".
// ts-jest cannot transform the ESM build, so the resolution condition is
// overridden for this file only — a global override would change module
// resolution for all 19 suites. The two builds differ only in packaging, and
// none of the conditions below use jsonpath facts.

import { Answers, Condition } from "../types";

import { runCondition } from "./run-condition";

type Branch = Condition["condition"][number];

const leaf = (fact: string, operator: string, value: string, extra: object = {}) => ({
  fact,
  operator,
  value,
  ...extra,
});

const branch = (nodeId: number | null, rules: Branch["rules"]): Branch => ({ nodeId, rules });

const defaultBranch = (nodeId: number | null): Branch => ({
  nodeId,
  rules: { all: [] },
  isDefault: true,
});

const run = (conditions: Branch[], answers: Answers) => runCondition(conditions, answers);

/*
 * Branch resolution: given the answers so far, which page comes next. This is
 * the single decision that determines what a user is shown, and a wrong answer
 * is silent — they simply see the wrong page, or the price meant for a
 * different cohort.
 *
 * Two behaviours here are load-bearing and easy to break by accident. Branches
 * are ordered, so the first authored match wins even when a later one also
 * matches — the constructor's list order is the author's intent. And a branch
 * whose rules are empty is not a branch that matches everything; it is skipped,
 * because otherwise saving a half-authored condition would swallow every user.
 *
 * The rule-set is also the engine cache key (see engine-cache.test.ts), so each
 * test below uses distinct rules to stay independent of the module-level cache.
 */
describe("runCondition", () => {
  it("returns the node of the branch whose rule matches", async () => {
    const conditions = [branch(101, { all: [leaf("goal", "=", "lose_weight")] })];

    expect(await run(conditions, { goal: "lose_weight" })).toEqual({ nodeId: 101 });
  });

  it("falls to the default branch when nothing matches", async () => {
    const conditions = [
      branch(102, { all: [leaf("goal_b", "=", "lose_weight")] }),
      defaultBranch(999),
    ];

    expect(await run(conditions, { goal_b: "gain_muscle" })).toEqual({ nodeId: 999 });
  });

  it("returns null when nothing matches and there is no default", async () => {
    // The caller reads this as "no opinion" and uses next_node_id instead.
    const conditions = [branch(103, { all: [leaf("goal_c", "=", "lose_weight")] })];

    expect(await run(conditions, { goal_c: "gain_muscle" })).toBeNull();
  });

  it("prefers the earlier branch when two both match", async () => {
    // Authoring order is the tie-break; the constructor lists these top-down.
    const conditions = [
      branch(201, { all: [leaf("age_a", ">", "18", { value_type: "number" })] }),
      branch(202, { all: [leaf("age_a", ">", "30", { value_type: "number" })] }),
    ];

    expect(await run(conditions, { age_a: 40 })).toEqual({ nodeId: 201 });
  });

  it("ignores a branch with no rules rather than treating it as a match", async () => {
    // A half-authored branch must not capture everyone.
    const conditions = [branch(301, { all: [] }), branch(302, { all: [leaf("q", "=", "yes")] })];

    expect(await run(conditions, { q: "yes" })).toEqual({ nodeId: 302 });
  });

  it("ignores a default branch's own rules when selecting matches", async () => {
    const conditions = [
      defaultBranch(400),
      branch(401, { all: [leaf("plan_a", "=", "premium")] }),
    ];

    expect(await run(conditions, { plan_a: "premium" })).toEqual({ nodeId: 401 });
    expect(await run(conditions, { plan_a: "basic" })).toEqual({ nodeId: 400 });
  });

  it("matches on a data-type-prefixed fact key", async () => {
    // Facts arrive keyed `onboarding_data-device_type`; the leaf stores the two
    // halves separately and they are rejoined when the rule is built.
    const conditions = [
      branch(501, {
        all: [leaf("device_type", "=", "ios", { data_type: "onboarding_data" })],
      }),
    ];

    expect(await run(conditions, { "onboarding_data-device_type": "ios" })).toEqual({
      nodeId: 501,
    });
  });

  it("also matches a prefixed answer against an unprefixed rule", async () => {
    // Answers are aliased to their suffix, so content authored before the
    // prefix existed keeps resolving.
    const conditions = [branch(502, { all: [leaf("device_type_b", "=", "ios")] })];

    expect(await run(conditions, { "quiz_data-device_type_b": "ios" })).toEqual({ nodeId: 502 });
  });

  it("keeps the whole suffix when a fact name itself contains a dash", async () => {
    const conditions = [branch(503, { all: [leaf("user-tier", "=", "gold")] })];

    expect(await run(conditions, { "quiz_data-user-tier": "gold" })).toEqual({ nodeId: 503 });
  });

  it("coerces a numeric comparison instead of comparing strings", async () => {
    // "9" > "18" is true as strings and false as numbers. The value_type is
    // what keeps an age gate from inverting.
    const conditions = [
      branch(601, { all: [leaf("age_b", ">", "18", { value_type: "number" })] }),
      defaultBranch(600),
    ];

    expect(await run(conditions, { age_b: 9 })).toEqual({ nodeId: 600 });
    expect(await run(conditions, { age_b: 25 })).toEqual({ nodeId: 601 });
  });

  it("coerces a boolean comparison", async () => {
    const conditions = [
      branch(701, { all: [leaf("consent", "=", "true", { value_type: "boolean" })] }),
      defaultBranch(700),
    ];

    expect(await run(conditions, { consent: true })).toEqual({ nodeId: 701 });
    expect(await run(conditions, { consent: false })).toEqual({ nodeId: 700 });
  });

  it("requires every rule of an `all` group", async () => {
    const conditions = [
      branch(801, { all: [leaf("a1", "=", "x"), leaf("b1", "=", "y")] }),
      defaultBranch(800),
    ];

    expect(await run(conditions, { a1: "x", b1: "y" })).toEqual({ nodeId: 801 });
    expect(await run(conditions, { a1: "x", b1: "z" })).toEqual({ nodeId: 800 });
  });

  it("requires only one rule of an `any` group", async () => {
    const conditions = [
      branch(901, { any: [leaf("a2", "=", "x"), leaf("b2", "=", "y")] }),
      defaultBranch(900),
    ];

    expect(await run(conditions, { a2: "x", b2: "no" })).toEqual({ nodeId: 901 });
    expect(await run(conditions, { a2: "no", b2: "no" })).toEqual({ nodeId: 900 });
  });

  it("evaluates a group nested inside a group", async () => {
    const conditions = [
      branch(1001, {
        all: [leaf("country", "=", "US"), { any: [leaf("tier", "=", "gold"), leaf("vip", "=", "1")] }],
      }),
      defaultBranch(1000),
    ];

    expect(await run(conditions, { country: "US", tier: "gold", vip: "0" })).toEqual({
      nodeId: 1001,
    });
    expect(await run(conditions, { country: "US", tier: "silver", vip: "1" })).toEqual({
      nodeId: 1001,
    });
    expect(await run(conditions, { country: "CA", tier: "gold", vip: "1" })).toEqual({
      nodeId: 1000,
    });
  });

  it("treats a missing answer as not matching rather than throwing", async () => {
    // A user who skipped an optional step still has to go somewhere.
    const conditions = [
      branch(1101, { all: [leaf("never_asked", "=", "x")] }),
      defaultBranch(1100),
    ];

    expect(await run(conditions, {})).toEqual({ nodeId: 1100 });
  });

  it("supports contains against a multi-select answer", async () => {
    const conditions = [
      branch(1201, { all: [leaf("goals", "contains", "sleep")] }),
      defaultBranch(1200),
    ];

    expect(await run(conditions, { goals: ["sleep", "focus"] })).toEqual({ nodeId: 1201 });
    expect(await run(conditions, { goals: ["focus"] })).toEqual({ nodeId: 1200 });
  });

  it("treats a missing answer as not containing, and as does-not-contain", async () => {
    const contains = [
      branch(1301, { all: [leaf("absent_a", "contains", "x")] }),
      defaultBranch(1300),
    ];
    const doesNot = [
      branch(1401, { all: [leaf("absent_b", "!contains", "x")] }),
      defaultBranch(1400),
    ];

    expect(await run(contains, {})).toEqual({ nodeId: 1300 });
    expect(await run(doesNot, {})).toEqual({ nodeId: 1401 });
  });

  it("returns a null node id when the matched branch has none", async () => {
    // Distinct from "no branch matched" — the caller must not confuse a branch
    // that deliberately ends the flow with an absent decision.
    const conditions = [branch(null, { all: [leaf("done", "=", "yes")] })];

    expect(await run(conditions, { done: "yes" })).toEqual({ nodeId: null });
  });

  it("returns null for an empty condition list", async () => {
    expect(await run([], { anything: "1" })).toBeNull();
  });
});
