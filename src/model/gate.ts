import { createEffect, createStore, sample, type EventCallable } from "effector";
import { createGate } from "effector-react";

import { BuilderDialog, BuilderPage } from "../types";

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
  const dialogsQuery = createEffect(async (pages: BuilderPage[]) => {
    const dialogsEntries = await Promise.all(
      pages.map(async (page) => [page.id, await fetchDialogs(page)] as const),
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

  return { BuilderGate, dialogsQuery, $hasDialogsFailed };
};

export type BuilderClientModel = ReturnType<typeof createBuilderClientModel>;
