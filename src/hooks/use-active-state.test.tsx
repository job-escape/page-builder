/**
 * Regression tests for the unbounded subscription leak in `useActiveState`.
 *
 * The hook used to be written as:
 *
 *   useRef(createActiveStateModel(...)).current
 *
 * `useRef`'s argument is evaluated on EVERY render and all but the first result
 * is discarded — but each discarded model had already subscribed to
 * $answers/$localStates and fired an async rules-engine run. Callers such as
 * `button.tsx` re-render on every local-state change, so each render leaked a
 * live model that re-evaluated forever. On a loader page (which writes local
 * state every 30ms) the orphans compounded until the main thread was saturated
 * and the UI stopped responding to clicks.
 */
import { createEvent, createStore, fork, StoreWritable } from "effector";
import { Provider } from "effector-react";

import { act } from "react";
import { createRoot, Root } from "react-dom/client";

import { Answers, NodeStatesValue, PrimitiveValue } from "../types";

import { useActiveState } from "./use-active-state";

jest.mock("../utils/run-condition", () => ({
  runCondition: jest.fn(async () => ({ nodeId: null })),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { runCondition } = require("../utils/run-condition") as {
  runCondition: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-var-requires */

// Non-empty rules, otherwise `evaluateFx` short-circuits before reaching the engine.
const STATES = [
  {
    name: "disabled",
    rules: { all: [{ fact: "answer-q1", operator: "equal", value: "yes" }] },
  },
] as unknown as NodeStatesValue;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const setAnswers = createEvent<Answers>();

let container: HTMLDivElement;
let root: Root;
let $answers: StoreWritable<Answers>;
let $localStates: StoreWritable<Record<string, PrimitiveValue | string[]>>;
let $subscriptionFacts: StoreWritable<Record<string, PrimitiveValue>>;

// Mirrors `button.tsx`: a fresh `states` array is produced on every render.
function Probe({ tick }: { tick: number }) {
  const states = JSON.parse(JSON.stringify(STATES)) as NodeStatesValue;
  const activeState = useActiveState(states, $answers, $localStates, $subscriptionFacts);
  return (
    <span>
      {tick}:{activeState ?? "none"}
    </span>
  );
}

const render = async (node: React.ReactNode) => {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  runCondition.mockClear();

  // Fresh stores per test so evaluations from one test cannot bleed into the next.
  $answers = createStore<Answers>({}).on(setAnswers, (_, next) => next);
  $localStates = createStore<Record<string, PrimitiveValue | string[]>>({});
  $subscriptionFacts = createStore<Record<string, PrimitiveValue>>({});

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

const rerenderManyTimes = async () => {
  for (let tick = 1; tick <= 25; tick += 1) {
    await render(<Probe tick={tick} />);
  }
};

it("evaluates once per mount, not once per render", async () => {
  await render(<Probe tick={0} />);
  expect(runCondition).toHaveBeenCalledTimes(1);

  // Re-render repeatedly, exactly as a button does while a loader ticks.
  await rerenderManyTimes();

  // Re-rendering must not spawn a new model, and so must not re-evaluate.
  expect(runCondition).toHaveBeenCalledTimes(1);
});

it("does not multiply evaluations per answer change after re-renders", async () => {
  await render(<Probe tick={0} />);
  await rerenderManyTimes();
  runCondition.mockClear();

  // One answer change must trigger exactly one evaluation, not one per render.
  await act(async () => {
    setAnswers({ "answer-q1": "yes" });
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(runCondition).toHaveBeenCalledTimes(1);
});

it("stops evaluating once unmounted", async () => {
  await render(<Probe tick={0} />);
  await render(<></>);
  runCondition.mockClear();

  await act(async () => {
    setAnswers({ "answer-q1": "no" });
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(runCondition).not.toHaveBeenCalled();
});

/*
 * The production shape: `Builder` hydrates answers into a forked Scope, so the
 * store's DEFAULT state is empty — only the scope holds the visitor's answers.
 * The initial evaluation used to run `evaluateFx($answers.getState())` outside
 * any scope, so the engine judged an empty answer set, computed "disabled",
 * and nothing re-evaluated until some later store change happened to land.
 * A returning visitor on a quiet page saw their saved answer in the field and
 * a Continue button that never enabled.
 */
it("evaluates the scope's hydrated answers on mount, and lands the result in the scope", async () => {
  const scope = fork({
    values: [[$answers, { "funnel_data-drama_lead": "Isabella" }]],
  });
  runCondition.mockResolvedValue({ nodeId: "highlighted" });

  await render(
    <Provider value={scope}>
      <Probe tick={0} />
    </Provider>,
  );

  // The engine must be consulted with what the scope holds — an initial
  // evaluation that reads the default (empty) state judges the wrong visit.
  expect(runCondition).toHaveBeenCalled();
  for (const call of runCondition.mock.calls as [unknown, Answers][]) {
    expect(call[1]["funnel_data-drama_lead"]).toBe("Isabella");
  }

  // And its verdict must be visible where the component reads it: in the scope.
  expect(container.textContent).toBe("0:highlighted");
});
