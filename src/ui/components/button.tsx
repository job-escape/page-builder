"use client";

/** @jsxImportSource @emotion/react */
import { useUnit } from "effector-react";
import { DOMNode, domToReact } from "html-react-parser";

import { useMemo } from "react";

import { NodeStatesValue } from "../../types";
import { useActiveState } from "../../hooks/use-active-state";
import { useBuilderModel } from "../../hooks/use-builder-model";
import { useInteraction } from "../../hooks/use-interaction";
import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps, LogicValue } from "../../types";
import { tryParse } from "../../utils/try-parse";

import { useLocalModel } from "../../hooks/use-local-model";

export default function ButtonRegistry(props: ComponentRegistryProps) {
  const { domNode, config } = props;
  const attribs = domNode?.attribs ?? {};

  // Memoised by raw attribute (as `loader.tsx` does): this component re-renders
  // on every local-state change, and re-parsing produced a fresh array each time.
  const logic = useMemo(() => tryParse<LogicValue>(attribs.logic) || [], [attribs.logic]);
  const states = useMemo(() => tryParse<NodeStatesValue>(attribs.states) || [], [attribs.states]);

  const styledCss = useStyledNode(attribs);
  const { createInteraction } = useInteraction();

  const model = useBuilderModel();
  const localModel = useLocalModel();
  const activeState = useActiveState(states, model.$answers, localModel.$localStates, model.$subscriptionFacts);

  const isLoading = activeState === "loading";
  const isDisabled = activeState === "disabled";
  const isHidden = activeState === "hidden";
  const local = useUnit(localModel.$localStates);
  const buttonType =
    attribs["type"] === "submit" || attribs["type"] === "reset" ? attribs["type"] : "button";
  const handleClick = () => {
    if (isDisabled || isLoading) return;
    const { handleTrigger } = createInteraction();
    handleTrigger("click", logic);
  };

  if (isHidden) return null;
  return (
    <button
      type={buttonType}
      // eslint-disable-next-line react/no-unknown-property
      css={styledCss}
      disabled={isDisabled}
      onClick={handleClick}
      data-state={activeState ?? undefined}
      // Every call to action in a funnel is this one component — "Continue", "GET MY PLAN",
      // "Claim my discount" are all just different children. Until now the only way to click
      // one from an automated test was to match its visible text, so a copy change (or a
      // translation) broke every test that touched it. `data-button-type` names it, matching
      // the convention the option components already use, and `data-testid` lets a specific
      // CTA be labelled in the constructor when a funnel needs one pinned by name.
      data-button-type={attribs["button-type"] || "cta"}
      data-testid={attribs["data-testid"] || undefined}
    >
      {domNode.children?.length ? domToReact(domNode.children as DOMNode[], config) : "Continue"}
    </button>
  );
}
