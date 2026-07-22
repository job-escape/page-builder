/**
 * Regression tests for how page MDX html is fetched.
 *
 * Two defects lived here:
 *
 * 1. The `sample` driving `fetchPageHtmlFx` had no `clock`, so it fell back to
 *    clocking on its `source` — every `$pages`/`$pageHtml` write re-entered it.
 *    `$pageHtml` is only written once a batch resolves, so any `$pages` update
 *    while a fetch was in flight re-queued the same pages. With three writers to
 *    `$pages` (forward prefetch, previous-page resolve, self-heal) duplicate MDX
 *    requests piled up and starved the browser's ~6-connection budget, so
 *    unrelated requests queued behind them for minutes.
 *
 * 2. The effect used `Promise.all`, so one failing MDX rejected the whole batch
 *    and discarded html that had already downloaded — leaving those pages
 *    html-less, which kept the re-fetch condition permanently true.
 */
import { allSettled, fork } from "effector";

import createBuilderModel from "./store";

import { BuilderPage } from "../types";

const page = (id: number): BuilderPage => ({
  id,
  design_url: "",
  mdx_url: `https://cdn.test/${id}.mdx`,
  order: id,
  tree_order: id,
  pageId: id,
});

const makeModel = () =>
  createBuilderModel({
    fetchPage: async ({ id }) => page(id),
  });

/** Resolve pending microtasks/promises without relying on timers. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

type FetchMock = jest.Mock<Promise<Partial<Response>>, [string]>;

let fetchMock: FetchMock;

const urlsFetched = () => fetchMock.mock.calls.map(([url]) => url);

const countFor = (id: number) =>
  urlsFetched().filter((url) => url === `https://cdn.test/${id}.mdx`).length;

beforeEach(() => {
  fetchMock = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => `<div>${url}</div>`,
  })) as unknown as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
});

const init = async (scope: ReturnType<typeof fork>, model: ReturnType<typeof makeModel>) => {
  await allSettled(model.initEvt, {
    scope,
    params: {
      initialPageId: 1,
      initialPages: { 1: page(1) },
      initialHtml: {},
      answers: {},
    },
  });
};

it("fetches each page's html exactly once", async () => {
  const model = makeModel();
  const scope = fork();

  await init(scope, model);
  await settle();

  expect(countFor(1)).toBe(1);
});

it("does not re-fetch a page whose html request is already in flight", async () => {
  const model = makeModel();
  const scope = fork();

  // Hold the html request open so `$pageHtml` stays unwritten while `$pages` moves.
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetchMock.mockImplementation(async (url: string) => {
    await gate;
    return { ok: true, status: 200, text: async () => `<div>${url}</div>` };
  });

  // `allSettled` waits for pending effects, and the gate holds them open, so these
  // are collected and awaited only after the gate is released.
  const pending = [init(scope, model)];
  await settle();

  // Other writers touch `$pages` mid-flight — the case that used to duplicate.
  pending.push(allSettled(model.setPageListEvt, { scope, params: { 2: page(2) } }));
  pending.push(allSettled(model.setPageListEvt, { scope, params: { 3: page(3) } }));
  await settle();

  // Page 1 is still downloading; it must not have been queued a second time.
  expect(countFor(1)).toBe(1);

  release?.();
  await Promise.all(pending);
  await settle();

  expect(countFor(1)).toBe(1);
  expect(countFor(2)).toBe(1);
  expect(countFor(3)).toBe(1);
}, 15000);

it("keeps html that succeeded when another page in the batch fails", async () => {
  const model = makeModel();
  const scope = fork();

  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/2.mdx")) {
      return { ok: false, status: 404, text: async () => "" };
    }
    return { ok: true, status: 200, text: async () => `<div>${url}</div>` };
  });

  // Both pages must be in the SAME batch for this to exercise batch rejection.
  await allSettled(model.initEvt, {
    scope,
    params: {
      initialPageId: 1,
      initialPages: { 1: page(1), 2: page(2) },
      initialHtml: {},
      answers: {},
    },
  });
  await settle();

  const html = scope.getState(model.$pageHtml);

  // Previously `Promise.all` rejected the batch and page 1's html was discarded
  // even though it had downloaded fine.
  expect(html[1]).toBe("<div>https://cdn.test/1.mdx</div>");
  expect(html[2]).toBeUndefined();
  expect(scope.getState(model.$hasFetchFailed)).toBe(true);
});

it("does not spin retrying a permanently failing page", async () => {
  const model = makeModel();
  const scope = fork();

  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/2.mdx")) {
      return { ok: false, status: 500, text: async () => "" };
    }
    return { ok: true, status: 200, text: async () => `<div>${url}</div>` };
  });

  await init(scope, model);
  await allSettled(model.setPageListEvt, { scope, params: { 2: page(2) } });
  await settle();

  const afterFirstFailure = countFor(2);

  // Further unrelated `$pages` activity must not re-drive the broken page.
  await allSettled(model.setPageListEvt, { scope, params: { 3: page(3) } });
  await settle();

  expect(countFor(2)).toBe(afterFirstFailure);
  expect(countFor(3)).toBe(1);
});
