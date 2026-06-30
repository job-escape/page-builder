import { Condition } from "../types";

import { Answers } from "../types";

import { buildRuleConditions, createConditionEngine, hasRuleConditions } from "./condition-engine";
import { loadJsonRulesEngine } from "./load-json-rules-engine";

export const getEngine = async (conditions: Condition["condition"]) => {
  const { Rule } = await loadJsonRulesEngine();
  const engine = await createConditionEngine();

  const conditionalBranches = conditions.filter((condition) => !condition.isDefault);

  conditionalBranches.forEach((condition, index) => {
    if (!hasRuleConditions(condition.rules)) return;

    const priority = conditionalBranches.length - index;

    engine.addRule(
      new Rule({
        priority,
        conditions: buildRuleConditions(condition.rules),
        event: {
          type: "branch-matched",
          params: { nodeId: condition.nodeId },
        },
      }),
    );
  });

  return engine;
};

export const runCondition = async (
  conditions: Condition["condition"],
  answers: Answers,
): Promise<{ nodeId: number | null } | null> => {
  const defaultBranch = conditions.find((condition) => condition.isDefault);
  const engine = await getEngine(conditions);
  const answersWithAliases = {
    ...answers,
    ...Object.fromEntries(
      Object.entries(answers)
        .filter(([fact]) => fact.includes("-"))
        .map(([fact, value]) => [fact.split("-").slice(1).join("-"), value] as const)
        .filter(([factAlias]) => Boolean(factAlias)),
    ),
  };
  const result = await engine.run(answersWithAliases);

  if (result.events.length > 0) {
    const first = result.events[0];
    return { nodeId: first.params?.nodeId ?? null };
  }

  if (defaultBranch) {
    return { nodeId: defaultBranch.nodeId };
  }

  return null;
};
