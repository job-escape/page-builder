import { evaluateNode, firstMatch } from "./evaluate";
import type { HeardEvent, PopupRule } from "./types";

const heard = (name: string, props: Record<string, unknown> = {}): HeardEvent => ({
  name,
  props,
  at: 0,
});

const rule = (overrides: Partial<PopupRule>): PopupRule => ({
  id: "r1",
  name: "Rule",
  designId: 1,
  on: [],
  when: { all: [] },
  cap: null,
  show: { target: "frame", as: "overlay" },
  manifestUrl: "https://cdn.example/funnel.json",
  ...overrides,
});

describe("evaluateNode", () => {
  it("matches an empty group, which the editor calls 'matches every time'", () => {
    expect(evaluateNode({ all: [] }, {}, [])).toBe(true);
    expect(evaluateNode({ any: [] }, {}, [])).toBe(true);
  });

  it("matches an event only once it was heard with passing properties", () => {
    const condition = {
      op: "count" as const,
      cmp: "gte" as const,
      value: 1,
      subject: {
        of: "event" as const,
        event: "pr_webapp_upsell_view",
        where: [{ property: "country_code", op: "eq" as const, value: ["KR", "JP"] }],
      },
    };
    expect(evaluateNode({ all: [condition] }, {}, [])).toBe(false);
    expect(
      evaluateNode({ all: [condition] }, {}, [
        heard("pr_webapp_upsell_view", { country_code: "US" }),
      ]),
    ).toBe(false);
    expect(
      evaluateNode({ all: [condition] }, {}, [
        heard("pr_webapp_upsell_view", { country_code: "kr" }),
      ]),
    ).toBe(true);
  });

  it("compares visitor facts case-insensitively, and reads country from country_code", () => {
    const when = {
      all: [
        {
          op: "eq" as const,
          subject: { of: "user" as const, property: "country" },
          value: "KR",
        },
        {
          op: "has" as const,
          subject: { of: "user" as const, property: "utm_adset" },
          value: "summer",
        },
      ],
    };
    expect(evaluateNode(when, { country_code: "kr", utm_adset: "Summer_2026" }, [])).toBe(
      true,
    );
    expect(evaluateNode(when, { country_code: "US", utm_adset: "Summer_2026" }, [])).toBe(
      false,
    );
  });

  it("never matches an answer, since there are none outside a funnel", () => {
    expect(evaluateNode({ all: [{ op: "isSet", variable: "goal" }] }, {}, [])).toBe(
      false,
    );
  });

  it("treats 'is not' over several values as none of them", () => {
    const when = {
      all: [
        {
          op: "count" as const,
          subject: {
            of: "event" as const,
            event: "e",
            where: [{ property: "plan", op: "neq" as const, value: ["a", "b"] }],
          },
        },
      ],
    };
    expect(evaluateNode(when, {}, [heard("e", { plan: "b" })])).toBe(false);
    expect(evaluateNode(when, {}, [heard("e", { plan: "c" })])).toBe(true);
  });
});

describe("firstMatch", () => {
  it("asks rules with no events on load, and event rules only on their event", () => {
    const onLoad = rule({ id: "load" });
    const onEvent = rule({ id: "event", on: ["pr_webapp_home_view"] });
    const rules = [onEvent, onLoad];
    const allowed = () => true;

    expect(firstMatch({ rules, event: null, facts: {}, heard: [], allowed })?.id).toBe(
      "load",
    );
    expect(
      firstMatch({ rules, event: "pr_webapp_home_view", facts: {}, heard: [], allowed })
        ?.id,
    ).toBe("event");
    expect(
      firstMatch({ rules, event: "other", facts: {}, heard: [], allowed }),
    ).toBeNull();
  });

  it("keeps the served order and skips a rule whose cap is spent", () => {
    const first = rule({ id: "first", on: ["e"] });
    const second = rule({ id: "second", on: ["e"] });
    expect(
      firstMatch({
        rules: [first, second],
        event: "e",
        facts: {},
        heard: [],
        allowed: candidate => candidate.id !== "first",
      })?.id,
    ).toBe("second");
  });
});
