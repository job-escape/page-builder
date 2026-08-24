import {
  boxFromProps,
  colorFromCss,
  fillFromCss,
  paddingFrom,
  shadowsFromCss,
} from "./adapt-legacy";
import { cssBox, cssStroke } from "./emit-css";

describe("colorFromCss", () => {
  it("collapses every spelling of one colour to one", () => {
    expect(colorFromCss("#FFF")).toBe("#ffffff");
    expect(colorFromCss("#ffffff")).toBe("#ffffff");
    expect(colorFromCss("#ffffffff")).toBe("#ffffff");
    expect(colorFromCss("rgb(255, 255, 255)")).toBe("#ffffff");
  });

  it("keeps alpha when there is any to keep", () => {
    expect(colorFromCss("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
    expect(colorFromCss("#0000")).toBe("#00000000");
  });

  it("reads a token reference as a name, not as CSS", () => {
    expect(colorFromCss("var(--bg-brand-solid-default)")).toEqual({
      $token: "bg.brand.solid.default",
    });
  });

  it("declines what it cannot convert rather than guessing", () => {
    expect(colorFromCss("hotpink")).toBeNull();
    expect(colorFromCss("hsl(200 50% 50%)")).toBeNull();
  });
});

describe("shadowsFromCss", () => {
  // The three forms `lib/stroke-value.ts` writes. If these stop being read as
  // strokes, every bordered frame in every published design loses its border.
  it("reads an outside ring as an outside stroke", () => {
    expect(shadowsFromCss("0 0 0 2px #a86565").stroke).toEqual({
      color: "#a86565",
      width: 2,
      align: "outside",
    });
  });

  it("reads an inset ring as an inside stroke", () => {
    expect(shadowsFromCss("inset 0 0 0 1px #000000").stroke).toEqual({
      color: "#000000",
      width: 1,
      align: "inside",
    });
  });

  it("reads the two-ring form as one centre stroke at double the width", () => {
    expect(shadowsFromCss("0 0 0 1.5px #000000, inset 0 0 0 1.5px #000000").stroke).toEqual({
      color: "#000000",
      width: 3,
      align: "center",
    });
  });

  it("folds a ring's rgba alpha into the stroke colour", () => {
    expect(shadowsFromCss("inset 0 0 0 1px rgba(168, 101, 101, 0.5)").stroke).toEqual({
      color: "#a8656580",
      width: 1,
      align: "inside",
    });
  });

  it("leaves a real shadow alone and finds no stroke in it", () => {
    const { stroke, shadows } = shadowsFromCss("0 4px 12px 0 rgba(0, 0, 0, 0.25)");
    expect(stroke).toBeNull();
    expect(shadows).toEqual([
      { color: "#00000040", x: 0, y: 4, blur: 12, spread: 0, inset: false },
    ]);
  });

  it("separates a stroke from a shadow sharing the key", () => {
    const { stroke, shadows } = shadowsFromCss(
      "inset 0 0 0 1px #000000, 0 4px 12px 0 rgba(0, 0, 0, 0.25)",
    );
    expect(stroke?.align).toBe("inside");
    expect(shadows).toHaveLength(1);
    expect(shadows[0].blur).toBe(12);
  });
});

describe("fillFromCss", () => {
  it("reads a gradient as stops rather than as a string", () => {
    expect(fillFromCss("linear-gradient(90deg, #ffffff 0%, #000000 100%)")).toEqual({
      kind: "linear-gradient",
      angle: 90,
      stops: [
        { color: "#ffffff", at: 0 },
        { color: "#000000", at: 1 },
      ],
    });
  });

  it("defaults an angle-less gradient to the CSS default of to-bottom", () => {
    const fill = fillFromCss("linear-gradient(#ffffff, #000000)");
    expect(fill).toMatchObject({ kind: "linear-gradient", angle: 180 });
  });
});

describe("paddingFrom", () => {
  it("expands all three accepted shapes to the same four edges", () => {
    expect(paddingFrom(16)).toEqual([16, 16, 16, 16]);
    expect(paddingFrom([16, 8])).toEqual([16, 8, 16, 8]);
    expect(paddingFrom([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });
});

/**
 * The migration's safety net.
 *
 * Adapt a frame's props into contract values, emit them straight back as CSS,
 * and the browser should be handed what it was handed before. Web cannot
 * regress from a change it cannot observe — and if one of these ever fails, the
 * contract has lost information the canvas was relying on.
 */
describe("round-trip through the contract", () => {
  it("returns an inside stroke to the exact string it came from", () => {
    const original = "inset 0 0 0 1px #a86565";
    const { stroke } = shadowsFromCss(original);
    expect(cssStroke(stroke!)).toBe(original);
  });

  it("returns a centre stroke to the exact string it came from", () => {
    const original = "0 0 0 1.5px #000000, inset 0 0 0 1.5px #000000";
    const { stroke } = shadowsFromCss(original);
    expect(cssStroke(stroke!)).toBe(original);
  });

  it("preserves a whole frame's box declarations", () => {
    const props = {
      fill: "#ffffff",
      shadow: "inset 0 0 0 1px #e4e4e7",
      radius: 12,
      opacity: 1,
      padding: [24, 24, 24, 24],
    };

    expect(cssBox(boxFromProps(props))).toEqual({
      background: "#ffffff",
      boxShadow: "inset 0 0 0 1px #e4e4e7",
      borderRadius: "12px",
      opacity: 1,
      padding: "24px 24px 24px 24px",
      boxSizing: "border-box",
    });
  });
});
