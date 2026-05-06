"use client";

import { PropsWithChildren } from "react";

import { TagManagerAdapter, TagManagerContext } from "./tag-manager-context";

export function TagManagerAdapterProvider({
  children,
  adapter,
}: PropsWithChildren<{ adapter: TagManagerAdapter }>) {
  return <TagManagerContext.Provider value={adapter}>{children}</TagManagerContext.Provider>;
}
