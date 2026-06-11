"use client";

import { createContext, useContext } from "react";

import { Answers, BuilderPage, PrimitiveValue } from "../types";

export type XPixelProps = Record<string, unknown>;

export type XPixelRuntimeContext = {
  answers: Partial<Answers>;
  localStates: Record<string, PrimitiveValue | string[]>;
  page: BuilderPage;
  screenIndex: number;
};

export type XPixelAdapter = {
  track: (event: string, props?: XPixelProps) => void;
  getProps?: (context: XPixelRuntimeContext) => XPixelProps;
};

export const XPixelContext = createContext<XPixelAdapter | null>(null);

export const useXPixelAdapter = (): XPixelAdapter => {
  const adapter = useContext(XPixelContext);
  if (adapter) return adapter;
  return {
    track: () => {
      /* no-op when no adapter is configured */
    },
  };
};
