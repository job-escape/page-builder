import { createEffect, createStore, sample, Store } from "effector";
import { useUnit } from "effector-react";

import { useRef } from "react";

import { Answers, Condition, NodeStatesValue, PrimitiveValue } from "../types";
import { buildConditionFacts } from "../utils/build-condition-facts";
import { runCondition } from "../utils/run-condition";

// ─── Convert NodeStatesValue → Condition["condition"] ─────────────────────────

function toConditionBranches(states: NodeStatesValue): Condition["condition"] {
  return states.map((stateRule) => ({
    nodeId: stateRule.name as unknown as number | null,
    rules: stateRule.rules,
    isDefault: false,
  }));
}

// ─── Merge answers + local model into a single facts object ───────────────────
// Local facts are prefixed with "local-" to match how the engine builds fact keys:
// fact: `${cond.data_type}-${cond.fact}` → "local-isSubmitting"

function mergeAnswers(
  answers: Answers,
  localModel: Record<string, PrimitiveValue | string[]>,
  subscriptionFacts: Record<string, PrimitiveValue>,
): Answers {
  return buildConditionFacts(answers, localModel, subscriptionFacts);
}

// ─── Model factory ────────────────────────────────────────────────────────────

function createActiveStateModel(
  states: NodeStatesValue,
  $answers: Store<Answers>,
  $localModel: Store<Record<string, PrimitiveValue | string[]>>,
  $subscriptionFacts: Store<Record<string, PrimitiveValue>>,
) {
  const $activeState = createStore<string | null>(null);

  const evaluateFx = createEffect(
    async ({
      answers,
      local,
      subscription,
    }: {
      answers: Answers;
      local: Record<string, PrimitiveValue | string[]>;
      subscription: Record<string, PrimitiveValue>;
    }): Promise<string | null> => {
      if (!states.length) return null;

      const branches = toConditionBranches(states);

      const nonEmpty = branches.filter((b) => {
        if ("all" in b.rules && b.rules.all) return b.rules.all.length > 0;
        if ("any" in b.rules && b.rules.any) return b.rules.any.length > 0;
        return false;
      });

      if (!nonEmpty.length) return null;

      // merge local model + subscription facts into answers before passing to engine
      const mergedAnswers = mergeAnswers(answers, local, subscription);

      const matched = await runCondition(nonEmpty, mergedAnswers);
      return matched?.nodeId ? String(matched.nodeId) : null;
    },
  );

  $activeState.on(evaluateFx.doneData, (_, result) => result);

  sample({
    clock: [$answers, $localModel, $subscriptionFacts],
    source: { answers: $answers, local: $localModel, subscription: $subscriptionFacts },
    target: evaluateFx,
  });

  evaluateFx({
    answers: $answers.getState(),
    local: $localModel.getState(),
    subscription: $subscriptionFacts.getState(),
  });

  return { $activeState };
}

type ActiveStateModel = ReturnType<typeof createActiveStateModel>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useActiveState(
  states: NodeStatesValue,
  $answers: Store<Answers>,
  $localModel: Store<Record<string, PrimitiveValue | string[]>>,
  $subscriptionFacts: Store<Record<string, PrimitiveValue>>,
): string | null {
  const modelRef = useRef<ActiveStateModel>(
    createActiveStateModel(states, $answers, $localModel, $subscriptionFacts),
  ).current;

  return useUnit(modelRef.$activeState);
}
