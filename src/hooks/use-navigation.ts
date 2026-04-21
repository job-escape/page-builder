import { useUnit } from "effector-react";

import { useLogger } from "next-axiom";

import { Answers } from "../types";
import { runCondition } from "../utils/run-condition";

import { useBuilderModel } from "./use-builder-model";
import { usePage } from "./use-page";

export const useNavigation = () => {
  const page = usePage();
  const model = useBuilderModel();
  const logger = useLogger().with({ page_id: page.id });
  const { nextPage, prevPage, prevAnswers, finish } = useUnit({
    nextPage: model.nextPageEvt,
    prevPage: model.prevPageEvt,
    prevAnswers: model.$answers,
    finish: model.finishEvt,
  });

  const next = async (partialAnswers?: Answers) => {
    const answers = { ...prevAnswers, ...partialAnswers };

    if (page.condition) {
      try {
        const result = await runCondition(page.condition.condition, answers);

        if (result?.nodeId) {
          return nextPage(result.nodeId);
        }
      } catch (error) {
        logger.error("next action condition evaluation failed", {
          answers,
          next_node_id: page.next_node_id ?? null,
          page_condition: page.condition.condition,
          error,
        });
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
