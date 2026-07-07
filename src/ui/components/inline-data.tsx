"use client";

import { ClassNames } from "@emotion/react";
import { useUnit } from "effector-react";

import { useBuilderModel } from "../../hooks/use-builder-model";
import { useLocalModel } from "../../hooks/use-local-model";
import { useStyledNode } from "../../hooks/use-styled-node";
import { Answers, ComponentRegistryProps, PrimitiveValue } from "../../types";
import { applyValueTransforms } from "../../utils/apply-value-transforms";

const FACT_ATTR = "inline-data-fact";
const DATA_FACT_ATTR = "data-lexical-inline-data-fact";
const TRANSFORM_ATTR = "inline-data-transform";
const DATA_TRANSFORM_ATTR = "data-lexical-inline-data-transform";

const getFact = (attribs: Record<string, string>) => {
  return attribs[FACT_ATTR] ?? attribs[DATA_FACT_ATTR] ?? attribs.fact ?? "";
};

const getTransforms = (attribs: Record<string, string>): string[] | undefined => {
  const raw = attribs[TRANSFORM_ATTR] ?? attribs[DATA_TRANSFORM_ATTR];
  if (!raw) return undefined;
  return raw
    .split("|")
    .map((transform) => transform.trim())
    .filter(Boolean);
};

const getInlineValue = (
  answers: Answers,
  localStates: Record<string, PrimitiveValue | string[]>,
  fact: string,
) => {
  if (!fact) return undefined;

  if (fact in answers) {
    return answers[fact as keyof Answers];
  }

  if (fact in localStates) {
    return localStates[fact];
  }

  const funnelDataKey = `funnel_data-${fact}` as keyof Answers;
  if (funnelDataKey in answers) {
    return answers[funnelDataKey];
  }

  const localStateKey = fact.startsWith("local-") ? fact.slice("local-".length) : fact;
  if (localStateKey in localStates) {
    return localStates[localStateKey];
  }

  const matchingKeys = Object.keys(answers).filter((key) => key.endsWith(`-${fact}`));
  if (matchingKeys.length === 1) {
    return answers[matchingKeys[0] as keyof Answers];
  }

  return undefined;
};

const normalizeValue = (value: Answers[keyof Answers] | undefined) => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value ?? "";
};

export default function InlineDataRegistry({ domNode }: ComponentRegistryProps) {
  const attribs = domNode?.attribs ?? {};
  const styledCss = useStyledNode(attribs);
  const model = useBuilderModel();
  const localModel = useLocalModel();
  const answers = useUnit(model.$answers);
  const localStates = useUnit(localModel.$localStates);
  const rawValue = normalizeValue(getInlineValue(answers, localStates, getFact(attribs)));
  const value = applyValueTransforms(rawValue, getTransforms(attribs));

  return <ClassNames>{({ css }) => <span className={css(styledCss)}>{value}</span>}</ClassNames>;
}
