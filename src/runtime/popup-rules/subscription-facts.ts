import type { SubscriptionRecord } from "./types";

import type { VisitorFacts } from "./types";

/**
 * The visitor's subscription, as facts a rule can be about.
 *
 * Console offers these under "User subscription" in the condition picker, with
 * the same keys — see `entities-v2/event-catalog/lib/catalog`. They are
 * namespaced under `subscription.` so nothing here can collide with a warehouse
 * column the picker discovered, and so a change on either side is a change to
 * one list.
 *
 * **Read from the account's own record, not from the warehouse.** Every other
 * fact a rule sees is read off an event row that has already landed; a
 * subscription is a thing that is true *now*, and a visitor who cancelled an
 * hour ago must not be shown the popup for people on a plan.
 *
 * ## The record's fields, flattened, and nothing else
 *
 * The key is the path within `SubscriptionRecord`, so this function has no
 * decisions in it: no `days_left` computed from `expires`, no `is_trialing`
 * derived from `status`. Those existed here and were removed, because a
 * convenience is a second definition of a fact — `is_trialing` is
 * `status === "trialing"` right up until somebody decides it also covers a
 * paused trial, and then the editor and the record disagree about what a rule
 * means with nothing in between them to notice.
 *
 * Dates go out as the strings the API sent. A condition compares values, and
 * comparing an ISO date as text is a weak test — but it is the record's own
 * value, and a rule that wants "expiring soon" is asking for something this
 * list does not have rather than something it should invent.
 *
 * ## Unknown is not "none"
 *
 * The query is a fetch, so there is a window where the answer is neither a
 * subscription nor the absence of one. `null` — the account has no
 * subscription — is an answer, and says so with the one field that can carry
 * it. `undefined` is *not yet known* and produces no facts at all, so a
 * condition about the subscription cannot hold before the answer arrives: a
 * rule that fires on a half-loaded page fires for the wrong person, and the
 * failure is invisible because the popup looks right when it appears.
 */
export function subscriptionFacts(
  subscription: SubscriptionRecord | null | undefined,
): VisitorFacts {
  if (subscription === undefined) return {};
  if (subscription === null) {
    // Only the status. Every other field is left absent rather than zeroed: a
    // visitor who has never paid has no plan price, and answering `0` would
    // make "price under 10" true for them — a rule about paying customers
    // matching everyone who is not one.
    return { "subscription.status": "inactive" };
  }

  const plan = subscription.subscription;
  const first = subscription.first_payment_transaction;

  return {
    "subscription.id": subscription.id,
    "subscription.date_started": subscription.date_started,
    "subscription.expires": subscription.expires,
    "subscription.status": subscription.status,
    "subscription.pause_expires": subscription.pause_expires ?? undefined,
    "subscription.discount_percent": subscription.discount_percent,

    "subscription.first_payment_transaction.amount": first?.amount,
    "subscription.first_payment_transaction.currency": first?.currency,
    "subscription.first_payment_transaction.date_created": first?.date_created,

    "subscription.subscription.id": plan?.id,
    "subscription.subscription.name": plan?.name,
    "subscription.subscription.price_amount": plan?.price_amount,
    "subscription.subscription.price_currency": plan?.price_currency,
    "subscription.subscription.price_currency_symbol": plan?.price_currency_symbol,
    "subscription.subscription.subscription_type": plan?.subscription_type,
    "subscription.subscription.is_default": plan?.is_default,
    "subscription.subscription.billing_cycle_interval": plan?.billing_cycle_interval,
    "subscription.subscription.billing_cycle_frequency": plan?.billing_cycle_frequency,
    "subscription.subscription.trial_timeout_price_amount": plan?.trial_timeout_price_amount,
    "subscription.subscription.trial_standard_price_amount": plan?.trial_standard_price_amount,
    "subscription.subscription.trial_standard_discount": plan?.trial_standard_discount,
    "subscription.subscription.trial_price_chase_amount": plan?.trial_price_chase_amount,
    "subscription.subscription.trial_chase_discount": plan?.trial_chase_discount,
    "subscription.subscription.trial_price_currency": plan?.trial_price_currency,
    "subscription.subscription.trial_period_interval": plan?.trial_period_interval,
    "subscription.subscription.trial_cycle_frequency": plan?.trial_cycle_frequency,
  };
}
