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

  it("extracts the text before a delimiter", () => {
    expect(applyValueTransforms("Marketing / PR / Creative", ["before:/"])).toBe("Marketing");
  });

  it("extracts the text after the last delimiter", () => {
    expect(applyValueTransforms("Marketing / PR / Creative", ["after:/"])).toBe("Creative");
  });

  it("returns the original value when the delimiter is not found", () => {
    expect(applyValueTransforms("Healthcare", ["before:/"])).toBe("Healthcare");
  });

  it("extracts the first word", () => {
    expect(applyValueTransforms("The Careful Pro", ["firstword"])).toBe("The");
  });

  it("builds initials from every word by default", () => {
    expect(applyValueTransforms("The Careful Pro", ["initials"])).toBe("TCP");
  });

  it("limits initials to the given word count", () => {
    expect(applyValueTransforms("The Careful Pro", ["initials:2"])).toBe("TC");
  });

  it("applies a regex and extracts the first capture group", () => {
    expect(applyValueTransforms("Marketing / PR / Creative", ["regex:^(\\w+)"])).toBe("Marketing");
  });

  it("applies a regex with flags and falls back to the full match without a capture group", () => {
    expect(applyValueTransforms("Marketing / PR / Creative", ["regex:creative:i"])).toBe(
      "Creative",
    );
  });

  it("returns the original value when the regex does not match", () => {
    expect(applyValueTransforms("Healthcare", ["regex:^(\\d+)"])).toBe("Healthcare");
  });

  it("returns the original value for an invalid regex instead of throwing", () => {
    expect(applyValueTransforms("Healthcare", ["regex:("])).toBe("Healthcare");
  });

  it("chains a delimiter transform with a case transform", () => {
    expect(applyValueTransforms("Marketing / PR / Creative", ["before:/", "uppercase"])).toBe(
      "MARKETING",
    );
  });
});
