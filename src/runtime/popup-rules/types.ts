import type { SourceCondition } from "../compiler/source";

/**
 * The popup rules served by console's public API —
 * `GET {console}/api/public/popup-rules?project=&channel=`.
 *
 * Mirrors `PopupRulesResponse` in console
 * (`apps/web/src/entities-v2/design/api/popup-rules.server.ts`). Conditions are
 * in the console editor's vocabulary; `evaluate` is what reads them here.
 *
 * Moved from frontend-alpha (`features/popup-rules`) so the webapp and the
 * mobile app read a rule with one implementation, not two that drift.
 */

export type VisitorFacts = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export type FilterValue = string | number | boolean | null;

export type EventFilter = {
  property: string;
  op: "eq" | "neq" | "has";
  value: FilterValue | FilterValue[];
};

export type RuleSubject =
  | { of: "variable"; name: string }
  | { of: "user"; property: string }
  | { of: "event"; event: string; where?: EventFilter[]; window?: unknown; agg?: string };

export type RuleCondition = {
  op: "has" | "eq" | "neq" | "isSet" | "isEmpty" | "count";
  variable?: string;
  subject?: RuleSubject;
  value?: FilterValue;
  cmp?: "eq" | "gte" | "lte";
};

export type RuleGroup = { all: RuleNode[] } | { any: RuleNode[] };

export type RuleNode = RuleCondition | RuleGroup;

export type PopupRule = {
  id: string;
  name: string;
  designId: number;
  on: string[];
  when: RuleGroup;
  /**
   * The condition in the Conditional's language — console's "Appears when"
   * section writes it, and it is evaluated with page-builder's own `evaluate`
   * over `user.*` (or `visitor.*`), `subscription.*` and `event.*`, where
   * `event.name` is the event that woke the rule. `null` asks nothing.
   * Absent from a console that predates it, in which case `when` is read.
   */
  if?: SourceCondition | null;
  cap: { times: number; per: "session" | "day" | "ever" } | null;
  show: {
    target: string;
    as: "overlay" | "replace";
    position?: "center" | "bottom" | "top" | "side" | "fill";
    dim?: boolean;
  };
  manifestUrl: string;
};

export type PopupRulesResponse = {
  version: number;
  channel: "prod" | "stage";
  project: string | null;
  generatedAt: string;
  rules: PopupRule[];
};

/** One analytics event as the host heard it — the host's own analytics, announced. */
export type HeardEvent = {
  name: string;
  props: Record<string, unknown>;
  at: number;
};

/**
 * The account's subscription record, as the user API returns it — the fields
 * `subscriptionFacts` flattens, and nothing it does not read.
 *
 * Structural rather than imported: the webapp and the app each have their own
 * type for the same record, and either must be accepted as it is.
 */
export type SubscriptionRecord = {
  id: number;
  date_started: string;
  expires: string;
  status: string;
  pause_expires?: string | null;
  discount_percent: number;
  first_payment_transaction?: {
    amount?: number;
    currency?: string;
    date_created?: string;
  } | null;
  subscription?: {
    id?: number;
    name?: string;
    price_amount?: number | string;
    price_currency?: string;
    price_currency_symbol?: string;
    subscription_type?: string;
    is_default?: boolean;
    billing_cycle_interval?: string;
    billing_cycle_frequency?: number;
    trial_timeout_price_amount?: number | string | null;
    trial_standard_price_amount?: number | string | null;
    trial_standard_discount?: number | string | null;
    trial_price_chase_amount?: number | string | null;
    trial_chase_discount?: number | string | null;
    trial_price_currency?: string | null;
    trial_period_interval?: string | null;
    trial_cycle_frequency?: number | null;
  } | null;
};
