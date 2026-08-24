/**
 * Every value a design can hold, in nobody's rendering language.
 *
 * This file is the whole reason the contract exists. Today the canvas stores a
 * fill as arbitrary CSS, a border as a CSS shorthand, and a *stroke* as a
 * box-shadow ring — because the web brick hands those strings straight to CSS.
 * Two consequences, both already visible in `apps/web`:
 *
 * - `lib/stroke-value.ts` writes `inset 0 0 0 1px rgba(…)` and then regexes it
 *   back out to show the designer their own stroke. A model that has to
 *   reverse-engineer its storage format is not the model.
 * - `lib/fill-value.ts` decides whether a fill is valid by asking
 *   `document.createElement("span")`. The design model cannot validate itself
 *   without a browser, which is exactly the property that makes it unportable.
 *
 * So values here are structured and closed. Each renderer *emits* its own
 * language from them — CSS on web, `ViewStyle` on native — and neither language
 * is privileged. The rule for adding to this file: if a value can only be
 * validated by asking a rendering engine, it does not belong.
 */

/** Density-independent pixels. `dp` on Android, points on iOS, `px` on web. */
export type Px = number;

/**
 * A reference to a design token, by dotted path: `{ $token: "bg.brand.solid" }`.
 *
 * Never `var(--bg-brand-solid)`. A CSS custom property is dereferenceable only
 * by a browser with a cascade, and React Native has neither — so a token
 * reference stored as CSS is a value one platform can read and the other
 * cannot. The artifact carries the resolved table instead (`Manifest.tokens`),
 * and every renderer looks up the same map.
 */
export type TokenRef = { $token: string };

/**
 * A literal colour, in one spelling: `#rrggbb` or `#rrggbbaa`, lowercase.
 *
 * Deliberately narrower than CSS. `normaliseColor` in the canvas already wants
 * this — it exists because 146 re-spellings of the same colour defeated the
 * "you typed a colour that has a name" check. Accepting `rgb()`, `hsl()` and
 * named colours buys expressiveness nobody asked for and costs every renderer a
 * parser.
 */
export type ColorLiteral = string;

export type Color = ColorLiteral | TokenRef;

export function isTokenRef(value: Color): value is TokenRef {
  return typeof value === "object" && value !== null && "$token" in value;
}

// ─── Fill ─────────────────────────────────────────────────────────────────────

export type SolidFill = { kind: "solid"; color: Color };

/** `at` is 0–1 along the gradient, not a percentage string. */
export type GradientStop = { color: Color; at: number };

/** `angle` in degrees clockwise from "up", the way a designer reads a dial. */
export type LinearGradientFill = {
  kind: "linear-gradient";
  angle: number;
  stops: GradientStop[];
};

export type Fill = SolidFill | LinearGradientFill;

// ─── Stroke ───────────────────────────────────────────────────────────────────

/**
 * A stroke is paint, and it says so.
 *
 * Figma's stroke has an alignment and does not affect layout; CSS `border` has
 * neither property, which is why the canvas smuggles strokes through
 * `box-shadow` today. Stored structurally, each renderer picks its own trick:
 * web can keep using a spread ring, native can draw a border and compensate, or
 * use an overlay view for the outside case. Neither has to know what the other
 * chose.
 */
export type StrokeAlign = "inside" | "center" | "outside";

export type Stroke = {
  color: Color;
  width: Px;
  align: StrokeAlign;
};

// ─── Shadow ───────────────────────────────────────────────────────────────────

/**
 * A real shadow, now that strokes no longer live in this key.
 *
 * `spread` and `inset` are kept because designers use them and web renders them
 * natively; a native renderer that cannot express one degrades it (drops the
 * inset, approximates the spread) rather than failing. That choice belongs to
 * the renderer, and the conformance fixtures pin what it must be.
 */
export type Shadow = {
  color: Color;
  x: Px;
  y: Px;
  blur: Px;
  spread: Px;
  inset?: boolean;
};

// ─── Box ──────────────────────────────────────────────────────────────────────

/**
 * Always four, always top-right-bottom-left.
 *
 * The runtime brick currently accepts `number | [number, number] | [number,
 * number, number, number]` and leaves the shorthand expansion to whoever is
 * reading. Three shapes for one concept is three chances for two renderers to
 * expand it differently; the compiler normalises once, here.
 */
export type Padding = [Px, Px, Px, Px];

/** Per-corner, in the same clockwise-from-top-left order CSS uses. */
export type Radius = Px | [Px, Px, Px, Px];

/**
 * `fill` takes the space the parent offers; `hug` is as big as the content.
 * Both are Yoga concepts, which is why they survive the platform change intact.
 */
export type Size = Px | "fill" | "hug";

/**
 * Line height, with its unit named.
 *
 * The web brick hardcodes a unitless `1.4`; React Native's `lineHeight` is
 * absolute points and would read `1.4` as a 1.4-point line. The multiple has to
 * travel as a multiple so each renderer can resolve it — silently correct on
 * one platform and catastrophically wrong on the other is exactly the class of
 * bug this contract is for.
 */
export type LineHeight = { kind: "multiple"; value: number } | { kind: "px"; value: Px };
