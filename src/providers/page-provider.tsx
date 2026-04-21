"use client";

import { createContext, PropsWithChildren } from "react";

import { BuilderPage } from "../types";

/* eslint-disable react-refresh/only-export-components */
export const PageContext = createContext<null | BuilderPage>(null);
/* eslint-enable react-refresh/only-export-components */
export default function PageProvider<Page extends BuilderPage>({
  page,
  children,
}: PropsWithChildren<{ page: Page }>) {
  return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}
