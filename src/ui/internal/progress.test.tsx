import { render, screen } from "@testing-library/react";

import { Progress } from "./progress";

const indicator = () => screen.getByRole("progressbar").firstElementChild as HTMLElement;

/*
 * The funnel progress bar.
 *
 * It fills by `width`, not `translateX`. That is not a style preference: a
 * transform is physical and ignores text direction, so a translateX fill runs
 * left-to-right in an RTL funnel and reads as progress going backwards. Width is
 * anchored to the inline start, so it follows `dir` for free.
 *
 * The tests below pin the property rather than the appearance, because the
 * appearance is what the stories are for and the property is what breaks.
 */
describe("Progress", () => {
  it("fills to the given percentage by width", () => {
    render(<Progress value={40} />);

    expect(indicator()).toHaveStyle({ width: "40%" });
  });

  it("does not fill by transform, which would ignore text direction", () => {
    render(<Progress value={40} />);

    expect(indicator().style.transform).toBe("");
  });

  it("treats a missing value as empty rather than full", () => {
    // `w-full` is on the indicator's class list, so an unset width would render
    // a completed bar on the first page of every funnel.
    render(<Progress />);

    expect(indicator()).toHaveStyle({ width: "0%" });
  });

  it("treats zero as empty", () => {
    render(<Progress value={0} />);

    expect(indicator()).toHaveStyle({ width: "0%" });
  });

  it("fills completely at 100", () => {
    render(<Progress value={100} />);

    expect(indicator()).toHaveStyle({ width: "100%" });
  });

  it("transitions width, not transform, when given a duration", () => {
    // Callers that sweep the bar pass the final value plus a duration and let
    // CSS animate. A leftover `transition-transform` would animate nothing and
    // snap the bar straight to the value.
    render(<Progress value={90} transitionDuration="2s" />);

    expect(indicator().style.transitionProperty).toBe("width");
    expect(indicator().style.transitionDuration).toBe("2s");
  });

  it("sets no transition when no duration is given", () => {
    render(<Progress value={90} />);

    expect(indicator().style.transitionProperty).toBe("");
  });

  it("lets a caller's inline style override the defaults", () => {
    render(<Progress value={50} indicatorStyle={{ width: "10%" }} />);

    expect(indicator()).toHaveStyle({ width: "10%" });
  });

  it("applies the caller's classes to track and indicator separately", () => {
    render(<Progress value={50} className="h-2" indicatorClassName="bg-emerald-500" />);

    expect(screen.getByRole("progressbar")).toHaveClass("h-2");
    expect(indicator()).toHaveClass("bg-emerald-500");
  });

  it("exposes itself as a progressbar to assistive technology", () => {
    render(<Progress value={40} max={100} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
