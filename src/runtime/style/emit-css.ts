/**
 * Contract values as CSS — the web renderer's half of the translation.
 *
 * The output is deliberately identical to what the canvas writes today, strokes
 * included: a stroke still leaves here as a spread ring, because a ring is still
 * the right way to draw one in a browser. What changed is where the decision
 * lives. It used to be the storage format, so every other platform inherited it;
 * now it is one renderer's opinion, and `emit-native` is free to hold a
 * different one.
 *
 * That equivalence is testable, and it is the migration's safety net: adapt a
 * frame's props into contract values, emit them back as CSS, and the string
 * should be what you started with. Web cannot regress from a change it cannot
 * observe.
 */
import type { Fill, Padding, Radius, Shadow, Size, Stroke, Color, LineHeight, Px } from "./values";
import { chooseMode, resolveColor, type ResolvedTokens, type TokenLookup } from "./tokens";

export type CssDeclarations = Record<string, string | number>;

/**
 * A colour as CSS. A token could stay `var(--…)` here and let the cascade do it,
 * but resolving both platforms the same way is what makes the conformance
 * fixtures comparable — and it removes the only step web could get right by
 * accident.
 */
export function cssColor(color: Color, lookup: TokenLookup = {}): string | undefined {
  return resolveColor(color, lookup) ?? undefined;
}

export function cssFill(fill: Fill, lookup: TokenLookup = {}): string | undefined {
  if (fill.kind === "solid") return cssColor(fill.color, lookup);

  const stops = fill.stops
    .map((stop) => {
      const color = cssColor(stop.color, lookup);
      return color ? `${color} ${Math.round(stop.at * 100)}%` : null;
    })
    .filter((stop): stop is string => stop !== null);

  if (stops.length < 2) return undefined;
  return `linear-gradient(${fill.angle}deg, ${stops.join(", ")})`;
}

/**
 * The spread ring, in the three alignments — the inverse of `shadowsFromCss`.
 *
 * Centre is drawn as two rings at half the width each, which is literally what
 * centre means rather than an approximation of it.
 */
export function cssStroke(stroke: Stroke, lookup: TokenLookup = {}): string | undefined {
  const color = cssColor(stroke.color, lookup);
  if (!color || stroke.width <= 0) return undefined;

  if (stroke.align === "outside") return `0 0 0 ${stroke.width}px ${color}`;
  if (stroke.align === "inside") return `inset 0 0 0 ${stroke.width}px ${color}`;

  const half = stroke.width / 2;
  return `0 0 0 ${half}px ${color}, inset 0 0 0 ${half}px ${color}`;
}

function cssOneShadow(shadow: Shadow, lookup: TokenLookup): string | undefined {
  const color = cssColor(shadow.color, lookup);
  if (!color) return undefined;

  const inset = shadow.inset ? "inset " : "";
  return `${inset}${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${color}`;
}

/**
 * Stroke first, then shadows — the order the canvas writes them, kept so the
 * round-trip is byte-identical rather than merely equivalent.
 */
export function cssBoxShadow(
  stroke: Stroke | undefined,
  shadows: Shadow[] | undefined,
  lookup: TokenLookup = {},
): string | undefined {
  const parts = [
    ...(stroke ? [cssStroke(stroke, lookup)] : []),
    ...(shadows ?? []).map((shadow) => cssOneShadow(shadow, lookup)),
  ].filter((part): part is string => Boolean(part));

  return parts.length ? parts.join(", ") : undefined;
}

export function cssPadding(padding: Padding): string {
  return padding.map((edge) => `${edge}px`).join(" ");
}

export function cssRadius(radius: Radius): string {
  return typeof radius === "number"
    ? `${radius}px`
    : radius.map((corner) => `${corner}px`).join(" ");
}

export function cssSize(size: Size): string {
  if (size === "fill") return "100%";
  if (size === "hug") return "auto";
  return `${size}px`;
}

/** Unitless on web, which is what a multiple means to CSS. */
export function cssLineHeight(lineHeight: LineHeight): string | number {
  return lineHeight.kind === "multiple" ? lineHeight.value : `${lineHeight.value}px`;
}

export type BoxValues = {
  fill?: Fill;
  stroke?: Stroke;
  shadows?: Shadow[];
  radius?: Radius;
  opacity?: number;
  padding?: Padding;
  width?: Size;
  height?: Size;
};

export function cssBox(box: BoxValues, lookup: TokenLookup = {}): CssDeclarations {
  const background = box.fill ? cssFill(box.fill, lookup) : undefined;
  const boxShadow = cssBoxShadow(box.stroke, box.shadows, lookup);

  return {
    ...(background ? { background } : {}),
    ...(boxShadow ? { boxShadow } : {}),
    ...(box.radius === undefined ? {} : { borderRadius: cssRadius(box.radius) }),
    ...(box.opacity === undefined ? {} : { opacity: box.opacity }),
    ...(box.padding ? { padding: cssPadding(box.padding) } : {}),
    ...(box.width === undefined ? {} : { width: cssSize(box.width) }),
    ...(box.height === undefined ? {} : { height: cssSize(box.height) }),
    boxSizing: "border-box",
  };
}

/** Shared by both emitters so `fill` and `hug` cannot mean two things. */
export function flexForSize(size: Size | undefined): { grow: boolean; basis: Px | undefined } {
  if (size === "fill") return { grow: true, basis: undefined };
  if (size === "hug" || size === undefined) return { grow: false, basis: undefined };
  return { grow: false, basis: size };
}


/**
 * `bg.brand.solid` becomes `--bg-brand-solid`.
 *
 * The inverse of `tokenPathFromVar`, and the same name the constructor derives
 * into `DesignToken.css_var`. Three places spell this and they have to agree,
 * because a design's props already say `var(--bg-brand-solid)` and the cascade
 * is what connects them.
 */
export function cssVarFromTokenPath(path: string): string {
  return `--${path.split(".").join("-")}`;
}

/**
 * A mode's resolved table as custom properties, ready to spread into a style.
 *
 * This is what makes the manifest's palette reach a web funnel at all. The
 * props a design carries are still CSS — `background: var(--bg-brand-solid)` —
 * so the browser needs the properties defined above them; native resolves the
 * same table through `resolveColor` instead and never sees a `var()`.
 *
 * Returned as an object rather than a stylesheet on purpose: it goes in an
 * inline `style`, so there is no `<style>` tag to inject, nothing for a CSP to
 * refuse, and two funnels on one page keep their own palettes.
 */
export function tokenCustomProperties(
  tokens: ResolvedTokens | undefined,
  preferred?: string,
  fallback?: string,
): Record<string, string> {
  const mode = chooseMode(tokens, preferred, fallback);
  const table = mode && tokens ? tokens[mode] : undefined;
  if (!table) return {};

  const out: Record<string, string> = {};
  Object.keys(table)
    .sort()
    .forEach((path) => {
      out[cssVarFromTokenPath(path)] = table[path];
    });
  return out;
}
