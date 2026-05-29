import { BodyField, PrimitiveValue } from "../types";

import { resolveRequestBodyField } from "./resolve-request-body-field";

const setNestedValue = (
  target: Record<string, unknown>,
  path: string,
  value: string | number | boolean | string[],
): Record<string, unknown> => {
  const keys = path.split(".").filter(Boolean);

  if (keys.length === 0) {
    return target;
  }

  let current: Record<string, unknown> = target;

  keys.forEach((key, index) => {
    const isLastKey = index === keys.length - 1;

    if (isLastKey) {
      current[key] = value;
      return;
    }

    const nextValue = current[key];

    if (!nextValue || typeof nextValue !== "object" || Array.isArray(nextValue)) {
      current[key] = {};
    }

    current = current[key] as Record<string, unknown>;
  });

  return target;
};

const isTimestampField = (field: BodyField): boolean => {
  const normalizedKey = field.key.toLowerCase();
  const normalizedValue = field.value?.toLowerCase() ?? "";

  return normalizedKey.includes("timestamp") || normalizedValue.includes("timestamp");
};

const normalizeRequestBodyValue = (
  field: BodyField,
  value: string | number | boolean | string[],
): string | number | boolean | string[] => {
  if (typeof value !== "string") {
    return value;
  }

  if (
    (field.valueDataType === "date_now" || field.valueDataType === "date.now()") &&
    /^\d+$/.test(value)
  ) {
    return Number(value);
  }

  if (field.valueDataType === "local" && isTimestampField(field) && /^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
};

export const buildRequestBodyObject = ({
  fields,
  answers,
  localStates,
  triggerPayload,
}: {
  fields: BodyField[];
  answers: Record<string, PrimitiveValue | string[]>;
  localStates: Record<string, PrimitiveValue | string[]>;
  triggerPayload?: unknown;
}): Record<string, unknown> =>
  fields.reduce<Record<string, unknown>>((body, field) => {
    if (!field.key) {
      return body;
    }

    if (field.spreadAnswers && field.valueDataType) {
      const prefix = `${field.valueDataType}-`;
      const spreadObj: Record<string, PrimitiveValue | string[]> = {};
      for (const [answerKey, answerValue] of Object.entries(answers)) {
        if (answerKey.startsWith(prefix) && answerValue != null) {
          spreadObj[answerKey.slice(prefix.length)] = answerValue;
        }
      }
      body[field.key] = spreadObj;
      return body;
    }

    const value =
      resolveRequestBodyField({
        field,
        answers,
        localStates,
        triggerPayload,
      }) ?? "";

    return setNestedValue(body, field.key, normalizeRequestBodyValue(field, value));
  }, {});
