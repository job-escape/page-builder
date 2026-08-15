/**
 * The store as a compiled module sees it: names in, behaviour decided by the
 * declaration. Every test is one a broken implementation fails.
 */
import { createFunnelStore } from "./store";
import type { VariableTable } from "./types";

const table: VariableTable = {
  goal:      { name: "goal",      type: "string" },
  equipment: { name: "equipment", type: "list<string>", min: 1, max: 3 },
  email:     { name: "email",     type: "string", sensitive: true },
  plan:      { name: "plan",      type: "string", default: "annual" },
};

const store = () => createFunnelStore({ table });

describe("the declared type decides what select means", () => {
  it("assigns for a scalar, so picking again replaces", () => {
    const s = store();
    s.select("goal", "lose_weight");
    s.select("goal", "build_muscle");
    expect(s.get("goal")).toBe("build_muscle");
  });

  it("toggles for a list", () => {
    const s = store();
    s.select("equipment", "bands");
    s.select("equipment", "mat");
    s.select("equipment", "bands");
    expect(s.get("equipment")).toEqual(["mat"]);
  });

  it("caps a list but still allows removal at the cap", () => {
    const s = store();
    ["a", "b", "c"].forEach((v) => s.select("equipment", v));
    s.select("equipment", "d");
    expect(s.get("equipment")).toEqual(["a", "b", "c"]);
    s.select("equipment", "b");
    expect(s.get("equipment")).toEqual(["a", "c"]);
  });
});

describe("has — what an option component asks about itself", () => {
  it("is true only for the chosen value in single select", () => {
    const s = store();
    s.select("goal", "build_muscle");
    expect(s.has("goal", "build_muscle")).toBe(true);
    expect(s.has("goal", "lose_weight")).toBe(false);
  });

  it("is true for every chosen value in multi select", () => {
    const s = store();
    s.select("equipment", "bands");
    s.select("equipment", "mat");
    expect(s.has("equipment", "bands")).toBe(true);
    expect(s.has("equipment", "mat")).toBe(true);
    expect(s.has("equipment", "rings")).toBe(false);
  });
});

describe("defaults", () => {
  it("seeds declared defaults", () => {
    expect(store().get("plan")).toBe("annual");
  });

  it("unanswered is null for a scalar and empty for a list", () => {
    const s = store();
    expect(s.get("goal")).toBeNull();
    expect(s.get("equipment")).toEqual([]);
  });
});

describe("subscribers", () => {
  it("is notified on a real change", () => {
    const s = store();
    const seen = jest.fn();
    s.subscribe(seen);
    s.select("goal", "build_muscle");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("is NOT notified when the value did not change", () => {
    const s = store();
    s.set("goal", "build_muscle");
    const seen = jest.fn();
    s.subscribe(seen);
    s.set("goal", "build_muscle");
    expect(seen).not.toHaveBeenCalled();
  });

  it("is not notified when a list write produces the same members", () => {
    const s = store();
    s.select("equipment", "bands");
    const seen = jest.fn();
    s.subscribe(seen);
    s.set("equipment", ["bands"]);
    expect(seen).not.toHaveBeenCalled();
  });

  it("stops after unsubscribe", () => {
    const s = store();
    const seen = jest.fn();
    s.subscribe(seen)();
    s.select("goal", "x");
    expect(seen).not.toHaveBeenCalled();
  });

  it("hands out a new snapshot identity per change, and a stable one otherwise", () => {
    const s = store();
    const before = s.snapshot();
    s.select("goal", "x");
    const after = s.snapshot();
    expect(after).not.toBe(before);
    s.set("goal", "x");
    expect(s.snapshot()).toBe(after);
  });
});

describe("request status", () => {
  it("is idle until set, and readable as a name for conditions", () => {
    const s = store();
    expect(s.status("lead")).toBe("idle");
    expect(s.get("$req.lead.status")).toBe("idle");

    s.setStatus("lead", "pending");
    expect(s.get("$req.lead.status")).toBe("pending");

    s.setStatus("lead", "error", "HTTP 500");
    expect(s.get("$req.lead.status")).toBe("error");
    expect(s.get("$req.lead.error")).toBe("HTTP 500");
  });

  it("notifies, so a spinner variant re-renders", () => {
    const s = store();
    const seen = jest.fn();
    s.subscribe(seen);
    s.setStatus("lead", "pending");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("does not notify when the status is unchanged", () => {
    const s = store();
    s.setStatus("lead", "pending");
    const seen = jest.fn();
    s.subscribe(seen);
    s.setStatus("lead", "pending");
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("an undeclared name is reported, never thrown", () => {
  it("reports and no-ops rather than crashing a live funnel", () => {
    const onUnknown = jest.fn();
    const s = createFunnelStore({ table, onUnknown });

    s.select("gol", "x");
    s.set("gol", "x");

    expect(onUnknown).toHaveBeenCalledWith("gol");
    expect(s.get("gol")).toBeNull();
    expect(s.has("gol", "x")).toBe(false);
    expect(s.isSet("gol")).toBe(false);
  });
});

describe("gates", () => {
  it("meetsMin drives a Continue button", () => {
    const s = store();
    expect(s.meetsMin("equipment")).toBe(false);
    s.select("equipment", "bands");
    expect(s.meetsMin("equipment")).toBe(true);
  });

  it("atMax drives an unavailable state", () => {
    const s = store();
    ["a", "b"].forEach((v) => s.select("equipment", v));
    expect(s.atMax("equipment")).toBe(false);
    s.select("equipment", "c");
    expect(s.atMax("equipment")).toBe(true);
  });
});

describe("reset", () => {
  it("returns every variable to its default and clears request status", () => {
    const s = store();
    s.select("goal", "x");
    s.select("equipment", "bands");
    s.setStatus("lead", "error", "boom");

    s.reset();

    expect(s.get("goal")).toBeNull();
    expect(s.get("equipment")).toEqual([]);
    expect(s.get("plan")).toBe("annual");
    expect(s.status("lead")).toBe("idle");
  });
});
