/**
 * The subscriptions request's wire: what `subscriptions.list` answers, as a
 * schema the funnel parses with — so a plan card never reads a field off an
 * answer by guessing at it.
 *
 * A design repeats its plan cards over the system variable `subscriptions`.
 * The funnel asks its host for the list when it starts — a request of its own,
 * to a route of its own, the way the email step's is — and puts the answer in
 * that variable. Which plans a visitor is offered is the host's to decide (a
 * feature flag naming product codes); the funnel shows what it is given.
 *
 * The host's route (`requests/subscriptions`) answers with the same shapes,
 * declared again on its side: `src/runtime` and the rest of the package may
 * not import each other (`isolation.test`).
 */
import { z } from "zod";

/** The name the funnel asks for, and a host's route answers to. */
export const SUBSCRIPTIONS_ACTION = "subscriptions.list";

/** The variable the answer is put in — the console's system variable. */
export const SUBSCRIPTIONS_VARIABLE = "subscriptions";

/**
 * One plan, as a design reads it (`$item` in a repeat). These fields are the
 * ones a design is offered; a plan may carry others beside them, which are let
 * through as they came. Amounts are in the currency's own unit — `38.95`.
 */
export const Subscription = z.looseObject({
  /** The plan's id on the payments platform. */
  id: z.string(),
  /** The plan's code — what a payment is started with. */
  code: z.string().min(1),
  name: z.string(),
  price_amount: z.number(),
  price_currency: z.string(),
  price_currency_symbol: z.string(),
  /** What it bills by — `week`, `month`, `year`. */
  billing_cycle_interval: z.string(),
  billing_cycle_frequency: z.number(),
  /** The first period's price — the full price when there is no trial. */
  trial_standard_price_amount: z.number(),
  trial_standard_discount: z.number(),
  trial_cycle_frequency: z.number(),
  saved_amount: z.number(),
  /** The plan to start selected — the first of those offered. */
  is_default: z.boolean(),
});
export type Subscription = z.infer<typeof Subscription>;

/** What the route answers. */
export const SubscriptionsResponse = z.looseObject({
  subscriptions: z.array(Subscription),
});
export type SubscriptionsResponse = z.infer<typeof SubscriptionsResponse>;
