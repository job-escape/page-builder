import { createEvent, createStore } from "effector";

import { PrimitiveValue } from "../types";

export const createLocalModel = () => {
  const setLocalStateEvt = createEvent<{ key: string; value: PrimitiveValue | string[] }>();
  const $localStates = createStore<Record<string, PrimitiveValue | string[]>>({}).on(
    setLocalStateEvt,
    (state, { key, value }) => ({ ...state, [key]: value }),
  );

  return {
    $localStates,
    setLocalStateEvt,
  };
};

export type LocalModel = ReturnType<typeof createLocalModel>;
