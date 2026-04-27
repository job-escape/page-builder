"use client";

import { createContext, useContext } from "react";

import { InteractionOptions } from "../hooks/use-interaction";

export const InteractionOptionsContext = createContext<InteractionOptions | null>(null);

export const useInteractionOptions = (): InteractionOptions | null => {
  return useContext(InteractionOptionsContext);
};
