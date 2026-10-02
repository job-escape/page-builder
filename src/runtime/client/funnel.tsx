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
import { useCallback, useMemo, type ReactNode } from "react";

import type { Device } from "../device";
import {
  persistenceFor,
  useFunnelRuntime,
  type FunnelManifest,
  type PersistProp,
  type FunnelNav,
  type FunnelServices,
} from "../funnel-core";
import { showPresentation } from "../interpret";
import { TextLinkProvider } from "../link-context";
import { runtimeManifest, type AnyManifest } from "../published-manifest";
import { request } from "../request";
import type { RichText, TextLink } from "../rich-text";
import type { LoadScreen } from "../screen-loader";
import { webTimerStorage, type TimerStorage } from "../timers";
import { ui, type Ui } from "./bricks";
import { FunnelContext } from "./funnel-context";
import { useAppearance } from "./hooks/use-appearance";
import { useDismissOnEscape } from "./hooks/use-dismiss-on-escape";
import { useWindowDevice } from "./hooks/media";
import { useScreenSource, useScreensAhead } from "./hooks/use-screens";
import { ScreenStack } from "./screen-stack";

export type { FunnelManifest, FunnelNav };
export { useFunnel } from "./funnel-context";

/** What a compiled screen module is handed. */
export type ScreenProps = FunnelServices<Ui, (props: never) => ReactNode>;
export type ScreenModule = (props: ScreenProps) => ReactNode;

export type FunnelProps = {
  /**
   * An answer changed — where a host records what a visitor picked.
   *
   * Analytics is the app's, not the artifact's: a compiled funnel is a public
   * file, so event names and destinations do not belong in it. This reports
   * the change and nothing else, so every funnel already published is covered
   * without being republished. A `sensitive` variable arrives too — an email
   * the host keeps for the account — so a host forwarding this to analytics
   * filters there. See `onChange` in the store.
   */
  onAnswer?: (name: string, value: import("../types").VariableValue) => void;
  /**
   * The manifest as published — pass it whole, and the runtime reads what it
   * needs from it (see `runtime/published-manifest`), so a field this package
   * learns to use later needs no change in the host. The shape hosts used to
   * reshape it into is still accepted.
   *
   * Read once per object: pass the same object on every render — the one the
   * host fetched — not a copy made while rendering.
   */
  manifest: AnyManifest;
  /**
   * Screens the host already has. Any other screen the manifest publishes a
   * tree for is fetched from there when it is needed, so a host with the
   * published manifest can pass `{}` — or the entry, fetched on the server,
   * for a first paint that does not wait.
   */
  screens: Record<string, ScreenModule>;
  /**
   * Fetch a screen yourself instead — see `runtime/screen-loader`. For a host
   * whose screens are not at the published addresses: a preview holding
   * trees in memory, a test.
   *
   * Asked for the screen the visitor arrives on, an overlay opened over it,
   * and the screens `prerender` draws ahead. With it, or with published trees,
   * every screen the manifest lists counts as known, so a `show` to one not
   * fetched yet goes there and draws it when it arrives rather than being
   * refused as unknown.
   */
  loadScreen?: LoadScreen<ScreenModule>;
  /**
   * How many of the screens the current one leads to (`manifest.next`) to draw
   * ahead of the visitor, hidden, so that arriving on one reveals a screen
   * already built — its pictures requested, its layout done.
   *
   * Drawn inside React's `<Activity mode="hidden">`, which holds back every
   * effect until the screen is shown: a frame's `load` steps and a slot's own
   * effects run on arrival, exactly when they run without prerendering. What a
   * component does while *rendering* is not held back — see the slots a
   * screen carries before turning this on for it.
   *
   * `0`, the default, draws only the current screen, as before. Needs React
   * 19.2 or later; on an older React only the loading ahead happens.
   */
  prerender?: number;
  /**
   * The screen to open on instead of the entry — where this visitor was when
   * they left, as the host saved it from `onScreen`. Read once, at mount; a
   * screen the funnel does not know is reported as an unknown `target` and
   * the entry is opened instead. See `FunnelCoreOptions.start`.
   */
  startScreen?: string;
  /**
   * The visitor arrived on another screen — its id, for the host to save
   * against the visitor so a refresh can reopen it through `startScreen`.
   * Not called for the screen the funnel opened on, nor for overlays.
   */
  onScreen?: (screen: string) => void;
  /**
   * Values the host already knows when the funnel starts — the visitor's email
   * and account id, kept by the host between visits. Over the declared
   * defaults and never replaced by what the funnel saved; a name the funnel
   * does not declare, or a value its declaration does not accept, is ignored.
   * Read once, when the funnel mounts — the same on the server and in the
   * browser, so hydration matches.
   */
  initialValues?: Readonly<Record<string, import("../types").VariableValue>>;
  /**
   * Values the host sets while the funnel runs — data it loaded itself, such
   * as the plans it sells. Applied whenever this object changes: keep it the
   * same object between renders until a value really does.
   */
  values?: Readonly<Record<string, import("../types").VariableValue>>;
  components?: Record<string, (props: never) => ReactNode>;
  /**
   * The copy table the artifact carries, by key.
   *
   * A value may be a plain string or a list of runs — see `RichText`. Both are
   * accepted forever: an artifact published before emphasis existed carries
   * strings, and a host that has never formatted anything keeps sending them.
   */
  locale?: Record<string, RichText>;
  /**
   * The words to fall back on when `locale` has no answer — the default
   * locale's map. Absent means no fallback, which is what every host did
   * before this existed. See `FunnelCoreOptions.fallbackLocale`.
   */
  fallbackLocale?: Record<string, RichText>;
  /**
   * Where the visitor's answers and facts are saved, so a refresh or a later
   * visit picks up where they were — see `runtime/persistence`.
   *
   * Absent, the funnel saves on its own, under its entry screen's id and the
   * manifest's published version: a republish starts the answers clean.
   * `false` saves nothing — a preview, a popup, anything that must not leave
   * answers behind for the next one. An object names the place explicitly;
   * its `saved` is the cookie as the request carried it, for a host that
   * wants the server to draw the saved answers too (see `PersistenceOptions`).
   */
  persist?: PersistProp;
  /**
   * Where timers keep their deadlines — see `runtime/timers`. Absent, a funnel
   * that persists keeps them in `localStorage` under its id; `null` keeps them
   * nowhere, which is what a preview wants.
   */
  timerStorage?: TimerStorage | null;
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
  /**
   * Something a compiled screen named that the artifact could not answer.
   *
   * `param` joined the list when `t` learned to take them: a placeholder with
   * no value renders as the literal `{name}`, which is a bug somebody reports,
   * and this is how it reaches whoever can fix it before they do.
   *
   * Widening this is why the package took a new beta rather than a patch. A
   * host passing an inline handler is unaffected — the type is inferred from
   * here — but one with an explicitly typed named handler has to widen it too.
   */
  onUnknown?: (kind: "variable" | "target" | "key" | "param", name: string) => void;
  /**
   * What this page knows about the visitor — the answers to
   * `manifest.visitorFacts`, resolved by whoever is serving the funnel.
   *
   * Absent is a funnel that branches on nothing, or a host that has not been
   * taught to answer yet; either way every visitor test fails to match and the
   * branch that catches everybody is the one they get.
   */
  visitor?: Readonly<Record<string, string | number | boolean | null>>;
  /**
   * Draw for this device and never ask the window — `$device`, fixed.
   *
   * For a host whose window is not the visitor's screen: a preview drawing the
   * funnel inside a phone frame on a laptop is `mobile` however wide the laptop
   * is. Absent, the window decides. See `runtime/device`.
   */
  device?: Device;
  /**
   * The server's guess at the device, for the render that happens before there
   * is a window — `deviceFromRequest` over the request's headers.
   *
   * Only the first paint uses it; the window's own answer replaces it as soon
   * as the page hydrates, and follows the window from then on. A host that
   * renders only in the browser can leave it out.
   */
  deviceHint?: Device;
};

