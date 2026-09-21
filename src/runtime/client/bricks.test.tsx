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

  it("activates on Enter and Space", () => {
    const onClick = jest.fn();
    render(<>{clickable(brick, onClick)}</>);
    const node = screen.getByTestId("target");

    if (brick === "Frame") {
      // A real button: the browser turns Enter and Space into a click, so the
      // brick must not do it a second time. jsdom does not run that default
      // action, which is why this asserts the element rather than the calls.
      expect(node.tagName).toBe("BUTTON");
      fireEvent.keyDown(node, { key: "Enter" });
      expect(onClick).not.toHaveBeenCalled();
      return;
    }

    fireEvent.keyDown(node, { key: "Enter" });
    fireEvent.keyDown(node, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("is reachable by keyboard and announces what it is", () => {
    render(<>{clickable(brick, jest.fn())}</>);
    const node = screen.getByTestId("target");

    expect(node).toHaveAttribute("tabindex", "0");
    // A `<button>` carries the role itself; a span has to say it.
    expect(screen.getByRole("button", { name: "Go" })).toBe(node);
    if (brick === "Text") expect(node).toHaveAttribute("role", "button");
    else expect(node).not.toHaveAttribute("role");
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

describe("Text, sized to its words", () => {
  it("does not wrap when its width hugs, and keeps the line breaks it was given", () => {
    render(<>{ui.Text({ width: "hug", testId: "words" }, "Maybe later")}</>);

    expect(screen.getByTestId("words")).toHaveStyle({ whiteSpace: "pre" });
  });

  it("wraps as before at a fixed or filling width", () => {
    render(
      <>
        {ui.Text({ width: 88, testId: "fixed" }, "Maybe later")}
        {ui.Text({ width: "fill", testId: "filling" }, "Maybe later")}
      </>,
    );

    expect(screen.getByTestId("fixed").style.whiteSpace).toBe("");
    expect(screen.getByTestId("filling").style.whiteSpace).toBe("");
  });
});

describe("a Frame that is a button", () => {
  it("is a real <button>, typed so it never submits a form", () => {
    render(<>{ui.Frame({ onClick: jest.fn(), role: "button", testId: "b" }, "Go")}</>);
    const node = screen.getByTestId("b");

    expect(node.tagName).toBe("BUTTON");
    expect(node).toHaveAttribute("type", "button");
  });

  it("paints nothing the design did not ask for", () => {
    // A bare <button> has a grey face, a bevel and padding of its own.
    render(<>{ui.Frame({ onClick: jest.fn(), role: "button", testId: "b" }, "Go")}</>);
    const { style } = screen.getByTestId("b");

    expect(style.background).toBe("transparent");
    expect(style.padding).toBe("0px");
    expect(style.margin).toBe("0px");
    expect(style.appearance).toBe("none");
    // `border: none`, `font: inherit` and `color: inherit` are written too, and
    // jsdom's CSSOM drops all three as it drops `100dvh` (see screen-host's
    // test) — they are checked in a browser, where they are ordinary CSS.
  });

  it("keeps the design's own fill, border and padding", () => {
    render(
      <>
        {ui.Frame(
          {
            onClick: jest.fn(),
            role: "button",
            testId: "b",
            fill: "rgb(235, 235, 236)",
            padding: [8, 16, 8, 16],
          },
          "Maybe later",
        )}
      </>,
    );
    const { style } = screen.getByTestId("b");

    expect(style.background).toBe("rgb(235, 235, 236)");
    expect(style.padding).toBe("8px 16px 8px 16px");
  });

  it("does not nest: a clickable frame inside a button stays a div", () => {
    render(
      <>
        {ui.Frame(
          { onClick: jest.fn(), role: "button", testId: "outer" },
          ui.Frame({ onClick: jest.fn(), role: "button", testId: "inner" }, "Learn more"),
        )}
      </>,
    );

    expect(screen.getByTestId("outer").tagName).toBe("BUTTON");
    const inner = screen.getByTestId("inner");
    expect(inner.tagName).toBe("DIV");
    // Still announced and still operable, exactly as every frame was before.
    expect(inner).toHaveAttribute("role", "button");
    expect(inner).toHaveAttribute("tabindex", "0");
  });

  it("stays a div when it is not a button or does nothing", () => {
    render(
      <>
        {ui.Frame({ onClick: jest.fn(), role: "radio", testId: "radio" }, "A")}
        {ui.Frame({ role: "button", testId: "idle" }, "B")}
        {ui.Frame({ onClick: jest.fn(), role: "button", disabled: true, testId: "off" }, "C")}
      </>,
    );

    expect(screen.getByTestId("radio").tagName).toBe("DIV");
    expect(screen.getByTestId("idle").tagName).toBe("DIV");
    expect(screen.getByTestId("off").tagName).toBe("DIV");
  });
});
