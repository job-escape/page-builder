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
import { z } from "zod";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { Device } from "./device";
import { createNavigator, type NavigationState, type Presentation } from "./navigation";
import { request } from "./request";
import { openLink } from "./link";
import { analytics, track } from "./track";
import type { VariableValue } from "./types";
import { createFunnelStore, type FunnelStore } from "./store";
import type { VariableDecl, VariableTable } from "./types";
import type { ScreenPresentation } from "./compiler/manifest";
import type { SourceAction } from "./compiler/source";
import { run } from "./interpret";
import type { ResolvedTokens } from "./style/tokens";
import { interpolate, type CopyParams, type RichText } from "./rich-text";
import { localizedImage } from "./locale";
import { playFrames } from "./motion";
import { createTimerBook, type TimerStorage } from "./timers";

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
  /**
   * Call `onFrame(progress)` every frame for `ms` — `true` when it ran to the
   * end, `false` the moment the visitor leaves the screen it was asked from.
   * What an `animate` step plays through; owned exactly as `wait` is.
   */
  frames: (ms: number, onFrame: (progress: number) => void) => Promise<boolean>;
  /**
   * A question to ask later: is the visitor still on the screen they are on
   * now? What a request sent without waiting asks before its `onSuccess` runs.
   */
  alive: () => () => boolean;
};

