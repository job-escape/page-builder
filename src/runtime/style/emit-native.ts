/**
 * Contract values as React Native styles.
 *
 * Two things make this more than a rename, and both are why the values had to
 * stop being CSS first:
 *
 * - **A stroke is not a border.** React Native has no spread and no inset, so
 *   the ring trick is unavailable — and `borderWidth` consumes layout, which a
 *   stroke must not. Inside alignment is close enough to a border to use one;
 *   outside and centre are returned as an `overlayStroke` for the renderer to
 *   draw as an absolutely-positioned sibling, which is the only construct that
 *   paints without taking part in layout.
 * - **Some things are components, not styles.** A gradient is a child view, not
 *   a background. It comes back beside the style object rather than inside it,
 *   because pretending otherwise is how a style silently does nothing.
 *
 * Typed structurally, with no `react-native` import — this package stays
 * installable anywhere, and a plain object is what the RN style prop takes.
 */
import type {
  Fill,
  LineHeight,
  Padding,
  Px,
  Radius,
  Shadow,
  Size,
  Stroke,
  Color,
} from "./values";
import { colorFromCss } from "./adapt-legacy";
import { cssVarFromTokenPath } from "./emit-css";
import { resolveColor, type TokenLookup } from "./tokens";
import { isTokenRef } from "./values";

export type NativeStyle = Record<string, string | number>;

/** A gradient the renderer must draw as a child view. */
export type NativeGradient = {
  /** Degrees clockwise from up, as authored. */
  angle: number;
  colors: string[];
  /** 0–1 along the gradient, one per colour. */
  locations: number[];
};

/** A stroke that must be painted without disturbing layout. */
export type NativeOverlayStroke = {
  color: string;
  width: Px;
  /** How far outside the box the ring sits — half the width for centre. */
  inset: Px;
  radius?: Radius;
};

export type NativeBox = {
  style: NativeStyle;
  gradient?: NativeGradient;
  overlayStroke?: NativeOverlayStroke;
  /**
   * What this platform could not draw, by name. Surfaced rather than silently
   * dropped: a design that looks wrong on one platform and right on the other
   * should be explainable from a log, not from a bisect.
   */
  unsupported?: string[];
};

export function nativeColor(
  color: Color,
  lookup: TokenLookup = {},
): string | undefined {
  /**
   * A design's text colour can still arrive as CSS — `var(--text-primary)`.
   *
   * The web cascade resolves that; React Native cannot parse it and draws the
   * text black, which on a dark palette is invisible. So it is read the way
   * `boxFromProps` reads a fill: as a token reference, or a literal.
   */
  const contract =
    typeof color === "string" ? (colorFromCss(color) ?? color) : color;
  // RN accepts #rrggbb and #rrggbbaa, which is exactly the contract's spelling.
  const resolved = resolveColor(contract, { ...lookup, onMissing: undefined });
  if (resolved) return resolved;
  /**
   * `--fg-on-brand` reads back as `fg.on.brand`, but the palette says
   * `fg.on-brand` — a hyphen inside a segment cannot be told from a separator.
   * Matched against the table by the CSS name instead, which is exact.
   */
  if (isTokenRef(contract) && lookup.tokens) {
    const cssVar = cssVarFromTokenPath(contract.$token);
    const table = Object.values(lookup.tokens);
    const path = table.length
      ? Object.keys(
          lookup.mode && lookup.tokens[lookup.mode]
            ? lookup.tokens[lookup.mode]
            : table[0]!,
        ).find((key) => cssVarFromTokenPath(key) === cssVar)
      : undefined;
    if (path) return resolveColor({ $token: path }, lookup) ?? undefined;
  }
  return resolveColor(contract, lookup) ?? undefined;
}

/**
 * Padding, in start/end rather than left/right.
 *
 * The same reason the web emitter uses `padding-inline`: a designer's "left" is
 * the side the content starts on, which in Arabic is the right. React Native
 * resolves `paddingStart` and `paddingEnd` against `I18nManager`, so this needs
 * no direction passed to it and is identical in a left-to-right layout.
 */
