/**
 * How the funnel looks for this visitor — which brand, which colour mode — and
 * the palette that follows, as custom properties for the screens below.
 */
import { useEffect, useMemo, type CSSProperties } from "react";

import { resolveMode } from "../../appearance";
import { useBeforePaint, type FunnelManifest, type FunnelServices } from "../../funnel-core";
import { configureRequests } from "../../request";
import { tokenCustomProperties } from "../../style/emit-css";
import { paletteFromVariables, tokensForVariant } from "../../style/tokens";
import { chooseVariant, readVariant, writeVariant } from "../../variant";
import { useSystemMode } from "./media";

/**
 * The palette to spread above the screens — empty when the artifact carries
 * none, so a funnel published before palettes renders exactly as it did.
 *
 * A design's props are still CSS — `background: var(--bg-brand-solid)` — so the
 * browser needs these defined above them.
 */
export function useAppearance({
  manifest,
  state,
  mode,
  variant,
  funnelId,
}: {
  manifest: FunnelManifest;
  state: FunnelServices<unknown, unknown>["state"];
  /** The host's colour mode, which wins over everything else. */
  mode?: string;
  /** The host's brand request — a `?v=` for QA, or an assignment it made. */
  variant?: string | null;
  /** Where the brand assignment is held; absent, it is not held. */
  funnelId?: string | number;
}): CSSProperties {
  /*
    What the funnel's own variables ask of the palette. Read from the store's
    snapshot, whose identity changes on every write, so a Set step that flips
    `theme` repaints on the render it causes.
  */
  const values = state.snapshot();
  const fromVariables = useMemo(
    () => paletteFromVariables(manifest.variables, values),
    [manifest.variables, values],
  );

  /**
   * The brand this visitor sees, decided once and then held.
   *
   * Held in its own cookie rather than in the answers, because the answers are
   * discarded whenever `Manifest.version` changes: republishing a headline
   * would otherwise reassign everybody mid-funnel and poison any comparison
   * between the brands.
   */
  const activeVariant = useMemo(() => {
    const themes = manifest.themes;
    if (!themes) return undefined;
    // A `?v=` a person typed beats the design; the design beats an assignment
    // made before it said anything.
    const asked = variant ?? (fromVariables.brand && themes[fromVariables.brand] ? fromVariables.brand : null);
    return chooseVariant({
      available: Object.keys(themes),
      requested: asked,
      stored: funnelId == null ? null : readVariant(funnelId),
      fallback: manifest.defaultVariant,
    });
  }, [manifest.themes, manifest.defaultVariant, variant, funnelId, fromVariables.brand]);

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
    // The funnel's own `palette: "mode"` variable sits between the two: a host
    // that forces a mode still wins, and a visitor who picked one beats the OS.
    const designed = fromVariables.mode && table?.[fromVariables.mode] ? fromVariables.mode : undefined;
    const preferred = mode ?? designed ?? (systemMode && table?.[systemMode] ? systemMode : undefined);
    return tokenCustomProperties(table, preferred, manifest.defaultMode);
  }, [manifest.tokens, manifest.themes, manifest.defaultMode, activeVariant, mode, systemMode, fromVariables.mode]);

  /*
    `$mode` and `$variant` for conditions — a picture that differs in dark is a
    condition on these, since the palette can only switch colours. Before paint,
    as `$device` is, so the first frame already shows the right branch.
  */
  const appearanceMode = resolveMode({
    host: mode,
    designed: fromVariables.mode,
    system: systemMode,
    fallback: manifest.defaultMode,
  });
  const appearanceVariant = activeVariant ?? null;
  useBeforePaint(() => {
    state.setAppearance({ mode: appearanceMode, variant: appearanceVariant });
  }, [state, appearanceMode, appearanceVariant]);

  return paletteStyle;
}
