"use client";

import { createContext, useContext } from "react";

import { Answers, BuilderPage, PrimitiveValue } from "../types";

export type InteractionAnalyticsProps = Record<string, unknown>;

export type InteractionAnalyticsRuntimeContext = {
  answers: Partial<Answers>;
  localStates: Record<string, PrimitiveValue | string[]>;
  page: BuilderPage;
  screenIndex: number;
};

export type InteractionAnalyticsContextValue = {
  track: (event: string, props: InteractionAnalyticsProps) => void;
  getProps?: (context: InteractionAnalyticsRuntimeContext) => InteractionAnalyticsProps;
};

export const InteractionAnalyticsContext = createContext<InteractionAnalyticsContextValue | null>(
  null,
);

export const useInteractionAnalytics = () => {
  return useContext(InteractionAnalyticsContext);
};
