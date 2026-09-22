/**
 * Which edge of the viewport the overlay being drawn is docked to.
 *
 * A drawer's frame is the whole sheet, and a sheet meets the bottom edge of the
 * phone square: its top corners are rounded and its bottom ones are not, or the
 * backdrop would show through two notches at the foot of the screen. The canvas
 * draws one radius for all four corners (it has no per-corner radius), so the
 * frame carries one number, and the renderer squares the corners that sit on
 * the docked edge — for the drawer's root frame only, via this context.
 */
import { createContext } from "react";

export type DockedEdgeValue = "bottom" | null;

export const DockedEdge = createContext<DockedEdgeValue>(null);

/** A root frame's radius once it is docked — the docked edge's corners squared. */
export function dockedRadius(
  radius: unknown,
  edge: DockedEdgeValue,
): number | [number, number, number, number] | undefined {
  if (typeof radius !== "number") return radius as undefined;
  return edge === "bottom" ? [radius, radius, 0, 0] : radius;
}
