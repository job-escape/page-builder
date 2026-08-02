import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "./button";

/*
 * The CTA. Every authored "Continue" in every funnel is this component, so the
 * behaviour worth pinning is not how it looks — that is what the stories are for
 * — but what it does when the user is impatient.
 *
 * The double-submit case is the expensive one. A user who taps a CTA twice while
 * the next page fetches must not fire the handler twice; on a paywall that is a
 * second charge.
 */
describe("Button", () => {
  it("renders its label as a button", () => {
    render(<Button>Continue</Button>);

    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("calls the handler when clicked", async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Continue</Button>);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire while loading, however many times it is tapped", async () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Continue
      </Button>,
    );

    const button = screen.getByRole("button");
    await userEvent.click(button);
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire when disabled", async () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Continue
      </Button>,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("stays disabled when loading even if disabled is explicitly false", () => {
    // `disabled={false}` is what a caller passes when it tracks its own state;
    // loading must still win, or the guard above is bypassed.
    render(
      <Button loading disabled={false}>
        Continue
      </Button>,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders as the child element when asChild is set", () => {
    // This is how a CTA becomes a real link — right-clickable and openable in a
    // new tab rather than a button that navigates by script.
    render(
      <Button asChild>
        <a href="https://example.com/offer">Go to the offer</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Go to the offer" });
    expect(link).toHaveAttribute("href", "https://example.com/offer");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("keeps the caller's className alongside the variant classes", () => {
    render(<Button className="mt-4">Continue</Button>);

    expect(screen.getByRole("button")).toHaveClass("mt-4");
  });

  it("forwards a ref to the underlying element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Continue</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("forwards arbitrary button attributes", () => {
    render(
      <Button type="submit" aria-label="Proceed to checkout">
        Continue
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Proceed to checkout" });
    expect(button).toHaveAttribute("type", "submit");
  });
});
