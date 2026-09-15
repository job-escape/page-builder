/**
 * Time as building blocks: the clock, calculated variables, a few functions,
 * and a step that waits for a condition.
 */
import { call } from "./functions";
import { run, type ActionContext } from "./interpret";
import { serialize } from "./persistence";
import { createFunnelStore } from "./store";
import type { VariableTable } from "./types";

const table: VariableTable = {
  offerEndsAt: { name: "offerEndsAt", type: "number", keep: "always" },
  offerLeft: {
    name: "offerLeft",
    type: "number",
    formula: {
      fn: "max",
      args: [
        { lit: 0 },
        { fn: "ceil", args: [{ fn: "divide", args: [{ fn: "subtract", args: [{ var: "offerEndsAt" }, { now: true }] }, { lit: 1000 }] }] },
      ],
    },
  },
  loop: { name: "loop", type: "number", formula: { fn: "add", args: [{ var: "loop" }, { lit: 1 }] } },
};

describe("functions", () => {
  it("floors, ceils and wraps", () => {
    expect(call("floor", [9.7])).toBe(9);
    expect(call("ceil", [9.1])).toBe(10);
    expect(call("mod", [125, 60])).toBe(5);
    expect(call("mod", [-5, 60])).toBe(55);
  });
  it("reads a date as milliseconds", () => {
    expect(call("toTime", ["2026-01-01T00:00:00Z"])).toBe(Date.UTC(2026, 0, 1));
    expect(call("toTime", [42])).toBe(42);
    expect(call("toTime", ["not a date"])).toBeNull();
  });
  it("formats days", () => {
    expect(call("format", [90061, "dd:hh:mm:ss"])).toBe("01:01:01:01");
  });
});

describe("calculated variables", () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date("2026-09-15T10:00:00Z")));
  afterEach(() => jest.useRealTimers());

  it("work themselves out from other variables and the clock", () => {
    const store = createFunnelStore({ table });
    expect(store.get("offerLeft")).toBe(0);
    store.set("offerEndsAt", Date.now() + 90_500);
    expect(store.get("offerLeft")).toBe(91);
    jest.advanceTimersByTime(30_000);
    expect(store.get("offerLeft")).toBe(61);
  });

  it("are never written, saved, or allowed to loop", () => {
    const store = createFunnelStore({ table });
    store.set("offerLeft", 5);
    expect(store.get("offerLeft")).toBe(0);
    expect(store.get("loop")).toBeNull();
    expect(serialize(table, { offerEndsAt: 1, offerLeft: 2 }, "v1")).not.toContain("offerLeft");
  });
});

describe("waitUntil", () => {
  it("holds the list until the condition is true", async () => {
    let value = 3;
    const done: string[] = [];
    const ctx = {
      state: { get: () => value, set: () => undefined, select: () => undefined, now: () => 0 },
      nav: { show: () => undefined, close: () => undefined, wait: async () => { value -= 1; return true; } },
      req: (async () => ({})) as never,
    } as unknown as ActionContext;
    await run(
      [
        { type: "waitUntil", when: { op: "cmp", cmp: "lte", left: { var: "left" }, right: { lit: 0 } } },
        { type: "set", variable: "done", value: "yes" },
      ],
      { ...ctx, state: { ...ctx.state, set: (name: string) => done.push(name) } } as unknown as ActionContext,
    );
    expect(value).toBe(0);
    expect(done).toEqual(["done"]);
  });

  it("stops when the screen is left", async () => {
    const ctx = {
      state: { get: () => 5, set: () => undefined, select: () => undefined },
      nav: { show: () => undefined, close: () => undefined, wait: async () => false },
      req: (async () => ({})) as never,
    } as unknown as ActionContext;
    const finished = await run([{ type: "waitUntil", when: { op: "cmp", cmp: "lte", left: { var: "left" }, right: { lit: 0 } } }], ctx);
    expect(finished).toBe(false);
  });
});
