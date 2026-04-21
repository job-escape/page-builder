"use client";

/** @jsxImportSource @emotion/react */
import { useUnit } from "effector-react";
import { DOMNode, domToReact } from "html-react-parser";

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

  const logic = tryParse<LogicValue>(attribs.logic) || [];
  const states = tryParse<NodeStatesValue>(attribs.states) || [];

  const styledCss = useStyledNode(attribs);
  const { createInteraction } = useInteraction();

  const model = useBuilderModel();
  const localModel = useLocalModel();
  const activeState = useActiveState(states, model.$answers, localModel.$localStates);

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
    >
      {domNode.children?.length ? domToReact(domNode.children as DOMNode[], config) : "Continue"}
    </button>
  );
}
