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
import type { VariableValue } from "./types";
import { createFunnelStore, type FunnelStore } from "./store";
import type { VariableDecl, VariableTable } from "./types";
import type { ScreenPresentation } from "./compiler/manifest";
import type { SourceAction } from "./compiler/source";
import { run } from "./interpret";
import type { ResolvedTokens } from "./style/tokens";
import { interpolate, type CopyParams, type RichText } from "./rich-text";

export type FunnelNav = {
  show: (target: string, presentation?: Presentation) => void;
  close: () => void;
  back: () => boolean;
  canGoBack: () => boolean;
  state: () => NavigationState;
  /**
   * Resolves after `seconds` — `true` if the visitor is still on the screen it
   * was asked from, `false` the moment they leave it, and then whatever was
   * waiting does not go on. The whole meaning of a `wait` step.
   */
  wait: (seconds: number) => Promise<boolean>;
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
  /**
   * What each screen runs when it opens, by screen id — `ScreenIndex.enter`,
   * forwarded by the host. Absent means nothing runs on opening anywhere, which
   * is every funnel published before screens could.
   */
  enter?: Record<string, SourceAction[]>;
  /**
   * The design's palette, aliases already followed, by mode then dotted path.
   *
   * Resolved by publish rather than here: chasing `{blue.600}` on a device
   * would be a second implementation of a rule the server already owns, and
   * React Native has no cascade to chase it with. Web spreads this as custom
   * properties so its CSS props resolve; native reads the same table through
   * `resolveColor`. Optional, because a project without a palette publishes
   * without one.
   */
  tokens?: ResolvedTokens;
  /** Which of those modes to paint when the host names none. */
  defaultMode?: string;
  /**
   * The same design in other brands, by variant key then mode then path.
   *
   * Additive beside `tokens`, never instead of it: a renderer shipped before
   * variants existed reads only `tokens`, which publish fills with the default
   * variant's table — so it draws the funnel as assigned rather than in colours
   * no visitor was given.
   */
  themes?: Record<string, ResolvedTokens>;
  /** Which brand to show when nothing else decides. */
  defaultVariant?: string;
};

