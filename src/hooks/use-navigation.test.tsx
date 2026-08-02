import { createEvent, createStore } from "effector";

import { act } from "react";
import { createRoot, Root } from "react-dom/client";

import { Answers, BuilderPage, Condition } from "../types";

import { useNavigation } from "./use-navigation";

jest.mock("../utils/run-condition", () => ({
  runCondition: jest.fn(async () => null),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { runCondition } = require("../utils/run-condition") as { runCondition: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (overrides: Partial<BuilderPage> = {}): BuilderPage => ({
  id: 1,
  design_url: "",
  mdx_url: "",
  order: 0,
  tree_order: 0,
  pageId: 10,
  ...overrides,
});

const condition = (): Condition => ({
  id: 1,
  condition: [{ rules: { all: [] }, nodeId: 500 }],
});

// The hook reads its page and model from context. The providers are exercised
// elsewhere; here they are stubbed so each case can state exactly one situation.
let currentPage: BuilderPage;
let model: {
  nextPageEvt: ReturnType<typeof createEvent<number>>;
  prevPageEvt: ReturnType<typeof createEvent<void>>;
  finishEvt: ReturnType<typeof createEvent<void>>;
  $answers: ReturnType<typeof createStore<Answers>>;
  $subscriptionFacts: ReturnType<typeof createStore<Record<string, never>>>;
};

jest.mock("./use-page", () => ({ usePage: () => currentPage }));
jest.mock("./use-builder-model", () => ({ useBuilderModel: () => model }));

/*
 * Forward navigation — the decision of what the user sees after they answer.
 *
 * The contract has a fixed order of precedence: a page's condition wins over
 * its `next_node_id`, and running out of both means the funnel is finished.
 * Inverting those first two silently routes everyone down the default path,
 * which looks like working software and quietly destroys every branch an author
 * built.
 *
 * The failure behaviour matters just as much. Condition evaluation is async and
 * can throw — bad authored rules, an engine chunk that failed to load — and when
 * it does the user must still move forward on the default route rather than
 * being trapped on the page by a rejected promise.
 */
describe("useNavigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let nav: ReturnType<typeof useNavigation>;
  let nextPageSpy: jest.Mock;
  let prevPageSpy: jest.Mock;
  let finishSpy: jest.Mock;

  const Probe = () => {
    nav = useNavigation();
    return null;
  };

  const render = async (answers: Answers = {}) => {
    model = {
      nextPageEvt: createEvent<number>(),
      prevPageEvt: createEvent<void>(),
      finishEvt: createEvent<void>(),
      $answers: createStore<Answers>(answers),
      $subscriptionFacts: createStore<Record<string, never>>({}),
    };

    nextPageSpy = jest.fn();
    prevPageSpy = jest.fn();
    finishSpy = jest.fn();
    model.nextPageEvt.watch(nextPageSpy);
    model.prevPageEvt.watch(prevPageSpy);
    model.finishEvt.watch(finishSpy);

    await act(async () => {
      root.render(<Probe />);
    });
  };

  beforeEach(() => {
    runCondition.mockReset();
    runCondition.mockResolvedValue(null);
    currentPage = page();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("follows next_node_id when the page has no condition", async () => {
    currentPage = page({ next_node_id: 42 });
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(nextPageSpy).toHaveBeenCalledWith(42);
    expect(runCondition).not.toHaveBeenCalled();
    expect(finishSpy).not.toHaveBeenCalled();
  });

  it("prefers the condition's answer over next_node_id", async () => {
    // The whole point of a branch: it must win, or every author's routing is
    // silently replaced by the linear default.
    currentPage = page({ next_node_id: 42, condition: condition() });
    runCondition.mockResolvedValue({ nodeId: 77 });
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(nextPageSpy).toHaveBeenCalledWith(77);
    expect(nextPageSpy).not.toHaveBeenCalledWith(42);
  });

  it("falls back to next_node_id when the condition picks nothing", async () => {
    currentPage = page({ next_node_id: 42, condition: condition() });
    runCondition.mockResolvedValue(null);
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(nextPageSpy).toHaveBeenCalledWith(42);
  });

  it("falls back when the matched branch has a null node id", async () => {
    // A branch that resolves to no page is not a destination.
    currentPage = page({ next_node_id: 42, condition: condition() });
    runCondition.mockResolvedValue({ nodeId: null });
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(nextPageSpy).toHaveBeenCalledWith(42);
  });

  it("keeps the user moving when condition evaluation throws", async () => {
    // Bad authored rules must not strand anyone on the page.
    currentPage = page({ next_node_id: 42, condition: condition() });
    runCondition.mockRejectedValue(new Error("engine exploded"));
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(nextPageSpy).toHaveBeenCalledWith(42);
  });

  it("finishes when a throwing condition has no next_node_id to fall back to", async () => {
    currentPage = page({ condition: condition() });
    runCondition.mockRejectedValue(new Error("engine exploded"));
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(finishSpy).toHaveBeenCalled();
  });

  it("finishes the funnel when there is nowhere left to go", async () => {
    currentPage = page();
    await render();

    await act(async () => {
      await nav.next();
    });

    expect(finishSpy).toHaveBeenCalled();
    expect(nextPageSpy).not.toHaveBeenCalled();
  });

  it("evaluates the condition against answers merged with this page's", async () => {
    // The current page's answer is not in the store yet when `next` runs, so a
    // branch on the question just answered only works if it is merged in first.
    currentPage = page({ condition: condition() });
    runCondition.mockResolvedValue({ nodeId: 5 });
    await render({ goal: "sleep" });

    await act(async () => {
      await nav.next({ age: 30 });
    });

    expect(runCondition).toHaveBeenCalledWith(
      currentPage.condition?.condition,
      expect.objectContaining({ goal: "sleep", age: 30 }),
    );
  });

  it("lets the just-given answer override a stored one", async () => {
    currentPage = page({ condition: condition() });
    runCondition.mockResolvedValue({ nodeId: 5 });
    await render({ goal: "sleep" });

    await act(async () => {
      await nav.next({ goal: "focus" });
    });

    expect(runCondition.mock.calls[0][1]).toMatchObject({ goal: "focus" });
  });

  it("prefixes subscription facts so the engine can key them", async () => {
    currentPage = page({ condition: condition() });
    runCondition.mockResolvedValue({ nodeId: 5 });
    model = {
      nextPageEvt: createEvent<number>(),
      prevPageEvt: createEvent<void>(),
      finishEvt: createEvent<void>(),
      $answers: createStore<Answers>({}),
      $subscriptionFacts: createStore({ trial_days: 7 } as never),
    };
    await act(async () => {
      root.render(<Probe />);
    });

    await act(async () => {
      await nav.next();
    });

    expect(runCondition.mock.calls[0][1]).toMatchObject({
      "subscription_data-trial_days": 7,
    });
  });

  it("goes back without consulting any condition", async () => {
    currentPage = page({ next_node_id: 42, condition: condition() });
    await render();

    act(() => {
      nav.prev();
    });

    expect(prevPageSpy).toHaveBeenCalled();
    expect(runCondition).not.toHaveBeenCalled();
    expect(nextPageSpy).not.toHaveBeenCalled();
  });
});
