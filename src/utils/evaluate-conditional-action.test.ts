import { describe, expect, it, jest } from "@jest/globals";

jest.mock("json-rules-engine", () => {
  class Rule {
    config: {
      conditions: {
        all?: Array<{ fact: string; operator: string; value: string }>;
        any?: Array<{ fact: string; operator: string; value: string }>;
      };
      event: { type: string };
    };

    constructor(config: Rule["config"]) {
      this.config = config;
    }
  }

  class Engine {
    private rules: Rule[] = [];

    addRule(rule: Rule) {
      this.rules.push(rule);
    }

    async run(facts: Record<string, string>) {
      const events = this.rules
        .filter((rule) => {
          const { all, any } = rule.config.conditions;

          if (all?.length) {
            return all.every((condition) => {
              if (condition.operator === "equal") {
                return facts[condition.fact] === condition.value;
              }

              return facts[condition.fact] !== condition.value;
            });
          }

          if (any?.length) {
            return any.some((condition) => {
              if (condition.operator === "equal") {
                return facts[condition.fact] === condition.value;
              }

              return facts[condition.fact] !== condition.value;
            });
          }

          return false;
        })
        .map((rule) => rule.config.event);

      return { events };
    }
  }

  return { Engine, Rule };
});

import { buildConditionFacts } from "./build-condition-facts";

const { evaluateConditionalAction } = require("./evaluate-conditional-action") as typeof import("./evaluate-conditional-action");

describe("evaluateConditionalAction", () => {
  it("matches mixed funnel_data and local conditions against runtime facts", async () => {
    await expect(
      evaluateConditionalAction(
        {
          all: [
            {
              fact: "goal",
              operator: "=",
              value: "signup",
              data_type: "funnel_data",
            },
            {
              fact: "pending",
              operator: "=",
              value: "true",
              data_type: "local",
            },
          ],
        },
        buildConditionFacts(
          {
            "funnel_data-goal": "signup",
          },
          {
            pending: "true",
          },
        ),
      ),
    ).resolves.toBe(true);
  });

  it("returns false when conditions do not match", async () => {
    await expect(
      evaluateConditionalAction(
        {
          any: [
            {
              fact: "goal",
              operator: "=",
              value: "purchase",
              data_type: "funnel_data",
            },
          ],
        },
        buildConditionFacts(
          {
            "funnel_data-goal": "signup",
          },
          {},
        ),
      ),
    ).resolves.toBe(false);
  });
});
