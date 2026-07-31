/**
 * Regression tests for the forward prefetch of neighbouring nodes.
 *
 * The `sample` driving `fetchPagesQuery` is clocked on `$currentPage` and used
 * to derive its target ids from that page alone, never consulting `$pages`. So
 * every change of current page — including *backwards* navigation — re-requested
 * neighbours the model already held.
 *
 * Walking a funnel back and forth therefore re-fetched the same node on every
 * step: A→B fetched C, B→A re-fetched B, A→B re-fetched C, and so on, without
 * limit. Each is a cross-origin request consumers send with a custom header, so
 * it costs a CORS preflight too, against a ~6-connection budget already
 * contended for by MDX, dialogs, pixels and payment SDKs. `createQuery` has no
 * `cache()` applied, so identical params always re-run the handler.
 *
 * Page html and dialogs were already guarded this way (see
 * `fetch-page-html.test.ts` and `fetch-dialogs.test.ts`); node data was not.
 *
 * Note these drive navigation rather than `initEvt`: on the client the scope is
 * hydrated from `serialize`, so `initEvt` never fires there and the seeded first
 * page produces no clock edge of its own.
 */
import { allSettled, fork } from "effector";

import createBuilderModel from "./store";

import { BuilderPage } from "../types";

const page = (id: number, extra: Partial<BuilderPage> = {}): BuilderPage => ({
  id,
  design_url: "",
  mdx_url: `https://cdn.test/${id}.mdx`,
  order: id - 1,
  tree_order: id - 1,
  pageId: id,
  ...extra,
});

/** 1 → 2 → 3 → 4, the shape of a plain linear funnel. */
const LINEAR: Record<number, BuilderPage> = {
  1: page(1, { next_node_id: 2 }),
  2: page(2, { next_node_id: 3 }),
  3: page(3, { next_node_id: 4 }),
  4: page(4),
};

const makeModel = (pages: Record<number, BuilderPage> = LINEAR) => {
  // A fresh object per call, exactly as a real `fetchPage` mapper produces.
  const fetchPage = jest.fn(async ({ id }: { id: number }) => ({ ...pages[id] }));
  const model = createBuilderModel({ fetchPage });
  return { model, fetchPage };
};

/** Resolve pending microtasks/promises without relying on timers. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

const idsFetched = (fetchPage: jest.Mock) =>
  fetchPage.mock.calls.map(([{ id }]: [{ id: number }]) => id);

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => `<div>${url}</div>`,
  })) as unknown as typeof fetch;
});

const init = async (
  scope: ReturnType<typeof fork>,
  model: ReturnType<typeof makeModel>["model"],
  initialPages: Record<number, BuilderPage>,
  initialPageId = 1,
) => {
  await allSettled(model.initEvt, {
    scope,
    params: { initialPageId, initialPages, initialHtml: {}, answers: {} },
  });
  await settle();
};

const goNext = async (
  scope: ReturnType<typeof fork>,
  model: ReturnType<typeof makeModel>["model"],
  id: number,
) => {
  await allSettled(model.nextPageEvt, { scope, params: id });
  await settle();
};

const goBack = async (
  scope: ReturnType<typeof fork>,
  model: ReturnType<typeof makeModel>["model"],
) => {
  await allSettled(model.prevPageEvt, { scope, params: undefined });
  await settle();
};

it("prefetches the next node when it is not already loaded", async () => {
  const { model, fetchPage } = makeModel();
  const scope = fork();

  await init(scope, model, { 1: LINEAR[1], 2: LINEAR[2] });
  await goNext(scope, model, 2);

  // 2's neighbour is 3, which nothing has loaded yet.
  expect(idsFetched(fetchPage)).toEqual([3]);
});

it("does not re-fetch loaded pages while walking back and forth", async () => {
  const { model, fetchPage } = makeModel();
  const scope = fork();

  await init(scope, model, { 1: LINEAR[1], 2: LINEAR[2] });

  await goNext(scope, model, 2);
  expect(idsFetched(fetchPage)).toEqual([3]);

  // Every page the walk touches is in `$pages` from here on, so it must be free.
  await goBack(scope, model);
  await goNext(scope, model, 2);
  await goBack(scope, model);
  await goNext(scope, model, 2);

  expect(idsFetched(fetchPage)).toEqual([3]);
  expect(Object.keys(scope.getState(model.$pages)).sort()).toEqual(["1", "2", "3"]);
  expect(scope.getState(model.$currentPageId)).toBe(2);
});

it("prefetches only the condition branches it is missing", async () => {
  const branching: Record<number, BuilderPage> = {
    1: page(1, { next_node_id: 2 }),
    2: page(2, {
      condition: {
        id: 20,
        condition: [
          { rules: {}, nodeId: 3 },
          { rules: {}, nodeId: 4 },
        ],
      },
    }),
    3: page(3),
    4: page(4),
  };
  const { model, fetchPage } = makeModel(branching);
  const scope = fork();

  await init(scope, model, { 1: branching[1], 2: branching[2], 3: branching[3] });
  await goNext(scope, model, 2);

  expect(idsFetched(fetchPage)).toEqual([4]);
});

it("still self-heals a current page that is missing from the store", async () => {
  const { model, fetchPage } = makeModel();
  const scope = fork();

  await init(scope, model, { 1: LINEAR[1] });

  // Jump straight to a page nothing prefetched — `ensureCurrentPageFx`'s job.
  await allSettled(model.setCurrentPageIdEvt, { scope, params: 3 });
  await settle();

  expect(idsFetched(fetchPage)).toContain(3);
  expect(scope.getState(model.$currentPage)?.id).toBe(3);
  // …and landing there still prefetches 3's own unloaded neighbour.
  expect(idsFetched(fetchPage)).toContain(4);
});
