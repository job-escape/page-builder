/**
 * A slider's arithmetic — which place along the track an answer is, and which
 * answer a place is. In a module of its own because both renderers need it and
 * neither may import the other's bricks.
 */
export type RangeShape = {
  min?: number;
  max?: number;
  step?: number;
  stops?: readonly string[];
};

/**
 * The stops, whichever way the design carried them.
 *
 * A list in the source — and text by the time it is published: the document a
 * design is saved in keeps a list of words as its JSON, and only lists of
 * numbers are turned back (a padding, a radius). Read as a list here it was
 * read a character at a time, and a slider over 10, 30, 60 answered "[" and
 * "1". So both are taken, and so is a plain comma-separated line, which is
 * what somebody types into a field.
 */
export function stopsOf(stops: unknown): readonly string[] | undefined {
  if (Array.isArray(stops)) return stops.map(String);
  if (typeof stops !== "string" || !stops.trim()) return undefined;
  const text = stops.trim();
  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // Not JSON after all: read it as a line.
    }
  }
  return text.split(",").map((one) => one.trim()).filter(Boolean);
}

/**
 * Where a slider's thumb is, 0–1, and the answer at a place along it.
 *
 * Shared by both renderers, so a value reads as the same place on a phone and
 * in a browser. An answer the slider does not have — nothing chosen yet, or
 * words from a design that has since changed its stops — is the start.
 */
export function rangeAt(
  value: string,
  { min = 0, max = 100, stops }: RangeShape,
): number {
  if (stops?.length) {
    const at = stops.indexOf(value);
    return stops.length < 2 || at < 0 ? 0 : at / (stops.length - 1);
  }
  const number = Number(value);
  if (value === "" || !Number.isFinite(number) || max <= min) return 0;
  return Math.min(1, Math.max(0, (number - min) / (max - min)));
}

export function rangeValue(
  fraction: number,
  { min = 0, max = 100, step = 1, stops }: RangeShape,
): string {
  const along = Math.min(1, Math.max(0, fraction));
  if (stops?.length) return stops[Math.round(along * (stops.length - 1))]!;
  const size = step > 0 ? step : 1;
  const snapped = min + Math.round((along * (max - min)) / size) * size;
  // Rounded to the step's own decimals: 0.1 × 3 is not 0.30000000000000004.
  const decimals = (String(size).split(".")[1] ?? "").length;
  return String(Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals)));
}