export type FunnelServices<Ui, Component> = {
  ui: Ui;
  /** Design components — compositions the designer saved. */
  c: Record<string, Component>;
  /**
   * Locale lookup. Every user-visible string is a key.
   *
   * Answers `RichText`, which is a `string` for every key that carries no
   * emphasis — so a screen module that does nothing but hand this to
   * `ui.Text` is unchanged, and so is every artifact that has ever been
   * published. See `runtime/rich-text`.
   */
  t: (key: string, params?: CopyParams) => RichText;
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
  locale: Record<string, RichText>;
  /**
   * The words to use when the active locale has no answer.
   *
   * The default locale's map — the one a manifest always carries inline, so
   * reaching for it costs no fetch and cannot itself be missing.
   *
   * Without this a key absent from `locale` rendered as an empty string, and a
   * blank headline reads to a customer as a broken page. An untranslated line
   * in the default language reads as an untranslated line, which is the lesser
   * wrong and the one `funnel-as-code.md` §9.7 asks for.
   *
   * Optional, and absent means the old behaviour exactly: a host that has only
   * ever had one map keeps passing one.
   *
   * Note what is NOT here. Resolving `es-MX` to `es` happens when the host
   * decides *which bundle to load*, not on every lookup — one decision per
   * visit rather than one per string, and the only place that knows what the
   * artifact actually ships.
   */
  fallbackLocale?: Record<string, RichText>;
  persist?: { funnelId: string | number; version: string };
  onUnknown?: (kind: "variable" | "target" | "key" | "param", name: string) => void;
  /**
   * An answer changed. Handed straight to the store — see `onChange` there for
   * why analytics is the host's job and why a `sensitive` answer never arrives.
   */
  onAnswer?: (name: string, value: VariableValue) => void;
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
  fallbackLocale,
  persist,
  onUnknown,
  onAnswer,
  visitor,
}: FunnelCoreOptions<Ui, Component>) {
  const table: VariableTable = useMemo(
    () => Object.fromEntries(manifest.variables.map((decl) => [decl.name, decl])),
    [manifest.variables],
  );

  /** Cancellers registered by whatever a screen started — see `onLeaveScreen`. */
  const owned = useRef(new Map<string, Array<() => void>>());

  /*
    `persist` by value, never by identity. Hosts write it as a literal —
    `persist={{ funnelId, version }}` — which is a new object every render, and
    a store keyed on the object was rebuilt each time. Answers survived that,
    being read back out of the cookie, but everything the store does not keep
    did not: a screen's own state went, and a flow still running — an opening
    step waiting two seconds — finished into a store nobody was drawing from.
  */
  const persistKey = persist ? `${persist.funnelId} ${persist.version}` : null;
  const store = useMemo(
    () =>
      createFunnelStore({
        table,
        persist,
        visitor,
        onUnknown: (name) => onUnknown?.("variable", name),
        onChange: onAnswer,
      }),
    // A new store per funnel identity, not per render.
    [table, persistKey, visitor, onUnknown, onAnswer],
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
          // And what it set about itself — a button left on Loading, an error
          // left up — goes back to how it was designed for the next visit.
          store.forgetScreen(screen);
        },
      }),
    [manifest.entry, manifest.overlayDefaults, known, onUnknown, store],
  );

  const navState = useSyncExternalStore(navigator.subscribe, navigator.state, navigator.state);
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);

  const t = useCallback(
    (key: string, params?: CopyParams) => {
      /**
       * Filled only when a caller passed parameters.
       *
       * Copy that has never been interpolated is never scanned, so a headline
       * that genuinely contains `{braces}` reads exactly as it always has —
       * which is what makes this safe to add to a runtime that already serves
       * published artifacts.
       */
      const fill = (value: RichText): RichText =>
        params ? interpolate(value, params, (name) => onUnknown?.("param", name)) : value;

      const value = locale[key];
      if (value !== undefined) return fill(value);
      /**
       * Reported before the fallback is tried, not instead of it.
       *
       * A key the active locale cannot answer is the fact worth logging
       * whether or not something else could — a locale that has quietly
       * rotted still renders, and silence is how it stays rotten. The
       * customer sees words either way; the operator sees the gap.
       */
      onUnknown?.("key", key);
      const fallback = fallbackLocale?.[key];
      if (fallback !== undefined) return fill(fallback);
      // Never show a raw key to a customer; an empty string is less wrong.
      return "";
    },
    [locale, fallbackLocale, onUnknown],
  );

  const nav: FunnelNav = useMemo(
    () => ({
      show: navigator.show,
      close: navigator.close,
      back: navigator.back,
      canGoBack: navigator.canGoBack,
      state: navigator.state,
      /*
        Owned by the screen underneath at the moment of asking — an overlay's
        wait included, since closing an overlay leaves the visitor where they
        were. Leaving that screen runs every canceller it owns (see
        `onLeaveScreen`), which answers this one `false`.
      */
      wait: (seconds: number) =>
        new Promise<boolean>((resolve) => {
          const screen = navigator.state().screen;
          const cancellers = owned.current.get(screen) ?? [];
          owned.current.set(screen, cancellers);
          const pending: { timer?: ReturnType<typeof setTimeout> } = {};
          const stop = (): void => {
            clearTimeout(pending.timer);
            resolve(false);
          };
          cancellers.push(stop);
          pending.timer = setTimeout(
            () => {
              const at = cancellers.indexOf(stop);
              if (at >= 0) cancellers.splice(at, 1);
              resolve(true);
            },
            Math.max(0, seconds) * 1000,
          );
        }),
    }),
    [navigator],
  );

  const services = useMemo<FunnelServices<Ui, Component>>(
    () => ({ ui, c: components, t, state: store, nav, req: request }),
    [ui, components, t, store, nav],
  );

  /*
    A screen's opening steps, each time it opens — the entry on the first
    render, then every screen navigated to, going back included. Keyed on the
    screen id alone, with the rest read through a ref, so a new store or a new
    manifest object does not re-open the screen the visitor is already on.
  */
  const opening = useRef({ enter: manifest.enter, services });
  useEffect(() => {
    opening.current = { enter: manifest.enter, services };
  });
  useEffect(() => {
    const { enter, services: current } = opening.current;
    const actions = enter?.[navState.screen];
    if (actions?.length) {
      void run(actions, { state: current.state, nav: current.nav, req: current.req });
    }
  }, [navState.screen]);

  // Unmounted: nothing a screen started may go on writing to a funnel that is gone.
  useEffect(() => {
    const byScreen = owned.current;
    return () => {
      byScreen.forEach((cancellers) => cancellers.forEach((cancel) => cancel()));
      byScreen.clear();
    };
  }, []);

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
