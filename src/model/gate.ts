import { createEffect, createEvent, createStore, sample, type EventCallable } from "effector";
import { createGate } from "effector-react";

import { BuilderDialog, BuilderPage, RequestTiming } from "../types";

import { BuilderModel } from "./store";

export const createBuilderClientModel = ({
  $visiblePages,
  $currentPage,
  $dialogsByPage,
  fetchDialogs,
  prefetchPreviousPage,
  setPageDialogs,
}: {
  $visiblePages: BuilderModel["$visiblePages"];
  $currentPage: BuilderModel["$currentPage"];
  $dialogsByPage: BuilderModel["$dialogsByPage"];
  fetchDialogs: (page: BuilderPage) => Promise<BuilderDialog[]>;
  prefetchPreviousPage?: EventCallable<void>;
  setPageDialogs: BuilderModel["setPageDialogsEvt"];
}) => {
  const BuilderGate = createGate();
  // Same normalized shape as the store model's timing stream; logged together
  // under one `request_timing` message (see builder-client.tsx).
  const requestTimingEvt = createEvent<RequestTiming>();

  // Settles per page rather than per batch: `Promise.all` rejected the whole
  // batch as soon as one dialog fetch failed, so `setPageDialogs` never ran for
  // the dialogs that HAD loaded — those pages stayed `dialogsByPage[id] ===
  // undefined`, which is exactly the `pageReady` gate in builder-client, so the
  // page never rendered and the sample below kept re-queuing the batch.
  const dialogsQuery = createEffect(
    async (
      pages: BuilderPage[],
    ): Promise<{ loaded: Record<number, BuilderDialog[]>; failedIds: number[] }> => {
      const settled = await Promise.allSettled(
        pages.map(async (page) => {
          const start = performance.now();
          try {
            const dialogs = await fetchDialogs(page);
            requestTimingEvt({
              kind: "dialog",
              page_id: page.id,
              duration_ms: Math.round(performance.now() - start),
              ok: true,
            });
            return [page.id, dialogs] as const;
          } catch (error) {
            requestTimingEvt({
              kind: "dialog",
              page_id: page.id,
              duration_ms: Math.round(performance.now() - start),
              ok: false,
            });
            throw error;
          }
        }),
      );

      const loaded: Record<number, BuilderDialog[]> = {};
      const failedIds: number[] = [];
      settled.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") {
          const [id, dialogs] = outcome.value;
          loaded[id] = dialogs;
          return;
        }
        failedIds.push(pages[index].id);
      });

      return { loaded, failedIds };
    },
  );

  sample({
    clock: dialogsQuery.doneData,
    filter: ({ loaded }) => Object.keys(loaded).length > 0,
    fn: ({ loaded }) => loaded,
    target: setPageDialogs,
  });

  // Pages whose dialog fetch is currently in flight. `$dialogsByPage` is only
  // written once the batch resolves, and `$visiblePages` is a fresh `combine`
  // array on every html/pages write, so without this guard every intervening
  // `$visiblePages` change re-queued a dialog fetch for pages already loading.
  // Those duplicate fetches (each doing `fetch(dialog.mdx_url)`) piled up and
  // starved the browser's ~6-connection budget, so the loader page — which has a
  // real dialog to fetch — stayed un-`pageReady` for minutes ("stuck before the
  // loader").
  // `serialize: "ignore"`: created per gate instance, so it can have no stable
  // sid. Without this, Builder's `serialize(scope)` warns "one or more stores
  // dont have sids" on every server render — for in-flight request bookkeeping
  // that must not cross to the client anyway. Same for the stores below.
  const $pendingDialogIds = createStore<Record<number, true>>({}, { serialize: "ignore" })
    .on(dialogsQuery, (state, pages) => ({
      ...state,
      ...Object.fromEntries(pages.map((page) => [page.id, true as const])),
    }))
    .on(dialogsQuery.finally, (state, { params }) => {
      const next = { ...state };
      params.forEach((page) => delete next[page.id]);
      return next;
    });

  // Pages whose dialog fetch failed. Excluded from re-fetching so a broken dialog
  // `mdx_url` can't spin in a retry loop; cleared once dialogs are stored for the
  // page (e.g. after navigating back to it), so a genuine retry is still possible.
  const $failedDialogIds = createStore<Record<number, true>>({}, { serialize: "ignore" })
    .on(dialogsQuery.doneData, (state, { failedIds }) => ({
      ...state,
      ...Object.fromEntries(failedIds.map((id) => [id, true as const])),
    }))
    .on(setPageDialogs, (state, payload) => {
      const next = { ...state };
      Object.keys(payload).forEach((id) => delete next[Number(id)]);
      return next;
    });

  const pagesNeedingDialogs = ({
    dialogsByPage,
    visiblePages,
    pending,
    failed,
  }: {
    dialogsByPage: Record<number, BuilderDialog[]>;
    visiblePages: BuilderPage[];
    pending: Record<number, true>;
    failed: Record<number, true>;
  }): BuilderPage[] =>
    visiblePages.filter(
      (page) =>
        dialogsByPage[page.id] === undefined && !pending[page.id] && !failed[page.id],
    );

  sample({
    clock: [BuilderGate.open, $visiblePages, dialogsQuery.finally],
    source: {
      dialogsByPage: $dialogsByPage,
      visiblePages: $visiblePages,
      pending: $pendingDialogIds,
      failed: $failedDialogIds,
    },
    filter: (source) => pagesNeedingDialogs(source).length > 0,
    fn: pagesNeedingDialogs,
    target: dialogsQuery,
  });

  if (prefetchPreviousPage) {
    sample({
      clock: [BuilderGate.open, $currentPage],
      source: $currentPage,
      filter: Boolean,
      fn: () => undefined,
      target: prefetchPreviousPage,
    });
  }

  // Reads the per-page outcome now that the effect settles instead of rejecting.
  // Reset when a fresh batch starts so a recovered fetch clears the flag.
  const $hasDialogsFailed = createStore(false, { serialize: "ignore" })
    .on(dialogsQuery, () => false)
    .on(dialogsQuery.doneData, (_, { failedIds }) => failedIds.length > 0)
    .on(dialogsQuery.fail, () => true);

  return { BuilderGate, dialogsQuery, $hasDialogsFailed, requestTimingEvt };
};

export type BuilderClientModel = ReturnType<typeof createBuilderClientModel>;
