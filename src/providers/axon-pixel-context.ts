"use client";

import { createContext, useContext } from "react";

import { Answers, BuilderPage, PrimitiveValue } from "../types";

export type AxonPixelProps = Record<string, unknown>;

export type AxonPixelRuntimeContext = {
  answers: Partial<Answers>;
  localStates: Record<string, PrimitiveValue | string[]>;
  page: BuilderPage;
  screenIndex: number;
};

export type AxonPixelAdapter = {
  track: (event: string, props?: AxonPixelProps) => void;
  getProps?: (context: AxonPixelRuntimeContext) => AxonPixelProps;
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
