import { useContext } from "react";

import { PageContext } from "../providers/page-provider";
import { BuilderPage } from "../types";

export const usePage = <Page extends BuilderPage = BuilderPage>(): Page => {
  const context = useContext(PageContext);
  if (!context) throw new Error("usePage must be wrapped with page-provider");
  return context as Page;
};
