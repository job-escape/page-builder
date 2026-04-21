import { Answers, PrimitiveValue } from "../types";

const isDateNowDataType = (dataType?: string): boolean =>
  dataType === "date_now" || dataType === "date.now()";

const normalizeAnswerValue = (value: Answers[keyof Answers] | undefined): PrimitiveValue | undefined => {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  return value;
};

const getNestedValue = (obj: unknown, path: string): unknown => {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }

    return undefined;
  }, obj);
};

export const resolveValuePicker = ({
  value,
  dataType,
  answers,
  localStates,
  triggerPayload,
}: {
  value?: string;
  dataType?: string;
  answers: Partial<Answers>;
  localStates: Record<string, PrimitiveValue | string[]>;
  triggerPayload?: unknown;
}): PrimitiveValue | string[] | undefined => {
  if (isDateNowDataType(dataType)) {
    return Date.now();
  }

  if (value === undefined || value === null) return undefined;

  if (!dataType) {
    return value;
  }

  if (dataType === "local") {
    return localStates[value];
  }

  if (dataType === "trigger") {
    const nestedValue =
      getNestedValue(triggerPayload, value) ??
      getNestedValue(
        triggerPayload && typeof triggerPayload === "object"
          ? (triggerPayload as Record<string, unknown>).payload
          : undefined,
        value,
      );
    if (typeof nestedValue === "string") {
      return nestedValue;
    }

    if (typeof nestedValue === "number" || typeof nestedValue === "boolean") {
      return nestedValue;
    }

    if (Array.isArray(nestedValue) && nestedValue.every((item) => typeof item === "string")) {
      return nestedValue as string[];
    }

    return undefined;
  }

  return normalizeAnswerValue(answers[`${dataType}-${value}` as keyof Answers]);
};
