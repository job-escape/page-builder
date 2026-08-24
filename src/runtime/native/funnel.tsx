"use client";

/**
 * Mount a compiled funnel on a phone.
 *
 * Deliberately thin. The store, the navigator, the locale lookup and the
 * services a screen is handed all come from `useFunnelRuntime`, which the web
 * `Funnel` uses too — so the two platforms cannot disagree about what a funnel
 * *is*, only about how it is drawn.
 *
 * What differs is exactly four things: the brick catalogue, the screen host, the
 * overlay, and the fact that "back" here is a hardware button rather than the
 * Escape key. Both land on `navigator.close()`, which dismisses the top overlay
 * before it navigates — so the behaviour most often got wrong on mobile is
 * implemented once, in shared code.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { BackHandler } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  useDismissOnBack,
  useFunnelRuntime,
  type FunnelManifest,
  type FunnelServices,
} from "../funnel-core";
import { ui } from "./bricks";
import { Overlay } from "./overlay";
import { DEFAULT_PRESENTATION, ScreenHost } from "./screen-host";
import type { HostConfig } from "./host-config";

type Ui = typeof ui;
type Component = (props: never) => ReactNode;
export type NativeScreenProps = FunnelServices<Ui, Component>;
export type NativeScreenModule = (props: NativeScreenProps) => ReactNode;

const FunnelContext = createContext<NativeScreenProps | null>(null);

/** For design components and nested pieces that need the same services. */
export function useFunnel(): NativeScreenProps {
  const value = useContext(FunnelContext);
  if (!value) throw new Error("useFunnel must be used inside <Funnel>");
  return value;
}

export type NativeFunnelProps = {
  manifest: FunnelManifest;
  screens: Record<string, NativeScreenModule>;
  components?: Record<string, Component>;
  locale?: Record<string, string>;
  /** Absent disables persistence — preview must not leave answers behind. */
  persist?: { funnelId: string | number; version: string };
  /** Platform mechanics. App-wide, never per design. */
  host?: Partial<HostConfig>;
  onUnknown?: (kind: "variable" | "target" | "key", name: string) => void;
};

export function Funnel({
  manifest,
  screens,
  components = {},
  locale = {},
  persist,
  host,
  onUnknown,
}: NativeFunnelProps) {
  const known = useMemo(() => new Set(Object.keys(screens)), [screens]);
  const { services, navState, navigator } = useFunnelRuntime<Ui, Component>({
    manifest,
    known,
    ui,
    components,
    locale,
    persist,
    onUnknown,
  });

  const onBack = useCallback((dismiss: () => void) => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      // Handled here: letting it through would leave the funnel entirely, which
      // is what a visitor closing a sheet never means.
      return true;
    });
    return () => subscription.remove();
  }, []);
  useDismissOnBack(onBack, navigator);

  const Screen = screens[navState.screen];
  const presentation = manifest.screens?.[navState.screen] ?? DEFAULT_PRESENTATION;

  return (
    // Provided here rather than expected from the app: a funnel that renders
    // without insets because someone forgot a provider is a funnel with its
    // first line of text under the notch.
    <SafeAreaProvider>
      <FunnelContext.Provider value={services}>
        <ScreenHost presentation={presentation} host={host}>
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
    </SafeAreaProvider>
  );
}
