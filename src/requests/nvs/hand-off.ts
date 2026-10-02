/**
 * The hand-off: where a buyer goes once their payment is settled, and who they
 * are when they get there.
 *
 * The host names the address (`NvsActionsOptions.redirectTo`) — a feature flag
 * of its own, usually — with the buyer written into it as placeholders:
 *
 *     https://app.example.com/register?userId={userId}&token={token}
 *
 * `{userId}` is the platform's id for the account, `{token}` a session the
 * platform issues for it (`IssueUserTokens`), `{refreshToken}` the one that
 * outlives it. So the app opens with the buyer already signed in.
 *
 * **A session is a credential, so who it is issued for is not the browser's to
 * say.** `payment.confirm` is sent a `userId`, and anything a page sends can be
 * sent by anyone: a session issued for *that* would sign a stranger into any
 * account whose id they had seen. So when a session is opened the server notes
 * who it opened it for — a cookie the page cannot read, signed with the
 * platform key — and confirming issues a session only for the account that
 * note names, for the attempt it names. No note, no session: the buyer still
 * arrives, and the app asks them to sign in.
 */

const COOKIE = "pb_checkout";
/** A session is paid within minutes; a day is a tab left open overnight. */
const COOKIE_SECONDS = 60 * 60 * 24;

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function signatureOf(secret: string, attempt: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${attempt}\n${userId}`)));
}

/** Compared in full whatever differs, so how long it took says nothing. */
function same(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let differs = 0;
  for (let at = 0; at < left.length; at += 1) differs |= left.charCodeAt(at) ^ right.charCodeAt(at);
  return differs === 0;
}

/** The `Set-Cookie` that notes who a payment session was opened for. */
export async function buyerCookie(
  secret: string,
  attempt: string,
  userId: string,
  request: Request,
): Promise<string> {
  const note = JSON.stringify([attempt, userId, await signatureOf(secret, attempt, userId)]);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(note)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_SECONDS}${secure}`;
}

/** The account this attempt's session was opened for, as the server noted it — or nothing. */
export async function buyerOf(
  secret: string,
  attempt: string,
  request: Request,
): Promise<string | undefined> {
  const held = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${COOKIE}=`));
  if (!held) return undefined;
  try {
    const note: unknown = JSON.parse(decodeURIComponent(held.slice(COOKIE.length + 1)));
    if (!Array.isArray(note)) return undefined;
    const [notedAttempt, userId, signature] = note as unknown[];
    if (typeof notedAttempt !== "string" || typeof userId !== "string" || typeof signature !== "string") {
      return undefined;
    }
    if (notedAttempt !== attempt) return undefined;
    return same(signature, await signatureOf(secret, attempt, userId)) ? userId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The address with the buyer written into it, or null when what the host named
 * is not somewhere a session may be sent: only http(s), since the address
 * carries a credential and a `javascript:` one would hand it to whoever set it.
 *
 * A value there is none of is written empty — `token=` — rather than left as
 * `{token}`: the app reads an absent session as "sign in", and a paying
 * customer is never held back for one. A name this does not know is left as
 * written.
 */
export function handOffAddress(
  template: string,
  values: Record<string, string | undefined>,
): string | null {
  const filled = template
    .trim()
    .replace(/\{(\w+)\}/g, (whole, name: string) =>
      Object.prototype.hasOwnProperty.call(values, name) ? encodeURIComponent(values[name] ?? "") : whole,
    );
  try {
    const url = new URL(filled);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
