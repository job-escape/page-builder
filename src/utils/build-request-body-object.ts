import { BodyField, PrimitiveValue } from "../types";

import { resolveRequestBodyField } from "./resolve-request-body-field";

const setNestedValue = (
  target: Record<string, unknown>,
  path: string,
  value: string | number | boolean | Array<string | number>,
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

/**
 * Entries that are entirely digits become numbers, so an id list reaches an
 * endpoint as `[2340, 2341]` rather than `["2340", "2341"]` — a DRF
 * `IntegerField` rejects the strings. Anything else is left as text, so a list
 * of slugs or emails still arrives intact.
 */
const toRequestBodyArrayEntry = (entry: string): string | number =>
  /^-?\d+$/.test(entry) ? Number(entry) : entry;

/**
 * Multi-select answers arrive here already joined into `"a,b,c"` — the shape
 * most endpoints expect. A field marked `asArray` wants the list back, so the
 * string is split on commas; an empty selection becomes `[]` rather than `[""]`.
 */
const toRequestBodyArray = (
  value: string | number | boolean | string[],
): Array<string | number> => {
  if (Array.isArray(value)) {
    return value.map(entry => toRequestBodyArrayEntry(String(entry)));
  }

  if (value === "" || value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(toRequestBodyArrayEntry);
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
      const existing = body[field.key];
      body[field.key] =
        existing !== null && typeof existing === "object" && !Array.isArray(existing)
          ? { ...(existing as Record<string, unknown>), ...spreadObj }
          : spreadObj;
      return body;
    }

    const value =
      resolveRequestBodyField({
        field,
        answers,
        localStates,
        triggerPayload,
      }) ?? "";

    if (field.asArray) {
      return setNestedValue(body, field.key, toRequestBodyArray(value));
    }

    return setNestedValue(body, field.key, normalizeRequestBodyValue(field, value));
  }, {});
