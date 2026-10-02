/**
 * The hand-off: where a buyer goes once their payment is settled, and who they
 * are when they get there.
 *
 * The host names the address (`NvsActionsOptions.redirectTo`) — a feature flag
 * of its own, usually — with the buyer written into it as placeholders:
 *
 *     https://app.example.com/register?userId={userId}&token={token}
 *
 * `{userId}` is the platform's id for the account. `{token}` is the `token`
 * the platform answers a confirmed payment with (`ConfirmPaymentSession`) —
 * its own, for that attempt, and the only one this ever writes: nothing here
 * issues a session of its own for an account the page names.
 */

/**
 * The address with the buyer written into it, or null when what the host named
 * is not somewhere a session may be sent: only http(s), since the address
 * carries a credential and a `javascript:` one would hand it to whoever set it.
 *
 * A value there is none of is written empty — `token=` — rather than left as
 * `{token}`: the app reads an absent token as "sign in", and a paying customer
 * is never held back for one. A name this does not know is left as written.
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
