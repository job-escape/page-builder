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
