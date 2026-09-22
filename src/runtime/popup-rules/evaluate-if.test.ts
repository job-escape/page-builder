import { allMatches, firstMatch, ruleHolds } from "./evaluate";
import { subscriptionFacts } from "./subscription-facts";
import type { PopupRule } from "./types";

import type { SubscriptionRecord } from "./types";

/*
  Conditions written exactly as console's `if` field parses them — the JSON
  was read off console's own parser, not composed for these tests. The point is
  that page-builder's `evaluate` reads what the editor writes.
*/
const eq = (name: string, path: string, value: unknown) => ({
  op: "cmp",
  cmp: "eq",
  left: { var: name, path },
  right: { lit: value },
});

const rule = (over: Partial<PopupRule>): PopupRule =>
  ({
    id: "r",
    name: "r",
    designId: 1,
    on: ["pr_webapp_homepage_view"],
    when: { all: [] },
    cap: null,
    show: { target: "s", as: "overlay" },
    manifestUrl: "",
    ...over,
  }) as PopupRule;

const trialing = subscriptionFacts({
  id: 1,
  status: "trialing",
  date_started: "2026-09-01T00:00:00Z",
  expires: "2026-09-30T00:00:00Z",
  discount_percent: 0,
  pause_expires: null,
  first_payment_transaction: { amount: 1, currency: "USD", date_created: "2026-09-01T00:00:00Z" },
  subscription: { id: 4, name: "4Week", price_amount: 9 },
} as unknown as SubscriptionRecord);

describe("a rule's `if`, evaluated by page-builder", () => {
  it("opens whenever its event fires when it asks nothing", () => {
    expect(ruleHolds(rule({ if: null }), {}, [], {})).toBe(true);
  });

  it("reads the visitor", () => {
    const r = rule({ if: eq("visitor", "country", "KR") as never });
    expect(ruleHolds(r, { country: "KR" }, [], {})).toBe(true);
    expect(ruleHolds(r, { country: "US" }, [], {})).toBe(false);
  });

  it("reads the subscription record, nested fields included", () => {
    expect(ruleHolds(rule({ if: eq("subscription", "status", "trialing") as never }), trialing, [], {})).toBe(true);
    expect(ruleHolds(rule({ if: eq("subscription", "subscription.name", "4Week") as never }), trialing, [], {})).toBe(true);
  });

  it("reads the event that woke it", () => {
    const r = rule({ if: eq("event", "home_page_version", "v1") as never });
    expect(ruleHolds(r, {}, [], { home_page_version: "v1" })).toBe(true);
    expect(ruleHolds(r, {}, [], { home_page_version: "v2" })).toBe(false);
  });

  it("groups with and, or and brackets", () => {
    // subscription.status == "trialing" && (visitor.country == "KR" || visitor.country == "JP")
    const r = rule({
      if: {
        op: "and",
        of: [
          eq("subscription", "status", "trialing"),
          { op: "or", of: [eq("visitor", "country", "KR"), eq("visitor", "country", "JP")] },
        ],
      } as never,
    });
    expect(ruleHolds(r, { ...trialing, country: "JP" }, [], {})).toBe(true);
    expect(ruleHolds(r, { ...trialing, country: "US" }, [], {})).toBe(false);
    expect(ruleHolds(r, { country: "JP" }, [], {})).toBe(false);
  });

  it("does not hold on a subscription that has not loaded yet", () => {
    const r = rule({ if: eq("subscription", "status", "inactive") as never });
    // Unknown is not none: no subscription facts at all.
    expect(ruleHolds(r, subscriptionFacts(undefined), [], {})).toBe(false);
    expect(ruleHolds(r, subscriptionFacts(null), [], {})).toBe(true);
  });

  it("is only asked on the events it listens for", () => {
    const r = rule({ if: null, on: ["pr_webapp_homepage_view"] });
    const allowed = () => true;
    expect(firstMatch({ rules: [r], event: "pr_webapp_login_view", facts: {}, heard: [], allowed })).toBeNull();
    expect(firstMatch({ rules: [r], event: "pr_webapp_homepage_view", facts: {}, heard: [], allowed })).toBe(r);
  });

  it("reads the event's name and the user's facts, and is asked on every event", () => {
    const r = rule({
      on: [],
      if: {
        op: "and",
        of: [eq("event", "name", "pr_webapp_homepage_view"), eq("user", "country", "KR")],
      } as never,
    });
    const allowed = () => true;
    const at = (event: string | null, country: string) =>
      firstMatch({ rules: [r], event, facts: { country }, heard: [], allowed });
    expect(at("pr_webapp_homepage_view", "KR")).toBe(r);
    expect(at("pr_webapp_homepage_view", "US")).toBeNull();
    expect(at("pr_webapp_login_view", "KR")).toBeNull();
    // On load no event woke it, so a condition about one does not hold.
    expect(at(null, "KR")).toBeNull();
  });

  it("opens every popup whose condition is met, not only the first", () => {
    const home = eq("event", "name", "pr_webapp_homepage_view");
    const upgrade = rule({ id: "upgrade", on: [], if: home as never });
    const welcome = rule({ id: "welcome", on: [], if: home as never });
    const korea = rule({ id: "korea", on: [], if: eq("user", "country", "KR") as never });
    const matched = allMatches({
      rules: [upgrade, welcome, korea],
      event: "pr_webapp_homepage_view",
      facts: { country: "US" },
      heard: [],
      allowed: () => true,
    });
    expect(matched.map(each => each.id)).toEqual(["upgrade", "welcome"]);
  });

  it("still reads a rule from a console that has not sent an `if`", () => {
    const legacy = rule({ when: { all: [] } });
    expect("if" in legacy).toBe(false);
    expect(ruleHolds(legacy, {}, [], {})).toBe(true);
  });
});
