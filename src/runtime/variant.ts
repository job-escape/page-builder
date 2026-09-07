/**
 * Which brand a visitor is shown, and why it must not change under them.
 *
 * A funnel can carry several palettes — the same design, drawn in another
 * brand. Which one a visitor gets is decided once and then held, because a
 * visitor whose colours change between screens is looking at a bug, and any
 * measurement of the two brands is worthless if people move between them
 * halfway through.
 *
 * **Its own cookie, deliberately.** The answers cookie is stamped with
 * `Manifest.version` and discarded the moment that changes, which is right for
 * answers — a question that no longer exists must not be restored. It is wrong
 * for an assignment: republishing a headline would reassign every visitor
 * mid-funnel and quietly poison the comparison. So the assignment is stored
 * beside the answers rather than inside them, with no version in it.
 */
import Cookies from "js-cookie";

/** Long-lived by choice: a returning visitor sees the brand they saw before. */
export const VARIANT_DAYS = 90;

export const variantCookieName = (funnelId: string | number): string =>
  `jb_variant_${funnelId}`;

export function readVariant(funnelId: string | number): string | null {
  if (typeof document === "undefined") return null;
  return Cookies.get(variantCookieName(funnelId)) ?? null;
}

export function writeVariant(
  funnelId: string | number,
  key: string,
  days: number = VARIANT_DAYS,
): void {
  if (typeof document === "undefined") return;
  Cookies.set(variantCookieName(funnelId), key, {
    expires: days,
    sameSite: "lax",
    secure: typeof location !== "undefined" && location.protocol === "https:",
    path: "/",
  });
}

export function clearVariant(funnelId: string | number): void {
  if (typeof document === "undefined") return;
  Cookies.remove(variantCookieName(funnelId), { path: "/" });
}

export type VariantChoice = {
  /** Every brand this artifact carries. */
  available: readonly string[];
  /** Named explicitly — a `?v=` for QA, or an assignment the host already made. */
  requested?: string | null;
  /** What this visitor was given last time. */
  stored?: string | null;
  /** The artifact's own default. */
  fallback?: string | null;
};

/**
 * The order, and the reason for it.
 *
 * Requested first, so QA and a host's own experiment assignment can both say
 * what they mean. Then what the visitor already has, which is what stops the
 * brand moving under them. Then the artifact's default.
 *
 * A name the artifact does not carry is ignored at every step rather than
 * honoured: a stale link or a cookie written before a brand was deleted must
 * fall through to something that exists, not paint nothing.
 */
export function chooseVariant({
  available,
  requested,
  stored,
  fallback,
}: VariantChoice): string | undefined {
  const has = (key: string | null | undefined): key is string =>
    !!key && available.includes(key);

  if (has(requested)) return requested;
  if (has(stored)) return stored;
  if (has(fallback)) return fallback;
  return available.length === 1 ? available[0] : undefined;
}
