import { useContext } from "react";

import { LocalModel } from "../model/local-model";
import { BuilderModel } from "../model/store";
import { LocalContext } from "../providers/local-provider";
import { ModelContext } from "../providers/model-provider";
import { PageContext } from "../providers/page-provider";
import { BuilderPage } from "../types";

export const useLocalModel = (): LocalModel => {
  const context = useContext(LocalContext);
  if (!context) throw new Error("useLocalModel must be wrapped with local provider");
  return context;
};
