"use client";

import { PropsWithChildren } from "react";

import { PixelAdapter, PixelContext } from "./pixel-context";

export function PixelAdapterProvider({
  children,
  adapter,
}: PropsWithChildren<{ adapter: PixelAdapter }>) {
  return <PixelContext.Provider value={adapter}>{children}</PixelContext.Provider>;
}
