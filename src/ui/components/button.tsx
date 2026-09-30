"use client";

/** @jsxImportSource @emotion/react */
import { css, keyframes } from "@emotion/react";
import { useUnit } from "effector-react";
import { DOMNode, domToReact } from "html-react-parser";

import { useMemo } from "react";

import { NodeStatesValue } from "../../types";
import { useActiveState } from "../../hooks/use-active-state";
import { useBuilderModel } from "../../hooks/use-builder-model";
import { useInFlight } from "../../hooks/use-in-flight";
import { useInteraction } from "../../hooks/use-interaction";
import { useStyledNode } from "../../hooks/use-styled-node";
import { ComponentRegistryProps, LogicValue } from "../../types";
import { tryParse } from "../../utils/try-parse";

import { useLocalModel } from "../../hooks/use-local-model";

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

// Inline and sized to the text, in the text's colour: the button's own styles
// come from the content, so the spinner must fit whatever they are.
const spinnerCss = css`
  display: inline-block;
  flex-shrink: 0;
  width: 1em;
  height: 1em;
  margin-inline-end: 0.5em;
  vertical-align: -0.125em;
  animation: ${spin} 0.8s linear infinite;
`;

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
  // While a click's actions are still running, further clicks are ignored —
  // see `useInFlight` for the double purchase this closes.
  const { run, busy } = useInFlight();
  const handleClick = () => {
    if (isDisabled || isLoading) return;
    run(() => createInteraction().handleTrigger("click", logic));
  };
  // A state the content defines wins; the built-in spinner is only for a
  // button that has none of its own.
  const showSpinner = busy && !activeState;

  if (isHidden) return null;
  return (
    <button
      type={buttonType}
      // eslint-disable-next-line react/no-unknown-property
      css={styledCss}
      disabled={isDisabled}
      onClick={handleClick}
      data-state={activeState ?? (busy ? "loading" : undefined)}
      aria-busy={busy || undefined}
      // Every call to action in a funnel is this one component — "Continue", "GET MY PLAN",
      // "Claim my discount" are all just different children. Until now the only way to click
      // one from an automated test was to match its visible text, so a copy change (or a
      // translation) broke every test that touched it. `data-button-type` names it, matching
      // the convention the option components already use, and `data-testid` lets a specific
      // CTA be labelled in the constructor when a funnel needs one pinned by name.
      data-button-type={attribs["button-type"] || "cta"}
      data-testid={attribs["data-testid"] || undefined}
    >
      {showSpinner && (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          // eslint-disable-next-line react/no-unknown-property
          css={spinnerCss}
          data-button-spinner=""
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      )}
      {domNode.children?.length ? domToReact(domNode.children as DOMNode[], config) : "Continue"}
    </button>
  );
}
