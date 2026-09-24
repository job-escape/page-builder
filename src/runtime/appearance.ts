/**
 * Which colour mode and which brand a funnel is painted in — `$mode` and
 * `$variant`, as a condition reads them.
 *
 * The palette already switches every colour on its own; what it cannot switch
 * is anything that is not a colour. A screenshot drawn on white does not become
 * one drawn on black because the variables under it did. So a design shows one
 * picture in light and another in dark the way it shows one layout on a phone
 * and another on a desktop: a condition, on a value the runtime answers.
 *
 * **The runtime owns them, exactly as it owns `$device`.** Neither is a declared
 * variable — a declared one is persisted, and a mode restored from a cookie is
 * the mode the phone *used to* be in. The funnel's own `palette: "mode"`
 * variable still decides the mode when it is set; `$mode` is the answer after
 * every source has had its say, which is the only thing worth branching on.
 *
 * **`$mode` is the mode asked for, not only the modes the palette carries.**
 * Resolved in the order the palette is painted: the host's choice, then the
 * funnel's own variable, then the visitor's system setting, then the artifact's
 * default. A palette whose one mode is called "Mode 1" still paints that one
 * mode on a phone set to dark — and the picture on top should still be the dark
 * one, so the phone's "dark" is what a condition sees.
 *
 * No React and no DOM, so a server and native import it alike.
 */

/** The names conditions read. Reserved: never declared variables. */
export const MODE_VARIABLE = "$mode";
export const VARIANT_VARIABLE = "$variant";

export type Appearance = { mode: string | null; variant: string | null };

export const NO_APPEARANCE: Appearance = { mode: null, variant: null };

/** Whether `name` is one of the two, so the store can answer before its table. */
export const isAppearanceVariable = (name: string): boolean =>
  name === MODE_VARIABLE || name === VARIANT_VARIABLE;

/**
 * The mode a funnel is in, from everything that could decide it.
 *
 * The same order the palette falls through — see `tokenCustomProperties` and
 * the native `configureTokens` call — so a condition never branches on a mode
 * other than the one the colours were chosen by.
 */
export function resolveMode(sources: {
  host?: string | null;
  designed?: string | null;
  system?: string | null;
  fallback?: string | null;
}): string | null {
  return sources.host || sources.designed || sources.system || sources.fallback || null;
}
