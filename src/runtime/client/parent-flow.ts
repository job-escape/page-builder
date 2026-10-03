import { createContext } from "react";

/**
 * How the frame above this one lays its children out — `null` for a screen's
 * root, which has no frame above it at all.
 *
 * The web half of native's `FlowContext`, and it answers the same two questions
 * that one does:
 *
 * - **Am I the root?** `null`. A `fill` height means something different at the
 *   top of a screen than anywhere else: inside a frame it is a share of a parent
 *   that has a height, and at the top it is a claim on the viewport, which no
 *   ancestor here has a height for.
 * - **Does my parent place me?** Only a parent with no auto-layout does. Two
 *   points on a brick mean nothing inside a row or a column — see `placedCss`.
 */
export type ParentFlow = "none" | "row" | "column";
export const Parent = createContext<ParentFlow | null>(null);
