/**
 * React's `<Activity>`, where the installed React has one (19.2 and later).
 *
 * Read off the namespace rather than imported by name, because the package
 * still accepts React 18, where the name does not exist and a named import
 * would fail to link. Without it, `prerender` does nothing and the funnel draws
 * exactly what it drew before.
 */
import * as React from "react";
import type { ComponentType, ReactNode } from "react";

export const Activity = (React as unknown as Record<string, unknown>)["Activity"] as
  | ComponentType<{ mode: "visible" | "hidden"; children?: ReactNode }>
  | undefined;