export type FunnelManifest = {
  entry: string;
  /**
   * The published version — what saved answers are keyed by, so a republish
   * starts them clean. From the manifest as published; see `persistenceFor`.
   */
  version?: string;
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
   * Where each screen can lead, by screen id — `ScreenIndex.next`, forwarded by
   * the host. What `prerender` draws ahead of the visitor. Absent means nothing
   * is prerendered, which is every host written before this existed.
   */
  next?: Record<string, string[]>;
  /**
   * Where each screen's tree is published, by screen id — `ScreenIndex.tree`.
   * With it, `<Funnel>` fetches a screen it was not handed when the screen is
   * needed. Absent means every screen comes from the host.
   */
  trees?: Record<string, string>;
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

/** Where a funnel keeps a visitor's answers and facts — see `runtime/persistence`. */
export type PersistAs = { funnelId: string | number; version: string; saved?: string | null };

/**
 * What a host may say about saving: nothing, and the funnel saves on its own;
 * `false`, and it saves nothing (a preview, a popup); or where, explicitly.
 */
export type PersistProp = false | PersistAs;

/**
 * Where to save, from what the host said and the manifest.
 *
 * Absent means save, under the entry screen's id — a UUID no other design
 * shares — and the manifest's published version. A manifest without a version
 * saves nothing: answers kept without one would be restored into whatever the
 * funnel is republished as.
 */
/** What the tab keeps of the way here — see the trail in `useFunnelRuntime`. */
const Trail = z.object({ screen: z.string(), past: z.array(z.string()) });

export function persistenceFor(
  persist: PersistProp | undefined,
  manifest: Pick<FunnelManifest, "entry" | "version">,
): PersistAs | undefined {
  if (persist === false) return undefined;
  if (persist) return persist;
  return manifest.version ? { funnelId: manifest.entry, version: manifest.version } : undefined;
}

/**
 * Locale lookup, and the one lookup that is not words.
 *
 * `image` answers the picture to draw for a source in the active language —
 * see `localizedImage`. Optional, and a property of `t` rather than a service
 * of its own, so a compiled screen's signature is unchanged and a host that
 * hands a screen a plain function still renders every image as drawn.
 */
export type CopyLookup = ((key: string, params?: CopyParams) => RichText) & {
  image?: (src: string) => string;
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
  t: CopyLookup;
  state: FunnelStore;
  nav: FunnelNav;
  /** The one call a compiled screen makes to a backend. A name, never a URL. */
  req: typeof request;
  /** Tells the host's pixels a conversion happened. A key, never a pixel id. */
  track: typeof track;
  /** Sends the host's analytics an event and its properties. Never a key. */
  analytics: typeof analytics;
  /** Opens an Open link step's address — see `runtime/link`. */
  link: typeof openLink;
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
  /** Resolved by `persistenceFor`; absent saves nothing. */
  persist?: PersistAs;
  /**
   * Where timers keep their deadlines — see `runtime/timers`. The web host
   * passes `localStorage`, an app its own storage. Absent, a timer still runs
   * but starts over when the funnel is mounted again.
   */
  timerStorage?: TimerStorage | null;
  onUnknown?: (kind: "variable" | "target" | "key" | "param", name: string) => void;
  /**
   * An answer changed. Handed straight to the store — see `onChange` there for
   * why analytics is the host's job, and why a `sensitive` answer arrives too.
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
  /**
   * Which device the funnel is drawn for — `$device`. See `runtime/device`.
   *
   * Changing it re-renders in place and never rebuilds the store: a window
   * dragged across the breakpoint keeps every answer, every screen's own state
   * and every flow still running. The web decides it from the window; native
   * leaves it absent, which is `mobile`.
   */
  device?: Device;
  /**
   * The screen to open on instead of `manifest.entry` — where a returning
   * visitor was when they left, as the host saved it from `onScreen`.
   *
   * Read once, when the funnel mounts: a later change does not move a visitor
   * who is already somewhere. A screen the funnel does not know — deleted by a
   * republish, from another design — is reported as an unknown `target` and
   * the funnel opens on its entry, which is where it would have opened anyway.
   * The screen's opening steps run, as they do for any screen arrived on. There
   * is no history behind it, so there is nothing to go back to.
   */
  start?: string;
  /**
   * The visitor arrived on another screen — the id to save, so a refresh can
   * open there (`start`). Not called for the screen the funnel opened on, nor
   * for an overlay, which is drawn over a screen rather than being one.
   */
  onScreen?: (screen: string) => void;
  /**
   * Read what was saved as soon as the funnel has mounted (before paint).
   * `false` leaves it to the renderer, which calls `state.restore()` itself —
   * the web does, from inside the screen it draws, because a screen inside
   * `<Activity>` hydrates after the funnel around it has committed, and
   * restoring before then would hydrate it with answers the server never drew.
   */
  restoreOnMount?: boolean;
  /**
   * Values the host already knows when the funnel starts — see `initial` in
   * the store. Read once, when the store is made.
   */
  initialValues?: Readonly<Record<string, VariableValue>>;
};

/**
 * A layout effect where there is a layout, a plain effect on a server.
 *
 * The device has to reach the store before the browser paints, or a desktop
 * visitor sees one frame of the phone layout on every crossing.
 */
export const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
  initialValues,
}: FunnelCoreOptions<Ui, Component>) {
  // Read when a store is made, through a ref: a host writing the object inline
  // must not rebuild the store — and lose every answer — on each render.
  const initialRef = useRef(initialValues);
  initialRef.current = initialValues;
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
  /*
    The device at the moment a store is made, read through a ref so that a
    device change is not a reason to make a new one — see `device` above. A
    store rebuilt for another reason starts on the device the funnel is on now.
  */
  const currentDevice = useRef(device);
  currentDevice.current = device;
  /*
    The timers, made once per funnel identity like the store — and read through a
    ref for the storage, which hosts write as a fresh object on every render.
  */
  const storageRef = useRef(timerStorage);
  storageRef.current = timerStorage;
  const timers = useMemo(
    () => createTimerBook({ storage: storageRef.current ?? null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist?.funnelId],
  );

  const store = useMemo(
    () =>
      createFunnelStore({
        table,
        persist,
        visitor,
        device: currentDevice.current,
        onUnknown: (name) => onUnknown?.("variable", name),
        onChange: onAnswer,
        timers,
        // Read after hydration, below: the first render has to be the one a
        // server made, and a server has no cookie to read.
        deferRestore: true,
        initial: initialRef.current,
      }),
    // A new store per funnel identity, not per render.
    [table, persistKey, visitor, onUnknown, onAnswer, timers],
  );

  /*
    What was saved, read once the first render has been committed and before
    the browser paints it — so hydration matches the server, and a funnel drawn
    only in the browser never shows its defaults at all. Before the opening
    steps and the timers, which run in plain effects and read what it restores.
  */
  useBeforePaint(() => {
    if (restoreOnMount) store.restore();
  }, [store, restoreOnMount]);

  /*
    A running timer redraws what reads it — once per displayed second, never per
    frame. Checked four times a second so a reading turns over within a quarter
    of a second of the real one, and skipped entirely while nothing is running.
    Timers restored from storage start this the moment they are ready.
  */
  useEffect(() => {
    let last = timers.signature();
    const interval = setInterval(() => {
      if (!timers.running() && timers.signature() === last) return;
      const next = timers.signature();
      if (next === last) return;
      last = next;
      store.tick();
    }, 250);
    void timers.ready.then(() => {
      last = timers.signature();
      store.tick();
    });
    return () => clearInterval(interval);
  }, [timers, store]);

  /*
    The clock, for calculated variables that read it: a countdown's seconds are
    `endsAt - now`, which changes with nothing written. Redrawn once a second,
    and only for a funnel that has such a formula.
  */
  const clocked = useMemo(
    () => manifest.variables.some((decl) => decl.formula && JSON.stringify(decl.formula).includes('"now"')),
    [manifest.variables],
  );
  useEffect(() => {
    if (!clocked) return undefined;
    const interval = setInterval(() => store.tick(), 1000);
    return () => clearInterval(interval);
  }, [clocked, store]);

  useBeforePaint(() => {
    store.setDevice(device ?? "mobile");
  }, [store, device]);

  /*
    Where to open, read once: the host's `start` when the funnel knows it, else
    the entry. Through a ref, so a host that later passes something else does
    not move a visitor who is already on their way.
  */
  const startAt = useRef(start);
  const opensOn =
    startAt.current && known.has(startAt.current) ? startAt.current : manifest.entry;

  const navigator = useMemo(
    () =>
      createNavigator({
        entry: opensOn,
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
    [opensOn, manifest.overlayDefaults, known, onUnknown, store],
  );

  const navState = useSyncExternalStore(navigator.subscribe, navigator.state, navigator.state);

  /*
    The screens behind this one, kept for the tab. A reload reopens the screen
    the visitor was on (the host's `start`), but the way they came was only in
    memory — so after a refresh the design's back control had nowhere to go.
    `sessionStorage`, because that is exactly its life: it survives a reload
    and ends with the tab. Read once, and only when the screen opened on is the
    one the trail was left at; written on every arrival. A funnel that saves
    nothing (`persist={false}`) keeps no trail either.
  */
  const trailKey = persist?.funnelId ? `jb_funnel_trail_${persist.funnelId}` : null;
  const trailRead = useRef(false);
  useEffect(() => {
    if (!trailKey) return;
    try {
      if (!trailRead.current) {
        trailRead.current = true;
        const saved = Trail.safeParse(JSON.parse(window.sessionStorage.getItem(trailKey) ?? "null"));
        if (saved.success && saved.data.screen === navState.screen) navigator.restore(saved.data.past);
      }
      window.sessionStorage.setItem(
        trailKey,
        JSON.stringify({ screen: navState.screen, past: navigator.past() }),
      );
    } catch {
      // No storage — a private window, or a platform without one. Back simply
      // has no memory across a reload there, as before.
    }
  }, [trailKey, navigator, navState.screen]);

  // A saved screen this funnel does not have: said once, so the host can see
  // how often a republish strands a returning visitor on the entry.
  useEffect(() => {
    const asked = startAt.current;
    if (asked && !known.has(asked)) onUnknown?.("target", asked);
    // Once, for the screen asked for at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    Each screen arrived on, for the host to save. Not the one opened on — the
    host already knows it, and saying it would be a write on every page load.
    Compared with the last one reported, so a re-render, or an effect run twice
    in development, is not a second arrival.
  */
  const reported = useRef<string | null>(null);
  const onScreenRef = useRef(onScreen);
  onScreenRef.current = onScreen;
  useEffect(() => {
    if (reported.current === null) {
      reported.current = navState.screen;
      return;
    }
    if (reported.current === navState.screen) return;
    reported.current = navState.screen;
    onScreenRef.current?.(navState.screen);
  }, [navState.screen]);
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
  const copy = useMemo<CopyLookup>(
    () =>
      Object.assign((key: string, params?: CopyParams) => t(key, params), {
        image: (src: string) => localizedImage(locale, src),
      }),
    [t, locale],
  );

  /** Register a canceller against the screen the visitor is on now. */
  const ownedByScreen = useCallback(
    (cancel: () => void): { screen: string; release: () => void } => {
      const screen = navigatorRef.current?.state().screen ?? "";
      const cancellers = owned.current.get(screen) ?? [];
      owned.current.set(screen, cancellers);
      cancellers.push(cancel);
      return {
        screen,
        release: () => {
          const at = cancellers.indexOf(cancel);
          if (at >= 0) cancellers.splice(at, 1);
        },
      };
    },
    [],
  );
  const navigatorRef = useRef<typeof navigator | null>(null);
  navigatorRef.current = navigator;

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
      frames: (ms: number, onFrame: (progress: number) => void) => {
        const playing = playFrames(ms, onFrame);
        const { release } = ownedByScreen(playing.stop);
        void playing.done.then(release);
        return playing.done;
      },
      alive: () => {
        let gone = false;
        // Stays registered until the screen goes: a flag costs nothing, and the
        // list is emptied when the screen is left either way.
        ownedByScreen(() => {
          gone = true;
        });
        return () => !gone;
      },
    }),
    [navigator, ownedByScreen],
  );

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
    }),
    [ui, components, copy, store, nav],
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
