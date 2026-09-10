/**
 * A screen's opening steps, run by the funnel the way a visitor meets them.
 *
 * Two claims: they run when the screen opens, and a wait among them ends the
 * moment the visitor leaves — so nothing it was holding back lands on the
 * screen they went to instead.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type { SourceAction } from "../compiler/source";
import { Funnel, type ScreenModule } from "./funnel";

/** A screen that says where it is, shows `x`, and can move on. */
const page =
  (name: string, next?: string): ScreenModule =>
  (props) => (
    <div>
      <p>{name}</p>
      <p data-testid="x">{String(props.state.get("x") ?? "")}</p>
      {next ? (
        <button type="button" onClick={() => props.nav.show(next)}>
          next
        </button>
      ) : null}
    </div>
  );

const mount = (enter: Record<string, SourceAction[]>) =>
  render(
    <Funnel
      manifest={{ entry: "a", variables: [{ name: "x", type: "string" }], enter }}
      screens={{ a: page("screen a", "b"), b: page("screen b") }}
    />,
  );

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it("runs a screen's opening steps when it opens", () => {
  mount({ a: [{ type: "set", variable: "x", value: "opened" }] });
  expect(screen.getByTestId("x")).toHaveTextContent("opened");
});

it("waits, then goes on while the visitor is still there", async () => {
  mount({
    a: [
      { type: "wait", seconds: 1 },
      { type: "set", variable: "x", value: "later" },
    ],
  });
  expect(screen.getByTestId("x")).toBeEmptyDOMElement();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByTestId("x")).toHaveTextContent("later");
});

it("drops what a wait was holding back once the visitor has left", async () => {
  mount({
    a: [
      { type: "wait", seconds: 1 },
      { type: "set", variable: "x", value: "late" },
    ],
  });
  fireEvent.click(screen.getByText("next"));
  expect(screen.getByText("screen b")).toBeInTheDocument();

  await act(async () => {
    await jest.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByTestId("x")).toBeEmptyDOMElement();
});
