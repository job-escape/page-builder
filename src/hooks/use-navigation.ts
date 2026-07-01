import { useUnit } from "effector-react";

import { Answers } from "../types";
import { buildConditionFacts } from "../utils/build-condition-facts";
import { runCondition } from "../utils/run-condition";

import { useBuilderModel } from "./use-builder-model";
import { usePage } from "./use-page";

export const useNavigation = () => {
  const page = usePage();
  const model = useBuilderModel();
  const { nextPage, prevPage, prevAnswers, finish, subscriptionFacts } =
    useUnit({
      nextPage: model.nextPageEvt,
      prevPage: model.prevPageEvt,
      prevAnswers: model.$answers,
      finish: model.finishEvt,
      subscriptionFacts: model.$subscriptionFacts,
    });

  const next = async (partialAnswers?: Answers) => {
    const answers = { ...prevAnswers, ...partialAnswers };

    if (page.condition) {
      try {
        const result = await runCondition(
          page.condition.condition,
          buildConditionFacts(answers, null, subscriptionFacts),
        );

        if (result?.nodeId) {
          return nextPage(result.nodeId);
        }
      } catch {
        // condition evaluation failed; fall through to default navigation
      }
    }

    if (page.next_node_id) {
      return nextPage(page.next_node_id);
    }

    return finish();
  };

  const prev = () => {
    prevPage();
  };

  return { next, prev };
};
