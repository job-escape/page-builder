"use client";

import { createContext, PropsWithChildren, useContext } from "react";

import { BuilderClientModel } from "../model/gate";
import { BuilderModel } from "../model/store";

export const ModelContext = createContext<null | BuilderModel>(null);
export default function ModelProvider({
  model,
  children,
}: PropsWithChildren<{ model: BuilderModel }>) {
  return <ModelContext.Provider value={model}>{children}</ModelContext.Provider>;
}

export const ClientModelContext = createContext<null | BuilderClientModel>(null);
export function ClientModelProvider({
  model,
  children,
}: PropsWithChildren<{ model: BuilderClientModel }>) {
  return <ClientModelContext.Provider value={model}>{children}</ClientModelContext.Provider>;
}
