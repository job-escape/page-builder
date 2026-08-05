import {
  clearNode,
  createEffect,
  createEvent,
  createNode,
  createStore,
  sample,
  Store,
  StoreWritable,
  withRegion,
  type EventCallable,
} from "effector";
import { useUnit } from "effector-react";

import { useEffect, useRef } from "react";

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

// Every unit below is created inside a `region` node so the whole graph — the
// store, the effect, and the `sample` subscriptions to $answers/$localModel —
// can be torn down in one `clearNode` when the component unmounts. Without that
// teardown the subscriptions outlive the component and keep re-running
// `runCondition` on every answer/local-state change, forever.
function createActiveStateModel(
  states: NodeStatesValue,
  $answers: Store<Answers>,
  $localModel: Store<Record<string, PrimitiveValue | string[]>>,
  $subscriptionFacts: Store<Record<string, PrimitiveValue>>,
) {
  const region = createNode();
  let $activeState!: StoreWritable<string | null>;
  let init!: EventCallable<void>;

  withRegion(region, () => {
    // One per component instance, so it can carry no stable sid; it is derived
    // from answers on the client anyway. Declared non-serializable so Builder's
    // `serialize(scope)` stops warning about it on every server render.
    $activeState = createStore<string | null>(null, { serialize: "ignore" });

    // Fired from the hook through `useUnit`, so the first evaluation runs in
    // the AMBIENT SCOPE. It used to be a direct `evaluateFx($answers.getState())`
    // call here — which executes outside any scope, reads the store's default
    // (empty) state instead of the hydrated answers, and judges the wrong
    // visit: a returning visitor's gated Continue button computed "disabled"
    // from an answer set with nothing in it, and stayed dead until some later
    // store change happened to re-evaluate. Whether that change ever came
    // depended on the environment, which is why it walked like a flake.
    init = createEvent();

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
      clock: [init, $answers, $localModel, $subscriptionFacts],
      source: { answers: $answers, local: $localModel, subscription: $subscriptionFacts },
      target: evaluateFx,
    });
  });

  return { $activeState, init, destroy: () => clearNode(region, { deep: true }) };
}

type ActiveStateModel = ReturnType<typeof createActiveStateModel>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useActiveState(
  states: NodeStatesValue,
  $answers: Store<Answers>,
  $localModel: Store<Record<string, PrimitiveValue | string[]>>,
  $subscriptionFacts: Store<Record<string, PrimitiveValue>>,
): string | null {
  // `useRef(createActiveStateModel(...))` would evaluate the argument on EVERY
  // render and throw all but the first result away — each discarded model having
  // already subscribed to $answers/$localModel and fired an async rules-engine
  // run. Callers such as `button.tsx` re-render on every local-state change and
  // pass a freshly-parsed `states` array each time, so that leaked one model per
  // button per render: on a loader page (which writes local state every 30ms)
  // the orphans compound until the main thread is saturated. Build lazily
  // instead, keyed on the *content* of `states` rather than its identity.
  const statesKey = JSON.stringify(states);
  const ref = useRef<{ key: string; model: ActiveStateModel } | null>(null);

  if (ref.current === null || ref.current.key !== statesKey) {
    ref.current?.model.destroy();
    ref.current = {
      key: statesKey,
      model: createActiveStateModel(states, $answers, $localModel, $subscriptionFacts),
    };
  }

  const model = ref.current.model;

  useEffect(() => {
    return () => {
      ref.current?.model.destroy();
      ref.current = null;
    };
  }, []);

  // Bound through `useUnit` so it fires inside the scope the Builder's
  // provider supplies — the whole point of the event. A new model (fresh
  // `states` content) re-arms the effect and re-evaluates.
  const init = useUnit(model.init);
  useEffect(() => {
    init();
  }, [init]);

  return useUnit(model.$activeState);
}
