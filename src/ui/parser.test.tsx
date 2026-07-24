/**
 * The Parser must return a referentially STABLE element tree across re-renders
 * for the same content+registry. Before the fix it rebuilt `config` and re-ran
 * HTMLReactParser every render, so the whole active page's tree was recreated on
 * every BuilderClient re-render, reconciling (and re-rendering) every component —
 * the churn that made the heavy loader page (with Swiper) freeze.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";

import Parser from "./parser";

import { ComponentRegisry } from "../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A registry component that records how many times it renders.
let renderCount = 0;
const Leaf = () => {
  renderCount += 1;
  return <span data-testid="leaf">leaf</span>;
};
const registry: ComponentRegisry = { leaf: Leaf } as unknown as ComponentRegisry;

const CONTENT = `<div component-type="leaf" data-id="1"></div>`;

// Wrapper that re-renders Parser with the SAME props when its own state bumps —
// mimicking a BuilderClient re-render that doesn't change content/registry.
let bump: () => void = () => {};
function Harness() {
  const [, setN] = (require("react") as typeof import("react")).useState(0);
  bump = () => setN((n) => n + 1);
  return <Parser content={CONTENT} registry={registry} />;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  renderCount = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("does not re-render child components when the parent re-renders with unchanged content", async () => {
  await act(async () => {
    root.render(<Harness />);
  });
  expect(renderCount).toBe(1);

  // Re-render the parent several times without changing content/registry.
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      bump();
    });
  }

  // The memoized tree means the leaf is NOT reconciled/re-rendered each time.
  expect(renderCount).toBe(1);
});
