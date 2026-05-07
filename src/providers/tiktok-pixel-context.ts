"use client";

import { createContext, useContext } from "react";

export type TiktokPixelAdapter = {
  track: (event: string, props?: Record<string, unknown>) => void;
};

export const TiktokPixelContext = createContext<TiktokPixelAdapter | null>(null);

export const useTiktokPixelAdapter = (): TiktokPixelAdapter => {
  const adapter = useContext(TiktokPixelContext);
  if (adapter) return adapter;
  return {
    track: () => {
      /* no-op when no adapter is configured */
    },
  };
};
