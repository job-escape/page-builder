import { createQuery } from "@farfetched/core";
import { combine, createEffect, createEvent, createStore, sample } from "effector";

import {
  Answers,
  BuilderDialog,
  BuilderPage,
  ComponentRegisry,
  PrimitiveValue,
  RequestTiming,
  StoredValue,
} from "../types";
import { normalizePageHistory, resolvePreviousPage } from "../utils/previous-page";

export default function createBuilderModel<Page extends BuilderPage = BuilderPage>({
  fetchPage,
  fetchPagesByOrder,
  registry,
  preloadRegistry,
  getHttpRequestHeaders,
  preloadAhead = 1,
  preloadBehind = 1,
}: {
  fetchPage: ({ id, lang }: { id: number; lang?: string }) => Promise<Page>;
  fetchPagesByOrder?: (params: { order: number; lang?: string }) => Promise<Page[]>;
  registry?: ComponentRegisry;
  preloadRegistry?: ComponentRegisry;
  /**
   * Optional callback that returns extra headers (e.g. auth Bearer token) to
   * be merged into every `http_request` action. Called at request time on the
   * client. Funnel leaves this undefined; onboarding-alpha passes a fn that
   * reads the JWT from cookies.
   */
  getHttpRequestHeaders?: () => Record<string, string>;
  /**
   * How many pages ahead of the current one to keep mounted (prerendered,
   * `display:none`) and to prefetch node-data for. Default 1. Set to 0 to render
   * ONLY the current page and prefetch nothing ahead — the next page's HTML and
   * dialogs are then fetched on-demand at navigation time (a brief loading state
   * appears). Lowers upfront work/connection contention at the cost of instant
   * forward navigation.
   */
  preloadAhead?: number;
  /** How many pages behind the current one to keep mounted. Default 1 (smooth back nav). */
  preloadBehind?: number;
}) {
  // Single normalized timing stream for every request this model makes. Logged
  // to Axiom as `request_timing` by the React layer (see builder-client.tsx).
  const requestTimingEvt = createEvent<RequestTiming>();

  const timedFetchPage = async (params: { id: number; lang?: string }) => {
    const start = performance.now();
    try {
      const result = await fetchPage(params);
      requestTimingEvt({
        kind: "page",
        page_id: params.id,
        lang: params.lang,
        duration_ms: Math.round(performance.now() - start),
        ok: true,
      });
      return result;
    } catch (error) {
      requestTimingEvt({
        kind: "page",
        page_id: params.id,
        lang: params.lang,
        duration_ms: Math.round(performance.now() - start),
        ok: false,
      });
      throw error;
    }
  };

  // Wraps the optional `fetchPagesByOrder` callback so previous-page resolution
  // by order is timed too (otherwise it's a blind spot in Axiom).
  const timedFetchPagesByOrder = fetchPagesByOrder
    ? async (params: { order: number; lang?: string }) => {
        const start = performance.now();
        try {
          const result = await fetchPagesByOrder(params);
          requestTimingEvt({
            kind: "pages_by_order",
            order: params.order,
            lang: params.lang,
            duration_ms: Math.round(performance.now() - start),
            ok: true,
          });
          return result;
        } catch (error) {
          requestTimingEvt({
            kind: "pages_by_order",
            order: params.order,
            lang: params.lang,
            duration_ms: Math.round(performance.now() - start),
            ok: false,
          });
          throw error;
        }
      }
    : undefined;

  const initEvt = createEvent<{
    initialPageId: number;
    initialPageHistory?: number[];
    initialPages: Record<number, Page>;
    initialHtml: Record<number, string>;
    initialDialogs?: BuilderDialog[];
    initialDialogsByPage?: Record<number, BuilderDialog[]>;
    answers: Answers;
    lang?: string;
  }>();
  const setAnswerEvt = createEvent<{ key: string; value: StoredValue }>();
  const $answers = createStore<Answers>({}, { sid: "answers" })
    .on(setAnswerEvt, (state, payload) => ({
      ...state,
      [payload.key]: payload.value,
    }))
    .on(initEvt, (state, payload) => {
      return payload.answers;
    });
  // Subscription facts: a field→value map mirrored from the host's currently
  // selected subscription. Kept separate from $answers (so it is never persisted
  // to the answers cookie) and merged into condition facts at evaluation time as
  // `subscription_data-<field>`. The host keeps this in sync with its selection.
  const setSubscriptionFactsEvt = createEvent<Record<string, PrimitiveValue>>();
  const $subscriptionFacts = createStore<Record<string, PrimitiveValue>>(
    {},
    { sid: "subscriptionFacts" },
  ).on(setSubscriptionFactsEvt, (_, payload) => payload);

  const nextPageEvt = createEvent<number>();
  const prevPageEvt = createEvent();
  const prefetchPreviousPageEvt = createEvent();

  const setPagesEvt = createEvent<Record<number, Page>>();
  const $pages = createStore<Record<number, Page | undefined>>({}, { sid: "pages" })
    .on(setPagesEvt, (state, payload) => ({ ...state, ...payload }))
    .on(initEvt, (state, payload) => payload.initialPages);

  const setCurrentPageIdEvt = createEvent<number>();
  const $currentPageId = createStore<number | null>(null, { sid: "currentPageId" })
    .on(setCurrentPageIdEvt, (state, payload) => payload)
    .on(initEvt, (_, payload) => payload.initialPageId);
  const previousPageResolvedEvt = createEvent<Page>();
  const $pageHistory = createStore<number[]>([], { sid: "pageHistory" })
    .on(initEvt, (_, payload) => {
      if (payload.initialPageHistory?.length) {
        return normalizePageHistory(payload.initialPageHistory);
      }

      return [payload.initialPageId];
    })
    .on(nextPageEvt, (state, payload) => {
      return [...state.filter((pageId) => pageId !== payload), payload];
    })
    .on(previousPageResolvedEvt, (state, payload) => {
      return [...state.filter((pageId) => pageId !== payload.id), payload.id];
    });
  const $screenIndex = createStore(0, { sid: "screenIndex" })
    .on(initEvt, (_, payload) => Math.max((payload.initialPageHistory?.length ?? 1) - 1, 0))
    .on(nextPageEvt, (state) => state + 1)
    .on(previousPageResolvedEvt, (state) => Math.max(state - 1, 0));

  const $lang = createStore<string | undefined>(undefined, {
    sid: "lang",
    skipVoid: false,
  }).on(initEvt, (_, payload) => payload.lang);

  const $currentPage = combine($pages, $currentPageId, (pages, currentPageId) => {
    if (currentPageId === null) return null;
    return pages[currentPageId] ?? null;
  });

  // Settles per page rather than per batch: `Promise.all` rejected the whole batch
  // as soon as one MDX failed, so html that had already downloaded successfully was
  // thrown away and every page in the batch stayed html-less — which kept the
  // re-fetch condition below permanently true.
  const fetchPageHtmlFx = createEffect(
    async (
      pages: Page[],
    ): Promise<{ loaded: { id: number; html: string }[]; failedIds: number[] }> => {
      const settled = await Promise.allSettled(
        pages.map(async (page) => {
          const start = performance.now();
          let response: Response;
          try {
            response = await fetch(page.mdx_url);
          } catch (error) {
            // network-level failure (DNS, offline, CORS)
            requestTimingEvt({
              kind: "mdx",
              page_id: page.id,
              url: page.mdx_url,
              duration_ms: Math.round(performance.now() - start),
              ok: false,
            });
            throw error;
          }
          if (!response.ok) {
            requestTimingEvt({
              kind: "mdx",
              page_id: page.id,
              url: page.mdx_url,
              status: response.status,
              duration_ms: Math.round(performance.now() - start),
              ok: false,
            });
            throw new Error(`Failed to fetch html for page ${page.id}`);
          }
          const html = await response.text();
          requestTimingEvt({
            kind: "mdx",
            page_id: page.id,
            url: page.mdx_url,
            status: response.status,
            duration_ms: Math.round(performance.now() - start),
            ok: true,
          });
          return { id: page.id, html };
        }),
      );

      const loaded: { id: number; html: string }[] = [];
      const failedIds: number[] = [];
      settled.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") {
          loaded.push(outcome.value);
          return;
        }
        failedIds.push(pages[index].id);
      });

      return { loaded, failedIds };
    },
  );

  // keyed by page id

  const setPageHtmlEvt = createEvent<Record<number, string>>();
  const $pageHtml = createStore<Record<number, string | undefined>>({}, { sid: "pageHtml" })
    .on(initEvt, (state, payload) => payload.initialHtml)
    .on(setPageHtmlEvt, (state, payload) => ({ ...state, ...payload }));

  const setDialogsEvt = createEvent<BuilderDialog[]>();
  const setPageDialogsEvt = createEvent<Record<number, BuilderDialog[]>>();
  const $dialogsByPage = createStore<Record<number, BuilderDialog[]>>({}, { sid: "dialogsByPage" })
    .on(initEvt, (_, payload) => {
      if (payload.initialDialogsByPage) {
        return payload.initialDialogsByPage;
      }

      if (payload.initialDialogs && payload.initialDialogs.length > 0) {
        return { [payload.initialPageId]: payload.initialDialogs };
      }

      return {};
    })
    .on(setPageDialogsEvt, (state, payload) => ({ ...state, ...payload }));
  const $dialogs = combine($dialogsByPage, $currentPageId, (dialogsByPage, currentPageId) => {
    if (currentPageId === null) {
      return [];
    }

    return dialogsByPage[currentPageId] ?? [];
  });

  sample({
    clock: fetchPageHtmlFx.doneData,
    filter: ({ loaded }) => loaded.length > 0,
    fn: ({ loaded }) => {
      return Object.fromEntries(loaded.map((p) => [p.id, p.html])) as Record<number, string>;
    },
    target: setPageHtmlEvt,
  });

  const $visiblePages = combine($currentPage, $pages, $pageHtml, (currentPage, pages, pageHtml) => {
    if (currentPage === null) return [];
    return Object.values(pages)
      .filter((page): page is Page => Boolean(page))
      .filter((p) => p.order <= currentPage.order + preloadAhead && p.order >= currentPage.order - preloadBehind)
      .map((page) => ({ ...page, html: pageHtml[page.id] }));
  });

  sample({
    clock: nextPageEvt,
    target: setCurrentPageIdEvt,
  });

  const resolvePreviousPageFx = createEffect<
    {
      currentPage: Page;
      lang?: string;
      pageHistory: number[];
      pages: Record<number, Page | undefined>;
    },
    Page | null
  >(async ({ currentPage, lang, pageHistory, pages }) => {
    return resolvePreviousPage({
      currentPage,
      fetchPage: timedFetchPage,
      fetchPagesByOrder: timedFetchPagesByOrder,
      lang,
      pageHistory,
      pages,
    });
  });
  const prefetchPreviousPageFx = createEffect<
    {
      currentPage: Page;
      lang?: string;
      pageHistory: number[];
      pages: Record<number, Page | undefined>;
    },
    Page | null
  >(async ({ currentPage, lang, pageHistory, pages }) => {
    return resolvePreviousPage({
      currentPage,
      fetchPage: timedFetchPage,
      fetchPagesByOrder: timedFetchPagesByOrder,
      lang,
      pageHistory,
      pages,
    });
  });

  sample({
    clock: prefetchPreviousPageFx.doneData,
    filter: (page) => page !== null,
    fn: (page) => ({ [(page as Page).id]: page as Page }) as Record<number, Page>,
    target: setPagesEvt,
  });

  sample({
    clock: prefetchPreviousPageEvt,
    source: {
      currentPage: $currentPage,
      lang: $lang,
      pageHistory: $pageHistory,
      pages: $pages,
    },
    filter: ({ currentPage }) => Boolean(currentPage),
    fn: ({ currentPage, lang, pageHistory, pages }) => ({
      currentPage: currentPage as Page,
      lang,
      pageHistory,
      pages,
    }),
    target: prefetchPreviousPageFx,
  });

  sample({
    clock: prevPageEvt,
    source: {
      currentPage: $currentPage,
      lang: $lang,
      pageHistory: $pageHistory,
      pages: $pages,
    },
    filter: ({ currentPage }) => Boolean(currentPage),
    fn: ({ currentPage, lang, pageHistory, pages }) => ({
      currentPage: currentPage as Page,
      lang,
      pageHistory,
      pages,
    }),
    target: resolvePreviousPageFx,
  });

  sample({
    clock: resolvePreviousPageFx.doneData,
    filter: (page) => page !== null,
    fn: (page) => ({ [(page as Page).id]: page as Page }) as Record<number, Page>,
    target: setPagesEvt,
  });

  sample({
    clock: resolvePreviousPageFx.doneData,
    filter: (page) => page !== null,
    fn: (page) => page as Page,
    target: previousPageResolvedEvt,
  });

  sample({
    clock: previousPageResolvedEvt,
    fn: (page) => page.id,
    target: setCurrentPageIdEvt,
  });

  const fetchPagesQuery = createQuery({
    name: "fetchPages",
    handler: async ({ pageIds, lang }: { pageIds: number[]; lang?: string }) => {
      const result = await Promise.all(pageIds.map((id) => timedFetchPage({ id, lang })));
      return result;
    },
  });
  // Clocked on $currentPage (not $currentPageId) so the prefetch re-fires once the
  // current node becomes available — including after the self-heal below loads a page
  // whose forward-prefetch was dropped. Clocking on the id alone would stall the
  // prefetch chain after any missed page (it would read a null current page and fetch
  // nothing, then never retry).
  sample({
    clock: $currentPage,
    source: { currentPage: $currentPage, lang: $lang },
    filter: ({ currentPage }) => Boolean(currentPage),
    fn: ({ currentPage, lang }) => {
      if (!currentPage || preloadAhead <= 0) {
        return { pageIds: [], lang };
      }

      if (currentPage.condition) {
        const pageIds = currentPage.condition.condition
          .map((c) => c.nodeId)
          .filter((id): id is number => Boolean(id));
        return { pageIds, lang };
      }
      if (currentPage.next_node_id) {
        return { pageIds: [currentPage.next_node_id], lang };
      }

      return { pageIds: [], lang };
    },
    target: fetchPagesQuery.start,
  });

  sample({
    clock: fetchPagesQuery.finished.success,
    fn: (data) => {
      return Object.fromEntries(
        data.params.pageIds.map((pageId, index) => [pageId, data.result[index]]),
      ) as Record<number, Page>;
    },
    target: setPagesEvt,
  });

  // Self-heal: the forward prefetch only ever loads the *next* node, never the current
  // one, on the assumption it was prefetched by the previous page. If that prefetch was
  // dropped (take-latest) or failed, the page you land on is absent from $pages with no
  // way to recover. This fetches the current node by its own id when it's missing, via a
  // dedicated effect (not the shared query) so it can't be superseded by the prefetch.
  // Loading it flips $currentPage null→node, which re-fires the prefetch above.
  const ensureCurrentPageFx = createEffect(({ id, lang }: { id: number; lang?: string }) =>
    timedFetchPage({ id, lang }),
  );

  sample({
    clock: $currentPageId,
    source: { pages: $pages, lang: $lang },
    filter: ({ pages }, id) => id !== null && !pages[id],
    fn: ({ lang }, id) => ({ id: id as number, lang }),
    target: ensureCurrentPageFx,
  });

  sample({
    clock: ensureCurrentPageFx.doneData,
    fn: (page) => ({ [page.id]: page }) as Record<number, Page>,
    target: setPagesEvt,
  });

  // Pages whose html request is currently in flight. `$pageHtml` is only written
  // once a batch resolves, so without this every intervening `$pages` update
  // re-queued a fetch for pages already downloading — with several writers to
  // `$pages` (forward prefetch, previous-page resolve, self-heal) that piled up
  // duplicate MDX requests and starved the browser's ~6-connection budget, so
  // unrelated requests (dialogs) queued behind them for minutes.
  const $pendingHtmlIds = createStore<Record<number, true>>({})
    .on(fetchPageHtmlFx, (state, pages) => ({
      ...state,
      ...Object.fromEntries(pages.map((page) => [page.id, true as const])),
    }))
    .on(fetchPageHtmlFx.finally, (state, { params }) => {
      const next = { ...state };
      params.forEach((page) => delete next[page.id]);
      return next;
    });

  // Pages whose html request failed. Excluded from re-fetching so a permanently
  // broken `mdx_url` can't spin in a retry loop; cleared whenever the page object
  // is written again, so a genuine retry is still possible.
  const $failedHtmlIds = createStore<Record<number, true>>({})
    .on(fetchPageHtmlFx.doneData, (state, { failedIds }) => ({
      ...state,
      ...Object.fromEntries(failedIds.map((id) => [id, true as const])),
    }))
    .on(setPagesEvt, (state, payload) => {
      const next = { ...state };
      Object.keys(payload).forEach((id) => delete next[Number(id)]);
      return next;
    });

  const pagesNeedingHtml = ({
    pageHtml,
    pages,
    pending,
    failed,
  }: {
    pageHtml: Record<number, string | undefined>;
    pages: Record<number, Page | undefined>;
    pending: Record<number, true>;
    failed: Record<number, true>;
  }): Page[] =>
    Object.values(pages).filter((page): page is Page =>
      Boolean(page && !pageHtml[page.id] && !pending[page.id] && !failed[page.id]),
    );

  sample({
    // Explicit clock. This previously relied on `sample` falling back to clocking
    // on `source`, which made every `$pageHtml` write re-enter the same fetch.
    clock: [$pages, $pageHtml, fetchPageHtmlFx.finally],
    source: {
      pageHtml: $pageHtml,
      pages: $pages,
      pending: $pendingHtmlIds,
      failed: $failedHtmlIds,
    },
    filter: (source) => pagesNeedingHtml(source).length > 0,
    fn: pagesNeedingHtml,
    target: fetchPageHtmlFx,
  });

  const $isFetchingPage = combine(
    fetchPagesQuery.$pending,
    fetchPageHtmlFx.pending,
    resolvePreviousPageFx.pending,
    prefetchPreviousPageFx.pending,
    ensureCurrentPageFx.pending,
    (...pending) => pending.some(Boolean),
  );

  const $hasFetchFailed = createStore(false)
    .on(fetchPageHtmlFx.fail, () => true)
    .on(fetchPagesQuery.finished.failure, () => true)
    .on(fetchPagesQuery.finished.success, (state, { params }) =>
      params.pageIds.length > 0 ? false : state,
    )
    // The effect now settles per page instead of rejecting the batch, so success
    // alone no longer means everything loaded — read the per-page outcome.
    .on(fetchPageHtmlFx.doneData, (_, { failedIds }) => failedIds.length > 0);

  const finishEvt = createEvent();

  const setActiveDialogEvt = createEvent<BuilderDialog["uuid"] | null>();
  const $activeDialog = createStore<null | BuilderDialog["uuid"]>(null).on(
    setActiveDialogEvt,
    (state, payload) => payload,
  );

  return {
    setPageListEvt: setPagesEvt,
    $pages,
    setCurrentPageIdEvt,
    $visiblePages,
    $currentPageId,
    $currentPage,
    initEvt,
    $pageHtml,
    $dialogs,
    $dialogsByPage,
    setDialogsEvt,
    setPageDialogsEvt,
    nextPageEvt,
    prevPageEvt,
    prefetchPreviousPageEvt,
    $answers,
    setAnswerEvt,
    $subscriptionFacts,
    setSubscriptionFactsEvt,
    finishEvt,
    registry,
    preloadRegistry: preloadRegistry ?? registry,
    getHttpRequestHeaders,
    $activeDialog,
    setActiveDialogEvt,
    $lang,
    $pageHistory,
    $screenIndex,
    $isFetchingPage,
    $hasFetchFailed,
    requestTimingEvt,
  };
}

export type BuilderModel<Page extends BuilderPage = BuilderPage> = ReturnType<
  typeof createBuilderModel<Page>
>;
