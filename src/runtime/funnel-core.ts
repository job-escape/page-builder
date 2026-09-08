/**
 * Everything a mounted funnel is, minus the drawing.
 *
 * One store, one navigator, one locale lookup, and the services a screen module
 * is handed. Extracted when a second platform arrived: the web and native
 * `Funnel` components differ in four things — the brick catalogue, the screen
 * host, the overlay, and whether "go back" is the Escape key or a hardware
 * button — and none of those are reasons to keep two copies of the state
 * machine.
 *
 * No JSX and no platform imports, so React Native gets it unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { createNavigator, type NavigationState, type Presentation } from "./navigation";
import { request } from "./request";
import { createFunnelStore, type FunnelStore } from "./store";
import type { VariableDecl, VariableTable } from "./types";
import type { ScreenPresentation } from "./compiler/manifest";

export type FunnelNav = {
  show: (target: string, presentation?: Presentation) => void;
  close: () => void;
  back: () => boolean;
  canGoBack: () => boolean;
  state: () => NavigationState;
};

export type FunnelManifest = {
  entry: string;
  variables: VariableDecl[];
  /** Per-frame presentation defaults for overlays. */
  overlayDefaults?: Record<string, Presentation>;
  /**
   * How each screen behaves as a surface, by screen id.
   *
   * From the artifact, because a funnel contains different kinds of page and no
   * app can know the screen ids of every funnel it might render.
   */
  screens?: Record<string, ScreenPresentation>;
};

export type FunnelServices<Ui, Component> = {
  ui: Ui;
  /** Design components — compositions the designer saved. */
  c: Record<string, Component>;
  /** Locale lookup. Every user-visible string is a key. */
  t: (key: string) => string;
  state: FunnelStore;
  nav: FunnelNav;
  /** The one call a compiled screen makes to a backend. A name, never a URL. */
  req: typeof request;
};

export type FunnelCoreOptions<Ui, Component> = {
  manifest: FunnelManifest;
  known: ReadonlySet<string>;
  ui: Ui;
  components: Record<string, Component>;
  locale: Record<string, string>;
  persist?: { funnelId: string | number; version: string };
  onUnknown?: (kind: "variable" | "target" | "key", name: string) => void;
  /**
   * What the host knows about this visitor — the answers to
   * `manifest.visitorFacts`.
   *
   * Threaded rather than resolved here, because *how* to answer them differs
   * per host and none of the answers are the runtime's to find: on the web a
   * campaign tag is in the URL and a country is a CDN header; in the app the
   * platform is a constant and the campaign came from install attribution.
   * `funnel-as-code.md` §9.6a takes the same line about backend addresses, and
   * for the same reason — an artifact that went looking would have to carry
   * something it must not.
   *
   * A fact the host cannot answer is simply absent, and a test on an absent
   * fact matches nothing. See `createFunnelStore`.
   */
  visitor?: Readonly<Record<string, string | number | boolean | null>>;
};

export function useFunnelRuntime<Ui, Component>({
  manifest,
  known,
  ui,
  components,
  locale,
  persist,
  onUnknown,
  visitor,
}: FunnelCoreOptions<Ui, Component>) {
  const table: VariableTable = useMemo(
    () => Object.fromEntries(manifest.variables.map((decl) => [decl.name, decl])),
    [manifest.variables],
  );

  /** Cancellers registered by whatever a screen started — see `onLeaveScreen`. */
  const owned = useRef(new Map<string, Array<() => void>>());

  const store = useMemo(
    () =>
      createFunnelStore({
        table,
        persist,
        visitor,
        onUnknown: (name) => onUnknown?.("variable", name),
      }),
    // A new store per funnel identity, not per render.
    [table, persist, visitor, onUnknown],
  );

  const navigator = useMemo(
    () =>
      createNavigator({
        entry: manifest.entry,
        defaults: manifest.overlayDefaults,
        known,
        onUnknown: (target) => onUnknown?.("target", target),
        onLeaveScreen: (screen) => {
          // Anything the outgoing screen started stops here, before it can write
          // to state belonging to a screen nobody is on.
          owned.current.get(screen)?.forEach((cancel) => cancel());
          owned.current.delete(screen);
        },
      }),
    [manifest.entry, manifest.overlayDefaults, known, onUnknown],
  );

  const navState = useSyncExternalStore(navigator.subscribe, navigator.state, navigator.state);
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);

  const t = useCallback(
    (key: string) => {
      const value = locale[key];
      if (value === undefined) {
        onUnknown?.("key", key);
        // Never show a raw key to a customer; an empty string is less wrong.
        return "";
      }
      return value;
    },
    [locale, onUnknown],
  );

  const nav: FunnelNav = useMemo(
    () => ({
      show: navigator.show,
      close: navigator.close,
      back: navigator.back,
      canGoBack: navigator.canGoBack,
      state: navigator.state,
    }),
    [navigator],
  );

  const services = useMemo<FunnelServices<Ui, Component>>(
    () => ({ ui, c: components, t, state: store, nav, req: request }),
    [ui, components, t, store, nav],
  );

  return { services, navState, navigator };
}

/**
 * Back, wired to whatever a platform calls back.
 *
 * The web passes Escape, native passes the hardware button. Both land on
 * `navigator.close()` — which dismisses the top overlay if there is one, and is
 * why "back while a sheet is open closes the sheet" is true on both without
 * either platform implementing it.
 */
export function useDismissOnBack(
  subscribe: (dismiss: () => void) => () => void,
  navigator: { close: () => boolean },
): void {
  useEffect(() => subscribe(() => navigator.close()), [subscribe, navigator]);
}
