import { boxFromProps } from "./adapt-legacy";
import { nativeBox, nativeLineHeight, nativeSize } from "./emit-native";
import type { ResolvedTokens } from "./tokens";

const tokens: ResolvedTokens = {
  light: { "bg.brand.solid": "#2563eb" },
  dark: { "bg.brand.solid": "#60a5fa" },
};

describe("nativeBox", () => {
  it("draws an inside stroke as a border, which is what a border is", () => {
    const { style, overlayStroke } = nativeBox(boxFromProps({ shadow: "inset 0 0 0 1px #000000" }));
    expect(style).toMatchObject({ borderWidth: 1, borderColor: "#000000" });
    expect(overlayStroke).toBeUndefined();
  });

  it("hands an outside stroke back as an overlay, because a border would move the box", () => {
    const { style, overlayStroke } = nativeBox(boxFromProps({ shadow: "0 0 0 2px #a86565" }));
    expect(style.borderWidth).toBeUndefined();
    expect(overlayStroke).toEqual({ color: "#a86565", width: 2, inset: 2 });
  });

  it("insets a centre stroke by half its width", () => {
    const box = boxFromProps({ shadow: "0 0 0 1.5px #000000, inset 0 0 0 1.5px #000000" });
    expect(nativeBox(box).overlayStroke).toMatchObject({ width: 3, inset: 1.5 });
  });

  it("returns a gradient as a component's props, never as a style key", () => {
    const box = boxFromProps({ fill: "linear-gradient(90deg, #ffffff 0%, #000000 100%)" });
    const { style, gradient } = nativeBox(box);
    expect(style.backgroundColor).toBeUndefined();
    expect(gradient).toEqual({ angle: 90, colors: ["#ffffff", "#000000"], locations: [0, 1] });
  });

  it("resolves a token against the mode being rendered", () => {
    const box = boxFromProps({ fill: "var(--bg-brand-solid)" });
    expect(nativeBox(box, { tokens, mode: "light" }).style.backgroundColor).toBe("#2563eb");
    expect(nativeBox(box, { tokens, mode: "dark" }).style.backgroundColor).toBe("#60a5fa");
  });

  it("reports a missing token instead of painting something arbitrary", () => {
    const missing: string[] = [];
    const box = boxFromProps({ fill: "var(--bg-nonexistent)" });
    const { style } = nativeBox(box, { tokens, mode: "light", onMissing: (p) => missing.push(p) });

    expect(style.backgroundColor).toBeUndefined();
    expect(missing).toEqual(["bg.nonexistent"]);
  });

  it("expands padding into the four keys React Native actually reads", () => {
    const { style } = nativeBox(boxFromProps({ padding: [24, 16] }));
    expect(style).toMatchObject({
      paddingTop: 24,
      paddingRight: 16,
      paddingBottom: 24,
      paddingLeft: 16,
    });
  });

  it("names what it could not draw rather than dropping it silently", () => {
    const { unsupported } = nativeBox(
      boxFromProps({ shadow: "inset 2px 2px 4px 0 rgba(0, 0, 0, 0.5)" }),
    );
    expect(unsupported).toContain("shadow.inset");
  });
});

describe("nativeLineHeight", () => {
  /**
   * The bug this contract exists to make impossible: the web brick's unitless
   * 1.4 read by React Native as a 1.4-point line, stacking every row of text on
   * top of the last.
   */
  it("resolves a multiple against the font size", () => {
    expect(nativeLineHeight({ kind: "multiple", value: 1.4 }, 20)).toBe(28);
  });

  it("passes an absolute line height through untouched", () => {
    expect(nativeLineHeight({ kind: "px", value: 24 }, 20)).toBe(24);
  });
});

describe("nativeSize", () => {
  it("turns fill into flex rather than a percentage React Native cannot honour", () => {
    expect(nativeSize("fill", "width")).toEqual({ flexGrow: 1, flexShrink: 1, flexBasis: 0 });
  });

  it("says nothing for hug, which is what an intrinsic size is in Yoga", () => {
    expect(nativeSize("hug", "height")).toEqual({});
  });

  it("keeps a fixed size on its own axis", () => {
    expect(nativeSize(48, "height")).toEqual({ height: 48 });
  });
});
