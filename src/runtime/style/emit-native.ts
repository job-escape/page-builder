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
import type { Fill, LineHeight, Padding, Px, Radius, Shadow, Size, Stroke, Color } from "./values";
import { resolveColor, type TokenLookup } from "./tokens";

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

export function nativeColor(color: Color, lookup: TokenLookup = {}): string | undefined {
  // RN accepts #rrggbb and #rrggbbaa, which is exactly the contract's spelling.
  return resolveColor(color, lookup) ?? undefined;
}

export function nativePadding(padding: Padding): NativeStyle {
  const [top, right, bottom, left] = padding;
  return { paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left };
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

/**
 * `fill` grows into the space the parent offers; `hug` is the intrinsic size,
 * which in Yoga is simply saying nothing. Same rule as the web emitter, written
 * once in `flexForSize` so the two cannot drift.
 */
export function nativeSize(size: Size | undefined, axis: "width" | "height"): NativeStyle {
  if (size === undefined || size === "hug") return {};
  if (size === "fill") return { flexGrow: 1, flexShrink: 1, flexBasis: 0 };
  return { [axis]: size };
}

/**
 * Absolute points, always.
 *
 * The web brick's unitless `1.4` would be read by React Native as a 1.4-point
 * line and stack every row of text on top of the last. The multiple has to be
 * resolved against the font size, which is why `LineHeight` carries its unit.
 */
export function nativeLineHeight(lineHeight: LineHeight, fontSize: Px): number {
  return lineHeight.kind === "px" ? lineHeight.value : lineHeight.value * fontSize;
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

export function nativeBox(box: BoxValues, lookup: TokenLookup = {}): NativeBox {
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
        inset: box.stroke.align === "outside" ? box.stroke.width : box.stroke.width / 2,
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
  Object.assign(style, nativeSize(box.width, "width"), nativeSize(box.height, "height"));

  return {
    style,
    ...(gradient ? { gradient } : {}),
    ...(overlayStroke ? { overlayStroke } : {}),
    ...(unsupported.length ? { unsupported } : {}),
  };
}
