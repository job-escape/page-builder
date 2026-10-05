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
 * **This file is the wiring.** Each thing a funnel does lives in a hook of its
 * own under `runtime/hooks`, and `useFunnelRuntime` calls them in the order
 * they depend on each other:
 *
 * | Hook | What it owns |
 * |---|---|
 * | `useFunnelStore` | the variable table, the store, timers, the clock, the device, what was saved |
 * | `useHostValues` | values the host sets while the funnel runs (`values`) |
 * | `useNavigation` | the navigator, the screen the visitor is on, and `nav` |
 * | `useTrail` | the screens behind this one, kept across a reload |
 * | `usePaymentSession` | the payment session for a screen with a payment form |
 * | `useScreenReport` | telling the host which screen was arrived on |
 * | `useCopy` | the locale lookup, `t` |
 * | `useOpeningSteps` | a screen's steps each time it opens |
 *
 * The types they share are in `funnel-types`, and re-exported here so nothing
 * that imported them from this file has to change.
 *
 * No JSX and no platform imports, so React Native gets it unchanged.
 */
import { useEffect, useMemo, useRef } from "react";

import type { FunnelCoreOptions, FunnelServices } from "./funnel-types";
import { useCopy } from "./hooks/use-copy";
import { useFunnelStore } from "./hooks/use-funnel-store";
import { useHostValues } from "./hooks/use-host-values";
import { useNavigation } from "./hooks/use-navigation";
import { useOpeningSteps } from "./hooks/use-opening-steps";
import { usePaymentSession, type PaymentSessionError } from "./hooks/use-payment-session";
import { useScreenReport } from "./hooks/use-screen-report";
import { useTrail } from "./hooks/use-trail";
import { runWithError } from "./interpret";
import { openLink } from "./link";
import { request } from "./request";
import { playSound } from "./sound";
import { analytics, track } from "./track";

export type {
  CopyLookup,
  FunnelCoreOptions,
  FunnelManifest,
  FunnelNav,
  FunnelServices,
  OnUnknown,
  PersistAs,
  PersistProp,
} from "./funnel-types";
export { persistenceFor } from "./funnel-types";
export { useBeforePaint } from "./hooks/use-before-paint";

export function useFunnelRuntime<Ui, Component>({
  manifest,
  known,
  ui,
  components,
  locale,
  fallbackLocale,
  persist,
  onUnknown,
  onAnswer,
  visitor,
  device,
  timerStorage,
  start,
  onScreen,
  restoreOnMount = true,
  openOnMount = true,
  initialValues,
  values,
}: FunnelCoreOptions<Ui, Component>) {
  // What the funnel knows: its variables, and what keeps them current.
  const { table, store } = useFunnelStore({
    manifest,
    persist,
    visitor,
    device,
    timerStorage,
    onUnknown,
    onAnswer,
    restoreOnMount,
    initialValues,
  });
  useHostValues(values, store, table);

  // Where the visitor is.
  const { navigator, navState, nav } = useNavigation({ manifest, known, start, onUnknown, store });
  useTrail(persist?.funnelId, navigator, navState.screen);

  // What being on that screen sets off.
  // Told through a ref: the steps need the services, which are made below.
  const sessionFailed = useRef<(screen: string, error: PaymentSessionError) => void>(undefined);
  usePaymentSession(manifest.payments, navState.screen, store, table, (screen, error) =>
    sessionFailed.current?.(screen, error),
  );
  useScreenReport(navState.screen, onScreen);

  // What a screen is handed.
  const copy = useCopy(locale, fallbackLocale, onUnknown);
  const services = useMemo<FunnelServices<Ui, Component>>(
    () => ({
      ui,
      c: components,
      t: copy,
      state: store,
      nav,
      req: request,
      track,
      analytics,
      link: openLink,
      sound: playSound,
    }),
    [ui, components, copy, store, nav],
  );

  // What a screen said to do when its payment session would not open.
  sessionFailed.current = (screen, error) => {
    const steps = manifest.paymentErrors?.[screen];
    if (steps?.length) void runWithError(steps, { state: store, nav, req: request }, error);
  };

  // A host that draws on a server runs them from inside the screen instead,
  // once it has hydrated — see `openOnMount`.
  useOpeningSteps(openOnMount ? manifest.enter : undefined, services, navState.screen);

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
