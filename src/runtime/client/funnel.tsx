/**
 * Mount a compiled funnel in a browser.
 *
 * Screen modules are plain functions of `{ ui, c, t, state, nav, req }` — exactly
 * what the compiler emits and exactly what `screenFromTree` produces — so a
 * hand-written module, a compiled one and a tree are interchangeable here.
 *
 * The state machine is not in this file. The store, the navigator, the locale
 * lookup and the services a screen receives all come from `useFunnelRuntime`,
 * which the native `Funnel` uses too. What is left here is the four things a
 * browser does differently: its brick catalogue, its screen host, its overlay,
 * and the fact that "back" is the Escape key rather than a hardware button.
 *
 * Re-rendering goes through `useSyncExternalStore` inside the core. No Effector,
 * no context gymnastics: an option re-renders because the value it compares
 * itself against changed.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import {
  useDismissOnBack,
  useFunnelRuntime,
  type FunnelManifest,
  type FunnelNav,
  type FunnelServices,
} from "../funnel-core";
import { request } from "../request";
import { ui, type Ui } from "./bricks";
import { Overlay } from "./overlay";
import { DEFAULT_PRESENTATION, ScreenHost } from "./screen-host";

export type { FunnelManifest, FunnelNav };

/** What a compiled screen module is handed. */
export type ScreenProps = FunnelServices<Ui, (props: never) => ReactNode>;
export type ScreenModule = (props: ScreenProps) => ReactNode;

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
  const known = useMemo(() => new Set(Object.keys(screens)), [screens]);
  const { services, navState, navigator } = useFunnelRuntime<Ui, (props: never) => ReactNode>({
    manifest,
    known,
    ui,
    components,
    locale,
    persist,
    onUnknown,
  });

  // Escape closes the top overlay rather than leaving the funnel — the same
  // `navigator.close()` the hardware back button reaches on a phone.
  const onEscape = useCallback((dismiss: () => void) => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useDismissOnBack(onEscape, navigator);

  const Screen = screens[navState.screen];
  const presentation = manifest.screens?.[navState.screen] ?? DEFAULT_PRESENTATION;

  // `request` is re-exported through the services by the core; naming it here
  // keeps the import graph honest for anything reading this file alone.
  void request;

  return (
    <FunnelContext.Provider value={services}>
      {/* The screen's own surface. Overlays get their own, from `Overlay`. */}
      <ScreenHost presentation={presentation}>
        {Screen ? <Screen {...services} /> : null}
      </ScreenHost>
      {navState.overlays.map((overlay) => {
        const Frame = screens[overlay.id];
        if (!Frame) return null;
        return (
          <Overlay
            key={overlay.id}
            presentation={overlay.presentation}
            onDismiss={navigator.close}
          >
            <Frame {...services} />
          </Overlay>
        );
      })}
    </FunnelContext.Provider>
  );
}
