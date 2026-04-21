"use client";

import { createContext, PropsWithChildren, useContext, useRef } from "react";

import { createLocalModel, LocalModel } from "../model/local-model";
import { BuilderPage } from "../types";

export const LocalContext = createContext<null | LocalModel>(null);
export default function LocalProvider({ children }: PropsWithChildren<{}>) {
  const localModel = useRef(createLocalModel()).current;
  return <LocalContext.Provider value={localModel}>{children}</LocalContext.Provider>;
}
