"use client";

import { PropsWithChildren, useEffect, useMemo } from "react";

import { createMetaPixelRuntime } from "../lib/meta-pixel";

import { PixelAdapter, PixelContext } from "./pixel-context";

/**
 * Wires the constructor's authored `pixel_track` actions to the Meta pixel.
 *
 * Two ways in, and `config` is the one to reach for:
 *
 *   config   hand over the pixel ids and the engine owns the rest — Meta's base
 *            snippet, initialising each id exactly once, the page view, and the
 *            events fired before the ids resolved.
 *   adapter  the host owns the pixel and this only routes to it. Kept for hosts
 *            that already had one.
 *
 * `config` wins if both are given.
 */
export function PixelAdapterProvider({
  children,
  adapter,
  config,
}: PropsWithChildren<{
  adapter?: PixelAdapter;
  /**
   * The pixel ids for this visitor — a list, or one comma-separated string.
   * Which ids those are stays the host's decision: they come from a flag
   * targeted on the visitor, and only the host can evaluate that.
   */
  config?: unknown;
}>) {
  // One runtime for the life of the provider: it holds the queue of events
  // fired before the ids resolved, and rebuilding it per render would drop
  // whatever had not been sent yet.
  const runtime = useMemo(() => createMetaPixelRuntime(), []);

  const useConfig = config !== undefined;

  // Re-runs as the ids resolve — a host reading them from a feature flag
  // answers a beat after the first render. `configure` is what makes that
  // idempotent, so a second pass cannot re-initialise a pixel.
  useEffect(() => {
    if (useConfig) runtime.configure(config);
  }, [runtime, useConfig, config]);

  const value = useMemo<PixelAdapter>(
    () => (useConfig ? { track: runtime.track } : (adapter ?? { track: () => {} })),
    [useConfig, runtime, adapter],
  );

  return <PixelContext.Provider value={value}>{children}</PixelContext.Provider>;
}
