/**
 * The services a screen receives, for anything drawn inside a `<Funnel>` that
 * is not handed them as props — design components, nested pieces.
 */
import { createContext, useContext } from "react";

import type { ScreenProps } from "./funnel";

export const FunnelContext = createContext<ScreenProps | null>(null);

/** For design components and nested pieces that need the same services. */
export function useFunnel(): ScreenProps {
  const value = useContext(FunnelContext);
  if (!value) throw new Error("useFunnel must be used inside <Funnel>");
  return value;
}
