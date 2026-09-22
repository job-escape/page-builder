import { subscriptionFacts } from "./subscription-facts";

import type { SubscriptionRecord } from "./types";

const sub = (over: Partial<SubscriptionRecord> = {}): SubscriptionRecord =>
  ({
    id: 77,
    date_started: "2026-09-01T00:00:00Z",
    expires: "2026-09-26T12:00:00Z",
    status: "active",
    pause_expires: null,
    discount_percent: 30,
    first_payment_transaction: {
      amount: 19.99,
      currency: "USD",
      date_created: "2026-09-01T00:00:00Z",
    },
    subscription: {
      id: 4,
      name: "4Week",
      price_amount: 39.99,
      price_currency: "USD",
      price_currency_symbol: "$",
      subscription_type: "standard",
      is_default: true,
      billing_cycle_interval: "week",
      billing_cycle_frequency: 4,
      trial_timeout_price_amount: 14.99,
      trial_standard_price_amount: 9.99,
      trial_standard_discount: 50,
      trial_price_chase_amount: 4.99,
      trial_chase_discount: 75,
      trial_price_currency: "USD",
      trial_period_interval: "day",
      trial_cycle_frequency: 7,
    },
    ...over,
  }) as SubscriptionRecord;

describe("the visitor's subscription, as facts", () => {
  it("says nothing at all while the answer is still unknown", () => {
    // The distinction this function exists for: a rule about the subscription
    // must not hold before the fetch lands, or it fires for the wrong person.
    expect(subscriptionFacts(undefined)).toEqual({});
  });

  it("says only the status when the account has no subscription", () => {
    // Not a zeroed record. "Price under 10" must not be true for somebody who
    // has never paid.
    expect(subscriptionFacts(null)).toEqual({ "subscription.status": "inactive" });
  });

  it("passes the subscription's own fields through unchanged", () => {
    const facts = subscriptionFacts(sub());

    expect(facts["subscription.id"]).toBe(77);
    expect(facts["subscription.status"]).toBe("active");
    expect(facts["subscription.date_started"]).toBe("2026-09-01T00:00:00Z");
    expect(facts["subscription.expires"]).toBe("2026-09-26T12:00:00Z");
    expect(facts["subscription.discount_percent"]).toBe(30);
  });

  it("keeps the dates as the API sent them, deriving nothing", () => {
    // No `days_left`. A convenience computed here is a second definition of a
    // fact, and the editor offers the field rather than the convenience.
    const facts = subscriptionFacts(sub());

    expect(facts["subscription.days_left"]).toBeUndefined();
    expect(facts["subscription.is_trialing"]).toBeUndefined();
    expect(facts["subscription.days_since_started"]).toBeUndefined();
  });

  it("flattens the payment at the path the record keeps it", () => {
    const facts = subscriptionFacts(sub());

    expect(facts["subscription.first_payment_transaction.amount"]).toBe(19.99);
    expect(facts["subscription.first_payment_transaction.currency"]).toBe("USD");
    expect(facts["subscription.first_payment_transaction.date_created"]).toBe(
      "2026-09-01T00:00:00Z",
    );
  });

  it("flattens the plan at its own path, nesting and all", () => {
    const facts = subscriptionFacts(sub());

    expect(facts["subscription.subscription.name"]).toBe("4Week");
    expect(facts["subscription.subscription.price_amount"]).toBe(39.99);
    expect(facts["subscription.subscription.is_default"]).toBe(true);
    expect(facts["subscription.subscription.billing_cycle_interval"]).toBe("week");
    expect(facts["subscription.subscription.billing_cycle_frequency"]).toBe(4);
  });

  it("answers for every trial term the plan carries", () => {
    const facts = subscriptionFacts(sub());

    expect(facts["subscription.subscription.trial_period_interval"]).toBe("day");
    expect(facts["subscription.subscription.trial_cycle_frequency"]).toBe(7);
    expect(facts["subscription.subscription.trial_price_currency"]).toBe("USD");
    expect(facts["subscription.subscription.trial_standard_price_amount"]).toBe(9.99);
    expect(facts["subscription.subscription.trial_standard_discount"]).toBe(50);
    expect(facts["subscription.subscription.trial_price_chase_amount"]).toBe(4.99);
    expect(facts["subscription.subscription.trial_chase_discount"]).toBe(75);
    expect(facts["subscription.subscription.trial_timeout_price_amount"]).toBe(14.99);
  });

  it("answers nothing for a pause that is not set, rather than null", () => {
    // `factOf` treats an absent fact as no answer; `null` would compare equal
    // to an empty value and make a condition hold for everybody never paused.
    expect(subscriptionFacts(sub())["subscription.pause_expires"]).toBeUndefined();
  });

  it("passes a real pause date through", () => {
    const paused = sub({ status: "paused", pause_expires: "2026-09-21T12:00:00Z" });

    expect(subscriptionFacts(paused)["subscription.pause_expires"]).toBe("2026-09-21T12:00:00Z");
  });
});
