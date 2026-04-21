import { Answers, PrimitiveValue } from "../types";

export const buildConditionFacts = (
  answers: Partial<Answers> | null | undefined,
  localStates: Record<string, PrimitiveValue | string[]> | null | undefined,
): Answers => {
  const localFacts = Object.fromEntries(
    Object.entries(localStates ?? {}).map(([key, value]) => [`local-${key}`, value]),
  );

  return {
    ...(answers ?? {}),
    ...localFacts,
  } as Answers;
};
