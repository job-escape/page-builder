/**
 * A visitor who refreshes lands where they were.
 *
 * The runtime's half: say which screen the visitor arrived on (`onScreen`), and
 * open on the one the host hands back (`startScreen`). Where it is kept — a
 * cookie, a profile — is the host's.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";
import { Funnel, type FunnelProps } from "./funnel";
import { screensFromTree } from "./tree-screen";

const source: SourceFunnel = {
  id: "resume",
  version: "v1",
  entry: "s_one",
  variables: [{ name: "opened_two", type: "number", default: 0 }],
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
          id: "why",
          parent: "s_one",
          kind: "frame",
          pos: "a1",
          props: { testId: "why" },
          interactions: [
            { on: { event: "click" }, do: [{ type: "show", target: "s_sheet", as: "overlay" }] },
          ],
        },
        { id: "one", parent: "s_one", kind: "text", pos: "a2", textKey: "one" },
      ],
    },
    {
      id: "s_two",
      frames: [
        {
          id: "s_two",
          parent: null,
          kind: "text",
          pos: "a0",
          textKey: "two",
          interactions: [
            {
              on: { event: "load" },
              do: [
                {
                  type: "set",
                  variable: "opened_two",
                  from: { fn: "add", args: [{ var: "opened_two" }, { lit: 1 }] },
                },
              ],
            },
          ],
        },
      ],
    },
    { id: "s_sheet", frames: [{ id: "s_sheet", parent: null, kind: "text", pos: "a0", textKey: "sheet" }] },
  ],
  locales: { en: { one: "Screen one", two: "Screen two", sheet: "A sheet" } },
};

const compiled = compileToTree(source);
const screens = screensFromTree(compiled);
const manifest: FunnelProps["manifest"] = {
  entry: compiled.manifest.entry,
  variables: compiled.manifest.variables,
  enter: Object.fromEntries(
    compiled.manifest.screens.flatMap((one) => (one.enter?.length ? [[one.id, one.enter]] : [])),
  ),
};

const mount = (props: Partial<FunnelProps>) =>
  render(<Funnel manifest={manifest} screens={screens} locale={source.locales!.en} {...props} />);

describe("startScreen", () => {
  it("opens on the screen the host hands back", () => {
    mount({ startScreen: "s_two" });
    expect(screen.getByText("Screen two")).toBeInTheDocument();
    expect(screen.queryByText("Screen one")).not.toBeInTheDocument();
  });

  it("runs that screen's opening steps, once, as for any screen arrived on", async () => {
    const onAnswer = jest.fn();
    mount({ startScreen: "s_two", onAnswer });
    await act(async () => {});
    expect(onAnswer.mock.calls.filter(([name]) => name === "opened_two")).toEqual([["opened_two", 1]]);
  });

  it("opens on the entry, and says so, for a screen the funnel does not have", () => {
    const onUnknown = jest.fn();
    mount({ startScreen: "s_deleted", onUnknown });
    expect(screen.getByText("Screen one")).toBeInTheDocument();
    expect(onUnknown).toHaveBeenCalledWith("target", "s_deleted");
  });

  it("does not move a visitor who is already somewhere when it changes", () => {
    const { rerender } = mount({});
    fireEvent.click(screen.getByTestId("go"));
    rerender(
      <Funnel manifest={manifest} screens={screens} locale={source.locales!.en} startScreen="s_one" />,
    );
    expect(screen.getByText("Screen two")).toBeInTheDocument();
  });
});

describe("onScreen", () => {
  it("says each screen arrived on, and not the one opened on", () => {
    const onScreen = jest.fn();
    mount({ onScreen });
    expect(onScreen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("go"));

    expect(onScreen.mock.calls).toEqual([["s_two"]]);
  });

  it("does not report an overlay as a screen", () => {
    const onScreen = jest.fn();
    mount({ onScreen });
    fireEvent.click(screen.getByTestId("why"));
    expect(screen.getByText("A sheet")).toBeInTheDocument();
    expect(onScreen).not.toHaveBeenCalled();
  });

  it("does not report the resumed screen on opening", () => {
    const onScreen = jest.fn();
    mount({ startScreen: "s_two", onScreen });
    expect(onScreen).not.toHaveBeenCalled();
  });
});
