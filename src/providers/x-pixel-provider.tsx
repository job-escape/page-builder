"use client";

import { PropsWithChildren } from "react";

import { XPixelAdapter, XPixelContext } from "./x-pixel-context";

export function XPixelAdapterProvider({
  children,
  adapter,
}: PropsWithChildren<{ adapter: XPixelAdapter }>) {
  return <XPixelContext.Provider value={adapter}>{children}</XPixelContext.Provider>;
}
