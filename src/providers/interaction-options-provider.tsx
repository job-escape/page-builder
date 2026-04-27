"use client";

import { ReactNode } from "react";

import { InteractionOptions } from "../hooks/use-interaction";

import { InteractionOptionsContext } from "./interaction-options-context";

type Props = {
  value: InteractionOptions | null;
  children: ReactNode;
};

export const InteractionOptionsProvider = ({ value, children }: Props) => {
  return (
    <InteractionOptionsContext.Provider value={value}>{children}</InteractionOptionsContext.Provider>
  );
};
