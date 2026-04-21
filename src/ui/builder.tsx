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
  initialDialogs = [],
  initialDialogsByPage,
  answers,
  lang,
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
}>) {
  const store = fork();

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

  const values = serialize(store);
  return <EffectorNext values={values}>{children}</EffectorNext>;
}
