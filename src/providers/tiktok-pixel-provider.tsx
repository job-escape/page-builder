"use client";

import { PropsWithChildren } from "react";

import { TiktokPixelAdapter, TiktokPixelContext } from "./tiktok-pixel-context";

export function TiktokPixelAdapterProvider({
  children,
  adapter,
}: PropsWithChildren<{ adapter: TiktokPixelAdapter }>) {
  return <TiktokPixelContext.Provider value={adapter}>{children}</TiktokPixelContext.Provider>;
}
