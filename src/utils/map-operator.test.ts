import { mapOperator } from "./map-operator";

/*
 * Authored conditions store an operator symbol; the rules engine wants a name.
 * The mapping between them is a data-schema contract, not an implementation
 * detail — published content already contains these symbols, so dropping or
 * re-pointing one changes how live funnels route.
 *
 * The aliases exist because the constructor has emitted different spellings over
 * time. Every one of them has to keep resolving, forever, or old content breaks.
 */
describe("mapOperator", () => {
  it.each([
    ["=", "equal"],
    ["==", "equal"],
    ["===", "equal"],
    ["!=", "notEqual"],
    ["!==", "notEqual"],
    ["<>", "notEqual"],
    ["<", "lessThan"],
    ["<=", "lessThanInclusive"],
    [">", "greaterThan"],
    [">=", "greaterThanInclusive"],
    ["in", "in"],
    ["!in", "notIn"],
    ["notIn", "notIn"],
    ["contains", "contains"],
    ["!contains", "doesNotContain"],
    ["doesNotContain", "doesNotContain"],
  ])("maps %s to %s", (symbol, expected) => {
    expect(mapOperator(symbol)).toBe(expected);
  });

  it("keeps the inclusive and exclusive comparisons distinct", () => {
    // Swapping these shifts every boundary by one — an age gate of ">= 18"
    // silently becoming "> 18" excludes exactly the 18-year-olds it was
    // written to include.
    expect(mapOperator("<")).not.toBe(mapOperator("<="));
    expect(mapOperator(">")).not.toBe(mapOperator(">="));
  });

  it("throws on an unknown operator rather than guessing", () => {
    // Silently mapping to `equal` would route users down a branch nobody
    // authored; a throw is caught upstream and falls back to default routing.
    expect(() => mapOperator("~=")).toThrow('Unknown operator: "~="');
  });

  it("lists the valid symbols in the error, since authors read it", () => {
    expect(() => mapOperator("nope")).toThrow(/Valid symbols: .*doesNotContain/);
  });

  it("is case-sensitive, matching what the constructor emits", () => {
    expect(() => mapOperator("IN")).toThrow();
    expect(() => mapOperator("Contains")).toThrow();
  });

  it("rejects an empty operator", () => {
    expect(() => mapOperator("")).toThrow();
  });

  it("does not resolve inherited object properties as operators", () => {
    // The map is a plain object literal, so `toString` and friends are
    // reachable on its prototype; returning one would hand the engine a
    // function name as an operator.
    expect(() => mapOperator("toString")).toThrow();
    expect(() => mapOperator("constructor")).toThrow();
  });
});
