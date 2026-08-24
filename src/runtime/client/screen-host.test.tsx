import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { compileToTree } from "../compiler/tree";
import { locale, source } from "../compiler/fixture";
import { Funnel } from "./funnel";
import { screensFromTree } from "./tree-screen";

/**
 * A screen's surface, honoured from the artifact.
 *
 * These are the fixtures the native host will be held to as well — same input,
 * each platform honouring what it has. Web scrolls its document and has no
 * system chrome, so it implements one field of four and ignores the rest on
 * purpose; asserting *that* is what stops someone later inventing browser
 * behaviour for a status bar that does not exist.
 */
const compiled = compileToTree(source);

function mount(presentation?: Record<string, ReturnType<typeof presentationFor>>) {
  return render(
    <Funnel
      manifest={{
        entry: compiled.manifest.entry,
        variables: compiled.manifest.variables,
        overlayDefaults: compiled.manifest.overlayDefaults,
        ...(presentation ? { screens: presentation } : {}),
      }}
      screens={screensFromTree(compiled)}
      locale={locale}
    />,
  );
}

const presentationFor = (over: Partial<(typeof compiled.manifest.screens)[number]["presentation"]>) => ({
  scroll: true,
  bleed: false,
  statusBar: "auto" as const,
  keyboard: false,
  ...over,
});

const host = (container: HTMLElement) =>
  container.querySelector("[data-funnel-screen]") as HTMLElement;

describe("the screen host", () => {
  it("wraps the screen, so every screen has a surface", () => {
    const { container } = mount();
    expect(host(container)).toBeInTheDocument();
    expect(screen.getByText("What's your goal?")).toBeInTheDocument();
  });

  it("leaves scrolling to the document when the screen scrolls", () => {
    const { container } = mount({ [compiled.manifest.entry]: presentationFor({ scroll: true }) });
    // Not `overflow: auto` — the browser already does this, and saying it again
    // would create a second scroll container inside the page's own.
    expect(host(container).style.overflow).toBe("");
  });

  it("locks a fixed screen, which is what a pinned call to action needs", () => {
    const { container } = mount({ [compiled.manifest.entry]: presentationFor({ scroll: false }) });
    expect(host(container).style.overflow).toBe("hidden");
    // The height is `100dvh`, which jsdom's CSSOM drops as an unknown unit — so
    // it cannot be asserted here. `dvh` is deliberate rather than `vh`: on a
    // phone browser `vh` ignores the collapsing address bar and a pinned button
    // ends up under it, which is the exact bug a fixed screen is avoiding.
  });

  it("ignores what a browser has no equivalent for", () => {
    const { container } = mount({
      [compiled.manifest.entry]: presentationFor({ bleed: true, statusBar: "light", keyboard: true }),
    });
    // A browser has no system chrome to bleed under and no status bar to tint.
    // Inventing behaviour for them is how one platform starts drifting.
    expect(host(container).style.height).toBe("");
    expect(host(container).style.overflow).toBe("");
  });

  it("falls back to the compiler's own defaults for an older artifact", () => {
    // A manifest published before per-screen presentation existed carries none.
    const { container } = mount();
    expect(host(container).style.overflow).toBe("");
  });
});
