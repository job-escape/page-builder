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

  const dialogsQuery = createEffect(async (pages: BuilderPage[]) => {
    const dialogsEntries = await Promise.all(
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

    return Object.fromEntries(dialogsEntries) as Record<number, BuilderDialog[]>;
  });

  sample({
    clock: dialogsQuery.doneData,
    fn: (result) => result,
    target: setPageDialogs,
  });

  sample({
    clock: [BuilderGate.open, $visiblePages],
    source: {
      dialogsByPage: $dialogsByPage,
      visiblePages: $visiblePages,
    },
    filter: ({ dialogsByPage, visiblePages }) =>
      visiblePages.some((page) => dialogsByPage[page.id] === undefined),
    fn: ({ dialogsByPage, visiblePages }) =>
      visiblePages.filter((page) => dialogsByPage[page.id] === undefined),
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

  const $hasDialogsFailed = createStore(false)
    .on(dialogsQuery.fail, () => true)
    .on(dialogsQuery, () => false);

  return { BuilderGate, dialogsQuery, $hasDialogsFailed, requestTimingEvt };
};

export type BuilderClientModel = ReturnType<typeof createBuilderClientModel>;
