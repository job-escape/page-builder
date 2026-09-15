/**
 * What survives a refresh, and what must not.
 *
 * The serialize/deserialize pair is tested directly rather than through the
 * cookie, so these run without a document and still cover every rule that
 * matters: sensitive exclusion, version keying, and shape validation.
 */
import { MAX_BYTES, deserialize, serialize } from "./persistence";
import type { VariableTable } from "./types";

const table: VariableTable = {
  goal:      { name: "goal",      type: "string" },
  equipment: { name: "equipment", type: "list<string>", max: 3 },
  age:       { name: "age",       type: "number" },
  optin:     { name: "optin",     type: "boolean" },
  email:     { name: "email",     type: "string", sensitive: true },
};

const state = {
  goal: "build_muscle",
  equipment: ["bands", "mat"],
  age: 34,
  optin: true,
  email: "ana@example.com",
};

describe("round trip", () => {
  it("restores every declared, non-sensitive answer", () => {
    const restored = deserialize(table, serialize(table, state, "v7"), "v7");
    expect(restored).toEqual({
      goal: "build_muscle",
      equipment: ["bands", "mat"],
      age: 34,
      optin: true,
    });
  });

  it("preserves list order", () => {
    const restored = deserialize(table, serialize(table, state, "v7"), "v7");
    expect(restored?.equipment).toEqual(["bands", "mat"]);
  });
});

describe("sensitive variables never reach the cookie", () => {
  it("is absent from the serialized payload", () => {
    expect(serialize(table, state, "v7")).not.toContain("ana@example.com");
  });

  it("is not restored even if an older payload contains it", () => {
    const smuggled = JSON.stringify({ v: "v7", a: { email: "ana@example.com" } });
    expect(deserialize(table, smuggled, "v7")).toEqual({});
  });
});

describe("version keying", () => {
  it("discards answers captured under a different funnel version", () => {
    expect(deserialize(table, serialize(table, state, "v6"), "v7")).toBeNull();
  });

  it("keeps them when the version matches", () => {
    expect(deserialize(table, serialize(table, state, "v7"), "v7")).not.toBeNull();
  });
});

describe("shape validation", () => {
  it("drops a value whose type no longer matches its declaration", () => {
    // `equipment` was a string in an older funnel and is a list now.
    const stale = JSON.stringify({ v: "v7", a: { goal: "build_muscle", equipment: "bands" } });
    expect(deserialize(table, stale, "v7")).toEqual({ goal: "build_muscle" });
  });

  it("drops one bad value without discarding the good ones", () => {
    const mixed = JSON.stringify({ v: "v7", a: { goal: "x", age: "thirty-four" } });
    expect(deserialize(table, mixed, "v7")).toEqual({ goal: "x" });
  });

  it("drops variables the manifest no longer declares", () => {
    const removed = JSON.stringify({ v: "v7", a: { goal: "x", retired: "y" } });
    expect(deserialize(table, removed, "v7")).toEqual({ goal: "x" });
  });

  it("accepts null as unanswered", () => {
    const empty = JSON.stringify({ v: "v7", a: { goal: null } });
    expect(deserialize(table, empty, "v7")).toEqual({ goal: null });
  });
});

describe("unusable input yields null rather than throwing", () => {
  it.each([
    ["absent", undefined],
    ["not JSON", "{{{"],
    ["not an object", '"a string"'],
    ["missing answers", '{"v":"v7"}'],
  ])("%s", (_label, raw) => {
    expect(deserialize(table, raw as string | undefined, "v7")).toBeNull();
  });
});

describe("size", () => {
  it("a realistic funnel stays far under the cookie limit", () => {
    const bytes = encodeURIComponent(serialize(table, state, "v7")).length;
    expect(bytes).toBeLessThan(MAX_BYTES / 4);
  });

  it("the guard threshold leaves room under the ~4KB browser cap", () => {
    // Name, attributes and encoding expansion all come out of the same budget.
    expect(MAX_BYTES).toBeLessThan(4096);
  });
});

describe('keep: "always" survives a republish', () => {
  const kept: VariableTable = {
    ...table,
    offerEndsAt: { name: "offerEndsAt", type: "number", keep: "always" },
    welcomeSeen: { name: "welcomeSeen", type: "boolean", keep: "always" },
  };
  const withKept = { ...state, offerEndsAt: 1_760_000_000_000, welcomeSeen: true };

  it("restores kept values under a different version, and nothing else", () => {
    const restored = deserialize(kept, serialize(kept, withKept, "v6"), "v7");
    expect(restored).toEqual({ offerEndsAt: 1_760_000_000_000, welcomeSeen: true });
  });

  it("restores kept and ordinary values together under the same version", () => {
    const restored = deserialize(kept, serialize(kept, withKept, "v7"), "v7");
    expect(restored).toEqual({
      goal: "build_muscle",
      equipment: ["bands", "mat"],
      age: 34,
      optin: true,
      offerEndsAt: 1_760_000_000_000,
      welcomeSeen: true,
    });
  });

  it("writes no `k` for a funnel that keeps nothing", () => {
    expect(JSON.parse(serialize(table, state, "v7"))).not.toHaveProperty("k");
  });

  it("does not restore a kept value whose declaration stopped keeping it", () => {
    const stale = JSON.stringify({ v: "v6", a: {}, k: { goal: "x" } });
    expect(deserialize(table, stale, "v7")).toBeNull();
  });

  it("drops a kept value whose type changed", () => {
    const stale = JSON.stringify({ v: "v6", a: {}, k: { offerEndsAt: "soon", welcomeSeen: true } });
    expect(deserialize(kept, stale, "v7")).toEqual({ welcomeSeen: true });
  });

  it("never keeps a sensitive or screen variable, whatever it says", () => {
    const odd: VariableTable = {
      email: { name: "email", type: "string", sensitive: true, keep: "always" },
      step: { name: "step", type: "number", screen: "s1", keep: "always" },
    };
    expect(serialize(odd, { email: "ana@example.com", step: 2 }, "v7")).toBe('{"v":"v7","a":{}}');
    const smuggled = JSON.stringify({ v: "v6", a: {}, k: { email: "ana@example.com", step: 2 } });
    expect(deserialize(odd, smuggled, "v7")).toBeNull();
  });
});
