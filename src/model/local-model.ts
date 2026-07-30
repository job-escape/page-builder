import { createEvent, createStore } from "effector";

import { PrimitiveValue } from "../types";

export const createLocalModel = () => {
  const setLocalStateEvt = createEvent<{ key: string; value: PrimitiveValue | string[] }>();
  // Created per model instance, so no stable sid is possible — declared
  // non-serializable rather than letting `serialize(scope)` warn about it on
  // every server render. Local states are authored per page and start empty on
  // the client regardless, so nothing is lost by not transferring them.
  const $localStates = createStore<Record<string, PrimitiveValue | string[]>>(
    {},
    { serialize: "ignore" },
  ).on(setLocalStateEvt, (state, { key, value }) => ({ ...state, [key]: value }));

  return {
    $localStates,
    setLocalStateEvt,
  };
};

export type LocalModel = ReturnType<typeof createLocalModel>;
