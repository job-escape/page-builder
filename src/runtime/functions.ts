/**
 * The functions a condition may call — the whole list, and what each means.
 *
 * Closed on purpose. A published funnel is a public file read by two renderers
 * (the compiled module and the tree walker), and "what does `validEmail` accept"
 * has to have one answer in both. So the answer lives here, both call it — the
 * store exposes these to emitted code as `state.check` / `state.call` /
 * `state.compare`, and `evaluate` reaches the same functions — and adding one is
 * a release of this package rather than a string an artifact carries.
 *
 * **Total.** Nothing here throws in front of a visitor: an unknown function is
 * false, a bad pattern is false, a value of the wrong shape is read as text.
 */
import type { CheckFunction, Comparison, ValueFunction } from "./compiler/source";

/** Any value, as the words it would show. A list reads as its entries, joined. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).join(",");
  return String(value);
}

/** A number, or NaN — numeric text counts, because a field stores what was typed. */
function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value.trim());
  return Number.NaN;
}

/** Answered: a non-blank string, a non-empty list, any number or boolean. */
function filled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * An address somebody could receive mail at, as far as a funnel can tell.
 *
 * Deliberately not RFC 5322: the aim is to catch a typo before a submit, not to
 * adjudicate edge cases a mail server will. Something, an @, a domain with a
 * dot and a suffix of two letters or more, and no spaces.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

function validEmail(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length <= 254 && EMAIL.test(trimmed);
}

/** Seven to fifteen digits once spaces, dashes, dots and brackets are ignored. */
function validPhone(text: string): boolean {
  const compact = text.trim().replace(/[\s().-]/g, "");
  return /^\+?\d{7,15}$/.test(compact);
}

/** An http(s) address — with or without the scheme typed. */
function validUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * A pattern the designer typed, tried safely.
 *
 * Bounded both ways — the pattern and what it is run over — so one written
 * badly cannot hold the page: a backtracking pattern over a thousand characters
 * is milliseconds, over a pasted essay it is a frozen tab.
 */
const MAX_PATTERN = 200;
const MAX_SUBJECT = 1000;

function matches(text: string, pattern: string): boolean {
  if (!pattern || pattern.length > MAX_PATTERN) return false;
  try {
    return new RegExp(pattern).test(text.slice(0, MAX_SUBJECT));
  } catch {
    return false;
  }
}

/** A yes-or-no function, called. Unknown names are false. */
export function check(fn: CheckFunction | string, args: readonly unknown[]): boolean {
  const [first, second] = args;
  switch (fn) {
    case "validEmail":
      return validEmail(asText(first));
    case "validPhone":
      return validPhone(asText(first));
    case "validUrl":
      return validUrl(asText(first));
    case "isNumber":
      return Number.isFinite(asNumber(first));
    case "isFilled":
      return filled(first);
    case "isEmpty":
      return !filled(first);
    case "contains":
      // A list contains an entry; text contains text.
      return Array.isArray(first)
        ? first.map(asText).includes(asText(second))
        : asText(first).includes(asText(second));
    case "startsWith":
      return asText(first).startsWith(asText(second));
    case "endsWith":
      return asText(first).endsWith(asText(second));
    case "matches":
      return matches(asText(first), asText(second));
    default:
      return false;
  }
}

/** A value-producing function, called. Unknown names produce nothing. */
export function call(fn: ValueFunction | string, args: readonly unknown[]): unknown {
  const [first] = args;
  switch (fn) {
    case "length":
      return Array.isArray(first) ? first.length : asText(first).length;
    case "count":
      // How many picks: a list's entries, one for any other answer, none for none.
      if (Array.isArray(first)) return first.length;
      return filled(first) ? 1 : 0;
    case "lower":
      return asText(first).toLowerCase();
    case "trim":
      return asText(first).trim();
    default:
      return null;
  }
}

/**
 * Two values compared.
 *
 * Ordering is numeric and reads numeric text, because a field stores what was
 * typed and `age > 17` over the string `"25"` has one obvious meaning. Equality
 * does not guess across types — except number against numeric text, for the
 * same reason — so `"yes"` is never equal to `true`.
 */
export function compare(left: unknown, cmp: Comparison | string, right: unknown): boolean {
  if (cmp === "eq" || cmp === "neq") {
    let same = left === right;
    if (!same && (typeof left === "number" || typeof right === "number")) {
      const a = asNumber(left);
      const b = asNumber(right);
      same = Number.isFinite(a) && Number.isFinite(b) && a === b;
    }
    return cmp === "eq" ? same : !same;
  }
  const a = asNumber(left);
  const b = asNumber(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (cmp === "lt") return a < b;
  if (cmp === "lte") return a <= b;
  if (cmp === "gt") return a > b;
  if (cmp === "gte") return a >= b;
  return false;
}