export function nativePadding(padding: Padding): NativeStyle {
  const [top, right, bottom, left] = padding;
  return {
    paddingTop: top,
    paddingBottom: bottom,
    paddingStart: left,
    paddingEnd: right,
  };
}

export function nativeRadius(radius: Radius): NativeStyle {
  if (typeof radius === "number") return { borderRadius: radius };
  const [topLeft, topRight, bottomRight, bottomLeft] = radius;
  return {
    borderTopLeftRadius: topLeft,
    borderTopRightRadius: topRight,
    borderBottomRightRadius: bottomRight,
    borderBottomLeftRadius: bottomLeft,
  };
}

/** Which way a frame lays its children out — what a child's `fill` is measured along. */
export type Flow = "column" | "row" | "none";

/**
 * `fill` grows into the space the parent offers; `hug` is the intrinsic size,
 * which in Yoga is simply saying nothing.
 *
 * **Along or across — the parent decides.** `fill` used to be `flex: 1` on
 * whichever axis asked, and flex only ever acts along the parent's direction.
 * So a width set to fill inside a column became a *height* that grew, beside a
 * width nobody set: the hero image of a quiz collapsed to nothing, and the
 * header, the content and the footer of a screen became three equal bands with
 * the logo floating in the first. The web brick never had this — `100%` is a
 * width there — so the app and the web drew the same design differently.
 *
 * Given the parent's `flow`: along it, flex; across it, `alignSelf: stretch`,
 * which is Yoga's "as wide as the parent" and beats the parent's own
 * `alignItems`; in a parent with no flow, `100%`. Without a flow the old answer
 * stands, so a caller that has not been told draws what it always drew.
 */
export function nativeSize(
  size: Size | undefined,
  axis: "width" | "height",
  flow?: Flow,
  /**
   * Whether the height this size is measured against is a definite one — see
   * the `fill` height rule below. True by default, which is what every caller
   * meant before a screen's content could be the thing deciding the height.
   */
  definite = true,
): NativeStyle {
  if (size === undefined || size === "hug") return {};
  /**
   * A fixed width along a row gives way when the row is too narrow, as it does
   * on the web.
   *
   * CSS flex items shrink by default and Yoga's do not, so two 260-point
   * buttons in a 361-point row sat side by side on the canvas and in a browser
   * and ran off the edge of a phone. Rows only: that is where the overflow was,
   * and a column inside a scrolling screen has no height to shrink against.
   */
  if (size !== "fill")
    return flow === "row" && axis === "width"
      ? { [axis]: size, flexShrink: 1 }
      : { [axis]: size };
  /**
   * Nothing above it — a screen's root, and on this platform what is above it
   * is a `ScrollView`'s content.
   *
   * There `fill` means **at least** the viewport, never exactly it. A basis of
   * zero made the root contribute no height of its own and then grow to the
   * visible height exactly, so a screen taller than the phone had its overflow
   * cut off with nothing to scroll to — while the browser, where the same root
   * is `height: 100%` inside a document that scrolls, showed all of it.
   */
  if (flow === undefined) {
    return axis === "height"
      ? { flexGrow: 1, flexShrink: 0, flexBasis: "auto" }
      : { width: "100%" };
  }
  /**
   * A `fill` height inside a parent whose own height is not definite hugs.
   *
   * The same rule CSS applies to `height: 100%`: a percentage against a parent
   * with no definite height resolves to `auto`, so the child takes its content
   * and nothing more. Everything inside a scrolling screen is in exactly that
   * position — the host's content is measured from what is in it.
   *
   * Without this the two renderers disagreed twice over on one screen. Native
   * grew a `fill` child to the space left in the viewport, which invented a gap
   * the browser never draws, and made the scroll content exactly its own
   * viewport — so a list that ran past the bottom had nothing to scroll to,
   * while the browser laid the same screen out compactly and showed all of it.
   */
  if (axis === "height" && !definite) return {};
  if (flow === "none") return { [axis]: "100%" };
  const along = (flow === "column") === (axis === "height");
  return along
    ? { flexGrow: 1, flexShrink: 1, flexBasis: 0 }
    : { alignSelf: "stretch" };
}

