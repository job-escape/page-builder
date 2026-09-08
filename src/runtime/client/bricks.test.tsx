/**
 * The bricks, exercised as the compiler drives them.
 *
 * Specifically: every brick the compiler can put an `onClick` on has to act on
 * it. `Text` did not — it destructured a fixed prop list that omitted the
 * handler, so navigation attached to a line of copy silently did nothing in the
 * funnel while compiling, publishing and rendering without a single error.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import { ui } from "./bricks";

const clickable = (brick: "Frame" | "Text", onClick: () => void) =>
  ui[brick]({ onClick, testId: "target", role: "button", ariaLabel: "Go" }, "Continue");

describe.each(["Frame", "Text"] as const)("%s, when the compiler gives it an onClick", (brick) => {
  it("calls it when clicked", () => {
    const onClick = jest.fn();
    render(<>{clickable(brick, onClick)}</>);

    fireEvent.click(screen.getByTestId("target"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls it on Enter and Space, since it is not a button", () => {
    const onClick = jest.fn();
    render(<>{clickable(brick, onClick)}</>);

    fireEvent.keyDown(screen.getByTestId("target"), { key: "Enter" });
    fireEvent.keyDown(screen.getByTestId("target"), { key: " " });

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("is reachable by keyboard and announces what it is", () => {
    render(<>{clickable(brick, jest.fn())}</>);
    const node = screen.getByTestId("target");

    expect(node).toHaveAttribute("tabindex", "0");
    expect(node).toHaveAttribute("role", "button");
    expect(node).toHaveAccessibleName("Go");
  });

  it("takes no clicks and no focus when disabled", () => {
    const onClick = jest.fn();
    render(<>{ui[brick]({ onClick, disabled: true, testId: "target" }, "Continue")}</>);

    fireEvent.click(screen.getByTestId("target"));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("target")).not.toHaveAttribute("tabindex");
  });

  it("is not focusable when it does nothing", () => {
    render(<>{ui[brick]({ testId: "target" }, "Just words")}</>);

    expect(screen.getByTestId("target")).not.toHaveAttribute("tabindex");
  });
});

/**
 * State layers — the half of a selector the funnel's own variables cannot say.
 *
 * Selected and disabled are conditions and arrive as `bindings`, already
 * evaluated by the time a brick sees them. Hover and press are not: nothing
 * outside the DOM knows where the pointer is, so this is the one place they
 * can be resolved, and these are the rules that resolve them.
 */
describe("state layers", () => {
  it("applies the hover layer over the base while the pointer is on it", () => {
    render(
      <>
        {ui.Frame(
          { testId: "target", fill: "white", states: { hover: { fill: "blue" } } },
          "Option",
        )}
      </>,
    );
    const node = screen.getByTestId("target");

    expect(node).toHaveStyle({ background: "white" });
    fireEvent.pointerEnter(node);
    expect(node).toHaveStyle({ background: "blue" });
    fireEvent.pointerLeave(node);
    expect(node).toHaveStyle({ background: "white" });
  });

  it("puts press on top of hover rather than instead of it", () => {
    render(
      <>
        {ui.Frame(
          {
            testId: "target",
            fill: "white",
            states: { hover: { fill: "blue" }, press: { radius: 4 } },
          },
          "Option",
        )}
      </>,
    );
    const node = screen.getByTestId("target");

    fireEvent.pointerEnter(node);
    fireEvent.pointerDown(node);

    // The press layer changed only the radius, so the hover fill has to survive
    // it — a pressed button is a hovered button with more on top.
    expect(node).toHaveStyle({ background: "blue", borderRadius: "4px" });
  });

  it("forgets the press when the pointer leaves without coming up", () => {
    render(<>{ui.Frame({ testId: "target", states: { press: { fill: "red" } } }, "Option")}</>);
    const node = screen.getByTestId("target");

    fireEvent.pointerDown(node);
    expect(node).toHaveStyle({ background: "red" });
    fireEvent.pointerLeave(node);

    expect(node).not.toHaveStyle({ background: "red" });
  });

  it("reaches a child that the pointer is never over", () => {
    render(
      <>
        {ui.Frame(
          { testId: "option", onClick: () => {}, states: { hover: { fill: "blue" } } },
          ui.Text({ testId: "label", color: "black", states: { hover: { color: "white" } } }, "Go"),
        )}
      </>,
    );

    fireEvent.pointerEnter(screen.getByTestId("option"));

    // The label is three tags in and no pointer will ever be over it. This is
    // the descendant selector, which is why the frame publishes rather than
    // each brick listening for itself.
    expect(screen.getByTestId("label")).toHaveStyle({ color: "white" });
  });

  it("costs nothing when nothing declares a layer", () => {
    render(<>{ui.Frame({ testId: "target", fill: "white" }, "Plain")}</>);
    const node = screen.getByTestId("target");

    fireEvent.pointerEnter(node);

    expect(node).toHaveStyle({ background: "white" });
  });
});

/**
 * A group of options is one tab stop with arrows inside it.
 *
 * The WAI-ARIA radio pattern, and the reason it is not "every option is
 * focusable": eight options that are each their own stop is eight presses to
 * get past one question.
 */
describe("group keyboard navigation", () => {
  const group = (role: "radiogroup" | "group", onPick: (value: string) => void) =>
    ui.Frame({ testId: "group", role }, [
      ui.Frame(
        { key: "a", testId: "a", role: role === "radiogroup" ? "radio" : "checkbox",
          onClick: () => onPick("a"), tabStop: true },
        "A",
      ),
      ui.Frame(
        { key: "b", testId: "b", role: role === "radiogroup" ? "radio" : "checkbox",
          onClick: () => onPick("b"), tabStop: false },
        "B",
      ),
    ]);

  it("keeps one option in the tab order and takes the rest out", () => {
    render(<>{group("radiogroup", () => {})}</>);

    expect(screen.getByTestId("a")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("b")).toHaveAttribute("tabindex", "-1");
  });

  it("moves focus and checks on arrow, in a radio group", () => {
    const onPick = jest.fn();
    render(<>{group("radiogroup", onPick)}</>);

    screen.getByTestId("a").focus();
    fireEvent.keyDown(screen.getByTestId("group"), { key: "ArrowDown" });

    expect(screen.getByTestId("b")).toHaveFocus();
    expect(onPick).toHaveBeenCalledWith("b");
  });

  it("moves focus without checking, in a checkbox group", () => {
    const onPick = jest.fn();
    render(<>{group("group", onPick)}</>);

    screen.getByTestId("a").focus();
    fireEvent.keyDown(screen.getByTestId("group"), { key: "ArrowDown" });

    expect(screen.getByTestId("b")).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("wraps at the end, so the arrows never dead-end", () => {
    render(<>{group("radiogroup", () => {})}</>);

    screen.getByTestId("b").focus();
    fireEvent.keyDown(screen.getByTestId("group"), { key: "ArrowDown" });

    expect(screen.getByTestId("a")).toHaveFocus();
  });
});
