"use client";

import { useUnit } from "effector-react";
import { domToReact, Element } from "html-react-parser";

import { memo, useEffect, useMemo, useRef, useState } from "react";

import { Condition } from "../../types";

import { useBuilderModel } from "../../hooks/use-builder-model";
import { useLocalModel } from "../../hooks/use-local-model";
import { Answers, ComponentRegistryProps, PrimitiveValue } from "../../types";
import { buildConditionFacts } from "../../utils/build-condition-facts";
import { runCondition } from "../../utils/run-condition";
import { tryParse } from "../../utils/try-parse";

type ConditionDependencies = {
  answerKeys: Set<string>;
  localKeys: Set<string>;
  subscriptionFields: Set<string>;
};

const collectRuleDependencies = (
  rules: Condition["condition"][number]["rules"] | undefined,
  dependencies: ConditionDependencies,
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

      if (child.data_type === "subscription_data") {
        dependencies.subscriptionFields.add(child.fact);
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
  const dependencies: ConditionDependencies = {
    answerKeys: new Set<string>(),
    localKeys: new Set<string>(),
    subscriptionFields: new Set<string>(),
  };

  branches.forEach((branch) => {
    collectRuleDependencies(branch.rules, dependencies);
  });

  return dependencies;
};

const buildRelevantStateSignature = ({
  answers,
  localStates,
  subscriptionFacts,
  answerKeys,
  localKeys,
  subscriptionFields,
}: {
  answers: Answers;
  localStates: Record<string, PrimitiveValue | string[]>;
  subscriptionFacts: Record<string, PrimitiveValue>;
  answerKeys: Set<string>;
  localKeys: Set<string>;
  subscriptionFields: Set<string>;
}) =>
  JSON.stringify({
    answers: Array.from(answerKeys)
      .sort()
      .map((key) => [key, answers[key as keyof Answers] ?? null]),
    localStates: Array.from(localKeys)
      .sort()
      .map((key) => [key, localStates[key] ?? null]),
    subscription: Array.from(subscriptionFields)
      .sort()
      .map((field) => [field, subscriptionFacts[field] ?? null]),
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
    if (prevProps.hiddenChildren.length !== nextProps.hiddenChildren.length)
      return false;
    return prevProps.hiddenChildren.every(
      (child, i) => child === nextProps.hiddenChildren[i],
    );
  },
);

export default function ConditionRegistry({
  domNode,
  config,
}: ComponentRegistryProps) {
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const [answers, localStates, subscriptionFacts] = useUnit([
    model.$answers,
    localModel.$localStates,
    model.$subscriptionFacts,
  ]);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  const branches = useMemo(
    () => tryParse<Condition["condition"]>(domNode.attribs["branches"]) ?? [],
    [domNode.attribs],
  );
  const dependencies = useMemo(
    () => getConditionDependencies(branches),
    [branches],
  );
  const relevantSignature = useMemo(
    () =>
      buildRelevantStateSignature({
        answers,
        localStates,
        subscriptionFacts,
        answerKeys: dependencies.answerKeys,
        localKeys: dependencies.localKeys,
        subscriptionFields: dependencies.subscriptionFields,
      }),
    [
      answers,
      dependencies.answerKeys,
      dependencies.localKeys,
      dependencies.subscriptionFields,
      localStates,
      subscriptionFacts,
    ],
  );

  // Read the live fact objects through refs so the effect below can depend ONLY
  // on `relevantSignature` (which changes exactly when a fact this condition
  // references changes) and not on the raw `answers`/`localStates`/
  // `subscriptionFacts` identities. Those objects get a new reference on every
  // unrelated state write — e.g. a loader ticking `loader_value` every 30ms — and
  // including them here made every condition component re-run `runCondition` (and
  // rebuild a json-rules-engine) on each tick, saturating the main thread on
  // pages with many condition components.
  const factsRef = useRef({ answers, localStates, subscriptionFacts });
  factsRef.current = { answers, localStates, subscriptionFacts };

  useEffect(() => {
    let isCancelled = false;

    const evaluateCondition = async () => {
      const { answers: a, localStates: l, subscriptionFacts: s } = factsRef.current;
      try {
        const result = await runCondition(branches, buildConditionFacts(a, l, s));

        if (!isCancelled) {
          setTargetNodeId(result?.nodeId ? String(result.nodeId) : null);
        }
      } catch {
        // Engine failed to load/evaluate — show the default branch instead of
        // nothing, matching what runCondition returns when no rule matches.
        if (!isCancelled) {
          const defaultBranch = branches.find((branch) => branch.isDefault);
          setTargetNodeId(
            defaultBranch?.nodeId ? String(defaultBranch.nodeId) : null,
          );
        }
      }
    };

    void evaluateCondition();

    return () => {
      isCancelled = true;
    };
  }, [branches, relevantSignature]);

  const elementChildren = useMemo(
    () => domNode.children.filter((c): c is Element => c instanceof Element),
    [domNode.children],
  );

  const targetChild = useMemo(
    () =>
      targetNodeId
        ? (elementChildren.find((c) => c.attribs["data-id"] === targetNodeId) ??
          null)
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
