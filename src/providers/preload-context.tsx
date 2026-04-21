"use client";

import { createContext, PropsWithChildren, useContext } from "react";

const PreloadContext = createContext(false);

export function PreloadProvider({ preload, children }: PropsWithChildren<{ preload: boolean }>) {
  return <PreloadContext.Provider value={preload}>{children}</PreloadContext.Provider>;
}

export function usePreload(): boolean {
  return useContext(PreloadContext);
}
