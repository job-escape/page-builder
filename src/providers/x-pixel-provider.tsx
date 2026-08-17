"use client";

import { PropsWithChildren, useEffect, useMemo } from "react";

import { createXPixelRuntime } from "../lib/x-pixel";

import {
  XPixelAdapter,
  XPixelContext,
  XPixelProps,
  XPixelRuntimeContext,
} from "./x-pixel-context";

/**
 * Wires the constructor's authored `x_push` actions to the X pixel.
 *
 * Two ways in, and `config` is the one to reach for:
 *
 *   config   hand over the X configuration and the engine owns the rest —
 *            injecting X's snippet, configuring the pixel once, mapping an
 *            authored event name to its conversion id, and dropping the
 *            parameters X has no field for.
 *   adapter  the host owns the pixel and this only routes to it. Kept for hosts
 *            that already had one; a host doing this has to get X's snippet, its
 *            `tw-<pixel>-<conversion>` ids and its parameter allow-list right by
 *            itself, which is the duplication `config` exists to end.
 *
 * `config` wins if both are given.
 */
export function XPixelAdapterProvider({
  children,
  adapter,
  config,
  getProps,
}: PropsWithChildren<{
  adapter?: XPixelAdapter;
  /**
   * The X configuration, in any shape a human may have authored it in — an
   * object of conversions (`{ id, purchase, … }`), a single id, or a list of
   * one. Normalised rather than validated: this runs during render, where a
   * throw takes hydration down with it.
   */
  config?: unknown;
  /** Merged into every event, as with the other pixel adapters. */
  getProps?: (context: XPixelRuntimeContext) => XPixelProps;
}>) {
  // One runtime for the life of the provider: it holds the queue of events
  // fired before the configuration resolved, and rebuilding it per render would
  // drop whatever had not been sent yet.
  const runtime = useMemo(() => createXPixelRuntime(), []);

  const useConfig = config !== undefined;

  // Re-runs as the configuration resolves — a host reading it from a feature
  // flag answers a beat after the first render. `configure` is what makes that
  // idempotent, so a second pass cannot double-configure a pixel.
  useEffect(() => {
    if (useConfig) runtime.configure(config);
  }, [runtime, useConfig, config]);

  const value = useMemo<XPixelAdapter>(
    () =>
      useConfig ? { track: runtime.track, getProps } : (adapter ?? { track: () => {} }),
    [useConfig, runtime, getProps, adapter],
  );

  return <XPixelContext.Provider value={value}>{children}</XPixelContext.Provider>;
}
