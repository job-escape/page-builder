import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { configureDrawer, Overlay, type DrawerHostProps } from "./overlay";

afterEach(() => configureDrawer(undefined));

describe('an overlay opened as position "drawer"', () => {
  it("is drawn by the host's drawer when one is configured, with the frame as its content", () => {
    const seen: Omit<DrawerHostProps, "children">[] = [];
    configureDrawer(({ children, ...props }) => {
      seen.push(props);
      return <div data-testid="host-drawer">{children}</div>;
    });

    render(
      <Overlay presentation={{ as: "overlay", position: "drawer" }} onDismiss={() => {}}>
        <p>Payment declined</p>
      </Overlay>,
    );

    expect(screen.getByTestId("host-drawer")).toHaveTextContent("Payment declined");
    expect(seen[0]).toMatchObject({ dismissible: true, dim: true });
  });

  it("tells the host when the step said the drawer may not be thrown away", () => {
    const seen: boolean[] = [];
    configureDrawer(({ dismissible, children }) => {
      seen.push(dismissible);
      return <>{children}</>;
    });
    render(
      <Overlay presentation={{ position: "drawer", closeOnOutside: false }} onDismiss={() => {}}>
        <p>x</p>
      </Overlay>,
    );
    expect(seen[0]).toBe(false);
  });

  it("falls back to the built-in sheet, which a tap on the backdrop closes", () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(
      <Overlay presentation={{ position: "drawer" }} onDismiss={onDismiss}>
        <p>Your payment is successful</p>
      </Overlay>,
    );

    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent("Your payment is successful");
    fireEvent.mouseDown(sheet.parentElement!);
    act(() => {
      jest.runAllTimers();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("does not close the built-in sheet from the backdrop when the step forbids it", () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    render(
      <Overlay presentation={{ position: "drawer", closeOnOutside: false }} onDismiss={onDismiss}>
        <p>x</p>
      </Overlay>,
    );
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    act(() => {
      jest.runAllTimers();
    });
    expect(onDismiss).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
