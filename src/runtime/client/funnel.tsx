/**
 * Mount a compiled funnel.
 *
 * `<Funnel>` owns one store and one navigator, and renders whatever screen the
 * navigator says is current with any overlays stacked on top. Screen modules are
 * plain functions of `{ ui, c, t, state, nav }` — exactly what the compiler will
 * emit — so a hand-written module and a compiled one are interchangeable, which
 * is what lets this be exercised before the compiler exists.
 *
 * Re-rendering goes through `useSyncExternalStore` against the store's and the
 * navigator's own subscriptions. No Effector, no context gymnastics: an option
 * re-renders because the value it compares itself against changed.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { createNavigator, type NavigationState, type Presentation } from "../navigation";
import { createFunnelStore, type FunnelStore } from "../store";
import type { VariableDecl, VariableTable } from "../types";
import { ui, type Ui } from "./bricks";
import { request } from "../request";
import { Overlay } from "./overlay";

/** What a compiled screen module is handed. */
export type ScreenProps = {
  ui: Ui;
  /** Design components — compositions the designer saved. */
  c: Record<string, (props: never) => ReactNode>;
  /** Locale lookup. Every user-visible string is a key. */
  t: (key: string) => string;
  state: FunnelStore;
  nav: FunnelNav;
  /**
   * The one call a compiled module makes to a backend. A *name*, never a URL —
   * the artifact is a public file and can hold no secret. See `runtime/request`.
   */
  req: typeof request;
};

export type ScreenModule = (props: ScreenProps) => ReactNode;

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
};

export type FunnelProps = {
  manifest: FunnelManifest;
  screens: Record<string, ScreenModule>;
  components?: Record<string, (props: never) => ReactNode>;
  locale?: Record<string, string>;
  /** Absent disables persistence — preview must not leave answers behind. */
  persist?: { funnelId: string | number; version: string };
  onUnknown?: (kind: "variable" | "target" | "key", name: string) => void;
};

const FunnelContext = createContext<ScreenProps | null>(null);

/** For design components and nested pieces that need the same services. */
export function useFunnel(): ScreenProps {
  const value = useContext(FunnelContext);
  if (!value) throw new Error("useFunnel must be used inside <Funnel>");
  return value;
}

export function Funnel({
  manifest,
  screens,
  components = {},
  locale = {},
  persist,
  onUnknown,
}: FunnelProps) {
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
        onUnknown: (name) => onUnknown?.("variable", name),
      }),
    // A new store per funnel identity, not per render.
    [table, persist, onUnknown],
  );

  const navigator = useMemo(
    () =>
      createNavigator({
        entry: manifest.entry,
        defaults: manifest.overlayDefaults,
        known: new Set(Object.keys(screens)),
        onUnknown: (target) => onUnknown?.("target", target),
        onLeaveScreen: (screen) => {
          // Anything the outgoing screen started stops here, before it can write
          // to state belonging to a screen nobody is on.
          owned.current.get(screen)?.forEach((cancel) => cancel());
          owned.current.delete(screen);
        },
      }),
    [manifest.entry, manifest.overlayDefaults, screens, onUnknown],
  );

  const navState = useSyncExternalStore(
    navigator.subscribe,
    navigator.state,
    navigator.state,
  );
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

  const value = useMemo<ScreenProps>(
    () => ({ ui, c: components, t, state: store, nav, req: request }),
    [components, t, store, nav],
  );

  // Escape closes the top overlay, and the browser back button dismisses it
  // rather than leaving the funnel — the behaviour most often got wrong.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigator.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigator]);

  const Screen = screens[navState.screen];

  return (
    <FunnelContext.Provider value={value}>
      {Screen ? <Screen {...value} /> : null}
      {navState.overlays.map((overlay) => {
        const Frame = screens[overlay.id];
        if (!Frame) return null;
        return (
          <Overlay
            key={overlay.id}
            presentation={overlay.presentation}
            onDismiss={navigator.close}
          >
            <Frame {...value} />
          </Overlay>
        );
      })}
    </FunnelContext.Provider>
  );
}
