import { describe, expect, it } from "@jest/globals";

import { applyValueTransforms } from "./apply-value-transforms";

describe("applyValueTransforms", () => {
  it("returns the original value when no transforms are provided", () => {
    expect(applyValueTransforms("Test@Example.com")).toBe("Test@Example.com");
  });

  it("applies lowercase transforms", () => {
    expect(applyValueTransforms("Test@Example.com", ["lowercase"])).toBe("test@example.com");
  });

  it("applies multiple transforms in order", () => {
    expect(applyValueTransforms("  Test@Example.com  ", ["trim", "lowercase"])).toBe(
      "test@example.com",
    );
  });
});
