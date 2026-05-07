"use client";

import { createContext, useContext } from "react";

export type AxonPixelAdapter = {
  track: (event: string, props?: Record<string, unknown>) => void;
};

export const AxonPixelContext = createContext<AxonPixelAdapter | null>(null);

export const useAxonPixelAdapter = (): AxonPixelAdapter => {
  const adapter = useContext(AxonPixelContext);
  if (adapter) return adapter;
  return {
    track: () => {
      /* no-op when no adapter is configured */
    },
  };
};
