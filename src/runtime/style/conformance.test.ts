/**
 * One palette, two renderers, one answer.
 *
 * The contract's rule is that a construct does not exist until it has a
 * fixture, and a renderer may not claim a capability until it passes them. This
 * is that suite for colour: every case is run through *both* emitters and the
 * resolved literal has to match, because the failure this guards against is not
 * a crash — it is web and native quietly disagreeing about one colour and
 * nobody noticing until a screenshot from a phone looks wrong.
 *
 * Written as data rather than as a test per case on purpose. Adding a construct
 * means adding a row, which is the whole point of holding renderers to fixtures
 * instead of to each other's source.
 */
import { boxFromProps } from "./adapt-legacy";
import { cssBox, cssColor } from "./emit-css";
import { nativeBox, nativeColor } from "./emit-native";
import type { ResolvedTokens } from "./tokens";

const tokens: ResolvedTokens = {
  light: {
    "bg.brand.solid": "#2563eb",
    "fg.on.brand": "#ffffff",
    "border.subtle": "#e2e8f0",
  },
  dark: {
    "bg.brand.solid": "#60a5fa",
    "fg.on.brand": "#0b1220",
    "border.subtle": "#1e293b",
  },
};

type Case = {
  name: string;
  props: Record<string, unknown>;
  mode: string;
  /** The literal both renderers must end up painting. */
  expect: string;
};

const CASES: Case[] = [
  {
    name: "a fill naming a token",
    props: { fill: "var(--bg-brand-solid)" },
    mode: "light",
    expect: "#2563eb",
  },
  {
    name: "the same fill in the other mode",
    props: { fill: "var(--bg-brand-solid)" },
    mode: "dark",
    expect: "#60a5fa",
  },
  {
    name: "a literal fill, which no lookup should touch",
    props: { fill: "#ff8800" },
    mode: "light",
    expect: "#ff8800",
  },
  {
    name: "a token named with a fallback, which is ignored on the way in",
    props: { fill: "var(--bg-brand-solid, #000000)" },
    mode: "light",
    expect: "#2563eb",
  },
  {
    name: "a token spelled in capitals",
    props: { fill: "var(--BG-BRAND-SOLID)" },
    mode: "light",
    expect: "#2563eb",
  },
];

describe("colour conformance", () => {
  CASES.forEach((testCase) => {
    it(`${testCase.name}: both renderers paint ${testCase.expect}`, () => {
      const box = boxFromProps(testCase.props);
      const lookup = { tokens, mode: testCase.mode };

      const css = cssBox(box, lookup);
      const native = nativeBox(box, lookup);

      // Web puts it in `background`; native in `backgroundColor`. Different
      // keys, same colour — that is exactly the equivalence under test.
      expect(css.background).toBe(testCase.expect);
      expect(native.style.backgroundColor).toBe(testCase.expect);
    });
  });

  it("resolves a bare colour identically through both", () => {
    const color = { $token: "fg.on.brand" };
    const lookup = { tokens, mode: "dark" };

    expect(cssColor(color, lookup)).toBe("#0b1220");
    expect(nativeColor(color, lookup)).toBe("#0b1220");
  });

  it("reports a missing token to both, rather than inventing a colour", () => {
    const missing: string[] = [];
    const lookup = { tokens, mode: "light", onMissing: (p: string) => missing.push(p) };
    const color = { $token: "nope.at.all" };

    // Undefined on both sides: a renderer that substituted its own colour would
    // be a renderer inventing design, and the two would invent differently.
    expect(cssColor(color, lookup)).toBeUndefined();
    expect(nativeColor(color, lookup)).toBeUndefined();
    expect(missing).toEqual(["nope.at.all", "nope.at.all"]);
  });

  it("resolves nothing when the artifact carries no palette", () => {
    const color = { $token: "bg.brand.solid" };

    expect(cssColor(color, {})).toBeUndefined();
    expect(nativeColor(color, {})).toBeUndefined();
  });
});
