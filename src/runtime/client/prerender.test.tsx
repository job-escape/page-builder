/**
 * Screens fetched when they are needed, and screens drawn before they are.
 *
 * `loadScreen` is tested on whatever React is installed. Prerendering needs
 * React's `<Activity>` (19.2 and later): its cases run where it exists and are
 * skipped where it does not, and on an older React the funnel is checked to
 * draw exactly what it drew before.
 *
 * What prerendering has to get right is the timing the design already relies
 * on — a frame's `load` steps run when the visitor *arrives*, once — and that
 * arriving reveals the screen drawn ahead rather than building a second one.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { Funnel, type FunnelProps, type ScreenModule } from "./funnel";
import { screensFromTree } from "./tree-screen";

const hasActivity = "Activity" in React;

/** One screen leading to two; the first of them does something when it appears. */
const source: SourceFunnel = {
  id: "prerender",
  version: "v1",
  entry: "s_one",
  variables: [{ name: "arrived", type: "boolean", default: false }],
  screens: [
    {
      id: "s_one",
      frames: [
        { id: "s_one", parent: null, kind: "frame", pos: "a0" },
        {
          id: "go",
          parent: "s_one",
          kind: "frame",
          pos: "a0",
          props: { testId: "go" },
          interactions: [{ on: { event: "click" }, do: [{ type: "show", target: "s_two" }] }],
        },
        {
          id: "elsewhere",
          parent: "s_one",
          kind: "frame",
          pos: "a1",
          props: { testId: "elsewhere" },
          interactions: [{ on: { event: "click" }, do: [{ type: "show", target: "s_three" }] }],
        },
        { id: "one", parent: "s_one", kind: "text", pos: "a2", textKey: "one" },
      ],
    },
    {
      id: "s_two",
      frames: [
        { id: "s_two", parent: null, kind: "frame", pos: "a0" },
        {
          id: "hero",
          parent: "s_two",
          kind: "frame",
          pos: "a0",
          interactions: [
            { on: { event: "load" }, do: [{ type: "set", variable: "arrived", value: true }] },
          ],
        },
        { id: "two", parent: "s_two", kind: "text", pos: "a1", textKey: "two" },
      ],
    },
    {
      id: "s_three",
      frames: [{ id: "s_three", parent: null, kind: "text", pos: "a0", textKey: "three" }],
    },
  ],
  locales: { en: { one: "Screen one", two: "Screen two", three: "Screen three" } },
};

const compiled = compileToTree(source);
const modules = screensFromTree(compiled);
/** The manifest as a host forwards it: presentations, and where each screen leads. */
const manifest: FunnelProps["manifest"] = {
  entry: compiled.manifest.entry,
  variables: compiled.manifest.variables,
  screens: Object.fromEntries(compiled.manifest.screens.map((one) => [one.id, one.presentation])),
  next: Object.fromEntries(compiled.manifest.screens.map((one) => [one.id, one.next])),
};

/** A loader over the compiled modules that records what it was asked for. */
const loaderOf = (fail: string[] = []) => {
  const asked: string[] = [];
  const failing = new Set(fail);
  const load = jest.fn(async (id: string): Promise<ScreenModule | null> => {
    asked.push(id);
    if (failing.delete(id)) throw new Error(`offline: ${id}`);
    return modules[id] ?? null;
  });
  return { load, asked };
};

/** Let loaders resolve and React commit what they returned. */
const settle = () => act(async () => {});

const mount = (props: Partial<FunnelProps>) =>
  render(<Funnel manifest={manifest} screens={{}} locale={source.locales!.en} {...props} />);

