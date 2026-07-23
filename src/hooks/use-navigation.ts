import { useUnit } from "effector-react";

import { Answers } from "../types";
import { buildConditionFacts } from "../utils/build-condition-facts";
import { navDiag } from "../utils/nav-diag";
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
    const pageId = page.id;
    const startedAt = performance.now();
    navDiag("next_start", {
      pageId,
      hasCondition: Boolean(page.condition),
      nextNodeId: page.next_node_id ?? null,
    });

    if (page.condition) {
      // If runCondition hangs (the suspected dead-click cause), this watchdog
      // keeps logging so the stall is visible even though `next_start` already
      // fired and nothing downstream ever will.
      const watchdog = setInterval(() => {
        navDiag("condition_pending", { pageId, ms: Math.round(performance.now() - startedAt) });
      }, 4000);
      try {
        const result = await runCondition(
          page.condition.condition,
          buildConditionFacts(answers, null, subscriptionFacts),
        );
        clearInterval(watchdog);
        navDiag("condition_done", {
          pageId,
          ms: Math.round(performance.now() - startedAt),
          nodeId: result?.nodeId ?? null,
        });

        if (result?.nodeId) {
          navDiag("next_page", { pageId, to: result.nodeId });
          return nextPage(result.nodeId);
        }
      } catch (error) {
        clearInterval(watchdog);
        navDiag("condition_error", {
          pageId,
          ms: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error),
        });
        // condition evaluation failed; fall through to default navigation
      }
    }

    if (page.next_node_id) {
      navDiag("next_node", { pageId, to: page.next_node_id });
      return nextPage(page.next_node_id);
    }

    navDiag("finish_noop", { pageId });
    return finish();
  };

  const prev = () => {
    prevPage();
  };

  return { next, prev };
};
