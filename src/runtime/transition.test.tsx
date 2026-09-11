/**
 * A screen's entrance and a tappable brick's press: which way a visitor went,
 * what each screen asks for, and the shrink under a pointer.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import { Frame } from "./client/bricks";
import { ScreenHost, DEFAULT_PRESENTATION } from "./client/screen-host";
import { presentationOf } from "./compiler/manifest";
import { createNavigator } from "./navigation";

describe("which way the visitor went", () => {
  it("is forward on a navigation and back on back", () => {
    const nav = createNavigator({ entry: "a" });
    expect(nav.state().direction).toBe("forward");
    nav.show("b");
    expect(nav.state()).toMatchObject({ screen: "b", direction: "forward" });
    nav.back();
    expect(nav.state()).toMatchObject({ screen: "a", direction: "back" });
    nav.show("c");
    expect(nav.state().direction).toBe("forward");
  });
});

describe("a screen's transition", () => {
  it("is none unless a designer picked one", () => {
    expect(presentationOf({ id: "s", frames: [] }).transition).toBe("none");
    expect(
      presentationOf({ id: "s", frames: [], presentation: { transition: "push" } }).transition,
    ).toBe("push");
  });

  it("draws exactly the old markup for none", () => {
    const { container } = render(
      <ScreenHost presentation={DEFAULT_PRESENTATION}>
        <p>hello</p>
      </ScreenHost>,
    );
    expect(container.querySelector("[data-funnel-entrance]")).toBeNull();
    expect(container.querySelector("[data-funnel-screen] > p")).not.toBeNull();
  });

  it("plays the entrance, reversed on back", () => {
    const presentation = { ...DEFAULT_PRESENTATION, transition: "slide" as const };
    const { container, rerender } = render(
      <ScreenHost presentation={presentation} direction="forward">
        <p>hello</p>
      </ScreenHost>,
    );
    const entrance = () => container.querySelector<HTMLElement>("[data-funnel-entrance]");
    expect(entrance()?.style.animation).toContain("pb-screen-slide-forward");
    rerender(
      <ScreenHost presentation={presentation} direction="back">
        <p>hello</p>
      </ScreenHost>,
    );
    expect(entrance()?.style.animation).toContain("pb-screen-slide-back");
  });
});

describe("a tappable brick under a press", () => {
  it("shrinks while pressed and comes back as the pointer lifts", () => {
    render(
      <Frame onClick={() => undefined} testId="button">
        Go
      </Frame>,
    );
    const button = screen.getByTestId("button");
    expect(button.style.transform).toBe("");
    fireEvent.pointerDown(button);
    expect(button.style.transform).toBe("scale(0.97)");
    fireEvent.pointerUp(button);
    expect(button.style.transform).toBe("");
  });

  it("keeps the design's own transform, and leaves an untappable frame alone", () => {
    render(
      <>
        <Frame onClick={() => undefined} testId="rotated" style={{ transform: "rotate(2deg)" }} />
        <Frame testId="still" />
      </>,
    );
    const rotated = screen.getByTestId("rotated");
    fireEvent.pointerDown(rotated);
    expect(rotated.style.transform).toBe("rotate(2deg) scale(0.97)");
    expect(screen.getByTestId("still").style.transition).toBe("");
  });
});
