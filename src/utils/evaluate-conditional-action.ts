import { Rule } from "json-rules-engine";

import { Answers, StorageFormat } from "../types";

import { buildRuleConditions, createConditionEngine, hasRuleConditions } from "./condition-engine";

/**
 * Evaluates a StorageFormat (simple conditions object) against the provided facts.
 * Returns true if conditions match, false otherwise.
 *
 * @param conditions - StorageFormat object with `all` and/or `any` rules
 * @param facts - Record of facts to evaluate against
 * @returns Promise<boolean> - true if conditions matched
 */
export const evaluateConditionalAction = async (
  conditions: StorageFormat,
  facts: Answers,
): Promise<boolean> => {
  if (!hasRuleConditions(conditions)) {
    return true;
  }

  const engine = createConditionEngine();

  engine.addRule(
    new Rule({
      priority: 1,
      conditions: buildRuleConditions(conditions),
      event: {
        type: "matched",
        params: {},
      },
    }),
  );

  const result = await engine.run(facts);
  return result.events.length > 0;
};
