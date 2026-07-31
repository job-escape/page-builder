import { EffectorNext } from "@effector/next";
import { allSettled, fork, serialize } from "effector";

import { PropsWithChildren } from "react";

import { BuilderModel } from "../model/store";
import { Answers, BuilderDialog, BuilderPage } from "../types";

export default async function Builder<Page extends BuilderPage = BuilderPage>({
  initialPages,
  model,
  children,
  initialPageId,
  initialPageHistory,
  initialHtml,
  initialDialogs,
  initialDialogsByPage,
  answers,
  lang,
  values,
}: PropsWithChildren<{
  initialPages: Record<Page["id"], Page>;
  model: BuilderModel<Page>;
  initialPageId: number;
  initialPageHistory?: number[];
  initialHtml: string;
  initialDialogs?: BuilderDialog[];
  initialDialogsByPage?: Record<number, BuilderDialog[]>;
  answers: Answers;
  lang?: string;
  /**
   * Hydration values for stores the host owns, keyed by sid — the same shape
   * `fork({ values })` and `EffectorNext` take.
   *
   * A host that seeds its own stores server-side has no other way in. Wrapping
   * this component in a second `EffectorNext` looks like it works, because on
   * the client every provider merges into one shared scope. On the server each
   * provider forks a scope of its own, so the one rendered here wins and the
   * host's values never reach the tree: SSR emits the page with everything
   * derived from them missing, the client renders it filled, and React
   * discards that whole subtree as a hydration mismatch and rebuilds it.
   *
   * Seeded before `initEvt`, so this model's own init still has the last word
   * on the stores it owns.
   */
  values?: Record<string, unknown>;
}>) {
  const store = fork(values ? { values } : undefined);

  await allSettled(model.initEvt, {
    scope: store,
    params: {
      initialPageId,
      initialPageHistory,
      initialPages,
      initialHtml: { [initialPageId]: initialHtml },
      initialDialogs,
      initialDialogsByPage,
      answers,
      lang,
    },
  });

  // Carries the host's seeded values back out too: they are in this scope, so
  // one provider hydrates both sides of the contract.
  const hydrationValues = serialize(store);
  return <EffectorNext values={hydrationValues}>{children}</EffectorNext>;
}
