import { createContext } from "react";

import type { Flow } from "../style/emit-native";

/**
 * Which way the frame a brick sits in lays its children out.
 *
 * What a `fill` is measured along — see `nativeSize`. Every `Frame` provides
 * its own for its children; a brick with no frame above it (a screen's root)
 * reads undefined and keeps the old answer.
 */
export const FlowContext = createContext<Flow | undefined>(undefined);

/**
 * Whether the height this brick is measured against is a definite one.
 *
 * A frame states a definite height by being given a number, or by filling a
 * parent that has one. A frame that hugs its content does not, and neither
 * does a scrolling screen, whose height is whatever its content comes to.
 *
 * It travels as context because CSS resolves the same question by walking up
 * the tree, and this is that walk: `nativeSize` needs the answer for `fill`,
 * and the answer belongs to the parent rather than to the brick asking.
 *
 * `true` by default, for the screen that does not scroll: there the surface is
 * the viewport and a height measured against it is as definite as a number.
 */
export const HeightContext = createContext<boolean>(true);
