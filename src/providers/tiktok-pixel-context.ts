"use client";

import { createContext, useContext } from "react";

import { Answers, BuilderPage, PrimitiveValue } from "../types";

export type TiktokPixelProps = Record<string, unknown>;

export type TiktokPixelRuntimeContext = {
  answers: Partial<Answers>;
  localStates: Record<string, PrimitiveValue | string[]>;
  page: BuilderPage;
  screenIndex: number;
};

export type TiktokPixelAdapter = {
  track: (event: string, props?: TiktokPixelProps) => void;
  getProps?: (context: TiktokPixelRuntimeContext) => TiktokPixelProps;
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
