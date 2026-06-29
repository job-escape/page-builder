"use client";

import { useEffect } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Warm a lazily-loaded chunk in the background (during idle time) as soon as the
 * component mounts — including during the hidden next-step pre-render — so the
 * chunk is already cached when the component goes active. Keeps the heavy code
 * out of first-load while avoiding an on-demand fetch/flicker on navigation.
 */
export function usePreloadChunk(loader: () => Promise<unknown>): void {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const warm = () => {
      if (!cancelled) void loader();
    };
    const w = window as IdleWindow;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") idleId = w.requestIdleCallback(warm);
    else timer = setTimeout(warm, 0);
    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timer) clearTimeout(timer);
    };
    // loader is a stable module-level function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
