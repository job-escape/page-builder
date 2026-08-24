/**
 * Turning a token reference into a colour, once, for every renderer.
 *
 * The artifact carries tokens already resolved per mode (`Manifest.tokens`), so
 * this is a map lookup rather than an alias walk — following `{blue.600}` on the
 * device would be a second implementation of a rule the server already owns, and
 * two implementations of one rule disagree the first time either changes.
 *
 * A missing token is **reported and skipped, never thrown**. The same call the
 * runtime already makes for unknown variable names, for the same reason: a
 * funnel that loses one colour is recoverable, and one that crashes is not.
 */
/**
 * Resolved design tokens, by mode then dotted path.
 *
 * `{ light: { "bg.brand.solid": "#2563eb" }, dark: { … } }`. Resolved at publish
 * rather than followed here — chasing `{blue.600}` aliases on a device would be
 * a second implementation of a rule the server already owns, and the two would
 * disagree the first time either changed.
 *
 * Not in the manifest yet; the type exists so the renderers are written against
 * it from the start rather than retrofitted.
 */
export type ResolvedTokens = Record<string, Record<string, string>>;

import { isTokenRef, type Color, type ColorLiteral } from "./values";

export type TokenLookup = {
  tokens?: ResolvedTokens;
  /** Which mode to read. Falls back to the artifact's default, then to the only mode. */
  mode?: string;
  onMissing?: (path: string) => void;
};

export function resolveColor(color: Color, lookup: TokenLookup = {}): ColorLiteral | null {
  if (!isTokenRef(color)) return color;

  const { tokens, mode, onMissing } = lookup;
  const modes = tokens ? Object.keys(tokens) : [];
  const chosen = mode && tokens?.[mode] ? mode : modes.length === 1 ? modes[0] : undefined;
  const table = chosen ? tokens?.[chosen] : undefined;
  const value = table?.[color.$token];

  if (!value) {
    onMissing?.(color.$token);
    return null;
  }
  return value;
}
