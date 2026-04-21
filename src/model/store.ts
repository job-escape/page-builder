import { createQuery } from "@farfetched/core";
import { combine, createEffect, createEvent, createStore, sample } from "effector";

import { Answers, BuilderDialog, BuilderPage, ComponentRegisry, StoredValue } from "../types";
import { normalizePageHistory, resolvePreviousPage } from "../utils/previous-page";

export default function createBuilderModel<Page extends BuilderPage = BuilderPage>({
  fetchPage,
  fetchPagesByOrder,
  registry,
  preloadRegistry,
  getHttpRequestHeaders,
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
}) {
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

  const fetchPageHtmlFx = createEffect(
    async (pages: Page[]): Promise<{ id: number; html: string }[]> => {
      const result = await Promise.all(
        pages.map(async (page) => {
          const response = await fetch(page.mdx_url);
          if (!response.ok) throw new Error(`Failed to fetch html for page ${page.id}`);
          const html = await response.text();
          return { id: page.id, html };
        }),
      );
      return result;
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

      if (payload.initialDialogs) {
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
    fn: (result) => {
      return Object.fromEntries(result.map((p) => [p.id, p.html])) as Record<number, string>;
    },
    target: setPageHtmlEvt,
  });

  const $visiblePages = combine($currentPage, $pages, $pageHtml, (currentPage, pages, pageHtml) => {
    if (currentPage === null) return [];
    return Object.values(pages)
      .filter((page): page is Page => Boolean(page))
      .filter((p) => p.order <= currentPage.order + 1 && p.order >= currentPage.order - 1)
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
      fetchPage,
      fetchPagesByOrder,
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
      fetchPage,
      fetchPagesByOrder,
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
      const result = await Promise.all(pageIds.map((id) => fetchPage({ id, lang })));
      return result;
    },
  });
  sample({
    clock: $currentPageId,
    source: { currentPage: $currentPage, lang: $lang },
    filter: Boolean,
    fn: ({ currentPage, lang }) => {
      if (!currentPage) {
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

  sample({
    source: { pageHtml: $pageHtml, pages: $pages },
    filter: ({ pageHtml, pages }) =>
      Object.values(pages).some((page) => Boolean(page && !pageHtml[page.id])),
    fn: ({ pageHtml, pages }) => {
      return Object.values(pages).filter((page): page is Page =>
        Boolean(page && !pageHtml[page.id]),
      );
    },
    target: fetchPageHtmlFx,
  });

  const $isFetchingPage = combine(
    fetchPagesQuery.$pending,
    fetchPageHtmlFx.pending,
    resolvePreviousPageFx.pending,
    prefetchPreviousPageFx.pending,
    (...pending) => pending.some(Boolean),
  );

  const $hasFetchFailed = createStore(false)
    .on(fetchPageHtmlFx.fail, () => true)
    .on(fetchPagesQuery.finished.failure, () => true)
    .on(fetchPagesQuery.finished.success, (state, { params }) =>
      params.pageIds.length > 0 ? false : state,
    )
    .on(fetchPageHtmlFx.done, () => false);

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
  };
}

export type BuilderModel<Page extends BuilderPage = BuilderPage> = ReturnType<
  typeof createBuilderModel<Page>
>;
