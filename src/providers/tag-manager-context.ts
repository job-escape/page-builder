"use client";

import { createContext, useContext } from "react";

export type TagManagerAdapter = {
  pushEvent: (event: string, props?: Record<string, unknown>) => void;
};

export const TagManagerContext = createContext<TagManagerAdapter | null>(null);

export const useTagManagerAdapter = (): TagManagerAdapter => {
  const adapter = useContext(TagManagerContext);
  if (adapter) return adapter;
  return {
    pushEvent: () => {
      /* no-op when no adapter is configured */
    },
  };
};
