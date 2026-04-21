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
});
