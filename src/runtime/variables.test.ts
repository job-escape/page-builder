/**
 * The single-select / multi-select difference, which is the whole reason these
 * functions exist. Each test is one a broken implementation fails.
 */
import type { VariableDecl } from "./types";
import {
  atMax,
  count,
  defaultFor,
  has,
  initialState,
  isEmpty,
  isSet,
  meetsMin,
  select,
} from "./variables";

const goal: VariableDecl = { name: "goal", type: "string" };
const equipment: VariableDecl = { name: "equipment", type: "list<string>", min: 1, max: 3 };
const uncapped: VariableDecl = { name: "tags", type: "list<string>" };

describe("select — string", () => {
  it("assigns", () => {
    expect(select(goal, null, "build_muscle")).toBe("build_muscle");
  });

  it("replaces, so nothing has to un-select the others", () => {
    expect(select(goal, "lose_weight", "build_muscle")).toBe("build_muscle");
  });

  it("re-picking the same value keeps it — a scalar answer cannot be un-answered", () => {
    expect(select(goal, "build_muscle", "build_muscle")).toBe("build_muscle");
  });
});

describe("select — list", () => {
  it("adds to an empty list", () => {
    expect(select(equipment, [], "bands")).toEqual(["bands"]);
  });

  it("appends, preserving the order they were chosen in", () => {
    expect(select(equipment, ["bands"], "mat")).toEqual(["bands", "mat"]);
  });

  it("toggles a chosen value off", () => {
    expect(select(equipment, ["bands", "mat"], "bands")).toEqual(["mat"]);
  });

  it("ignores an addition at the cap", () => {
    const full = ["a", "b", "c"];
    expect(select(equipment, full, "d")).toEqual(full);
  });

  it("still removes at the cap — otherwise the user is stuck", () => {
    expect(select(equipment, ["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("does not cap when no max is declared", () => {
    expect(select(uncapped, ["a", "b", "c"], "d")).toEqual(["a", "b", "c", "d"]);
  });

  it("never mutates the value it was given", () => {
    const current = ["bands"];
    select(equipment, current, "mat");
    select(equipment, current, "bands");
    expect(current).toEqual(["bands"]);
  });

  it("tolerates an unanswered list held as null", () => {
    expect(select(equipment, null, "bands")).toEqual(["bands"]);
  });
});

describe("has — the `in` operator that unifies both", () => {
  it("compares by equality for a scalar", () => {
    expect(has(goal, "build_muscle", "build_muscle")).toBe(true);
    expect(has(goal, "build_muscle", "lose_weight")).toBe(false);
  });

  it("compares by membership for a list", () => {
    expect(has(equipment, ["bands", "mat"], "mat")).toBe(true);
    expect(has(equipment, ["bands", "mat"], "rings")).toBe(false);
  });

  it("is false rather than throwing when unanswered", () => {
    expect(has(goal, null, "x")).toBe(false);
    expect(has(equipment, null, "x")).toBe(false);
    expect(has(equipment, undefined, "x")).toBe(false);
  });

  it("does not coerce — this is the wrong-branch-in-production bug", () => {
    const age: VariableDecl = { name: "age", type: "number" };
    expect(has(age, 5, "5")).toBe(false);
  });
});

describe("count", () => {
  it("counts a list", () => {
    expect(count(["a", "b"])).toBe(2);
  });

  it("is 0 for unanswered and for scalars, never a throw", () => {
    expect(count(null)).toBe(0);
    expect(count(undefined)).toBe(0);
    expect(count("build_muscle")).toBe(0);
  });
});

describe("atMax / meetsMin", () => {
  it("reports the cap only for a capped list", () => {
    expect(atMax(equipment, ["a", "b"])).toBe(false);
    expect(atMax(equipment, ["a", "b", "c"])).toBe(true);
    expect(atMax(uncapped, ["a", "b", "c"])).toBe(false);
    expect(atMax(goal, "x")).toBe(false);
  });

  it("gates a Continue button on the minimum", () => {
    expect(meetsMin(equipment, [])).toBe(false);
    expect(meetsMin(equipment, ["bands"])).toBe(true);
  });

  it("treats a scalar's minimum as simply being answered", () => {
    expect(meetsMin(goal, null)).toBe(false);
    expect(meetsMin(goal, "build_muscle")).toBe(true);
  });
});

describe("isSet / isEmpty", () => {
  it("an empty string is unanswered", () => {
    expect(isSet({ name: "email", type: "string" }, "")).toBe(false);
  });

  it("false and zero are answers, not absences", () => {
    expect(isSet({ name: "optin", type: "boolean" }, false)).toBe(true);
    expect(isSet({ name: "age", type: "number" }, 0)).toBe(true);
  });

  it("an empty list is unanswered", () => {
    expect(isSet(equipment, [])).toBe(false);
    expect(isEmpty(equipment, [])).toBe(true);
  });
});

describe("defaults", () => {
  it("uses the type's empty value when none is declared", () => {
    expect(defaultFor(goal)).toBeNull();
    expect(defaultFor(equipment)).toEqual([]);
  });

  it("uses a declared default", () => {
    expect(defaultFor({ name: "plan", type: "string", default: "annual" })).toBe("annual");
  });

  it("copies a declared list default, so sessions cannot share it", () => {
    const decl: VariableDecl = { name: "tags", type: "list<string>", default: ["a"] };
    const first = defaultFor(decl) as string[];
    first.push("b");
    expect(defaultFor(decl)).toEqual(["a"]);
  });

  it("seeds every declared variable and nothing else", () => {
    expect(initialState({ goal, equipment })).toEqual({ goal: null, equipment: [] });
  });
});