export function Funnel({
  manifest: given,
  mode,
  variant,
  screens,
  loadScreen,
  prerender = 0,
  startScreen,
  onScreen,
  initialValues,
  values,
  components = {},
  locale = {},
  fallbackLocale,
  persist,
  timerStorage,
  onUnknown,
  onAnswer,
  visitor,
  device: fixedDevice,
  deviceHint,
}: FunnelProps) {
  const manifest = useMemo(() => runtimeManifest(given), [given]);
  const saveAs = persistenceFor(persist, manifest);
  const { load, known } = useScreenSource({ manifest, screens, loadScreen });
  // Subscribed even when fixed, so the hook order never depends on a prop.
  const windowDevice = useWindowDevice(deviceHint);
  const device = fixedDevice ?? windowDevice;

  const { services, navState, navigator } = useFunnelRuntime<Ui, (props: never) => ReactNode>({
    manifest,
    known,
    ui,
    components,
    locale,
    fallbackLocale,
    persist: saveAs,
    timerStorage:
      timerStorage !== undefined ? timerStorage : saveAs ? webTimerStorage(saveAs.funnelId) : null,
    onUnknown,
    onAnswer,
    visitor,
    device,
    start: startScreen,
    onScreen,
    initialValues,
    values,
    // From inside the screen, once it has hydrated — see `ScreenStack`.
    restoreOnMount: false,
  });
  useDismissOnEscape(navigator);

  const { ahead, loaded } = useScreensAhead({ manifest, navState, prerender, screens, load });
  const paletteStyle = useAppearance({
    manifest,
    state: services.state,
    mode,
    variant,
    funnelId: saveAs?.funnelId,
  });

  // `request` is re-exported through the services by the core; naming it here
  // keeps the import graph honest for anything reading this file alone.
  void request;

  /**
   * Following a link inside a line of copy.
   *
   * The same call a `show` action makes, through the same presentation mapping
   * — see `showPresentation`. A link and a button pointing at one screen have
   * to arrive the same way, or a privacy notice opens as a sheet from the
   * button and full-screen from the sentence above it.
   */
  const follow = useCallback(
    (link: TextLink) => {
      // An address rather than a screen: opened as the Open link step opens
      // one, its `{name}`s read from the funnel's own values.
      if (link.url) {
        services.link(link.url, "tab", (name) => services.state.get(name));
        return;
      }
      navigator.show(link.target, showPresentation(link));
    },
    [navigator, services],
  );

  const body = (
    <FunnelContext.Provider value={services}>
      <TextLinkProvider value={follow}>
        <ScreenStack
          navState={navState}
          loaded={loaded}
          ahead={ahead}
          prerender={prerender}
          presentations={manifest.screens}
          services={services}
          onDismiss={navigator.close}
        />
      </TextLinkProvider>
    </FunnelContext.Provider>
  );

  /*
    The palette above the screens, as custom properties. `display: contents`
    because this element exists only to hold them: it must not become a box, or
    every funnel gains a wrapper that changes its layout. Nothing at all when
    the artifact carries no palette, so a funnel published before this renders
    through exactly the tree it rendered through before.
  */
  return Object.keys(paletteStyle).length > 0 ? (
    <div style={{ display: "contents", ...paletteStyle }}>{body}</div>
  ) : (
    body
  );
}
