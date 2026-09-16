/**
 * A frame that does something when it appears — `load`, on something nested.
 *
 * A screen's `load` is the funnel's opening and goes to `ScreenIndex.enter`; a
 * frame inside one is the other question, and the answer is a mount. That
 * difference is the whole of what is tested here: where the steps end up, when
 * they run, and that they run once.
 *
 * The case it exists for is a component — a loader placed on a screen, starting
 * its own animation without the screen having to know it is there.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { Funnel } from "./funnel";
import { screensFromTree } from "./tree-screen";

/** A loader that is a frame *on* the screen, as an instance of a component is. */
const placed: SourceFunnel = {
  id: "placed-loader",
  version: "v1",
  entry: "s_one",
  variables: [{ name: "progress", type: "number", screen: "s_one", default: 0 }],
  screens: [
    {
      id: "s_one",
      frames: [
        { id: "s_one", parent: null, kind: "frame", pos: "a0" },
        {
          id: "loader",
          parent: "s_one",
          kind: "frame",
          pos: "a0",
          interactions: [
            {
              on: { event: "load" },
              do: [
                {
                  type: "animate",
                  variable: "progress",
                  from: { lit: 0 },
                  to: { lit: 100 },
                  ms: 120,
                  easing: "linear",
                },
                { type: "show", target: "s_two" },
              ],
            },
          ],
        },
        {
          id: "label",
          parent: "loader",
          kind: "text",
          pos: "a0",
          textKey: "label",
          props: { testId: "label" },
          params: { pct: { fn: "format", args: [{ var: "progress" }, { lit: "percent" }] } },
        },
      ],
    },
    { id: "s_two", frames: [{ id: "s_two", parent: null, kind: "text", pos: "a0", textKey: "done" }] },
  ],
  locales: { en: { label: "Building {pct}", done: "Ready" } },
};

/** A frame that is not drawn until a tap says so, and counts its own appearances. */
const gated: SourceFunnel = {
  id: "gated-panel",
  version: "v1",
  entry: "s_one",
  variables: [
    { name: "open", type: "boolean", screen: "s_one", default: false },
    { name: "seen", type: "number", screen: "s_one", default: 0 },
  ],
  screens: [
    {
      id: "s_one",
      frames: [
        { id: "s_one", parent: null, kind: "frame", pos: "a0" },
        {
          id: "toggle",
          parent: "s_one",
          kind: "frame",
          pos: "a0",
          props: { testId: "toggle" },
          interactions: [
            { on: { event: "click" }, do: [{ type: "set", variable: "open", value: true }] },
          ],
        },
        {
          id: "panel",
          parent: "s_one",
          pos: "a1",
          kind: "frame",
          when: { op: "eq", variable: "open", value: true },
          interactions: [
            {
              on: { event: "load" },
              do: [
                {
                  type: "set",
                  variable: "seen",
                  from: { fn: "add", args: [{ var: "seen" }, { lit: 1 }] },
                },
              ],
            },
          ],
        },
        {
          id: "count",
          parent: "s_one",
          kind: "text",
          pos: "a2",
          textKey: "count",
          props: { testId: "count" },
          params: { seen: { var: "seen" } },
        },
      ],
    },
  ],
  locales: { en: { count: "seen {seen}" } },
};

const mount = (source: SourceFunnel) => {
  const compiled = compileToTree(source);
  return render(
    <Funnel
      manifest={{ entry: compiled.manifest.entry, variables: compiled.manifest.variables }}
      screens={screensFromTree(compiled)}
      locale={source.locales!.en}
    />,
  );
};

describe("where a load ends up", () => {
  it("is on the node, for a frame inside a screen", () => {
    const { screens } = compileToTree(placed);
    const loader = screens.s_one!.roots[0]!.kind === "frame" ? screens.s_one!.roots[0]! : null;
    const node = (loader as { children: { id: string; onLoad?: unknown[] }[] }).children[0];

    expect(node?.id).toBe("loader");
    expect(node?.onLoad).toHaveLength(2);
  });

  it("is the screen's own opening, for the top-level frame — and not both", () => {
    const source: SourceFunnel = {
      ...placed,
      screens: [
        {
          id: "s_one",
          frames: [
            {
              ...placed.screens[0]!.frames[0]!,
              interactions: placed.screens[0]!.frames[1]!.interactions,
            },
          ],
        },
        placed.screens[1]!,
      ],
    };
    const { manifest, screens } = compileToTree(source);

    const entry = manifest.screens.find((one) => one.id === "s_one");
    expect(entry?.enter).toHaveLength(2);
    expect(screens.s_one!.roots[0]).not.toHaveProperty("onLoad");
  });
});

describe("a loader placed on a screen", () => {
  it("starts itself when it appears, and moves on when it arrives", async () => {
    mount(placed);
    expect(screen.getByTestId("label")).toHaveTextContent("Building 0%");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});

describe("a frame that is drawn later", () => {
  it("waits for the condition, and runs its steps once", async () => {
    mount(gated);
    expect(screen.getByTestId("count")).toHaveTextContent("seen 0");

    await act(async () => {
      fireEvent.click(screen.getByTestId("toggle"));
    });
    expect(screen.getByTestId("count")).toHaveTextContent("seen 1");

    // A re-render is not an appearance: the step wrote `seen`, which redraws
    // the screen, and a second run here would be a loop.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByTestId("count")).toHaveTextContent("seen 1");
  });
});
