import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { Frame, Image, Input, Text } from "./bricks";

/**
 * The same placement the web bricks draw, on the phone's renderer.
 *
 * Rendered through `react-native-web`, so what is asserted is the style the
 * brick decided on — `position: absolute` and the two offsets — rather than a
 * browser's idea of where a view lands. `places` has no counterpart here on
 * purpose: a React Native view is a positioning context already.
 */
const style = (node: Element | null) => window.getComputedStyle(node as Element);

describe("a placed child", () => {
  it("is taken out of the flow and put where it was drawn", () => {
    render(<Frame testId="child" x={40} y={120} />);
    const css = style(screen.getByTestId("child"));
    expect(css.position).toBe("absolute");
    expect(css.left).toBe("40px");
    expect(css.top).toBe("120px");
  });

  it("reads one of the two as zero rather than as unset", () => {
    render(<Frame testId="child" y={12} />);
    const css = style(screen.getByTestId("child"));
    expect(css.left).toBe("0px");
    expect(css.top).toBe("12px");
  });

  it("is left in the flow when it was never placed", () => {
    render(<Frame testId="child" />);
    expect(style(screen.getByTestId("child")).position).not.toBe("absolute");
  });

  it("needs nothing of its parent, which is a positioning context already", () => {
    render(<Frame testId="parent" places />);
    // `places` is accepted and ignored — it must not leak out as an attribute.
    expect(screen.getByTestId("parent")).not.toHaveAttribute("places");
  });
});

describe("every brick a parent can place", () => {
  it("places words", () => {
    render(<Text testId="t" x={5} y={6}>hi</Text>);
    const css = style(screen.getByTestId("t"));
    expect(css.position).toBe("absolute");
    expect(css.left).toBe("5px");
  });

  it("places a picture", () => {
    render(<Image src="/a.png" alt="a" x={7} y={8} />);
    const css = style(screen.getByLabelText("a"));
    expect(css.position).toBe("absolute");
    expect(css.top).toBe("8px");
  });

  it("places a field", () => {
    render(<Input ariaLabel="name" testId="f" x={1} y={2} />);
    const css = style(screen.getByTestId("f"));
    expect(css.position).toBe("absolute");
    expect(css.left).toBe("1px");
  });
});
