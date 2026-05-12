import { describe, expect, it } from "@jest/globals";

import { setByPath } from "./set-by-path";

describe("setByPath", () => {
  it("sets a flat key like a plain assignment", () => {
    const out = setByPath({}, "amount", 100);
    expect(out).toEqual({ amount: 100 });
  });

  it("creates nested objects for dot-paths", () => {
    const out = setByPath({}, "items.item_name", "Book");
    expect(out).toEqual({ items: { item_name: "Book" } });
  });

  it("merges sibling dot-paths into the same parent object", () => {
    let acc: Record<string, unknown> = {};
    acc = setByPath(acc, "items.item_name", "Book");
    acc = setByPath(acc, "items.price", 9.99);
    expect(acc).toEqual({ items: { item_name: "Book", price: 9.99 } });
  });

  it("supports explicit array indexes", () => {
    let acc: Record<string, unknown> = {};
    acc = setByPath(acc, "items[0].item_name", "Book");
    acc = setByPath(acc, "items[0].price", 9.99);
    acc = setByPath(acc, "items[1].item_name", "Pen");
    expect(acc).toEqual({
      items: [
        { item_name: "Book", price: 9.99 },
        { item_name: "Pen" },
      ],
    });
  });

  it("supports [] push to append a new element each call", () => {
    let acc: Record<string, unknown> = {};
    acc = setByPath(acc, "items[].item_name", "Book");
    acc = setByPath(acc, "items[].item_name", "Pen");
    expect(acc).toEqual({ items: [{ item_name: "Book" }, { item_name: "Pen" }] });
  });

  it("last write wins on a leaf conflict", () => {
    let acc: Record<string, unknown> = { amount: 100 };
    acc = setByPath(acc, "amount", 200);
    expect(acc).toEqual({ amount: 200 });
  });

  it("overwrites a primitive when a later write needs an object at that key", () => {
    let acc: Record<string, unknown> = {};
    acc = setByPath(acc, "items", "literal");
    acc = setByPath(acc, "items.item_name", "Book");
    expect(acc).toEqual({ items: { item_name: "Book" } });
  });

  it("overwrites an object when a later write needs an array at that key", () => {
    let acc: Record<string, unknown> = {};
    acc = setByPath(acc, "items.item_name", "Book");
    acc = setByPath(acc, "items[0]", "Pen");
    expect(acc).toEqual({ items: ["Pen"] });
  });

  it("returns target unchanged for an empty path", () => {
    const target = { a: 1 };
    expect(setByPath(target, "", 99)).toBe(target);
    expect(target).toEqual({ a: 1 });
  });
});
