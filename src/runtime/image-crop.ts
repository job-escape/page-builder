/**
 * Where a cropped picture sits in the box it fills — Figma's `crop` fit.
 *
 * Figma describes a crop as a matrix from the node's unit box to the
 * picture's: `u = m00·x + m01·y + m02`, `v = m10·x + m11·y + m12`, with the
 * picture spanning 0..1 on each axis. The canvas samples through exactly that
 * matrix (`@console/canvas-engine`'s `imageMatrix`), and with no matrix at all
 * it draws the whole picture across the box.
 *
 * The web and native bricks drew `crop` as `cover` instead, which keeps the
 * picture's aspect and cuts whatever overflows: a screenshot of a portfolio
 * placed in crop mode lost its top banner and its last row on the web while
 * the canvas showed all of it. This is the one statement of the placement both
 * renderers read, so they cannot disagree with each other again.
 *
 * Rotation and skew (`m01`, `m10`) are not representable as a CSS background or
 * a React Native image and are ignored; Figma's crop handles produce neither.
 */

/** `[m00, m01, m02, m10, m11, m12]` — the engine's order, as the canvas stores it. */
export type CropTransform = readonly [number, number, number, number, number, number];

/** The picture's rectangle as fractions of the box: 0..1 is the box itself. */
export type CropBox = { left: number; top: number; width: number; height: number };

/** The picture's rectangle within the box. No matrix means the whole picture across it. */
export function cropBox(transform?: unknown): CropBox {
  const m = Array.isArray(transform) && transform.length === 6 ? (transform as number[]) : null;
  const a = m?.[0];
  const d = m?.[4];
  if (!m || typeof a !== "number" || typeof d !== "number" || !(a > 0) || !(d > 0)) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }
  const e = Number.isFinite(m[2]) ? m[2]! : 0;
  const f = Number.isFinite(m[5]) ? m[5]! : 0;
  return { left: -e / a, top: -f / d, width: 1 / a, height: 1 / d };
}

const pct = (value: number) => `${Math.round(value * 1e4) / 100}%`;

/**
 * A background-position percentage places `p` of the picture on `p` of the box,
 * so an offset is `p·(box − picture)`. Solved for `p`; a picture exactly as wide
 * as the box can only sit at its edge.
 */
const position = (offset: number, span: number) =>
  Math.abs(1 - span) < 1e-6 ? "0%" : pct(offset / (1 - span));

/** A cropped picture as a CSS background. */
export function cropBackground(src: string, transform?: unknown): string {
  const box = cropBox(transform);
  return `url("${src}") ${position(box.left, box.width)} ${position(box.top, box.height)} / ${pct(
    box.width,
  )} ${pct(box.height)} no-repeat`;
}

/** The topmost picture paint in a `fillPaint` list, if it is a crop. */
export function cropPaintOf(
  fillPaint: unknown,
): { src: string; transform?: unknown } | null {
  if (!Array.isArray(fillPaint)) return null;
  const paint = [...(fillPaint as Record<string, unknown>[])]
    .reverse()
    .find((one) => one?.kind === "image" && typeof one.src === "string");
  if (!paint || paint.fit !== "crop") return null;
  return { src: paint.src as string, transform: paint.transform };
}

/**
 * A frame's CSS background: its `fill`, unless its picture is a crop.
 *
 * Only when the crop paint names the picture the `fill` draws — a state layer
 * that swapped the fill for a colour keeps its colour.
 */
export function frameBackground<T>(fill: T, fillPaint: unknown): T | string {
  const crop = cropPaintOf(fillPaint);
  return crop && typeof fill === "string" && fill.includes(crop.src)
    ? cropBackground(crop.src, crop.transform)
    : fill;
}
