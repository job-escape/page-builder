/**
 * What a mounted funnel is given, and what it hands its screens — the types
 * `funnel-core` and its hooks (`runtime/hooks`) share.
 *
 * No JSX and no platform imports, so React Native gets them unchanged.
 */
import type { ScreenPresentation } from "./compiler/manifest";
import type { SourceAction } from "./compiler/source";
import type { Device } from "./device";
import type { openLink } from "./link";
import type { NavigationState, Presentation } from "./navigation";
import type { request } from "./request";
import type { CopyParams, RichText } from "./rich-text";
import type { FunnelStore } from "./store";
import type { ResolvedTokens } from "./style/tokens";
import type { TimerStorage } from "./timers";
import type { playSound } from "./sound";
import type { analytics, track } from "./track";
import type { VariableDecl, VariableValue } from "./types";

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
   * The dialogs each screen can open, by screen id — `ScreenIndex.overlays`,
   * forwarded by the host. Not drawn ahead (a dialog is drawn when it opens),
   * but fetched ahead with its pictures, so one that opens does not arrive
   * empty. Absent means a dialog is fetched when it is opened, as before.
   */
  overlays?: Record<string, string[]>;
  /**
   * Where each screen's tree is published, by screen id — `ScreenIndex.tree`.
   * With it, `<Funnel>` fetches a screen it was not handed when the screen is
   * needed. Absent means every screen comes from the host.
   */
  trees?: Record<string, string>;
  /**
   * The screens that need a payment session, by screen id —
   * `ScreenIndex.payment`. The funnel opens one when the visitor gets to such
   * a screen. Absent means it never does, which is every design without a
   * payment form and every host written before this.
   */
  payments?: Record<string, true>;
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
  /**
   * Words that are not copy — a field's placeholder, an answer's value — in
   * the visitor's language, when they are exactly one of the design's own
   * texts; as they came otherwise. See `useCopy`.
   */
  said?: (words: string) => string;
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
  /** Makes a `sound` step's noise through the host. A name, never a file. */
  sound: typeof playSound;
};

/** Something the runtime was asked for and does not have — reported, never thrown. */
export type OnUnknown = (kind: "variable" | "target" | "key" | "param", name: string) => void;

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
  onUnknown?: OnUnknown;
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
   * Run a screen's opening steps from the funnel's own effect. A host that
   * draws on a server passes `false` and runs them from inside the screen, once
   * it has hydrated — see `Opening` in `client/screen-stack`.
   */
  openOnMount?: boolean;
  /**
   * Values the host already knows when the funnel starts — see `initial` in
   * the store. Read once, when the store is made.
   */
  initialValues?: Readonly<Record<string, VariableValue>>;
  /**
   * Values the host sets while the funnel runs — what it loaded itself, after
   * the page was up. Applied whenever this object changes, so keep it the same
   * object between renders (`useMemo`) until a value really does.
   */
  values?: Readonly<Record<string, VariableValue>>;
};