describe("loadScreen", () => {
  it("fetches the entry when the host did not hand it over", async () => {
    const { load } = loaderOf();
    mount({ loadScreen: load });
    expect(await screen.findByText("Screen one")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("s_one");
  });

  it("goes to a screen not fetched yet, and draws it when it arrives", async () => {
    const { load } = loaderOf();
    const onUnknown = jest.fn();
    mount({ screens: { s_one: modules.s_one! }, loadScreen: load, onUnknown });

    fireEvent.click(screen.getByTestId("go"));

    expect(await screen.findByText("Screen two")).toBeInTheDocument();
    expect(screen.queryByText("Screen one")).not.toBeInTheDocument();
    expect(onUnknown).not.toHaveBeenCalledWith("target", "s_two");
  });

  it("asks for nothing ahead without prerender", async () => {
    const { load, asked } = loaderOf();
    mount({ screens: { s_one: modules.s_one! }, loadScreen: load });
    await settle();
    expect(asked).toEqual([]);
  });

  it("fetches the screens ahead with prerender, capped at its count", async () => {
    const { load, asked } = loaderOf();
    mount({ screens: { s_one: modules.s_one! }, loadScreen: load, prerender: 1 });
    await settle();
    // `next` is sorted, so the first screen ahead is s_three.
    expect(asked).toEqual(["s_three"]);
  });

  it("asks again when a failed screen is wanted anew, never in a loop", async () => {
    const { load, asked } = loaderOf(["s_three"]);
    mount({ screens: { s_one: modules.s_one! }, loadScreen: load, prerender: 1 });
    await settle();
    await settle();
    expect(asked).toEqual(["s_three"]);

    fireEvent.click(screen.getByTestId("elsewhere"));

    expect(await screen.findByText("Screen three")).toBeInTheDocument();
    expect(asked).toEqual(["s_three", "s_three"]);
  });

  it("keeps the visitor where they are when a screen arrives", async () => {
    const { load } = loaderOf();
    mount({ screens: { s_one: modules.s_one! }, loadScreen: load, prerender: 2 });
    fireEvent.click(screen.getByTestId("go"));
    await settle();
    await settle();
    // A navigator rebuilt by a growing set of screens would be back at s_one.
    expect(screen.getByText("Screen two")).toBeVisible();
  });
});

(hasActivity ? describe : describe.skip)("prerender, with <Activity>", () => {
  const all = { ...modules };

  it("draws the next screen ahead, hidden", () => {
    mount({ screens: all, prerender: 1 });
    expect(screen.getByText("Screen one")).toBeVisible();
    expect(screen.getByText("Screen three")).toBeInTheDocument();
    expect(screen.getByText("Screen three")).not.toBeVisible();
  });

  it("draws no more than it was asked to", () => {
    mount({ screens: all, prerender: 1 });
    expect(screen.queryByText("Screen two")).not.toBeInTheDocument();
  });

  it("holds back a load step until the visitor arrives, then runs it once", async () => {
    const onAnswer = jest.fn();
    mount({ screens: all, prerender: 2, onAnswer });
    expect(screen.getByText("Screen two")).not.toBeVisible();
    await settle();
    expect(onAnswer).not.toHaveBeenCalledWith("arrived", true);

    fireEvent.click(screen.getByTestId("go"));
    await settle();

    expect(onAnswer.mock.calls.filter(([name]) => name === "arrived")).toEqual([["arrived", true]]);
  });

  it("reveals the screen drawn ahead rather than building another", async () => {
    mount({ screens: all, prerender: 2 });
    const drawnAhead = screen.getByText("Screen two");

    fireEvent.click(screen.getByTestId("go"));
    await settle();

    expect(screen.getByText("Screen two")).toBe(drawnAhead);
    expect(drawnAhead).toBeVisible();
    expect(screen.queryByText("Screen one")).not.toBeInTheDocument();
  });

  it("does not remount the current screen when a screen ahead arrives", async () => {
    const onAnswer = jest.fn();
    // s_two is the entry here so its load step can be counted while s_one…
    // …is fetched behind it; a remount would run the step a second time.
    const { load } = loaderOf();
    mount({
      manifest: { ...manifest, entry: "s_two", next: { s_two: ["s_one"] } },
      screens: { s_two: modules.s_two! },
      loadScreen: load,
      prerender: 1,
      onAnswer,
    });
    await settle();
    await settle();

    expect(load).toHaveBeenCalledWith("s_one");
    expect(screen.getByText("Screen one")).not.toBeVisible();
    expect(onAnswer.mock.calls.filter(([name]) => name === "arrived")).toHaveLength(1);
  });
});

(hasActivity ? describe.skip : describe)("prerender, on a React without <Activity>", () => {
  it("draws only the current screen, as before", () => {
    mount({ screens: { ...modules }, prerender: 2 });
    expect(screen.getByText("Screen one")).toBeVisible();
    expect(screen.queryByText("Screen two")).not.toBeInTheDocument();
    expect(screen.queryByText("Screen three")).not.toBeInTheDocument();
  });
});
