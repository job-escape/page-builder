"use client";

import { PropsWithChildren } from "react";

import { AxonPixelAdapter, AxonPixelContext } from "./axon-pixel-context";

export function AxonPixelAdapterProvider({
  children,
  adapter,
}: PropsWithChildren<{ adapter: AxonPixelAdapter }>) {
  return <AxonPixelContext.Provider value={adapter}>{children}</AxonPixelContext.Provider>;
}
