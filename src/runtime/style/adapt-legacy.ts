/**
 * Read today's canvas props into contract values.
 *
 * The migration path, and the reason it can be gradual: the canvas keeps writing
 * CSS strings while this reads them, so the web renderer is never broken by a
 * half-finished move. Once every writer has been converted this becomes a
 * one-shot data migration and then dead code — which is the intended end, not a
 * regret.
 *
 * Everything here is **DOM-free**, which is the point. `lib/fill-value.ts`
 * decides whether a fill is valid by asking `document.createElement("span")`;
 * that function cannot run on a phone, in a test worker, or in a migration
 * script. Narrowing to the forms the canvas actually writes is what buys that
 * back — and the forms are few, because the canvas wrote them.
 */
import type {
  Color,
  ColorLiteral,
  Fill,
  GradientStop,
  Padding,
  Radius,
  Shadow,
  Size,
  Stroke,
} from "./values";

// ─── Colour ───────────────────────────────────────────────────────────────────

const HEX = /^#([0-9a-f]{3,8})$/i;
const RGB = /^rgba?\(([^)]*)\)$/i;
const VAR = /^var\(\s*(--[a-z0-9_-]+)\s*(?:,[^)]*)?\)$/i;

function hex2(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/**
 * `--bg-brand-solid-default` becomes `bg.brand.solid.default`.
 *
 * The canvas's own `pathOfVar`, carried here so a token reference survives the
 * crossing. Lossy in exactly one way — a path segment containing a hyphen cannot
 * be told from a separator — which is a constraint the token naming rules
 * already impose upstream.
 */
export function tokenPathFromVar(cssVar: string): string {
  return cssVar.replace(/^--/, "").split("-").join(".");
}

/**
 * One spelling per colour: lowercase `#rrggbb`, or `#rrggbbaa` when it is not
 * fully opaque. Fully-opaque alpha is dropped so `#fff` and `#ffffffff` compare
 * equal — the comparison `normaliseColor` in the canvas exists to make work.
 */
export function normaliseHex(value: string): ColorLiteral | null {
  const match = HEX.exec(value.trim());
  if (!match) return null;

  const digits = match[1].toLowerCase();
  const expand = (short: string) => [...short].map((digit) => digit + digit).join("");

  if (digits.length === 3) return `#${expand(digits)}`;
  if (digits.length === 4) {
    const rgba = `#${expand(digits)}`;
    return rgba.endsWith("ff") ? rgba.slice(0, 7) : rgba;
  }
  if (digits.length === 6) return `#${digits}`;
  if (digits.length === 8) return digits.endsWith("ff") ? `#${digits.slice(0, 6)}` : `#${digits}`;
  return null;
}

/** `rgb()` / `rgba()` into the same one spelling. */
function hexFromRgb(value: string): ColorLiteral | null {
  const match = RGB.exec(value.trim());
  if (!match) return null;

  const parts = match[1].split(",").map((part) => part.trim());
  const [r, g, b] = parts.slice(0, 3).map((part) => Number.parseFloat(part));
  if ([r, g, b].some((channel) => !Number.isFinite(channel))) return null;

  const alpha = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
  const rgb = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  if (!Number.isFinite(alpha) || alpha >= 1) return rgb;
  return `${rgb}${hex2(alpha * 255)}`;
}

/**
 * Any colour the canvas writes, as a contract colour.
 *
 * Returns null rather than guessing for named colours and for `hsl()`. Both are
 * things CSS accepts and the canvas therefore let through, and both need a table
 * or a parser that only pays for itself if real designs contain them — worth
 * measuring before writing.
 */
export function colorFromCss(value: string): Color | null {
  const text = value.trim();
  if (!text) return null;

  const variable = VAR.exec(text);
  if (variable) return { $token: tokenPathFromVar(variable[1].toLowerCase()) };

  return normaliseHex(text) ?? hexFromRgb(text);
}

// ─── Fill ─────────────────────────────────────────────────────────────────────

const LINEAR_GRADIENT = /^linear-gradient\((.*)\)$/is;

/** Split on top-level separators only — `rgba(0, 0, 0, .5)` must survive intact. */
function splitTopLevel(value: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  [...value].forEach((character, index) => {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === separator && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  });
  parts.push(value.slice(start));

  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * CSS angles run clockwise from up, and so does `LinearGradientFill.angle` —
 * kept identical so the common case is a copy rather than a conversion whose
 * direction nobody remembers. A gradient with no angle is `to bottom`, or 180.
 */
function gradientAngle(first: string): number | null {
  const degrees = /^([-\d.]+)deg$/i.exec(first);
  if (degrees) return Number.parseFloat(degrees[1]);
  if (/^to\s+bottom$/i.test(first)) return 180;
  if (/^to\s+top$/i.test(first)) return 0;
  if (/^to\s+right$/i.test(first)) return 90;
  if (/^to\s+left$/i.test(first)) return 270;
  return null;
}

export function fillFromCss(value: string): Fill | null {
  const text = value.trim();
  if (!text) return null;

  const gradient = LINEAR_GRADIENT.exec(text);
  if (gradient) {
    const parts = splitTopLevel(gradient[1], ",");
    const angle = parts.length > 0 ? gradientAngle(parts[0]) : null;
    const stopParts = angle === null ? parts : parts.slice(1);

    const stops = stopParts
      .map((part, index): GradientStop | null => {
        const [colorText, position] = splitTopLevel(part, " ");
        const color = colorText ? colorFromCss(colorText) : null;
        if (!color) return null;

        const percent = position ? Number.parseFloat(position.replace("%", "")) : Number.NaN;
        const at = Number.isFinite(percent)
          ? percent / 100
          : index / Math.max(1, stopParts.length - 1);
        return { color, at };
      })
      .filter((stop): stop is GradientStop => stop !== null);

    if (stops.length < 2) return null;
    return { kind: "linear-gradient", angle: angle ?? 180, stops };
  }

  const color = colorFromCss(text);
  return color ? { kind: "solid", color } : null;
}

// ─── Stroke and shadow ────────────────────────────────────────────────────────

type ParsedShadow = Shadow & { ring: boolean };

function parseOneShadow(part: string): ParsedShadow | null {
  const tokens = splitTopLevel(part, " ");
  const inset = tokens.some((token) => token.toLowerCase() === "inset");

  const colorToken = tokens.find((token) => colorFromCss(token) !== null);
  const color = colorToken ? colorFromCss(colorToken) : null;
  if (!color) return null;

  const lengths = tokens
    .filter((token) => /^-?[\d.]+px$/i.test(token) || /^-?[\d.]+$/.test(token))
    .map((token) => Number.parseFloat(token));
  if (lengths.length < 2) return null;

  const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
  return { color, x, y, blur, spread, inset, ring: x === 0 && y === 0 && blur === 0 && spread > 0 };
}

/**
 * Pull the stroke back out of the `shadow` prop, and keep what is left.
 *
 * The canvas stores a Figma stroke as a spread ring — `0 0 0 1px c` outside,
 * `inset ...` inside, and both at half width for centre — because a ring is
 * paint that takes no part in layout, which is what a stroke is and what a CSS
 * border is not. That encoding is why this function has to exist, and undoing it
 * is why the contract stores a stroke as a stroke.
 *
 * Anything that is not a ring is a real shadow and comes back untouched: the key
 * is free-form, and a future effects control will write into it too.
 */
export function shadowsFromCss(value: unknown): { stroke: Stroke | null; shadows: Shadow[] } {
  if (typeof value !== "string" || !value.trim()) return { stroke: null, shadows: [] };

  const parsed = splitTopLevel(value, ",")
    .map(parseOneShadow)
    .filter((shadow): shadow is ParsedShadow => shadow !== null);

  const rings = parsed.filter((shadow) => shadow.ring);
  const shadows: Shadow[] = parsed
    .filter((shadow) => !shadow.ring)
    .map(({ ring: _ring, ...shadow }) => shadow);

  // Two rings of equal width, one inset and one not, is the centre form —
  // literally half inside and half outside, so the stored width is doubled.
  if (
    rings.length === 2 &&
    rings[0].inset !== rings[1].inset &&
    rings[0].spread === rings[1].spread
  ) {
    return {
      stroke: { color: rings[0].color, width: rings[0].spread * 2, align: "center" },
      shadows,
    };
  }
  if (rings.length === 1) {
    return {
      stroke: {
        color: rings[0].color,
        width: rings[0].spread,
        align: rings[0].inset ? "inside" : "outside",
      },
      shadows,
    };
  }
  return { stroke: null, shadows };
}

// ─── Box values ───────────────────────────────────────────────────────────────

/**
 * `16`, `[16, 8]` and `[16, 8, 16, 8]` all become four, top-right-bottom-left.
 *
 * Three accepted shapes is three chances for two renderers to expand the
 * shorthand differently. Expanded once, here, and never again.
 */
export function paddingFrom(value: unknown): Padding | undefined {
  if (typeof value === "number") return [value, value, value, value];
  if (!Array.isArray(value)) return undefined;

  const numbers = value.map((edge) => Number(edge) || 0);
  if (numbers.length === 2) {
    const [vertical, horizontal] = numbers;
    return [vertical, horizontal, vertical, horizontal];
  }
  if (numbers.length === 4) return [numbers[0], numbers[1], numbers[2], numbers[3]];
  return undefined;
}

export function radiusFrom(value: unknown): Radius | undefined {
  if (typeof value === "number") return value;
  if (Array.isArray(value) && value.length === 4) {
    const [a, b, c, d] = value.map((corner) => Number(corner) || 0);
    return [a, b, c, d];
  }
  return undefined;
}

export function sizeFrom(value: unknown): Size | undefined {
  if (typeof value === "number") return value;
  if (value === "fill" || value === "hug") return value;
  return undefined;
}

/** Everything the box half of a frame's props says, in contract values. */
export type LegacyBox = {
  fill?: Fill;
  stroke?: Stroke;
  shadows?: Shadow[];
  radius?: Radius;
  opacity?: number;
  padding?: Padding;
  width?: Size;
  height?: Size;
};

export function boxFromProps(props: Record<string, unknown> | null | undefined): LegacyBox {
  const source = props ?? {};
  const { stroke, shadows } = shadowsFromCss(source.shadow);
  const fill = typeof source.fill === "string" ? fillFromCss(source.fill) : null;
  const radius = radiusFrom(source.radius);
  const padding = paddingFrom(source.padding);
  const width = sizeFrom(source.width);
  const height = sizeFrom(source.height);

  return {
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(shadows.length ? { shadows } : {}),
    ...(radius === undefined ? {} : { radius }),
    ...(typeof source.opacity === "number" ? { opacity: source.opacity } : {}),
    ...(padding ? { padding } : {}),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}
