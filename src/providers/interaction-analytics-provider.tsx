"use client";

import { PropsWithChildren } from "react";

import {
  InteractionAnalyticsContext,
  InteractionAnalyticsContextValue,
} from "./interaction-analytics-context";

export function InteractionAnalyticsProvider({
  children,
  value,
}: PropsWithChildren<{ value: InteractionAnalyticsContextValue }>) {
  return (
    <InteractionAnalyticsContext.Provider value={value}>
      {children}
    </InteractionAnalyticsContext.Provider>
  );
}
