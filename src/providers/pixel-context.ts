"use client";

import { createContext, useContext } from "react";

import { PixelTrackEvent } from "../types";

export type PixelAdapter = {
  track: (event: PixelTrackEvent) => void;
};

export const PixelContext = createContext<PixelAdapter | null>(null);

export const usePixelAdapter = (): PixelAdapter => {
  const adapter = useContext(PixelContext);
  if (adapter) return adapter;
  return {
    track: () => {
      /* no-op when no adapter is configured */
    },
  };
};
