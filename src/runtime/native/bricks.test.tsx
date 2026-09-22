import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

import { Frame, Input, PressContext, Text, configureTokens } from "./bricks";
import { DirectionContext } from "./direction";
import { imageFillOf } from "./bricks";

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

  it("reads a line height the design gives as points, as the web does", () => {
    // `lineHeight: 24` is 24px on the web brick. Read as a multiple, a 16-point
    // line was 384 points tall.
    render(<Text size={16} lineHeight={24}>words</Text>);
    expect(style(screen.getByText("words")).lineHeight).toBe("24px");
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

describe("a funnel that declares its direction lays text out in it", () => {
  it("aligns a designer's left to the right, and reads the paragraph right to left", () => {
    render(
      <DirectionContext.Provider value="rtl">
        <Text align="left">‹</Text>
      </DirectionContext.Provider>,
    );
    const node = screen.getByText("‹");
    expect(style(node).textAlign).toBe("right");
    // What makes iOS draw a lone chevron as its mirrored pair, as `dir` does on the web.
    expect(node.getAttribute("style")).toContain("direction: rtl");
  });

  it("leaves a host that declared nothing exactly as it was", () => {
    render(<Text align="left">plain</Text>);
    const node = screen.getByText("plain");
    expect(style(node).textAlign).toBe("left");
    expect(node.getAttribute("style") ?? "").not.toContain("direction");
  });
});

describe("a frame filled with a picture", () => {
  it("reads the canvas's image paint, a crop placed by its matrix as the canvas places it", () => {
    expect(
      imageFillOf({ fillPaint: [{ kind: "image", src: "https://cdn.example/a.png", fit: "crop" }] }),
    ).toEqual({
      uri: "https://cdn.example/a.png",
      resizeMode: "stretch",
      box: { left: 0, top: 0, width: 1, height: 1 },
    });
    expect(
      imageFillOf({ fillPaint: [{ kind: "image", src: "https://cdn.example/a.png", fit: "fill" }] }),
    ).toEqual({ uri: "https://cdn.example/a.png", resizeMode: "cover" });
    expect(imageFillOf({ fillPaint: [{ kind: "image", src: "https://cdn.example/a.png", fit: "fit" }] }))
      .toEqual({ uri: "https://cdn.example/a.png", resizeMode: "contain" });
  });

  it("falls back to the CSS url the web brick paints", () => {
    expect(imageFillOf({ fill: 'url("https://cdn.example/b.png") center / cover no-repeat' })).toEqual({
      uri: "https://cdn.example/b.png",
      resizeMode: "cover",
    });
  });

  it("is nothing for a colour", () => {
    expect(imageFillOf({ fill: "#ffffff", fillPaint: [{ kind: "solid", color: "#ffffff" }] })).toBeNull();
  });
});

describe("a press, as the web draws one", () => {
  /** A button drawn the way publish writes a component's press variant. */
  const button = (onClick: () => void = jest.fn()) =>
    render(
      <Frame testId="button" onClick={onClick} fill="#ebebec" states={{ press: { fill: "#dedee0" } }}>
        <Text states={{ press: { hidden: true } }}>Resting</Text>
        <Text hidden states={{ press: { hidden: false } }}>
          Pressed
        </Text>
      </Frame>,
    );

  it("draws the resting label, and not the pressed one, at rest", () => {
    button();
    expect(screen.getByText("Resting")).toBeInTheDocument();
    expect(screen.queryByText("Pressed")).toBeNull();
  });

  it("swaps the labels and applies the press layers while a press holds", () => {
    /*
      A finger on the button is \`onPressIn\` → the button's own press, published
      to what it holds. jsdom cannot drive react-native-web's press recognizer,
      so the press arrives here as a button around it would publish it.
    */
    render(
      <PressContext.Provider value>
        <Frame testId="card" fill="#ffffff" states={{ press: { fill: "#dedee0" } }}>
          <Text states={{ press: { hidden: true } }}>Resting</Text>
          <Text hidden color="#18181b" states={{ press: { hidden: false, color: "#ffffff" } }}>
            Pressed
          </Text>
        </Frame>
      </PressContext.Provider>,
    );
    expect(screen.queryByText("Resting")).toBeNull();
    expect(style(screen.getByText("Pressed")).color).toBe("rgb(255, 255, 255)");
    expect(style(screen.getByTestId("card")).backgroundColor).toBe("rgb(222, 222, 224)");
  });
});
