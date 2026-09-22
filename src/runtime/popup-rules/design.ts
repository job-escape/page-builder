import { createContext, useContext, useEffect, useRef } from "react";

import type { FunnelManifest as PublishedManifest } from "../compiler/manifest";
import type { ScreenTree } from "../compiler/tree";
import type { FunnelManifest } from "../funnel-core";
import { loadLocale, type LoadedLocale } from "../locale";
import type { NavigationState } from "../navigation";

import type { PopupRule } from "./types";

/**
 * A popup's design, loaded and turned into what a `<Funnel>` runs.
 *
 * The design is rendered exactly as a published funnel is — its manifest, its
 * screen trees, its interactions — by the platform's own `<Funnel>`
 * (`runtime-client` on the web, `runtime-native` in an app). What makes it a
 * popup is the entry: an invisible host screen that, on opening, shows the
 * rule's target frame as an overlay. The design's own Close step dismisses that
 * overlay like any other, and when nothing is left open the popup is gone.
 *
 * A popup design's frame fills the surface and its fill is the backdrop (see
 * console `docs/DIALOGS.md`), so no host draws a scrim of its own.
 */

/** The major artifact format this build reads — see the funnel host's `TreeFunnel`. */
const SUPPORTED_SCHEMA_MAJOR = 1;

/** A screen id no design can contain: the invisible screen a popup opens over. */
export const POPUP_HOST_SCREEN = "__popup_rules_host__";

type ManifestScreen = {
  id: string;
  tree?: string;
  enter?: unknown[];
  presentation?: unknown;
};

/** The manifest as published — the compiler's index plus the `tree` publish adds. */
export type PopupManifest = Omit<PublishedManifest, "screens"> & {
  schema?: string;
  version?: string;
  screens: ManifestScreen[];
};

export type LoadedPopup = {
  manifest: PopupManifest;
  /** Every screen's tree, not just the target's: a popup can navigate inside itself. */
  trees: Record<string, ScreenTree>;
  copy: LoadedLocale;
};

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

/**
 * The rule's design, from its published manifest. Throws when it cannot be
 * drawn — an unreadable schema, a target the design no longer has — and the
 * host then closes the popup rather than show a broken one.
 */
export async function loadPopupDesign(rule: PopupRule, locale: string): Promise<LoadedPopup> {
  const manifest = await loadJson<PopupManifest>(rule.manifestUrl);
  const major = Number.parseInt(manifest.schema ?? "1.0", 10);
  if (Number.isFinite(major) && major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new Error(`unsupported schema ${manifest.schema}`);
  }
  if (!manifest.screens.some((screen) => screen.id === rule.show.target)) {
    throw new Error(`target ${rule.show.target} is not in the published design`);
  }
  const [trees, copy] = await Promise.all([
    Promise.all(
      manifest.screens
        .filter((screen) => screen.tree)
        .map(async (screen) => [screen.id, await loadJson<ScreenTree>(screen.tree!)] as const),
    ),
    loadLocale(manifest as unknown as PublishedManifest, locale),
  ]);
  return { manifest, trees: Object.fromEntries(trees), copy };
}

/** What a `<Funnel>` runs for this popup: the design, entered through the host screen. */
export function popupFunnelManifest(rule: PopupRule, manifest: PopupManifest): FunnelManifest {
  return {
    entry: POPUP_HOST_SCREEN,
    variables: manifest.variables ?? [],
    overlayDefaults: manifest.overlayDefaults,
    tokens: manifest.tokens,
    themes: manifest.themes,
    defaultMode: manifest.defaultMode,
    defaultVariant: manifest.defaultVariant,
    screens: Object.fromEntries(
      manifest.screens.flatMap((screen) =>
        screen.presentation ? [[screen.id, screen.presentation]] : [],
      ),
    ) as FunnelManifest["screens"],
    enter: {
      ...Object.fromEntries(
        manifest.screens.flatMap((screen) =>
          screen.enter?.length ? [[screen.id, screen.enter as never[]]] : [],
        ),
      ),
      [POPUP_HOST_SCREEN]: [
        {
          type: "show",
          target: rule.show.target,
          as: "overlay",
          ...(rule.show.position ? { position: rule.show.position } : {}),
          ...(rule.show.dim === undefined ? {} : { dim: rule.show.dim }),
        } as never,
      ],
    },
  };
}

/**
 * What the host screen calls once the popup is gone — provided by the host
 * around its `<Funnel>`: `<PopupClosedContext value={onClosed}>`.
 *
 * Context rather than a closure baked into the screen: the screen is a stable
 * component (a new one per render would remount the popup), and the host's
 * callback changes as it renders. Read when the popup closes, so the latest.
 */
export const PopupClosedContext = createContext<() => void>(() => undefined);

/**
 * The invisible screen a popup opens over, for either platform's `<Funnel>`.
 *
 * It watches the navigation it is rendered with: once the target has been
 * shown and nothing is open above the host any more, the visitor has closed
 * the popup, and it calls `PopupClosedContext`. A popup that navigates to a
 * full screen of its own (`replace`) stays open on that screen until it closes.
 * Draws nothing, so it needs no platform — only React.
 */
export function PopupHostScreen({ nav }: { nav: { state(): NavigationState } }): null {
  const state = nav.state();
  const onClosed = useContext(PopupClosedContext);
  const opened = useRef(false);
  useEffect(() => {
    if (state.screen !== POPUP_HOST_SCREEN) return;
    if (state.overlays.length > 0) {
      opened.current = true;
      return;
    }
    if (opened.current) onClosed();
  });
  return null;
}

/**
 * The properties a popup's own Analytics steps are sent with, beside what the
 * step authored — so a popup's rows say which popup they came from, in the
 * fields the funnel web uses for a design (`quiz_version: design-<id>`).
 * The authored properties win, as they do on the funnel web.
 */
export function popupEventProps(
  rule: PopupRule,
  authored: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    quiz_version: `design-${rule.designId}`,
    design_id: String(rule.designId),
    popup_rule_id: rule.id,
    popup_rule_name: rule.name,
    ...authored,
  };
}
