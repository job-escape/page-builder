import { Answers, BodyField, PrimitiveValue } from "../types";

import { resolveValuePicker } from "./resolve-value-picker";

export const resolveRequestBodyField = ({
  field,
  answers,
  localStates,
  triggerPayload,
}: {
  field: BodyField;
  answers: Partial<Answers>;
  localStates: Record<string, PrimitiveValue | string[]>;
  triggerPayload?: unknown;
}): string | number | boolean | string[] | undefined => {
  const value = field.value ?? field.factName;
  const dataType = field.valueDataType ?? (field.factName ? "funnel_data" : undefined);

  return resolveValuePicker({
    value,
    dataType,
    answers,
    localStates,
    triggerPayload,
  });
};
