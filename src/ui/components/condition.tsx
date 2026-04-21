"use client";

import { useUnit } from "effector-react";
import { domToReact, Element } from "html-react-parser";

import { useLogger } from "next-axiom";

import { memo, useEffect, useMemo, useState } from "react";

import { Condition } from "../../types";

import { useBuilderModel } from "../../hooks/use-builder-model";
import { useLocalModel } from "../../hooks/use-local-model";
import { Answers, ComponentRegistryProps, PrimitiveValue } from "../../types";
import { buildConditionFacts } from "../../utils/build-condition-facts";
import { runCondition } from "../../utils/run-condition";
import { tryParse } from "../../utils/try-parse";

const collectRuleDependencies = (
  rules: Condition["condition"][number]["rules"] | undefined,
  dependencies: {
    answerKeys: Set<string>;
    localKeys: Set<string>;
  },
) => {
  if (!rules) {
    return;
  }

  const children = [...(rules.all ?? []), ...(rules.any ?? [])];

  children.forEach((child) => {
    if ("fact" in child) {
      if (!child.fact) {
        return;
      }

      if (child.data_type === "local") {
        dependencies.localKeys.add(child.fact);
        return;
      }

      dependencies.answerKeys.add(
        child.data_type ? `${child.data_type}-${child.fact}` : child.fact,
      );
      return;
    }

    collectRuleDependencies(child, dependencies);
  });
};

const getConditionDependencies = (branches: Condition["condition"]) => {
  const dependencies = {
    answerKeys: new Set<string>(),
    localKeys: new Set<string>(),
  };

  branches.forEach((branch) => {
    collectRuleDependencies(branch.rules, dependencies);
  });

  return dependencies;
};

const buildRelevantStateSignature = ({
  answers,
  localStates,
  answerKeys,
  localKeys,
}: {
  answers: Answers;
  localStates: Record<string, PrimitiveValue | string[]>;
  answerKeys: Set<string>;
  localKeys: Set<string>;
}) =>
  JSON.stringify({
    answers: Array.from(answerKeys)
      .sort()
      .map((key) => [key, answers[key as keyof Answers] ?? null]),
    localStates: Array.from(localKeys)
      .sort()
      .map((key) => [key, localStates[key] ?? null]),
  });

const ConditionBranchRenderer = memo(
  function ConditionBranchRenderer({
    targetChild,
    hiddenChildren,
    config,
  }: {
    targetChild: Element | null;
    hiddenChildren: Element[];
    config: ComponentRegistryProps["config"];
  }) {
    return (
      <>
        {targetChild && domToReact([targetChild], config)}
        {hiddenChildren.map((child) => (
          <div key={child.attribs["data-id"]} style={{ display: "none" }}>
            {domToReact([child], config)}
          </div>
        ))}
      </>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.targetChild !== nextProps.targetChild) return false;
    if (prevProps.config !== nextProps.config) return false;
    if (prevProps.hiddenChildren.length !== nextProps.hiddenChildren.length) return false;
    return prevProps.hiddenChildren.every((child, i) => child === nextProps.hiddenChildren[i]);
  },
);

export default function ConditionRegistry({ domNode, config }: ComponentRegistryProps) {
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const [answers, localStates] = useUnit([model.$answers, localModel.$localStates]);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const baseLogger = useLogger();
  const logger = useMemo(
    () =>
      baseLogger.with({
        component_type: "condition",
        component_id: domNode.attribs["data-id"] ?? null,
      }),
    [baseLogger, domNode.attribs],
  );
  const branches = useMemo(
    () => tryParse<Condition["condition"]>(domNode.attribs["branches"]) ?? [],
    [domNode.attribs],
  );
  const dependencies = useMemo(() => getConditionDependencies(branches), [branches]);
  const relevantSignature = useMemo(
    () =>
      buildRelevantStateSignature({
        answers,
        localStates,
        answerKeys: dependencies.answerKeys,
        localKeys: dependencies.localKeys,
      }),
    [answers, dependencies.answerKeys, dependencies.localKeys, localStates],
  );

  useEffect(() => {
    let isCancelled = false;

    const evaluateCondition = async () => {
      try {
        const result = await runCondition(branches, buildConditionFacts(answers, localStates));

        if (!isCancelled) {
          setTargetNodeId(result?.nodeId ? String(result.nodeId) : null);
        }
      } catch (error) {
        logger.error("page builder condition query failed", {
          error: error instanceof Error ? error.message : String(error),
          branches,
          answers,
          local_states: localStates,
        });

        if (!isCancelled) {
          setTargetNodeId(null);
        }
      }
    };

    void evaluateCondition();

    return () => {
      isCancelled = true;
    };
  }, [answers, branches, localStates, logger, relevantSignature]);

  const elementChildren = useMemo(
    () => domNode.children.filter((c): c is Element => c instanceof Element),
    [domNode.children],
  );

  const targetChild = useMemo(
    () =>
      targetNodeId
        ? (elementChildren.find((c) => c.attribs["data-id"] === targetNodeId) ?? null)
        : null,
    [elementChildren, targetNodeId],
  );

  const forceMount = domNode.attribs["data-force-mount"] === "true";

  const hiddenChildren = useMemo(
    () => (forceMount ? elementChildren.filter((c) => c !== targetChild) : []),
    [elementChildren, forceMount, targetChild],
  );

  return (
    <ConditionBranchRenderer
      config={config}
      targetChild={targetChild}
      hiddenChildren={hiddenChildren}
    />
  );
}
