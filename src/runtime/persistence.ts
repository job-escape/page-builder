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
 *
 * **Except what is declared `keep: "always"`.** Those ride in the same cookie
 * under their own key, `k`, which is read whatever the version says — each value
 * still validated against its current declaration, so the shape guarantee holds
 * one variable at a time instead of for the blob as a whole.
 */
import Cookies from "js-cookie";

import {
  isDataType,
  isListType,
  type VariableDecl,
  type VariableTable,
  type VariableValue,
} from "./types";

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
  /** `keep: "always"` variables — restored across versions. Absent before they existed. */
  k?: Record<string, VariableValue>;
  /**
   * The visitor facts known so far — see `VisitorFacts`. Kept across versions:
   * they describe the visitor, not the funnel's shape. Absent before they were.
   */
  f?: VisitorFacts;
};

/**
 * What a host knows about the visitor — campaign tags, geo, platform — as the
 * funnel reads them for `visitor` conditions. Saved so a fact the host could
 * answer once (the utm tags a visitor landed with) is still known on a later
 * visit that no longer carries it; see `mergeFacts` for which one wins.
 */
export type VisitorFacts = Readonly<Record<string, string | number | boolean | null>>;

/**
 * The facts to use: what the host answers now, filled in from what was saved
 * for anything it cannot answer this time. The present always wins — a country
 * is read fresh from every request, so somebody who moved is never shown the
 * old one — and a saved fact only stands in for one the host has no value for.
 */
export function mergeFacts(saved: VisitorFacts | null, current: VisitorFacts): VisitorFacts {
  const merged: Record<string, string | number | boolean | null> = { ...(saved ?? {}) };
  Object.entries(current).forEach(([name, value]) => {
    if (value !== null && value !== undefined) merged[name] = value;
    else if (!(name in merged)) merged[name] = value;
  });
  return merged;
}

export type PersistenceOptions = {
  funnelId: string | number;
  version: string;
  /**
   * The answers cookie as the request carried it — `cookieName(funnelId)`,
   * read by a host that renders on the server. Given, the first read uses it
   * on the server and in the browser alike, so both draw the same answers and
   * hydration matches; without it the server has no `document` to read and
   * draws defaults while the browser draws what was saved. `null` is "the
   * request had none". Writes still go to the cookie either way.
   */
  saved?: string | null;
  days?: number;
  /** Reported when a write is refused. Injected so this file stays pure-ish. */
  onOversize?: (bytes: number) => void;
};

export const cookieName = (funnelId: string | number): string => `jb_funnel_${funnelId}`;

/** Does a stored value still match what the manifest declares? */
/** Whether a variable is saved at all — see `VariableDecl.sensitive`, `screen` and `isDataType`. */
const isSaved = (decl: VariableDecl): boolean =>
  !decl.sensitive && !decl.screen && !decl.formula && !isDataType(decl);

const keptAlways = (decl: VariableDecl): boolean => decl.keep === "always";

/** Whether a value is one a declaration accepts — for anything a host hands in. */
export const matchesDeclaration = (decl: VariableDecl, value: unknown): boolean =>
  matchesDecl(decl, value);

function matchesDecl(decl: VariableDecl, value: unknown): boolean {
  if (value === null) return true;
  /*
    Data — a plan, or the catalogue of them. Never read back from the cookie
    (`isSaved`), so this is only ever asked of what a host hands the funnel when
    it starts: the subscriptions it loaded on the server.
  */
  const record = (entry: unknown): boolean =>
    entry !== null && typeof entry === "object" && !Array.isArray(entry);
  if (decl.type === "object") return record(value);
  if (decl.type === "list<object>") return Array.isArray(value) && value.every(record);
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
  facts: VisitorFacts = {},
): string {
  const answers: Record<string, VariableValue> = {};
  const kept: Record<string, VariableValue> = {};

  Object.values(table).forEach((decl) => {
    // A screen's own state is not an answer — see `VariableDecl.screen`. Nor is
    // what a request returned: it is loaded again, never restored stale.
    if (!isSaved(decl)) return;
    const value = state[decl.name];
    if (value === undefined) return;
    (keptAlways(decl) ? kept : answers)[decl.name] = value;
  });

  const payload: StoredAnswers = { v: version, a: answers };
  // Left out when empty, so a funnel that keeps nothing writes the cookie it
  // always wrote.
  if (Object.keys(kept).length > 0) payload.k = kept;
  // Only facts with a value: a `null` is "the host could not say", which is
  // not worth a byte and must not stand in for an answer on a later visit.
  const known = Object.fromEntries(
    Object.entries(facts).filter(([, value]) => value !== null && value !== undefined),
  );
  if (Object.keys(known).length > 0) payload.f = known;
  return JSON.stringify(payload);
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

  const restored: Record<string, VariableValue> = {};
  const take = (source: unknown, admit: (decl: VariableDecl) => boolean): void => {
    if (typeof source !== "object" || source === null || Array.isArray(source)) return;
    Object.entries(source).forEach(([name, value]) => {
      const decl = table[name];
      if (!decl || !isSaved(decl) || !admit(decl)) return;
      if (!matchesDecl(decl, value)) return;
      restored[name] = value as VariableValue;
    });
  };

  const current = stored.v === version && typeof stored.a === "object" && stored.a !== null;
  // Any saved variable from this version, wherever it was filed — one switched
  // to "always" since the last write is still in `a` and still this version's.
  if (current) take(stored.a, () => true);
  // Across versions, only what is still declared to be kept that long. A
  // variable no longer marked "always" does not get its old value back.
  take(stored.k, keptAlways);

  // Nothing usable is `null`, as it always was, so the caller seeds defaults.
  if (!current && Object.keys(restored).length === 0) return null;
  return restored;
}

/** The saved visitor facts in a cookie's value, whatever version it was written under. */
export function deserializeFacts(raw: string | undefined | null): VisitorFacts | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredAnswers> | null;
    const facts = stored?.f;
    if (!facts || typeof facts !== "object" || Array.isArray(facts)) return null;
    const valid = Object.entries(facts).filter(
      ([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean",
    );
    return valid.length ? Object.fromEntries(valid) : null;
  } catch {
    return null;
  }
}

/** The cookie as a read sees it: `saved` when the host passed it, else the browser's. */
function rawOf(options: PersistenceOptions): string | undefined {
  if (options.saved !== undefined) return options.saved ?? undefined;
  if (typeof document === "undefined") return undefined;
  return Cookies.get(cookieName(options.funnelId));
}

/** Read the saved visitor facts — from where `read` reads the answers. */
export function readFacts(options: PersistenceOptions): VisitorFacts | null {
  return deserializeFacts(rawOf(options));
}

/**
 * Read persisted answers — from `saved` when the host passed what the request
 * carried, else from the cookie. Safe on the server, where `document` is absent.
 */
export function read(
  table: VariableTable,
  options: PersistenceOptions,
): Record<string, VariableValue> | null {
  return deserialize(table, rawOf(options), options.version);
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
  facts: VisitorFacts = {},
): boolean {
  if (typeof document === "undefined") return false;

  const payload = serialize(table, state, options.version, facts);
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
