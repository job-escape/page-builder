import { describe, expect, it } from "@jest/globals";

import { buildConditionFacts } from "./build-condition-facts";

describe("buildConditionFacts", () => {
  it("merges answers with local facts using the local- prefix", () => {
    expect(
      buildConditionFacts(
        {
          "funnel_data-goal": "signup",
        },
        {
          pending: "true",
          error: "nope",
        },
      ),
    ).toEqual({
      "funnel_data-goal": "signup",
      "local-pending": "true",
      "local-error": "nope",
    });
  });

  it("returns an empty facts object when inputs are missing", () => {
    expect(buildConditionFacts(undefined, undefined)).toEqual({});
  });

  it("merges subscription facts using the subscription_data- prefix", () => {
    expect(
      buildConditionFacts(
        { "funnel_data-goal": "signup" },
        { pending: "true" },
        { price_amount: 29.99, name: "Annual" },
      ),
    ).toEqual({
      "funnel_data-goal": "signup",
      "local-pending": "true",
      "subscription_data-price_amount": 29.99,
      "subscription_data-name": "Annual",
    });
  });
});
