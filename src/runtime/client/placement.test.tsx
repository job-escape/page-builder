/**
 * A child placed by its parent, rather than stacked against its corner.
 *
 * A frame with no auto layout positions what is in it by hand, and until this
 * the published funnel had no way to say so: the canvas drew a label a third of
 * the way down an artboard and the funnel drew it at the top, because block
 * flow was the only arrangement a `layout: "none"` frame had.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { compile } from "../compiler/emit";
import type { SourceFunnel } from "../compiler/source";
import { compileToTree } from "../compiler/tree";

import { ui } from "./bricks";
import { Funnel, type ScreenModule } from "./funnel";
import { screensFromTree } from "./tree-screen";

const box = (props: Record<string, unknown>) =>
  ui.Frame({ testId: "child", role: "button", ariaLabel: "x", onClick: () => {}, ...props });

describe("a placed child", () => {
  it("is taken out of the flow and put where it was drawn", () => {
    render(<>{box({ x: 40, y: 120 })}</>);
    expect(screen.getByTestId("child")).toHaveStyle({
      position: "absolute",
      left: "40px",
      top: "120px",
    });
  });

  it("reads one of the two as zero rather than as unset", () => {
    render(<>{box({ y: 12 })}</>);
    expect(screen.getByTestId("child")).toHaveStyle({ left: "0px", top: "12px" });
  });

  it("is left in the flow when it was never placed", () => {
    render(<>{box({})}</>);
    expect(screen.getByTestId("child")).not.toHaveStyle({ position: "absolute" });
  });

  it("lets an authored style have the last word, as every other prop does", () => {
    render(<>{box({ x: 40, y: 10, style: { position: "fixed" } })}</>);
    expect(screen.getByTestId("child")).toHaveStyle({ position: "fixed" });
  });
});

describe("the parent that places them", () => {
  it("becomes the box they are measured from", () => {
    render(<>{ui.Frame({ testId: "parent", places: true, onClick: () => {}, role: "button", ariaLabel: "p" })}</>);
    expect(screen.getByTestId("parent")).toHaveStyle({ position: "relative" });
  });

  it("is unchanged where nothing was placed into it — block flow, as before", () => {
    render(<>{ui.Frame({ testId: "parent", onClick: () => {}, role: "button", ariaLabel: "p" })}</>);
    const node = screen.getByTestId("parent");
    expect(node).toHaveStyle({ display: "block" });
    expect(node).not.toHaveStyle({ position: "relative" });
  });

  it("is absolute rather than relative when it both places and is placed", () => {
    render(
      <>
        {ui.Frame({
          testId: "both",
          places: true,
          x: 8,
          y: 9,
          onClick: () => {},
          role: "button",
          ariaLabel: "b",
        })}
      </>,
    );
    expect(screen.getByTestId("both")).toHaveStyle({ position: "absolute", left: "8px" });
  });
});

describe("every brick a parent can place", () => {
  it("places words", () => {
    render(<>{ui.Text({ testId: "t", x: 5, y: 6, onClick: () => {}, role: "button", ariaLabel: "t" }, "hi")}</>);
    expect(screen.getByTestId("t")).toHaveStyle({ position: "absolute", left: "5px", top: "6px" });
  });

  it("places a picture", () => {
    render(<>{ui.Image({ src: "/a.png", alt: "a", x: 7, y: 8 })}</>);
    expect(screen.getByAltText("a")).toHaveStyle({ position: "absolute", left: "7px", top: "8px" });
  });

  it("places a field", () => {
    render(<>{ui.Input({ ariaLabel: "name", x: 1, y: 2 })}</>);
    expect(screen.getByLabelText("name")).toHaveStyle({ position: "absolute", left: "1px", top: "2px" });
  });
});

/**
 * And through the two things that actually publish a funnel.
 *
 * `emit` writes a JavaScript module and `compileToTree` writes data a walker
 * reads; the web funnel runs one and the native one runs the other, so a prop
 * that reaches the brick down one path and not the other is the divergence
 * these two renderers exist to avoid. The props go in as the constructor's
 * `source` endpoint writes them.
 */
describe("a placement reaches the brick down both publishing paths", () => {
  const artboard: SourceFunnel = {
    id: 1,
    version: "1",
    entry: "board",
    variables: [],
    screens: [
      {
        id: "board",
        frames: [
          {
            id: "board",
            parent: null,
            kind: "frame",
            pos: "a0",
            props: { width: 390, height: 844, places: true },
          },
          {
            id: "cta",
            parent: "board",
            kind: "frame",
            pos: "a0",
            props: { width: 194, height: 96, x: 96, y: 440, testId: "cta" },
          },
        ],
      },
    ],
  };

  it("compiles to a module that places it", () => {
    const { modules } = compile(artboard);
    const body = (modules.board as string).replace(
      "export default function Screen",
      "return function Screen",
    );
    // eslint-disable-next-line no-new-func -- what the web runtime does with a fetched module
    const Screen = new Function(body)() as ScreenModule;
    render(<Funnel manifest={{ entry: "board", variables: [] }} screens={{ board: Screen }} />);
    expect(screen.getByTestId("cta")).toHaveStyle({ position: "absolute", left: "96px" });
  });

  it("compiles to a tree that places it, identically", () => {
    const screens = screensFromTree(compileToTree(artboard));
    render(<Funnel manifest={{ entry: "board", variables: [] }} screens={screens} />);
    expect(screen.getByTestId("cta")).toHaveStyle({ position: "absolute", left: "96px" });
  });
});
