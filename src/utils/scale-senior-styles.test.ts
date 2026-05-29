import { describe, expect, it } from "@jest/globals";

import {
  SENIOR_DEFAULT_FACTOR,
  resolveSeniorFactor,
  scaleCssValue,
  scaleSeniorStyleString,
  scaleSeniorStyles,
} from "./scale-senior-styles";

describe("scaleCssValue", () => {
  it("scales px values", () => {
    expect(scaleCssValue("16px", 1.25)).toBe("20px");
  });

  it("scales rem/em/pt/ch values", () => {
    expect(scaleCssValue("1rem", 1.5)).toBe("1.5rem");
    expect(scaleCssValue("2em", 1.25)).toBe("2.5em");
  });

  it("scales each token of a shorthand value", () => {
    expect(scaleCssValue("8px 16px", 1.25)).toBe("10px 20px");
  });

  it("leaves unitless values untouched (e.g. line-height ratio)", () => {
    expect(scaleCssValue("1.5", 1.25)).toBe("1.5");
  });

  it("leaves percentage values untouched", () => {
    expect(scaleCssValue("120%", 1.25)).toBe("120%");
  });

  it("leaves non-length tokens in a shorthand untouched", () => {
    expect(scaleCssValue("2px solid red", 1.25)).toBe("2.5px solid red");
  });

  it("does not scale complex expressions", () => {
    expect(scaleCssValue("calc(100% - 8px)", 1.25)).toBe("calc(100% - 8px)");
    expect(scaleCssValue("clamp(16px, 2vw, 24px)", 1.25)).toBe("clamp(16px, 2vw, 24px)");
    expect(scaleCssValue("min(3dvw, 20px)", 1.25)).toBe("min(3dvw, 20px)");
  });

  it("handles negative values", () => {
    expect(scaleCssValue("-0.5px", 1.25)).toBe("-0.625px");
  });
});

describe("scaleSeniorStyles", () => {
  it("scales only allowlisted typography/spacing properties", () => {
    const input = {
      fontSize: "16px",
      lineHeight: "24px",
      padding: "8px 16px",
      gap: "12px",
      color: "#000000",
      width: "200px",
      margin: "10px",
    };
    expect(scaleSeniorStyles(input, 1.25)).toEqual({
      fontSize: "20px",
      lineHeight: "30px",
      padding: "10px 20px",
      gap: "15px",
      color: "#000000",
      width: "200px",
      margin: "10px",
    });
  });

  it("returns the input unchanged for factor 1", () => {
    const input = { fontSize: "16px" };
    expect(scaleSeniorStyles(input, 1)).toBe(input);
  });
});

describe("scaleSeniorStyleString", () => {
  it("scales allowlisted props in a raw inline-style string", () => {
    expect(scaleSeniorStyleString("font-size: 16px; color: #000; padding: 8px", 1.25)).toBe(
      "font-size: 20px; color: #000; padding: 10px",
    );
  });

  it("scales the text span case (font-size only)", () => {
    expect(scaleSeniorStyleString("font-size: 28px", 1.25)).toBe("font-size: 35px");
  });

  it("leaves non-allowlisted props and complex values untouched", () => {
    expect(scaleSeniorStyleString("width: 200px; font-size: min(3dvw, 20px)", 1.25)).toBe(
      "width: 200px; font-size: min(3dvw, 20px)",
    );
  });

  it("is a no-op for factor 1 or empty input", () => {
    expect(scaleSeniorStyleString("font-size: 16px", 1)).toBe("font-size: 16px");
    expect(scaleSeniorStyleString("", 1.25)).toBe("");
  });
});

describe("resolveSeniorFactor", () => {
  it("defaults to the senior factor when the attribute is absent", () => {
    expect(resolveSeniorFactor({})).toBe(SENIOR_DEFAULT_FACTOR);
    expect(resolveSeniorFactor(undefined)).toBe(SENIOR_DEFAULT_FACTOR);
  });

  it("returns the default factor for senior=\"true\" or a value-less attribute", () => {
    expect(resolveSeniorFactor({ senior: "true" })).toBe(SENIOR_DEFAULT_FACTOR);
    expect(resolveSeniorFactor({ senior: "" })).toBe(SENIOR_DEFAULT_FACTOR);
  });

  it("returns a custom numeric factor", () => {
    expect(resolveSeniorFactor({ senior: "1.4" })).toBe(1.4);
  });

  it("turns senior off only for an explicit senior=\"false\"", () => {
    expect(resolveSeniorFactor({ senior: "false" })).toBeNull();
  });

  it("falls back to the default factor for invalid values", () => {
    expect(resolveSeniorFactor({ senior: "0" })).toBe(SENIOR_DEFAULT_FACTOR);
    expect(resolveSeniorFactor({ senior: "huge" })).toBe(SENIOR_DEFAULT_FACTOR);
  });
});
