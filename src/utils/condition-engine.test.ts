import { describe, expect, it, jest } from "@jest/globals";

import { StorageFormat } from "../types";

// json-rules-engine transitively imports an ESM-only dependency (jsonpath-plus)
// that ts-jest cannot transform. We only test the pure pieces of condition-engine
// (coerceValue, buildRuleConditions), so stub the engine module out entirely.
jest.mock("json-rules-engine", () => ({
  Engine: class {
    addOperator() {}
  },
}));

import { buildRuleConditions, coerceValue } from "./condition-engine";

// json-rules-engine pulls in an ESM-only dependency (jsonpath-plus) that ts-jest
// cannot transform, so we unit-test the pure pieces our fix touches:
//   1. coerceValue — string -> typed value per value_type
//   2. buildRuleConditions — that the coerced value lands in the engine condition
// The engine's own equal/notEqual operators are standard strict ===/!==, so a
// like-typed value is sufficient for them to compare correctly.

describe("coerceValue", () => {
  it("coerces boolean", () => {
    expect(coerceValue("true", "boolean")).toBe(true);
    expect(coerceValue("false", "boolean")).toBe(false);
    expect(coerceValue("anything-else", "boolean")).toBe(false);
  });

  it("coerces number, falling back to the raw string when NaN", () => {
    expect(coerceValue("29.99", "number")).toBe(29.99);
    expect(coerceValue("10", "number")).toBe(10);
    expect(coerceValue("not-a-number", "number")).toBe("not-a-number");
  });

  it("leaves strings untouched and defaults to string", () => {
    expect(coerceValue("en", "string")).toBe("en");
    expect(coerceValue("en")).toBe("en");
    expect(coerceValue("true")).toBe("true"); // no value_type -> stays a string
  });
});

describe("buildRuleConditions value typing", () => {
  it("emits a real boolean for a boolean-typed leaf so it matches a boolean fact", () => {
    const conditions: StorageFormat = {
      all: [
        { fact: "purchased", operator: "!=", value: "true", data_type: null, value_type: "boolean" },
      ],
    };
    const built = buildRuleConditions(conditions) as {
      all: Array<{ fact: string; operator: string; value: unknown }>;
    };
    expect(built.all[0]).toEqual({ fact: "purchased", operator: "notEqual", value: true });
    // Before the fix this was the string "true", so `boolean true !== "true"`
    // was always true and `!= true` matched even for purchased users.
  });

  it("keeps a string value when value_type is absent (backward compatible)", () => {
    const conditions: StorageFormat = {
      all: [{ fact: "lang", operator: "=", value: "en", data_type: null }],
    };
    const built = buildRuleConditions(conditions) as {
      all: Array<{ fact: string; operator: string; value: unknown }>;
    };
    expect(built.all[0]).toEqual({ fact: "lang", operator: "equal", value: "en" });
  });

  it("emits a number for a number-typed leaf with a data_type prefix", () => {
    const conditions: StorageFormat = {
      all: [
        { fact: "price", operator: ">", value: "10", data_type: "subscription_data", value_type: "number" },
      ],
    };
    const built = buildRuleConditions(conditions) as {
      all: Array<{ fact: string; operator: string; value: unknown }>;
    };
    expect(built.all[0]).toEqual({
      fact: "subscription_data-price",
      operator: "greaterThan",
      value: 10,
    });
  });
});