/**
 * Absolute points, always.
 *
 * The web brick's unitless `1.4` would be read by React Native as a 1.4-point
 * line and stack every row of text on top of the last. The multiple has to be
 * resolved against the font size, which is why `LineHeight` carries its unit.
 */
export function nativeLineHeight(lineHeight: LineHeight, fontSize: Px): number {
  return lineHeight.kind === "px"
    ? lineHeight.value
    : lineHeight.value * fontSize;
}

/**
 * The first non-inset shadow, in iOS keys plus an Android elevation.
 *
 * React Native takes one shadow per view, so a stack of them is reported as
 * unsupported rather than quietly reduced to its first member. `elevation` is
 * derived from the blur because Android has no separate control for it — an
 * approximation, and the fixtures pin which one.
 */
function nativeShadow(
  shadows: Shadow[] | undefined,
  lookup: TokenLookup,
): { style: NativeStyle; unsupported: string[] } {
  const list = shadows ?? [];
  if (list.length === 0) return { style: {}, unsupported: [] };

  const unsupported: string[] = [];
  const outer = list.filter((shadow) => !shadow.inset);
  if (outer.length < list.length) unsupported.push("shadow.inset");
  if (outer.length > 1) unsupported.push("shadow.multiple");
  if (outer.length === 0) return { style: {}, unsupported };

  const [shadow] = outer;
  if (shadow.spread !== 0) unsupported.push("shadow.spread");

  const color = nativeColor(shadow.color, lookup);
  if (!color) return { style: {}, unsupported };

  return {
    style: {
      shadowColor: color,
      shadowOffsetWidth: shadow.x,
      shadowOffsetHeight: shadow.y,
      shadowRadius: shadow.blur,
      shadowOpacity: 1,
      elevation: Math.round(shadow.blur / 2),
    },
    unsupported,
  };
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

export function nativeBox(
  box: BoxValues,
  lookup: TokenLookup = {},
  /** The parent's flow, which decides what `fill` means — see `nativeSize`. */
  flow?: Flow,
  /** Whether the parent's height is definite — the other half of that answer. */
  definite = true,
): NativeBox {
  const unsupported: string[] = [];
  let gradient: NativeGradient | undefined;
  const style: NativeStyle = {};

  if (box.fill?.kind === "solid") {
    const color = nativeColor(box.fill.color, lookup);
    if (color) style.backgroundColor = color;
  }
  if (box.fill?.kind === "linear-gradient") {
    const colors = box.fill.stops
      .map((stop) => nativeColor(stop.color, lookup))
      .filter((color): color is string => Boolean(color));
    if (colors.length >= 2) {
      gradient = {
        angle: box.fill.angle,
        colors,
        locations: box.fill.stops.map((stop) => stop.at),
      };
    }
  }

  let overlayStroke: NativeOverlayStroke | undefined;
  if (box.stroke && box.stroke.width > 0) {
    const color = nativeColor(box.stroke.color, lookup);
    if (color && box.stroke.align === "inside") {
      style.borderWidth = box.stroke.width;
      style.borderColor = color;
    } else if (color) {
      overlayStroke = {
        color,
        width: box.stroke.width,
        inset:
          box.stroke.align === "outside"
            ? box.stroke.width
            : box.stroke.width / 2,
        ...(box.radius === undefined ? {} : { radius: box.radius }),
      };
    }
  }

  const shadow = nativeShadow(box.shadows, lookup);
  Object.assign(style, shadow.style);
  unsupported.push(...shadow.unsupported);

  if (box.radius !== undefined) Object.assign(style, nativeRadius(box.radius));
  if (box.opacity !== undefined) style.opacity = box.opacity;
  if (box.padding) Object.assign(style, nativePadding(box.padding));
  Object.assign(
    style,
    nativeSize(box.width, "width", flow),
    nativeSize(box.height, "height", flow, definite),
  );

  return {
    style,
    ...(gradient ? { gradient } : {}),
    ...(overlayStroke ? { overlayStroke } : {}),
    ...(unsupported.length ? { unsupported } : {}),
  };
}
