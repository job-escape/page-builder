import type { Engine } from "json-rules-engine";

import { Condition } from "../types";

import { Answers } from "../types";

import { buildRuleConditions, createConditionEngine, hasRuleConditions } from "./condition-engine";
import { loadJsonRulesEngine } from "./load-json-rules-engine";
import { navDiag } from "./nav-diag";

const buildEngine = async (conditions: Condition["condition"]): Promise<Engine> => {
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

// An Engine is stateless across runs (`engine.run(facts)` builds a fresh almanac
// each call), so one built per unique rule-set can be reused for every
// evaluation. Without this, every `runCondition` call rebuilt the engine
// (`new Engine` + `addRule` per branch) — dozens of times per second on a loader
// page with many condition components re-evaluating, which pegged the main
// thread. Keyed by the serialized rules; the set of distinct rule-sets in a
// funnel is small and bounded, and the cache is per page load.
const engineCache = new Map<string, Promise<Engine>>();

export const getEngine = (conditions: Condition["condition"]): Promise<Engine> => {
  const key = JSON.stringify(conditions);
  const cached = engineCache.get(key);
  if (cached) return cached;

  const built = buildEngine(conditions).catch((error) => {
    // Don't cache a failed build — let the next caller retry.
    engineCache.delete(key);
    throw error;
  });
  engineCache.set(key, built);
  return built;
};

export const runCondition = async (
  conditions: Condition["condition"],
  answers: Answers,
): Promise<{ nodeId: number | null } | null> => {
  const defaultBranch = conditions.find((condition) => condition.isDefault);
  const t0 = performance.now();
  const engine = await getEngine(conditions);
  const tEngine = performance.now();
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
  // Only surface slow evaluations (runCondition runs constantly) to pinpoint a
  // hang: whether it's getEngine (import/build) or engine.run.
  const runMs = performance.now() - tEngine;
  const engineMs = tEngine - t0;
  if (engineMs + runMs > 800) {
    navDiag("run_condition_slow", {
      getEngineMs: Math.round(engineMs),
      runMs: Math.round(runMs),
    });
  }

  if (result.events.length > 0) {
    const first = result.events[0];
    return { nodeId: first.params?.nodeId ?? null };
  }

  if (defaultBranch) {
    return { nodeId: defaultBranch.nodeId };
  }

  return null;
};
