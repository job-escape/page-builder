// scale-senior-styles.ts
//
// Senior-mode style scaling. When an authored element opts into senior mode
// (via a `senior` attribute), its typography and spacing are scaled up so the
// page is easier to read for an older audience — without re-authoring the page.
//
// Only a curated allowlist of properties is scaled, and only length values with
// absolute/relative units (px, rem, em, pt, ch). Unitless values (e.g. a
// `line-height` ratio) and complex expressions (calc/clamp/min/max/var) are left
// untouched, since the former already grow with the font-size and the latter are
// unsafe to scale token-by-token.

export const SENIOR_DEFAULT_FACTOR = 1.7;

// camelCase keys, matching the output of the style-string parser in use-styled-node.
const SCALED_PROPERTIES = new Set<string>([
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "paddingInline",
  "paddingBlock",
  "paddingInlineStart",
  "paddingInlineEnd",
  "paddingBlockStart",
  "paddingBlockEnd",
  "gap",
  "rowGap",
  "columnGap",
]);

const LENGTH_TOKEN = /^(-?\d*\.?\d+)(px|rem|em|pt|ch)$/;
const COMPLEX_EXPRESSION = /(?:calc|clamp|min|max|var)\(/;

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Scale every length token in a CSS value by `factor`. Handles shorthand values
 * with multiple tokens (e.g. "8px 16px"). Tokens without a scalable unit, and
 * values containing calc/clamp/min/max/var, are returned unchanged.
 */
export function scaleCssValue(value: string, factor: number): string {
  if (COMPLEX_EXPRESSION.test(value)) return value;

  return value
    .trim()
    .split(/\s+/)
    .map((token) => {
      const match = token.match(LENGTH_TOKEN);
      if (!match) return token;
      return `${round(parseFloat(match[1]) * factor)}${match[2]}`;
    })
    .join(" ");
}

/**
 * Return a copy of a parsed style map with senior-scaled values for the
 * allowlisted typography/spacing properties. Other properties pass through.
 */
export function scaleSeniorStyles(
  styles: Record<string, string>,
  factor: number,
): Record<string, string> {
  if (!factor || factor === 1) return styles;

  const result: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    result[prop] = SCALED_PROPERTIES.has(prop) ? scaleCssValue(value, factor) : value;
  }
  return result;
}

// Same allowlist as SCALED_PROPERTIES, but in kebab-case for raw inline-style
// strings (e.g. text spans authored by the rich-text editor).
const SCALED_PROPERTIES_KEBAB = new Set<string>([
  "font-size",
  "line-height",
  "letter-spacing",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-inline",
  "padding-block",
  "padding-inline-start",
  "padding-inline-end",
  "padding-block-start",
  "padding-block-end",
  "gap",
  "row-gap",
  "column-gap",
]);

/**
 * Scale the allowlisted properties inside a raw inline-style string
 * (`"font-size: 20px; color: #000"`). Used for plain elements (text spans,
 * paragraphs) whose styling never passes through the camelCase style maps.
 */
export function scaleSeniorStyleString(styleStr: string, factor: number): string {
  if (!styleStr || !factor || factor === 1) return styleStr;

  return styleStr
    .split(";")
    .map((decl) => {
      const idx = decl.indexOf(":");
      if (idx === -1) return "";
      const prop = decl.slice(0, idx).trim();
      const value = decl.slice(idx + 1).trim();
      if (!prop || !value) return "";
      const next = SCALED_PROPERTIES_KEBAB.has(prop.toLowerCase())
        ? scaleCssValue(value, factor)
        : value;
      return `${prop}: ${next}`;
    })
    .filter(Boolean)
    .join("; ");
}

/**
 * Resolve the senior scale factor from an element's attributes.
 *
 * Senior mode is the DEFAULT — content is scaled unless it explicitly opts out.
 * - `senior="false"` → `null` (senior mode off — the only opt-out)
 * - `senior="1.4"` → that numeric factor
 * - absent / `senior` / `senior="true"` / anything else → default factor
 */
export function resolveSeniorFactor(attribs: Record<string, string> | undefined): number | null {
  const raw = attribs?.senior;
  if (raw === "false") return null;
  if (raw == null || raw === "" || raw === "true") return SENIOR_DEFAULT_FACTOR;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SENIOR_DEFAULT_FACTOR;
}
