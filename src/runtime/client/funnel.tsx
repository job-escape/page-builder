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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  useDismissOnBack,
  useFunnelRuntime,
  type FunnelManifest,
  type FunnelNav,
  type FunnelServices,
} from "../funnel-core";
import { configureRequests, request } from "../request";
import { tokenCustomProperties } from "../style/emit-css";
import { tokensForVariant } from "../style/tokens";
import { chooseVariant, readVariant, writeVariant } from "../variant";
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
  /**
   * Which of the artifact's token modes to paint. Defaults to the manifest's
   * own `defaultMode`, then to the visitor's system preference when the
   * artifact declares a mode by that name, then to its only mode.
   */
  mode?: string;
  /**
   * Which brand to show — a `?v=` for QA, or the assignment the host made.
   *
   * Only a *request*: what the visitor already has wins over the artifact's
   * default but not over this, and a name the artifact does not carry falls
   * through rather than painting nothing. See `runtime/variant`.
   */
  variant?: string | null;
  onUnknown?: (kind: "variable" | "target" | "key", name: string) => void;
  /**
   * What this page knows about the visitor — the answers to
   * `manifest.visitorFacts`, resolved by whoever is serving the funnel.
   *
   * Absent is a funnel that branches on nothing, or a host that has not been
   * taught to answer yet; either way every visitor test fails to match and the
   * branch that catches everybody is the one they get.
   */
  visitor?: Readonly<Record<string, string | number | boolean | null>>;
};

const FunnelContext = createContext<ScreenProps | null>(null);

/**
 * Whether this visitor's system is set to dark, as a value React can subscribe
 * to. `null` on a server render and anywhere `matchMedia` is missing, which is
 * the honest answer rather than a guess at light.
 */
function useSystemMode(): "dark" | "light" | null {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => {
      if (typeof window === "undefined" || !window.matchMedia) return null;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    () => null,
  );
}

/** For design components and nested pieces that need the same services. */
export function useFunnel(): ScreenProps {
  const value = useContext(FunnelContext);
  if (!value) throw new Error("useFunnel must be used inside <Funnel>");
  return value;
}

export function Funnel({
  manifest,
  mode,
  variant,
  screens,
  components = {},
  locale = {},
  persist,
  onUnknown,
  visitor,
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
    visitor,
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

  /**
   * The palette, as custom properties the screens below can resolve.
   *
   * A design's props are still CSS — `background: var(--bg-brand-solid)` — so
   * the browser needs these defined above them. `display: contents` because
   * this element exists only to hold them: it must not become a box, or every
   * funnel gains a wrapper that changes its layout.
   *
   * Nothing at all when the artifact carries no palette, so a funnel published
   * before this renders through exactly the tree it rendered through before.
   */
  /**
   * The brand this visitor sees, decided once and then held.
   *
   * Held in its own cookie rather than in the answers, because the answers are
   * discarded whenever `Manifest.version` changes: republishing a headline
   * would otherwise reassign everybody mid-funnel and poison any comparison
   * between the brands.
   */
  const funnelId = persist?.funnelId;
  const activeVariant = useMemo(() => {
    const themes = manifest.themes;
    if (!themes) return undefined;
    return chooseVariant({
      available: Object.keys(themes),
      requested: variant,
      stored: funnelId == null ? null : readVariant(funnelId),
      fallback: manifest.defaultVariant,
    });
  }, [manifest.themes, manifest.defaultVariant, variant, funnelId]);

  useEffect(() => {
    // Written after the choice rather than as part of it: an assignment is a
    // side effect, and making it during render would write a cookie every time
    // React re-rendered a screen.
    if (funnelId != null && activeVariant) writeVariant(funnelId, activeVariant);
  }, [funnelId, activeVariant]);

  useEffect(() => {
    /**
     * The assignment travels with every backend call, and therefore with every
     * event derived from one.
     *
     * Done here rather than left to the host, because "which brand was this
     * visitor shown" is the one question a comparison between two brands cannot
     * be answered without — and a host that forgets to stamp it produces data
     * that looks complete and means nothing.
     */
    if (activeVariant) configureRequests({ context: { variant: activeVariant } });
  }, [activeVariant]);

  const systemMode = useSystemMode();
  const paletteStyle = useMemo(() => {
    const table = tokensForVariant(manifest.tokens, manifest.themes, activeVariant);
    // The host's choice, then the artifact's default, then the visitor's own
    // system preference — and only when the artifact actually declares a mode
    // by that name, because most modes are called things like "Mode 1".
    const preferred = mode ?? (systemMode && table?.[systemMode] ? systemMode : undefined);
    return tokenCustomProperties(table, preferred, manifest.defaultMode);
  }, [manifest.tokens, manifest.themes, manifest.defaultMode, activeVariant, mode, systemMode]);
  const hasPalette = Object.keys(paletteStyle).length > 0;

  // `request` is re-exported through the services by the core; naming it here
  // keeps the import graph honest for anything reading this file alone.
  void request;

  const body = (
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

  return hasPalette ? (
    <div style={{ display: "contents", ...paletteStyle }}>{body}</div>
  ) : (
    body
  );
}
