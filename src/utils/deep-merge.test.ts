import { describe, expect, it } from "@jest/globals";

import { deepMerge, deepMergeAll } from "./deep-merge";

describe("deepMerge", () => {
  it("merges nested objects without losing untouched keys", () => {
    const out = deepMerge(
      { items: [{ item_id: 3, price: 15.19, item_name: "4Week" }] },
      { items: [{ item_name: "12Week" }] },
    );
    expect(out).toEqual({ items: [{ item_id: 3, price: 15.19, item_name: "12Week" }] });
  });

  it("preserves array elements beyond the source length", () => {
    const out = deepMerge({ items: [{ id: 1 }, { id: 2 }] }, { items: [{ name: "a" }] });
    expect(out).toEqual({ items: [{ id: 1, name: "a" }, { id: 2 }] });
  });

  it("source primitives overwrite target primitives", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("source array replaces non-array target at the same key", () => {
    expect(deepMerge({ a: { x: 1 } }, { a: [1, 2] })).toEqual({ a: [1, 2] });
  });

  it("does not mutate the target object", () => {
    const target = { items: [{ id: 1, name: "old" }] };
    const source = { items: [{ name: "new" }] };
    deepMerge(target, source);
    expect(target).toEqual({ items: [{ id: 1, name: "old" }] });
  });

  it("deepMergeAll skips null/undefined and chains left-to-right", () => {
    const out = deepMergeAll(
      { items: [{ id: 1, name: "default" }], currency: "USD" },
      null,
      undefined,
      { items: [{ name: "override" }] },
    );
    expect(out).toEqual({ items: [{ id: 1, name: "override" }], currency: "USD" });
  });
});
