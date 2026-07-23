/**
 * Regression tests for client-side dialog fetching in `createBuilderClientModel`.
 *
 * `pageReady` in builder-client requires `dialogsByPage[currentPageId] !==
 * undefined`, so a page cannot render until its dialogs are fetched. Two defects
 * kept that gate unsatisfiable for minutes:
 *
 * 1. The `sample` driving `dialogsQuery` clocked on `$visiblePages`, which is a
 *    fresh `combine` array on every html/pages write. `$dialogsByPage` is only
 *    written once a batch resolves, so every intervening `$visiblePages` change
 *    re-queued a dialog fetch for pages already in flight. The duplicate
 *    `fetch(mdx_url)` calls starved the browser's ~6-connection budget.
 *
 * 2. `Promise.all` rejected the whole batch on one failing dialog, so dialogs
 *    that HAD loaded were never stored — those pages stayed `undefined` and the
 *    sample kept re-queuing them.
 *
 * The loader page has a real dialog to fetch, so it was hit hardest: it stayed
 * un-`pageReady` and never appeared ("stuck before the loader").
 */
import { allSettled, fork } from "effector";

import createBuilderModel from "./store";
import { createBuilderClientModel } from "./gate";

import { BuilderDialog, BuilderPage } from "../types";

const page = (id: number): BuilderPage => ({
  id,
  design_url: "",
  mdx_url: `https://cdn.test/page-${id}.mdx`,
  order: id,
  tree_order: id,
  pageId: id,
});

const dialog = (pageId: number): BuilderDialog => ({
  id: pageId * 100,
  design_url: "",
  mdx_url: `https://cdn.test/dialog-${pageId}.mdx`,
  type: "dialog",
  uuid: `uuid-${pageId}`,
  html: "<div>dialog</div>",
});

const makeSetup = (fetchDialogs: (p: BuilderPage) => Promise<BuilderDialog[]>) => {
  const model = createBuilderModel({ fetchPage: async ({ id }) => page(id) });
  const client = createBuilderClientModel({
    $visiblePages: model.$visiblePages,
    $currentPage: model.$currentPage,
    $dialogsByPage: model.$dialogsByPage,
    fetchDialogs,
    prefetchPreviousPage: model.prefetchPreviousPageEvt,
    setPageDialogs: model.setPageDialogsEvt,
  });
  return { model, client };
};

const settle = async () => {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
};

// html fetches fire as a side effect of navigation; keep them succeeding and quiet.
beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => "<div>html</div>",
  })) as unknown as typeof fetch;
});

const initModel = async (
  scope: ReturnType<typeof fork>,
  model: ReturnType<typeof makeSetup>["model"],
) => {
  // No initialDialogs → page 1's dialogs must be fetched client-side.
  await allSettled(model.initEvt, {
    scope,
    params: {
      initialPageId: 1,
      initialPages: { 1: page(1) },
      initialHtml: { 1: "<div>html</div>" },
      answers: {},
    },
  });
};

it("fetches a page's dialogs once even while $visiblePages churns", async () => {
  const calls: number[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchDialogs = jest.fn(async (p: BuilderPage) => {
    calls.push(p.id);
    await gate; // hold every fetch open so $dialogsByPage stays unwritten
    return [dialog(p.id)];
  });

  const { model } = makeSetup(fetchDialogs);
  const scope = fork();

  // `initEvt` moves `$currentPage` null→page, which changes `$visiblePages` and
  // fires the dialogs sample — the same clock the mounted `BuilderGate` would.
  const pending = [initModel(scope, model)];
  await settle();

  // Churn $visiblePages while page 1's dialog fetch is still open: re-setting a
  // page produces a fresh `$pages` object, so `$visiblePages` recomputes. Each of
  // these used to re-queue a fetch for page 1.
  pending.push(allSettled(model.setPageListEvt, { scope, params: { 1: page(1) } }));
  pending.push(allSettled(model.setPageListEvt, { scope, params: { 1: page(1) } }));
  await settle();

  expect(calls.filter((id) => id === 1)).toHaveLength(1);

  release?.();
  await Promise.all(pending);
  await settle();

  expect(calls.filter((id) => id === 1)).toHaveLength(1);
  expect(scope.getState(model.$dialogsByPage)[1]).toEqual([dialog(1)]);
});

it("stores dialogs that succeeded when a sibling in the batch fails", async () => {
  const fetchDialogs = jest.fn(async (p: BuilderPage) => {
    if (p.id === 2) throw new Error("dialog 2 failed");
    return [dialog(p.id)];
  });

  const { model, client } = makeSetup(fetchDialogs);
  const scope = fork();

  // Two pages in the same visible window (orders 1 and 2), so their dialogs are
  // fetched in one batch.
  await allSettled(model.initEvt, {
    scope,
    params: {
      initialPageId: 1,
      initialPages: { 1: page(1), 2: page(2) },
      initialHtml: { 1: "<div>html</div>", 2: "<div>html</div>" },
      answers: {},
    },
  });
  await settle();

  const dialogsByPage = scope.getState(model.$dialogsByPage);
  // Previously `Promise.all` rejected the batch and page 1's dialogs were lost.
  expect(dialogsByPage[1]).toEqual([dialog(1)]);
  expect(dialogsByPage[2]).toBeUndefined();
  expect(scope.getState(client.$hasDialogsFailed)).toBe(true);
});

it("does not spin retrying a permanently failing dialog fetch", async () => {
  const calls: number[] = [];
  const fetchDialogs = jest.fn(async (p: BuilderPage) => {
    calls.push(p.id);
    if (p.id === 2) throw new Error("dialog 2 always fails");
    return [dialog(p.id)];
  });

  const { model } = makeSetup(fetchDialogs);
  const scope = fork();

  await allSettled(model.initEvt, {
    scope,
    params: {
      initialPageId: 1,
      initialPages: { 1: page(1), 2: page(2) },
      initialHtml: { 1: "<div>html</div>", 2: "<div>html</div>" },
      answers: {},
    },
  });
  await settle();

  const failingCallsAfterFirst = calls.filter((id) => id === 2).length;

  // Churn $visiblePages again — the broken page must not be re-driven.
  await allSettled(model.setPageListEvt, { scope, params: { 1: page(1) } });
  await settle();

  expect(calls.filter((id) => id === 2).length).toBe(failingCallsAfterFirst);
});
