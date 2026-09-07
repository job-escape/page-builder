/**
 * The palette, as the properties a browser needs to resolve a design's props.
 *
 * A design stores `background: var(--bg-brand-solid)`. Nothing in the artifact
 * defines that property, so without this the manifest can carry a perfectly
 * correct table and the funnel still paints nothing.
 */
import { cssVarFromTokenPath, tokenCustomProperties } from "./emit-css";
import { chooseMode, tokensForVariant } from "./tokens";

const tokens = {
  light: { "bg.brand.solid": "#2563eb", "fg.on.brand": "#ffffff" },
  dark: { "bg.brand.solid": "#60a5fa", "fg.on.brand": "#0b1220" },
};

describe("cssVarFromTokenPath", () => {
  it("spells the name the constructor derives and the canvas writes", () => {
    expect(cssVarFromTokenPath("bg.brand.solid")).toBe("--bg-brand-solid");
    expect(cssVarFromTokenPath("colors.amber.100")).toBe("--colors-amber-100");
  });
});

describe("chooseMode", () => {
  it("prefers what the caller asked for", () => {
    expect(chooseMode(tokens, "dark", "light")).toBe("dark");
  });

  it("falls back to the artifact's own default", () => {
    expect(chooseMode(tokens, undefined, "light")).toBe("light");
    // A mode the artifact does not have is not a mode.
    expect(chooseMode(tokens, "sepia", "light")).toBe("light");
  });

  it("needs no name at all when there is only one mode", () => {
    expect(chooseMode({ "Mode 1": {} })).toBe("Mode 1");
  });

  it("is undefined rather than a guess when several modes and no preference", () => {
    expect(chooseMode(tokens)).toBeUndefined();
  });

  it("has nothing to choose without a palette", () => {
    expect(chooseMode(undefined, "dark", "light")).toBeUndefined();
  });
});

describe("tokenCustomProperties", () => {
  it("turns a mode's table into custom properties", () => {
    expect(tokenCustomProperties(tokens, undefined, "light")).toEqual({
      "--bg-brand-solid": "#2563eb",
      "--fg-on-brand": "#ffffff",
    });
  });

  it("reads the mode it was asked for", () => {
    expect(tokenCustomProperties(tokens, "dark", "light")["--bg-brand-solid"]).toBe("#60a5fa");
  });

  it("is empty — not partial — when the artifact carries no palette", () => {
    // The caller renders no wrapper at all on this, so a funnel published
    // before palettes existed keeps exactly the tree it had.
    expect(tokenCustomProperties(undefined)).toEqual({});
    expect(tokenCustomProperties(tokens, undefined, "sepia")).toEqual({});
  });
});

describe("tokensForVariant", () => {
  const tokens = { light: { "bg.brand.solid": "#2563eb" } };
  const themes = {
    control: { light: { "bg.brand.solid": "#2563eb" } },
    warm: { light: { "bg.brand.solid": "#c2410c" } },
  };

  it("reads the named brand's table", () => {
    expect(tokensForVariant(tokens, themes, "warm")!.light["bg.brand.solid"]).toBe("#c2410c");
  });

  it("falls back to the artifact's own table, which is the default brand's", () => {
    // Not nothing: `tokens` already holds the default variant, so a renderer
    // that could not resolve a brand still paints what a visitor was assigned.
    expect(tokensForVariant(tokens, themes, "gone")!.light["bg.brand.solid"]).toBe("#2563eb");
    expect(tokensForVariant(tokens, themes, null)!.light["bg.brand.solid"]).toBe("#2563eb");
    expect(tokensForVariant(tokens, undefined, "warm")!.light["bg.brand.solid"]).toBe("#2563eb");
  });
});
