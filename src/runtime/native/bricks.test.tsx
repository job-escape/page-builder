import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { Frame, Input, Text, configureTokens } from "./bricks";

/**
 * The native bricks, rendered through `react-native-web`.
 *
 * Not an approximation of the native renderer — it *is* the native renderer,
 * with `View` and `Text` mapped onto DOM. So what these assert is the decisions
 * the bricks make: which component a frame becomes, how a stroke is drawn, where
 * a scrolled frame's layout ends up.
 *
 * What a browser cannot reproduce — keyboard behaviour, scroll physics, gestures
 * — is not asserted, because passing here would prove nothing about a phone.
 */
const style = (node: Element | null) => window.getComputedStyle(node as Element);

describe("Frame becomes the component its props ask for", () => {
  it("is a plain view when it neither scrolls nor takes taps", () => {
    render(<Frame testId="plain" />);
    const node = screen.getByTestId("plain");
    // No tabindex and no button semantics: nothing here is interactive.
    expect(node).not.toHaveAttribute("tabindex");
  });

  it("takes taps when an interaction gave it a handler", () => {
    const onClick = jest.fn();
    render(<Frame testId="tappable" role="radio" ariaChecked onClick={onClick} />);

    const node = screen.getByTestId("tappable");
    expect(node).toHaveAttribute("tabindex");
    expect(node).toHaveAttribute("aria-checked", "true");
  });

  it("lays its children out through the content container when it scrolls", () => {
    render(
      <Frame testId="scroller" scroll layout="column" gap={12} padding={24}>
        <Text>inside</Text>
      </Frame>,
    );

    // The viewport is the outer node; the layout has to live on the content
    // container, or padding does nothing and a height breaks scrolling.
    const node = screen.getByTestId("scroller");
    expect(style(node).padding).not.toBe("24px");
    expect(screen.getByText("inside")).toBeInTheDocument();
  });
});

describe("a stroke is drawn as paint, not as a border", () => {
  it("uses a real border for an inside stroke", () => {
    render(<Frame testId="inside" shadow="inset 0 0 0 2px #000000" />);
    expect(style(screen.getByTestId("inside")).borderTopWidth).toBe("2px");
  });

  it("draws an outside stroke as an overlay, because a border moves the box", () => {
    const { container } = render(<Frame testId="outside" shadow="0 0 0 2px #a86565" />);

    // The frame itself is unbordered — its size is unchanged by the stroke.
    expect(style(screen.getByTestId("outside")).borderTopWidth).toBe("0px");
    // And the ring exists as a sibling that takes no taps.
    const overlay = container.querySelector('[style*="border"]');
    expect(overlay).not.toBeNull();
  });
});

describe("Text", () => {
  it("resolves a line height to points, never a multiplier", () => {
    render(<Text size={20}>words</Text>);
    // 1.4 × 20. Left as `1.4`, React Native would draw a line 1.4 points tall
    // and stack every row of text on the last.
    expect(style(screen.getByText("words")).lineHeight).toBe("28px");
  });
});

describe("Input", () => {
  it("asks for the keyboard the field's type needs", () => {
    render(<Input testId="email" type="email" value="" onValue={() => {}} />);
    const node = screen.getByTestId("email");
    expect(node).toHaveAttribute("type", "email");
    // An email field that autocapitalises is a field that rejects what was typed.
    expect(node).toHaveAttribute("autocapitalize", "none");
  });

  it("shows an invalid field as invalid without doubling its border", () => {
    render(<Input testId="bad" invalid value="" onValue={() => {}} />);
    // react-native-web writes colours in its own normalised form.
    expect(style(screen.getByTestId("bad")).borderTopColor).toBe("rgba(220,38,38,1.00)");
  });
});

describe("tokens", () => {
  it("resolves a colour reference against the mode being rendered", () => {
    configureTokens({ tokens: { dark: { "bg.brand": "#60a5fa" } }, mode: "dark" });
    render(<Frame testId="tokened" fill="var(--bg-brand)" />);

    expect(style(screen.getByTestId("tokened")).backgroundColor).toBe("rgb(96, 165, 250)");
    configureTokens({});
  });
});
