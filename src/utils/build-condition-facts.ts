import { Answers, PrimitiveValue } from "../types";

export const buildConditionFacts = (
  answers: Partial<Answers> | null | undefined,
  localStates: Record<string, PrimitiveValue | string[]> | null | undefined,
  subscriptionFacts?: Record<string, PrimitiveValue | string[]> | null,
): Answers => {
  const localFacts = Object.fromEntries(
    Object.entries(localStates ?? {}).map(([key, value]) => [`local-${key}`, value]),
  );

  // Subscription facts are resolved live from the host's currently selected
  // subscription (never persisted into answers) and keyed with the
  // `subscription_data-` prefix so the engine builds `${data_type}-${fact}` keys.
  const subscriptionFactEntries = Object.fromEntries(
    Object.entries(subscriptionFacts ?? {}).map(([key, value]) => [
      `subscription_data-${key}`,
      value,
    ]),
  );

  return {
    ...(answers ?? {}),
    ...localFacts,
    ...subscriptionFactEntries,
  } as Answers;
};
