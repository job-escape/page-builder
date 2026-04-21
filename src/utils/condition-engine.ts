import { Engine, TopLevelCondition } from "json-rules-engine";

import { Condition } from "../types";

import { StorageFormat } from "../types";

import { mapOperator } from "./map-operator";

type RuleConditions = NonNullable<Condition["condition"][number]["rules"]> | StorageFormat;

type RuleLeaf = {
  fact: string;
  operator: string;
  value: string;
  data_type?: string | null;
};

type EngineLeafCondition = {
  fact: string;
  operator: string;
  value: string;
};

type NestedEngineCondition = EngineLeafCondition | TopLevelCondition;

const isRuleLeaf = (condition: unknown): condition is RuleLeaf => {
  return Boolean(
    condition &&
      typeof condition === "object" &&
      "fact" in condition &&
      "operator" in condition &&
      "value" in condition,
  );
};

const hasNestedRuleConditions = (
  conditions: RuleConditions | RuleLeaf | null | undefined,
): boolean => {
  if (!conditions) {
    return false;
  }

  if (isRuleLeaf(conditions)) {
    return true;
  }

  return Boolean(
    conditions.all?.some((condition) => hasNestedRuleConditions(condition)) ||
      conditions.any?.some((condition) => hasNestedRuleConditions(condition)),
  );
};

export const hasRuleConditions = (conditions?: RuleConditions | null): boolean => {
  return hasNestedRuleConditions(conditions);
};

const buildFactKey = (condition: RuleLeaf) => {
  return condition.data_type ? `${condition.data_type}-${condition.fact}` : condition.fact;
};

const buildConditionNode = (condition: RuleLeaf | RuleConditions): NestedEngineCondition => {
  if (isRuleLeaf(condition)) {
    return {
      fact: buildFactKey(condition),
      operator: mapOperator(condition.operator),
      value: condition.value,
    };
  }

  if (condition.all?.length) {
    return {
      all: condition.all.map((item) => buildConditionNode(item)),
    };
  }

  if (condition.any?.length) {
    return {
      any: condition.any.map((item) => buildConditionNode(item)),
    };
  }

  return { all: [] };
};

export const buildRuleConditions = (conditions: RuleConditions) => {
  if (conditions.all?.length) {
    return {
      all: conditions.all.map((condition) => buildConditionNode(condition)),
    } satisfies TopLevelCondition;
  }

  if (conditions.any?.length) {
    return {
      any: conditions.any.map((condition) => buildConditionNode(condition)),
    } satisfies TopLevelCondition;
  }

  return { all: [] } satisfies TopLevelCondition;
};

export const createConditionEngine = () => {
  return new Engine([], {
    allowUndefinedFacts: true,
  });
};
