/**
 * Answers survive in a long-lived cookie.
 *
 * A refresh mid-funnel must not throw away six answers, and a visitor who comes
 * back later resumes where they were. Cookie rather than storage, deliberately
 * chosen — with the two consequences that follow handled here rather than
 * discovered later:
 *
 * **Cookies fail silently when too large.** The limit is about 4 KB per cookie,
 * and a write past it is simply dropped — no throw, no return value, nothing.
 * A long funnel accumulating answers would then stop persisting at some point
 * mid-flow with no signal at all. `write` refuses past a threshold and reports,
 * so the failure is visible.
 *
 * **Cookies are sent to the server on every request**, which makes personal data
 * costlier here than in storage. Variables marked `sensitive` are never written
 * — see `VariableDecl.sensitive`.
 *
 * The stored blob is keyed by funnel *version*. A visitor returning after the
 * funnel was republished would otherwise restore answers into a shape that no
 * longer exists — a variable that changed from `string` to `list`, a screen that
 * was deleted. A version mismatch simply starts clean, which removes that whole
 * class of bug for one line of comparison.
 */
import Cookies from "js-cookie";

import { isListType, type VariableDecl, type VariableTable, type VariableValue } from "./types";

/** How long answers survive. Long-lived by choice; a returning visitor resumes. */
export const DEFAULT_DAYS = 90;

/**
 * Refuse to write past this. Browsers cap a cookie near 4 KB including name and
 * attributes; staying well under it leaves room for both and for the encoding
 * expansion that `encodeURIComponent` causes on non-ASCII answers.
 */
export const MAX_BYTES = 3000;

export type StoredAnswers = {
  /** Funnel version this was captured under. A mismatch discards it. */
  v: string;
  a: Record<string, VariableValue>;
};

export type PersistenceOptions = {
  funnelId: string | number;
  version: string;
  days?: number;
  /** Reported when a write is refused. Injected so this file stays pure-ish. */
  onOversize?: (bytes: number) => void;
};

export const cookieName = (funnelId: string | number): string => `jb_funnel_${funnelId}`;

/** Does a stored value still match what the manifest declares? */
function matchesDecl(decl: VariableDecl, value: unknown): boolean {
  if (value === null) return true;
  if (isListType(decl)) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
  }
  if (decl.type === "number") return typeof value === "number";
  if (decl.type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}

/**
 * What actually goes in the cookie: declared, non-sensitive variables only.
 *
 * Undeclared names are dropped rather than carried — they cannot be restored
 * meaningfully, and carrying them wastes the byte budget that declared answers
 * need.
 */
export function serialize(
  table: VariableTable,
  state: Record<string, VariableValue>,
  version: string,
): string {
  const answers: Record<string, VariableValue> = {};

  Object.values(table).forEach((decl) => {
    if (decl.sensitive) return;
    const value = state[decl.name];
    if (value === undefined) return;
    answers[decl.name] = value;
  });

  return JSON.stringify({ v: version, a: answers } satisfies StoredAnswers);
}

/**
 * Restore, keeping only what still makes sense.
 *
 * Returns `null` for anything unusable — absent, malformed, or from a different
 * funnel version — so the caller falls back to declared defaults. Individual
 * values that no longer match their declaration are dropped rather than
 * discarding the whole set: one renamed variable should not cost a visitor the
 * other five answers.
 */
export function deserialize(
  table: VariableTable,
  raw: string | undefined,
  version: string,
): Record<string, VariableValue> | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const stored = parsed as Partial<StoredAnswers>;
  if (stored.v !== version) return null;
  if (typeof stored.a !== "object" || stored.a === null) return null;

  const restored: Record<string, VariableValue> = {};
  Object.entries(stored.a).forEach(([name, value]) => {
    const decl = table[name];
    if (!decl || decl.sensitive) return;
    if (!matchesDecl(decl, value)) return;
    restored[name] = value as VariableValue;
  });

  return restored;
}

/** Read persisted answers. Safe on the server, where `document` is absent. */
export function read(
  table: VariableTable,
  options: PersistenceOptions,
): Record<string, VariableValue> | null {
  if (typeof document === "undefined") return null;
  return deserialize(table, Cookies.get(cookieName(options.funnelId)), options.version);
}

/**
 * Persist answers. Returns whether the write happened.
 *
 * A refusal is the oversize case, and it is reported rather than swallowed —
 * silently not persisting is exactly the failure this guard exists to make
 * visible.
 */
export function write(
  table: VariableTable,
  state: Record<string, VariableValue>,
  options: PersistenceOptions,
): boolean {
  if (typeof document === "undefined") return false;

  const payload = serialize(table, state, options.version);
  const bytes = encodeURIComponent(payload).length;

  if (bytes > MAX_BYTES) {
    options.onOversize?.(bytes);
    return false;
  }

  Cookies.set(cookieName(options.funnelId), payload, {
    expires: options.days ?? DEFAULT_DAYS,
    sameSite: "lax",
    secure: typeof location !== "undefined" && location.protocol === "https:",
    path: "/",
  });
  return true;
}

export function clear(options: Pick<PersistenceOptions, "funnelId">): void {
  if (typeof document === "undefined") return;
  Cookies.remove(cookieName(options.funnelId), { path: "/" });
}
