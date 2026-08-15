/**
 * The runtime rendering a funnel, driven the way a visitor drives it.
 *
 * This is the end-to-end check: a hand-written funnel in the shape the compiler
 * will emit, clicked through with real events. It covers what the design
 * discussion actually argued about — selection appearance derived from a
 * comparison, multi-select capping, a `min` gate, branching on an answer, and an
 * overlay that leaves the screen mounted underneath.
 */
// Imported here rather than via a global setup file: the beta runtime must not
// change shared test configuration that the existing suites depend on.
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";

import { Funnel } from "./funnel";
import { locale, manifest, screens } from "./demo/quiz";

const mount = () => render(<Funnel manifest={manifest} screens={screens} locale={locale} />);

const option = (value: string) => screen.getByTestId(`option-${value}`);

describe("single select", () => {
  it("marks the chosen option and advances", () => {
    mount();
    expect(screen.getByText("What's your goal?")).toBeInTheDocument();

    fireEvent.click(option("build_muscle"));

    // Auto-advance: the goal screen is gone, the gear screen is here.
    expect(screen.getByText("What do you have at home?")).toBeInTheDocument();
  });

  it("shows the selection state before advancing", () => {
    const { rerender } = render(
      <Funnel manifest={{ ...manifest, entry: "s_goal" }} screens={{ s_goal: screens.s_goal }} locale={locale} />,
    );
    fireEvent.click(option("lose_weight"));
    rerender(
      <Funnel manifest={{ ...manifest, entry: "s_goal" }} screens={{ s_goal: screens.s_goal }} locale={locale} />,
    );
    expect(option("lose_weight")).toHaveAttribute("aria-checked", "true");
    expect(option("build_muscle")).toHaveAttribute("aria-checked", "false");
  });
});

describe("multi select", () => {
  const toGear = () => {
    mount();
    fireEvent.click(option("build_muscle"));
  };

  it("selects several and reflects the count", () => {
    toGear();
    fireEvent.click(option("bands"));
    fireEvent.click(option("mat"));

    expect(option("bands")).toHaveAttribute("aria-checked", "true");
    expect(option("mat")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });

  it("toggles a chosen option off", () => {
    toGear();
    fireEvent.click(option("bands"));
    fireEvent.click(option("bands"));
    expect(option("bands")).toHaveAttribute("aria-checked", "false");
  });

  it("stops at the cap, and marks the rest unavailable", () => {
    toGear();
    ["bands", "mat", "dumbbells"].forEach((v) => fireEvent.click(option(v)));

    fireEvent.click(option("kettlebell"));

    expect(option("kettlebell")).toHaveAttribute("aria-checked", "false");
    expect(option("kettlebell")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(/3\/3/)).toBeInTheDocument();
  });

  it("still allows removing at the cap", () => {
    toGear();
    ["bands", "mat", "dumbbells"].forEach((v) => fireEvent.click(option(v)));
    fireEvent.click(option("mat"));
    expect(screen.getByText(/2\/3/)).toBeInTheDocument();
  });
});

describe("the min gate", () => {
  it("Continue does nothing until something is picked", () => {
    mount();
    fireEvent.click(option("build_muscle"));

    fireEvent.click(screen.getByTestId("continue"));
    // Still on the gear screen — the gate held.
    expect(screen.getByText("What do you have at home?")).toBeInTheDocument();

    fireEvent.click(option("bands"));
    fireEvent.click(screen.getByTestId("continue"));
    expect(screen.queryByText("What do you have at home?")).not.toBeInTheDocument();
  });
});

describe("branching on an answer", () => {
  it("routes to the strength plan when they have weights", () => {
    mount();
    fireEvent.click(option("build_muscle"));
    fireEvent.click(option("dumbbells"));
    fireEvent.click(screen.getByTestId("continue"));

    expect(screen.getByText("Strength plan")).toBeInTheDocument();
  });

  it("routes to the bodyweight plan when they do not", () => {
    mount();
    fireEvent.click(option("build_muscle"));
    fireEvent.click(option("mat"));
    fireEvent.click(screen.getByTestId("continue"));

    expect(screen.getByText("Bodyweight plan")).toBeInTheDocument();
  });

  it("carries every answer through to the end", () => {
    mount();
    fireEvent.click(option("build_muscle"));
    fireEvent.click(option("bands"));
    fireEvent.click(option("dumbbells"));
    fireEvent.click(screen.getByTestId("continue"));

    expect(screen.getByText(/goal = build_muscle/)).toBeInTheDocument();
    expect(screen.getByText(/equipment = \[bands, dumbbells\]/)).toBeInTheDocument();
  });
});

describe("overlays", () => {
  const openOverlay = () => {
    mount();
    fireEvent.click(option("build_muscle"));
    fireEvent.click(screen.getByTestId("why"));
  };

  it("renders on top while the screen stays mounted underneath", () => {
    openOverlay();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The screen below is still there — that is what makes it an overlay.
    expect(screen.getByText("What do you have at home?")).toBeInTheDocument();
  });

  it("closes from inside", () => {
    openOverlay();
    fireEvent.click(screen.getByTestId("overlay-close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    openOverlay();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on a backdrop click", () => {
    openOverlay();
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not close when the click began inside the panel", () => {
    openOverlay();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("keyboard", () => {
  it("an option is reachable and choosable without a mouse", () => {
    mount();
    const target = option("build_muscle");
    expect(target).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(target, { key: "Enter" });
    expect(screen.getByText("What do you have at home?")).toBeInTheDocument();
  });
});
