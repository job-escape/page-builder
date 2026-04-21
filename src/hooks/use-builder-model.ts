import { useContext } from "react";

import { BuilderClientModel } from "../model/gate";
import { BuilderModel } from "../model/store";
import { ClientModelContext, ModelContext } from "../providers/model-provider";

export const useBuilderModel = (): BuilderModel => {
  const context = useContext(ModelContext);
  if (!context) throw new Error("useBuilderModel must be wrapped with model-provider");
  return context;
};

export const useClientBuilderModel = (): BuilderClientModel => {
  const context = useContext(ClientModelContext);
  if (!context) throw new Error("useClientBuilderModel must be wrapped with client-model-provider");
  return context;
};
